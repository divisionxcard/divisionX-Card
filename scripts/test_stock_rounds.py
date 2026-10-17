"""ทดสอบรอบซิงค์สต็อกระหว่างวันในบอทซิงค์ (/rounds) — ไม่ยิงเน็ต ไม่แตะ DB ไม่เขียนไฟล์ state จริง

รัน:  .venv-image\\Scripts\\python.exe scripts\\test_stock_rounds.py
"""
import contextlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
import time
import types
from datetime import date, datetime, timedelta

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

spec = importlib.util.spec_from_file_location(
    "bot", pathlib.Path(__file__).with_name("telegram_sync_bot.py"))
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)   # ต้องมี SYNC_BOT_TOKEN ใน deploy/.env.local (ตัวบอทเช็คตอนโหลด)

# ⚠️ บอทตัวจริงรันค้างอยู่บนเครื่องและอ่าน/เขียน scripts/.sync_bot_state.json — เทสต์ห้ามเขียนทับ
#    ทุกอย่างที่ save_state() เซฟให้ลงไฟล์ชั่วคราว และไม่ใช้ STATE ที่โหลดมาจากไฟล์จริง
_tmp = tempfile.TemporaryDirectory()
REAL_STATE = pathlib.Path(__file__).with_name(".sync_bot_state.json")
bot.STATE_FILE = pathlib.Path(_tmp.name) / "state.json"
bot.STATE = {}
# ห้ามยิงเน็ต — send ถูกแทนข้างล่าง ตัวนี้กันอะไรก็ตามที่หลุดไปเรียก Telegram API ตรง ๆ (เช็กท้ายไฟล์ว่าว่าง)
net = []
bot.call = lambda method, **params: net.append(method)

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — ได้ {got!r} ต้องการ {want!r}"))


def has(name, got, needle):
    global fails
    ok = needle in (got or "")
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — ไม่เจอ {needle!r} ใน {got!r}"))


D = "2026-10-17"


def at(h, m, day=17):
    return datetime(2026, 10, day, h, m)


@contextlib.contextmanager
def frozen(h, m, day=17):
    """ให้ "ตอนนี้" ของบอท (datetime.now / date.today) เป็นเวลาที่กำหนด

    โค้ดที่ไม่รับ now เอง (ตัวรับคำสั่ง · ปุ่ม · รอบเที่ยงคืน · ตัวจับเวลา) จะได้ทดสอบได้ผลเดิมทุกวัน
    ไม่ขึ้นกับวันที่รันเทสต์
    """
    class FakeDT(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, day, h, m)

    class FakeDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, day)

    saved = bot.datetime, bot.date
    bot.datetime, bot.date = FakeDT, FakeDate
    try:
        yield
    finally:
        bot.datetime, bot.date = saved


check("เทสต์เซฟลงไฟล์ชั่วคราว ไม่ใช่ไฟล์ state ของบอทตัวจริง", bot.STATE_FILE != REAL_STATE, True)


def ND(st=None, day=17):
    """state ของ "กลางวันปกติ" — รอบเที่ยงคืนของวันนั้นจบไปแล้ว
    (ระหว่างที่รอบเที่ยงคืนของวันนี้ยังค้าง รอบกลางวันรอ — มีเทสต์ของมันเองในหัวข้อ "รอบเที่ยงคืนยังค้าง")"""
    return {"auto_done_date": f"2026-10-{day:02d}", **(st or {})}


# ── ตัวจับเวลา: รอบไหนถึงคิว ──
check("ไม่มีคีย์ → ค่าปริยาย 10:00", bot.stock_rounds({}), ["10:00"])
check("09:59 ยังไม่ถึงเวลา", bot.stock_rounds_due(at(9, 59), ND()), [])
check("10:00 พอดี → ถึงคิว", bot.stock_rounds_due(at(10, 0), ND()), ["10:00"])
check("วันนี้ทำแล้ว → ไม่ซ้ำ", bot.stock_rounds_due(at(11, 0), ND({"stock_round_done": {"10:00": D}})), [])
check("ทำล่าสุดเมื่อวาน → วันนี้ถึงคิวใหม่ (ข้ามวัน)",
      bot.stock_rounds_due(at(10, 0), ND({"stock_round_done": {"10:00": "2026-10-16"}})), ["10:00"])
check("ข้ามวันแล้วแต่ยังไม่ถึง 10:00 → รอ",
      bot.stock_rounds_due(at(0, 30, day=18), ND({"stock_round_done": {"10:00": D}}, day=18)), [])
check("รอลองใหม่อยู่ → ยังไม่รัน",
      bot.stock_rounds_due(at(10, 10), ND({"stock_round_retry_at": at(10, 30).timestamp()})), [])
check("เลยเวลาลองใหม่แล้ว → รัน",
      bot.stock_rounds_due(at(10, 31), ND({"stock_round_retry_at": at(10, 30).timestamp()})), ["10:00"])
three = ND({"stock_rounds": ["10:00", "12:00", "15:00"]})
check("เครื่องเปิดสาย ค้าง 2 รอบ → คืนทั้งสองในครั้งเดียว",
      bot.stock_rounds_due(at(12, 30), three), ["10:00", "12:00"])
check("เลยมา 4 ชม. พอดี → ยังรันชดเชย", bot.stock_rounds_due(at(14, 0), ND()), ["10:00"])
check("เลยมาเกิน 4 ชม. → ข้ามของวันนี้", bot.stock_rounds_due(at(14, 1), ND()), [])
check("เปิดเครื่องตอนค่ำ → ไม่มี 'รอบ 10:00' โผล่", bot.stock_rounds_due(at(20, 0), ND()), [])
check("รอบเช้าเลยกำหนด รอบกลางวันยังทัน → คืนแค่ตัวที่ทัน",
      bot.stock_rounds_due(at(14, 30), three), ["12:00"])
check("รอบที่เริ่มทันแต่ล้ม ลองซ้ำได้แม้เลยกำหนด",
      bot.stock_rounds_due(at(14, 20), ND({"stock_round_attempted": {"10:00": D}, "stock_round_tries": 1,
                                           "stock_round_tries_for": f"{D} 10:00",
                                           "stock_round_retry_at": at(14, 19).timestamp()})), ["10:00"])
check("สิทธิ์ลองซ้ำของเมื่อวาน ไม่พาข้ามกำหนดของวันนี้",
      bot.stock_rounds_due(at(14, 20), ND({"stock_round_attempted": {"10:00": "2026-10-16"}})), [])
check("ตัวนับการลอง (tries_for) ไม่ใช่สิทธิ์ข้ามกำหนดแล้ว — ใช้บันทึกรายรอบแทน",
      bot.stock_rounds_due(at(14, 20), ND({"stock_round_tries_for": f"{D} 10:00"})), [])
check("/rounds off → ไม่รัน", bot.stock_rounds_due(at(10, 0), ND({"stock_rounds_enabled": False})), [])
check("/auto off → รอบกลางวันหยุดด้วย", bot.stock_rounds_due(at(10, 0), ND({"auto_enabled": False})), [])
check("ตั้งเอง 15:00 → 10:00 ไม่ใช่รอบแล้ว",
      bot.stock_rounds_due(at(10, 0), ND({"stock_rounds": ["15:00"]})), [])
check("ตั้งเอง 15:00 → 15:00 ถึงคิว",
      bot.stock_rounds_due(at(15, 0), ND({"stock_rounds": ["15:00"]})), ["15:00"])
check("รายการว่าง → ไม่มีรอบ", bot.stock_rounds_due(at(12, 0), ND({"stock_rounds": []})), [])
check("ค่าพังในไฟล์ state ข้ามทีละตัว",
      bot.stock_rounds({"stock_rounds": ["25:00", "abc", "10:00", None, "10:00"]}), ["10:00"])
check("ค่าไม่ใช่รายการ → กลับไปใช้ค่าปริยาย", bot.stock_rounds({"stock_rounds": 5}), ["10:00"])
check("บันทึกรอบ/เวลาลองใหม่พัง → ไม่ล้ม ยังรันได้",
      bot.stock_rounds_due(at(10, 0), ND({"stock_round_done": "x", "stock_round_retry_at": "y",
                                          "stock_round_attempted": "z"})), ["10:00"])
check("ไม่ปนกับรอบเที่ยงคืน (auto_done_date วันนี้)",
      bot.stock_rounds_due(at(10, 0), {"auto_done_date": D}), ["10:00"])

# ── สถานะรายรอบ (/rounds กับ /auto) ──
check("สถานะ: ข้าม / เสร็จ / รอ",
      bot.round_states(at(14, 30), {**three, "stock_round_done": {"12:00": D}}),
      [("10:00", "skipped"), ("12:00", "done"), ("15:00", "wait")])
check("สถานะ: ถึงคิว", bot.round_states(at(10, 5), ND()), [("10:00", "due")])
check("สถานะ: รอลองใหม่",
      bot.round_states(at(10, 5), ND({"stock_round_retry_at": at(10, 30).timestamp()})), [("10:00", "retry")])
check("สถานะ: ล้มจนยอมแพ้",
      bot.round_states(at(11, 0), {"stock_round_done": {"10:00": D}, "stock_round_failed": {"10:00": D}}),
      [("10:00", "failed")])
check("สถานะ: กำลังซิงค์ (รอบที่ถึงคิว)", bot.round_states(at(10, 5), {}, running=True), [("10:00", "running")])
check("สถานะ: กำลังซิงค์ ไม่ทับรอบที่ยังไม่ถึงเวลา/เสร็จแล้ว/ข้าม",
      bot.round_states(at(14, 30), {**three, "stock_round_done": {"12:00": D}}, running=True),
      [("10:00", "skipped"), ("12:00", "done"), ("15:00", "wait")])
has("บรรทัดใน /auto บอกรอบ", bot.rounds_line(at(9, 0), {}), "10:00 ⏳")
has("บรรทัดใน /auto ตอน /auto off", bot.rounds_line(at(9, 0), {"auto_enabled": False}), "ตาม /auto off")
has("บรรทัดใน /auto ตอนไม่มีรอบ", bot.rounds_line(at(9, 0), {"stock_rounds": []}), "/rounds 10:00")
has("/rounds รอลองใหม่บอกนาทีที่เหลือ",
    bot.rounds_status(at(10, 5), ND({"stock_round_retry_at": at(10, 30).timestamp()})), "รอลองใหม่อีก 25 นาที")
