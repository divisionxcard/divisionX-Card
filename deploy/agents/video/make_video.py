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


def _edited_timing(raw, segs, total):
    """เวลาที่คนแก้มือจากห้องตัดต่อ → ตรวจให้อยู่ในกรอบที่เรนเดอร์ได้จริง

    คนลากบนหน้าจอพลาดได้เสมอ (จุดตัดสลับกัน · เกินความยาวเสียง · ฉากหาย)
    ถ้าปล่อยผ่านจะไปตายที่ xfade แบบเงียบ ๆ เหมือนบั๊กเมื่อ 9 ก.ย. — จึงบีบให้
    เรียงเป็นระเบียบตรงนี้: ฉากแรกเริ่ม 0 · จุดตัดถัดไปห้ามย้อน · ฉากสั้นสุด 0.35 วิ
    """
    by_idx = {int(t["index"]): t for t in raw}
    out, cursor = [], 0.0
    n = len(segs)
    for i in range(n):
        t = by_idx.get(i) or {}
        start = 0.0 if i == 0 else max(cursor + 0.35, float(t.get("start", cursor + 0.35)))
        start = min(start, max(0.0, total - 0.35 * (n - i)))
        out.append({"index": i, "start": round(start, 3), "end": 0.0})
        cursor = start
    for i in range(n):
        out[i]["end"] = round(out[i + 1]["start"] if i < n - 1 else total, 3)
    return out


# ── ผู้กำกับอัตโนมัติ: เลือกท่ากล้อง/ทรานสิชันให้ฉากที่คนไม่ได้เลือกเอง ──
# ⚠️ ตรรกะคู่นี้ถูก "กระจก" ไว้ใน editorStore.js (autoMotion/autoTransition)
#    เพื่อให้พรีวิวสดในห้องตัดต่อตรงกับผลเรนเดอร์ — แก้ที่นี่ต้องแก้ที่นั่นด้วย
def _auto_motion(i, n, visual):
    """ท่ากล้องตามบทบาทของฉาก: เปิดมั่นคง ปิดถอยกล้อง ของเน้น punch ห้างให้แพน"""
    if n > 1 and i == n - 1:
        return "zoom-out"
    if i == 0:
        return "zoom-in"
    if visual.startswith("sku:"):
        return "punch" if i % 2 else "zoom-in"
    if visual == "machine:scene":
        return "pan-rl" if i % 2 else "pan-lr"
    return ("drift-down", "zoom-in", "pan-lr")[i % 3]


_ACCENTS = ("slideleft", "circleopen", "slideright", "smoothup")

