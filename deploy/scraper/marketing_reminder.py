"""
แจ้งเตือนงานการตลาดประจำวันเข้า Telegram (แยก bot/chat จาก scraper)

แหล่งแคปชั่นมี 2 ชั้น — **DB มาก่อนเสมอ**:
  1. marketing_content ที่ status='approved' และยังไม่ได้โพสต์  ← ของจริงจากหน้า /marketing
  2. content_queue.json (template หมุนตามวัน)                   ← ใช้เฉพาะตอน DB ไม่มีของ

ทำแบบนี้เพื่อไม่ให้มีแหล่งความจริง 2 ที่พร้อมกัน — ถ้าอนุมัติของไว้แล้ว
ต้องเห็นของนั้น ไม่ใช่ template เก่าที่ยังเขียนว่า "11 สาขา"

Env vars (GitHub Secrets — ชุดใหม่ ไม่ปนกับ scraper):
  - TELEGRAM_MKT_BOT_TOKEN   bot สำหรับงานการตลาด (ใหม่ หรือ reuse ก็ได้)
  - TELEGRAM_MKT_CHAT_ID     chat/group ของงานการตลาด (แยกต่างหาก)
  - SUPABASE_URL / SUPABASE_SERVICE_KEY   สำหรับดึงคอนเทนต์ที่อนุมัติแล้ว

รัน:
  python deploy/scraper/marketing_reminder.py            # เลือก slot จากเวลาไทยอัตโนมัติ
  python deploy/scraper/marketing_reminder.py morning    # บังคับ slot (ทดสอบ)
  python deploy/scraper/marketing_reminder.py --dry-run  # พิมพ์ข้อความออกจอ ไม่ส่งเข้ากลุ่ม
"""
import os
import re
import sys
import json
import html
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

BOT_TOKEN = os.environ.get("TELEGRAM_MKT_BOT_TOKEN")
CHAT_ID = os.environ.get("TELEGRAM_MKT_CHAT_ID")

# .strip() กัน \r ที่ติดมาจากไฟล์ .env แบบ CRLF — ไม่งั้นจะได้ error
# "URL can't contain control characters" ซึ่งอ่านแล้วไม่รู้เลยว่าเกิดจากอะไร
SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
SB_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

# ส่งทีละไม่เกินเท่านี้ — ถ้ายิงหมดทีเดียวข้อความจะยาวจนไม่มีใครอ่าน
# ที่เหลือจะตามมารอบหน้า (ของที่กด "โพสต์แล้ว" จะหลุดออกจากคิวเอง)
MAX_PER_MESSAGE = 3

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


def fetch_approved():
    """คอนเทนต์ที่อนุมัติแล้วแต่ยังไม่ได้โพสต์ — เก่าสุดขึ้นก่อน

    คืน (รายการที่จะส่งรอบนี้, จำนวนคงค้างทั้งหมด)
    เงื่อนไข posted_at is null สำคัญ — ถ้าใช้แค่ status จะส่งซ้ำของที่โพสต์ไปแล้ว
    """
    if not SB_URL or not SB_KEY:
        print("[mkt-reminder] ไม่มี SUPABASE_URL/SERVICE_KEY — ข้ามคอนเทนต์จาก DB")
        return [], 0
    q = ("marketing_content?status=eq.approved&posted_at=is.null"
         "&select=id,caption,platform,media_url,source_reason,source_sku,created_at"
         "&order=created_at.asc")
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{q}",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            rows = json.load(r)
    except Exception as e:
        print(f"[mkt-reminder] ดึงคอนเทนต์จาก DB ไม่ได้: {e}")
        return [], 0
    return rows[:MAX_PER_MESSAGE], len(rows)


