"""ประกอบทุกอย่างเป็นไฟล์ mp4 ด้วย ffmpeg

ทำสองรอบ ไม่ใช่รอบเดียว:
    รอบ 1 — เรนเดอร์ทีละฉากเป็นคลิปสั้น
    รอบ 2 — ต่อคลิป + ซ้อนซับ + ผสมเสียง

ทำไมไม่ยัดเป็น filter_complex ก้อนเดียว: การ์ดจอ 6GB กับ RAM 32GB รับ
zoompan ที่ 2160×3840 คูณสิบกว่าฉากพร้อมกันไม่ไหว และเวลาพังจะไม่รู้ว่าฉากไหน
แยกรอบแล้วเปิดดูคลิปรายฉากได้ว่าอันไหนเพี้ยน

⚠️ เรื่องเวลาที่พลาดง่ายที่สุด: xfade ทำให้คลิปรวมสั้นลง (n-1)×ระยะเกย
   ถ้าไม่ชดเชย ซับกับเสียงจะค่อย ๆ เลื่อนออกจากกันจนท้ายคลิปหลุดเป็นวินาที
   จึงต่อเวลาให้แต่ละฉากเกินมาเท่าระยะเกย แล้ววาง offset ที่ "เวลาเริ่มของฉากถัดไป"
   ผลคือความยาวรวมเท่าเสียงพากย์เป๊ะ
"""
import json
import pathlib
import subprocess

from . import config


def _run(args, desc):
    p = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                       errors="replace")
    if p.returncode != 0:
        tail = "\n".join((p.stderr or "").strip().splitlines()[-15:])
        raise RuntimeError(f"ffmpeg ล้มตอน{desc}:\n{tail}")
    return p


def probe_duration(path):
    out = _run([config.ffmpeg_bin("ffprobe"), "-v", "quiet", "-print_format", "json",
                "-show_format", str(path)], "อ่านความยาวไฟล์").stdout
    return float(json.loads(out)["format"]["duration"])


# ── คลังการเคลื่อนกล้อง ────────────────────────────────────────────────
# ชื่อ motion ชุดนี้เป็นสัญญากับห้องตัดต่อ (editorStore.js MOTIONS + CONTRACT.md)
# — เพิ่ม/เปลี่ยนชื่อที่นี่ต้องไปแก้ฝั่งโน้นให้ครบ ไม่งั้นพรีวิวจะโกหกตา
#
# ทุกสูตรวิ่งบนภาพที่ขยาย 2 เท่าแล้ว (กัน zoompan ปัดพิกัดเป็นขั้น) และ
# แพน/ไต่ต้องมีซูมค้างอย่างน้อย 6% ไม่งั้นไม่มีเนื้อภาพเหลือให้กล้องเดิน
MOTIONS = ("zoom-in", "zoom-out", "punch", "pan-lr", "pan-rl",
           "drift-down", "drift-up")
PAN_MIN_ZOOM = 0.06

def _motion_exprs(motion, zoom, frames, fps):
    """คืน (z, x, y) ของ zoompan สำหรับ motion หนึ่งแบบ · zoom = ความแรง 0-0.15"""
    z = max(zoom, PAN_MIN_ZOOM)                 # ระยะเดินกล้องของท่าแพน/ไต่
    center = ("iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)")
    if motion == "zoom-out":
        return (f"(1+{zoom})-{zoom}*on/{frames}", *center)
    if motion == "punch":       # พุ่งเข้าเร็วช่วงแรกแล้วค้าง — ไว้เน้นของ
        k = max(1, int(round(0.35 * fps)))
        return (f"1+{zoom}*min(1,on/{k})", *center)
    if motion == "pan-lr":      # กล้องกวาดซ้าย → ขวา (ซูมค้างคงที่)
        return (f"{1 + z:.4f}", f"(iw-iw/zoom)*on/{frames}", center[1])
    if motion == "pan-rl":
        return (f"{1 + z:.4f}", f"(iw-iw/zoom)*(1-on/{frames})", center[1])
    if motion == "drift-down":  # กล้องไต่ลงตามตัวตู้ — เข้ากับภาพแนวตั้ง
        return (f"{1 + z:.4f}", center[0], f"(ih-ih/zoom)*on/{frames}")
    if motion == "drift-up":
        return (f"{1 + z:.4f}", center[0], f"(ih-ih/zoom)*(1-on/{frames})")
    # ค่าปริยาย: zoom-in แบบเดิม
    return (f"1+{zoom}*on/{frames}", *center)


