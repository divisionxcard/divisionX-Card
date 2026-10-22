"""ชั้นเสียงหลังเรนเดอร์ — เอฟเฟกต์เสียงตามจังหวะภาพ + ตัดช่วงเงียบ + ปรับความดังให้เท่ากันทุกคลิป

ทำไม (23 ต.ค. 2026 · ตรวจคลิปจริง 5 คลิปที่ HyperFrames ทำ):
    - คลิปมีแต่เสียงพากย์แทร็กเดียว ไม่มีเพลง ไม่มีเอฟเฟกต์ → ช่วงเงียบสนิท 0.6–1.6 วิ ระหว่างประโยค
      (silencedetect −35 dB) · คลิปสั้นช่วงเงียบคือจุดที่คนเลื่อนผ่าน
    - ความดังไม่เท่ากัน: คลิปจัดอันดับ −17.7 LUFS · คลิปเทียบ −10.4 LUFS (ต่างกัน 7 dB)
      เพราะไม่มีการปรับความดังเลย ความดังขึ้นกับ TTS แต่ละรอบ · มาตรฐานโซเชียล ≈ −14 LUFS
    - ภาพเฉลย (ซองพุ่งเข้าช่อง · ผู้ชนะ · นับถอยหลัง) ไม่มีเสียงรองรับ ภาพเลยดู "เบา"

เอฟเฟกต์ทั้งหมดสังเคราะห์จากสูตรคณิตศาสตร์ด้วย ffmpeg (aevalsrc/anoisesrc) — **ไม่มีไฟล์เสียงของใคร
จึงไม่มีปัญหาลิขสิทธิ์/Content ID** · เพลงประกอบยังเป็นเรื่องของ music.py (ต้องมีใบอนุญาต · คลังยังว่าง)

ลำดับ (hf_render.build_video):
    prepare()        → tighten_pauses(voice.wav)     ช่วงเงียบเกิน PAUSE_MAX เหลือ PAUSE_KEEP ก่อน whisper จับเวลา
    write_project()  → events [(วินาที, ชนิด), …]      เวลาเดียวกับที่ภาพเฉลย (at/rv/cd ของแต่ละฉาก)
    render           → mp4 (เสียงพากย์อย่างเดียว)
    master()         → ผสมเอฟเฟกต์ + loudnorm 2 รอบ → mp4 ใหม่ (ภาพ copy ไม่เข้ารหัสใหม่)
"""
import json
import pathlib
import re
import shutil
import subprocess

from . import config

SR = 48000
TARGET_I = -14.0          # LUFS — ระดับที่ TikTok/Reels/YouTube Shorts ปรับเข้าหา
TARGET_TP = -1.5          # dBTP — กันแตกตอนแพลตฟอร์มแปลงไฟล์ซ้ำ
TARGET_LRA = 11.0
PAUSE_MAX = 0.45          # ช่วงเงียบที่ยาวกว่านี้ถูกย่อ
PAUSE_KEEP = 0.38         # …ให้เหลือประมาณเท่านี้ (ยังพอเป็นจังหวะลุ้น แต่ไม่เป็นหลุมเงียบ)
SFX_GAIN_DB = -9.0        # เอฟเฟกต์ทั้งชุดเบากว่าเสียงพูด (ก่อนปรับความดังรวม)
VERSION = "sfx-v1"
# เปลี่ยนวิธีย่อช่วงเงียบเมื่อไหร่ ต้องเปลี่ยนเลขนี้ — แคชเวลารายคำ (words.json) ผูกกับมัน
# ไม่งั้นเวลาคำเก่าถูกใช้กับเสียงที่ตัดใหม่ แล้วภาพเฉลยไม่ตรงเสียง
TIGHT_VERSION = "tight-v2"