has("/rounds บอกว่ารอบที่ข้ามเพราะอะไร", bot.rounds_status(at(15, 0), {}), "ข้ามของวันนี้")
has("/rounds บอกเพดานการตั้งรอบ", bot.rounds_status(at(9, 0), {}), "ไม่เกิน 6 รอบ")

# ── /rounds: แปลงคำสั่ง ──
check("/rounds เปล่า → ดูสถานะ", bot.parse_rounds_arg(""), ("show", None))
check("/rounds on", bot.parse_rounds_arg("on"), ("on", None))
check("/rounds ON (ตัวใหญ่ + เว้นวรรค)", bot.parse_rounds_arg(" ON "), ("on", None))
check("/rounds เปิด", bot.parse_rounds_arg("เปิด"), ("on", None))
check("/rounds off", bot.parse_rounds_arg("off"), ("off", None))
check("/rounds ปิด", bot.parse_rounds_arg("ปิด"), ("off", None))
check("คั่นจุลภาค", bot.parse_rounds_arg("10:00,15:00"), ("set", ["10:00", "15:00"]))
check("เว้นวรรค + เรียงให้", bot.parse_rounds_arg("15:00 10:00"), ("set", ["10:00", "15:00"]))
check("จุลภาคตามด้วยเว้นวรรค", bot.parse_rounds_arg("10:00, 15:00"), ("set", ["10:00", "15:00"]))
check("เขียนแบบไทย 10.00", bot.parse_rounds_arg("10.00"), ("set", ["10:00"]))
check("ตัดตัวซ้ำ", bot.parse_rounds_arg("10:00,10:00"), ("set", ["10:00"]))
check("ชั่วโมงหลักเดียว 9:30 → 09:30", bot.parse_rounds_arg("9:30"), ("set", ["09:30"]))
check("นาทีหลักเดียว 9:5 (09:05 หรือ 09:50?) → ไม่รับ", bot.parse_rounds_arg("9:5"), ("bad", None))
check("ขยะ → ไม่รับ", bot.parse_rounds_arg("abc"), ("bad", None))
check("25:00 → ไม่รับ", bot.parse_rounds_arg("25:00"), ("bad", None))
check("10 (ไม่มีนาที) → ไม่รับ", bot.parse_rounds_arg("10"), ("bad", None))
check("มีตัวพังปน → ไม่รับทั้งชุด", bot.parse_rounds_arg("10:00,xyz"), ("bad", None))
check("จุลภาคเปล่า → ไม่รับ", bot.parse_rounds_arg(","), ("bad", None))
# หน่วย "น." แบบไทย + รูปแบบเข้ม (ข้อ 8)
check("หน่วยไทย '10.00 น.'", bot.parse_rounds_arg("10.00 น."), ("set", ["10:00"]))
check("หน่วยไทยติดกัน '10:00น.'", bot.parse_rounds_arg("10:00น."), ("set", ["10:00"]))
check("หน่วยไทยไม่มีจุด '10.00 น'", bot.parse_rounds_arg("10.00 น"), ("set", ["10:00"]))
check("หลายเวลาพร้อมหน่วย", bot.parse_rounds_arg("10.00 น., 15.00น."), ("set", ["10:00", "15:00"]))
check("เลขไทย ๑๐:๐๐ ยังรับ", bot.parse_rounds_arg("๑๐:๐๐"), ("set", ["10:00"]))
check("'+1:00' → ไม่รับ", bot.parse_rounds_arg("+1:00"), ("bad", None))
check("'-0:00' → ไม่รับ", bot.parse_rounds_arg("-0:00"), ("bad", None))
check("'1_0:00' → ไม่รับ", bot.parse_rounds_arg("1_0:00"), ("bad", None))
check("'10:00:00' → ไม่รับ", bot.parse_rounds_arg("10:00:00"), ("bad", None))
check("มีแต่หน่วย 'น.' → ไม่รับ", bot.parse_rounds_arg("น."), ("bad", None))

# ── /rounds: เพดานจำนวนรอบ/ระยะห่าง/เวลาดึกสุด (ข้อ 4) ──
six = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"]
check("6 รอบ ห่างกัน 1 ชม. พอดี → ตั้งได้", bot.rounds_problem(six), None)
check("ค่าปริยายผ่านเพดาน", bot.rounds_problem(bot.STOCK_ROUNDS_DEFAULT), None)
has("7 รอบ → ไม่รับ บอกเพดาน", bot.rounds_problem(six + ["14:00"]), "ไม่เกิน 6 รอบ")
has("7 รอบ → บอกเหตุผลเรื่องโดนบล็อก", bot.rounds_problem(six + ["14:00"]), "ถี่เกินเสี่ยงโดนบล็อก")
has("ห่างกัน 30 นาที → ไม่รับ บอกคู่ที่ใกล้เกิน", bot.rounds_problem(["10:00", "10:30"]), "10:00 กับ 10:30")
has("ห่างกัน 30 นาที → บอกเหตุผลเรื่องโดนบล็อก", bot.rounds_problem(["10:00", "10:30"]), "ถี่เกินเสี่ยงโดนบล็อก")
has("ห่างกัน 59 นาที → ไม่รับ", bot.rounds_problem(["10:00", "10:59"]), "อย่างน้อย 1 ชม.")
check("ห่างกัน 60 นาทีพอดี → ตั้งได้", bot.rounds_problem(["10:00", "11:00"]), None)
check("23:00 → ตั้งได้ (ดึกสุด)", bot.rounds_problem(["23:00"]), None)
has("23:01 → ไม่รับ บอกเหตุผลเรื่องเที่ยงคืน", bot.rounds_problem(["10:00", "23:01"]), "เที่ยงคืน")

# ── ตัวรัน: ต่อกับ sync_local ปลอม (ไม่ยิงเน็ต ไม่แตะ DB) ──
sent, calls = [], []
bot.send = lambda chat_id, text, **kw: sent.append(text)


def fake_job(results):
    def job(args):
        calls.append(list(args))
        if isinstance(results, Exception):
            raise results
        ok = results["stock" if "--stock" in args else "sales"]
        return ok, ("สรุป\n  ✅ ผ่าน" if ok else "Traceback ...\nRuntimeError: VMS ตอบ 500")
    return job


def reset(extra=None, results=None):
    sent.clear()
    calls.clear()
    # กลางวันปกติ: รอบเที่ยงคืนของวันนี้จบไปแล้ว แต่ตัวชี้ยอดขายค้างที่เมื่อวาน (รอบนี้ต้องไล่ยอดขายก่อนสต็อก)
    # · เทสต์ที่ต้องการให้รอบเที่ยงคืน "ยังค้าง" ส่ง auto_done_date ของเมื่อวานเข้ามาเอง
    bot.STATE = {"chat_id": 1, "auto_sales_through": "2026-10-16", "auto_done_date": D, **(extra or {})}
    bot._run_job = fake_job(results or {"sales": True, "stock": True})


reset()
bot.run_stock_round(at(10, 0))
msg = sent[0] if sent else ""
check("ผ่าน: ยอดขายก่อน แล้วค่อยสต็อก", [("--stock" in c) for c in calls], [False, True])
check("ผ่าน: ยอดขายไล่จากตัวชี้ ทับซ้อน 2 วัน",
      calls[0] if calls else None, ["--sales", "--from", "2026-10-14", "--to", "2026-10-17"])
check("ผ่าน: ปิดรอบ 10:00 ของวันนี้", bot.STATE.get("stock_round_done"), {"10:00": D})
check("ผ่าน: ตัวชี้ยอดขายเลื่อนถึงวันนี้", bot.STATE.get("auto_sales_through"), D)
check("ผ่าน: คืนถัดไปยังดึงยอดของวันนี้ซ้ำให้ครบทั้งวัน (ไม่มีวันหลุด)",
      bot.sales_chunks(date.fromisoformat(bot.STATE["auto_sales_through"]), date(2026, 10, 18))[0][0] <= D,
      True)
check("ผ่าน: รายงานเข้าห้องข้อความเดียว", len(sent), 1)
has("ผ่าน: ข้อความบอกรอบ", msg, "ซิงค์รอบ 10:00 เสร็จ")
check("ผ่าน: ข้อความไม่มี /stock (Telegram ทำเป็นคำสั่งที่กดแล้วสั่งซิงค์)", "/stock" in msg, False)
check("ผ่าน: ปล่อยล็อกแล้ว", bot._lock.locked(), False)
check("ผ่าน: ติ๊กถัดไปไม่รันซ้ำ", bot.stock_rounds_due(at(10, 1), bot.STATE), [])
check("ผ่าน: state เซฟลงไฟล์ชั่วคราวจริง", bot.STATE_FILE.exists(), True)

calls.clear()
sent.clear()
bot.run_stock_round(at(10, 1))
check("เรียกซ้ำหลังรอบจบ → เช็กซ้ำหลังได้ล็อก ไม่ซิงค์อีกรอบ", (calls, sent), ([], []))
check("เรียกซ้ำหลังรอบจบ → ไม่ตั้งธง 'กำลังซิงค์'", bot._round_running.is_set(), False)

# รอบกลางวันไม่ไปปิด/แตะรอบเที่ยงคืนแทน — วันที่ย้ายรอบเที่ยงคืนไปหลังรอบกลางวัน (/auto 12:00) มันยังไม่ถึงเวลา
reset({"auto_at": "12:00", "auto_done_date": "2026-10-16"})
bot.run_stock_round(at(10, 0))
check("รอบเที่ยงคืนตั้งไว้ 12:00: รอบ 10:00 รันได้ (รอบเที่ยงคืนยังไม่ถึงเวลา = ไม่ได้ค้าง)",
      bot.STATE.get("stock_round_done"), {"10:00": D})
