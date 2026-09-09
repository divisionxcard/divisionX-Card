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


def render_scene(image, seconds, out_mp4, zoom=None, fps=None):
    """ภาพนิ่งหนึ่งใบ → คลิปสั้นที่ค่อย ๆ ซูมเข้า (Ken Burns)

    ขยายภาพเป็น 2 เท่าก่อนเข้า zoompan เพราะ zoompan ปัดพิกัดเป็นจำนวนเต็ม
    ถ้าทำบนภาพขนาดจริงจะเห็นภาพกระตุกเป็นขั้น ๆ ตอนซูม
    """
    zoom = config.KEN_BURNS_ZOOM if zoom is None else zoom
    fps = fps or config.FPS
    frames = max(2, int(round(seconds * fps)))
    vf = (
        f"scale={config.W}:{config.H}:force_original_aspect_ratio=increase,"
        f"crop={config.W}:{config.H},"
        f"scale={config.W*2}:{config.H*2}:flags=lanczos,"
        f"zoompan=z='1+{zoom}*on/{frames}':d={frames}"
        f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":s={config.W}x{config.H}:fps={fps},"
        f"setsar=1,format=yuv420p"
    )
    _run([config.ffmpeg_bin(), "-y", "-loglevel", "error",
          "-loop", "1", "-i", str(image), "-frames:v", str(frames),
          "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
          "-pix_fmt", "yuv420p", "-r", str(fps), str(out_mp4)],
         f"เรนเดอร์ฉาก {pathlib.Path(out_mp4).name}")
    return out_mp4


def build(scene_clips, timing, subtitles, voice_wav, out_mp4,
          music=None, headline=None, headline_seconds=3.0, xfade=None):
    """ต่อทุกอย่างเป็นคลิปสุดท้าย

    scene_clips : [path, ...] เรียงตามฉาก (ยาวเกินมาเท่า xfade แล้ว)
    timing      : [{'index','start','end'}, ...] เวลาจริงของแต่ละฉาก
    subtitles   : [{'png','start','end'}, ...]
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
            out = f"x{i}"
            filters.append(
                f"[{last}][{i}:v]xfade=transition=fade:duration={xfade}"
                f":offset={off:.3f}[{out}]")
            last = out

    # ── ซ้อนซับ + พาดหัว ──
    overlays = list(subtitles)
    if headline:
        overlays = [{"png": str(headline), "start": 0.0,
                     "end": float(headline_seconds)}] + overlays
    base = len(scene_clips)
    for k, ov in enumerate(overlays):
        inputs += ["-i", str(ov["png"])]
        out = f"o{k}"
        filters.append(
            f"[{last}][{base + k}:v]overlay=0:0:format=auto"
            f":enable='between(t,{ov['start']:.3f},{ov['end']:.3f})'[{out}]")
        last = out
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
