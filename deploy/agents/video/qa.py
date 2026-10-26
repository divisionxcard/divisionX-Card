"""ด่านตรวจหลังเรนเดอร์ — "เรนเดอร์เสร็จ ≠ งานเสร็จ" (26 ต.ค. 2026)

ทำไมมีไฟล์นี้:
    เจ้าของส่งคลิป "ระบบทำวีดีโอ" (Uncle AI Engineer · OpenMontage) มาให้ถอดแนวคิด แล้วเลือกนำมาใช้ 2 ข้อ —
    ข้อนี้คือ "Render ≠ Done: ระบบตรวจไฟล์ ภาพ เสียง ซับ และสิ่งที่สัญญาไว้ในบรีฟ ก่อนบอกว่าเสร็จ"
    เดิม publish.py เรนเดอร์เสร็จ = ปิดงาน done + ผูกเข้าคอนเทนต์ทันที ปัญหาที่เคยหลุดไปถึงตาเจ้าของ:
      · โลโก้หายตอนเรนเดอร์จริง ทั้งที่ snapshot/พรีวิวเห็นปกติ (23 ต.ค.)
      · คลิปพื้นหลังไม่มีเสียงแต่ติดป้าย data-has-audio → ทั้งงานล้ม (23 ต.ค.)
      · ฉากปิดยังเขียน "เช็กหน้าตู้" (23 ต.ค.)
    ทุกเรื่องต้องเปิดดูคลิปเองถึงเจอ

ตรวจอะไร (ทุกข้อคืน pass · warn · fail · skip พร้อมเหตุผลภาษาไทย):
    ไฟล์      ffprobe — มีภาพ+เสียง · 1080×1920 · ~30 fps · ยาวตรงที่คาด
    ภาพ       เฟรมทุก 0.5 วิ — ช่วงจอดำ/จอเรียบ (ภาพหาย) · เฟรมแรก (Facebook ใช้เป็นภาพปก)
    โลโก้     เทียบรูปโลโก้จริงกับเฟรมตรงตำแหน่งที่วาง (มุมขวาบนของ HyperFrames · ของทับในห้องตัดต่อ)
    เสียง     ebur128 — ความดังรวม −14 LUFS · ยอดไม่เกิน −1 dBTP · ช่วงเงียบยาว
    ซับ       captions.json ที่ prepare() เขียนไว้ — มีซับ · เวลาไม่เกินคลิป · จับเวลารายคำได้จริง (ไม่ใช่แบ่งตามตัวอักษร)
    ตามบรีฟ   ข้อความในแผน — ไม่มี "เช็กหน้าตู้" · ไม่มีเบอร์เก่า · ไม่มียอดขาย/% · มีฉากปิด · ยาวไม่เกิน 90 วิ

ผล: fail อย่างน้อย 1 ข้อ = ไม่ผ่าน (publish.py ไม่ผูกคลิปเข้าคอนเทนต์) · warn = ผ่านแต่ให้คนดู
และทำ "ภาพรวมเฟรม" 12 ช่องต่อคลิป 1 แผ่น ให้คนดูทั้งคลิปได้ในภาพเดียว

ใช้แค่ ffmpeg + Pillow (เครื่องเรนเดอร์บน GitHub มีอยู่แล้ว) · ตรวจไม่ได้ข้อไหน = skip ไม่ทำให้งานล้ม

    python -m agents.video.qa คลิป.mp4 --plan แผน.json [--expected 26.0] [--work .video-work/x] [--sheet out.jpg]
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import math
import pathlib
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageStat

from . import config

LOGO = config.REPO / "hyperframes" / "templates" / "dvx-promo" / "assets" / "brand" / "logo-white.png"
# host.template.html → #corner-logo { right: 44px; top: 54px; width: 150px; height: 128px; object-fit: contain }
CORNER_BOX = (1080 - 44 - 150, 54, 150, 128)
OLD_PHONE = re.compile(r"086[\s-]?386[\s-]?3219")
# ยอดขาย/เปอร์เซ็นต์ — ห้ามขึ้นคอนเทนต์ (กฎเจ้าของ) · "3 ซอง" ทั่วไปไม่นับ ดูเฉพาะคำที่บอกว่าเป็นยอด
SALES = re.compile(r"\d[\d,.]*\s*(?:%|เปอร์เซ็นต์)|(?:ยอดขาย|ขายได้|ขายไป)\s*\d[\d,.]*")
MAX_SECONDS = 90             # Reels บน Facebook ยาวสุด 90 วิ
SKIP_KEYS = {"img", "sku", "photo", "hero", "src", "local", "icon1", "bg_image", "bg_video", "scene", "seed", "url",
             "p1", "p2", "p3", "p4", "p5", "p6", "img1", "img2", "img3", "img4", "img5", "model", "query", "page"}


def _run(args, timeout=300, binary=False):
    out = subprocess.run(args, capture_output=True, timeout=timeout)
    if binary:
        return out.returncode, out.stdout, out.stderr.decode("utf-8", "replace")
    return out.returncode, out.stdout.decode("utf-8", "replace"), out.stderr.decode("utf-8", "replace")


def _check(cid, label, status, detail):
    return {"id": cid, "label": label, "status": status, "detail": detail}


def script_sha(script):
    """ผูก captions.json กับสคริปต์ที่ใช้ — ไฟล์ค้างจากรอบก่อนของ project เดิมต้องไม่ถูกนำมาตรวจ"""
    return hashlib.sha1((script or "").encode("utf-8")).hexdigest()[:16]


# ── ไฟล์ ─────────────────────────────────────────────────────────────────
def probe(mp4):
    code, out, err = _run([config.ffmpeg_bin("ffprobe"), "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", str(mp4)], timeout=60)
    if code != 0:
        raise RuntimeError(f"ffprobe อ่านไฟล์ไม่ได้: {err.strip()[:200]}")
    return json.loads(out)


def check_file(info, expected, need_audio):
    checks = []
    streams = info.get("streams") or []
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    dur = float((info.get("format") or {}).get("duration") or 0)
    if not v:
        return [_check("file", "ไฟล์", "fail", "ไม่มีภาพในไฟล์")], dur, True
    w, h = int(v.get("width") or 0), int(v.get("height") or 0)
    num, _, den = str(v.get("r_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0
    bits = [f"{w}×{h}", f"{fps:.0f} fps", f"ยาว {dur:.1f} วิ", "มีเสียง" if a else "ไม่มีเสียง"]
    status, why = "pass", []
    if dur < 1:
        status = "fail"; why.append("คลิปสั้นผิดปกติ")
    if (w, h) != (config.W, config.H):
        status = "fail" if w > h else max(status, "warn", key=_rank)
        why.append(f"ขนาดไม่ใช่ {config.W}×{config.H}")
    if abs(fps - config.FPS) > 1:
        status = max(status, "warn", key=_rank); why.append(f"fps ไม่ใช่ {config.FPS}")
    if not a:
        status = max(status, "fail" if need_audio else "warn", key=_rank); why.append("ไม่มีแทร็กเสียง")
    if expected and abs(dur - expected) > 1.0:
        status = max(status, "warn", key=_rank); why.append(f"ยาวต่างจากที่คาด {expected:.1f} วิ")
    checks.append(_check("file", "ไฟล์", status, " · ".join(bits) + (f" — {' · '.join(why)}" if why else "")))
    return checks, dur, dur < 1


_RANK = {"skip": 0, "pass": 1, "warn": 2, "fail": 3}


def _rank(s):
    return _RANK.get(s, 0)


# ── ภาพ ──────────────────────────────────────────────────────────────────
def frame(mp4, t):
    """เฟรมเต็มขนาดที่วินาที t (seek ก่อน -i = เร็ว · ffmpeg ถอดถึงเฟรมจริงให้เอง)"""
    code, out, err = _run([config.ffmpeg_bin(), "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(mp4),
                           "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], timeout=60, binary=True)
    if code != 0 or not out:
        raise RuntimeError(f"ดึงเฟรมที่ {t:.1f} วิ ไม่ได้: {err.strip()[:120]}")
    return Image.open(io.BytesIO(out)).convert("RGB")


def check_frames(mp4, dur, step=0.5):
    """จอดำ/จอเรียบ (ภาพหาย) — ดูความต่างของแสงในเฟรมย่อ 54×96 ทุก 0.5 วิ"""
    w, h = 54, 96
    code, out, err = _run([config.ffmpeg_bin(), "-v", "error", "-i", str(mp4),
                           "-vf", f"fps={1 / step},scale={w}:{h},format=gray", "-f", "rawvideo", "-"],
                          timeout=300, binary=True)
    n = len(out) // (w * h)
    if code != 0 or n == 0:
        return [_check("frames", "ภาพ", "skip", f"อ่านเฟรมไม่ได้ ({err.strip()[:80]})")]
    flat = []
    for i in range(n):
        st = ImageStat.Stat(Image.frombytes("L", (w, h), out[i * w * h:(i + 1) * w * h]))
        flat.append(st.stddev[0] < 3.0)            # ภาพจริงแทบทุกเฟรมต่างกันเกิน 10 · จอดำ/สีเดียว ≈ 0
    runs, cur = [], None
    for i, f in enumerate(flat + [False]):
        if f and cur is None:
            cur = i
        elif not f and cur is not None:
            runs.append((cur * step, i * step)); cur = None
    total = sum(b - a for a, b in runs)
    long = [(a, b) for a, b in runs if b - a >= 1.0]
    where = ", ".join(f"{a:.1f}–{b:.1f} วิ" for a, b in long[:4])
    if total > dur * 0.3:
        return [_check("frames", "ภาพ", "fail", f"จอดำ/ภาพหาย {total:.1f} วิ จาก {dur:.1f} วิ ({where})")]
    if long:
        return [_check("frames", "ภาพ", "warn", f"มีช่วงจอดำ/ภาพเรียบ {where}")]
    if flat and flat[0]:
        return [_check("frames", "ภาพ", "warn", "เฟรมแรกเป็นจอเรียบ — ภาพปกบน Facebook จะว่าง")]
    return [_check("frames", "ภาพ", "pass", f"ตรวจ {n} เฟรม ไม่มีจอดำหรือภาพหาย")]


def _pearson(xs, ys):
    n = len(xs)
    if n < 10:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else 0.0


def logo_score(img, box):
    """ความเหมือนระหว่างรูปร่างโลโก้ (alpha) กับความสว่างของเฟรมในกรอบ — โลโก้ขาวอยู่จริง ≈ 0.5–0.9 · ไม่มี ≈ 0"""
    logo = Image.open(LOGO).convert("RGBA")
    bx, by, bw, bh = box
    s = min(bw / logo.width, bh / logo.height)            # object-fit: contain + จัดกลางกรอบ
    lw, lh = max(1, round(logo.width * s)), max(1, round(logo.height * s))
    x0, y0 = round(bx + (bw - lw) / 2), round(by + (bh - lh) / 2)
    alpha = logo.resize((lw, lh), Image.LANCZOS).getchannel("A")
    crop = img.crop((x0, y0, x0 + lw, y0 + lh)).convert("L")
    # ย่อให้เร็ว (คำนวณด้วย python ล้วน) — รูปร่างโลโก้ยังชัดที่ ~60 px
    k = max(1, round(max(lw, lh) / 60))
    size = (max(1, lw // k), max(1, lh // k))
    return _pearson(list(alpha.resize(size).getdata()), list(crop.resize(size).getdata()))


def logo_targets(plan, dur):
    """[(กรอบ, [เวลาที่ควรเห็น], ชื่อ)] — HyperFrames มุมขวาบนจนก่อนฉากปิด · ห้องตัดต่อตามของทับชนิด logo"""
    eng = (plan.get("engine") or "classic").lower()
    if eng == "hyperframes":
        return [(CORNER_BOX, [min(1.2, dur * 0.2), max(0.5, min(dur * 0.35, dur - 6))], "โลโก้มุมขวาบน")]
    if eng == "timeline":
        logo = Image.open(LOGO)
        out = []
        for o in (plan.get("timeline") or {}).get("overlays") or []:
            if o.get("type") != "logo":
                continue
            w = float(o.get("w") or 0.14) * config.W
            h = w * logo.height / logo.width
            cx, cy = float(o.get("x") or 0.5) * config.W, float(o.get("y") or 0.5) * config.H
            start = float(o.get("start") or 0)
            end = float(o.get("end") or -1)
            end = dur if end < 0 else min(end, dur)
            t = min(start + 0.8, (start + end) / 2)       # พ้นจังหวะโผล่ (pop) แล้ว
            out.append(((round(cx - w / 2), round(cy - h / 2), round(w), round(h)), [t], "โลโก้ (ของทับ)"))
        return out
    return []


def check_logo(mp4, plan, dur):
    targets = logo_targets(plan, dur)
    if not targets:
        return [_check("logo", "โลโก้", "skip", "แผนนี้ไม่ได้วางโลโก้ที่ตรวจตำแหน่งได้")]
    worst, notes = "pass", []
    for box, times, name in targets:
        try:
            best = max(logo_score(frame(mp4, t), box) for t in times)
        except Exception as e:
            notes.append(f"{name}: ตรวจไม่ได้ ({str(e)[:60]})")
            worst = max(worst, "skip", key=_rank) if worst == "pass" else worst
            continue
        st = "pass" if best >= 0.3 else "warn" if best >= 0.15 else "fail"
        worst = max(worst, st, key=_rank)
        notes.append(f"{name}: {'เห็นชัด' if st == 'pass' else 'จาง/ไม่ชัด' if st == 'warn' else 'ไม่พบ'} "
                     f"(คะแนน {best:.2f})")
    return [_check("logo", "โลโก้", worst, " · ".join(notes))]


def contact_sheet(mp4, dur, out, cols=4, rows=3):
    """ภาพรวมเฟรม 12 ช่อง เรียงตามเวลา — คนดูทั้งคลิปได้ในภาพเดียว (แทนการเปิดคลิปทุกตัว)"""
    cw, ch = 270, 480
    sheet = Image.new("RGB", (cols * cw, rows * ch), (3, 16, 42))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(str(config.FONT_DIR / "Kanit-ExtraBold.ttf"), 22)
    except Exception:
        font = ImageFont.load_default()
    n = cols * rows
    for i in range(n):
        t = (i + 0.5) * dur / n
        try:
            im = frame(mp4, t).resize((cw, ch), Image.LANCZOS)
        except Exception:
            continue
        x, y = (i % cols) * cw, (i // cols) * ch
        sheet.paste(im, (x, y))
        label = f"{int(t // 60)}:{t % 60:04.1f}"
        draw.rectangle((x, y, x + 78, y + 30), fill=(0, 0, 0))
        draw.text((x + 6, y + 2), label, fill=(255, 214, 0), font=font)
    out = pathlib.Path(out)
    sheet.save(out, quality=80, optimize=True)
    return out


# ── เสียง ────────────────────────────────────────────────────────────────
def check_audio(mp4, plan, dur, has_audio):
    if not has_audio:
        return [_check("audio", "เสียง", "skip", "ไม่มีแทร็กเสียง")]
    code, out, err = _run([config.ffmpeg_bin(), "-nostats", "-i", str(mp4), "-af", "ebur128=peak=true",
                           "-f", "null", "-"], timeout=300)
    integ = re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", err)
    peak = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", err)
    lufs = float(integ[-1]) if integ and integ[-1] != "-inf" else None
    tp = float(peak[-1]) if peak and peak[-1] != "-inf" else None
    code, _, err2 = _run([config.ffmpeg_bin(), "-nostats", "-i", str(mp4), "-af",
                          "silencedetect=noise=-45dB:d=2", "-f", "null", "-"], timeout=300)
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", err2)]
    ends = [float(x) for x in re.findall(r"silence_end: (-?[\d.]+)", err2)]
    gaps = [(s, ends[i] if i < len(ends) else dur) for i, s in enumerate(starts)]
    # ท้ายคลิปเงียบได้ (ฉากปิดค้างหลังเสียงจบ) — นับเฉพาะช่วงที่เริ่มก่อน 2.5 วิสุดท้าย
    gaps = [(s, e) for s, e in gaps if s < dur - 2.5]
    if lufs is None or lufs < -45:
        return [_check("audio", "เสียง", "fail", "แทร็กเสียงเงียบทั้งคลิป")]
    bits = [f"ความดัง {lufs:.1f} LUFS", f"ยอด {tp:.1f} dBTP" if tp is not None else "ยอด ?"]
    status, why = "pass", []
    if not plan.get("no_master"):
        if abs(lufs + 14) > 1.5:
            status = "warn"; why.append("ไม่ใช่ −14 LUFS (ดังเบาไม่เท่าคลิปอื่น)")
        if tp is not None and tp > -1.0:
            status = "warn"; why.append("ยอดเสียงเกิน −1 dBTP (อาจแตกบนมือถือ)")
    if gaps:
        status = max(status, "warn", key=_rank)
        why.append("เงียบยาว " + ", ".join(f"{s:.1f}–{e:.1f} วิ" for s, e in gaps[:3]))
    return [_check("audio", "เสียง", status, " · ".join(bits) + (f" — {' · '.join(why)}" if why else ""))]


# ── ซับ ──────────────────────────────────────────────────────────────────
def check_captions(plan, work, dur):
    if not work:
        return [_check("captions", "ซับ", "skip", "ไม่ได้ระบุโฟลเดอร์งาน")]
    f = pathlib.Path(work) / "captions.json"
    if (plan.get("engine") or "").lower() == "timeline" and not (plan.get("timeline") or {}).get("voice"):
        return [_check("captions", "ซับ", "skip", "ห้องตัดต่อไม่มีเสียงพากย์ — ไม่มีซับจากเสียง")]
    try:
        d = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return [_check("captions", "ซับ", "skip", "ไม่มีข้อมูลซับของรอบนี้ (เครื่องประกอบแบบเดิม)")]
    # ห้องตัดต่อ: เสียงพากย์อยู่ใน timeline.voice.script (ช่อง script ของแผนเป็นข้อความแทนที่)
    voice = (plan.get("timeline") or {}).get("voice") or {}
    script = voice.get("script") if (plan.get("engine") or "").lower() == "timeline" else plan.get("script")
    if d.get("script_sha") != script_sha(script):
        return [_check("captions", "ซับ", "skip", "ข้อมูลซับเป็นของสคริปต์อื่น (ค้างจากรอบก่อน)")]
    chunks = d.get("chunks") or []
    if not chunks:
        return [_check("captions", "ซับ", "fail", "ไม่มีซับเลยทั้งที่มีเสียงพากย์")]
    status, why = "pass", []
    last = max(float(c.get("end") or 0) for c in chunks)
    if last > dur + 0.05:
        status = "fail"; why.append(f"ซับใบท้ายจบที่ {last:.1f} วิ เลยความยาวคลิป {dur:.1f} วิ")
    flash = [c for c in chunks if float(c["end"]) - float(c["start"]) < 0.3]
    if flash:
        status = max(status, "warn", key=_rank)
        why.append(f"ซับแวบเร็วเกินอ่าน {len(flash)} ใบ (เช่น \"{flash[0]['text'][:16]}\")")
    if not d.get("aligned"):
        status = max(status, "warn", key=_rank)
        why.append("จับเวลารายคำไม่ได้ — ซับแบ่งเวลาตามตัวอักษร อาจไม่ตรงเสียง")
    lines = len({c.get("segment") for c in chunks})
    return [_check("captions", "ซับ", status, f"{len(chunks)} ใบ · {lines} บรรทัด" +
                   (f" — {' · '.join(why)}" if why else " · จับเวลาตามเสียงจริง"))]


# ── ตามบรีฟ ──────────────────────────────────────────────────────────────
def _texts(node, key=None):
    if isinstance(node, str):
        if key in SKIP_KEYS or re.match(r"^(https?:|sku:|machine:|file:|assets/|flux:)", node):
            return []
        return [node]
    if isinstance(node, dict):
        return [t for k, v in node.items() for t in _texts(v, k)]
    if isinstance(node, list):
        return [t for v in node for t in _texts(v, key)]
    return []


def check_brief(plan, dur):
    eng = (plan.get("engine") or "classic").lower()
    texts = _texts({"script": plan.get("script"), "headline": plan.get("headline"),
                    "scenes": plan.get("scenes"), "cta": plan.get("cta"),
                    "overlays": (plan.get("timeline") or {}).get("overlays")})
    blob = "\n".join(texts)
    status, why, ok = "pass", [], []
    # "ของแท้ 100%" = ข้อเท็จจริงของร้าน (ป้ายความน่าเชื่อถือ) ไม่ใช่ตัวเลขยอดขาย — ไม่นับ
    sales_blob = re.sub(r"แท้\s*100\s*(%|เปอร์เซ็นต์)", "แท้", blob)
    if "เช็กหน้าตู้" in blob or "เช็คหน้าตู้" in blob:
        status = "warn"; why.append("มีคำว่า \"เช็กหน้าตู้\" (ต้องเป็น \"เช็กหน้าเว็บ\")")
    if OLD_PHONE.search(blob):
        status = "fail"; why.append("มีเบอร์เก่า 086-386-3219 (เบอร์ร้าน 093-073-7930)")
    m = SALES.search(sales_blob)
    if m:
        status = max(status, "warn", key=_rank); why.append(f"มีตัวเลขยอดขาย/% \"{m.group(0)}\"")
    if eng == "hyperframes":
        sc = plan.get("scenes") or []
        if sc and (sc[-1].get("type") != "cta"):
            status = max(status, "warn", key=_rank); why.append("ไม่มีฉากปิดชวนเช็กหน้าเว็บ")
        elif sc:
            ok.append("มีฉากปิด")
    if dur > MAX_SECONDS:
        status = max(status, "warn", key=_rank); why.append(f"ยาว {dur:.0f} วิ เกิน {MAX_SECONDS} วิ (Reels บน Facebook)")
    ok.append(f"ตรวจข้อความ {len(texts)} ชิ้น")
    return [_check("brief", "ตามบรีฟ", status, " · ".join(why) if why else " · ".join(ok))]


# ── รวม ──────────────────────────────────────────────────────────────────
def run(mp4, plan, expected=None, work=None, sheet=None):
    """ตรวจคลิปหนึ่งตัว → {"level", "ok", "checks": [...], "duration", "sheet"} · ห้าม raise (ตรวจไม่ได้ = skip)"""
    mp4 = pathlib.Path(mp4)
    eng = (plan.get("engine") or "classic").lower()
    need_audio = eng != "timeline" or bool((plan.get("timeline") or {}).get("voice"))
    checks, dur, has_audio, broken = [], float(expected or 0), True, False
    try:
        info = probe(mp4)
        c, dur, broken = check_file(info, expected, need_audio)
        checks += c
        has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams") or [])
    except Exception as e:
        checks.append(_check("file", "ไฟล์", "fail", f"อ่านไฟล์ไม่ได้: {str(e)[:160]}"))
        broken = True
    steps = [("frames", "ภาพ", lambda: check_frames(mp4, dur)),
             ("logo", "โลโก้", lambda: check_logo(mp4, plan, dur)),
             ("audio", "เสียง", lambda: check_audio(mp4, plan, dur, has_audio)),
             ("captions", "ซับ", lambda: check_captions(plan, work, dur)),
             ("brief", "ตามบรีฟ", lambda: check_brief(plan, dur))]
    for cid, label, fn in steps:
        if broken and cid in ("frames", "logo", "audio"):
            checks.append(_check(cid, label, "skip", "ไฟล์เสีย — ไม่ได้ตรวจต่อ"))
            continue
        try:
            checks += fn()
        except Exception as e:
            checks.append(_check(cid, label, "skip", f"ตรวจไม่สำเร็จ: {str(e)[:120]}"))
    sheet_path = None
    if sheet and not broken:
        try:
            sheet_path = str(contact_sheet(mp4, dur, sheet))
        except Exception as e:
            print(f"[qa] ทำภาพรวมเฟรมไม่สำเร็จ: {str(e)[:120]}", file=sys.stderr)
    level = max((c["status"] for c in checks), key=_rank, default="skip")
    level = "pass" if level == "skip" else level
    return {"version": 1, "level": level, "ok": level != "fail", "duration": round(dur, 2),
            "checks": checks, "sheet": sheet_path,
            "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}


def summary(report):
    """บรรทัดเดียวสำหรับ log / ข้อความแจ้ง"""
    icon = {"pass": "✅", "warn": "⚠️", "fail": "❌", "skip": "·"}
    return " · ".join(f"{icon[c['status']]} {c['label']}" for c in report["checks"])


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="ด่านตรวจหลังเรนเดอร์")
    ap.add_argument("mp4")
    ap.add_argument("--plan", help="ไฟล์แผน (json) · ไม่ใส่ = ตรวจเฉพาะไฟล์/ภาพ/เสียง")
    ap.add_argument("--expected", type=float, help="ความยาวที่คาด (วินาที)")
    ap.add_argument("--work", help="โฟลเดอร์งาน (มี captions.json)")
    ap.add_argument("--sheet", help="ที่เก็บภาพรวมเฟรม (.jpg)")
    a = ap.parse_args(argv)
    plan = json.loads(pathlib.Path(a.plan).read_text(encoding="utf-8")) if a.plan else {}
    r = run(a.mp4, plan, expected=a.expected, work=a.work, sheet=a.sheet)
    print(json.dumps(r, ensure_ascii=False, indent=1))
    print(summary(r))
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