# สูตรเอฟเฟกต์ (aevalsrc · t = วินาทีในเสียงนั้น) — ปรับเสียงได้ที่นี่ที่เดียว
SFX = {
    # ลมวูบ: เสียงรบกวนสีชมพู กรองให้นุ่ม ดังขึ้นแล้วหายเร็ว (ใช้ตรงรอยต่อฉาก)
    "whoosh": ("anoisesrc=d=0.42:c=pink:a=0.55:r={sr},highpass=f=350,lowpass=f=4200,"
               "afade=t=in:d=0.26:curve=qsin,afade=t=out:st=0.26:d=0.16:curve=exp"),
    # ตูม: ความถี่ดิ่งจากต่ำ + หางยาวนิด (ซองพุ่งเข้าช่อง · ผู้ชนะ)
    "impact": ("aevalsrc='0.95*sin(2*PI*(48+110*exp(-t*22))*t)*exp(-t*7.5)"
               "+0.25*(random(0)-0.5)*exp(-t*55)':d=0.6:s={sr}"),
    # ป๊อป: ขึ้นจอของชิ้นเล็ก (ป้าย · หมุด · ขั้นตอน)
    "pop": "aevalsrc='0.55*sin(2*PI*(520+1100*exp(-t*38))*t)*exp(-t*26)':d=0.18:s={sr}",
    # ติ๊ก: นับถอยหลัง
    "tick": "aevalsrc='0.5*sin(2*PI*1650*t)*exp(-t*55)+0.2*sin(2*PI*3300*t)*exp(-t*80)':d=0.12:s={sr}",
    # ไต่ระดับ: ก่อนเฉลยอันดับหนึ่ง/ผู้ชนะ (ยาวตามช่องที่มี · ดู riser_len)
    "riser": ("aevalsrc='0.32*(t/{d})*(t/{d})*sin(2*PI*(170+520*(t/{d}))*t)"
              "+0.12*(t/{d})*(random(0)-0.5)':d={d}:s={sr},lowpass=f=5000"),
    # ประกาย: ชนะเลิศ (เสียงสูงหลายชั้น สั่นนิด ๆ)
    "shine": ("aevalsrc='0.22*(sin(2*PI*2093*t)+sin(2*PI*2637*t)+sin(2*PI*3136*t))"
              "*exp(-t*3.2)*(0.7+0.3*sin(2*PI*14*t))':d=1.1:s={sr}"),
}
GAIN = {"whoosh": -4.0, "impact": 0.0, "pop": -5.0, "tick": -3.0, "riser": -2.0, "shine": -6.0}


