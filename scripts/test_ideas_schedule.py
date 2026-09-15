"""ทดสอบตัวจับเวลาเก็บไอเดียในบอทซิงค์ — ฟังก์ชันล้วน ไม่ยิงเน็ต ไม่แตะ DB

รัน:  .venv-image\\Scripts\\python.exe scripts\\test_ideas_schedule.py
"""
import importlib.util
import pathlib
import sys
from datetime import datetime

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

spec = importlib.util.spec_from_file_location(
    "bot", pathlib.Path(__file__).with_name("telegram_sync_bot.py"))
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)   # ต้องมี SYNC_BOT_TOKEN ใน deploy/.env.local (ตัวบอทเช็คตอนโหลด)

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — ได้ {got!r} ต้องการ {want!r}"))


morning = datetime(2026, 9, 15, 6, 59)
after = datetime(2026, 9, 15, 7, 0)
night = datetime(2026, 9, 15, 20, 33)

check("ก่อน 07:00 ยังไม่ถึงเวลา", bot.ideas_due(morning, {}), False)
check("07:00 พอดี ถึงเวลา", bot.ideas_due(after, {}), True)
check("เปิดเครื่องสาย 20:33 ยังไม่ได้เก็บ → เก็บชดเชย", bot.ideas_due(night, {}), True)
check("วันนี้เก็บแล้ว → ไม่เก็บซ้ำ", bot.ideas_due(night, {"ideas_done_date": "2026-09-15"}), False)
check("เก็บล่าสุดเมื่อวาน → วันนี้ต้องเก็บ", bot.ideas_due(night, {"ideas_done_date": "2026-09-14"}), True)
check("ปิดไว้ → ไม่เก็บ", bot.ideas_due(night, {"ideas_enabled": False}), False)
check("ยังไม่ถึงเวลาลองใหม่ → รอ",
      bot.ideas_due(night, {"ideas_retry_at": night.timestamp() + 600}), False)
check("เลยเวลาลองใหม่แล้ว → ลอง",
      bot.ideas_due(night, {"ideas_retry_at": night.timestamp() - 1}), True)
check("สถานะซิงค์ไม่ปนกับไอเดีย (auto_done_date วันนี้)",
      bot.ideas_due(night, {"auto_done_date": "2026-09-15"}), True)

col = """[purge] 🧹 ลบแล้ว 21 ไอเดีย
[ideas] คำสำคัญจากสินค้าที่ขายจริง 58 คำ
[ideas] ข่าว: 12
  ⚠️  สัญญาณภายในล้ม: HTTPError: 500
[ideas] เก็บได้ 19 · มีอยู่แล้ว 7 · ใหม่ 12
    4.20 [news    ] หัวข่าวยาว ๆ ที่ไม่ควรขึ้นในห้องแชต

[ideas] ✅ บันทึก 12 ไอเดีย"""
ang = """[angles] จะเติมมุมให้ 12 ไอเดีย · เริ่มที่ gemini-flash-latest
  ✓ #500 หัวข่าว  [gemini-flash-latest]
      · มุมหนึ่ง — รายละเอียด
[angles] สำเร็จ 11 · ล้มเหลว 1"""
check("สรุปเก็บเฉพาะบรรทัดป้าย + คำเตือน",
      bot.ideas_summary(col, ang).splitlines(),
      ["[purge] 🧹 ลบแล้ว 21 ไอเดีย",
       "[ideas] คำสำคัญจากสินค้าที่ขายจริง 58 คำ",
       "[ideas] ข่าว: 12",
       "⚠️  สัญญาณภายในล้ม: HTTPError: 500",
       "[ideas] เก็บได้ 19 · มีอยู่แล้ว 7 · ใหม่ 12",
       "[ideas] ✅ บันทึก 12 ไอเดีย",
       "[angles] จะเติมมุมให้ 12 ไอเดีย · เริ่มที่ gemini-flash-latest",
       "[angles] สำเร็จ 11 · ล้มเหลว 1"])
check("ไม่มีขั้นคิดมุม ก็สรุปได้", bot.ideas_summary("[ideas] ไม่มีไอเดียใหม่", ""), "[ideas] ไม่มีไอเดียใหม่")

print(f"\n{'ผ่านครบ' if not fails else f'ไม่ผ่าน {fails} ข้อ'}")
sys.exit(1 if fails else 0)