check("ผ่าน: ไม่ไปปิดรอบเที่ยงคืนแทน (ไม่เรียก mark_day_done)", bot.STATE.get("auto_done_date"), "2026-10-16")
check("ผ่าน: รอบเที่ยงคืนยังถึงคิวของมันตามเวลา", bot.auto_due(at(12, 0), bot.STATE), True)
reset({"auto_at": "12:00", "auto_done_date": "2026-10-16"}, results={"sales": False, "stock": True})
bot.run_stock_round(at(10, 0))
bot.run_stock_round(at(10, 31))
check("ล้มจนยอมแพ้: ไม่แตะรอบเที่ยงคืน (วันที่จบ/ตัวนับ/เวลาลองใหม่ของมัน)",
      (bot.STATE.get("auto_done_date"), bot.STATE.get("auto_tries"), "auto_retry_at" in bot.STATE,
       bot.STATE.get("stock_round_failed")), ("2026-10-16", None, False, {"10:00": D}))

reset()
bot._lock.acquire()
try:
    bot.run_stock_round(at(10, 0))
finally:
    bot._lock.release()
check("ล็อกไม่ว่าง (รอบเที่ยงคืน/ปุ่ม) → ไม่รันอะไร ไม่รายงาน", (calls, sent), ([], []))
check("ล็อกไม่ว่าง → ไม่ปิดรอบ ติ๊กหน้ายังถึงคิว", bot.stock_rounds_due(at(10, 0), bot.STATE), ["10:00"])

reset()
del bot.STATE["chat_id"]
bot.run_stock_round(at(10, 0))
check("ยังไม่ผูกห้อง → ไม่รัน", calls, [])

reset(results={"sales": False, "stock": True})
bot.run_stock_round(at(10, 0))
msg = sent[0] if sent else ""
check("ยอดขายล้ม: ไม่ไปต่อสต็อก", [c for c in calls if "--stock" in c], [])
check("ยอดขายล้ม: ตัวชี้ไม่เลื่อน", bot.STATE.get("auto_sales_through"), "2026-10-16")
check("ยอดขายล้ม: ยังไม่ปิดรอบ", bot.STATE.get("stock_round_done"), None)
check("ยอดขายล้ม: นับครั้งที่ 1", bot.STATE.get("stock_round_tries"), 1)
check("ยอดขายล้ม: จำว่ารอบนี้ลองไปแล้ววันนี้", bot.STATE.get("stock_round_attempted"), {"10:00": D})
check("ยอดขายล้ม: รอ 30 นาที",
      round((bot.STATE.get("stock_round_retry_at", 0) - at(10, 0).timestamp()) / 60), 30)
check("ยอดขายล้ม: รายงานข้อความเดียว", len(sent), 1)
has("ยอดขายล้ม: บอกว่าจะลองใหม่", msg, "จะลองใหม่ในอีก 30 นาที (ครั้งที่ 1/2)")
has("ยอดขายล้ม: แนบเหตุผลจากท้าย log", msg, "VMS ตอบ 500")
check("ยอดขายล้ม: ระหว่างรอไม่รัน", bot.stock_rounds_due(at(10, 20), bot.STATE), [])
check("ยอดขายล้ม: ปล่อยล็อกแล้ว", bot._lock.locked(), False)
check("ยอดขายล้ม: ล้างธง 'กำลังซิงค์' แล้ว", bot._round_running.is_set(), False)
check("ยอดขายล้ม: สถานะเป็น 'รอลองใหม่' ไม่ใช่ 'กำลังซิงค์'",
      bot.round_states(at(10, 5), bot.STATE), [("10:00", "retry")])

sent.clear()
calls.clear()
bot.run_stock_round(at(10, 31))
msg = sent[0] if sent else ""
check("ล้มครั้งที่ 2: ลองจริง", len(calls) > 0, True)
check("ล้มครั้งที่ 2: ยอมแพ้ ปิดรอบของวันนี้", bot.STATE.get("stock_round_done"), {"10:00": D})
check("ล้มครั้งที่ 2: จำว่าล้ม", bot.STATE.get("stock_round_failed"), {"10:00": D})
check("ล้มครั้งที่ 2: ล้างตัวนับ/เวลาลองใหม่",
      [k for k in ("stock_round_retry_at", "stock_round_tries", "stock_round_tries_for") if k in bot.STATE], [])
check("ล้มครั้งที่ 2: รายงานข้อความเดียว", len(sent), 1)
has("ล้มครั้งที่ 2: บอกว่าหยุดแล้ว", msg, "ลองครบ 2 ครั้งแล้ว")
check("ล้มครั้งที่ 2: วันนี้ไม่ลองอีก", bot.stock_rounds_due(at(11, 0), bot.STATE), [])
check("ล้มครั้งที่ 2: สถานะเป็น 'ล้ม'", bot.round_states(at(11, 0), bot.STATE), [("10:00", "failed")])
check("ล้มครั้งที่ 2: พรุ่งนี้ (หลังรอบเที่ยงคืนของพรุ่งนี้จบ) กลับมาตามปกติ",
      bot.stock_rounds_due(at(10, 0, day=18), {**bot.STATE, "auto_done_date": "2026-10-18"}), ["10:00"])
check("ล้มครั้งที่ 2: ไม่แตะรอบเที่ยงคืน", (bot.STATE.get("auto_done_date"), bot.STATE.get("auto_tries")),
      (D, None))

reset(results={"sales": True, "stock": False})
bot.run_stock_round(at(10, 0))
check("สต็อกล้ม: รันครบสองขั้นตามลำดับ", [("--stock" in c) for c in calls], [False, True])
check("สต็อกล้ม: ยอดขายผ่านแล้ว ตัวชี้เลื่อนได้", bot.STATE.get("auto_sales_through"), D)
check("สต็อกล้ม: ยังไม่ปิดรอบ รอลองใหม่",
      (bot.STATE.get("stock_round_done"), bot.STATE.get("stock_round_tries")), (None, 1))

reset(results={"sales": False, "stock": True})
bot.run_stock_round(at(13, 59))
check("ล้มตอน 13:59 → รอบลองใหม่ 14:29 ยังได้รันแม้เลยกำหนด 4 ชม.",
      bot.stock_rounds_due(at(14, 29), bot.STATE), ["10:00"])

reset({"stock_rounds": ["10:00", "12:00", "15:00"]})
bot.run_stock_round(at(12, 30))
check("ค้าง 2 รอบ: ซิงค์ครั้งเดียว", [("--stock" in c) for c in calls], [False, True])
check("ค้าง 2 รอบ: ปิดทั้งสองรอบ", bot.STATE.get("stock_round_done"), {"10:00": D, "12:00": D})
has("ค้าง 2 รอบ: ข้อความบอกทั้งสองรอบ", sent[0] if sent else "", "ซิงค์รอบ 10:00 + 12:00")
check("ค้าง 2 รอบ: รอบ 15:00 ยังรอเวลาของมัน", bot.round_states(at(12, 31), bot.STATE)[-1], ("15:00", "wait"))

reset(results=RuntimeError("ท่อแตก"))
bot.run_stock_round(at(10, 0))
check("โยน error กลางทาง: ปล่อยล็อก", bot._lock.locked(), False)
check("โยน error กลางทาง: นับเป็นการล้ม รอลองใหม่", bot.STATE.get("stock_round_tries"), 1)
has("โยน error กลางทาง: รายงานเข้าห้อง", sent[0] if sent else "", "ท่อแตก")

# ── ข้อ 2: หลายรอบ — รอบเก่าที่ลองไปแล้วต้องไม่เสียสิทธิ์ลองใหม่เมื่อรอบใหม่มาร่วมชุด ──
# 10:00 + 14:00 · ซิงค์ล้มตลอด · เริ่มลองครั้งแรก 13:50 (10:00 ยังไม่เลยกำหนด 4 ชม.)
reset({"stock_rounds": ["10:00", "14:00"]}, results={"sales": False, "stock": True})
t, runs, after = at(13, 50), [], []
for _ in range(6):
    due = bot.stock_rounds_due(t, bot.STATE)
    if due:
        sent.clear()
        bot.run_stock_round(t)
        runs.append((t.strftime("%H:%M"), due, sent[0].split("\n")[0] if sent else ""))
        after.append(bot.round_states(t + timedelta(minutes=10), bot.STATE))
    r = bot.STATE.get("stock_round_retry_at")
    t = datetime.fromtimestamp(r + 1) if r else t
check("หลายรอบ: ลำดับการลอง — 10:00 ยังอยู่ในชุดลองใหม่หลัง 14:00 มาร่วม",
      [(a, b) for a, b, _ in runs],
      [("13:50", ["10:00"]), ("14:20", ["10:00", "14:00"]), ("14:50", ["10:00", "14:00"])])
has("หลายรอบ: ชุดที่สองบอกทั้งสองรอบ", runs[1][2] if len(runs) > 1 else "", "ซิงค์รอบ 10:00 + 14:00 ไม่สำเร็จ")
has("หลายรอบ: ชุดที่สองยังได้ลองใหม่ (นับต่อชุด รอบใหม่ได้สิทธิ์เต็ม)", runs[1][2] if len(runs) > 1 else "",
    "จะลองใหม่ในอีก 30 นาที (ครั้งที่ 1/2)")
check("หลายรอบ: ระหว่างรอลองใหม่ ไม่มีรอบไหนขึ้นว่า 'ข้าม'",
      after[:2], [[("10:00", "retry"), ("14:00", "retry")]] * 2)
check("หลายรอบ: ยอมแพ้ → ปิดทั้งชุดพร้อมกัน",
      (bot.STATE.get("stock_round_done"), bot.STATE.get("stock_round_failed")),
      ({"10:00": D, "14:00": D}, {"10:00": D, "14:00": D}))
check("หลายรอบ: สถานะสุดท้ายเป็น 'ล้ม' ทั้งคู่ ไม่ใช่ 'ข้าม'",
      bot.round_states(at(15, 30), bot.STATE), [("10:00", "failed"), ("14:00", "failed")])
check("หลายรอบ: นับครั้งต่อชุดที่รัน — ดึงยอดขายรวม 3 ครั้ง",
      len([c for c in calls if "--sales" in c]), 3)
check("หลายรอบ: จบแล้วไม่ค้างตัวนับ/เวลาลองใหม่", [k for k in bot._ROUND_RETRY_KEYS if k in bot.STATE], [])

