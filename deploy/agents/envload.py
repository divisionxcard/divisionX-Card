"""
โหลด env จาก deploy/.env.local โดยไม่ต้องพึ่ง python-dotenv

ใช้กับ agent ที่รันในเครื่อง (เช่นถูกเรียกจาก OpenClaw skill) — บน GitHub Actions
ไฟล์ .env.local ไม่มีอยู่แล้ว ฟังก์ชันจะเงียบ ๆ ไม่ทำอะไร (env มาจาก secrets แทน)

ค่าที่ตั้งไว้ใน environment อยู่แล้วจะไม่ถูกทับ (env จริงชนะไฟล์เสมอ)
"""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = PROJECT_ROOT / "deploy" / ".env.local"

# ชื่อ env ที่โค้ดฝั่ง scraper/agent ใช้ ↔ ชื่อที่อยู่ในไฟล์ .env.local (ฝั่ง Next.js)
ALIASES = {
    "SUPABASE_URL": "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_KEY": "SUPABASE_SERVICE_ROLE_KEY",
}


def load_env_local(path=ENV_FILE):
    """อ่าน .env.local → os.environ (best effort · ไม่ throw ถ้าไม่มีไฟล์)"""
    p = Path(path)
    if not p.exists():
        return False
    # utf-8-sig — ไฟล์ที่แก้บน Windows มักมี BOM ติดมา
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val

    # เติม alias ให้สคริปต์ที่อ่านชื่อฝั่ง server
    for want, have in ALIASES.items():
        if not os.environ.get(want) and os.environ.get(have):
            os.environ[want] = os.environ[have]
    return True
