"""ตัวทดสอบฉากเดี่ยวของ HyperFrames — ประกอบโปรเจกต์จิ๋ว (ฉากเดียว + ซับตัวอย่าง) แล้ว check + snapshot ไม่ต้องอัดเสียง

ทำไมมีไฟล์นี้ (16 ต.ค. 2026):
    ออกแบบฉากใหม่ (เช่น ฉากปิดหลายแบบ — เจ้าของบอก "ฉากปิดซ้ำกันทุกคลิป") ถ้าต้องเรนเดอร์ทั้งคลิปทุกครั้ง
    เสียเวลา TTS + whisper + เรนเดอร์ ~1.5 นาทีต่อรอบ และฉากที่อยากดูอยู่แค่ 3 วิสุดท้าย
    ตัวนี้วางฉากเดียวเต็มเวลา ใส่ซับตัวอย่างตำแหน่งจริง (ดูว่าทับกันไหม) แล้วถ่ายภาพตามวินาทีที่ขอ

รัน (จาก deploy/):
    ../.venv-image/Scripts/python.exe -m agents.video.hf_scene_dev scene-cta --vars '{"title":"…"}' --dur 4 --at 0.3,1,2.5
    · ชื่อแรก = ชื่อไฟล์ใน compositions/ (ไม่ต้องลงทะเบียนใน SCENE_FILES ก่อน)
    · --vars เป็น JSON (หรือ @ไฟล์.json) · รูปใส่ "sku:OP 17" / "assets/…" / "file:…" ได้ (resolve_image)
    · --look '{"bg":"dots","cut":"wipe","ts":"neon","hot":"orange"}' · --cap "ข้อความซับตัวอย่าง" (ว่าง = ไม่มีซับ)
ผลลัพธ์: .video-work/scene-dev-<ชื่อ>/hf (เปิด Studio ต่อได้) + ภาพ snapshot + สรุปผล check
"""
import argparse
import html
import json
import pathlib
import shutil
import sys

from . import config
from .hf_render import HOT, TEMPLATE, _npx, resolve_image, resolve_look

IMG_KEYS = ("img", "img1", "img2", "img3", "img4", "img5", "photo", "hero", "icon1", "p1", "p2", "p3", "p4", "p5", "p6")


def build(name, values, dur=4.0, look=None, cap="", tag="dev"):
    work = config.work_dir(f"scene-dev-{name}-{tag}")
    proj = work / "hf"
    if proj.exists():
        shutil.rmtree(proj)
    shutil.copytree(TEMPLATE, proj, ignore=shutil.ignore_patterns(
        "renders", ".hyperframes", "node_modules", "index.html", "voice.wav", ".thumbnails", "captions.html"))
    if not (proj / "compositions" / f"{name}.html").exists():
        raise SystemExit(f"ไม่พบ compositions/{name}.html")
    vals = dict(values)
    for k in IMG_KEYS:                                        # รูปจากสเปก → ไฟล์ในโปรเจกต์ (เหมือนตอนเรนเดอร์จริง)
        if isinstance(vals.get(k), str) and vals[k] and not vals[k].startswith("assets/"):
            vals[k] = resolve_image(vals[k], proj, f"dev-{k}")
    look = resolve_look(look, name)
    vv = html.escape(json.dumps(vals, ensure_ascii=False), quote=True)
    slot = (f'      <div id="slot-0" class="scene-slot ts-{look["ts"]}" style="--hot: {HOT[look["hot"]]}" '
            f'data-composition-id="{name}" data-composition-src="compositions/{name}.html" data-start="0" '
            f'data-duration="{dur}" data-track-index="1" data-width="1080" data-height="1920" '
            f'data-variable-values="{vv}"></div>')
    caps = ""
    if cap:
        caps = (f'        <div id="cap-1" class="clip cap" data-start="0.3" data-duration="{round(dur - 0.3, 3)}" '
                f'data-track-index="0"><span class="cap-text">{html.escape(cap)}</span></div>')
    cap_tpl = (TEMPLATE / "scaffold" / "captions.template.html").read_text(encoding="utf-8")
    (proj / "compositions" / "captions.html").write_text(cap_tpl.replace("{{CAPTIONS}}", caps), encoding="utf-8")
    host = (TEMPLATE / "scaffold" / "host.template.html").read_text(encoding="utf-8")
    out = (host.replace("{{DURATION}}", str(dur))
               .replace("{{BG}}", look["bg"])
               .replace("{{CUT}}", look["cut"])
               .replace("{{CUTS}}", "[0.0]")
               .replace("{{SOFT}}", "[]")
               .replace("{{LOGO_UNTIL}}", "0.04")               # ฉากปิดจริงไม่มีโลโก้มุม — ให้โผล่แค่เฟรมแรก
               .replace("{{SCENES}}", slot)
               .replace("{{CAPTIONS_SLOT}}", f'      <div id="captions-slot" style="--hot: {HOT[look["hot"]]}" '
                        f'data-composition-id="captions" data-composition-src="compositions/captions.html" '
                        f'data-start="0" data-duration="{dur}" data-track-index="7" data-track-kind="captions" '
                        f'data-width="1080" data-height="1920"></div>')
               .replace("{{AUDIO}}", ""))
    (proj / "index.html").write_text(out, encoding="utf-8")
    return proj, look


def main():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="ทดสอบฉากเดี่ยว HyperFrames (check + snapshot)")
    ap.add_argument("name", help="ชื่อไฟล์ใน compositions/ ไม่ต้องมี .html")
    ap.add_argument("--vars", default="{}", help="JSON หรือ @path.json")
    ap.add_argument("--dur", type=float, default=4.0)
    ap.add_argument("--at", default="0.3,1.0,2.0,3.5")
    ap.add_argument("--look", default=None, help="JSON ชุดหน้าตา (ว่าง = สุ่มตามชื่อ)")
    ap.add_argument("--cap", default="ซับตัวอย่างตรงตำแหน่งจริง")
    ap.add_argument("--tag", default="dev", help="ชื่อกำกับโฟลเดอร์ (ทดสอบหลายชุดค่าพร้อมกัน)")
    ap.add_argument("--no-check", action="store_true")
    a = ap.parse_args()
    raw = a.vars[1:] if a.vars.startswith("@") else None
    values = json.loads(pathlib.Path(raw).read_text(encoding="utf-8") if raw else a.vars)
    look = json.loads(a.look) if a.look else None
    proj, look = build(a.name, values, a.dur, look, a.cap, a.tag)
    print(f"โปรเจกต์: {proj} · หน้าตา {look}")
    if not a.no_check:
        code, log = _npx(["check", "."], proj, timeout=600)
        tail = [ln for ln in log.splitlines() if ln.strip()]
        print("\n".join(tail[-14:]))
        print("check:", "ผ่าน" if code == 0 else f"ไม่ผ่าน (exit {code})")
    snap = proj.parent / "snap"
    if snap.exists():
        shutil.rmtree(snap)
    code, log = _npx(["snapshot", ".", "--at", a.at, "--no-end", "--describe", "false", "-o", str(snap)], proj, timeout=600)
    pngs = sorted(snap.glob("*.png"))
    print("snapshot:", "ได้ " + str(len(pngs)) + " ภาพ" if pngs else "ไม่ได้ภาพ\n" + log[-1200:])
    for p in pngs:
        print("  ", p)


if __name__ == "__main__":
    main()