# ── ข้อ 5: เวลาลองใหม่ข้ามเที่ยงคืน → ยอมแพ้ ไม่สัญญาว่าจะลองใหม่ ──
reset({"stock_rounds": ["23:00"]}, results={"sales": False, "stock": True})
bot.run_stock_round(at(23, 0))
check("รอบ 23:00 ล้มเร็ว → ลองใหม่ 23:30 ยังวันเดียวกัน ได้ลองตามปกติ",
      (bot.STATE.get("stock_round_tries"), bot.STATE.get("stock_round_done")), (1, None))
has("รอบ 23:00 ล้มเร็ว → บอกว่าจะลองใหม่", sent[0] if sent else "", "จะลองใหม่ในอีก 30 นาที")

reset({"stock_rounds": ["23:00"]}, results={"sales": False, "stock": True})
bot.run_stock_round(at(23, 40))          # บอทพร้อมสาย 40 นาที → ลองใหม่จะเป็น 00:10 ของพรุ่งนี้
msg = sent[0] if sent else ""
check("ลองใหม่ข้ามเที่ยงคืน: ยอมแพ้ ปิดรอบเป็น 'ล้ม'",
      (bot.STATE.get("stock_round_done"), bot.STATE.get("stock_round_failed")), ({"23:00": D}, {"23:00": D}))
check("ลองใหม่ข้ามเที่ยงคืน: ไม่ค้างตัวนับ/เวลาลองใหม่", [k for k in bot._ROUND_RETRY_KEYS if k in bot.STATE], [])
has("ลองใหม่ข้ามเที่ยงคืน: บอกว่ารอบเที่ยงคืนจะดึงให้", msg, "รอบเที่ยงคืนจะดึงให้เอง")
check("ลองใหม่ข้ามเที่ยงคืน: ไม่สัญญาว่า 'จะลองใหม่'", "จะลองใหม่ในอีก" in msg, False)
check("ลองใหม่ข้ามเที่ยงคืน: สถานะเป็น 'ล้ม'", bot.round_states(at(23, 50), bot.STATE), [("23:00", "failed")])
check("ลองใหม่ข้ามเที่ยงคืน: พรุ่งนี้ 00:20 ไม่มีอะไรค้าง", bot.stock_rounds_due(at(0, 20, day=18), bot.STATE), [])

# รันนานจนเวลาลองใหม่ข้ามวัน (เวลาที่รันไปนับรวมด้วย) — นาฬิกาปลอม: ถามเวลาแต่ละครั้งผ่านไป 40 นาที
reset({"stock_rounds": ["23:00"]}, results={"sales": False, "stock": True})
clock = {"n": 0}


def slow_clock():
    clock["n"] += 1
    return 1_000_000.0 + (clock["n"] - 1) * 40 * 60


saved_time = bot.time
bot.time = types.SimpleNamespace(time=slow_clock, sleep=time.sleep)
try:
    bot.run_stock_round(at(23, 0))
finally:
    bot.time = saved_time
check("รันนาน 40 นาทีจาก 23:00 → ลองใหม่จะเป็น 00:10 → ยอมแพ้",
      (bot.STATE.get("stock_round_failed"), "stock_round_retry_at" in bot.STATE), ({"23:00": D}, False))
has("รันนาน → ข้อความบอกเหตุผลเรื่องเที่ยงคืน", sent[0] if sent else "", "เลยเที่ยงคืน")

# ── ข้อ 7: สถานะ "กำลังซิงค์" ระหว่างรอบรันอยู่ ──
seen = {}


def peek_job(args):
    calls.append(list(args))
    if "--stock" in args:
        seen["flag"] = bot._round_running.is_set()
        seen["states"] = bot.round_states(at(10, 2), bot.STATE)
        seen["status"] = bot.rounds_status(at(10, 2), bot.STATE)
        seen["line"] = bot.rounds_line(at(10, 2), bot.STATE)
    return True, "สรุป\n  ✅ ผ่าน"


reset()
bot._run_job = peek_job
bot.run_stock_round(at(10, 0))
check("ระหว่างรัน: ธง 'กำลังซิงค์' ตั้งอยู่", seen.get("flag"), True)
check("ระหว่างรัน: สถานะเป็น 'กำลังซิงค์'", seen.get("states"), [("10:00", "running")])
has("ระหว่างรัน: /rounds บอกว่ากำลังซิงค์", seen.get("status"), "🔄 กำลังซิงค์อยู่ — เสร็จแล้วจะรายงานในห้องนี้")
check("ระหว่างรัน: ไม่บอก 'เริ่มในไม่กี่วินาที' แล้ว", "เริ่มในไม่กี่วินาที" in (seen.get("status") or ""), False)
has("ระหว่างรัน: บรรทัดใน /auto ใช้ไอคอน 🔄", seen.get("line"), "10:00 🔄")
check("รันจบ: ล้างธง", bot._round_running.is_set(), False)
check("รันจบ: สถานะเป็น 'เสร็จ'", bot.round_states(at(10, 5), bot.STATE), [("10:00", "done")])

reset()
real_save = bot.save_state


def broken_save(st=None):
    raise OSError("ดิสก์เต็ม")


bot.save_state = broken_save
try:
    bot.run_stock_round(at(10, 0))
finally:
    bot.save_state = real_save
check("งานบันทึกพังกลางทาง: ล้างธง 'กำลังซิงค์'", bot._round_running.is_set(), False)
check("งานบันทึกพังกลางทาง: ปล่อยล็อก", bot._lock.locked(), False)
has("งานบันทึกพังกลางทาง: รายงานเข้าห้อง", sent[-1] if sent else "", "ดิสก์เต็ม")

# ── ข้อ 1: "ซิงค์ทั้งหมด" ที่ผ่านหลังเวลารอบ นับแทนรอบนั้น ──
reset({"stock_rounds": ["10:00", "15:00"], "stock_round_attempted": {"10:00": D}, "stock_round_tries": 1,
       "stock_round_tries_for": f"{D} 10:00", "stock_round_retry_at": at(11, 20).timestamp(),
       "auto_done_date": "2026-10-16"})
bot.mark_day_done(at(11, 0))
check("ซิงค์ทั้งหมดผ่าน 11:00 → ปิดรอบ 10:00 ที่ถึงเวลาแล้ว", bot.STATE.get("stock_round_done"), {"10:00": D})
check("ซิงค์ทั้งหมดผ่าน → ล้างการรอลองใหม่ของรอบ", [k for k in bot._ROUND_RETRY_KEYS if k in bot.STATE], [])
check("ซิงค์ทั้งหมดผ่าน → รอบ 10:00 ไม่ซิงค์ซ้ำ", bot.stock_rounds_due(at(11, 1), bot.STATE), [])
check("ซิงค์ทั้งหมดผ่าน → รอบ 15:00 ที่ยังไม่ถึงเวลา รันตามเวลาของมัน",
      bot.stock_rounds_due(at(15, 0), bot.STATE), ["15:00"])
check("ซิงค์ทั้งหมดผ่าน → รอบเที่ยงคืนของวันนี้ปิดตามเดิม", bot.STATE.get("auto_done_date"), D)

reset({"stock_round_done": {"10:00": D}, "stock_round_failed": {"10:00": D}})
bot.mark_day_done(at(11, 0))
check("รอบที่ล้มไปแล้ว + ซิงค์ทั้งหมดผ่านทีหลัง → สถานะเป็น 'เสร็จ' ไม่ค้าง ❌",
      bot.round_states(at(11, 0), bot.STATE), [("10:00", "done")])

with frozen(11, 0):
    reset()
    bot.run_sync(1, [], "ซิงค์ทั้งหมด")
check("กดปุ่ม 'ซิงค์ทั้งหมด' 11:00 ผ่าน → ซิงค์จริงชุดเดียว", [("--stock" in c) for c in calls], [False, True])
check("กดปุ่ม 'ซิงค์ทั้งหมด' 11:00 ผ่าน → รอบ 10:00 ไม่ซิงค์ซ้ำ", bot.stock_rounds_due(at(11, 1), bot.STATE), [])

with frozen(9, 0):
    reset()
    bot.run_sync(1, [], "ซิงค์ทั้งหมด")
check("กดปุ่ม 'ซิงค์ทั้งหมด' ก่อนเวลารอบ (09:00) → รอบ 10:00 ยังรันตามเวลา",
      bot.stock_rounds_due(at(10, 0), bot.STATE), ["10:00"])

with frozen(11, 0):
    reset()
    bot.run_sync(1, ["--stock"], "ซิงค์สต็อกหน้าตู้")
check("กดแค่ 'ซิงค์สต็อก' หลังเวลารอบ → ไม่นับแทนรอบ (ไม่ได้ดึงยอดขายก่อน)",
      bot.stock_rounds_due(at(11, 1), bot.STATE), ["10:00"])

with frozen(11, 0):
    reset(results={"sales": True, "stock": False})
    bot.run_sync(1, [], "ซิงค์ทั้งหมด")
check("กด 'ซิงค์ทั้งหมด' แต่ล้ม → ไม่ปิดรอบ", bot.stock_rounds_due(at(11, 1), bot.STATE), ["10:00"])

# ── ตัวจับเวลาทั้งติ๊ก: รอบเที่ยงคืนกับรอบกลางวันถึงคิวพร้อมกัน ──


class StopLoop(Exception):
    pass


def _stop(_seconds):
    raise StopLoop


def tick(h, m, day=17):
    """รันตัวจับเวลาหนึ่งติ๊ก ณ เวลาที่กำหนด → ลำดับงานที่ถูกเรียก ["auto", "round", ...]

    เธรดที่ตัวจับเวลาปล่อยออกไป รันจบในติ๊กเดียวกัน (ลำดับแน่นอน นับการซิงค์ได้ครบ)
    """
    order = []

    class SyncThread:
        def __init__(self, target=None, args=(), kwargs=None, daemon=None):
            self.target, self.args, self.kwargs = target, args, kwargs or {}

        def start(self):
            self.target(*self.args, **self.kwargs)

    names = ("time", "threading", "ideas_due", "autopost_due", "backup_due", "run_auto", "run_stock_round")
    saved = {k: getattr(bot, k) for k in names}
    real_auto, real_round = bot.run_auto, bot.run_stock_round
    try:
        # time.time() ตามนาฬิกาปลอมด้วย — เวลาลองใหม่ของรอบเที่ยงคืน (auto_retry_at) จะได้เทียบกับ "ตอนนี้" ของเทสต์
        bot.time = types.SimpleNamespace(time=lambda: datetime(2026, 10, day, h, m).timestamp(), sleep=_stop)
        bot.threading = types.SimpleNamespace(Thread=SyncThread, Lock=threading.Lock, Event=threading.Event)
        bot.ideas_due = bot.autopost_due = bot.backup_due = lambda now, st: False
        bot.run_auto = lambda: (order.append("auto"), real_auto())
        bot.run_stock_round = lambda now=None: (order.append("round"), real_round(now))
        with frozen(h, m, day):
            try:
                bot.scheduler()
            except StopLoop:
                pass
    finally:
        for k, v in saved.items():
            setattr(bot, k, v)
    return order


