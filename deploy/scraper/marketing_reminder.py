"""
แจ้งเตือนงานการตลาดประจำวันเข้า Telegram (แยก bot/chat จาก scraper)

Env vars (GitHub Secrets — ชุดใหม่ ไม่ปนกับ scraper):
  - TELEGRAM_MKT_BOT_TOKEN   bot สำหรับงานการตลาด (ใหม่ หรือ reuse ก็ได้)
  - TELEGRAM_MKT_CHAT_ID     chat/group ของงานการตลาด (แยกต่างหาก)

รัน:
  python deploy/scraper/marketing_reminder.py            # เลือก slot จากเวลาไทยอัตโนมัติ
  python deploy/scraper/marketing_reminder.py morning    # บังคับ slot (ทดสอบ)
"""
import os
import sys
import json
import html
import urllib.request
import urllib.error
from datetime import datetime, timedelta

BOT_TOKEN = os.environ.get("TELEGRAM_MKT_BOT_TOKEN")
CHAT_ID = os.environ.get("TELEGRAM_MKT_CHAT_ID")

CONFIG = os.path.join(os.path.dirname(__file__), "..", "tasks", "marketing_reminders.json")
QUEUE = os.path.join(os.path.dirname(__file__), "..", "tasks", "content_queue.json")

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DAY_TH = {"Mon": "จันทร์", "Tue": "อังคาร", "Wed": "พุธ", "Thu": "พฤหัสบดี",
          "Fri": "ศุกร์", "Sat": "เสาร์", "Sun": "อาทิตย์"}
MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
SLOT_TH = {"morning": "เช้า ☀️", "evening": "เย็น 🌆"}


def thai_now():
    return datetime.utcnow() + timedelta(hours=7)


def send(text):
    if not BOT_TOKEN or not CHAT_ID:
        print("[mkt-reminder] TELEGRAM_MKT_BOT_TOKEN/CHAT_ID ยังไม่ตั้ง — skip (ตั้ง secret ก่อนใช้งาน)")
        return False
    body = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print("[mkt-reminder] ส่งสำเร็จ")
        return True
    except urllib.error.HTTPError as e:
        print(f"[mkt-reminder] HTTPError {e.code}: {e.read().decode('utf-8', 'ignore')}")
        return False
    except Exception as e:
        print(f"[mkt-reminder] error: {e}")
        return False


def load_captions(slot, wd):
    """ดึงแคปชั่นจาก content_queue ที่ตรง slot + วัน (ถ้ามีไฟล์)"""
    if not os.path.exists(QUEUE):
        return []
    try:
        with open(QUEUE, encoding="utf-8") as f:
            q = json.load(f)
    except Exception:
        return []
    return [
        p for p in q.get("posts", [])
        if p.get("slot") == slot
        and (p.get("days") == "daily" or wd in (p.get("days") or []))
    ]


def main():
    now = thai_now()
    wd = WEEKDAYS[now.weekday()]

    # slot จาก argv หรือเดาจากเวลาไทย (ก่อนเที่ยง = เช้า)
    slot = sys.argv[1] if len(sys.argv) > 1 else ("morning" if now.hour < 12 else "evening")
    if slot not in ("morning", "evening"):
        print(f"[mkt-reminder] slot ไม่ถูกต้อง: {slot}")
        return

    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)

    tasks = [
        t["title"] for t in cfg.get("tasks", [])
        if t.get("slot") == slot
        and (t.get("days") == "daily" or wd in (t.get("days") or []))
    ]

    if not tasks:
        print(f"[mkt-reminder] ไม่มีงาน slot={slot} วัน {wd} — skip")
        return

    date_str = f"{DAY_TH[wd]} {now.day} {MONTH_TH[now.month]}"
    lines = "\n".join(f"▫️ {html.escape(t)}" for t in tasks)
    text = (
        f"🗓️ <b>งานการตลาดวันนี้ ({SLOT_TH[slot]})</b>\n"
        f"{date_str}\n"
        f"━━━━━━━━━━━━━\n"
        f"{lines}\n"
        f"━━━━━━━━━━━━━\n"
        f"<i>ทำเสร็จติ๊กในใจได้เลย 🎴</i>"
    )

    # แนบแคปชั่นพร้อมโพสต์จาก content queue (ระดับ 2)
    caps = load_captions(slot, wd)
    for c in caps:
        cap = (c.get("caption") or "").strip()
        if not cap:
            continue
        text += (
            f"\n\n📝 <b>แคปชั่น · {html.escape(c.get('platform', 'FB'))}</b> (ก๊อปไปโพสต์ได้เลย)\n"
            f"<code>{html.escape(cap)}</code>"
        )
        if c.get("link"):
            text += f"\n🔗 {html.escape(c['link'])} <i>(ใส่ในคอมเมนต์ ไม่ใส่ในโพสต์)</i>"

    send(text)


if __name__ == "__main__":
    main()