def _run(args, timeout=300):
    r = subprocess.run([config.ffmpeg_bin(), "-hide_banner", "-nostats", "-y", *args], capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg ล้ม: " + "\n".join((r.stderr or "").strip().splitlines()[-6:]))
    return r.stderr or ""


# ── 1. ช่วงเงียบ ──────────────────────────────────────────────────────────────

def tighten_pauses(wav, noise="-35dB"):
    """ย่อช่วงเงียบที่ยาวเกิน PAUSE_MAX ให้เหลือ PAUSE_KEEP · ทำในที่เดิม · คืน True ถ้าเปลี่ยน

    ทำก่อน whisper จับเวลา ภาพทุกฉากจึงตามเสียงที่ย่อแล้ว · ทำซ้ำได้ (รอบสองไม่มีช่วงยาวเหลือให้ย่อ)
    ⚠️ ไม่ใช้ silenceremove ของ ffmpeg — ทดสอบ 23 ต.ค. 2026 (threshold −30…−40 dB · rms/peak) ตัดได้แค่ท้ายไฟล์
       ช่วงเงียบกลางไฟล์ 0.6–0.85 วิ ไม่ถูกแตะเลย → หาช่วงเงียบด้วย silencedetect (ตัวเดียวกับที่ใช้วัด)
       แล้วตัดต่อเองด้วย atrim + concat · ตัดกลางความเงียบ จึงไม่มีเสียงคลิก
    ไม่แตะความเงียบต้นไฟล์ — จังหวะแรกของคลิปเป็นของภาพเปิด
    """
    wav = pathlib.Path(wav)
    total = _dur(wav)
    out = _run(["-i", str(wav), "-af", f"silencedetect=noise={noise}:d={PAUSE_MAX}", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start: (-?[0-9.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    gaps = []
    for k, st in enumerate(starts):
        en = ends[k] if k < len(ends) else total          # เงียบยาวถึงท้ายไฟล์ ไม่มี silence_end
        if st <= 0.05:                                     # ความเงียบต้นไฟล์ — ไม่แตะ
            continue
        if en - st > PAUSE_MAX:
            gaps.append((st, en))
    if not gaps:
        return False
    keep, cur, half = [], 0.0, PAUSE_KEEP / 2
    for st, en in gaps:
        keep.append((cur, st + half))
        cur = en - half if en < total - 0.01 else None
        if cur is None:
            break
    if cur is not None:
        keep.append((cur, total))
    keep = [(a, b) for a, b in keep if b - a > 0.02]
    parts = "".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[p{i}];" for i, (a, b) in enumerate(keep))
    graph = parts + "".join(f"[p{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=0:a=1[o]"
    tmp = wav.with_name(wav.stem + ".tight.wav")
    _run(["-i", str(wav), "-filter_complex", graph, "-map", "[o]", str(tmp)])
    if _dur(tmp) < 0.5:
        tmp.unlink(missing_ok=True)
        return False
    shutil.move(str(tmp), str(wav))
    return True


def _dur(path):
    out = _run(["-i", str(path), "-f", "null", "-"])
    m = re.findall(r"time=(\d+):(\d+):([\d.]+)", out)
    if not m:
        return 0.0
    h, mi, s = m[-1]
    return int(h) * 3600 + int(mi) * 60 + float(s)


# ── 2. เอฟเฟกต์ ───────────────────────────────────────────────────────────────

def sfx_file(kind, cache_dir, d=None):
    """ไฟล์ .wav ของเอฟเฟกต์หนึ่งชนิด (แคชไว้ · riser ยาวตาม d)"""
    cache_dir = pathlib.Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    name = f"{kind}-{d:.2f}.wav" if d else f"{kind}.wav"
    f = cache_dir / name
    if not f.exists():
        expr = SFX[kind].format(sr=SR, d=f"{d:.3f}" if d else "1")
        _run(["-f", "lavfi", "-i", expr, "-ac", "2", "-ar", str(SR), str(f)])
    return f


def build_bus(events, total, cache_dir, out_wav):
    """รวมเอฟเฟกต์ทุกจุดเป็นแทร็กเดียวยาวเท่าคลิป · events = [(วินาที, ชนิด, ยาว|None), …]"""
    events = [e for e in events if e[1] in SFX and 0 <= e[0] < total]
    if not events:
        return None
    args, parts = [], []
    for k, (t, kind, d) in enumerate(sorted(events)):
        args += ["-i", str(sfx_file(kind, cache_dir, d))]
        ms = int(round(t * 1000))
        parts.append(f"[{k}:a]volume={GAIN.get(kind, 0)}dB,adelay={ms}|{ms}[e{k}]")
    mix = "".join(f"[e{k}]" for k in range(len(events)))
    graph = ";".join(parts) + f";{mix}amix=inputs={len(events)}:normalize=0:dropout_transition=0," \
                              f"apad=whole_dur={total:.3f},atrim=0:{total:.3f}[bus]"
    _run([*args, "-filter_complex", graph, "-map", "[bus]", "-ar", str(SR), "-ac", "2", str(out_wav)])
    return pathlib.Path(out_wav)


# ── 3. มาสเตอร์ ───────────────────────────────────────────────────────────────

MUSIC_VOL = 0.22          # เพลงเบากว่าเสียงพูดมาก แล้วหลบอัตโนมัติตอนมีเสียงพูด (ค่าเดียวกับ compose.py ทางเดิม)


def master(mp4_in, mp4_out, events=None, work=None, music=None):
    """ผสมเอฟเฟกต์ (+ เพลงถ้ามี) เข้ากับเสียงพากย์ในคลิป แล้วปรับความดัง 2 รอบให้ได้ −14 LUFS · ภาพ copy

    music = path เพลงที่มีใบอนุญาต (music.pick_for) · วนให้ยาวเท่าคลิป · หลบเสียงพูดด้วย sidechaincompress
    คืน dict ผลวัด (ไว้ log) · ล้ม = โยน error (ผู้เรียกตัดสินว่าจะใช้ไฟล์เดิมต่อไหม)
    """
    mp4_in, mp4_out = pathlib.Path(mp4_in), pathlib.Path(mp4_out)
    work = pathlib.Path(work or mp4_in.parent)
    total = _dur(mp4_in)
    bus = build_bus(events or [], total, work / "sfx-cache", work / "sfx-bus.wav") if events else None
    inputs, parts, mix = ["-i", str(mp4_in)], [], ["[v]"]
    split = "asplit=2[v][vk]" if music else "anull[v]"
    parts.append(f"[0:a]aresample={SR},{split}")
    if bus:
        inputs += ["-i", str(bus)]
        parts.append(f"[{len(inputs) // 2 - 1}:a]volume={SFX_GAIN_DB}dB[s]")
        mix.append("[s]")
    if music:
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        k = len([x for x in inputs if x == "-i"]) - 1
        fade_out = max(0.0, total - 1.0)
        parts.append(f"[{k}:a]aresample={SR},aformat=channel_layouts=stereo,volume={MUSIC_VOL},"
                     f"afade=t=in:d=0.3,afade=t=out:st={fade_out:.2f}:d=1.0[mu0]")
        parts.append("[mu0][vk]sidechaincompress=threshold=0.03:ratio=12:attack=15:release=300[mu]")
        mix.append("[mu]")
    if len(mix) > 1:
        parts.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:dropout_transition=0:duration=first[m]")
    else:
        parts.append("[v]anull[m]")
    pre = ";".join(parts) + ";[m]"
    meas = _loudnorm_measure_inputs(inputs, pre)
    ln = f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}"
    if meas:
        ln += (f":measured_I={meas['input_i']}:measured_TP={meas['input_tp']}:measured_LRA={meas['input_lra']}"
               f":measured_thresh={meas['input_thresh']}:offset={meas['target_offset']}:linear=true")
    graph = f"{pre}{ln},aresample={SR}[out]"
    _run([*inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[out]", "-c:v", "copy",
          "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(mp4_out)])
    return {"events": len(events or []), "measured": meas and {k: meas[k] for k in ("input_i", "input_tp")}}


def _loudnorm_measure_inputs(inputs, pre):
    out = _run([*inputs, "-filter_complex",
                f"{pre}loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json[o]",
                "-map", "[o]", "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", out, re.S)
    return json.loads(m.group(0)) if m else None


def loudness(path):
    """วัดความดังรวม (LUFS) ของไฟล์ — ใช้ตรวจผล"""
    out = _run(["-i", str(path), "-af", "ebur128", "-f", "null", "-"])
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    return float(m[-1]) if m else None
