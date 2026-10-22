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

from . import align, config, segments, sound

TEMPLATE = config.REPO / "hyperframes" / "templates" / "dvx-promo"
TAIL = 0.9                    # ค้างฉากปิดหลังเสียงจบ (วินาที) ให้คนอ่านแท็ก/โลโก้ทัน
SCENE_FILES = {"hook": "scene-hook", "pack": "scene-pack", "machine": "scene-machine", "cta": "scene-cta",
               "rank": "fmt-rank", "versus": "fmt-versus", "quiz": "fmt-quiz", "map": "fmt-map"}
# prefix ของ id ภายในแต่ละฉาก — ใช้เปลี่ยนชื่อตอนฉากชนิดเดียวกันโผล่ซ้ำในคลิปเดียว (id ห้ามซ้ำทั้งหน้า)
ID_PREFIX = {"hook": "hook-", "pack": "pack-", "machine": "mach-", "cta": "cta-", "rank": "rank-", "versus": "vs-",
             "quiz": "quiz-", "map": "map-"}
# ฉาก "รูปแบบ" (fmt-*) คลุมหลายบรรทัดของสคริปต์ด้วย "span" แล้วเดินตามเวลาของแต่ละบรรทัดเอง
# (ของค้างบนจอที่ค่อย ๆ เติม = สิ่งที่คลิปวิวหลักล้านมีเหมือนกัน · ดู hf_formats.py)
FONT_DIR = TEMPLATE / "assets" / "fonts"
# ชุดหน้าตา (look) — ระบบจับคู่ให้ต่างกันทุกคลิป (เจ้าของ 16 ต.ค.: "อยากให้ระบบออกแบบได้อิสระ ไม่จำเจ")
# ทุกค่าอยู่ในโทนแบรนด์ (ฟ้านีออน + สายฟ้า + โครเมียม บนกรมท่า) — ต่างกันที่ลาย/จังหวะ/สีเน้น ไม่ใช่เปลี่ยนแบรนด์
# ความหมายของแต่ละค่า: หัวไฟล์ hyperframes/templates/dvx-promo/scaffold/host.template.html
LOOK_SPACE = {"bg": ("grid", "dots", "rays", "speed"), "cut": ("bolt", "flash", "glitch", "wipe"),
              "ts": ("stroke", "chrome", "neon"), "hot": ("gold", "cyan", "orange")}
HOT = {"gold": "#ffc24a", "cyan": "#59d2ff", "orange": "#ff9d2a"}
QBASE = {"rank": (104, 128), "versus": (104, 128), "quiz": (104, 118), "map": (104, 124)}   # ขนาดหัวเรื่องปกติ (px)
EXTEND = {"rank": 0.9, "versus": 0.9, "quiz": 1.2, "map": 1.0}   # วินาทีที่ฉากรูปแบบค้างเข้าบรรทัดถัดไป (write_project)
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
    # ย่อช่วงเงียบยาวกลางประโยค (23 ต.ค. 2026 · คลิปจริงเงียบสนิท 0.6–1.6 วิ ระหว่างบรรทัด) — ก่อน whisper จับเวลา
    # ภาพทุกฉากจึงตามเสียงที่ย่อแล้ว · ปิดได้ด้วย plan["keep_pauses"] = true
    if not plan.get("keep_pauses"):
        try:
            if sound.tighten_pauses(wav):
                _log("1/4", "ย่อช่วงเงียบยาวในเสียงพากย์แล้ว")
        except Exception as e:
            _log("1/4", f"⚠️ ย่อช่วงเงียบไม่สำเร็จ ({str(e)[:80]}) — ใช้เสียงเดิม")
    total = voice_mod.duration(wav)
    _log("1/4", f"{len(segs)} ฉาก · เสียง {total:.1f} วิ ({time.time() - t0:.0f} วิ)")

    stamp_f = wav.with_suffix(".stamp.json")
    # เวลารายคำผูกกับเสียงหลังย่อช่วงเงียบ — แคชเดิม (ก่อนย่อ) ต้องไม่ถูกหยิบมาใช้
    stamp = (stamp_f.read_text(encoding="utf-8") if stamp_f.exists() else "") + \
        ("" if plan.get("keep_pauses") else f"|{sound.TIGHT_VERSION}:{sound.PAUSE_MAX}:{sound.PAUSE_KEEP}")
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


# คีย์ของฉากปิดที่เป็นคำสั่งถึง hf_render ไม่ใช่ตัวแปรของฉาก (ไม่ส่งเข้า data-variable-values)
CTA_SKIP = ("type", "span", "layout", "hold", "min_on", "extend", "inherit", "inherit_map", "fmt")


def _steps_times(sc, lines, chunks, words, lo, onsets=None):
    """ฉากปิด "กดตู้ 4 ขั้น": วินาที (จากต้นฉาก) ที่พูดชื่อแต่ละขั้น → ไฟขั้นนั้นติด · หาจากบรรทัดสุดท้ายของฉาก
    whisper มักถอด "QR" เป็น "คิวอาร์" หาไม่เจอ → ตำแหน่งตามสัดส่วนตัวอักษรในบรรทัด · ห่างกันอย่างน้อย 0.35 วิ"""
    s, e = lines[-1]
    text = sc.get("_line_b") or ""
    out, prev = {}, None
    for k in range(1, 5):
        word = sc.get(f"s{k}") or ""
        t = phrase_time(word, chunks, words, s, e) if word else None
        if t is None and word and text and word in text:
            t = s + (e - s) * text.index(word) / max(1, len(text))
        if t is None:
            t = s + (e - s) * (k - 1) / 4
        t = snap(t, onsets) if onsets else t
        t = max(t - lo, 0.45 if k == 1 else prev + 0.35)
        out[f"st{k}"] = round(t, 3)
        prev = t
    return out