# รอบเที่ยงคืนของวันนี้ยังไม่ได้รัน (เครื่องเพิ่งเปิด 10:30)
reset({"auto_sales_through": "2026-10-15", "auto_done_date": "2026-10-16"})
order = tick(10, 30)
check("ติ๊กเดียวกัน: รอบเที่ยงคืนรันก่อน", order[:1], ["auto"])
check("ติ๊กเดียวกัน: แล้วรอบ 10:00 ไม่ซิงค์ซ้ำ — ดึงจริงแค่ยอดขาย 1 ช่วง + สต็อก 1 ครั้ง",
      [" ".join(c) for c in calls], ["--sales --from 2026-10-13 --to 2026-10-17", "--stock"])
check("ติ๊กเดียวกัน: ห้องได้แค่ข้อความของรอบเที่ยงคืน (เริ่ม + เสร็จ)",
      (len(sent), any("ซิงค์รอบ" in s for s in sent)), (2, False))
check("ติ๊กเดียวกัน: รอบ 10:00 ถูกปิดโดยรอบเที่ยงคืน", bot.STATE.get("stock_round_done"), {"10:00": D})

reset({"auto_done_date": D, "auto_sales_through": D})   # คุมผล: รอบเที่ยงคืนจบไปแล้ว ติ๊กนี้ต้องรันรอบ 10:00
order = tick(10, 30)
check("คุมผล: รอบเที่ยงคืนจบแล้ว → ติ๊กนี้รันรอบ 10:00 ตามปกติ (ซิงค์ 1 ชุด)", (order, len(calls)), (["round"], 2))
has("คุมผล: รายงานรอบ 10:00 เข้าห้อง", sent[-1] if sent else "", "ซิงค์รอบ 10:00 เสร็จ")

reset({"auto_sales_through": "2026-10-15", "auto_done_date": "2026-10-16"})   # รอบเที่ยงคืนชดเชย 09:30 ก่อนเวลารอบ
first = tick(9, 30)
n_first = len(calls)
second = tick(10, 0)
check("รอบเที่ยงคืนชดเชยก่อนเวลารอบ → รอบ 10:00 ยังรันตามเวลา", (first, second), (["auto"], ["round"]))
check("รอบเที่ยงคืนชดเชยก่อนเวลารอบ → ซิงค์สองชุด (ชุดละยอดขาย + สต็อก)", (n_first, len(calls)), (2, 4))

# ── /rounds ในห้อง (ผ่าน handle ตัวจริง) ──


def cmd(text, chat=1):
    sent.clear()
    bot.handle({"message": {"chat": {"id": chat, "type": "supergroup"}, "text": text}})
    return sent[-1] if sent else ""


with frozen(12, 0):
    reset({"stock_round_done": {"10:00": D, "12:00": D, "08:00": "2026-10-16"}})
    has("/rounds → สถานะ", cmd("/rounds"), "ซิงค์สต็อกระหว่างวัน")
    has("/rounds ตั้งเวลา → ตอบรับ", cmd("/rounds 15:00 10:00"), "10:00 · 15:00")
    check("/rounds ตั้งเวลา → เก็บเรียงแล้ว", bot.STATE.get("stock_rounds"), ["10:00", "15:00"])
    check("/rounds ตั้งเวลา → เก็บบันทึกของวันนี้ ทิ้งของวันก่อน ๆ",
          bot.STATE.get("stock_round_done"), {"10:00": D, "12:00": D})
    cmd("/rounds off")
    check("/rounds off", bot.STATE.get("stock_rounds_enabled"), False)
    cmd("/rounds เปิด")
    check("/rounds เปิด", bot.STATE.get("stock_rounds_enabled"), True)
    has("/rounds ขยะ → บอกวิธีใช้", cmd("/rounds 10"), "ไม่เข้าใจ")
    check("/rounds ขยะ → ไม่แตะค่าเดิม", bot.STATE.get("stock_rounds"), ["10:00", "15:00"])
    cmd("/rounds@DivisionX_Sync_bot 11:00")
    check("/rounds@ชื่อบอท (กดจากเมนูคำสั่งในกลุ่ม)", bot.STATE.get("stock_rounds"), ["11:00"])
    check("ห้องอื่นสั่ง /rounds → เมินเงียบ",
          (cmd("/rounds off", chat=999), bot.STATE.get("stock_rounds_enabled")), ("", True))
    status = bot.auto_status()
    has("/auto มีบรรทัดรอบระหว่างวัน", status, "ซิงค์สต็อกระหว่างวัน")
    has("/auto บอกวิธีสั่ง /rounds", status, "/rounds")
    check("ข้อความสถานะไม่มี /stock (Telegram ทำเป็นคำสั่งที่กดแล้วสั่งซิงค์)",
          any("/stock" in s for s in (status, bot.rounds_status(at(10, 5), {}), bot.rounds_status(at(15, 0), {}),
                                      bot.rounds_line(at(10, 5), {}), cmd("/rounds off"), cmd("/rounds 10"))),
          False)

# ข้อ 6: ล้างบันทึกตามวันที่ — ถอดรอบที่ทำแล้วออก แล้วใส่กลับวันเดียวกัน ต้องไม่รันซ้ำ
with frozen(12, 0):
    reset({"stock_rounds": ["10:00"], "stock_round_done": {"10:00": D, "08:00": "2026-10-16"},
           "stock_round_failed": {"09:00": "2026-10-15"},
           "stock_round_attempted": {"10:00": D, "07:00": "2026-10-16"}})
    cmd("/rounds 15:00")
    check("ถอด 10:00 ออก → บันทึก 'ทำแล้ววันนี้' ของ 10:00 ยังอยู่", bot.STATE.get("stock_round_done"), {"10:00": D})
    check("ถอด 10:00 ออก → ทิ้งบันทึก 'ล้ม' ของวันก่อน ๆ", bot.STATE.get("stock_round_failed"), {})
    check("ถอด 10:00 ออก → ทิ้งบันทึก 'เคยลอง' ของวันก่อน ๆ", bot.STATE.get("stock_round_attempted"), {"10:00": D})
    cmd("/rounds 10:00,15:00")
    check("ใส่ 10:00 กลับวันเดียวกัน (เที่ยง) → ไม่รันซ้ำ", bot.stock_rounds_due(at(12, 0), bot.STATE), [])
    check("ใส่ 10:00 กลับวันเดียวกัน → สถานะยังเป็น 'เสร็จแล้ว'",
          bot.round_states(at(12, 0), bot.STATE), [("10:00", "done"), ("15:00", "wait")])

# ข้อ 4: เพดานจำนวน/ระยะห่าง/เวลาดึกสุด ผ่านคำสั่งจริง — ไม่ผ่าน = ไม่แตะค่าเดิมเลย
with frozen(12, 0):
    reset({"stock_rounds": ["10:00"]})
    too_close = cmd("/rounds 10:00 10:30")
    has("/rounds ถี่เกิน → บอกเหตุผล", too_close, "ถี่เกินเสี่ยงโดนบล็อก")
    has("/rounds ถี่เกิน → บอกรอบที่ยังใช้อยู่", too_close, "รอบที่ใช้อยู่ตอนนี้: 10:00 น.")
    check("/rounds ถี่เกิน → ไม่แตะค่าเดิม", bot.STATE.get("stock_rounds"), ["10:00"])
    too_many = cmd("/rounds " + " ".join(f"{h:02d}:00" for h in range(8, 15)))
    has("/rounds 7 รอบ → บอกเพดาน", too_many, "ไม่เกิน 6 รอบ")
    check("/rounds 7 รอบ → ไม่แตะค่าเดิม", bot.STATE.get("stock_rounds"), ["10:00"])
    too_late = cmd("/rounds 10:00 23:30")
    has("/rounds 23:30 → บอกเหตุผลเรื่องเที่ยงคืน", too_late, "เที่ยงคืน")
    check("/rounds 23:30 → ไม่แตะค่าเดิม", bot.STATE.get("stock_rounds"), ["10:00"])
    has("/rounds เขียนแบบไทยมีหน่วย → ตั้งได้", cmd("/rounds 10.00 น., 15.00 น."), "10:00 · 15:00")
    check("/rounds เขียนแบบไทยมีหน่วย → เก็บค่าใหม่", bot.STATE.get("stock_rounds"), ["10:00", "15:00"])

# ข้อ 3: /rounds on ตอน /auto off — เซฟค่าไว้ แต่ต้องบอกตามจริงว่ายังไม่วิ่ง
with frozen(9, 0):
    reset({"auto_enabled": False, "stock_rounds_enabled": False})
    r = cmd("/rounds on")
    check("/rounds on ตอน /auto off → ยังเซฟค่าไว้", bot.STATE.get("stock_rounds_enabled"), True)
    has("/rounds on ตอน /auto off → บอกว่าซิงค์อัตโนมัติปิดอยู่", r, "ปิดอยู่ทั้งหมด (/auto off)")
    has("/rounds on ตอน /auto off → บอกว่าจะเริ่มเมื่อ /auto on", r, "/auto on")
    check("/rounds on ตอน /auto off → ไม่ตอบว่า 'เปิดแล้ว' เฉย ๆ", "เปิดซิงค์สต็อกระหว่างวันแล้ว" in r, False)
    check("/rounds on ตอน /auto off → รอบยังไม่วิ่งจริง", bot.stock_rounds_due(at(10, 0), bot.STATE), [])
    auto_off_reply = r
    cmd("/auto on")
    check("/auto on → รอบที่ตั้งเปิดไว้เริ่มวิ่ง", bot.stock_rounds_due(at(10, 0), bot.STATE), ["10:00"])
    reset()
    has("/rounds on ตอน /auto เปิดอยู่ → ตอบว่าเปิดแล้ว", cmd("/rounds on"), "เปิดซิงค์สต็อกระหว่างวันแล้ว")

