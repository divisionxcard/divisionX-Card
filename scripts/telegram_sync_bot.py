#!/usr/bin/env python3
"""บอทปุ่มซิงค์ในห้อง Telegram — รันจากเครื่องนี้ ระหว่าง GitHub Actions ใช้ไม่ได้

ทำไมต้องเป็นบอทตัวใหม่ ไม่ใช้บอทแอดมินเดิม (11 ก.ย. 2026):
    บอทเดิมตั้ง webhook ชี้ Vercel ไว้แล้ว (ปุ่มยืนยัน slot ใช้อยู่) — Telegram
    ให้บอทหนึ่งตัวรับข้อความได้ทางเดียว จะมา getUpdates ซ้อนไม่ได้ (409)
    และระหว่างบัญชี GitHub โดนแฟล็ก เราแก้โค้ดฝั่ง Vercel ไม่ได้ด้วย
    (push ไม่ deploy — Vercel มองไม่เห็น repo)

การทำงาน:
    - long-poll getUpdates ด้วย token ของบอทซิงค์ (SYNC_BOT_TOKEN ใน deploy/.env.local)
    - /start ครั้งแรกในกลุ่มไหน = ผูกบอทกับกลุ่มนั้น (จำใน scripts/.sync_bot_state.json)
      หลังผูกแล้วรับคำสั่งจากกลุ่มนั้นกลุ่มเดียว — กลุ่ม/คนอื่นส่งมาโดนเมิน
    - ปุ่มถาวร (reply keyboard): ซิงค์สต็อก / ซิงค์ทั้งหมด · หรือพิมพ์ /stock /sync /sales
    - รันจริงผ่าน scripts/sync_local.py (ตัวเดียวกับที่ workflow ใช้) ทีละงาน ห้ามซ้อน

รัน:  .venv-image\\Scripts\\python.exe scripts\\telegram_sync_bot.py
"""
import html as _html
import json
import pathlib
import subprocess
import sys
import threading
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "deploy" / ".env.local"
STATE_FILE = pathlib.Path(__file__).parent / ".sync_bot_state.json"
SYNC_SCRIPT = pathlib.Path(__file__).parent / "sync_local.py"

BTN_STOCK = "🔄 ซิงค์สต็อกหน้าตู้"
BTN_ALL = "📊 ซิงค์ทั้งหมด (ยอดขาย+สต็อก)"
KEYBOARD = {"keyboard": [[{"text": BTN_STOCK}], [{"text": BTN_ALL}]],
            "resize_keyboard": True, "is_persistent": True}


def env(key):
    if ENV_FILE.exists():
        # utf-8-sig: เผื่อไฟล์ถูกเซฟแบบมี BOM (เครื่องมือบน Windows ชอบแอบใส่)
        # ไม่งั้นคีย์บรรทัดแรกจะมี ﻿ นำหน้าแล้วหาไม่เจอแบบเงียบ ๆ
        for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip()
    return None


TOKEN = env("SYNC_BOT_TOKEN")
if not TOKEN:
    print("ยังไม่มี SYNC_BOT_TOKEN ใน deploy/.env.local — สร้างบอทกับ @BotFather ก่อน")
    sys.exit(1)

API = f"https://api.telegram.org/bot{TOKEN}"