def _auto_transition(i):
    """ทรานสิชันเข้าฉาก i (i≥1): fade เป็นฐาน คั่นลูกเล่นทุกรอยต่อเว้นรอยต่อ
    — ลูกเล่นติดกันทุกรอยต่อดูวุ่นวายแบบมือสมัครเล่น"""
    return "fade" if i % 2 else _ACCENTS[(i // 2 - 1) % len(_ACCENTS)]


def build_video(plan, out_mp4=None, skip_align=False):
    project = plan.get("project") or "clip"
    work = config.work_dir(project)
    out_mp4 = pathlib.Path(out_mp4 or (work / f"{project}.mp4"))

    # เก็บ plan ทั้งก้อนไว้ในโฟลเดอร์งานเสมอ — ห้องตัดต่อบนเว็บอ่านไฟล์นี้
    # เป็นจุดตั้งต้น และทำให้เรนเดอร์ซ้ำได้เหมือนเดิมแม้ต้นทาง (DB/CLI) จะหาย
    (work / "plan.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")

    # การแก้ไขจากห้องตัดต่อ — ทุกคีย์ optional ดูโครงใน components/editor/CONTRACT.md
    edit = plan.get("edit") or {}

    # ── 1. สคริปต์ → ฉาก ──
    segs = segments.split_script(plan["script"])
    if not segs:
        raise ValueError("สคริปต์ว่าง — ต้องมีอย่างน้อยหนึ่งบรรทัด")
    _log("1/6", f"แบ่งได้ {len(segs)} ฉาก")

    # ── 2. เสียงพากย์ ──
    t0 = time.time()
    wav = work / "voice.wav"
    from . import voice as voice_mod
    # จับว่ารอบนี้เสียงถูกสร้างใหม่ไหม (เทียบ stamp ก่อน-หลัง) — ถ้าใหม่ แปลว่า
    # จังหวะการอ่านเปลี่ยนหมด เวลา/ซับที่คนแก้มือไว้กับเสียงเก่าใช้ต่อไม่ได้
    stamp_f = wav.with_suffix(".stamp.json")
    stamp_before = stamp_f.read_text(encoding="utf-8") if stamp_f.exists() else None
    voice_mod.synth(segments.speech_text(segs), wav,
                    voice=plan.get("voice"), model=plan.get("tts_model"),
                    style=plan.get("voice_style"))
    voice_changed = (stamp_f.read_text(encoding="utf-8") if stamp_f.exists()
                     else None) != stamp_before
    total = voice_mod.duration(wav)
    _log("2/6", f"เสียงพากย์ {total:.1f} วินาที ({time.time()-t0:.0f} วิ)"
         + (" · เสียงใหม่" if voice_changed else ""))
    if voice_changed and (edit.get("timing") or edit.get("subtitles")):
        _log("2/6", "⚠️ เสียงเปลี่ยน — เวลาตัด/ซับที่แก้มือไว้ผูกกับเสียงเก่า "
                    "ทิ้งแล้วจับเวลาใหม่จากเสียงจริง")
        edit = {k: v for k, v in edit.items() if k not in ("timing", "subtitles")}
        # ล้างในไฟล์ด้วย — ไม่งั้นห้องตัดต่อโหลด plan.edit.timing ค้าง มาทับเวลาชุดใหม่
        plan["edit"] = edit
        (work / "plan.json").write_text(
            json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── 3. จับเวลาแต่ละบรรทัด ──
    t0 = time.time()
    if edit.get("timing"):
        # คนตัดสินเวลาเองจากห้องตัดต่อ — เชื่อคนก่อนเครื่องเสมอ และได้ของแถมคือ
        # ข้ามขั้นที่ช้าที่สุด (whisper) → วนแก้-เรนเดอร์ได้เร็ว
        timing = _edited_timing(edit["timing"], segs, total)
        _log("3/6", f"ใช้เวลาที่แก้มือจากห้องตัดต่อ {len(timing)} ฉาก")
    elif skip_align:
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
    specs = specs[:len(segs)]
    scene_edit = edit.get("scenes") or {}
    for i in range(len(specs)):                      # ห้องตัดต่อสลับ/เปลี่ยนภาพรายฉาก
        ov = scene_edit.get(str(i)) or {}
        if ov.get("visual"):
            specs[i] = ov["visual"]
    # file:ชื่อไฟล์เฉย ๆ (ไม่มีไดรฟ์/โฟลเดอร์) = ไฟล์ที่อัปโหลดไว้ในโฟลเดอร์งานนี้เอง
    for i, s in enumerate(specs):
        if s.startswith("file:") and "/" not in s[5:] and "\\" not in s[5:] and ":" not in s[5:]:
            specs[i] = f"file:{work / s[5:]}"
    frames = visuals.prepare(specs, work)
    _log("4/6", f"เตรียมภาพ {len(frames)} ใบ ({time.time()-t0:.0f} วิ)")

    # ── 5. ซับไทย ──
    t0 = time.time()
    ss = dict(edit.get("sub_style") or {})
    sub_style = ss.get("style") or plan.get("style", "brand")
    sub_size = int(ss.get("size") or plan.get("sub_size", 64))
    sub_bottom = int(ss.get("bottom") or 430)
    if edit.get("subtitles"):
        # ซับที่คนแก้เอง — ใช้ทั้งชุดตามนั้น (ข้อความ/เวลา/การรวม-แยกการ์ด)
        chunks = [dict(c) for c in edit["subtitles"]]
    else:
        chunks = align.subtitle_chunks(segs, timing,
                                       max_chars=int(plan.get("sub_chars", 28)))
    subtitle.render_many(chunks, work / "subs", style=sub_style,
                         size=sub_size, bottom=sub_bottom)
    he = dict(edit.get("headline") or {})
    head_text = he.get("text") if "text" in he else plan.get("headline")
    head_secs = float(he.get("seconds") or plan.get("headline_seconds", 3.0))
    head_png = None
    if head_text:
        head_png = subtitle.render_headline(head_text, work / "headline.png",
                                            style=sub_style,
                                            size=int(he.get("size") or 86))
    _log("5/6", f"ซับ {len(chunks)} ชิ้น ({time.time()-t0:.0f} วิ)")

    # ── 6. ประกอบ ──
    t0 = time.time()
    xfade = float(plan.get("xfade", config.XFADE))
    clips_dir = work / "clips"
    clips_dir.mkdir(exist_ok=True)
    clips = []
    for i, (fr, t) in enumerate(zip(frames, timing)):
        # ⚠️ ต้องยืดถึง "เวลาเริ่มของฉากถัดไป" ไม่ใช่ "เวลาจบของฉากนี้"
        #    ระหว่างสองประโยคมีช่องว่างที่คนพูดหายใจ (จับได้จริงจาก whisper
        #    เช่น 3.72 → 4.16 = เงียบ 0.44 วิ) ถ้าคิดแค่ end-start ภาพจะสั้นกว่า
        #    เส้นเวลาจริง แล้ว offset ของ xfade จะเลยความยาวที่มี → ffmpeg ตัดทิ้ง
        #    ทั้งท้ายคลิปโดยไม่ error
        #
        #    เกิดจริง 9 ก.ย. 2026: คลิป 45 วินาทีออกมาเหลือ 5.97 วินาที
        #    แต่โปรแกรมยังพิมพ์ว่า "เสร็จแล้ว 45.0 วินาที" — พังเงียบสนิท
        #    ตอนนี้ compose.build() ตรวจความยาวจริงหลังเรนเดอร์แล้วโวยถ้าไม่ตรง
        if i < len(frames) - 1:
            dur = timing[i + 1]["start"] - t["start"] + xfade
        else:
            dur = total - t["start"]
        zoom = None
        ov = scene_edit.get(str(i)) or {}
        if "zoom" in ov and ov["zoom"] is not None:
            zoom = float(ov["zoom"])                 # 0 = ภาพนิ่งไม่ซูม
        motion = ov.get("motion")
        if not motion or motion == "auto":
            motion = _auto_motion(i, len(frames), specs[i])
        clips.append(compose.render_scene(fr, max(0.5, dur),
                                          clips_dir / f"scene_{i:03d}.mp4",
                                          zoom=zoom, motion=motion))

    # ทรานสิชันเข้าฉาก i (รายการยาว n-1) — คนเลือกไว้ในห้องตัดต่อชนะ auto เสมอ
    transitions = []
    for i in range(1, len(frames)):
        tr = (scene_edit.get(str(i)) or {}).get("transition")
        transitions.append(tr if tr and tr != "auto" else _auto_transition(i))

    logo = None
    lg = edit.get("logo") or {}
    if lg.get("file"):
        lf = work / lg["file"]
        if lf.exists():
            logo = {"path": lf, "pos": lg.get("pos", "tr"),
                    "size": int(lg.get("size", 140)),
                    "opacity": float(lg.get("opacity", 0.9))}
        else:
            _log("6/6", f"⚠️ ไม่พบไฟล์โลโก้ {lg['file']} — ข้าม (อัปโหลดใหม่จากห้องตัดต่อ)")

    compose.build(clips, timing, chunks, wav, out_mp4,
                  music=plan.get("music"), headline=head_png,
                  headline_seconds=head_secs, xfade=xfade, logo=logo,
                  transitions=transitions)
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