check("ข้อความใหม่ไม่มี /stock (Telegram ทำเป็นคำสั่งที่กดแล้วสั่งซิงค์)",
      any("/stock" in s for s in (auto_off_reply, too_close, too_many, too_late, seen.get("status") or "")),
      False)

# ════════ รีวิวรอบ 3 ════════
replies = []      # ข้อความที่ส่งเข้าห้องในหัวข้อนี้ — เช็กท้ายหัวข้อว่าไม่มี /stock


@contextlib.contextmanager
def run_takes(minutes):
    """ให้ซิงค์หนึ่งชุดใน run_stock_round ใช้เวลาเท่านี้ — นาฬิกาปลอมเดิน minutes นาทีทุกครั้งที่ถาม
    (ตัวรันถามแค่ตอนเริ่มกับตอนจบ)"""
    clock = {"n": 0}

    def fake_time():
        clock["n"] += 1
        return 1_000_000.0 + (clock["n"] - 1) * minutes * 60

    saved_time = bot.time
    bot.time = types.SimpleNamespace(time=fake_time, sleep=time.sleep)
    try:
        yield
    finally:
        bot.time = saved_time


def retry_keys():
    return [k for k in bot._ROUND_RETRY_KEYS if k in bot.STATE]


# ── ข้อ 1: ซิงค์ของรอบกลางวันเองที่จบหลังเวลารอบถัดไป นับแทนรอบนั้นด้วย ──
reset({"stock_rounds": ["10:00", "11:00"]})
with run_takes(3):
    bot.run_stock_round(at(10, 58))              # เครื่องเปิด 10:58 · ซิงค์ 3 นาที จบ 11:01
msg = sent[0] if sent else ""
replies.append(msg)
check("จบคร่อม 11:00: ซิงค์จริงชุดเดียว (ยอดขาย + สต็อก)", [("--stock" in c) for c in calls], [False, True])
check("จบคร่อม 11:00: ปิดทั้ง 10:00 และ 11:00", bot.STATE.get("stock_round_done"), {"10:00": D, "11:00": D})
has("จบคร่อม 11:00: หัวข้อความยังเป็นรอบที่เริ่มรัน", msg, "ซิงค์รอบ 10:00 เสร็จ")
has("จบคร่อม 11:00: บอกว่านับเป็นรอบ 11:00 ด้วย", msg, "นับเป็นรอบ 11:00 ด้วย")
check("จบคร่อม 11:00: ติ๊กถัดไป (11:01) ไม่ปล่อยรอบซิงค์ซ้ำ", (tick(11, 1), len(calls)), ([], 2))
check("จบคร่อม 11:00: สถานะเสร็จทั้งคู่",
      bot.round_states(at(11, 2), bot.STATE), [("10:00", "done"), ("11:00", "done")])

reset({"stock_rounds": ["10:00", "11:00"], "stock_round_attempted": {"10:00": D}, "stock_round_tries": 1,
       "stock_round_tries_for": f"{D} 10:00", "stock_round_retry_at": at(10, 57).timestamp()})
with run_takes(3):
    bot.run_stock_round(at(10, 58))              # ลองใหม่ 10:58 คร่อม 11:00 แล้วผ่าน
check("ลองใหม่คร่อม 11:00 แล้วผ่าน → ปิดทั้งคู่ ล้างการลองใหม่ ไม่ซิงค์ซ้ำ",
      (bot.STATE.get("stock_round_done"), retry_keys(), bot.stock_rounds_due(at(11, 1), bot.STATE)),
      ({"10:00": D, "11:00": D}, [], []))

reset({"stock_rounds": ["10:00", "11:00"]})
with run_takes(3):
    bot.run_stock_round(at(10, 0))               # จบ 10:03 — ก่อนเวลารอบ 11:00
check("จบก่อนเวลารอบถัดไป → รอบ 11:00 ยังรันตามเวลาของมัน",
      (bot.STATE.get("stock_round_done"), bot.stock_rounds_due(at(11, 0), bot.STATE)), ({"10:00": D}, ["11:00"]))
check("จบก่อนเวลารอบถัดไป → ไม่บอกว่านับแทนรอบอื่น", "นับเป็นรอบ" in (sent[0] if sent else ""), False)

reset({"stock_rounds": ["00:05", "23:00"]})      # 00:05 = ค่าเก่าในไฟล์ state (ตอนนี้ตั้งแบบนี้ไม่ได้แล้ว ดูข้อ 5)
with run_takes(70):
    bot.run_stock_round(at(23, 0))               # จบ 00:10 ของพรุ่งนี้
check("จบข้ามเที่ยงคืน → ปิดแค่รอบที่รัน ไม่ไปปิดรอบของวันใหม่", bot.STATE.get("stock_round_done"), {"23:00": D})

# /rounds ตั้งรอบใหม่ที่เวลาของวันนี้ผ่านไปแล้ว → เริ่มพรุ่งนี้ ไม่รันชดเชยทันทีที่ตั้ง
with frozen(11, 0):
    reset({"stock_round_done": {"10:00": D}})    # รอบ 10:00 ซิงค์ไปแล้ววันนี้
    r = cmd("/rounds 09:00,10:00,15:00")
    replies.append(r)
    has("ตั้งรอบที่เลยเวลาไปแล้ว → ตอบว่าเริ่มพรุ่งนี้", r, "09:00 น. เลยเวลาของวันนี้ไปแล้ว — เริ่มรอบแรกพรุ่งนี้")
    has("ตั้งรอบที่เลยเวลาไปแล้ว → สถานะบอก 'เริ่มพรุ่งนี้' ไม่ใช่ 'ถึงคิว'/'เสร็จแล้ว'", r,
        "• 09:00 น. — ⏭ ตั้งหลังเวลารอบของวันนี้ — เริ่มรอบแรกพรุ่งนี้")
    check("ตั้งรอบที่เลยเวลาไปแล้ว → รอบที่ยังไม่ถึงเวลาไม่โดนบอกว่าเริ่มพรุ่งนี้", "15:00 น. เลยเวลา" in r, False)
    check("ตั้งรอบที่เลยเวลาไปแล้ว → สถานะรายรอบ", bot.round_states(at(11, 0), bot.STATE),
          [("09:00", "later"), ("10:00", "done"), ("15:00", "wait")])
check("ตั้งรอบที่เลยเวลาไปแล้ว → ติ๊กถัดไปไม่ซิงค์", (tick(11, 1), calls), ([], []))
check("ตั้งรอบที่เลยเวลาไปแล้ว → รอบ 15:00 ยังรันตามเวลา", bot.stock_rounds_due(at(15, 0), bot.STATE), ["15:00"])
check("ตั้งรอบที่เลยเวลาไปแล้ว → พรุ่งนี้รันตามปกติ",
      bot.stock_rounds_due(at(9, 0, day=18), {**bot.STATE, "auto_done_date": "2026-10-18"}), ["09:00"])
with frozen(11, 0):
    reset()                                      # 10:00 (ค่าปริยาย) ยังไม่ได้รันวันนี้ — ค้างอยู่
    r = cmd("/rounds 10:00,11:00")
    has("ใส่รอบที่ตรงเวลาตอนนี้พอดี (11:00) → เริ่มพรุ่งนี้", r, "11:00 น. เลยเวลาของวันนี้ไปแล้ว")
    check("รอบเดิมที่ค้างอยู่ (10:00) ไม่โดนปิดไปด้วย ยังรันชดเชยตามเดิม",
          bot.stock_rounds_due(at(11, 0), bot.STATE), ["10:00"])

# ── ข้อ 2: รอบเที่ยงคืนของวันนี้ยังค้าง → รอบกลางวันรอ (รอบนั้นดึงทั้งยอดขายและสต็อก) ──
Y = "2026-10-16"
check("รอบเที่ยงคืนวันนี้ยังไม่ได้รัน (เครื่องเพิ่งเปิด) → รอบกลางวันรอ",
      bot.stock_rounds_due(at(10, 0), {"auto_done_date": Y}), [])
check("ไม่เคยมีรอบเที่ยงคืนเลย (state ว่าง) → รอเหมือนกัน", bot.stock_rounds_due(at(10, 0), {}), [])
check("รอบเที่ยงคืนล้ม รอลองใหม่ → รอบกลางวันรอ",
      bot.stock_rounds_due(at(10, 30), {"auto_done_date": Y, "auto_tries": 1,
                                        "auto_retry_at": at(10, 50).timestamp()}), [])
check("รอบเที่ยงคืนยอมแพ้แล้ว (auto_done_date วันนี้) → รอบกลางวันกลับมาทำงาน",
      bot.stock_rounds_due(at(11, 0), {"auto_done_date": D, "auto_tries": 3}), ["10:00"])
check("รอบเที่ยงคืนตั้งไว้หลังรอบกลางวัน (/auto 12:00) → ยังไม่ถึงเวลา ไม่นับว่าค้าง",
      bot.stock_rounds_due(at(10, 0), {"auto_at": "12:00", "auto_done_date": Y}), ["10:00"])
check("รอบเที่ยงคืน 12:00 ถึงเวลาแล้วยังไม่จบ → รอบกลางวันที่ถึงคิวรอ",
      bot.stock_rounds_due(at(13, 0), {"auto_at": "12:00", "auto_done_date": Y, "stock_rounds": ["10:00", "13:00"]}),
      [])
check("/auto off → ไม่นับว่าค้าง", bot._nightly_pending(at(10, 0), {"auto_enabled": False}), False)
check("สถานะ: รอรอบเที่ยงคืน", bot.round_states(at(10, 5), {"auto_done_date": Y}), [("10:00", "nightly")])
check("สถานะ: ยังไม่ถึงเวลารอบ → 'ยังไม่ถึงเวลา' ไม่ใช่ 'รอรอบเที่ยงคืน'",
      bot.round_states(at(9, 0), {"auto_done_date": Y}), [("10:00", "wait")])
