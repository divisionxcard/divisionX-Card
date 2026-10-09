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
    - แผงปุ่มในตัวข้อความ (inline · /panel): ทุกคนในห้องเห็นและกดได้ ปักหมุดไว้ใช้ได้ตลอด
      ⚠️ reply keyboard แสดงผล **รายคน** — คนที่เข้ากลุ่มทีหลังหรือเคยกดซ่อนคีย์บอร์ดจะไม่เห็นปุ่มเลย
         (เจอจริง 16 ก.ย. 2026: เจ้าของเห็นปุ่ม แต่แอดมินอีกคนในห้องเดียวกันไม่เห็น จึงสั่งซิงค์ไม่ได้)
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

เก็บไอเดียคอนเทนต์ประจำวัน (15 ก.ย. 2026):
    หน้า /marketing โซน "ไอเดียวันนี้" ค้างของวันที่ 9 ก.ย. อยู่ 6 วัน (เจ้าของทัก) เพราะ
    idea-collector.yml ก็เป็น cron ของ GitHub ที่ตายไปพร้อมบัญชี · ย้ายมาไว้ที่นี่ด้วยเงื่อนไข
    แบบเดียวกับซิงค์ — "วันนี้เก็บหรือยัง" ไม่ใช่ "ตี 7 พอดีหรือยัง" เปิดเครื่องสายก็ได้ของครบ
    ขั้นตอนเหมือน workflow: idea_collector.py → idea_angles.py --limit 40
    (ขั้นคิดมุมล้มไม่นับว่าล้ม — ไอเดียยังอยู่ครบ แค่ใช้มุมจาก template ไปก่อน)

    ⚠️ ใช้ล็อกแยกจากซิงค์ — ขั้นคิดมุมเว้นจังหวะ 5 วิต่อชิ้น วัดจริง 18 นาทีกับ 19 ชิ้น
       ถ้าใช้ล็อกเดียวกัน คนกดซิงค์สต็อกก่อนออกไปเติมตู้จะโดนบอกให้รอเฉย ๆ
    ⚠️ ถ้า GitHub กลับมาแล้ว workflow รันซ้ำก็ไม่เป็นไร — ตัวเก็บกันซ้ำด้วย external_key
       และขั้นคิดมุมทำเฉพาะไอเดียที่ยังไม่มีมุม

    สั่งได้ในห้อง: /ideas (เก็บเดี๋ยวนี้) · /ideas on|off

สำรองข้อมูล + โพสต์อัตโนมัติ (16 ก.ย. 2026):
    GitHub ยังไม่ปลดแฟล็ก (ครบ 6 วันแล้ว) เจ้าของเลือกย้ายสองงานนี้มาก่อน
      · สำรองข้อมูล  — ของเดิมรายสัปดาห์ (weekly-backup.yml) ขาดไปหนึ่งรอบแล้ว
      · โพสต์อัตโนมัติ — เคาะ /api/marketing/content/publish-due ทุก 15 นาที (marketing-autopost.yml)
        ⚠️ ของเดิมรันบนคลาวด์โดยตั้งใจ "โพสต์ต้องขึ้นแม้คอมปิด" — ย้ายมาที่นี่แล้วข้อนี้หายไป
           เครื่องปิด = โพสต์ไม่ออกจนกว่าจะเปิด (ปลายทางยังโพสต์ให้อยู่ แค่ช้ากว่าเวลาที่ตั้ง)
    สั่งได้ในห้อง: /backup (สำรองเดี๋ยวนี้) · /backup on|off · /autopost (เคาะเดี๋ยวนี้) · /autopost on|off

