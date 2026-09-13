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
    - **ซิงค์อัตโนมัติเที่ยงคืน** แทน cron ของ GitHub ที่ใช้ไม่ได้ (ดูหัวข้อล่าง)

ซิงค์อัตโนมัติ (13 ก.ย. 2026):
    เดิม GitHub Actions รันให้ 00:00/00:05 แต่บัญชีถูกแฟล็ก cron เลยตายไปด้วย
    บอทตัวนี้รันค้างอยู่แล้ว 24 ชม. จึงให้มันจับเวลาเองเลย ไม่ต้องพึ่ง Task Scheduler

    ⚠️ ต่างจาก cron ตรงที่ **เครื่องต้องเปิดอยู่** — จึงไม่ใช้ "ยิงตอนเที่ยงคืนเป๊ะ ๆ"
    แต่ใช้ "วันนี้ยังไม่ได้ซิงค์หรือยัง" เป็นเงื่อนไขแทน เครื่องปิดข้ามคืนแล้วมาเปิด
    ตอนเช้า บอทจะรันชดเชยให้ทันทีที่ตื่นมา และไล่เก็บย้อนหลังทีละ 5 วันถ้าขาดหลายวัน
    (sync_local ปฏิเสธช่วงเกิน 5 วัน เพราะ VMS ตัดข้อมูล)

    สั่งได้ในห้อง: /auto (ดูสถานะ) · /auto on|off · /auto 00:30 (เปลี่ยนเวลา)

