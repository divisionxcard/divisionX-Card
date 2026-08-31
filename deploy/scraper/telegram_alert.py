"""
Telegram alert helpers สำหรับ scraper (Python)
Env vars ที่ต้องตั้งใน GitHub Secrets:
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_ADMIN_CHAT_ID
  - TELEGRAM_OWNER_CHAT_ID
"""
import os
import json
import urllib.request
import urllib.error
import html as _html
from datetime import datetime

BOT_TOKEN     = os.environ.get("TELEGRAM_BOT_TOKEN")
ADMIN_CHAT_ID = os.environ.get("TELEGRAM_ADMIN_CHAT_ID")
OWNER_CHAT_ID = os.environ.get("TELEGRAM_OWNER_CHAT_ID")

API = lambda method: f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"


def _esc(s):
    return _html.escape(str(s)) if s is not None else "—"


def send_message(chat_id, text, reply_markup=None, parse_mode="HTML"):
    """Low-level send. Returns dict (telegram response) or None if no token."""
    if not BOT_TOKEN:
        print("[telegram] TELEGRAM_BOT_TOKEN not set — skip send")
        return None
    if not chat_id:
        print("[telegram] chat_id is empty — skip send")
        return None
    body = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    if reply_markup:
        body["reply_markup"] = reply_markup
    req = urllib.request.Request(
        API("sendMessage"),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")
        except Exception:
            err_body = ""
        print(f"[telegram] HTTPError {e.code}: {err_body}")
        return None
    except Exception as e:
        print(f"[telegram] error: {e}")
        return None


def alert_slot_change(history_id, machine_id, machine_name, slot_number,
                      old_product, new_product, qty_remain=None):
    """ส่งไปกลุ่ม Admin · มี inline button ยืนยัน/Bug (single-event · legacy)"""
    text = (
        f"🔄 <b>Slot Product เปลี่ยน</b>\n\n"
        f"<b>{_esc(machine_name or machine_id)}</b> · ช่อง <code>{_esc(slot_number)}</code>\n"
        f"จาก: <s>{_esc(old_product)}</s>\n"
        f"เป็น: <b>{_esc(new_product)}</b>\n"
    )
    if qty_remain is not None:
        text += f"สต็อกเก่าค้าง: <b>{qty_remain}</b> packs\n"
    text += "\n<i>กดยืนยันถ้าตั้งใจ · หรือ Bug ถ้าผิดพลาด</i>"

    keyboard = {
        "inline_keyboard": [[
            {"text": "✅ ยืนยัน (ตั้งใจ)", "callback_data": f"slot_confirm:{history_id}"},
            {"text": "🚩 Bug",            "callback_data": f"slot_flag:{history_id}"},
        ]]
    }
    return send_message(ADMIN_CHAT_ID, text, reply_markup=keyboard)


PAGESLOTS_URL = os.environ.get("DVX_BASE_URL", "https://division-x-card.vercel.app") + "/?page=slots"
INITIAL_DETAIL_LINES = 5  # initial alert แสดง · ที่เหลือซ่อนหลังปุ่ม "ดูทั้งหมด"
MAX_DETAIL_LINES = 25     # expanded message limit (กัน Telegram 4096 char cap)


def alert_slot_changes_batch(machine_id, machine_name, changes, synced_at_unix):
    """ส่ง 1 ข้อความรวมการเปลี่ยน slot ทั้งหมดของ machine นี้ใน 1 sync
    changes: list of dict {slot_number, old_product, new_product, history_id}
    synced_at_unix: int (unix epoch · ใช้ใน callback batch window)
    """
    if not changes:
        return None
    total = len(changes)
    # เรียงตาม slot_number ascending (numeric-aware)
    def slot_key(c):
        s = str(c.get("slot_number") or "")
        try:
            return (0, int(s))
        except ValueError:
            return (1, s)
    changes_sorted = sorted(changes, key=slot_key)

    # machines.name มี "ตู้" prefix แล้ว · ห้ามใส่ "ตู้ " ซ้ำ
    machine_label = machine_name if machine_name else f"ตู้ {machine_id}"
    header = (
        f"🔄 <b>Slot Product เปลี่ยน {total} รายการ</b>\n"
        f"<b>{_esc(machine_label)}</b>\n"
    )
    initial = min(INITIAL_DETAIL_LINES, total)
    lines = []
    for c in changes_sorted[:initial]:
        lines.append(
            f"\nช่อง <code>{_esc(c.get('slot_number'))}</code>\n"
            f"จาก: {_esc(c.get('old_product') or '—')} → เป็น: <b>{_esc(c.get('new_product') or '—')}</b>"
        )
    text = header + "".join(lines)
    has_more = total > initial
    if has_more:
        text += f"\n\n<i>...อีก {total - initial} รายการ (กด \"ดูทั้งหมด\")</i>"

    buttons = []
    if has_more:
        buttons.append([{"text": f"📜 ดูทั้งหมด {total} รายการ", "callback_data": f"slot_expand:{machine_id}:{synced_at_unix}"}])
    buttons.append([{"text": f"✅ ยืนยันทั้ง {total} รายการ", "callback_data": f"slot_confirm_batch:{machine_id}:{synced_at_unix}"}])
    buttons.append([{"text": "📋 ดูในหน้าจัดการ Slot", "url": PAGESLOTS_URL}])
    return send_message(ADMIN_CHAT_ID, text, reply_markup={"inline_keyboard": buttons})


def alert_ship_fail(ship_fail_id, machine_id, machine_name, sku_id, qty,
                    order_id=None, sold_at=None):
    """ส่งไปกลุ่ม Admin · ปุ่ม resolve"""
    text = (
        f"📦 <b>WW Ship Fail</b>\n\n"
        f"<b>{_esc(machine_name or machine_id)}</b>\n"
        f"SKU: <code>{_esc(sku_id)}</code> × <b>{qty}</b>\n"
    )
    if order_id:
        text += f"Order: <code>{_esc(order_id)}</code>\n"
    if sold_at:
        text += f"ขายเมื่อ: {_esc(sold_at)}\n"
    text += "\n<i>WW ส่งของไม่สำเร็จ · admin ต้อง claim/refund</i>"

    keyboard = {
        "inline_keyboard": [[
            {"text": "✅ จัดการแล้ว (resolve)", "callback_data": f"ship_resolve:{ship_fail_id}"},
        ]]
    }
    return send_message(ADMIN_CHAT_ID, text, reply_markup=keyboard)


def alert_cron_fail(job_name, error_message, run_url=None):
    """ส่งไปกลุ่ม Owner · cron พัง"""
    err = (error_message or "")[:500]
    text = (
        f"🚨 <b>Cron Scraper FAIL</b>\n\n"
        f"Job: <code>{_esc(job_name)}</code>\n"
        f"Error: {_esc(err)}\n"
    )
    if run_url:
        text += f'\n<a href="{_esc(run_url)}">ดู log บน GitHub</a>'
    return send_message(OWNER_CHAT_ID, text)


def alert_stock_low(items):
    """ส่งไปกลุ่ม Admin · daily 9:00 summary
    items: list of dict {machine_id, machine_name, slot_number, product_name, sku_id, remain, max_capacity}
    """
    if not items:
        return None
    lines = []
    for i in items[:25]:
        m = i.get("machine_name") or i.get("machine_id")
        lines.append(
            f"• <b>{_esc(m)}</b> ช่อง <code>{_esc(i.get('slot_number'))}</code> · "
            f"{_esc(i.get('product_name') or i.get('sku_id'))} · "
            f"เหลือ <b>{i.get('remain', 0)}</b>/{i.get('max_capacity') or '?'}"
        )
    text = f"⚠️ <b>Stock หน้าตู้ต่ำ ({len(items)} ช่อง)</b>\n\n" + "\n".join(lines)
    if len(items) > 25:
        text += f"\n\n<i>...และอีก {len(items) - 25} ช่อง</i>"
    return send_message(ADMIN_CHAT_ID, text)


def alert_product_swaps(machine_id, machine_name, removed, added,
                        platform=None, synced_at=None):
    """ตู้ WorldWide / Payif — แจ้งเมื่อมีสินค้าเข้าหรือออกจากตู้

    ทำไมต้องมีตัวนี้แยกจาก alert_slot_changes_batch:
      ตัวนั้นผูกกับ slot_products_history (มีปุ่มยืนยันที่อ้าง history_id)
      ซึ่งมีข้อมูลเฉพาะตู้ VMS · ตู้ WW/Payif ไม่มีแถวในตารางนั้นเลย ปุ่มจะกดไม่ได้
      และตัวนั้นคิดเป็น "ช่องนี้เปลี่ยนจาก A เป็น B" ส่วนฝั่ง WW รวมยอดต่อ SKU
      สินค้าตัวเดียวอยู่ได้หลายช่อง จึงเล่าเป็น "ออกอะไร เข้าอะไร" แทน

    removed: [{product_name, sku_id, qty_left, slots}]
    added:   [{product_name, sku_id, qty, slots}]
    """
    if not removed and not added:
        return None

    def slot_txt(slots):
        if not slots:
            return ""
        return " ช่อง <code>" + _esc(", ".join(str(s) for s in slots)) + "</code>"

    label = machine_name if machine_name else f"ตู้ {machine_id}"
    parts = [f"🔄 <b>เปลี่ยนสินค้าหน้าตู้</b>\n<b>{_esc(label)}</b>\n"]

    if removed:
        parts.append(f"\n<b>เอาออก {len(removed)} รายการ</b>")
        for r in removed:
            left = r.get("qty_left") or 0
            # ของที่ยังเหลือตอนถอด = อาจถูกยกกลับมา ต้องเห็นชัดว่าไม่ใช่ของหมดพอดี
            warn = f" · <b>เหลือ {left}</b> ⚠️" if left else " · หมดพอดี"
            parts.append(f"\n➖ {_esc(r.get('product_name') or r.get('sku_id') or '—')}"
                         f"{slot_txt(r.get('slots'))}{warn}")

    if added:
        parts.append(f"\n\n<b>ใส่เข้า {len(added)} รายการ</b>")
        for a in added:
            parts.append(f"\n➕ {_esc(a.get('product_name') or a.get('sku_id') or '—')}"
                         f"{slot_txt(a.get('slots'))} · เริ่มที่ {a.get('qty') or 0}")

    # sku_id ว่าง = ตัวจับคู่ชื่อยังไม่รู้จักสินค้านี้ → ยอดขายจะหายทั้งแถว ต้องรีบแก้
    unmapped = [x.get("product_name") for x in added if not x.get("sku_id")]
    if unmapped:
        parts.append("\n\n⚠️ <b>ยังจับคู่ SKU ไม่ได้</b> — ยอดขายของตัวนี้จะไม่เข้าระบบ\n")
        parts.append(", ".join(_esc(u or "—") for u in unmapped))

    if synced_at:
        parts.append(f"\n\n<i>ตรวจพบจากการซิงค์ {_esc(str(synced_at)[:16])}</i>")

    buttons = [[{"text": "📋 ดูสต็อกหน้าตู้", "url": PAGESLOTS_URL}]]
    return send_message(ADMIN_CHAT_ID, "".join(parts),
                        reply_markup={"inline_keyboard": buttons})


def overfilled_text(machine_id, machine_name, items, cap, synced_at=None):
    """ข้อความเตือน "หน้าตู้จริงมีของเกินเพดาน" — แยกออกมาให้ทดสอบได้โดยไม่ต้องยิงจริง"""
    label = machine_name or f"ตู้ {machine_id}"
    parts = [
        f"📦 <b>หน้าตู้มีของเกินเพดาน {cap} ซอง/ช่อง</b>\n<b>{_esc(label)}</b>\n",
        f"\nพบ {len(items)} ช่อง — ระบบตั้งเพดานไว้ {cap} แต่หลังบ้านของตู้รายงานมากกว่านั้น\n",
    ]
    for i in items[:20]:
        rep = i.get("reported_capacity")
        # บอกความจุที่ตู้รายงานด้วย จะได้แยกออกว่า "เติมเกินนโยบาย" กับ "ตู้ตั้งค่ามาแบบนี้"
        rep_txt = f" · ตู้บอกจุ {rep}" if rep else ""
        parts.append(
            f"\n• ช่อง <code>{_esc(i.get('slot_number'))}</code> "
            f"{_esc(i.get('product_name') or i.get('sku_id') or '—')} · "
            f"มีจริง <b>{i.get('remain')}</b> (เกิน {i.get('over')}){rep_txt}"
        )
    if len(items) > 20:
        parts.append(f"\n\n<i>...และอีก {len(items) - 20} ช่อง</i>")
    # ต้องบอกด้วยว่ามันทำให้ตัวเลขอะไรเพี้ยน ไม่งั้นอ่านแล้วไม่รู้ว่าต้องรีบแค่ไหน
    parts.append("\n\n⚠️ ช่องพวกนี้จะถูกคิดว่า <b>เต็มแล้ว</b> ในใบจัดของ "
                 "และสต็อกในระบบจะน้อยกว่าของจริง")
    if synced_at:
        parts.append(f"\n\n<i>ตรวจพบจากการซิงค์ {_esc(str(synced_at)[:16])}</i>")
    return "".join(parts)


def alert_slot_overfilled(machine_id, machine_name, items, cap, synced_at=None):
    """ส่งเข้ากลุ่ม Admin เมื่อของจริงหน้าตู้เกินเพดานที่เราตั้งไว้

    items: จาก slot_capacity.find_overfilled()
    ⚠️ ส่งทุกครั้งที่ยังเกินอยู่ ไม่ใช่ส่งครั้งเดียว — ตราบใดที่ยังไม่จัดการ
       ใบจัดของก็ยังผิดอยู่ทุกวัน การเงียบไปหลังเตือนครั้งแรกคือปล่อยให้ลืม
    """
    if not items:
        return None
    buttons = [[{"text": "📋 ดูสต็อกหน้าตู้", "url": PAGESLOTS_URL}]]
    return send_message(ADMIN_CHAT_ID,
                        overfilled_text(machine_id, machine_name, items, cap, synced_at),
                        reply_markup={"inline_keyboard": buttons})


if __name__ == "__main__":
    # Smoke test (run python telegram_alert.py)
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        send_message(OWNER_CHAT_ID or ADMIN_CHAT_ID,
                     f"🧪 <b>Test</b> · DvX Telegram alert {datetime.now().isoformat()}")
