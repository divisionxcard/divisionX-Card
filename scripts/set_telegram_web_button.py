"""ปุ่มเปิดเว็บ DivisionX เป็นมินิแอปใน Telegram (11 พ.ย. 2026 · แบบเดียวกับบอท AssetX)

แชตส่วนตัวกับบอท — ปุ่มเมนูล่างซ้าย:
python scripts/set_telegram_web_button.py --bot owner,job        # ตั้งปุ่ม "เปิดหน้าเว็บ"
python scripts/set_telegram_web_button.py --bot job --remove     # คืนเป็นปุ่มเมนูคำสั่ง (/) เหมือนเดิม
python scripts/set_telegram_web_button.py --show                 # ดูว่าแต่ละบอทตั้งไว้อะไร + เปิดแอปหลักแล้วหรือยัง

กลุ่ม DVX_Admin (เจ้าของต้องการที่นี่) — Telegram ไม่ให้ปุ่มเมนู/ปุ่ม web_app ในกลุ่ม ทางเดียวคือปุ่มลิงก์
t.me/dvx_marketing_bot?startapp → เปิด "แอปหลัก" ของบอท (Main Mini App · เจ้าของต้องเปิดใน BotFather เอง ไม่มี API):
python scripts/set_telegram_web_button.py --group-panel          # แก้แผงที่ปักหมุดอยู่ (ไม่โพสต์ใหม่) — ปุ่มเดียว โชว์บนแถบปักหมุด
python scripts/set_telegram_web_button.py --group-remove-keyboard  # ถอดแผงปุ่มใต้ช่องพิมพ์ (โพสต์ 1 ข้อความ · เจ้าของเลือก 11 พ.ย.)
python scripts/set_telegram_web_button.py --group-keyboard       # เอาแผงปุ่มใต้ช่องพิมพ์กลับมา (โพสต์ 1 ข้อความ)
  ปุ่มใต้ช่องพิมพ์ในกลุ่มเปิดมินิแอปตรงไม่ได้ (KeyboardButton.web_app ใช้ได้แค่แชตส่วนตัว) — กดแล้วส่งข้อความ บอทต้องตอบ
  จึงถอดออก ใช้ปุ่มบนแถบปักหมุดแทน · ข้อความถอดแผงห้ามลบ — ลบแล้วบางแอปอาจกลับไปโชว์แผงเก่า

- ล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านของเว็บตามปกติ — ไม่ได้ผูกกับบัญชี Telegram
- ปุ่มเมนูแชตส่วนตัวแทนที่ปุ่มรายการคำสั่ง · คำสั่ง /xxx ยังพิมพ์ได้เหมือนเดิม
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
    "job": "TELEGRAM_MKT_BOT_TOKEN",    # @dvx_marketing_bot (DVX Job · ทีมการตลาด + สรุปยอด · อยู่ในกลุ่ม DVX_Admin)
    "alert": "TELEGRAM_BOT_TOKEN",      # @Divisionx_scynbot (แจ้งเตือนสต็อก)
}
GROUP_ENV = "TELEGRAM_DVX_ADMIN_CHAT_ID"
MINI_APP = "https://t.me/dvx_marketing_bot?startapp"
# แผงที่ปักหมุดต้องมีปุ่ม "ปุ่มเดียว" (1 แถว × 1 ปุ่ม) — แอป Telegram (มือถือ/คอม/เว็บ) ถึงจะโชว์ปุ่มนั้นบนแถบปักหมุดด้านบน
# กดครั้งเดียวมินิแอปเด้ง ไม่มีข้อความตอบ (ค้นจากซอร์สแอป 11 พ.ย. 2026) · ลิงก์สำรองจึงอยู่ในตัวข้อความแทนปุ่มที่สอง
# · Telegram Desktop ถามยืนยันทุกครั้งที่กดปุ่มของบอทที่ไม่ verified — ลิงก์ที่เห็นเป็นตัวอักษรถามแค่ครั้งแรก
# ⚠️ ปุ่มใต้ช่องพิมพ์ต้องตรงกับ deploy/app/api/telegram/mkt-webhook/route.js (WEB_BUTTON_TEXT)
GROUP_TEXT = ("🎛 <b>แผงควบคุม DivisionX</b>\n"
              "กด <b>🌐 เปิดหน้าเว็บ</b> (ปุ่มบนแถบปักหมุดด้านบน) — หน้าเว็บเด้งขึ้นในแอป Telegram "
              "ล็อกอินด้วยชื่อผู้ใช้ได้เลย (ยังไม่มีบัญชีแจ้งเจ้าของ)\n\n"
              f"💻 บนคอม กดลิงก์นี้ ถามยืนยันแค่ครั้งแรก: {MINI_APP}\n"
              f"🧭 เปิดในเบราว์เซอร์: {SITE}")
GROUP_BUTTONS = {"inline_keyboard": [[{"text": "🌐 เปิดหน้าเว็บ", "url": MINI_APP}]]}
NO_PREVIEW = {"is_disabled": True}
KEYBOARD_TEXT = "🌐 เปิดหน้าเว็บ @dvx_marketing_bot"   # ต้องมีชื่อบอท — Hermes ในกลุ่มข้ามข้อความที่ระบุบอทอื่น


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


def group(toks, a):
    token, chat = toks.get(BOTS["job"]), toks.get(GROUP_ENV)
    if not token or not chat:
        sys.exit(f"ไม่มี {BOTS['job']} หรือ {GROUP_ENV} ใน deploy/.env.local")
    me = call(token, "getMe")
    if not me.get("has_main_web_app") and not a.force:
        sys.exit("บอทยังไม่ได้เปิดแอปหลัก (Main Mini App) ใน BotFather — ปุ่ม t.me/…?startapp จะแค่เปิดแชตบอท "
                 "ไม่ใช่มินิแอป · ตั้งให้เสร็จก่อน (หรือใส่ --force)")
    if a.group_panel:
        pin = call(token, "getChat", {"chat_id": chat}).get("pinned_message") or {}
        if (pin.get("from") or {}).get("id") == me["id"]:
            call(token, "editMessageText", {"chat_id": chat, "message_id": pin["message_id"], "text": GROUP_TEXT,
                                            "parse_mode": "HTML", "link_preview_options": NO_PREVIEW,
                                            "reply_markup": GROUP_BUTTONS})
            print(f"แก้ข้อความที่ปักหมุด #{pin['message_id']} แล้ว")
        else:
            msg = call(token, "sendMessage", {"chat_id": chat, "text": GROUP_TEXT, "parse_mode": "HTML",
                                              "link_preview_options": NO_PREVIEW, "reply_markup": GROUP_BUTTONS})
            call(token, "pinChatMessage", {"chat_id": chat, "message_id": msg["message_id"], "disable_notification": True})
            print(f"ข้อความที่ปักหมุดไม่ใช่ของบอทนี้ — ส่งใหม่แล้วปักหมุด #{msg['message_id']}")
    if a.group_keyboard:
        call(token, "sendMessage", {"chat_id": chat, "parse_mode": "HTML",
                                    "text": f"🎛 แผงปุ่มใหม่ — กด <b>{KEYBOARD_TEXT}</b> ด้านล่างช่องพิมพ์ได้เลย",
                                    "reply_markup": {"keyboard": [[{"text": KEYBOARD_TEXT}]],
                                                     "resize_keyboard": True, "is_persistent": True}})
        print("ส่งแผงปุ่มใต้ช่องพิมพ์ชื่อใหม่แล้ว")
    if a.group_remove_keyboard:
        msg = call(token, "sendMessage", {"chat_id": chat, "parse_mode": "HTML",
                                          "text": "🎛 ถอดปุ่มใต้ช่องพิมพ์แล้ว — เปิดหน้าเว็บได้ที่ปุ่ม <b>🌐 เปิดหน้าเว็บ</b> "
                                                  "บนแถบปักหมุดด้านบนของกลุ่ม กดครั้งเดียวหน้าเว็บเด้งขึ้นมาเลย",
                                          "reply_markup": {"remove_keyboard": True}})
        print(f"ถอดแผงปุ่มใต้ช่องพิมพ์แล้ว (ข้อความ #{msg['message_id']} — อย่าลบ)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bot", default="", help="owner,job,alert หรือ all")
    ap.add_argument("--remove", action="store_true", help="คืนเป็นปุ่มเมนูคำสั่ง")
    ap.add_argument("--show", action="store_true", help="ดูอย่างเดียว")
    ap.add_argument("--group-panel", action="store_true", help="แก้ปุ่มในแผงที่ปักหมุดในกลุ่ม DVX_Admin")
    ap.add_argument("--group-keyboard", action="store_true", help="ส่งแผงปุ่มใต้ช่องพิมพ์ชื่อใหม่เข้ากลุ่ม DVX_Admin")
    ap.add_argument("--group-remove-keyboard", action="store_true", help="ถอดแผงปุ่มใต้ช่องพิมพ์ในกลุ่ม DVX_Admin")
    ap.add_argument("--force", action="store_true", help="ทำกับกลุ่มแม้บอทยังไม่เปิดแอปหลัก")
    ap.add_argument("--text", default="เปิดหน้าเว็บ")
    ap.add_argument("--url", default=SITE)
    a = ap.parse_args()

    toks = env_tokens()
    if a.group_panel or a.group_keyboard or a.group_remove_keyboard:
        group(toks, a)
        return
    names = list(BOTS) if a.show or a.bot == "all" else [b.strip() for b in a.bot.split(",") if b.strip()]
    bad = [b for b in names if b not in BOTS]
    if not names or bad:
        sys.exit(f"ระบุ --bot เป็น {', '.join(BOTS)} หรือ all" + (f" (ไม่รู้จัก: {', '.join(bad)})" if bad else ""))
    if not a.url.startswith("https://"):
        sys.exit("มินิแอปต้องเป็นลิงก์ https://")
    for name in names:
        token = toks.get(BOTS[name])
        if not token:
            print(f"{name}: ไม่มี {BOTS[name]} ใน deploy/.env.local — ข้าม")
            continue
        me = call(token, "getMe")
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
        print(f"{name} (@{me['username']}): เมนู {json.dumps(now, ensure_ascii=False)} · แอปหลัก {bool(me.get('has_main_web_app'))}")


if __name__ == "__main__":
    main()