def _scene_base(sc):
    """ไฟล์ฉาก + prefix id ของฉากนี้ — ฉากปิดมีหลายแบบ (sc["layout"]) แต่ละแบบเป็นไฟล์ cta-<layout>.html ของตัวเอง
    (เจ้าของ 16 ต.ค.: "ฉากปิดซ้ำกันทุกคลิป" · ไม่มี layout = scene-cta เดิม)"""
    if sc["type"] == "cta" and sc.get("layout"):
        return f"cta-{sc['layout']}", f"cta-{sc['layout']}-"
    return SCENE_FILES[sc["type"]], ID_PREFIX[sc["type"]]


def _instance_file(proj, base, pre, n):
    """ฉากไฟล์เดียวกันครั้งที่ n (≥2) → ก๊อปไฟล์ฉากแล้วเปลี่ยน id ทั้งหมด (id ห้ามซ้ำทั้งหน้า)"""
    if n == 1:
        return base
    cid = f"{base}-{n}"
    src = (proj / "compositions" / f"{base}.html").read_text(encoding="utf-8")
    # prefix ก่อน แล้วค่อยชื่อฉาก — กลับลำดับแล้ว "scene-pack-2" จะโดนแทนซ้ำเป็น "scene-pack2-2"
    out = src.replace(pre, pre[:-1] + f"{n}-").replace(base, cid)
    (proj / "compositions" / f"{cid}.html").write_text(out, encoding="utf-8")
    return cid


def resolve_look(raw, seed):
    """plan["look"] → ค่าครบทุกช่อง · ช่องที่ไม่ระบุ/ไม่รู้จัก = สุ่มแบบมี seed (งานเดิมเรนเดอร์ซ้ำได้หน้าตาเดิม)
    ตัวเลือกแบบเลี่ยงของที่เพิ่งใช้อยู่ที่ hf_director.choose_look — ที่นี่เป็นแค่ทางสำรองตอนไม่มีใครเลือกให้"""
    import random
    raw = raw if isinstance(raw, dict) else {}
    rng = random.Random(f"look:{seed}")
    return {k: (raw.get(k) if raw.get(k) in opts else rng.choice(opts)) for k, opts in LOOK_SPACE.items()}


def fit_px(text, weight=800, max_w=640, base=64, low=34):
    """ขนาดตัวอักษรที่ใหญ่สุดที่ข้อความยาวบรรทัดเดียวไม่เกิน max_w — วัดด้วยฟอนต์ Kanit ตัวจริง (PIL)
    วัดฝั่ง Python ตอนประกอบโปรเจกต์ แทนการวัดใน Chrome ระหว่างเรนเดอร์ (ฟอนต์อาจยังโหลดไม่เสร็จ)"""
    try:
        from PIL import ImageFont
        f = FONT_DIR / {900: "Kanit-Black.ttf", 800: "Kanit-ExtraBold.ttf"}.get(weight, "Kanit-SemiBold.ttf")
        for px in range(base, low - 1, -2):
            if ImageFont.truetype(str(f), px).getlength(text or "") <= max_w:
                return px
        return low
    except Exception:
        return max(low, min(base, int(max_w / max(1, len(text or "")) * 1.7)))


