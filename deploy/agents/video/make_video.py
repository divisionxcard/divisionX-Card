"""ตัวสั่งงานหลักของโรงงานวิดีโอ — สคริปต์ข้อความ → ไฟล์ mp4 พร้อมโพสต์

รัน:
    py deploy/agents/video/make_video.py --plan แผน.json
    py deploy/agents/video/make_video.py --script สคริปต์.txt --project ทดลอง

รูปแบบไฟล์แผน (JSON) — ตั้งใจให้เป็นสิ่งเดียวกับที่หน้าเว็บจะ POST มาในอนาคต
จะได้ไม่ต้องเขียนตรรกะซ้ำสองที่:

    {
      "project":  "op17-intro",
      "script":   "บรรทัดแรก\\nบรรทัดสอง\\n...",     ← 1 บรรทัด = 1 ฉาก
      "visuals":  ["machine:hero", "flux:...", "sku:OP 17", ...],
      "headline": "ข้อความค้างบนจอช่วงต้น",
      "voice":    "Aoede",
      "style":    "brand",
      "music":    null,
      "xfade":    0.35
    }

ทุกขั้นมีแคช — แก้ภาพอย่างเดียวไม่ต้องจ่าย TTS ใหม่ แก้ซับไม่ต้องถอดเสียงใหม่
"""
import argparse
import json
import pathlib
import sys
import time

if __package__ in (None, ""):                       # ให้รันตรง ๆ ได้ด้วย
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
    __package__ = "agents.video"

from . import align, compose, config, segments, subtitle, visuals   # noqa: E402


def _log(step, msg):
    print(f"[{step}] {msg}", flush=True)


