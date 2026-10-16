"""เรนเดอร์คลิปด้วย HyperFrames — ใช้เสียง/เวลา/ซับจากโรงงานเดิม แต่ให้ HyperFrames วาดภาพเคลื่อนไหว

ทำไมมีไฟล์นี้ (16 ต.ค. 2026):
    เจ้าของดูคลิปจากโรงงานเดิมและ Hero AI แล้วบอกว่า "เหมือนสไลด์ภาพนิ่งธรรมดามาก ๆ"
    ต้นเหตุคือฉากของเราเป็นรูปนิ่ง + ซูมช้า (ffmpeg zoompan) ไม่มีอะไรเกิดขึ้นในฉาก
    HyperFrames (heygen-com/hyperframes · Apache 2.0) เขียนฉากเป็น HTML + GSAP แล้วเรนเดอร์ทีละเฟรมด้วย Chrome
    ทำของที่ ffmpeg ทำไม่ได้: ซองพุ่งชน · ประกายไฟ · คำกระแทกตรงจังหวะเสียง · ขั้นตอนโผล่ตามคำพูด · สายฟ้าตรงรอยต่อ

แบ่งงาน:
    โรงงานเดิม (ไม่เปลี่ยน)   segments → voice (Gemini TTS) → align (whisper) → subtitle_chunks
    ไฟล์นี้                    เลือกฉาก · หาเวลาคำเด็ด · เตรียมรูป · เขียน index.html · สั่ง render
    HyperFrames               ภาพเคลื่อนไหวทั้งหมด + ซับไทย (Chrome วาด — สระ/วรรณยุกต์ถูกเสมอ) + มิกซ์เสียง

เทมเพลตอยู่ที่ <repo>/hyperframes/templates/dvx-promo/ (นอก deploy/ ตั้งใจ — ไม่ให้ขึ้น Vercel)
    compositions/scene-*.html  ฉากที่ใช้ซ้ำได้ รับค่าผ่าน data-variable-values
    host.template.html         โครงหลัก มีตัวยึด {{...}} ที่ไฟล์นี้เติม
    index.html                 ตัวอย่างที่สร้างจากแผนเดโม เปิดดูใน Studio ได้ (npx hyperframes preview)

แผน (เหมือน make_video.py + 2 คีย์):
    "engine": "hyperframes"         → make_video.build_video ส่งต่อมาที่นี่
    "scenes": [ {type, ...}, ... ]  ยาวเท่าจำนวนบรรทัดสคริปต์ (1 บรรทัด = 1 ฉาก เหมือนเดิม)
        hook     {sku | img, title, kicker}
        pack     {sku | img, words:[w1, w2], tag}     คำเด็ดกระแทกตรงเวลาที่เสียงพูดคำนั้น
        machine  {photo | img, steps:[s1, s2, s3]}    ชิปขั้นตอนโผล่ตรงเวลาที่พูดแต่ละขั้น
        cta      {photo | img, title, tag}
    ไม่ใส่ scenes → เดาให้: บรรทัดแรก hook · สุดท้าย cta · ระหว่างกลางสลับ pack/machine

รัน:
    cd deploy && ../.venv-image/Scripts/python.exe -m agents.video.hf_render --plan แผน.json
    เพิ่ม --demo เพื่อเขียน index.html ตัวอย่างลงในโฟลเดอร์เทมเพลต (ไม่เรนเดอร์)
"""
import argparse
import html
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from . import align, config, segments

TEMPLATE = config.REPO / "hyperframes" / "templates" / "dvx-promo"
TAIL = 0.9                    # ค้างฉากปิดหลังเสียงจบ (วินาที) ให้คนอ่านแท็ก/โลโก้ทัน
SCENE_FILES = {"hook": "scene-hook", "pack": "scene-pack", "machine": "scene-machine", "cta": "scene-cta"}
# prefix ของ id ภายในแต่ละฉาก — ใช้เปลี่ยนชื่อตอนฉากชนิดเดียวกันโผล่ซ้ำในคลิปเดียว (id ห้ามซ้ำทั้งหน้า)
ID_PREFIX = {"hook": "hook-", "pack": "pack-", "machine": "mach-", "cta": "cta-"}
MACHINE_PHOTOS = {"machine:hero": "machine-hero.jpg", "machine:scene": "machine-scene.jpg"}


def _log(step, msg):
    print(f"[hf {step}] {msg}", flush=True)