def render_approved(rows, total):
    """แคปชั่นจาก DB — ใส่ id ไว้ด้วยเพื่อให้อ้างอิงกลับไปที่หน้าเว็บได้"""
    PLAT = {"fb": "Facebook", "ig": "Instagram", "line": "LINE", "tiktok": "TikTok"}
    out = ""
    for c in rows:
        cap = (c.get("caption") or "").strip()
        if not cap:
            continue
        plat = PLAT.get(c.get("platform"), c.get("platform") or "FB")
        # บางแคปชั่น (โดยเฉพาะที่ seed มาจาก template) ยังมีช่องว่าง {ชื่อการ์ด} {สาขา}
        # ค้างอยู่ — ถ้าก๊อปไปโพสต์ทั้งอย่างนั้นจะเสียหาย เลยต้องเตือนให้ชัดก่อน
        holes = re.findall(r"\{[^}]{1,40}\}", cap)
        out += (
            f"\n\n📝 <b>{html.escape(plat)}</b> · <code>#{c['id']}</code>"
            f"{' · ' + html.escape(c['source_sku']) if c.get('source_sku') else ''}\n"
        )
        if holes:
            out += f"⚠️ <b>ยังมีช่องว่างต้องเติมก่อนโพสต์:</b> {html.escape(', '.join(holes))}\n"
        out += f"<code>{html.escape(cap)}</code>"
        if c.get("media_url"):
            out += f"\n🖼️ รูป: {html.escape(c['media_url'])}"
    if not out:
        return ""
    left = total - len(rows)
    out += "\n\n━━━━━━━━━━━━━\n"
    if left > 0:
        out += f"<i>ยังมีอีก {left} ชิ้นรออยู่ — จะทยอยส่งรอบถัดไป</i>\n"
    out += "<i>โพสต์แล้วอย่าลืมกด “โพสต์แล้ว” ในหน้า /marketing ไม่งั้นจะถูกส่งซ้ำ</i>"
    return out


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

    args = [a for a in sys.argv[1:] if a]
    dry = "--dry-run" in args
    args = [a for a in args if not a.startswith("--")]

    # slot จาก argv หรือเดาจากเวลาไทย (ก่อนเที่ยง = เช้า)
    slot = args[0] if args else ("morning" if now.hour < 12 else "evening")
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

    # ดึงของที่อนุมัติแล้วก่อน — เป็นเหตุผลหลักที่ต้องส่งข้อความรอบนี้
    approved, total_approved = fetch_approved()
    body_approved = render_approved(approved, total_approved)

    # เดิม: ไม่มี task ของ slot นี้ = จบเลย
    # ตอนนี้ถ้ามีคอนเทนต์รออนุมัติค้างอยู่ ต้องส่งถึงมืออยู่ดี ไม่งั้นของที่อนุมัติแล้วจะค้างเงียบ
    if not tasks and not body_approved:
        print(f"[mkt-reminder] ไม่มีงาน slot={slot} วัน {wd} และไม่มีคอนเทนต์รอโพสต์ — skip")
        return

    date_str = f"{DAY_TH[wd]} {now.day} {MONTH_TH[now.month]}"
    text = f"🗓️ <b>งานการตลาดวันนี้ ({SLOT_TH[slot]})</b>\n{date_str}\n"
    if tasks:
        lines = "\n".join(f"▫️ {html.escape(t)}" for t in tasks)
        text += (
            f"━━━━━━━━━━━━━\n{lines}\n━━━━━━━━━━━━━\n"
            f"<i>ทำเสร็จติ๊กในใจได้เลย 🎴</i>"
        )

    if body_approved:
        # ของจริงที่ผ่านตาเจ้าของมาแล้ว
        text += f"\n\n✅ <b>อนุมัติแล้ว รอโพสต์ ({total_approved} ชิ้น)</b>" + body_approved
    else:
        # ไม่มีของใน DB → ค่อยใช้ template หมุนตามวัน (ระดับ 2)
        for c in load_captions(slot, wd):
            cap = (c.get("caption") or "").strip()
            if not cap:
                continue
            text += (
                f"\n\n📝 <b>แคปชั่น · {html.escape(c.get('platform', 'FB'))}</b> (ก๊อปไปโพสต์ได้เลย)\n"
                f"<code>{html.escape(cap)}</code>"
            )
            if c.get("link"):
                text += f"\n🔗 {html.escape(c['link'])} <i>(ใส่ในคอมเมนต์ ไม่ใส่ในโพสต์)</i>"

    if dry:
        print("──── ข้อความที่จะส่ง (dry-run ไม่ได้ส่งจริง) ────")
        print(text)
        print(f"──── จบ · {len(text)} ตัวอักษร ────")
        return
    send(text)


if __name__ == "__main__":
    main()