def build_video(plan, out_mp4=None, skip_align=False):
    project = plan.get("project") or "clip"
    work = config.work_dir(project)
    out_mp4 = pathlib.Path(out_mp4 or (work / f"{project}.mp4"))

    # ── 1. สคริปต์ → ฉาก ──
    segs = segments.split_script(plan["script"])
    if not segs:
        raise ValueError("สคริปต์ว่าง — ต้องมีอย่างน้อยหนึ่งบรรทัด")
    _log("1/6", f"แบ่งได้ {len(segs)} ฉาก")

    # ── 2. เสียงพากย์ ──
    t0 = time.time()
    wav = work / "voice.wav"
    from . import voice as voice_mod
    voice_mod.synth(segments.speech_text(segs), wav,
                    voice=plan.get("voice"), model=plan.get("tts_model"))
    total = voice_mod.duration(wav)
    _log("2/6", f"เสียงพากย์ {total:.1f} วินาที ({time.time()-t0:.0f} วิ)")

    # ── 3. จับเวลาแต่ละบรรทัด ──
    t0 = time.time()
    if skip_align:
        timing = align._even(segs, total)
        _log("3/6", "ข้ามการจับเวลา — แบ่งตามสัดส่วนตัวอักษรแทน")
    else:
        try:
            words = align.word_times(wav, model_size=plan.get("whisper", "large-v3-turbo"))
            timing = align.map_segments(segs, words, total)
            _log("3/6", f"จับเวลาจากเสียงจริง {len(words)} คำ ({time.time()-t0:.0f} วิ)")
        except Exception as e:
            timing = align._even(segs, total)
            _log("3/6", f"⚠️ จับเวลาไม่สำเร็จ ({str(e)[:80]}) — ใช้การแบ่งตามตัวอักษรแทน")

    # ── 4. ภาพ ──
    t0 = time.time()
    specs = list(plan.get("visuals") or [])
    if len(specs) < len(segs):                       # ไม่ได้ระบุครบ — วนใช้ซ้ำ
        fallback = specs or ["machine:hero", "machine:scene"]
        while len(specs) < len(segs):
            specs.append(fallback[len(specs) % len(fallback)])
    frames = visuals.prepare(specs[:len(segs)], work)
    _log("4/6", f"เตรียมภาพ {len(frames)} ใบ ({time.time()-t0:.0f} วิ)")

    # ── 5. ซับไทย ──
    t0 = time.time()
    chunks = align.subtitle_chunks(segs, timing,
                                   max_chars=int(plan.get("sub_chars", 28)))
    subtitle.render_many(chunks, work / "subs", style=plan.get("style", "brand"),
                         size=int(plan.get("sub_size", 64)))
    head_png = None
    if plan.get("headline"):
        head_png = subtitle.render_headline(plan["headline"], work / "headline.png",
                                            style=plan.get("style", "brand"))
    _log("5/6", f"ซับ {len(chunks)} ชิ้น ({time.time()-t0:.0f} วิ)")

    # ── 6. ประกอบ ──
    t0 = time.time()
    xfade = float(plan.get("xfade", config.XFADE))
    clips_dir = work / "clips"
    clips_dir.mkdir(exist_ok=True)
    clips = []
    for i, (fr, t) in enumerate(zip(frames, timing)):
        dur = t["end"] - t["start"]
        if i < len(frames) - 1:
            dur += xfade                    # ชดเชยส่วนที่ถูก xfade กินไป
        clips.append(compose.render_scene(fr, max(0.5, dur),
                                          clips_dir / f"scene_{i:03d}.mp4"))
    compose.build(clips, timing, chunks, wav, out_mp4,
                  music=plan.get("music"), headline=head_png,
                  headline_seconds=float(plan.get("headline_seconds", 3.0)),
                  xfade=xfade)
    _log("6/6", f"ประกอบเสร็จ ({time.time()-t0:.0f} วิ)")

    (work / "timing.json").write_text(
        json.dumps({"segments": segs, "timing": timing, "subtitles":
                    [{k: v for k, v in c.items() if k != "png"} for c in chunks]},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    return out_mp4, total


def main():
    ap = argparse.ArgumentParser(description="สร้างวิดีโอสั้นจากสคริปต์ข้อความ")
    ap.add_argument("--plan", help="ไฟล์ JSON ตามรูปแบบด้านบน")
    ap.add_argument("--script", help="ไฟล์สคริปต์ข้อความ (1 บรรทัด = 1 ฉาก)")
    ap.add_argument("--project", default="clip", help="ชื่อโฟลเดอร์งาน")
    ap.add_argument("--out", help="ไฟล์ mp4 ปลายทาง")
    ap.add_argument("--voice", help=f"เสียง: {', '.join(__import__('agents.video.voice', fromlist=['VOICES']).VOICES)}")
    ap.add_argument("--style", default="brand", choices=["brand", "plain", "punch"])
    ap.add_argument("--music", help="ไฟล์เพลงประกอบ")
    ap.add_argument("--headline", help="พาดหัวค้างบนจอช่วงต้นคลิป")
    ap.add_argument("--visual", action="append", default=[],
                    help="แหล่งภาพต่อฉาก ใส่ซ้ำได้ เช่น --visual machine:hero")
    ap.add_argument("--xfade", type=float, default=config.XFADE)
    ap.add_argument("--no-align", action="store_true",
                    help="ไม่ต้องใช้ whisper — เร็วขึ้นแต่ซับเลื่อน")
    a = ap.parse_args()

    if a.plan:
        plan = json.loads(pathlib.Path(a.plan).read_text(encoding="utf-8"))
    elif a.script:
        plan = {"project": a.project,
                "script": pathlib.Path(a.script).read_text(encoding="utf-8")}
    else:
        ap.error("ต้องมี --plan หรือ --script")

    for k, v in (("voice", a.voice), ("style", a.style), ("music", a.music),
                 ("headline", a.headline), ("xfade", a.xfade)):
        if v is not None and k not in plan:
            plan[k] = v
    if a.visual:
        plan["visuals"] = a.visual
    if a.project != "clip":
        plan["project"] = a.project

    out, dur = build_video(plan, a.out, skip_align=a.no_align)
    print(f"\n✅ เสร็จแล้ว: {out}  ({dur:.1f} วินาที)")


if __name__ == "__main__":
    main()