def speech_onsets(wav, noise="-35dB", gap=0.12):
    """วินาทีที่เสียงพูดเริ่มดังหลังช่วงเงียบ (ffmpeg silencedetect) — ใช้ขยับจังหวะภาพให้ตรงพยางค์แรกจริง

    ทำไม: whisper ให้เวลาคำสั้น ๆ ที่พูดแยกเดี่ยวคลาดมาก — คลิปทายชุดจริง 16 ต.ค.: TTS พูด "สาม/สอง/หนึ่ง"
    ที่ 4.73/5.75/6.84 วิ แต่ whisper ถอดเป็น "3 2 1" ที่ 5.58/5.82/6.06 (ห่างกันแค่ 0.24 วิ) และ "OP" ผิดไปครึ่งวินาที
    ช่วงเงียบในไฟล์เสียงคือของจริง จึงแม่นกว่าสำหรับคำที่พูดแยกด้วย … """
    try:
        r = subprocess.run([config.ffmpeg_bin(), "-hide_banner", "-nostats", "-i", str(wav), "-af",
                            f"silencedetect=noise={noise}:d={gap}", "-f", "null", "-"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        return [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", r.stderr)]
    except Exception:
        return []


def snap(t, onsets, win=0.35):
    """เลื่อน t ไปจุดเริ่มพูดที่ใกล้สุดถ้าอยู่ในระยะ win วิ — ไม่มีก็คืน t เดิม"""
    best = min(onsets or [], key=lambda o: abs(o - t), default=None)
    return best if best is not None and abs(best - t) <= win else t


def _line_spans(timing, a, k, lo, hi):
    """เวลา (เริ่ม, จบ) จริงในคลิปของบรรทัด a..a+k-1 — บรรทัดแรกเริ่มที่ต้นฉาก"""
    out = []
    for j in range(a, a + k):
        s, e = float(timing[j]["start"]), float(timing[j]["end"])
        out.append((lo if j == a else max(lo, s), min(hi, e)))
    return out


def _rank_vals(sc, lines, chunks, words, lo, hi, onsets=None):
    """กระดานอันดับ 5 ช่อง: บรรทัด 0 = คำถาม · บรรทัด 1..5 = อันดับ 5 → 1 (items[0] = อันดับ 1)"""
    items = sc.get("items") or []
    if len(items) != 5 or len(lines) != 6:
        raise ValueError(f"ฉาก rank ต้องมี 5 อันดับ + 6 บรรทัด (ได้ {len(items)} อันดับ · {len(lines)} บรรทัด)")
    # ส่งข้อความทุกช่องเสมอ (ว่าง = ซ่อน) — ไม่ปล่อยให้ค่าตัวอย่างของเทมเพลตโผล่ในงานจริง
    vals = {k: sc.get(k) or "" for k in ("kicker", "q1", "q2", "sub")}
    vals["_reveals"] = []
    for r, it in enumerate(items, 1):
        name = it.get("name") or ""
        vals.update({f"img{r}": it["img"], f"name{r}": name, f"tag{r}": it.get("tag") or "",
                     f"fs{r}": fit_px(name, 800, 640, 64, 34)})
        s, e = lines[6 - r]
        t = phrase_time(name, chunks, words, s, e) if name else None
        vals[f"ln{r}"] = round(s - lo, 3)
        vals[f"at{r}"] = round(max(s + 0.15, snap(t if t is not None else s + 0.45, onsets)) - lo, 3)
        if name:
            vals["_reveals"].append((name, s - lo, vals[f"at{r}"]))
    vals["dur"] = round(hi - lo, 3)
    return vals


def versus_sides(n_rounds, wins):
    """ฝั่งของผู้เข้าแข่งแต่ละคน — กติกาเดียวกับ JS ใน fmt-versus (ผู้ท้าชิงเข้าฝั่งของผู้แพ้)
    wins[k] = เลขผู้ชนะรอบ k+1 · คืน (side{เลข: 'L'|'R'}, [(a, b) ต่อรอบ])"""
    side, pairs, champ = {1: "L", 2: "R"}, [], None
    for k in range(1, n_rounds + 1):
        a, b = (1, 2) if k == 1 else (champ, k + 1)
        if k > 1:
            side[b] = "R" if side[a] == "L" else "L"
        pairs.append((a, b))
        champ = wins[k - 1]
    return side, pairs


def _versus_vals(sc, lines, chunks, words, lo, hi, onsets=None):
    """เลือกข้าง: บรรทัด 0 = คำถาม · ต่อรอบ 2 บรรทัด ("A หรือ B?" · เฉลยผู้ชนะ) · items = ผู้เข้าแข่งตามลำดับ"""
    items, rounds = sc.get("items") or [], sc.get("rounds") or []
    R = len(rounds)
    if not 1 <= R <= 3 or len(items) != R + 1 or len(lines) != 1 + 2 * R:
        raise ValueError(f"ฉาก versus: {R} รอบ ต้องมีผู้เข้าแข่ง {R + 1} และ {1 + 2 * R} บรรทัด "
                         f"(ได้ {len(items)} · {len(lines)})")
    vals = {k: sc.get(k) or "" for k in ("kicker", "q1", "q2", "sub", "final")}
    for c, it in enumerate(items, 1):
        name = it.get("name") or ""
        vals.update({f"img{c}": it["img"], f"name{c}": name, f"tag{c}": it.get("tag") or "",
                     f"fs{c}": fit_px(name, 800, 420, 64, 30)})
    for c in range(len(items) + 1, 5):                 # ช่องที่ไม่ใช้: ไม่ปล่อยค่าตัวอย่างโผล่
        vals.update({f"img{c}": items[0]["img"], f"name{c}": "", f"tag{c}": ""})
    # ไม่ส่งสัดส่วน/ตัวเลขยอดขายเข้าฉากเลย — เจ้าของเลือกไม่โชว์ (16 ต.ค.) · ฉากรู้แค่ "ใครชนะ"
    vals.update({"rounds": R, "_reveals": []})
    for k, rd in enumerate(rounds, 1):
        s_in, _ = lines[2 * k - 1]
        s_rv, e_rv = lines[2 * k]
        win = int(rd["win"])
        wname = items[win - 1].get("name") or ""
        t = phrase_time(wname, chunks, words, s_rv, e_rv)
        vals.update({f"win{k}": win,
                     f"in{k}": round(s_in - lo, 3),
                     f"rv{k}": round(max(s_rv + 0.2, snap(t if t is not None else s_rv + 0.5, onsets)) - lo, 3)})
        if wname:
            vals["_reveals"].append((wname, s_rv - lo, vals[f"rv{k}"]))
    vals["dur"] = round(hi - lo, 3)
    return vals


def _quiz_vals(sc, lines, chunks, words, lo, hi, proj, onsets=None):
    """ทายชุด: บรรทัด 0 = คำถาม · 1 = "…สาม สอง หนึ่ง" · 2 = "เฉลย! <ชื่อ>" """
    if len(lines) != 3:
        raise ValueError(f"ฉาก quiz ต้องมี 3 บรรทัด (ได้ {len(lines)})")
    name = sc.get("name") or ""
    vals = {k: sc.get(k) or "" for k in ("kicker", "q1", "q2", "sub", "prompt", "tag")}
    vals.update({"img": sc["img"], "name": name, "fs": fit_px(name, 900, 940, 150, 70)})
    # จุดซูม = กลางตัวซองช่วงบน (ลายตัวละคร) — ห่างทั้งรหัสชุดมุมบนซ้ายและชื่อชุดตัวใหญ่ช่วงล่างของซอง
    # (รอบแรกซูมที่ 58% ของความสูง → ชื่อชุดญี่ปุ่นโผล่ในเลนส์ตั้งแต่ยังไม่เฉลย)
    box = gloss_box(proj / sc["img"], inset=0) or {"gl": 25, "gt": 5, "gw": 50, "gh": 90}
    vals["zx"] = round(float(sc.get("zx") or box["gl"] + box["gw"] / 2), 2)
    vals["zy"] = round(float(sc.get("zy") or box["gt"] + box["gh"] * 0.32), 2)
    vals["z0"] = float(sc.get("z0") or 4.2)
    s1, e1 = lines[1]
    s2, e2 = lines[2]
    # นับถอยหลัง: whisper ถอด "สาม สอง หนึ่ง" เป็นเลข 3 2 1 ที่เวลาคลาด และ map_segments ตัดบรรทัด 1 จบที่คำไทย
    # คำสุดท้ายที่จับได้ ("…เลย") → เลขทั้งสามคือ 3 จุดเริ่มพูดแรกหลังจากนั้น (ก่อนคำว่า "เฉลย")
    after = [o for o in (onsets or []) if e1 + 0.12 <= o < s2 + 0.5]
    if len(after) >= 3:
        cd = {3: after[0], 2: after[1], 1: after[2]}
    else:
        span = max(1.2, s2 - e1)
        cd = {k: e1 + span * f for k, f in ((3, 0.15), (2, 0.45), (1, 0.75))}
    t = phrase_time(name, chunks, words, s2, e2) if name else None
    rv = max(cd[1] + 0.4, snap(t if t is not None else s2 + 0.45, onsets))
    vals.update({f"cd{k}": round(cd[k] - lo, 3) for k in cd})
    vals.update({"rv": round(rv - lo, 3), "dur": round(hi - lo, 3)})
    if name:
        vals["_reveals"] = [(name, s2 - lo, vals["rv"])]
    vals["_count"] = (cd[3], cd[2], cd[1])           # เวลาจริงในคลิป — ซับบรรทัดนับใช้ชุดเดียวกับวง (_recount_chunks)
    return vals


def _recount_chunks(chunks, recount):
    """ซับบรรทัดนับถอยหลัง → "<นำ>" | "สาม…" | "สอง…" | "หนึ่ง…" ตามเวลาเดียวกับวงนับ

    whisper ถอด "สาม สอง หนึ่ง" ไม่ออก บรรทัดนี้จึงจบเร็วผิด (คลิปทดสอบ 16 ต.ค.: ทั้งบรรทัดได้ 0.6 วิ ก่อนเริ่มนับจริง
    → ซับแวบเดียวแล้วจอว่างตลอด 3·2·1 ทั้งที่วงนับตรงเสียง) · recount = {segment: (เวลา 3, 2, 1)}
    """
    out, done = [], set()
    for c in chunks:
        seg = c.get("segment")
        if seg not in recount:
            out.append(c)
            continue
        if seg in done:
            continue
        done.add(seg)
        mine = [x for x in chunks if x.get("segment") == seg]
        nxt = next((x["start"] for x in chunks[chunks.index(mine[-1]) + 1:]), None)
        words = " ".join(x["text"] for x in mine).split()
        k = next((j for j, w in enumerate(words) if w.startswith("สาม")), None)
        if k is None or len(words) < k + 3:
            out += mine
            continue
        c3, c2, c1 = recount[seg]
        end1 = c1 + 0.9 if nxt is None else max(c1 + 0.3, min(c1 + 0.9, nxt))
        parts = [(" ".join(words[:k]), mine[0]["start"], c3), (words[k], c3, c2), (words[k + 1], c2, c1),
                 (" ".join(words[k + 2:]), c1, end1)]
        out += [{"text": t, "start": round(s, 3), "end": round(e, 3), "segment": seg} for t, s, e in parts if t and e > s]
    return out


def _map_vals(sc, lines, chunks, words, lo, hi, onsets=None):
    """พิกัดตู้: บรรทัด 0 = หมุดทุกสาขา · 1 = "วันนี้พาไปที่ <ห้าง>" · 2 = ชั้น · 3 = จุดสังเกต
    · 4 (ถ้ามีรูปตู้สาขานี้) = "หน้าตาตู้…" → การ์ดรูปตู้จริง"""
    photo = sc.get("photo") or ""
    if len(lines) != (5 if photo else 4):
        raise ValueError(f"ฉาก map ต้องมี {5 if photo else 4} บรรทัด (ได้ {len(lines)})")
    mall, landmark = sc.get("mall") or "", sc.get("landmark") or ""
    vals = {k: sc.get(k) or "" for k in ("kicker", "q1", "q2", "sub", "pins", "offmap", "floor", "plabel")}
    vals["photo"] = photo
    vals["ph"] = round(snap(lines[4][0], onsets, 0.25) - lo, 3) if photo else 999
    # ป้ายบนการ์ดรูปตู้: การ์ดกว้าง 554 − ขอบ/ช่องว่างในป้าย ≈ 460 (ชื่อยาวอย่าง "…พระราม 2 · ชั้น G" ล้นขอบที่ 38px)
    vals["pfs"] = fit_px(vals["plabel"], 800, 460, 38, 22)
    vals.update({"mall": mall, "landmark": landmark, "count": int(sc.get("count") or 0),
                 "fx": float(sc["fx"]), "fy": float(sc["fy"]),
                 "mfs": fit_px(mall, 900, 900, 104, 56), "lfs": fit_px(landmark, 900, 780, 50, 30)})
    (s1, e1), (s2, e2), (s3, e3) = lines[1], lines[2], lines[3]
    t_nm = phrase_time(mall, chunks, words, s1, e1) if mall else None
    t_fl = phrase_time(f"ชั้น{vals['floor']}", chunks, words, s2, e2) if vals["floor"] else None
    zm = snap(s1, onsets, 0.25)
    nm = max(zm + 0.25, snap(t_nm if t_nm is not None else s1 + 0.6, onsets))
    fl = max(nm + 0.5, snap(t_fl if t_fl is not None else s2 + 0.3, onsets))
    lm = max(fl + 0.6, snap(s3 + 0.2, onsets))
    vals.update({"zm": round(zm - lo, 3), "nm": round(nm - lo, 3), "fl": round(fl - lo, 3),
                 "lm": round(lm - lo, 3), "dur": round(hi - lo, 3)})
    return vals


def _caption_html(text, hot, brand):
    t = html.escape(text)
    for w in sorted(hot, key=len, reverse=True):
        t = re.sub(rf"(?i)({re.escape(html.escape(w))})", r'<b class="hot">\1</b>', t)
    # "@" กันไฮไลต์ซ้อน: "@divisionxcard" ถูกระบายก่อน (ยาวสุด) แล้ว "DivisionX" ห้ามไปจับข้างในอีกรอบ (สองสีในคำเดียว)
    for w in sorted(brand, key=len, reverse=True):
        t = re.sub(rf"(?i)(?<![\w>@])({re.escape(html.escape(w))})", r'<b class="hl">\1</b>', t)
    return t


def write_project(proj, scenes, timing, chunks, words, total, voice_rel, look=None):
    """เขียน index.html ลงโฟลเดอร์โปรเจกต์ (ต้องมี compositions/ + assets/ จากเทมเพลตอยู่แล้ว)"""
    look = look or resolve_look(None, proj.parent.name)
    # ชุดหน้าตาลงที่ slot: คลาสหัวเรื่อง + สีเน้น — ฉากย่อยอยู่ใน DOM เดียวกับ index.html จึงรับ CSS/ตัวแปรต่อ
    slot_look = f'class="scene-slot ts-{look["ts"]}" style="--hot: {HOT[look["hot"]]}"'
    n = len(scenes)
    spans = [max(1, int(sc.get("span") or 1)) for sc in scenes]
    first = [sum(spans[:i]) for i in range(n)]                # บรรทัดแรกของแต่ละฉาก
    starts = [0.0] + [round(float(timing[first[i]]["start"]), 3) for i in range(1, n)]
    # ฉากรูปแบบค้างต่อเข้าบรรทัดถัดไปได้ (J-cut: เสียงปิดเริ่มก่อน ภาพตามมา) — เฉลยท้ายฉากจะได้ไม่ถูกตัดทิ้ง
    # (ชื่ออันดับ 1 พูดแทบชนท้ายบรรทัด เหลือเวลาดูกระดานเต็มไม่ถึงวินาที) · ฉากถัดไปต้องเหลือ ≥ 1.8 วิ
    # ฉากปิดแบบให้ข้อมูล (สาขา/วิธีซื้อ) ค้างต่อหลังเสียงจบได้ (sc["hold"]) — 0.9 วิ อ่านทันแค่โลโก้กับแท็ก
    base_hold = max(0.0, min(3.0, float(scenes[-1].get("hold") or 0))) if scenes else 0.0
    for i in range(1, n):
        ext = float(scenes[i - 1].get("extend", EXTEND.get(scenes[i - 1]["type"], 0)) or 0)
        nxt_end = round(float(timing[first[i] + spans[i] - 1]["end"]), 3) if i + 1 < n else total + TAIL + base_hold
        ext = max(0.0, min(ext, nxt_end - starts[i] - 1.8))
        starts[i] = round(starts[i] + ext, 3)
    # ...และต้องอยู่บนจอรวมอย่างน้อย min_on — บรรทัดปิดสั้น/J-cut กินเวลาไป → ค้างเพิ่มให้ครบ (เพดาน 3 วิ)
    hold = base_hold
    if scenes and scenes[-1].get("min_on"):
        shown = total + TAIL - starts[-1]
        hold = max(0.0, min(3.0, max(base_hold, float(scenes[-1]["min_on"]) - shown)))
    ends = starts[1:] + [round(total + TAIL + hold, 3)]
    duration = ends[-1]
    fmt = any(sc["type"] in EXTEND for sc in scenes)
    onsets = speech_onsets(proj / voice_rel) if fmt else []
    reveals = []                     # (คำตอบ, เริ่มบรรทัดเฉลย, เวลาเฉลย) — เวลาจริงในคลิป · ใช้ตอนวางซับ
    recount = {}                     # segment ของบรรทัดนับถอยหลัง → (เวลา 3, 2, 1) · ใช้ตอนวางซับ
    count, slots, hot, brand = {}, [], set(), {"DivisionX Card", "DivisionX", "@divisionxcard"}
    prev_vals = {}
    sfx = []                         # (วินาทีในคลิป, ชนิด, ยาว) — sound.master ผสมหลังเรนเดอร์
    for i, sc in enumerate(scenes):
        kind = sc["type"]
        base, pre = _scene_base(sc)
        count[base] = count.get(base, 0) + 1
        cid = _instance_file(proj, base, pre, count[base])
        lo, hi = starts[i], ends[i]
        vals = {}
        if kind == "cta" and sc.get("layout"):
            # ฉากปิดรับรูป/ชื่อ/ตำแหน่งต่อจากฉากรูปแบบก่อนหน้า (match cut — ไฟล์เดียวกัน ไม่โหลดซ้ำ)
            vals.update({k: prev_vals[k] for k in sc.get("inherit") or [] if k in prev_vals})
            vals.update({dst: prev_vals[src] for dst, src in (sc.get("inherit_map") or {}).items() if src in prev_vals})
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
        elif kind == "cta" and sc.get("layout"):
            # ฉากปิดแบบใหม่: ส่งค่าข้อความ/รูปทั้งหมดตามที่แผนเตรียม (รายการส่งเป็นสตริงคั่นด้วย | — ฉากแตกเอง)
            vals.update({k: v for k, v in sc.items()
                         if k not in CTA_SKIP and not k.startswith("_") and isinstance(v, (str, int, float))
                         and not isinstance(v, bool)})
            vals["dur"] = round(hi - lo, 3)
            if sc["layout"] == "steps":
                vals.update(_steps_times(sc, _line_spans(timing, first[i], spans[i], lo, hi), chunks, words, lo, onsets))
        elif kind == "cta":
            vals.update({k: sc[k] for k in ("title", "tag", "linkcap", "link") if sc.get(k)})
        elif kind == "rank":
            vals.update(_rank_vals(sc, _line_spans(timing, first[i], spans[i], lo, hi), chunks, words, lo, hi, onsets))
            hot.update(it.get("name") for it in sc["items"] if it.get("name"))
        elif kind == "versus":
            vals.update(_versus_vals(sc, _line_spans(timing, first[i], spans[i], lo, hi), chunks, words, lo, hi, onsets))
            hot.update(it.get("name") for it in sc["items"] if it.get("name"))
        elif kind == "quiz":
            vals.update(_quiz_vals(sc, _line_spans(timing, first[i], spans[i], lo, hi), chunks, words, lo, hi, proj,
                                   onsets))
            if sc.get("name"):
                hot.add(sc["name"])
            recount[timing[first[i] + 1]["index"]] = vals.pop("_count")
        elif kind == "map":
            vals.update(_map_vals(sc, _line_spans(timing, first[i], spans[i], lo, hi), chunks, words, lo, hi, onsets))
            hot.update(w for w in (sc.get("mall"), f"ชั้น {sc.get('floor')}" if sc.get("floor") else None) if w)
        sfx += _sfx_events(kind, sc, vals, lo, hi, i > 0)
        if kind in QBASE:                            # หัวเรื่องจากคลังสำนวนยาวไม่เท่ากัน → ย่อให้พอดีจอ (วัดด้วย Kanit จริง)
            b1, b2 = QBASE[kind]
            vals["qs1"] = fit_px(vals.get("q1") or "", 900, 940, b1, 56)
            vals["qs2"] = fit_px(vals.get("q2") or "", 900, 940, b2, 60)
        reveals += [(sec, lo + ls, lo + ra) for sec, ls, ra in vals.pop("_reveals", [])]
        prev_vals = vals
        vv = html.escape(json.dumps(vals, ensure_ascii=False), quote=True)
        slots.append(
            f'      <div id="slot-{i}" {slot_look} data-composition-id="{cid}" '
            f'data-composition-src="compositions/{cid}.html" data-start="{lo}" '
            f'data-duration="{round(hi - lo, 3)}" data-track-index="1" data-width="1080" '
            f'data-height="1920" data-variable-values="{vv}"></div>')
        _log("3/4", f"ฉาก {i + 1} {kind:8s} {lo:6.2f}–{hi:6.2f} วิ · {vals}")

    if recount:
        chunks = _recount_chunks(chunks, recount)
    caps = []
    for k, c in enumerate(chunks):
        s, e = round(float(c["start"]), 3), round(float(c["end"]), 3)
        nxt = round(float(chunks[k + 1]["start"]), 3) if k + 1 < len(chunks) else e
        end = nxt if 0 < nxt - e < 0.45 else e                         # ช่องหายใจสั้น ๆ ไม่ให้ซับกะพริบ
        # ซับห้ามเฉลยก่อนภาพ: ท่อนที่มีคำตอบ (ชื่อชุด/ผู้ชนะ) ในบรรทัดเฉลย รอขึ้นพร้อมภาพเฉลย
        # (คลิปทายชุดจริง: ซับ "เฉลย! OP-15" ขึ้นตั้งแต่คำว่า "เฉลย" ก่อนภาพเฉลยเกือบ 1 วิ)
        for secret, line_s, reveal in reveals:
            if line_s - 0.05 <= s < reveal and _norm(secret) in _norm(c["text"]):
                s = round(reveal, 3)
        d = round(max(0.3, end - s), 3)
        caps.append(f'        <div id="cap-{k + 1}" class="clip cap" data-start="{s}" data-duration="{d}" '
                    f'data-track-index="0"><span class="cap-text">{_caption_html(c["text"], hot, brand)}</span></div>')
    # ซับอยู่ในฉากย่อยของตัวเอง (แทร็กแน่น ๆ ไม่ปนกับ index.html · แก้ใน Studio เป็นรายท่อนได้ด้วย id)
    cap_tpl = (TEMPLATE / "scaffold" / "captions.template.html").read_text(encoding="utf-8")
    (proj / "compositions" / "captions.html").write_text(cap_tpl.replace("{{CAPTIONS}}", "\n".join(caps)),
                                                         encoding="utf-8")

    audio = (f'      <audio id="vo" src="{voice_rel}" data-start="0" data-duration="{round(total, 3)}" '
             f'data-track-index="9" data-volume="1"></audio>')
    host = (TEMPLATE / "scaffold" / "host.template.html").read_text(encoding="utf-8")
    # โลโก้มุมหายตอนฉากปิดเดิม (มีโลโก้ใหญ่อยู่แล้ว) · ฉากปิดแบบใหม่ไม่มีโลโก้ใหญ่ → อยู่ถึงท้ายคลิป
    cta_start = next((starts[i] for i, sc in enumerate(scenes) if sc["type"] == "cta" and not sc.get("layout")),
                     duration)
    # รอยต่อเข้าฉากปิดแบบใหม่ = แสงวาบอย่างเดียว (แถบทึบ/กลิตช์บังพระเอกที่บินต่อจากฉากก่อน — match cut)
    soft = [i for i, sc in enumerate(scenes) if i > 0 and sc["type"] == "cta" and sc.get("layout")]
    hot_css = HOT[look["hot"]]
    _log("3/4", "ชุดหน้าตา: พื้นหลัง {bg} · ฉากเปลี่ยน {cut} · หัวเรื่อง {ts} · สีเน้น {hot}".format(**look))
    out = (host.replace("{{DURATION}}", str(duration))
               .replace("{{BG}}", look["bg"])
               .replace("{{CUT}}", look["cut"])
               .replace("{{CUTS}}", json.dumps(starts))
               .replace("{{SOFT}}", json.dumps(soft))
               .replace("{{LOGO_UNTIL}}", str(round(cta_start, 3)))
               .replace("{{SCENES}}", "\n".join(slots))
               .replace("{{CAPTIONS_SLOT}}", f'      <div id="captions-slot" style="--hot: {hot_css}" data-composition-id="captions" '
                        f'data-composition-src="compositions/captions.html" data-start="0" '
                        f'data-duration="{duration}" data-track-index="7" data-track-kind="captions" data-width="1080" data-height="1920"></div>')
               .replace("{{AUDIO}}", audio))
    (proj / "index.html").write_text(out, encoding="utf-8")
    (proj.parent / "sfx.json").write_text(json.dumps([e for e in sfx if 0 <= e[0] < duration]), encoding="utf-8")
    return duration


def _sfx_events(kind, sc, vals, lo, hi, cut_in):
    """จุดเอฟเฟกต์เสียงของฉากหนึ่ง — เวลาเดียวกับที่ภาพเฉลย (ค่า at/rv/cd ชุดเดียวกับที่ส่งเข้าฉาก)

    ทำไมผูกกับค่าเหล่านี้: ภาพในฉากเฉลยตรงเวลาพวกนี้อยู่แล้ว (snap กับจุดเริ่มพูด) เสียงจึงลงพร้อมภาพเป๊ะ
    """
    ev = []
    if cut_in:                                               # รอยต่อฉาก — ลมวูบนำหน้านิดหนึ่ง
        ev.append((max(0.0, lo - 0.2), "whoosh", None))
    elif kind != "hook":                                     # เปิดคลิป: เสียงแรกตรงแสงวาบเปิด (hook มีตูมของตัวเอง)
        ev.append((0.08, "impact", None))                    # วินาทีแรกเงียบ = เลื่อนผ่าน · ภาพเปิดด้วยสายฟ้า/แสงวาบอยู่แล้ว
    g = lambda k: vals.get(k) if isinstance(vals.get(k), (int, float)) else None
    if kind == "hook":
        ev.append((lo + 0.40, "impact", None))               # ซองตกกระแทก (scene-hook ชนที่ 0.42 วิ)
    elif kind == "pack":
        ev += [(lo + g(k), "pop", None) for k in ("at1", "at2") if g(k) is not None]
    elif kind == "machine":
        ev += [(lo + g(f"at{j}"), "pop", None) for j in (1, 2, 3) if g(f"at{j}") is not None]
    elif kind == "rank":
        for r in (5, 4, 3, 2):
            if g(f"at{r}") is not None:
                ev.append((lo + g(f"at{r}"), "impact" if r <= 3 else "pop", None))
        if g("at1") is not None:                             # อันดับหนึ่ง: ไต่ระดับ → ตูม + ประกาย
            d = max(0.6, min(2.4, g("at1") - (g("ln1") or g("at1") - 1.2)))
            ev += [(lo + g("at1") - d, "riser", round(d, 2)), (lo + g("at1"), "impact", None),
                   (lo + g("at1") + 0.05, "shine", None)]
    elif kind == "versus":
        R = int(vals.get("rounds") or 0)
        for k in range(1, R + 1):
            if g(f"in{k}") is not None and k > 1:
                ev.append((lo + g(f"in{k}"), "whoosh", None))
            if g(f"rv{k}") is not None:
                ev.append((lo + g(f"rv{k}"), "impact", None))
        if R and g(f"rv{R}") is not None:
            ev.append((lo + g(f"rv{R}") + 0.05, "shine", None))
    elif kind == "quiz":
        ev += [(lo + g(f"cd{k}"), "tick", None) for k in (3, 2, 1) if g(f"cd{k}") is not None]
        if g("rv") is not None:
            ev += [(lo + g("rv"), "impact", None), (lo + g("rv") + 0.05, "shine", None)]
    elif kind == "map":
        if g("zm") is not None:
            ev.append((lo + g("zm"), "whoosh", None))
        ev += [(lo + g(k), "pop", None) for k in ("nm", "fl", "lm") if g(k) is not None]
        if g("ph") is not None and g("ph") < 900:
            ev.append((lo + g("ph"), "impact", None))
    elif kind == "cta":
        ev.append((lo + 0.3, "pop", None))
    return [(round(t, 3), k, d) for t, k, d in ev if lo - 0.3 <= t < hi]


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
    # resolve() — npx เรนเดอร์จากโฟลเดอร์โปรเจกต์ (cwd = work/hf) · path สัมพัทธ์จะไปลงในนั้นแทน
    # แล้ว out_mp4.exists() เป็นเท็จทั้งที่เรนเดอร์สำเร็จ (เจอตอนทดสอบ 23 ต.ค. ด้วย --out แบบสัมพัทธ์)
    out_mp4 = pathlib.Path(out_mp4 or (work / f"{project}.mp4")).resolve()

    segs, wav, total, timing, words, chunks = prepare(plan, work)
    scenes = [dict(s) for s in (plan.get("scenes") or [])] or scenes_from_plan(plan, segs)
    covered = sum(max(1, int(s.get("span") or 1)) for s in scenes)
    if covered != len(segs):
        raise ValueError(f"scenes คลุม {covered} บรรทัด แต่สคริปต์มี {len(segs)} บรรทัด — ต้องเท่ากัน "
                         f"(ฉากปกติ 1 บรรทัด · ฉากรูปแบบใช้ span)")

    # โปรเจกต์ต่องาน = ก๊อปเทมเพลต (ฉาก + ฟอนต์ + โลโก้) ใหม่ทุกครั้ง ไม่แตะเทมเพลตต้นฉบับ
    proj = work / "hf"
    if proj.exists():
        shutil.rmtree(proj)
    shutil.copytree(TEMPLATE, proj, ignore=shutil.ignore_patterns(
        "renders", ".hyperframes", "node_modules", "index.html", "voice.wav", ".thumbnails", "captions.html"))
    for i, sc in enumerate(scenes):
        if sc.get("items") is not None:                        # ฉากรูปแบบ: รูปต่อรายการ
            sc["items"] = [dict(it) for it in sc["items"]]
            for k, it in enumerate(sc["items"]):
                spec = it.get("img") or (f"sku:{it['sku']}" if it.get("sku") else None)
                it["img"] = resolve_image(spec, proj, f"scene-{i}-{k}")
            continue
        if sc["type"] == "cta" and sc.get("layout"):
            # ฉากปิดแบบใหม่: ไม่มีรูปปริยาย (รูปตู้กลาง machine-scene มีสติกเกอร์เบอร์เก่า) · รูปที่รับต่อจาก
            # ฉากก่อนหน้า (inherit) มาทีหลังใน write_project · ที่นี่โหลดเฉพาะรูปของฉากปิดเอง (ซองบนชั้น · รูปตู้)
            for k in ("img", "img1", "img2", "img3", "img4", "img5", "photo", "hero", "icon1",
                      "p1", "p2", "p3", "p4", "p5", "p6"):
                if isinstance(sc.get(k), str) and sc[k]:
                    sc[k] = resolve_image(sc[k], proj, f"scene-{i}-{k}")
            continue
        default = {"hook": "sku:OP 17", "pack": "sku:OP 17", "machine": "machine:hero", "cta": "machine:scene",
                   "quiz": "sku:OP 17"}
        spec = sc.get("img") or (f"sku:{sc['sku']}" if sc.get("sku") else None) or sc.get("photo") \
            or default.get(sc["type"])
        sc["img"] = resolve_image(spec, proj, f"scene-{i}")
    shutil.copyfile(wav, proj / "assets" / "voice.wav")
    # ชุดหน้าตา: แผนระบุมา (hf_director เลือกแบบเลี่ยงของที่เพิ่งใช้) หรือสุ่มตาม project · เก็บค่าจริงกลับลงแผน
    look = resolve_look(plan.get("look"), project)
    plan["look"] = look
    (work / "look.json").write_text(json.dumps(look), encoding="utf-8")
    duration = write_project(proj, scenes, timing, chunks, words, total, "assets/voice.wav", look)

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
    # ชั้นเสียง: เอฟเฟกต์ตามจังหวะเฉลย + ความดัง −14 LUFS ทุกคลิป (sound.py · 23 ต.ค. 2026)
    # ล้มเมื่อไหร่ใช้ไฟล์ที่เรนเดอร์ได้ต่อ — คลิปเสียงเดิมยังดีกว่าไม่มีคลิป
    if not plan.get("no_master"):
        raw = out_mp4.with_name(out_mp4.stem + ".raw.mp4")
        try:
            events = [] if plan.get("no_sfx") else json.loads((work / "sfx.json").read_text(encoding="utf-8"))
            track = _music_for(plan)
            shutil.move(str(out_mp4), str(raw))
            info = sound.master(raw, out_mp4, events, work, music=track)
            if track:
                _log("4/4", f"เพลงประกอบ: {pathlib.Path(track).name}")
            raw.unlink(missing_ok=True)
            _log("4/4", f"ชั้นเสียง: เอฟเฟกต์ {info['events']} จุด · ความดังเดิม {info['measured']} → "
                        f"{sound.loudness(out_mp4)} LUFS")
        except Exception as e:
            if not out_mp4.exists() and raw.exists():
                shutil.move(str(raw), str(out_mp4))
            _log("4/4", f"⚠️ ชั้นเสียงไม่สำเร็จ ({str(e)[:120]}) — ใช้ไฟล์ที่เรนเดอร์ได้")
    # ความยาวไฟล์จริง = เสียง + TAIL (ไม่ใช่ total ของเสียง — เดิมบันทึก duration_seconds ขาดไป 0.9 วิ)
    return out_mp4, duration


# รูปแบบคลิป → รูปแบบโพสต์ใน content_voice.json (คีย์ที่ tasks/video_music.json → format_mood ใช้เลือกอารมณ์เพลง)
MUSIC_FORMAT = {"rank": "ranking", "versus": "compare", "quiz": "card_deep", "map": "behind"}


def _music_for(plan):
    """เพลงประกอบที่ใช้ได้จริง — ไม่มีเพลงที่กรอกใบอนุญาตในคลัง = None (คลิปมีแค่เสียงพากย์ + เอฟเฟกต์)

    ⚠️ ห้ามรับ path เพลงจากหน้าเว็บ (route render ปฏิเสธ music อยู่แล้ว) — เลือกจากคลังที่มีใบอนุญาตเท่านั้น
    (music.py: เพลงไม่มีสิทธิ์ = คลิปโดนปิดเสียง/ถอด ย้อนแก้ไม่ได้)
    """
    if plan.get("no_music"):
        return None
    try:
        from . import music
        p = music.pick_for(MUSIC_FORMAT.get(plan.get("format") or "", "ranking"))
        if p:
            path = pathlib.Path(p)
            path = path if path.is_absolute() else config.REPO / "deploy" / path
            return str(path) if path.exists() else None
    except Exception as e:
        _log("4/4", f"⚠️ เลือกเพลงไม่สำเร็จ ({str(e)[:80]}) — ไม่ใส่เพลง")
    return None


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