def _cli_version():
    """เวอร์ชัน hyperframes ที่เทมเพลตปักไว้ (package.json) — เรนเดอร์ซ้ำได้ผลเหมือนเดิม"""
    try:
        pkg = json.loads((TEMPLATE / "package.json").read_text(encoding="utf-8"))
        m = re.search(r"hyperframes@([\d.]+)", pkg["scripts"]["render"])
        if m:
            return m.group(1)
    except Exception:
        pass
    return "latest"


# ── 1. เสียง + เวลา (ของโรงงานเดิมทั้งหมด) ──────────────────────────────────────

def prepare(plan, work):
    """segments → เสียง → เวลารายคำ → เวลาแต่ละบรรทัด → ท่อนซับ · มีแคชแบบเดียวกับ make_video"""
    from . import voice as voice_mod

    segs = segments.split_script(plan["script"])
    if not segs:
        raise ValueError("สคริปต์ว่าง — ต้องมีอย่างน้อยหนึ่งบรรทัด")
    wav = work / "voice.wav"
    t0 = time.time()
    voice_mod.synth(segments.speech_text(segs), wav, voice=plan.get("voice"),
                    model=plan.get("tts_model"), style=plan.get("voice_style"))
    total = voice_mod.duration(wav)
    _log("1/4", f"{len(segs)} ฉาก · เสียง {total:.1f} วิ ({time.time() - t0:.0f} วิ)")

    stamp_f = wav.with_suffix(".stamp.json")
    stamp = stamp_f.read_text(encoding="utf-8") if stamp_f.exists() else ""
    words_f = work / "words.json"
    words = None
    try:
        d = json.loads(words_f.read_text(encoding="utf-8"))
        if d.get("stamp") == stamp:
            words = [(w, float(s), float(e)) for w, s, e in d["words"]]
    except Exception:
        pass
    t0 = time.time()
    if words is None:
        try:
            words = align.word_times(wav, model_size=plan.get("whisper", "large-v3-turbo"))
            words_f.write_text(json.dumps({"stamp": stamp, "words": [[w, s, e] for w, s, e in words]},
                                          ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            _log("1/4", f"⚠️ whisper ไม่สำเร็จ ({str(e)[:80]}) — แบ่งเวลาตามตัวอักษรแทน")
            words = []
    timing = align.map_segments(segs, words, total) if words else align._even(segs, total)
    chunks = align.subtitle_chunks(segs, timing, max_chars=int(plan.get("sub_chars", 20)))
    _log("2/4", f"เวลา {len(words)} คำ · ซับ {len(chunks)} ท่อน ({time.time() - t0:.0f} วิ)")
    return segs, wav, total, timing, words, chunks


# ── 2. หาเวลาคำเด็ด ──────────────────────────────────────────────────────────────

def _norm(s):
    return re.sub(r"\s+", "", s or "").lower()


def phrase_time(phrase, chunks, words, lo, hi):
    """วินาที (เวลาจริงในคลิป) ที่เสียงเริ่มพูด phrase ภายในช่วง [lo, hi] — ไม่เจอคืน None

    ใช้ "ข้อความของเรา" ในท่อนซับเป็นหลัก (ท่อนมีเวลาจาก whisper แล้ว) แล้วเลื่อนตามสัดส่วนตัวอักษรในท่อน
    เพราะ whisper ถอดคำอังกฤษในประโยคไทยเป็นคำอ่านไทย ("Leader" → "ลีดเดอร์") จับจากข้อความถอดตรง ๆ ไม่เจอ
    ถ้าคำนั้นอยู่ในข้อความที่ whisper ถอดด้วย (ตรงตัว) จะใช้เวลาของคำนั้นแทน ซึ่งแม่นกว่า
    """
    target = _norm(phrase)
    if not target:
        return None
    guess = None
    for c in chunks:
        if c["end"] < lo - 0.05 or c["start"] > hi + 0.05:
            continue
        text = _norm(c["text"])
        i = text.find(target)
        if i >= 0:
            guess = c["start"] + (c["end"] - c["start"]) * (i / max(1, len(text)))
            break
    joined, starts = "", []
    for w, s, _e in words or []:
        if lo - 0.3 <= s <= hi + 0.3:
            nw = _norm(w)
            joined += nw
            starts += [s] * len(nw)
    j = joined.find(target)
    if j >= 0 and (guess is None or abs(starts[j] - guess) < 0.8):
        return starts[j]
    return guess


# ── 3. รูป ──────────────────────────────────────────────────────────────────────

def _sku_image_url(sku_id):
    url = config.env("NEXT_PUBLIC_SUPABASE_URL")
    key = config.env("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise RuntimeError("ไม่มีคีย์ Supabase ใน deploy/.env.local")
    req = urllib.request.Request(
        f"{url}/rest/v1/skus?sku_id=eq.{urllib.parse.quote(sku_id)}&select=image_url,image_url_box",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))
    if not rows or not (rows[0].get("image_url") or rows[0].get("image_url_box")):
        raise ValueError(f"SKU {sku_id} ไม่มีรูปซอง/กล่อง")
    return rows[0].get("image_url") or rows[0].get("image_url_box")


def resolve_image(spec, proj, name):
    """spec → path ภายในโปรเจกต์ (assets/...) · เก็บนามสกุลจริงไว้ (รูปซองเป็น WebP โปร่ง)"""
    if not spec:
        return None
    if spec.startswith("assets/") and (proj / spec).exists():
        return spec                                            # ของในเทมเพลตอยู่แล้ว
    if spec in MACHINE_PHOTOS:
        src = config.MACHINE_DIR / MACHINE_PHOTOS[spec]
        dst = proj / "assets" / f"{name}{src.suffix}"
        shutil.copyfile(src, dst)
        return f"assets/{dst.name}"
    if spec.startswith("sku:"):
        img = _sku_image_url(spec[4:].strip())
        ext = pathlib.Path(urllib.parse.urlparse(img).path).suffix or ".png"
        dst = proj / "assets" / f"{name}{ext}"
        with urllib.request.urlopen(img, timeout=60) as r:
            dst.write_bytes(r.read())
        return f"assets/{dst.name}"
    if spec.startswith("file:"):
        src = pathlib.Path(spec[5:])
        dst = proj / "assets" / f"{name}{src.suffix}"
        shutil.copyfile(src, dst)
        return f"assets/{dst.name}"
    raise ValueError(f"ไม่รู้จักแหล่งรูป '{spec}' (ใช้ได้: sku:… · machine:hero|scene · file:… · assets/…)")


# ── 4. ประกอบ index.html ────────────────────────────────────────────────────────

def gloss_box(img_path, inset=2.0):
    """กรอบของ "ตัวซองจริง" ในรูปพื้นโปร่ง (เป็น % ของกล่อง object-fit: contain แบบจัตุรัส)

    แสงวาบต้องวิ่งเฉพาะบนซอง ไม่เลยออกไปบนพื้นกรมท่า — รูปซองแต่ละ SKU มีขอบโปร่งไม่เท่ากัน
    (OP-17 ตัวซองกว้างแค่ 45% ของรูป · รูปกล่องกว้างกว่ามาก) จึงวัดจาก alpha จริงทุกครั้ง
    """
    try:
        from PIL import Image
        im = Image.open(img_path)
        w, h = im.size
        bb = (im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
              if im.mode in ("RGBA", "LA") else None) or (0, 0, w, h)
    except Exception:
        return {}
    side = max(w, h)
    ox, oy = (side - w) / 2, (side - h) / 2
    x0, y0, x1, y1 = bb

    def pct(v):
        return round(100.0 * v / side, 2)

    return {"gl": round(pct(ox + x0) + inset, 2), "gt": round(pct(oy + y0) + inset, 2),
            "gw": round(max(1.0, pct(x1 - x0) - 2 * inset), 2),
            "gh": round(max(1.0, pct(y1 - y0) - 2 * inset), 2)}


_LATIN = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*")


def _pretty_sku(sku):
    """'OP 17' → 'OP-17' · 'PRB 02' → 'PRB-02' (รหัสบนซองจริงใช้ขีด)"""
    return re.sub(r"\s+", "-", (sku or "").strip())


def scenes_from_plan(plan, segs):
    """แผนที่ไม่มี scenes (เช่นส่งมาจากหน้า /video) → เลือกชนิดฉากจากรูปที่เลือกไว้ต่อบรรทัด

    กติกาสำคัญ: **ห้ามแต่งข้อความที่สคริปต์ไม่ได้พูด** (กฎ overclaim ของแบรนด์)
      - ป้ายใต้ซองฉากเปิด = headline ของแผนเท่านั้น ไม่มีก็ไม่แสดง (ไม่เดา "มาถึงตู้แล้ว" ให้)
      - คำเด็ดฉากซอง = คำภาษาอังกฤษที่อยู่ในบรรทัดนั้นจริง (เช่น SEC · Leader · ex) ไม่มีก็ไม่แสดง
      - ชื่อชุด/ป้ายมุม = รหัส SKU ที่เลือก (ข้อมูลจริงจากฐานข้อมูล)
      - ขั้นตอนฉากตู้ = วิธีซื้อจริงของตู้เรา (เลือกช่อง → กดซื้อ → เปิดดวง) · ข้อความชวนฉากปิด = "เช็กหน้าตู้ก่อนไป"
    """
    n = len(segs)
    specs = list(plan.get("visuals") or [])
    fallback = specs or ["sku:OP 17", "machine:hero", "machine:scene"]
    while len(specs) < n:
        specs.append(fallback[len(specs) % len(fallback)])
    scenes = []
    for i, (seg, spec) in enumerate(zip(segs, specs[:n])):
        line = seg.get("text", "") if isinstance(seg, dict) else str(seg)   # split_script คืน {index, text}
        is_pack = spec.startswith("sku:")
        sku = spec[4:].strip() if is_pack else ""
        if n > 1 and i == n - 1:
            photo = spec if not is_pack else "machine:scene"
            scenes.append({"type": "cta", "img": photo})
        elif i == 0 and is_pack:
            scenes.append({"type": "hook", "img": spec, "title": _pretty_sku(sku),
                           "kicker": (plan.get("headline") or "").strip()})
        elif is_pack:
            words = [w for w in _LATIN.findall(line) if len(w) >= 2 and w.upper() != _pretty_sku(sku).upper()][:2]
            scenes.append({"type": "pack", "img": spec, "words": words or [""],
                           "tag": _pretty_sku(sku)})
        else:
            scenes.append({"type": "machine", "img": spec})
    return scenes


def auto_scenes(n):
    if n == 1:
        return [{"type": "hook"}]
    mids = ["pack" if i % 2 == 0 else "machine" for i in range(max(0, n - 2))]
    return [{"type": "hook"}] + [{"type": t} for t in mids] + [{"type": "cta"}]


def _instance_file(proj, kind, n):
    """ฉากชนิดเดียวกันครั้งที่ n (≥2) → ก๊อปไฟล์ฉากแล้วเปลี่ยน id ทั้งหมด (id ห้ามซ้ำทั้งหน้า)"""
    base = SCENE_FILES[kind]
    if n == 1:
        return base
    cid = f"{base}-{n}"
    src = (proj / "compositions" / f"{base}.html").read_text(encoding="utf-8")
    pre = ID_PREFIX[kind]
    # prefix ก่อน แล้วค่อยชื่อฉาก — กลับลำดับแล้ว "scene-pack-2" จะโดนแทนซ้ำเป็น "scene-pack2-2"
    out = src.replace(pre, pre[:-1] + f"{n}-").replace(base, cid)
    (proj / "compositions" / f"{cid}.html").write_text(out, encoding="utf-8")
    return cid


def _caption_html(text, hot, brand):
    t = html.escape(text)
    for w in sorted(hot, key=len, reverse=True):
        t = re.sub(rf"(?i)({re.escape(html.escape(w))})", r'<b class="hot">\1</b>', t)
    for w in sorted(brand, key=len, reverse=True):
        t = re.sub(rf"(?i)(?<![\w>])({re.escape(html.escape(w))})", r'<b class="hl">\1</b>', t)
    return t


def write_project(proj, scenes, timing, chunks, words, total, voice_rel):
    """เขียน index.html ลงโฟลเดอร์โปรเจกต์ (ต้องมี compositions/ + assets/ จากเทมเพลตอยู่แล้ว)"""
    n = len(scenes)
    starts = [0.0] + [round(float(timing[i]["start"]), 3) for i in range(1, n)]
    ends = starts[1:] + [round(total + TAIL, 3)]
    duration = ends[-1]
    count, slots, hot, brand = {}, [], set(), {"DivisionX Card", "DivisionX"}
    for i, sc in enumerate(scenes):
        kind = sc["type"]
        count[kind] = count.get(kind, 0) + 1
        cid = _instance_file(proj, kind, count[kind])
        lo, hi = starts[i], ends[i]
        vals = {}
        if sc.get("img"):
            vals["img"] = sc["img"]
        if kind in ("hook", "pack") and sc.get("img"):
            vals.update(gloss_box(proj / sc["img"]))
        if kind == "hook":
            vals.update({k: sc[k] for k in ("title", "kicker") if sc.get(k)})
            if sc.get("title"):
                brand.add(sc["title"])
        elif kind == "pack":
            ws = [w for w in (sc.get("words") if sc.get("words") is not None else ["SEC", "LEADER"])][:2] or [""]
            vals["word1"], vals["word2"] = ws[0], (ws[1] if len(ws) > 1 else "")
            if sc.get("tag"):
                vals["tag"] = sc["tag"]
            for k, w in (("at1", vals["word1"]), ("at2", vals["word2"])):
                t = phrase_time(w, chunks, words, lo, hi) if w else None
                if t is not None:
                    vals[k] = round(max(0.15, t - lo), 3)
            hot.update(w for w in ws if w)
        elif kind == "machine":
            steps = (sc.get("steps") or ["เลือกช่อง", "กดซื้อ", "เปิดดวง"])[:3]
            for j, s in enumerate(steps, 1):
                vals[f"step{j}"] = s
                t = phrase_time(s, chunks, words, lo, hi)
                if t is not None:
                    vals[f"at{j}"] = round(max(0.2, t - lo), 3)
        elif kind == "cta":
            vals.update({k: sc[k] for k in ("title", "tag") if sc.get(k)})
        vv = html.escape(json.dumps(vals, ensure_ascii=False), quote=True)
        slots.append(
            f'      <div id="slot-{i}" class="scene-slot" data-composition-id="{cid}" '
            f'data-composition-src="compositions/{cid}.html" data-start="{lo}" '
            f'data-duration="{round(hi - lo, 3)}" data-track-index="1" data-width="1080" '
            f'data-height="1920" data-variable-values="{vv}"></div>')
        _log("3/4", f"ฉาก {i + 1} {kind:8s} {lo:6.2f}–{hi:6.2f} วิ · {vals}")

    caps = []
    for k, c in enumerate(chunks):
        s, e = round(float(c["start"]), 3), round(float(c["end"]), 3)
        nxt = round(float(chunks[k + 1]["start"]), 3) if k + 1 < len(chunks) else e
        d = round(max(0.3, (nxt if 0 < nxt - e < 0.45 else e) - s), 3)  # ช่องหายใจสั้น ๆ ไม่ให้ซับกะพริบ
        caps.append(f'        <div id="cap-{k + 1}" class="clip cap" data-start="{s}" data-duration="{d}" '
                    f'data-track-index="0"><span class="cap-text">{_caption_html(c["text"], hot, brand)}</span></div>')
    # ซับอยู่ในฉากย่อยของตัวเอง (แทร็กแน่น ๆ ไม่ปนกับ index.html · แก้ใน Studio เป็นรายท่อนได้ด้วย id)
    cap_tpl = (TEMPLATE / "scaffold" / "captions.template.html").read_text(encoding="utf-8")
    (proj / "compositions" / "captions.html").write_text(cap_tpl.replace("{{CAPTIONS}}", "\n".join(caps)),
                                                         encoding="utf-8")

    audio = (f'      <audio id="vo" src="{voice_rel}" data-start="0" data-duration="{round(total, 3)}" '
             f'data-track-index="9" data-volume="1"></audio>')
    host = (TEMPLATE / "scaffold" / "host.template.html").read_text(encoding="utf-8")
    cta_start = next((starts[i] for i, sc in enumerate(scenes) if sc["type"] == "cta"), duration)
    out = (host.replace("{{DURATION}}", str(duration))
               .replace("{{CUTS}}", json.dumps(starts))
               .replace("{{LOGO_UNTIL}}", str(round(cta_start, 3)))
               .replace("{{SCENES}}", "\n".join(slots))
               .replace("{{CAPTIONS_SLOT}}", f'      <div id="captions-slot" data-composition-id="captions" '
                        f'data-composition-src="compositions/captions.html" data-start="0" '
                        f'data-duration="{duration}" data-track-index="7" data-track-kind="captions" data-width="1080" data-height="1920"></div>')
               .replace("{{AUDIO}}", audio))
    (proj / "index.html").write_text(out, encoding="utf-8")
    return duration


def _npx(args, cwd, timeout=1800):
    env = dict(os.environ)
    ff = pathlib.Path(config.ffmpeg_bin()).parent
    env["PATH"] = f"{ff}{os.pathsep}{env.get('PATH', '')}"
    env["PYTHONIOENCODING"] = "utf-8"
    npx = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
    r = subprocess.run([npx, "--yes", f"hyperframes@{_cli_version()}", *args], cwd=str(cwd), env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def build_video(plan, out_mp4=None, check=True):
    project = plan.get("project") or "clip"
    work = config.work_dir(project)
    (work / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    out_mp4 = pathlib.Path(out_mp4 or (work / f"{project}.mp4"))

    segs, wav, total, timing, words, chunks = prepare(plan, work)
    scenes = [dict(s) for s in (plan.get("scenes") or [])] or scenes_from_plan(plan, segs)
    if len(scenes) != len(segs):
        raise ValueError(f"scenes มี {len(scenes)} ฉาก แต่สคริปต์มี {len(segs)} บรรทัด — ต้องเท่ากัน (1 บรรทัด = 1 ฉาก)")

    # โปรเจกต์ต่องาน = ก๊อปเทมเพลต (ฉาก + ฟอนต์ + โลโก้) ใหม่ทุกครั้ง ไม่แตะเทมเพลตต้นฉบับ
    proj = work / "hf"
    if proj.exists():
        shutil.rmtree(proj)
    shutil.copytree(TEMPLATE, proj, ignore=shutil.ignore_patterns(
        "renders", ".hyperframes", "node_modules", "index.html", "voice.wav", ".thumbnails", "captions.html"))
    for i, sc in enumerate(scenes):
        default = {"hook": "sku:OP 17", "pack": "sku:OP 17", "machine": "machine:hero", "cta": "machine:scene"}
        spec = sc.get("img") or (f"sku:{sc['sku']}" if sc.get("sku") else None) or sc.get("photo") \
            or default[sc["type"]]
        sc["img"] = resolve_image(spec, proj, f"scene-{i}")
    shutil.copyfile(wav, proj / "assets" / "voice.wav")
    duration = write_project(proj, scenes, timing, chunks, words, total, "assets/voice.wav")

    if check:
        code, log = _npx(["lint", "."], proj, timeout=600)
        tail = "\n".join(log.strip().splitlines()[-12:])
        if code != 0:
            raise RuntimeError(f"hyperframes lint ไม่ผ่าน:\n{tail}")
        _log("4/4", "lint ผ่าน")
    t0 = time.time()
    code, log = _npx(["render", ".", "--output", str(out_mp4), "--fps", str(config.FPS),
                      "--quality", plan.get("hf_quality", "standard")], proj)
    tail = "\n".join(log.strip().splitlines()[-8:])
    if code != 0 or not out_mp4.exists():
        raise RuntimeError(f"hyperframes render ล้ม:\n{tail}")
    _log("4/4", f"เรนเดอร์เสร็จ {duration:.1f} วิ ({time.time() - t0:.0f} วิ) → {out_mp4}\n{tail}")
    return out_mp4, total


def write_demo(plan):
    """เขียน index.html ตัวอย่างลงโฟลเดอร์เทมเพลต (ใช้รูปปริยายของเทมเพลต) ให้เปิดใน Studio ได้"""
    work = config.work_dir(plan.get("project") or "clip")
    segs, wav, total, timing, words, chunks = prepare(plan, work)
    scenes = [dict(s) for s in (plan.get("scenes") or [])] or auto_scenes(len(segs))
    defaults = {"hook": "assets/pack.webp", "pack": "assets/pack.webp",
                "machine": "assets/machine-hero.jpg", "cta": "assets/machine-scene.jpg"}
    for sc in scenes:
        sc["img"] = defaults[sc["type"]]
    shutil.copyfile(wav, TEMPLATE / "assets" / "voice.wav")
    d = write_project(TEMPLATE, scenes, timing, chunks, words, total, "assets/voice.wav")
    _log("demo", f"เขียน {TEMPLATE / 'index.html'} ({d:.1f} วิ)")


def main():
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="เรนเดอร์คลิปด้วย HyperFrames")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out")
    ap.add_argument("--demo", action="store_true", help="เขียน index.html ตัวอย่างลงเทมเพลต ไม่เรนเดอร์")
    ap.add_argument("--no-check", action="store_true")
    a = ap.parse_args()
    plan = json.loads(pathlib.Path(a.plan).read_text(encoding="utf-8"))
    if a.demo:
        write_demo(plan)
    else:
        build_video(plan, a.out, check=not a.no_check)


if __name__ == "__main__":
    main()