has("/rounds บอกว่ารอซิงค์ประจำวันอยู่ ไม่ใช่ 'เริ่มในไม่กี่วินาที'",
    bot.rounds_status(at(10, 5), {"auto_done_date": Y}), "• 10:00 น. — 🌙 รอซิงค์อัตโนมัติประจำวันที่ยังค้างอยู่ก่อน")
has("บรรทัดใน /auto ใช้ไอคอน 🌙", bot.rounds_line(at(10, 5), {"auto_done_date": Y}), "10:00 🌙")

# ตัวจับเวลาทั้งติ๊ก: เปิดเครื่องตอนเช้าที่หลังบ้านตู้ยังไม่พร้อม (ของจริงที่ตรวจเจอ: ดึงยอดขาย 5 ครั้งใน 63 นาที)
reset({"auto_sales_through": "2026-10-15", "auto_done_date": Y}, results={"sales": False, "stock": True})
order = tick(10, 30)
check("รอบเที่ยงคืนชดเชย 10:30 ล้ม → ติ๊กนั้นไม่ปล่อยรอบ 10:00 ลองซ้ำ (ดึงยอดขายครั้งเดียว)",
      (order, [c[0] for c in calls]), (["auto"], ["--sales"]))
check("รอบเที่ยงคืนชดเชยล้ม → ห้องไม่มีข้อความของรอบกลางวัน", any("ซิงค์รอบ" in s for s in sent), False)
check("รอบเที่ยงคืนรอลองใหม่ → ติ๊กถัดไปก็ไม่ปล่อยรอบกลางวัน", tick(10, 45), [])
check("รอบเที่ยงคืนรอลองใหม่ → สถานะรอบ 10:00 เป็น 'รอรอบเที่ยงคืน'",
      bot.round_states(at(10, 45), bot.STATE), [("10:00", "nightly")])
bot._run_job = fake_job({"sales": True, "stock": True})
calls.clear()
sent.clear()
order = tick(11, 0)
check("รอบเที่ยงคืนลองใหม่ 11:00 ผ่าน → ปิดรอบ 10:00 ให้ ไม่ซิงค์ซ้ำต่อท้าย",
      (order, [c[0] for c in calls], bot.STATE.get("stock_round_done")),
      (["auto"], ["--sales", "--stock"], {"10:00": D}))
check("รอบเที่ยงคืนลองใหม่ผ่าน → ห้องไม่มีข้อความของรอบกลางวัน", any("ซิงค์รอบ" in s for s in sent), False)

reset({"auto_sales_through": "2026-10-15", "auto_done_date": Y}, results={"sales": False, "stock": True})
first = tick(9, 50)                              # รอบเที่ยงคืนชดเชยล้ม นัดลองใหม่ 10:20
second = tick(10, 0)                             # ถึงเวลารอบ 10:00 แต่รอบเที่ยงคืนยังค้าง
bot._run_job = fake_job({"sales": True, "stock": True})
third = tick(10, 20)                             # ลองใหม่ผ่าน
check("เปิดเครื่อง 09:50 รอบเที่ยงคืนล้ม → 10:00 รอ → ลองใหม่ 10:20 ผ่าน: ไม่มีรอบกลางวันซิงค์ซ้ำ",
      (first, second, third, len(calls)), (["auto"], [], ["auto"], 3))
check("... รอบ 10:00 นับเป็นเสร็จ", bot.round_states(at(10, 21), bot.STATE), [("10:00", "done")])

reset({"auto_sales_through": "2026-10-15", "auto_done_date": Y, "auto_tries": 2, "auto_tries_date": D},
      results={"sales": False, "stock": True})
order = tick(11, 0)
check("รอบเที่ยงคืนลองครบ 3 ครั้งยอมแพ้ → รอบกลางวันกลับมาทำงานตามปกติ",
      (order, bot.STATE.get("auto_done_date"), bot.STATE.get("stock_round_tries")), (["auto", "round"], D, 1))

# ── ข้อ 3: ลองใหม่ที่ไม่ได้เกิดตามนัด แล้วเลยกำหนด 4 ชม. = ล้มของวันนี้ ไม่รันย้อนตอนค่ำ ──
reset(results={"sales": False, "stock": True})
bot.run_stock_round(at(10, 0))                   # ล้ม นัดลองใหม่ 10:30 — แล้วบอทดับ/เครื่องหลับไปถึงค่ำ
bot.STATE = json.loads(bot.STATE_FILE.read_text(encoding="utf-8"))    # บอทฟื้น 19:00: โหลด state จากไฟล์
bot._run_job = fake_job({"sales": True, "stock": True})
calls.clear()
sent.clear()
check("บอทฟื้น 19:00 หลังรอบ 10:00 ล้ม → ไม่มีรอบ 10:00 ถึงคิว", bot.stock_rounds_due(at(19, 0), bot.STATE), [])
check("บอทฟื้น 19:00 → สถานะ 'ล้ม' ไม่ใช่ 'ถึงคิว'/'ข้าม'",
      bot.round_states(at(19, 0), bot.STATE), [("10:00", "failed")])
has("บอทฟื้น 19:00 → /rounds โชว์ ❌", bot.rounds_status(at(19, 0), bot.STATE), "• 10:00 น. — ❌ ไม่สำเร็จ")
check("บอทฟื้น 19:00 → ติ๊กแรกไม่ซิงค์ ไม่ส่งข้อความ", (tick(19, 0), calls, sent), ([], [], []))

reset({"stock_rounds": ["10:00", "19:00"]}, results={"sales": False, "stock": True})
bot.run_stock_round(at(10, 0))                   # 10:00 ล้ม นัด 10:30 แล้วบอทดับ
sent.clear()
bot.run_stock_round(at(19, 0))                   # ฟื้น 19:00 ตรงรอบ 19:00 ซึ่งก็ล้มอีก
replies.extend(sent)
has("ฟื้น 19:00 มีรอบ 19:00 → ซิงค์แค่รอบ 19:00 ไม่ลากรอบ 10:00 มาด้วย", sent[0] if sent else "",
    "ซิงค์รอบ 19:00 ไม่สำเร็จ")
check("ฟื้น 19:00 → รอบ 10:00 ถูกปิดเป็น 'ล้ม' จริงใน state",
      (bot.STATE.get("stock_round_done", {}).get("10:00"), bot.STATE.get("stock_round_failed", {}).get("10:00")),
      (D, D))
check("ฟื้น 19:00 → การลองใหม่ของรอบ 19:00 ไม่พารอบ 10:00 กลับมา", bot.stock_rounds_due(at(19, 31), bot.STATE),
      ["19:00"])
check("ฟื้น 19:00 → สถานะระหว่างรอลองใหม่",
      bot.round_states(at(19, 10), bot.STATE), [("10:00", "failed"), ("19:00", "retry")])

for off_cmd, on_cmd, back in (("/rounds off", "/rounds on", 18), ("/auto off", "/auto on", 20)):
    with frozen(10, 0):
        reset(results={"sales": False, "stock": True})
        bot.run_stock_round(at(10, 0))           # ล้ม นัดลองใหม่ 10:30
    with frozen(10, 10):
        cmd(off_cmd)
    with frozen(back, 0):
        r = cmd(on_cmd)
        replies.append(r)
        due_back = bot.stock_rounds_due(at(back, 0), bot.STATE)
        states_back = bot.round_states(at(back, 0), bot.STATE)
    check(f"{off_cmd} ระหว่างรอลองใหม่ แล้ว {on_cmd} ตอน {back}:00 → ไม่รันรอบ 10:00 ตอนค่ำ, สถานะ ❌",
          (due_back, states_back), ([], [("10:00", "failed")]))
has("/rounds on ตอนค่ำหลังพลาดนัด → โชว์ ❌ ไม่ใช่ ▶️", replies[-2], "• 10:00 น. — ❌")

win = ND({"stock_round_attempted": {"10:00": D}, "stock_round_tries": 1, "stock_round_tries_for": f"{D} 10:00",
          "stock_round_retry_at": at(14, 19).timestamp()})
check("เลยกำหนดแล้ว ลองใหม่ยังไม่ถึงนัด → สถานะ 'รอลองใหม่'", bot.round_states(at(14, 10), win), [("10:00", "retry")])
check("ลองใหม่เลยนัดมา 30 นาทีพอดี → ยังลองได้", bot.stock_rounds_due(at(14, 49), win), ["10:00"])
check("ลองใหม่เลยนัดมาเกิน 30 นาที → พลาดนัด ไม่ลองแล้ว", bot.stock_rounds_due(at(14, 50), win), [])
check("ลองใหม่พลาดนัด → สถานะ 'ล้ม'", bot.round_states(at(14, 50), win), [("10:00", "failed")])
check("ลองใหม่พลาดนัด แต่ยังไม่เลยกำหนด 4 ชม. → รันชดเชยได้ตามปกติ",
      bot.stock_rounds_due(at(12, 0), {**win, "stock_round_retry_at": at(10, 30).timestamp()}), ["10:00"])
check("ลองใหม่ที่กำลังรันค้างนาน (เลยนัดเกิน 30 นาที) → ยังโชว์ 'กำลังซิงค์' ไม่ใช่ 'ล้ม'",
      bot.round_states(at(15, 5), win, running=True), [("10:00", "running")])
reset(win)
with run_takes(35):
    bot.run_stock_round(at(14, 19))              # ลองใหม่ตามนัด รันนาน 35 นาทีแล้วผ่าน
check("ลองใหม่ตามนัดที่รันนานแล้วผ่าน → ปิดเป็นเสร็จ ไม่โดนตัดเป็นล้มกลางทาง",
      (bot.STATE.get("stock_round_done"), bot.STATE.get("stock_round_failed")), ({"10:00": D}, None))