def call(method, **params):
    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(f"{API}/{method}", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as e:
        print(f"[{method}] {e}")
        return None


# log ของ scraper มี < > & ได้ — ส่งดิบ ๆ ใน <pre> แล้ว Telegram จะตีกลับทั้งข้อความ
def _esc(s):
    return _html.escape(str(s))


def send(chat_id, text, keyboard=False):
    p = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if keyboard:
        p["reply_markup"] = KEYBOARD
    return call("sendMessage", **p)


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(st):
    STATE_FILE.write_text(json.dumps(st), encoding="utf-8")


# ── ตัวรันซิงค์ — ทีละงาน ห้ามซ้อน (ซิงค์คู่ขนานสองตัวเขียน DB ชนกันเอง) ──
_lock = threading.Lock()


def run_sync(chat_id, args, label):
    if not _lock.acquire(blocking=False):
        send(chat_id, "⏳ มีงานซิงค์กำลังรันอยู่ — รอให้จบก่อนแล้วค่อยกดใหม่")
        return
    try:
        send(chat_id, f"🚀 เริ่ม{label} … ใช้เวลาราว 2-5 นาที เสร็จแล้วจะรายงานผลที่นี่")
        t0 = time.time()
        p = subprocess.run([sys.executable, str(SYNC_SCRIPT), *args],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", cwd=str(ROOT), timeout=1800)
        mins = (time.time() - t0) / 60
        ok = p.returncode == 0
        # รายงานในห้องต้องอ่านจบในสายตาเดียว — ตอนสำเร็จเอาเฉพาะท่อน "สรุป"
        # จาก stdout (ไม่เอา stderr เลย เพราะ scraper พ่น DeprecationWarning รัว ๆ
        # ซึ่งไม่ใช่ปัญหาแต่กินพื้นที่จนคนอ่านไม่เจอผลจริง) · ตอนล้มค่อยเอา
        # ท้าย stderr มาให้ เพราะนั่นคือที่ที่เหตุผลอยู่
        out = p.stdout or ""
        if ok:
            body = out[out.rfind("สรุป"):].strip() if "สรุป" in out else out[-600:]
        else:
            err = (p.stderr or "").strip()
            head = out[out.rfind("สรุป"):].strip() if "สรุป" in out else ""
            body = (head + "\n\n" + err[-1200:]).strip() if head else err[-1500:] or out[-800:]
        send(chat_id, f"{'✅' if ok else '❌'} <b>{label}เสร็จ</b> ({mins:.1f} นาที)"
                      f"\n\n<pre>{_esc(body[:3000])}</pre>")
    except subprocess.TimeoutExpired:
        send(chat_id, f"❌ {label}เกิน 30 นาที — ถูกตัดจบ ลองใหม่หรือเช็คเครื่อง")
    except Exception as e:
        send(chat_id, f"❌ {label}ล้ม: {e}")
    finally:
        _lock.release()


def main():
    state = load_state()
    offset = 0
    me = call("getMe")
    print(f"บอทพร้อม: @{(me or {}).get('result', {}).get('username', '?')}"
          f" · ผูกกับ chat: {state.get('chat_id', 'ยังไม่ผูก — ส่ง /start ในกลุ่ม')}")

    while True:
        upd = call("getUpdates", offset=offset, timeout=50,
                   allowed_updates=["message"])
        if not upd or not upd.get("ok"):
            time.sleep(5)
            continue
        for u in upd["result"]:
            offset = u["update_id"] + 1
            msg = u.get("message") or {}
            chat = msg.get("chat") or {}
            chat_id = chat.get("id")
            text = (msg.get("text") or "").strip()
            if not chat_id or not text:
                continue

            # ผูกกลุ่มครั้งแรกด้วย /start — หลังจากนั้นล็อกกลุ่มเดียวตลอด
            # ผูกเฉพาะ "กลุ่ม" เท่านั้น — /start ใน DM ใช้เป็นแค่ตัวเช็คว่าคุยถูกบอท
            # (เจอจริง 11 ก.ย.: มีบอทชื่อคล้ายกัน คนกด Start ผิดตัวแล้วงงว่าทำไมเงียบ)
            if "chat_id" not in state:
                if text.startswith("/start"):
                    if chat.get("type") not in ("group", "supergroup"):
                        send(chat_id, "👋 คุยถูกตัวแล้ว! แต่บอทซิงค์ผูกได้เฉพาะในกลุ่ม — "
                                      "เพิ่มบอทเข้าห้องแล้วพิมพ์ /start ที่นั่นครับ")
                        continue
                    state["chat_id"] = chat_id
                    state["chat_title"] = chat.get("title") or chat.get("username") or "?"
                    save_state(state)
                    send(chat_id, f"🔗 ผูกบอทซิงค์กับห้องนี้แล้ว ({state['chat_title']})\n"
                                  f"กดปุ่มด้านล่างหรือพิมพ์ /stock /sync /sales ได้เลย",
                         keyboard=True)
                continue
            if chat_id != state["chat_id"]:
                continue        # ห้องอื่น/แชทส่วนตัวคนแปลกหน้า — เมินเงียบ ๆ

            if text.startswith("/start") or text.startswith("/buttons"):
                send(chat_id, "ปุ่มพร้อมใช้ครับ 👇", keyboard=True)
            elif text == BTN_STOCK or text.startswith("/stock"):
                threading.Thread(target=run_sync,
                                 args=(chat_id, ["--stock"], "ซิงค์สต็อกหน้าตู้"),
                                 daemon=True).start()
            elif text == BTN_ALL or text.startswith("/sync"):
                threading.Thread(target=run_sync,
                                 args=(chat_id, [], "ซิงค์ทั้งหมด"),
                                 daemon=True).start()
            elif text.startswith("/sales"):
                threading.Thread(target=run_sync,
                                 args=(chat_id, ["--sales"], "ซิงค์ยอดขาย"),
                                 daemon=True).start()


if __name__ == "__main__":
    main()