def render_scene(image, seconds, out_mp4, zoom=None, fps=None, motion="zoom-in"):
    """ภาพนิ่งหนึ่งใบ → คลิปสั้นที่กล้องเคลื่อนตามท่าที่เลือก (Ken Burns และญาติ ๆ)

    ขยายภาพเป็น 2 เท่าก่อนเข้า zoompan เพราะ zoompan ปัดพิกัดเป็นจำนวนเต็ม
    ถ้าทำบนภาพขนาดจริงจะเห็นภาพกระตุกเป็นขั้น ๆ ตอนซูม
    zoom=0 = ภาพนิ่งสนิท (เคารพสวิตช์ "ภาพนิ่ง" ของห้องตัดต่อ ไม่ว่า motion จะเป็นอะไร)
    """
    zoom = config.KEN_BURNS_ZOOM if zoom is None else zoom
    fps = fps or config.FPS
    frames = max(2, int(round(seconds * fps)))
    if zoom <= 0:
        zx, xx, yx = "1", "0", "0"
    else:
        zx, xx, yx = _motion_exprs(motion, zoom, frames, fps)
    vf = (
        f"scale={config.W}:{config.H}:force_original_aspect_ratio=increase,"
        f"crop={config.W}:{config.H},"
        f"scale={config.W*2}:{config.H*2}:flags=lanczos,"
        f"zoompan=z='{zx}':d={frames}"
        f":x='{xx}':y='{yx}'"
        f":s={config.W}x{config.H}:fps={fps},"
        f"setsar=1,format=yuv420p"
    )
    _run([config.ffmpeg_bin(), "-y", "-loglevel", "error",
          "-loop", "1", "-i", str(image), "-frames:v", str(frames),
          "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
          "-pix_fmt", "yuv420p", "-r", str(fps), str(out_mp4)],
         f"เรนเดอร์ฉาก {pathlib.Path(out_mp4).name}")
    return out_mp4


# ── คลังทรานสิชัน ──────────────────────────────────────────────────────
# ชุดที่คัดแล้วว่าดูดีบนคลิปแนวตั้ง 9:16 (ชื่อตรงกับ xfade ของ ffmpeg เป๊ะ ๆ)
# เป็นสัญญากับห้องตัดต่อเช่นเดียวกับ MOTIONS — แก้ที่นี่ต้องแก้ editorStore.js ด้วย
TRANSITIONS = ("fade", "slideleft", "slideright", "slideup", "circleopen",
               "circleclose", "wipeleft", "wiperight", "smoothup", "radial",
               "hblur", "fadeblack")

# จังหวะเด้งเข้าของซับ/พาดหัว (วินาที · px บนเฟรม 1080×1920)
_POP_SECS = 0.18
_POP_RISE_SUB = 16
_POP_RISE_HEAD = 24


def _pop_y(start, rise):
    """สูตร y ของ overlay: ลอยขึ้น `rise`px ในช่วง _POP_SECS แรกแล้วนิ่งที่ 0

    PNG ซับเป็นเฟรมโปร่งใสเต็มจอ การเลื่อนลงชั่วคราวจึงไม่เผยขอบอะไร
    (ส่วนที่พ้นล่างจอถูก crop ทิ้งเฉย ๆ)
    """
    return (f"'if(lt(t-{start:.3f},{_POP_SECS}),"
            f"{rise}*(1-(t-{start:.3f})/{_POP_SECS}),0)'")


def render_scene_from_clip(src, seconds, out_mp4, fps=None):
    """ฟุตเทจวิดีโอ (จาก Google Flow/Veo หรือถ่ายเอง) → คลิปฉาก 9:16 ยาวพอดีช่วง

    - ครอปแบบ cover เป็น 1080×1920 (ฟุตเทจแนวนอนถูกตัดข้าง ไม่ใส่แถบดำ)
    - สั้นกว่าช่วงฉาก → ค้างเฟรมสุดท้าย (tpad clone) · ยาวกว่า → ตัดท้ายทิ้ง
    - ตัดเสียงทิ้งเสมอ — เสียงของระบบคือเสียงพากย์+เพลง ไม่ใช่เสียงติดฟุตเทจ
    """
    fps = fps or config.FPS
    vf = (
        f"scale={config.W}:{config.H}:force_original_aspect_ratio=increase,"
        f"crop={config.W}:{config.H},fps={fps},"
        f"tpad=stop_mode=clone:stop_duration={seconds:.3f},"
        f"trim=duration={seconds:.3f},setpts=PTS-STARTPTS,"
        f"setsar=1,format=yuv420p"
    )
    _run([config.ffmpeg_bin(), "-y", "-loglevel", "error",
          "-i", str(src), "-vf", vf, "-an",
          "-c:v", "libx264", "-preset", "medium", "-crf", "18",
          "-pix_fmt", "yuv420p", "-r", str(fps), str(out_mp4)],
         f"แปลงฟุตเทจ {pathlib.Path(src).name} เป็นฉาก")
    return out_mp4