รัน:  .venv-image\\Scripts\\python.exe scripts\\telegram_sync_bot.py
"""
import html as _html
import json
import os
import pathlib
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
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
IDEA_COLLECTOR = ROOT / "deploy" / "agents" / "idea_collector.py"
IDEA_ANGLES = ROOT / "deploy" / "agents" / "idea_angles.py"

BTN_STOCK = "🔄 ซิงค์สต็อกหน้าตู้"
BTN_ALL = "📊 ซิงค์ทั้งหมด (ยอดขาย+สต็อก)"
KEYBOARD = {"keyboard": [[{"text": BTN_STOCK}], [{"text": BTN_ALL}]],
            "resize_keyboard": True, "is_persistent": True}

# ── แผงปุ่มในตัวข้อความ (inline) — เพิ่ม 16 ก.ย. 2026 ──
# ปุ่ม inline ติดอยู่กับ "ข้อความ" ไม่ใช่กับ "ช่องพิมพ์ของแต่ละคน" → ทุกคนในห้องเห็นเหมือนกัน
# และกดได้ทุกคน · ปักหมุดข้อความนี้ = มีปุ่มถาวรอยู่บนสุดของห้อง ไม่ต้องเลื่อนหา
PANEL = {"inline_keyboard": [
    [{"text": BTN_STOCK, "callback_data": "stock"}],
    [{"text": BTN_ALL, "callback_data": "sync"}],
    [{"text": "💡 เก็บไอเดีย", "callback_data": "ideas"},
     {"text": "💾 สำรองข้อมูล", "callback_data": "backup"}],
    [{"text": "📋 สถานะ", "callback_data": "status"}],
]}
PANEL_TEXT = ("🎛 <b>แผงควบคุม DivisionX</b>\n"
              "กดปุ่มได้เลย — ทุกคนในห้องนี้กดได้ ผลจะรายงานกลับมาที่ห้องนี้\n\n"
              "<i>แนะนำให้ปักหมุดข้อความนี้ไว้ (กดค้างที่ข้อความ → ปักหมุด) "
              "จะได้กดจากบนสุดของห้องได้ตลอด ไม่ต้องเลื่อนหา</i>")

# ── ค่าตั้งของรอบอัตโนมัติ ──
# 00:10 ไม่ใช่ 00:00 เป๊ะ — เผื่อให้หลังบ้านตู้ปิดยอดของวันให้เรียบร้อยก่อน
AUTO_AT_DEFAULT = "00:10"
AUTO_TICK = 30          # วินาที · ถี่แค่ไหนก็ได้ ตัวเช็คเป็นแค่การเทียบเวลา
AUTO_RETRY_MIN = 30     # ล้มแล้วรอเท่านี้ค่อยลองใหม่
AUTO_MAX_TRIES = 3      # ลองครบเท่านี้แล้วยอมแพ้ของวันนั้น (กันวนรัวทั้งคืน)
MAX_SPAN = 5            # sync_local ปฏิเสธช่วง backfill เกิน 5 วัน
# ดึงย้อนทับซ้อนกี่วันทุกรอบ — กันวันที่หลุดไปแล้วกู้คืนไม่ได้ (ดูเหตุผลเต็มใน sales_chunks)
# ยอมจ่ายการดึงซ้ำ 2 วันทุกคืน แลกกับการไม่ต้องมานั่งไล่หายอดที่หายไปทีหลัง
SALES_OVERLAP_DAYS = 2

# ── ค่าตั้งของรอบเก็บไอเดีย ──
# 07:00 ตามเวลาเดิมของ workflow และข้อความบนหน้า /marketing ("ตัวเก็บไอเดียรันทุกเช้า 07:00 น.")
IDEAS_AT_DEFAULT = "07:00"
IDEAS_ANGLE_LIMIT = "40"   # เท่ากับ workflow · โควตา Gemini ฟรีมีจำกัด

# ── ค่าตั้งของงานที่ย้ายมาเพิ่ม 16 ก.ย. 2026 ──
AUTOPOST_URL = "https://division-x-card.vercel.app/api/marketing/content/publish-due"
AUTOPOST_EVERY_MIN = 15        # เท่ากับ cron เดิม · ปลายทางเป็นคนตัดสินว่าชิ้นไหนถึงเวลา
AUTOPOST_ALERT_GAP_MIN = 60    # error เดิมซ้ำทุก 15 นาทีจะท่วมห้อง — เตือนซ้ำชั่วโมงละครั้งพอ
BACKUP_SCRIPT = ROOT / "deploy" / "scripts" / "backup-tables.js"
# ⚠️ นอก deploy/ เท่านั้น — scripts/vercel_deploy.py อัปทุกอย่างใน deploy/ ขึ้นเว็บ
#    ไฟล์สำรองมียอดขายทั้งบริษัท หลุดขึ้นเว็บไม่ได้ (รากรีโปมี /backups/ ใน .gitignore ด้วย)
BACKUP_DIR = ROOT / "backups"
BACKUP_EVERY_DAYS = 7
BACKUP_AT_DEFAULT = "00:30"
BACKUP_KEEP = 8                # ~2 เดือน · ของเดิมเก็บเป็น artifact บน GitHub 90 วัน


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


def send(chat_id, text, keyboard=False, markup=None):
    p = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if markup is not None:
        p["reply_markup"] = markup
    elif keyboard:
        p["reply_markup"] = KEYBOARD
    return call("sendMessage", **p)


def send_panel(chat_id):
    """ส่งแผงปุ่ม inline — ใช้แทน/คู่กับ reply keyboard เวลาห้องมีหลายคน"""
    return send(chat_id, PANEL_TEXT, markup=PANEL)


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


def _run_cmd(cmd, timeout, extra_env=None):
    """รันคำสั่งหนึ่งตัวแบบเก็บ output → (CompletedProcess หรือ None, ข้อความตอนรันไม่ขึ้น)"""
    # encoding="utf-8" ข้างล่างบอกแค่ว่า "ฝั่งเราจะ**ถอด**รหัสท่อยังไง" ไม่ได้สั่งลูก
    # ว่าให้**เข้า**รหัสยังไง · ลูกพิมพ์ไทยลง pipe แล้วเลือก ACP ของเครื่องเอง (cp1252)
    # = ตายตั้งแต่บรรทัดแรก ต้องยัด PYTHONIOENCODING ให้ทั้งสายผ่าน env เท่านั้น
    env = {**os.environ, "PYTHONIOENCODING": "utf-8:replace", **(extra_env or {})}
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", cwd=str(ROOT), timeout=timeout, env=env), ""
    except subprocess.TimeoutExpired:
        return None, f"เกิน {timeout // 60} นาที — ถูกตัดจบ"
    except Exception as e:
        return None, f"รันไม่ขึ้น: {e}"


def _run_py(script, args, timeout):
    return _run_cmd([sys.executable, str(script), *args], timeout)


def _run_node(script, args, timeout, extra_env=None):
    return _run_cmd(["node", str(script), *args], timeout, extra_env)


def _run_job(args):
    """เรียก sync_local หนึ่งรอบ → (สำเร็จไหม, ข้อความสรุปที่เอาไปโพสต์ได้)

    ผู้เรียกเป็นคนถือ _lock เอง — ตัวนี้ไม่ยุ่งกับล็อก เพราะรอบอัตโนมัติ
    ต้องรันหลายรอบติดกันโดยถือล็อกยาวตลอด (ไม่งั้นมีคนกดปุ่มแทรกกลางทางได้)
    """
    p, err = _run_py(SYNC_SCRIPT, args, timeout=1800)
    if p is None:
        return False, err
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
        # ยอดขายไล่ช่วงเดียวกับรอบอัตโนมัติ ไม่ใช่ "เมื่อวาน→วันนี้" ของ sync_local — ดู run_sales_catchup
        chunks = None if "--stock" in args else pending_sales_chunks()
        span = f" (ยอดขาย {chunks[0][0]} → {chunks[-1][1]})" if chunks else ""
        send(chat_id, f"🚀 เริ่ม{label}{span} … ใช้เวลาราว 2-5 นาที เสร็จแล้วจะรายงานผลที่นี่")
        t0 = time.time()
        if chunks is None:
            ok, body = _run_job(args)
        else:
            parts, ok = run_sales_catchup(chunks)
            if ok and not args:          # ซิงค์ทั้งหมด → ปิดท้ายด้วยสต็อก (ต้องหลังยอดขายเสมอ)
                ok, stock_body = _run_job(["--stock"])
                parts.append(f"▸ สต็อกหน้าตู้\n{stock_body}")
            body = "\n\n".join(parts)
        mins = (time.time() - t0) / 60
        send(chat_id, f"{'✅' if ok else '❌'} <b>{label}เสร็จ</b> ({mins:.1f} นาที)"
                      f"\n\n<pre>{_esc(body[:3000])}</pre>")
        if ok and not args:
            # กดซิงค์ทั้งหมดผ่าน = งานของวันนี้ครบ รอบอัตโนมัติจะได้ไม่รันซ้ำให้เปลือง
            # กดเฉพาะสต็อกหรือเฉพาะยอดขาย ยังขาดอีกครึ่ง ต้องปล่อยให้รอบเที่ยงคืนตามเก็บ
            mark_day_done()
    except Exception as e:
        send(chat_id, f"❌ {label}ล้ม: {e}")
    finally:
        _lock.release()


# ── รอบอัตโนมัติเที่ยงคืน — แทน cron ของ GitHub ──

def mark_day_done():
    """ซิงค์ครบทั้งยอดขาย+สต็อกของวันนี้แล้ว — ไม่แตะตัวชี้ยอดขาย (run_sales_catchup เลื่อนให้เอง)"""
    STATE["auto_done_date"] = date.today().isoformat()
    STATE.pop("auto_retry_at", None)
    STATE["auto_tries"] = 0
    save_state()


def pending_sales_chunks(today=None):
    """ช่วงยอดขายที่ต้องดึงตอนนี้ นับจากตัวชี้ auto_sales_through"""
    last = STATE.get("auto_sales_through")
    return sales_chunks(date.fromisoformat(last) if last else None, today or date.today())


def run_sales_catchup(chunks):
    """ดึงยอดขายทีละช่วง เลื่อนตัวชี้เฉพาะช่วงที่ดึงสำเร็จจริง → (ข้อความรายช่วง, ผ่านหมดไหม)

    ใช้ทั้งรอบอัตโนมัติและปุ่มกดเอง · ผู้เรียกต้องถือ _lock เอง

    ⚠️ ปุ่มกดเองต้องผ่านตัวนี้ด้วย ห้ามเรียก sync_local เปล่า ๆ (9 ต.ค. 2026)
       sync_local ที่ไม่ระบุช่วงดึงแค่ "เมื่อวาน→วันนี้" แต่เดิมปุ่มเลื่อนตัวชี้ไปวันนี้เสมอ
       ยอดวันที่ 7 ต.ค. ของทุกตู้จึงหายทั้งวัน: ไม่มีแถวไหนถูกซิงค์เข้าเลยตั้งแต่ 7 ต.ค. 00:1x
       จนถึง 9 ต.ค. 21:4x (ดูจาก sales.synced_at) แล้วรอบที่ 21:4x ดึงแค่ 8→9 แบบปุ่มกดเอง
       ตัวชี้จึงกระโดดไป 9 ข้ามวันที่ 7
       ช่วงทับซ้อน 2 วันของ sales_chunks จะอุดรูนี้ได้ในรอบถัดไปก็จริง แต่ถ้าวันที่หลุดเกิน
       ช่วงทับซ้อนก็หายถาวร (เหมือน 23 ก.ย.) · ให้ปุ่มไล่จากตัวชี้เหมือนรอบอัตโนมัติจึงปิดรูได้ตรงกว่า
    """
    parts, all_ok = [], True
    for frm, to in chunks:
        ok, body = _run_job(["--sales", "--from", frm, "--to", to])
        parts.append(f"▸ ยอดขาย {frm} → {to}\n{body}")
        all_ok &= ok
        if not ok:
            break                # ยอดขายพัง อย่าไปต่อ สต็อกจะคำนวณการเติมผิด
        STATE["auto_sales_through"] = to
        save_state()             # เซฟทีละช่วง — ล้มกลางทางจะได้ไม่ต้องเริ่มใหม่หมด
    return parts, all_ok


def parse_hhmm(s):
    try:
        h, m = str(s).split(":")
        h, m = int(h), int(m)
        if 0 <= h < 24 and 0 <= m < 60:
            return f"{h:02d}:{m:02d}"
    except Exception:
        pass
    return None


def sales_chunks(last_through, today, max_span=MAX_SPAN, overlap=SALES_OVERLAP_DAYS):
    """แบ่งช่วงวันที่ต้องดึงยอดขายเป็นท่อนละไม่เกิน max_span วัน

    เริ่มนับจาก "วันที่ดึงสำเร็จล่าสุด" ไม่ใช่วันถัดไป — ทับซ้อนโดยตั้งใจ
    เพราะรอบก่อนดึงตอนวันนั้นยังไม่จบ ยอดจึงยังไม่ครบ · ฝั่ง DB เป็น upsert
    อยู่แล้ว ดึงซ้ำไม่ทำให้ตัวเลขบวกเพิ่ม

    ⚠️ ทับซ้อน 2 วันไม่ใช่ 1 (28 ก.ย. 2026) — เดิมทับวันเดียวแล้ว **วันที่หลุดไปกู้คืนไม่ได้เลย**
       กลไกที่เกิดจริง: mark_synced(sales=True) เขียน auto_sales_through = "วันนี้" เสมอ
       ไม่ว่ารอบนั้นจะดึงช่วงไหนมาจริง ๆ · การกดปุ่ม "ซิงค์ทั้งหมด" ดึงแค่ข้อมูลของวันนี้
       แต่ตัวชี้กระโดดไปวันนี้ด้วย → 23 ก.ย. ไม่เคยถูกดึง และถูกข้ามตลอดไปเพราะตัวชี้เลยมาแล้ว
       ผลคือยอดทั้งวันของ 12 ตู้หายไป 5 วันกว่าจะมีคนสังเกต (฿12,930)
       ทับซ้อนเพิ่มอีกวันทำให้รูแบบนี้ถูกอุดเองในรอบถัดไป โดยจ่ายแค่การดึงซ้ำที่ไม่มีผลข้างเคียง
       (9 ต.ค. 2026 ปิดที่ต้นเหตุแล้ว — ปุ่มกดเองไล่จากตัวชี้เหมือนกัน ดู run_sales_catchup)
    """
    if last_through is None:
        last_through = today - timedelta(days=1)
    frm = min(last_through - timedelta(days=overlap), today)
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
        chunks = pending_sales_chunks(today)
        behind = len(chunks) > 1 or (last and date.fromisoformat(last) < today - timedelta(days=1))
        send(chat_id, "🌙 <b>ซิงค์อัตโนมัติประจำวัน</b> เริ่มแล้ว"
                      + (f"\nดึงย้อนหลัง {len(chunks)} ช่วง (ค้างมาตั้งแต่ {last})" if behind else "")
                      + "\nเสร็จแล้วจะรายงานผลที่นี่")

        t0 = time.time()
        parts, all_ok = run_sales_catchup(chunks)

        if all_ok:
            ok, body = _run_job(["--stock"])
            parts.append(f"▸ สต็อกหน้าตู้\n{body}")
            all_ok &= ok

        mins = (time.time() - t0) / 60
        report = "\n\n".join(parts)
        send(chat_id, f"{'✅' if all_ok else '❌'} <b>ซิงค์อัตโนมัติเสร็จ</b> ({mins:.1f} นาที)"
                      f"\n\n<pre>{_esc(report[:3000])}</pre>")

        if all_ok:
            mark_day_done()
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


# ── รอบเก็บไอเดียประจำวัน — แทน idea-collector.yml ของ GitHub ──
_ideas_lock = threading.Lock()


def ideas_due(now, state):
    """ถึงเวลาเก็บไอเดียของวันนี้หรือยัง (ฟังก์ชันล้วน — ทดสอบได้) · เงื่อนไขแบบเดียวกับ auto_due"""
    if not state.get("ideas_enabled", True):
        return False
    if now.strftime("%H:%M") < IDEAS_AT_DEFAULT:
        return False
    if state.get("ideas_done_date") == now.date().isoformat():
        return False
    retry_at = state.get("ideas_retry_at")
    if retry_at and now.timestamp() < retry_at:
        return False
    return True


def ideas_summary(collector_out, angles_out=""):
    """ตัดเหลือบรรทัดสรุปที่อ่านจบในสายตาเดียว (ฟังก์ชันล้วน — ทดสอบได้)

    ตัวเก็บพิมพ์รายการไอเดีย 15 อันดับแรก ตัวคิดมุมพิมพ์ทีละชิ้นทีละมุม — ยาวเกินห้องแชต
    เก็บเฉพาะบรรทัดที่ขึ้นต้นด้วยป้าย [ideas] [purge] [angles] กับบรรทัดเตือนที่มี ⚠️
    """
    keep = []
    for out in (collector_out or "", angles_out or ""):
        for line in out.splitlines():
            s = line.strip()
            if s.startswith(("[ideas]", "[purge]", "[angles]")) or "⚠️" in s:
                keep.append(s)
    return "\n".join(keep)


def run_ideas(manual=False):
    """เก็บไอเดีย → คิดมุม · ขั้นคิดมุมล้มไม่นับว่ารอบนี้ล้ม"""
    chat_id = STATE.get("chat_id")
    if not _ideas_lock.acquire(blocking=False):
        if manual and chat_id:
            send(chat_id, "⏳ กำลังเก็บไอเดียอยู่แล้ว — รอผลสักครู่")
        return
    try:
        today = date.today().isoformat()
        if STATE.get("ideas_tries_date") != today:
            STATE["ideas_tries"] = 0
            STATE["ideas_tries_date"] = today
        if manual and chat_id:
            send(chat_id, "💡 เริ่มเก็บไอเดียคอนเทนต์ … ใช้เวลาราว 10-40 นาที (ขั้นคิดมุมช้า) เสร็จแล้วจะรายงานที่นี่")

        t0 = time.time()
        p, err = _run_py(IDEA_COLLECTOR, [], timeout=900)
        ok = p is not None and p.returncode == 0
        col_out = p.stdout if p is not None else ""
        ang_out, ang_note = "", ""
        if ok:
            a, a_err = _run_py(IDEA_ANGLES, ["--limit", IDEAS_ANGLE_LIMIT], timeout=2700)
            if a is None or a.returncode != 0:
                ang_note = "\n⚠️ ขั้นคิดมุมไม่สำเร็จ — ไอเดียยังอยู่ครบ ใช้มุมจาก template ไปก่อน"
            ang_out = a.stdout if a is not None else a_err
        mins = (time.time() - t0) / 60

        if ok:
            STATE["ideas_done_date"] = today
            STATE.pop("ideas_retry_at", None)
            STATE["ideas_tries"] = 0
            save_state()
            if chat_id:
                send(chat_id, f"💡 <b>เก็บไอเดียประจำวันแล้ว</b> ({mins:.1f} นาที) — ดูที่หน้า /marketing"
                              f"{ang_note}\n\n<pre>{_esc(ideas_summary(col_out, ang_out)[:3000])}</pre>")
            return

        detail = err if p is None else ((p.stderr or "").strip()[-1200:] or col_out[-800:])
        tries = STATE.get("ideas_tries", 0) + 1
        STATE["ideas_tries"] = tries
        if tries >= AUTO_MAX_TRIES:
            STATE["ideas_done_date"] = today        # ยอมแพ้ของวันนี้ พรุ่งนี้ลองใหม่เอง
            STATE.pop("ideas_retry_at", None)
        else:
            STATE["ideas_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
        save_state()
        if chat_id:
            send(chat_id, f"❌ <b>เก็บไอเดียล้ม</b> (รอบที่ {tries}/{AUTO_MAX_TRIES})"
                          + (f" — จะลองใหม่ในอีก {AUTO_RETRY_MIN} นาที" if tries < AUTO_MAX_TRIES
                             else " — หยุดลองของวันนี้ พรุ่งนี้เก็บใหม่เอง หรือพิมพ์ /ideas")
                          + f"\n\n<pre>{_esc(detail)}</pre>")
    except Exception as e:
        STATE["ideas_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
        save_state()
        if chat_id:
            send(chat_id, f"❌ รอบเก็บไอเดียล้ม: {_esc(e)}")
    finally:
        _ideas_lock.release()


# ── โพสต์อัตโนมัติ — เคาะปลายทางบนเว็บทุก 15 นาที (แทน marketing-autopost.yml) ──
#
# ⚠️ ตัวตัดสินใจว่าโพสต์ชิ้นไหนอยู่ฝั่งเว็บ บอทเป็นแค่ตัวจับเวลาเหมือน workflow เดิมเป๊ะ
#    ห้ามย้ายตรรกะการเลือกโพสต์มาที่นี่ — สองที่ที่ตัดสินใจเรื่องเดียวกันจะเพี้ยนคนละทางวันหนึ่ง
# ⚠️ ไม่มี secret = ปลายทางตอบ 503 แล้วไม่โพสต์อะไร ซึ่งไม่ใช่ความล้มเหลว (เหมือนของเดิม)

def autopost_due(now, state):
    if not state.get("autopost_enabled", True):
        return False
    return now.timestamp() - (state.get("autopost_last") or 0) >= AUTOPOST_EVERY_MIN * 60


def autopost_report(code, data):
    """ข้อความที่ควรส่งเข้าห้อง หรือ None ถ้ารอบนี้ไม่มีอะไรต้องบอก (ฟังก์ชันล้วน — ทดสอบได้)

    200 ที่ไม่มีของถึงคิว = เงียบ · ไม่งั้นห้องจะมีข้อความทุก 15 นาทีจนคนเลิกอ่าน
    """
    if code == 503:
        return None
    if code != 200:
        return f"❌ โพสต์อัตโนมัติ: ปลายทางตอบ HTTP {code}"
    results = data.get("results") or []
    manual = [r for r in results if r.get("needsManualFix")]
    if manual:
        return ("🚨 <b>ขึ้นเพจแล้วแต่บันทึกฐานข้อมูลไม่สำเร็จ</b> — ต้องแก้มือ อย่าสั่งโพสต์ซ้ำ\n"
                + " · ".join(f"#{r.get('id')}" for r in manual))
    failed = data.get("failed") or 0
    if failed:
        return (f"⚠️ โพสต์อัตโนมัติ: ล้ม {failed} ชิ้น\n"
                + "\n".join(f"#{r.get('id')} {str(r.get('error'))[:90]}"
                             for r in results if not r.get("ok")))
    posted = data.get("posted") or 0
    if posted:
        return (f"📣 <b>โพสต์อัตโนมัติขึ้นเพจแล้ว {posted} ชิ้น</b>\n"
                + "\n".join(f"#{r.get('id')} {r.get('post_url') or ''}".strip()
                             for r in results if r.get("ok")))
    return None


def run_autopost(manual=False):
    chat_id = STATE.get("chat_id")
    STATE["autopost_last"] = time.time()   # ตั้งก่อนยิง — ยิงไม่ผ่านก็ไม่ควรรัวซ้ำทุกติ๊ก
    save_state()
    secret = env("AUTOPOST_SECRET")
    if not secret:
        if manual and chat_id:
            send(chat_id, "⏸ ยังไม่ได้เปิดใช้โพสต์อัตโนมัติ — ไม่มี AUTOPOST_SECRET ใน deploy/.env.local")
        return
    req = urllib.request.Request(
        AUTOPOST_URL, data=json.dumps({"dryRun": False}).encode("utf-8"),
        headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            code, body = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        code, body = 0, str(e)
    try:
        data = json.loads(body)
    except Exception:
        data = {}

    msg = autopost_report(code, data)
    if manual and chat_id and not msg:
        send(chat_id, f"📭 ไม่มีโพสต์ถึงคิว (ปลายทางตอบ HTTP {code})")
    if not msg or not chat_id:
        return
    bad = msg[0] in "❌⚠️🚨"
    if bad:
        # ปัญหาเดิมซ้ำทุก 15 นาทีจะท่วมห้อง — ข่าวดีส่งได้เสมอ ข่าวร้ายชั่วโมงละครั้ง
        if time.time() - (STATE.get("autopost_alert_at") or 0) < AUTOPOST_ALERT_GAP_MIN * 60:
            return
        STATE["autopost_alert_at"] = time.time()
        save_state()
    send(chat_id, msg + (f"\n\n<pre>{_esc(body[:600])}</pre>" if bad else ""))


# ── สำรองข้อมูลรายสัปดาห์ (แทน weekly-backup.yml) ──
#
# เงื่อนไขเป็น "ครบ 7 วันตั้งแต่ชุดล่าสุดหรือยัง" ไม่ใช่ "วันอาทิตย์หรือยัง" —
# ของเดิมยิงคืนวันเสาร์ ถ้ายึดวันตายตัวแล้ววันนั้นเครื่องปิด สัปดาห์นั้นจะหายไปทั้งรอบ
_backup_lock = threading.Lock()


def backup_due(now, state):
    if not state.get("backup_enabled", True):
        return False
    if now.strftime("%H:%M") < BACKUP_AT_DEFAULT:
        return False
    done = state.get("backup_done_date")
    if not done:
        return True
    try:
        return (now.date() - date.fromisoformat(done)).days >= BACKUP_EVERY_DAYS
    except ValueError:
        return True          # ค่าพังในไฟล์ state อย่าทำให้ไม่สำรองข้อมูลไปตลอด


def prune_backups(keep=BACKUP_KEEP):
    """ลบชุดเก่าที่เกินโควตา คืนชื่อที่ลบ · ชื่อโฟลเดอร์เป็น timestamp เรียงตามตัวอักษรได้ตรงกับเวลา"""
    if not BACKUP_DIR.exists():
        return []
    dirs = sorted((d for d in BACKUP_DIR.iterdir() if d.is_dir()), key=lambda d: d.name)
    dead = dirs[:-keep] if keep > 0 else []
    for d in dead:
        shutil.rmtree(d, ignore_errors=True)
    return [d.name for d in dead]


def run_backup(manual=False):
    chat_id = STATE.get("chat_id")
    if not _backup_lock.acquire(blocking=False):
        if manual and chat_id:
            send(chat_id, "⏳ กำลังสำรองข้อมูลอยู่แล้ว — รอผลสักครู่")
        return
    try:
        if manual and chat_id:
            send(chat_id, "💾 เริ่มสำรองข้อมูล …")
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        p, err = _run_node(BACKUP_SCRIPT, [], timeout=1800, extra_env={"BACKUP_DIR": str(BACKUP_DIR)})
        ok = p is not None and p.returncode == 0
        out = (p.stdout if p is not None else err) or ""
        if not ok:
            detail = err if p is None else ((p.stderr or "").strip()[-1000:] or out[-800:])
            if chat_id:
                send(chat_id, f"❌ <b>สำรองข้อมูลล้ม</b>\n\n<pre>{_esc(detail)}</pre>")
            return
        STATE["backup_done_date"] = date.today().isoformat()
        save_state()
        removed = prune_backups()
        tail = "\n".join(l.strip() for l in out.splitlines() if l.strip()[:1] in "✓✗✅")
        if chat_id:
            send(chat_id, f"💾 <b>สำรองข้อมูลแล้ว</b> ({(time.time() - t0) / 60:.1f} นาที)"
                          + (f" · ลบชุดเก่า {len(removed)} ชุด" if removed else "")
                          + f"\n<pre>{_esc(tail[:2500])}</pre>")
    finally:
        _backup_lock.release()


def scheduler():
    while True:
        try:
            if auto_due(datetime.now(), STATE):
                run_auto()
            # วางหลังซิงค์ — วันที่เปิดเครื่องสายจนค้างทั้งคู่ ไอเดียภายในจะได้อ่านยอดขายล่าสุด
            if ideas_due(datetime.now(), STATE):
                # แยกเธรด — ขั้นคิดมุมวัดจริง 18 นาทีกับ 19 ชิ้น ถ้ารันในเธรดนี้ ตัวจับเวลาซิงค์จะค้างรอไปด้วย
                # ติ๊กถัดไประหว่างที่ยังรันอยู่จะเรียกซ้ำ แต่ _ideas_lock ทำให้ตัวที่ซ้ำออกทันที
                threading.Thread(target=run_ideas, daemon=True).start()
            # ทั้งสองตัวแยกเธรดเหมือนกัน — เคาะโพสต์รอปลายทางได้นาน ส่วนสำรองข้อมูลกินหลายนาที
            if autopost_due(datetime.now(), STATE):
                threading.Thread(target=run_autopost, daemon=True).start()
            if backup_due(datetime.now(), STATE):
                threading.Thread(target=run_backup, daemon=True).start()
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
    idea_on = STATE.get("ideas_enabled", True)
    idea_done = STATE.get("ideas_done_date") == date.today().isoformat()
    lines.append(f"💡 เก็บไอเดีย: <b>{'เปิด' if idea_on else 'ปิด'}</b> · เวลา <b>{IDEAS_AT_DEFAULT}</b> น. · "
                 f"วันนี้{'เก็บแล้ว' if idea_done else 'ยังไม่ได้เก็บ'}")
    bk = STATE.get("backup_done_date") or "ยังไม่เคย"
    lines.append(f"💾 สำรองข้อมูล: <b>{'เปิด' if STATE.get('backup_enabled', True) else 'ปิด'}</b> · "
                 f"ทุก {BACKUP_EVERY_DAYS} วัน · ชุดล่าสุด {bk}")
    ap_last = STATE.get("autopost_last")
    ago = f"{int((time.time() - ap_last) / 60)} นาทีที่แล้ว" if ap_last else "ยังไม่เคย"
    lines.append(f"📣 โพสต์อัตโนมัติ: <b>{'เปิด' if STATE.get('autopost_enabled', True) else 'ปิด'}</b> · "
                 f"เคาะทุก {AUTOPOST_EVERY_MIN} นาที · ล่าสุด {ago}")
    lines.append("\nเครื่องต้องเปิดอยู่บอทถึงจะทำงาน — ถ้าเครื่องปิดข้ามคืน "
                 "บอทจะซิงค์ชดเชยให้ทันทีที่เปิดมา")
    lines.append("สั่งได้: /auto on · /auto off · /auto 00:30 · /ideas (เก็บไอเดียเดี๋ยวนี้) · /ideas on|off")
    lines.append("ปุ่มหาย/ไม่ขึ้นบนเครื่องใคร ให้พิมพ์ /panel — แผงปุ่มในข้อความ ทุกคนในห้องกดได้")
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
            send_panel(chat_id)
        return
    if chat_id != state["chat_id"]:
        return              # ห้องอื่น/แชทส่วนตัวคนแปลกหน้า — เมินเงียบ ๆ

    if text.startswith("/start") or text.startswith("/buttons") or text.startswith("/panel"):
        # ส่งทั้งสองแบบ — reply keyboard สำหรับคนที่เห็นอยู่แล้ว + แผง inline ที่ทุกคนในห้องเห็น
        send(chat_id, "ปุ่มพร้อมใช้ครับ 👇\n(ซิงค์อัตโนมัติทุกคืนอยู่แล้ว — "
                      "ดูสถานะด้วย /auto)", keyboard=True)
        send_panel(chat_id)
    elif text.startswith("/backup"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["backup_enabled"] = True
            save_state()
            send(chat_id, f"✅ เปิดสำรองข้อมูลอัตโนมัติแล้ว (ทุก {BACKUP_EVERY_DAYS} วัน)")
        elif arg in ("off", "ปิด"):
            state["backup_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดสำรองข้อมูลอัตโนมัติแล้ว — พิมพ์ /backup เพื่อสำรองเองได้")
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /backup · /backup on · /backup off")
        else:
            threading.Thread(target=run_backup, kwargs={"manual": True}, daemon=True).start()
    elif text.startswith("/autopost"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["autopost_enabled"] = True
            save_state()
            send(chat_id, f"✅ เปิดโพสต์อัตโนมัติแล้ว (เคาะทุก {AUTOPOST_EVERY_MIN} นาทีตอนเครื่องเปิด)")
        elif arg in ("off", "ปิด"):
            state["autopost_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดโพสต์อัตโนมัติแล้ว — ของที่ตั้งเวลาไว้จะไม่ขึ้นเพจเอง")
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /autopost · /autopost on · /autopost off")
        else:
            threading.Thread(target=run_autopost, kwargs={"manual": True}, daemon=True).start()
    elif text.startswith("/ideas"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["ideas_enabled"] = True
            save_state()
            send(chat_id, f"✅ เปิดเก็บไอเดียอัตโนมัติแล้ว (ทุกวัน {IDEAS_AT_DEFAULT} น.)")
        elif arg in ("off", "ปิด"):
            state["ideas_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดเก็บไอเดียอัตโนมัติแล้ว — พิมพ์ /ideas เพื่อเก็บเองได้")
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /ideas · /ideas on · /ideas off")
        else:
            threading.Thread(target=run_ideas, kwargs={"manual": True}, daemon=True).start()
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


# ── ปุ่มจากแผง inline ──
#
# ⚠️ ต้องตอบ answerCallbackQuery ทุกครั้งและตอบก่อนเริ่มงาน — ไม่งั้นปุ่มค้างหมุนบนเครื่องคนกด
#    (Telegram ให้เวลาตอบสั้นมาก งานซิงค์กินหลายนาที รอให้เสร็จก่อนตอบไม่ทันแน่)
CALLBACK_JOBS = {
    "stock": (["--stock"], "ซิงค์สต็อกหน้าตู้"),
    "sync": ([], "ซิงค์ทั้งหมด"),
    "sales": (["--sales"], "ซิงค์ยอดขาย"),
}


def who(user):
    """ชื่อคนกดปุ่ม — ห้องนี้มีหลายคน ต้องรู้ว่าใครสั่ง (ฟังก์ชันล้วน — ทดสอบได้)"""
    u = user or {}
    name = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip()
    if name:
        return name
    return f"@{u['username']}" if u.get("username") else f"id {u.get('id', '?')}"


def handle_callback(cq):
    data = (cq.get("data") or "").strip()
    chat_id = ((cq.get("message") or {}).get("chat") or {}).get("id")
    call("answerCallbackQuery", callback_query_id=cq.get("id"), text="รับคำสั่งแล้ว")
    if not chat_id or chat_id != STATE.get("chat_id"):
        return              # ห้องอื่น — เมินเหมือนข้อความ
    name = who(cq.get("from"))
    if data in CALLBACK_JOBS:
        args, label = CALLBACK_JOBS[data]
        send(chat_id, f"👤 {name} กด <b>{label}</b>")
        threading.Thread(target=run_sync, args=(chat_id, args, label), daemon=True).start()
    elif data == "ideas":
        send(chat_id, f"👤 {name} กด <b>เก็บไอเดีย</b>")
        threading.Thread(target=run_ideas, kwargs={"manual": True}, daemon=True).start()
    elif data == "backup":
        send(chat_id, f"👤 {name} กด <b>สำรองข้อมูล</b>")
        threading.Thread(target=run_backup, kwargs={"manual": True}, daemon=True).start()
    elif data == "status":
        send(chat_id, auto_status())


def main():
    offset = 0
    me = call("getMe")
    print(f"บอทพร้อม: @{(me or {}).get('result', {}).get('username', '?')}"
          f" · ผูกกับ chat: {STATE.get('chat_id', 'ยังไม่ผูก — ส่ง /start ในกลุ่ม')}"
          f" · ซิงค์อัตโนมัติ {parse_hhmm(STATE.get('auto_at')) or AUTO_AT_DEFAULT} น.")
    threading.Thread(target=scheduler, daemon=True).start()

    while True:
        upd = call("getUpdates", offset=offset, timeout=50,
                   allowed_updates=["message", "callback_query"])
        if not upd or not upd.get("ok"):
            time.sleep(5)
            continue
        for u in upd["result"]:
            offset = u["update_id"] + 1
            try:
                if u.get("callback_query"):
                    handle_callback(u["callback_query"])
                else:
                    handle(u)
            except Exception as e:
                # ข้อความแปลก ๆ ใบเดียวต้องไม่ล้มทั้งบอท — เพราะบอทตายเมื่อไหร่
                # ซิงค์อัตโนมัติตายตามไปเงียบ ๆ ไม่มีใครรู้จนยอดขายหายไปหลายวัน
                print(f"[update {u.get('update_id')}] {e}")


if __name__ == "__main__":
    main()