# ── ข้อ 4: เวลาลองใหม่ชิดเที่ยงคืนเกินไป (เผื่อ 5 นาที — ติ๊กทุก 30 วิ + รอล็อกว่าง) = ยอมแพ้ ──
for mins, gives_up in ((24, False), (24.99, False), (25, True), (29.75, True)):
    reset({"stock_rounds": ["23:00"]}, results={"sales": False, "stock": True})
    with run_takes(mins):
        bot.run_stock_round(at(23, 0))
    m = sent[0] if sent else ""
    check(f"รอบ 23:00 ล้มหลังรัน {mins} นาที → {'ยอมแพ้' if gives_up else 'ยังนัดลองใหม่'}",
          (bot.STATE.get("stock_round_failed") == {"23:00": D}, "stock_round_retry_at" in bot.STATE,
           "จะลองใหม่ในอีก" in m), (gives_up, not gives_up, not gives_up))
has("ลองใหม่ชิดเที่ยงคืน → ข้อความบอกเหตุผล", m, "ชิดเที่ยงคืน")
replies.append(m)

# ── ข้อ 5: รอบกลางวันห้ามชิดเวลารอบเที่ยงคืน (ทั้ง /rounds และ /auto HH:MM) ──
has("/rounds 00:00 ชิดรอบเที่ยงคืน 00:10 → ไม่รับ", bot.rounds_problem(["00:00"]),
    "00:00 ใกล้เวลาซิงค์อัตโนมัติประจำวัน (00:10 น.) เกินไป (ห่างกันแค่ 10 นาที)")
has("/rounds 00:30 → ไม่รับ", bot.rounds_problem(["00:30"]), "ห่างกันแค่ 20 นาที")
check("/rounds 01:10 (ห่าง 1 ชม. พอดี) → ตั้งได้", bot.rounds_problem(["01:10"]), None)
has("/rounds 01:09 → ไม่รับ", bot.rounds_problem(["01:09"]), "ห่างกันแค่ 59 นาที")
has("/rounds 00:10 ตรงเวลารอบเที่ยงคืน → ไม่รับ", bot.rounds_problem(["00:10"]), "ตรงเวลาเดียวกันเลย")
has("ชิดรอบเที่ยงคืน → บอกเหตุผล", bot.rounds_problem(["10:00", "00:30"]), "ดึงทั้งยอดขายและสต็อกให้อยู่แล้ว")
check("23:00 ห่างจาก 00:10 (นับข้ามเที่ยงคืน) 70 นาที → ตั้งได้", bot.rounds_problem(["23:00"]), None)
has("รอบเที่ยงคืนย้ายไป 23:30 → 23:00 ชิดเกิน", bot.rounds_problem(["10:00", "23:00"], "23:30"),
    "23:00 ใกล้เวลาซิงค์อัตโนมัติประจำวัน (23:30 น.)")
has("รอบเที่ยงคืน 23:50 → รอบ 00:20 ชิดเกิน (นับข้ามเที่ยงคืน = 30 นาที ไม่ใช่ 23 ชม.)",
    bot.rounds_problem(["00:20"], "23:50"), "00:20 ใกล้เวลาซิงค์อัตโนมัติประจำวัน (23:50 น.) เกินไป (ห่างกันแค่ 30 นาที)")
check("รอบเที่ยงคืน 23:50 → รอบ 00:50 ห่าง 1 ชม. พอดี (ข้ามเที่ยงคืน) → ตั้งได้",
      bot.rounds_problem(["00:50"], "23:50"), None)
check("รอบเที่ยงคืน 03:00 → 01:10 ตั้งได้", bot.rounds_problem(["01:10"], "03:00"), None)
has("รอบเที่ยงคืน 03:00 → 02:30 ไม่รับ", bot.rounds_problem(["02:30"], "03:00"), "(03:00 น.)")
check("รอบเที่ยงคืนพังในไฟล์ state → ใช้ค่าปริยาย 00:10", bot.rounds_problem(["00:30"], "xx") is not None, True)
check("ตัวเช็กชนรอบเที่ยงคืน: คืนตัวที่ใกล้สุด",
      bot.nightly_clash("00:10", ["23:30", "00:00", "12:00"]), ("00:00", 10))
check("ตัวเช็กชนรอบเที่ยงคืน: นับข้ามเที่ยงคืน (23:30 กับ 00:10 ห่าง 40 นาที)",
      bot.nightly_clash("00:10", ["23:30", "12:00"]), ("23:30", 40))
check("ตัวเช็กชนรอบเที่ยงคืน: ไม่ชน → None", bot.nightly_clash("00:10", ["01:10", "23:10"]), None)
with frozen(12, 0):
    reset({"stock_rounds": ["10:00"]})
    r = cmd("/rounds 00:00")
    replies.append(r)
    has("คำสั่ง '/rounds 00:00' → ไม่รับ บอกเหตุผล", r, "ยังไม่ได้ตั้งให้ — 00:00 ใกล้เวลาซิงค์อัตโนมัติประจำวัน")
    has("คำสั่ง '/rounds 00:00' → บอกรอบที่ใช้อยู่", r, "รอบที่ใช้อยู่ตอนนี้: 10:00 น.")
    check("คำสั่ง '/rounds 00:00' → ไม่แตะค่าเดิม", bot.STATE.get("stock_rounds"), ["10:00"])
    has("คำสั่ง '/rounds 00:30' → ไม่รับ", cmd("/rounds 00:30"), "ยังไม่ได้ตั้งให้")
    r = cmd("/rounds 01:10")
    replies.append(r)
    has("คำสั่ง '/rounds 01:10' → ตั้งได้", r, "ตั้งรอบซิงค์ระหว่างวันเป็น 01:10 น. แล้ว")
    check("คำสั่ง '/rounds 01:10' → เก็บค่าใหม่", bot.STATE.get("stock_rounds"), ["01:10"])
    reset({"stock_rounds": ["10:00"], "auto_at": "03:00"})
    has("/rounds เทียบกับเวลารอบเที่ยงคืนที่ตั้งไว้จริง (/auto 03:00) → 02:30 ไม่รับ", cmd("/rounds 02:30"),
        "ใกล้เวลาซิงค์อัตโนมัติประจำวัน (03:00 น.)")
    has("/rounds บอกกติกาห่างจากเวลารอบเที่ยงคืนที่ตั้งไว้", bot.rounds_status(), "ห่างจากเวลาซิงค์อัตโนมัติ (03:00 น.)")
    reset({"stock_rounds": ["10:00"]})
    r = cmd("/auto 09:30")
    replies.append(r)
    has("'/auto 09:30' ชนรอบ 10:00 → ไม่รับ บอกเหตุผล", r,
        "ยังไม่ได้เปลี่ยนเวลา — 09:30 ใกล้รอบซิงค์สต็อกระหว่างวัน 10:00 น. เกินไป (ห่างกันแค่ 30 นาที)")
    has("'/auto 09:30' → บอกเวลาที่ใช้อยู่ + ทางออก", r, "เวลาที่ใช้อยู่ตอนนี้: 00:10 น. · ถ้าจะใช้เวลานี้จริง")
    check("'/auto 09:30' → ไม่แตะค่าเดิม", bot.STATE.get("auto_at"), None)
    has("'/auto 09:00' (ห่าง 1 ชม. พอดี) → เปลี่ยนได้", cmd("/auto 09:00"), "เปลี่ยนเวลาเป็น 09:00 น. แล้ว")
    check("'/auto 09:00' → เก็บค่าใหม่", bot.STATE.get("auto_at"), "09:00")
    reset({"stock_rounds": ["10:00"], "stock_rounds_enabled": False})
    has("/auto ชนรอบที่ตั้งไว้แม้ปิดรอบกลางวันอยู่ → ไม่รับ", cmd("/auto 10:30"), "ยังไม่ได้เปลี่ยนเวลา")
    has("'/auto 00:30' (ไม่ชนรอบไหน) → เปลี่ยนได้", cmd("/auto 00:30"), "เปลี่ยนเวลาเป็น 00:30 น. แล้ว")

# ── ข้อ 6: ตัวนับการลองในไฟล์ state พัง (แก้มือ) ต้องไม่ทำให้ลองไม่รู้จบ ──
for bad in (None, -5, 1.5, [1], "1"):
    reset({"stock_round_tries": bad, "stock_round_tries_for": f"{D} 10:00"}, results={"sales": False, "stock": True})
    bot.run_stock_round(at(10, 0))
    check(f"ตัวนับพัง {bad!r} → นับเป็นครั้งที่ 1 ไม่ล้มกลางทาง",
          (bot.STATE.get("stock_round_tries"), "(ครั้งที่ 1/2)" in (sent[0] if sent else "")), (1, True))
bot.run_stock_round(at(10, 31))
check("ตัวนับพัง → ครั้งต่อไปนับต่อจนยอมแพ้ตามปกติ", bot.STATE.get("stock_round_failed"), {"10:00": D})

check("ข้อความของรีวิวรอบ 3 ไม่มี /stock (Telegram ทำเป็นคำสั่งที่กดแล้วสั่งซิงค์)",
      [s[:60] for s in replies if "/stock" in s], [])

# ── ตัวจับเวลา: ถึงคิวแล้วต้องปล่อยตัวรันในเธรดแยก ──
ran = threading.Event()
saved = {k: getattr(bot, k) for k in ("time", "auto_due", "ideas_due", "autopost_due", "backup_due",
                                       "stock_rounds_due", "run_stock_round")}
try:
    bot.time = types.SimpleNamespace(time=time.time, sleep=_stop)   # ติ๊กเดียวแล้วออกจากลูป
    bot.auto_due = bot.ideas_due = bot.autopost_due = bot.backup_due = lambda now, st: False
    bot.stock_rounds_due = lambda now, st: ["10:00"]
    bot.run_stock_round = lambda now=None: ran.set()
    try:
        bot.scheduler()
    except StopLoop:
        pass
    check("ตัวจับเวลา: ถึงคิว → ปล่อย run_stock_round ในเธรดแยก", ran.wait(5), True)
finally:
    for k, v in saved.items():
        setattr(bot, k, v)

check("ไม่ยิง Telegram API ตรง ๆ เลยทั้งไฟล์", net, [])
check("ล็อกซิงค์ว่างตอนจบ", bot._lock.locked(), False)

_tmp.cleanup()
print(f"\n{'ผ่านครบ' if not fails else f'ไม่ผ่าน {fails} ข้อ'}")
sys.exit(1 if fails else 0)