รัน:  .venv-image\\Scripts\\python.exe scripts\\telegram_sync_bot.py
"""
import html as _html
import json
import os
import pathlib
import subprocess
import sys
import threading
import time
import urllib.request
from datetime import date, datetime, timedelta

# ปกติรันด้วย pythonw ที่ไม่มี stdout เลย print จึงหายไปเงียบ ๆ ไม่มีปัญหา
# แต่ถ้าใครรันจาก console หรือ redirect ลงไฟล์ log ค่าปริยายบน Windows คือ cp1252/cp874
# ซึ่งพิมพ์ไทยไม่ออก แล้วโยน UnicodeEncodeError ตาย**ตั้งแต่บรรทัดแรกของ main()**
if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "deploy" / ".env.local"
STATE_FILE = pathlib.Path(__file__).parent / ".sync_bot_state.json"
SYNC_SCRIPT = pathlib.Path(__file__).parent / "sync_local.py"

BTN_STOCK = "🔄 ซิงค์สต็อกหน้าตู้"
BTN_ALL = "📊 ซิงค์ทั้งหมด (ยอดขาย+สต็อก)"
KEYBOARD = {"keyboard": [[{"text": BTN_STOCK}], [{"text": BTN_ALL}]],
            "resize_keyboard": True, "is_persistent": True}

# ── ค่าตั้งของรอบอัตโนมัติ ──
# 00:10 ไม่ใช่ 00:00 เป๊ะ — เผื่อให้หลังบ้านตู้ปิดยอดของวันให้เรียบร้อยก่อน
AUTO_AT_DEFAULT = "00:10"
AUTO_TICK = 30          # วินาที · ถี่แค่ไหนก็ได้ ตัวเช็คเป็นแค่การเทียบเวลา
AUTO_RETRY_MIN = 30     # ล้มแล้วรอเท่านี้ค่อยลองใหม่
AUTO_MAX_TRIES = 3      # ลองครบเท่านี้แล้วยอมแพ้ของวันนั้น (กันวนรัวทั้งคืน)
MAX_SPAN = 5            # sync_local ปฏิเสธช่วง backfill เกิน 5 วัน


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


# state ถูกอ่าน/เขียนจากสองเธรด (ลูปรับข้อความ กับ ตัวจับเวลา) จึงเก็บไว้ที่เดียว
# แล้วล็อกตอนเขียน — ไม่งั้นสองฝั่งถือ dict คนละใบ เขียนทับกันเงียบ ๆ
STATE = load_state()
_state_lock = threading.Lock()


def save_state(st=None):
    with _state_lock:
        STATE_FILE.write_text(json.dumps(st if st is not None else STATE),
                              encoding="utf-8")


# ── ตัวรันซิงค์ — ทีละงาน ห้ามซ้อน (ซิงค์คู่ขนานสองตัวเขียน DB ชนกันเอง) ──
_lock = threading.Lock()


def _run_job(args):
    """เรียก sync_local หนึ่งรอบ → (สำเร็จไหม, ข้อความสรุปที่เอาไปโพสต์ได้)

    ผู้เรียกเป็นคนถือ _lock เอง — ตัวนี้ไม่ยุ่งกับล็อก เพราะรอบอัตโนมัติ
    ต้องรันหลายรอบติดกันโดยถือล็อกยาวตลอด (ไม่งั้นมีคนกดปุ่มแทรกกลางทางได้)
    """
    # encoding="utf-8" ข้างล่างบอกแค่ว่า "ฝั่งเราจะ**ถอด**รหัสท่อยังไง" ไม่ได้สั่งลูก
    # ว่าให้**เข้า**รหัสยังไง · ลูกพิมพ์ไทยลง pipe แล้วเลือก ACP ของเครื่องเอง (cp1252)
    # = ตายตั้งแต่บรรทัดแรก ต้องยัด PYTHONIOENCODING ให้ทั้งสายผ่าน env เท่านั้น
    env = {**os.environ, "PYTHONIOENCODING": "utf-8:replace"}
    try:
        p = subprocess.run([sys.executable, str(SYNC_SCRIPT), *args],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", cwd=str(ROOT), timeout=1800, env=env)
    except subprocess.TimeoutExpired:
        return False, "เกิน 30 นาที — ถูกตัดจบ"
    except Exception as e:
        return False, f"รันไม่ขึ้น: {e}"
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
    return ok, body


def run_sync(chat_id, args, label):
    if not _lock.acquire(blocking=False):
        send(chat_id, "⏳ มีงานซิงค์กำลังรันอยู่ — รอให้จบก่อนแล้วค่อยกดใหม่")
        return
    try:
        send(chat_id, f"🚀 เริ่ม{label} … ใช้เวลาราว 2-5 นาที เสร็จแล้วจะรายงานผลที่นี่")
        t0 = time.time()
        ok, body = _run_job(args)
        mins = (time.time() - t0) / 60
        send(chat_id, f"{'✅' if ok else '❌'} <b>{label}เสร็จ</b> ({mins:.1f} นาที)"
                      f"\n\n<pre>{_esc(body[:3000])}</pre>")
        if ok:
            # กดเองก็นับเป็นการซิงค์ของวันนั้น รอบอัตโนมัติจะได้ไม่รันซ้ำให้เปลือง
            # แต่ "ปิดงานของวันนี้" ให้เฉพาะตอนกดซิงค์ทั้งหมด (args ว่าง) เท่านั้น —
            # กดเฉพาะสต็อกหรือเฉพาะยอดขาย ยังขาดอีกครึ่ง ต้องปล่อยให้รอบเที่ยงคืนตามเก็บ
            mark_synced(sales="--stock" not in args, full=not args)
    except Exception as e:
        send(chat_id, f"❌ {label}ล้ม: {e}")
    finally:
        _lock.release()


# ── รอบอัตโนมัติเที่ยงคืน — แทน cron ของ GitHub ──

def mark_synced(sales=False, full=False):
    if sales:
        STATE["auto_sales_through"] = date.today().isoformat()
    if full:
        STATE["auto_done_date"] = date.today().isoformat()
        STATE.pop("auto_retry_at", None)
        STATE["auto_tries"] = 0
    save_state()


def parse_hhmm(s):
    try:
        h, m = str(s).split(":")
        h, m = int(h), int(m)
        if 0 <= h < 24 and 0 <= m < 60:
            return f"{h:02d}:{m:02d}"
    except Exception:
        pass
    return None


def sales_chunks(last_through, today, max_span=MAX_SPAN):
    """แบ่งช่วงวันที่ต้องดึงยอดขายเป็นท่อนละไม่เกิน max_span วัน

    เริ่มนับจาก "วันที่ดึงสำเร็จล่าสุด" ไม่ใช่วันถัดไป — ทับซ้อนหนึ่งวันโดยตั้งใจ
    เพราะรอบก่อนดึงตอนวันนั้นยังไม่จบ ยอดจึงยังไม่ครบ · ฝั่ง DB เป็น upsert
    อยู่แล้ว ดึงซ้ำไม่ทำให้ตัวเลขบวกเพิ่ม
    """
    if last_through is None:
        last_through = today - timedelta(days=1)
    frm = min(last_through, today)
    out = []
    while frm < today:
        to = min(frm + timedelta(days=max_span), today)
        out.append((frm.isoformat(), to.isoformat()))
        frm = to
    return out or [(today.isoformat(), today.isoformat())]


def auto_due(now, state):
    """ถึงเวลารันรอบอัตโนมัติของวันนี้หรือยัง (ฟังก์ชันล้วน — ทดสอบได้)

    เงื่อนไขคือ "วันนี้ยังไม่ได้ซิงค์" ไม่ใช่ "นาฬิกาตีเที่ยงคืนพอดี" เพราะเครื่อง
    อาจปิดอยู่ตอนนั้น · เปิดมาสายแค่ไหนก็ยังได้ข้อมูลของเมื่อวานครบ
    """
    if not state.get("auto_enabled", True):
        return False
    at = parse_hhmm(state.get("auto_at")) or AUTO_AT_DEFAULT
    if now.strftime("%H:%M") < at:
        return False
    if state.get("auto_done_date") == now.date().isoformat():
        return False
    retry_at = state.get("auto_retry_at")
    if retry_at and now.timestamp() < retry_at:
        return False
    return True


def run_auto():
    """ยอดขายไล่ทีละช่วง แล้วปิดท้ายด้วยสต็อก — ลำดับเดียวกับที่ workflow เคยทำ

    ⚠️ สต็อกต้องรันหลังยอดขายเสมอ (slot_refill_events ใช้ยอดที่ขายไประหว่างสองรอบ
       มาคำนวณว่าเติมเข้าไปเท่าไหร่) — sync_local บังคับลำดับนี้อยู่แล้วเวลารันรวด
       เดียว แต่ตรงนี้เราแยกเรียกเอง จึงต้องคุมลำดับเอง
    """
    chat_id = STATE.get("chat_id")
    if not chat_id:
        return                       # ยังไม่ผูกห้อง — ไม่มีที่ให้รายงาน ข้ามไปก่อน
    if not _lock.acquire(blocking=False):
        return                       # มีคนกดปุ่มอยู่ — ไม่ mark อะไร เดี๋ยวรอบหน้ามาใหม่
    try:
        today = date.today()
        if STATE.get("auto_tries_date") != today.isoformat():
            STATE["auto_tries"] = 0
            STATE["auto_tries_date"] = today.isoformat()

        last = STATE.get("auto_sales_through")
        chunks = sales_chunks(date.fromisoformat(last) if last else None, today)
        behind = len(chunks) > 1 or (last and date.fromisoformat(last) < today - timedelta(days=1))
        send(chat_id, "🌙 <b>ซิงค์อัตโนมัติประจำวัน</b> เริ่มแล้ว"
                      + (f"\nดึงย้อนหลัง {len(chunks)} ช่วง (ค้างมาตั้งแต่ {last})" if behind else "")
                      + "\nเสร็จแล้วจะรายงานผลที่นี่")

        t0 = time.time()
        parts, all_ok = [], True
        for frm, to in chunks:
            ok, body = _run_job(["--sales", "--from", frm, "--to", to])
            parts.append(f"▸ ยอดขาย {frm} → {to}\n{body}")
            all_ok &= ok
            if ok:
                STATE["auto_sales_through"] = to
                save_state()         # เซฟทีละช่วง — ล้มกลางทางจะได้ไม่ต้องเริ่มใหม่หมด
            else:
                break                # ยอดขายพัง อย่าไปต่อ สต็อกจะคำนวณการเติมผิด

        if all_ok:
            ok, body = _run_job(["--stock"])
            parts.append(f"▸ สต็อกหน้าตู้\n{body}")
            all_ok &= ok

        mins = (time.time() - t0) / 60
        report = "\n\n".join(parts)
        send(chat_id, f"{'✅' if all_ok else '❌'} <b>ซิงค์อัตโนมัติเสร็จ</b> ({mins:.1f} นาที)"
                      f"\n\n<pre>{_esc(report[:3000])}</pre>")

        if all_ok:
            mark_synced(sales=True, full=True)
        else:
            tries = STATE.get("auto_tries", 0) + 1
            STATE["auto_tries"] = tries
            if tries >= AUTO_MAX_TRIES:
                STATE["auto_done_date"] = today.isoformat()   # ยอมแพ้ของวันนี้
                STATE.pop("auto_retry_at", None)
                send(chat_id, f"⚠️ ลองแล้ว {tries} รอบยังไม่ผ่าน — หยุดลองของวันนี้\n"
                              f"ข้อมูลไม่หายจากตู้ พรุ่งนี้จะตามเก็บให้เอง "
                              f"หรือกดปุ่มเองได้เลยถ้าอยากได้ตอนนี้")
            else:
                STATE["auto_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
                send(chat_id, f"🔁 จะลองใหม่อีกครั้งในอีก {AUTO_RETRY_MIN} นาที "
                              f"(รอบที่ {tries}/{AUTO_MAX_TRIES})")
            save_state()
    except Exception as e:
        send(chat_id, f"❌ รอบอัตโนมัติล้ม: {e}")
        STATE["auto_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
        save_state()
    finally:
        _lock.release()


def scheduler():
    while True:
        try:
            if auto_due(datetime.now(), STATE):
                run_auto()
        except Exception as e:
            print(f"[scheduler] {e}")
        time.sleep(AUTO_TICK)


def auto_status():
    at = parse_hhmm(STATE.get("auto_at")) or AUTO_AT_DEFAULT
    on = STATE.get("auto_enabled", True)
    last = STATE.get("auto_sales_through") or "ยังไม่เคยรัน"
    done = STATE.get("auto_done_date")
    lines = [f"⏰ ซิงค์อัตโนมัติ: <b>{'เปิด' if on else 'ปิด'}</b> · เวลา <b>{at}</b> น.",
             f"ข้อมูลยอดขายถึงวันที่: {last}",
             f"รอบของวันนี้: {'เสร็จแล้ว' if done == date.today().isoformat() else 'ยังไม่ได้รัน'}"]
    retry = STATE.get("auto_retry_at")
    if retry and retry > time.time():
        lines.append(f"รอลองใหม่อีก {int((retry - time.time()) / 60)} นาที")
    lines.append("\nเครื่องต้องเปิดอยู่บอทถึงจะทำงาน — ถ้าเครื่องปิดข้ามคืน "
                 "บอทจะซิงค์ชดเชยให้ทันทีที่เปิดมา")
    lines.append("สั่งได้: /auto on · /auto off · /auto 00:30")
    return "\n".join(lines)


def handle(u):
    state = STATE
    msg = u.get("message") or {}
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    text = (msg.get("text") or "").strip()
    if not chat_id or not text:
        return

    # ผูกกลุ่มครั้งแรกด้วย /start — หลังจากนั้นล็อกกลุ่มเดียวตลอด
    # ผูกเฉพาะ "กลุ่ม" เท่านั้น — /start ใน DM ใช้เป็นแค่ตัวเช็คว่าคุยถูกบอท
    # (เจอจริง 11 ก.ย.: มีบอทชื่อคล้ายกัน คนกด Start ผิดตัวแล้วงงว่าทำไมเงียบ)
    if "chat_id" not in state:
        if text.startswith("/start"):
            if chat.get("type") not in ("group", "supergroup"):
                send(chat_id, "👋 คุยถูกตัวแล้ว! แต่บอทซิงค์ผูกได้เฉพาะในกลุ่ม — "
                              "เพิ่มบอทเข้าห้องแล้วพิมพ์ /start ที่นั่นครับ")
                return
            state["chat_id"] = chat_id
            state["chat_title"] = chat.get("title") or chat.get("username") or "?"
            save_state()
            send(chat_id, f"🔗 ผูกบอทซิงค์กับห้องนี้แล้ว ({state['chat_title']})\n"
                          f"กดปุ่มด้านล่างหรือพิมพ์ /stock /sync /sales ได้เลย",
                 keyboard=True)
        return
    if chat_id != state["chat_id"]:
        return              # ห้องอื่น/แชทส่วนตัวคนแปลกหน้า — เมินเงียบ ๆ

    if text.startswith("/start") or text.startswith("/buttons"):
        send(chat_id, "ปุ่มพร้อมใช้ครับ 👇\n(ซิงค์อัตโนมัติทุกคืนอยู่แล้ว — "
                      "ดูสถานะด้วย /auto)", keyboard=True)
    elif text.startswith("/auto"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["auto_enabled"] = True
            save_state()
            send(chat_id, "✅ เปิดซิงค์อัตโนมัติแล้ว\n\n" + auto_status())
        elif arg in ("off", "ปิด"):
            state["auto_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดซิงค์อัตโนมัติแล้ว — ต้องกดปุ่มเอาเอง")
        elif arg and parse_hhmm(arg):
            state["auto_at"] = parse_hhmm(arg)
            save_state()
            send(chat_id, f"⏰ เปลี่ยนเวลาเป็น {state['auto_at']} น. แล้ว\n\n" + auto_status())
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /auto on · /auto off · /auto 00:30")
        else:
            send(chat_id, auto_status())
    elif text == BTN_STOCK or text.startswith("/stock"):
        threading.Thread(target=run_sync,
                         args=(chat_id, ["--stock"], "ซิงค์สต็อกหน้าตู้"),
                         daemon=True).start()
    elif text == BTN_ALL or text.startswith("/sync"):
        threading.Thread(target=run_sync, args=(chat_id, [], "ซิงค์ทั้งหมด"),
                         daemon=True).start()
    elif text.startswith("/sales"):
        threading.Thread(target=run_sync,
                         args=(chat_id, ["--sales"], "ซิงค์ยอดขาย"),
                         daemon=True).start()


def main():
    offset = 0
    me = call("getMe")
    print(f"บอทพร้อม: @{(me or {}).get('result', {}).get('username', '?')}"
          f" · ผูกกับ chat: {STATE.get('chat_id', 'ยังไม่ผูก — ส่ง /start ในกลุ่ม')}"
          f" · ซิงค์อัตโนมัติ {parse_hhmm(STATE.get('auto_at')) or AUTO_AT_DEFAULT} น.")
    threading.Thread(target=scheduler, daemon=True).start()

    while True:
        upd = call("getUpdates", offset=offset, timeout=50,
                   allowed_updates=["message"])
        if not upd or not upd.get("ok"):
            time.sleep(5)
            continue
        for u in upd["result"]:
            offset = u["update_id"] + 1
            try:
                handle(u)
            except Exception as e:
                # ข้อความแปลก ๆ ใบเดียวต้องไม่ล้มทั้งบอท — เพราะบอทตายเมื่อไหร่
                # ซิงค์อัตโนมัติตายตามไปเงียบ ๆ ไม่มีใครรู้จนยอดขายหายไปหลายวัน
                print(f"[update {u.get('update_id')}] {e}")


if __name__ == "__main__":
    main()