def build(scene_clips, timing, subtitles, voice_wav, out_mp4,
          music=None, headline=None, headline_seconds=3.0, xfade=None, logo=None,
          transitions=None):
    """ต่อทุกอย่างเป็นคลิปสุดท้าย

    scene_clips : [path, ...] เรียงตามฉาก (ยาวเกินมาเท่า xfade แล้ว)
    timing      : [{'index','start','end'}, ...] เวลาจริงของแต่ละฉาก
    subtitles   : [{'png','start','end'}, ...]
    logo        : {'path','pos','size','opacity'} หรือ None
                  pos ∈ tl|tr|bl|br · size = ความกว้าง px บนเฟรม 1080
    transitions : [ชื่อ xfade ของรอยต่อเข้าฉาก 1..n-1] หรือ None = fade ทั้งหมด
                  ชื่อที่ไม่อยู่ใน TRANSITIONS ถูกปัดกลับเป็น fade (กัน ffmpeg ล้ม
                  เพราะค่าที่พิมพ์เองใน plan.json)
    """
    xfade = config.XFADE if xfade is None else xfade
    ff = config.ffmpeg_bin()
    total = probe_duration(voice_wav)

    inputs, filters = [], []
    for c in scene_clips:
        inputs += ["-i", str(c)]
    n = len(scene_clips)

    # ── ต่อฉาก ──
    if n == 1:
        last = "0:v"
    elif xfade <= 0:
        for i in range(n):
            filters.append(f"[{i}:v]setpts=PTS-STARTPTS[c{i}]")
        filters.append("".join(f"[c{i}]" for i in range(n)) +
                       f"concat=n={n}:v=1:a=0[vcat]")
        last = "vcat"
    else:
        last = "0:v"
        for i in range(1, n):
            # offset = เวลาเริ่มของฉากนี้ → ทำให้ภาพเปลี่ยนตรงกับที่เสียงเปลี่ยนประโยค
            off = max(0.0, timing[i]["start"])
            tr = (transitions or [])[i - 1] if i - 1 < len(transitions or []) else "fade"
            if tr not in TRANSITIONS:
                tr = "fade"
            out = f"x{i}"
            filters.append(
                f"[{last}][{i}:v]xfade=transition={tr}:duration={xfade}"
                f":offset={off:.3f}[{out}]")
            last = out

    # ── ซ้อนซับ + พาดหัว ──
    # ซับโหมดคาราโอเกะมีหลายเฟรมต่อหนึ่งใบ (frames) — แผ่ออกเป็นชั้นซ้อนทีละเฟรม
    # ใบธรรมดามีภาพเดียว (png) ใช้ช่วงเวลาของตัวมันเอง
    overlays = []
    for c in subtitles:
        if c.get("frames"):
            # ⚠️ จังหวะเด้งเข้าต้องอ้าง "เวลาเริ่มของซับใบนั้น" ไม่ใช่ของเฟรมย่อย
            #    ไม่งั้นข้อความจะเด้งใหม่ทุกครั้งที่ไล่สีไปอีกคำ กลายเป็นตัวหนังสือกระตุกทั้งประโยค
            for fr in c["frames"]:
                overlays.append({**fr, "pop_from": c["start"]})
        elif c.get("png"):
            overlays.append(c)
    if headline:
        overlays = [{"png": str(headline), "start": 0.0,
                     "end": float(headline_seconds)}] + overlays
    base = len(scene_clips)
    for k, ov in enumerate(overlays):
        inputs += ["-i", str(ov["png"])]
        out = f"o{k}"
        # y เป็นสูตรตามเวลา — ซับ/พาดหัวลอยเด้งขึ้นตอนเข้า ไม่โผล่นิ่ง ๆ แบบเดิม
        rise = _POP_RISE_HEAD if (headline and k == 0) else _POP_RISE_SUB
        filters.append(
            f"[{last}][{base + k}:v]overlay=x=0:y={_pop_y(ov.get('pop_from', ov['start']), rise)}"
            f":format=auto"
            f":enable='between(t,{ov['start']:.3f},{ov['end']:.3f})'[{out}]")
        last = out

    # ── โลโก้แบรนด์ค้างทั้งคลิป ──
    if logo:
        idx = len(scene_clips) + len(overlays)
        inputs += ["-i", str(logo["path"])]
        pad = 28                                   # ระยะจากขอบ — พ้นโซนมุมโค้งของจอมือถือ
        pos = {
            "tl": f"{pad}:{pad}",
            "tr": f"main_w-overlay_w-{pad}:{pad}",
            "bl": f"{pad}:main_h-overlay_h-{pad}",
            "br": f"main_w-overlay_w-{pad}:main_h-overlay_h-{pad}",
        }.get(logo.get("pos", "tr"), f"main_w-overlay_w-{pad}:{pad}")
        op = max(0.0, min(1.0, float(logo.get("opacity", 0.9))))
        # format=rgba ก่อนคูณ alpha — ไฟล์ jpg ไม่มี alpha ถ้าไม่แปลงจะคูณไม่ติด
        filters.append(
            f"[{idx}:v]scale={int(logo.get('size', 140))}:-1,format=rgba,"
            f"colorchannelmixer=aa={op:.2f}[lg]")
        filters.append(f"[{last}][lg]overlay={pos}[olg]")
        last = "olg"

    filters.append(f"[{last}]trim=duration={total:.3f},setpts=PTS-STARTPTS[vout]")

    # ── เสียง ──
    ai = len(inputs) // 2
    inputs += ["-i", str(voice_wav)]
    if music:
        inputs += ["-i", str(music)]
        filters.append(f"[{ai}:a]asplit=2[vc1][vc2]")
        filters.append(f"[{ai+1}:a]volume=0.22,aloop=loop=-1:size=2e9,"
                       f"atrim=duration={total:.3f}[mus]")
        # เพลงหลบเสียงพูดอัตโนมัติ — ไม่ใช่ลดคงที่ ช่วงเงียบเพลงจะกลับมาเต็ม
        filters.append(f"[mus][vc2]sidechaincompress=threshold=0.03:ratio=12"
                       f":attack=15:release=300[duck]")
        filters.append("[vc1][duck]amix=inputs=2:duration=first:"
                       "dropout_transition=0,alimiter=limit=0.95[aout]")
        amap = "[aout]"
    else:
        amap = f"{ai}:a"

    args = [ff, "-y", "-loglevel", "error", *inputs,
            "-filter_complex", ";".join(filters),
            "-map", "[vout]", "-map", amap,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p", "-r", str(config.FPS),
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
            "-shortest", str(out_mp4)]
    _run(args, "ประกอบคลิปสุดท้าย")

    # ── ด่านสุดท้าย: ไฟล์ที่ได้ยาวเท่าเสียงจริงไหม ──
    #
    # ffmpeg ไม่ error เวลา offset ของ xfade เลยความยาวที่มี มันแค่ตัดท้ายทิ้งเงียบ ๆ
    # เกิดจริง 9 ก.ย. 2026: คลิป 45 วินาทีออกมา 5.97 วินาที แต่ทุกคำสั่งคืน 0
    # และโปรแกรมพิมพ์ว่าเสร็จแล้ว 45 วินาที — กว่าจะรู้ก็ตอนเปิดไฟล์ดู
    #
    # ยอมให้คลาดได้นิดเดียว (0.5 วิ) เพราะ -shortest ตัดตามสตรีมที่สั้นกว่า
    got = probe_duration(out_mp4)
    if abs(got - total) > 0.5:
        raise RuntimeError(
            f"คลิปที่ได้ยาว {got:.2f} วินาที แต่เสียงพากย์ยาว {total:.2f} วินาที\n"
            f"มักเกิดจาก offset ของ xfade เลยความยาวคลิปที่ต่อได้ — ตรวจว่าความยาว\n"
            f"ของแต่ละฉากยืดถึงเวลาเริ่มของฉากถัดไปแล้วหรือยัง (ต้องครอบช่องว่าง\n"
            f"ที่คนพูดหายใจด้วย) หรือสั่ง xfade=0 เพื่อตัดปัญหานี้ทิ้ง")
    return out_mp4
