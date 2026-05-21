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
        f"<b>{_esc(machine_name or machine_id)}</b> · slot <code>{_esc(slot_number)}</code>\n"
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


PAGESLOTS_URL = os.environ.get("DVX_BASE_URL", "https://division-x-card.vercel.app") + "/"
MAX_DETAIL_LINES = 25


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

    header = (
        f"🔄 <b>Slot Product เปลี่ยน {total} รายการ</b>\n"
        f"ตู้ <b>{_esc(machine_name or machine_id)}</b>\n"
    )
    lines = []
    for c in changes_sorted[:MAX_DETAIL_LINES]:
        lines.append(
            f"\nslot <code>{_esc(c.get('slot_number'))}</code>\n"
            f"จาก: {_esc(c.get('old_product') or '—')} → เป็น: <b>{_esc(c.get('new_product') or '—')}</b>"
        )
    text = header + "".join(lines)
    if total > MAX_DETAIL_LINES:
        text += f"\n\n<i>...อีก {total - MAX_DETAIL_LINES} รายการ (ดูเต็มใน PageSlots)</i>"

    keyboard = {
        "inline_keyboard": [
            [{"text": f"✅ ยืนยันทั้ง {total} รายการ", "callback_data": f"slot_confirm_batch:{machine_id}:{synced_at_unix}"}],
            [{"text": "📋 ดูในหน้าจัดการ Slot", "url": PAGESLOTS_URL}],
        ]
    }
    return send_message(ADMIN_CHAT_ID, text, reply_markup=keyboard)


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
            f"• <b>{_esc(m)}</b> slot <code>{_esc(i.get('slot_number'))}</code> · "
            f"{_esc(i.get('product_name') or i.get('sku_id'))} · "
            f"เหลือ <b>{i.get('remain', 0)}</b>/{i.get('max_capacity') or '?'}"
        )
    text = f"⚠️ <b>Stock หน้าตู้ต่ำ ({len(items)} ช่อง)</b>\n\n" + "\n".join(lines)
    if len(items) > 25:
        text += f"\n\n<i>...และอีก {len(items) - 25} รายการ</i>"
    return send_message(ADMIN_CHAT_ID, text)


if __name__ == "__main__":
    # Smoke test (run python telegram_alert.py)
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        send_message(OWNER_CHAT_ID or ADMIN_CHAT_ID,
                     f"🧪 <b>Test</b> · DvX Telegram alert {datetime.now().isoformat()}")
