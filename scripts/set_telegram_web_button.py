"""ตั้งปุ่มเมนูล่างซ้ายในแชตบอท Telegram ให้เปิดเว็บ DivisionX เป็นมินิแอป (11 พ.ย. 2026 · แบบเดียวกับบอท AssetX)

python scripts/set_telegram_web_button.py --bot owner,job        # ตั้งปุ่ม "เปิดหน้าเว็บ"
python scripts/set_telegram_web_button.py --bot job --remove     # คืนเป็นปุ่มเมนูคำสั่ง (/) เหมือนเดิม
python scripts/set_telegram_web_button.py --show                 # ดูว่าแต่ละบอทตั้งไว้อะไร

- ปุ่มนี้ขึ้นเฉพาะแชตส่วนตัวกับบอท (ในกลุ่ม Telegram ไม่แสดงปุ่มมินิแอป) · ตั้งครั้งเดียวมีผลกับทุกคนที่แชตกับบอทนั้น
- ล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านของเว็บตามปกติ — ไม่ได้ผูกกับบัญชี Telegram
- ปุ่มเว็บแทนที่ปุ่มรายการคำสั่ง · คำสั่ง /xxx ยังพิมพ์ได้เหมือนเดิม
- token อ่านจาก deploy/.env.local · ไม่พิมพ์ออกจอ
"""
import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

# Windows เครื่องนี้ ACP = cp1252 — พิมพ์ไทยตอนไม่มีคอนโซลแล้วตาย
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / "deploy" / ".env.local"
SITE = "https://division-x-card.vercel.app/"
BOTS = {                       # ชื่อเรียก → ชื่อตัวแปร token ใน .env.local
    "owner": "SYNC_BOT_TOKEN",          # @Divisionx_Owner_bot (DvX-Owner · บอทซิงค์)
    "job": "TELEGRAM_MKT_BOT_TOKEN",    # @dvx_marketing_bot (DVX Job · ทีมการตลาด + สรุปยอด)
    "alert": "TELEGRAM_BOT_TOKEN",      # @Divisionx_scynbot (แจ้งเตือนสต็อก)
}


def env_tokens():
    out = {}
    for line in ENV.read_text(encoding="utf-8-sig").splitlines():
        m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


def call(token, method, payload=None):
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}",
                                 data=json.dumps(payload or {}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.load(r)
    if not res.get("ok"):
        raise RuntimeError(res.get("description") or res)
    return res["result"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bot", default="", help="owner,job,alert หรือ all")
    ap.add_argument("--remove", action="store_true", help="คืนเป็นปุ่มเมนูคำสั่ง")
    ap.add_argument("--show", action="store_true", help="ดูอย่างเดียว")
    ap.add_argument("--text", default="เปิดหน้าเว็บ")
    ap.add_argument("--url", default=SITE)
    a = ap.parse_args()

    names = list(BOTS) if a.show or a.bot == "all" else [b.strip() for b in a.bot.split(",") if b.strip()]
    bad = [b for b in names if b not in BOTS]
    if not names or bad:
        sys.exit(f"ระบุ --bot เป็น {', '.join(BOTS)} หรือ all" + (f" (ไม่รู้จัก: {', '.join(bad)})" if bad else ""))
    if not a.url.startswith("https://"):
        sys.exit("มินิแอปต้องเป็นลิงก์ https://")
    toks = env_tokens()
    for name in names:
        token = toks.get(BOTS[name])
        if not token:
            print(f"{name}: ไม่มี {BOTS[name]} ใน deploy/.env.local — ข้าม")
            continue
        me = call(token, "getMe")["username"]
        now = call(token, "getChatMenuButton")
        if not a.show:
            button = ({"type": "commands"} if a.remove else
                      {"type": "web_app", "text": a.text, "web_app": {"url": a.url}})
            call(token, "setChatMenuButton", {"menu_button": button})
            # Telegram ตอบ ok ทันทีแต่อ่านกลับได้ค่าใหม่หลัง ~10–15 วิ (ลอง 11 พ.ย.) — รอก่อน ไม่งั้นนึกว่าตั้งไม่ติด
            for _ in range(10):
                now = call(token, "getChatMenuButton")
                if now.get("type") == button["type"]:
                    break
                time.sleep(3)
        print(f"{name} (@{me}): {json.dumps(now, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
