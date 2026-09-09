"""ค่าตั้งต้นและตัวช่วยที่ทุกส่วนของโรงงานวิดีโอใช้ร่วมกัน

หลักการที่ยึดทั้งระบบ — มาจากบทเรียนของ poster_render.py:

    AI วาดแค่ "ฉาก" · เบราว์เซอร์วาด "ตัวอักษรไทย" · รูปสินค้าใช้ของถ่ายจริง

diffusion model เขียนภาษาไทยเพี้ยนทุกครั้ง และ ffmpeg/libass ก็จัดสระบน-ล่าง
กับวรรณยุกต์ไทยพลาดได้เงียบ ๆ (โปรเจกต์นี้โดนบั๊กตัวอักษรไทยมาแล้วหลายรอบ —
U+0E3A ทำยอดนับผิด 31 รายการ · ช่องว่างไทยใน PDF) เราจึงให้ Chromium เรนเดอร์
ซับเป็น PNG โปร่งใสแล้วค่อยซ้อนทับ ซึ่งเป็นวิธีเดียวที่พิสูจน์แล้วว่าถูก 100%
"""
import os
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[2]        # .../deploy
REPO = ROOT.parent                                        # .../divisionX Card
PUBLIC = ROOT / "public"
FONT_DIR = PUBLIC / "fonts"
MACHINE_DIR = PUBLIC / "machine"
TASKS = ROOT / "tasks"

# งานทั้งหมดของหนึ่งคลิปอยู่ในโฟลเดอร์เดียว — ลบทีเดียวจบ และดูย้อนหลังได้ว่าอะไรพัง
WORK_ROOT = REPO / ".video-work"

# ── วิดีโอปลายทาง ───────────────────────────────────────────────────────
W, H = 1080, 1920            # 9:16 สำหรับ TikTok / Reels / Shorts
FPS = 30

# ── เสียง ───────────────────────────────────────────────────────────────
TTS_MODEL = "gemini-2.5-flash-preview-tts"
TTS_VOICE = "Aoede"          # หญิง โทนสบาย — เข้ากับ "เพื่อนสายการ์ดคุยกัน"
TTS_RATE = 24000             # Gemini คืน PCM 16-bit mono 24kHz เสมอ
MUSIC_DUCK_DB = -18          # ลดเพลงลงเท่าไหร่ตอนมีเสียงพูด

# ── ภาพ ─────────────────────────────────────────────────────────────────
KEN_BURNS_ZOOM = 0.08        # ซูมเข้า 8% ตลอดช่วงฉาก — ให้ภาพนิ่งมีชีวิตโดยไม่เวียนหัว
XFADE = 0.35                 # วินาทีที่ภาพสองฉากเกยกัน


def env(key, default=None):
    """อ่านค่าจาก deploy/.env.local (ไฟล์นี้ gitignored — เก็บ service key กับ API key)"""
    f = ROOT / ".env.local"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip()
    return os.environ.get(key, default)


def ffmpeg_bin(name="ffmpeg"):
    """หา ffmpeg — ใน PATH ก่อน ไม่เจอค่อยดูที่ที่เราติดตั้งเอง

    ไม่ผูกกับ path ตายตัวเพราะเครื่องที่รันอาจเป็นคนละเครื่อง (GitHub Actions
    ลง ffmpeg ผ่าน apt ซึ่งอยู่ใน PATH อยู่แล้ว)
    """
    found = shutil.which(name)
    if found:
        return found
    local = pathlib.Path.home() / "AppData/Local/ffmpeg"
    if local.exists():
        for d in sorted(local.glob("ffmpeg-*/bin")):
            exe = d / f"{name}.exe"
            if exe.exists():
                return str(exe)
    raise RuntimeError(
        f"ไม่พบ {name} — ติดตั้งแล้ววางไว้ใน PATH หรือที่ {local}\n"
        "วิธีเร็วสุดบน Windows: โหลด essentials build จาก gyan.dev แล้วแตกไฟล์ไว้ที่นั่น"
    )


def work_dir(project):
    """โฟลเดอร์ทำงานของคลิปหนึ่งตัว (สร้างให้ถ้ายังไม่มี)"""
    d = WORK_ROOT / project
    d.mkdir(parents=True, exist_ok=True)
    return d
