"""ทดสอบงานสำรองข้อมูล + โพสต์อัตโนมัติในบอทซิงค์ — ฟังก์ชันล้วน ไม่ยิงเน็ต ไม่แตะ DB

รัน:  .venv-image\\Scripts\\python.exe scripts\\test_bot_jobs.py
"""
import importlib.util
import pathlib
import sys
import tempfile
import time
from datetime import datetime

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

spec = importlib.util.spec_from_file_location(
    "bot", pathlib.Path(__file__).with_name("telegram_sync_bot.py"))
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)

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


now = datetime(2026, 9, 16, 9, 0)
NOW = now.timestamp()

# ── โพสต์อัตโนมัติ: ตัวจับเวลา ──
check("ยังไม่เคยเคาะ → เคาะเลย", bot.autopost_due(now, {}), True)
check("เพิ่งเคาะไป 5 นาที → ยังไม่ถึงรอบ", bot.autopost_due(now, {"autopost_last": NOW - 5 * 60}), False)
check("เคาะไป 16 นาที → ถึงรอบ", bot.autopost_due(now, {"autopost_last": NOW - 16 * 60}), True)
check("ปิดไว้ → ไม่เคาะ", bot.autopost_due(now, {"autopost_enabled": False}), False)

# ── โพสต์อัตโนมัติ: จะบอกอะไรในห้อง ──
check("503 (ยังไม่เปิดใช้) → เงียบ", bot.autopost_report(503, {}), None)
check("200 ไม่มีของถึงคิว → เงียบ",
      bot.autopost_report(200, {"due": 0, "posted": 0, "failed": 0, "results": []}), None)
has("200 โพสต์ได้ → บอกจำนวน+ลิงก์",
    bot.autopost_report(200, {"posted": 1, "failed": 0,
                              "results": [{"id": 46, "ok": True, "post_url": "https://fb.com/1"}]}),
    "#46 https://fb.com/1")
has("200 ล้ม → บอกเหตุผล",
    bot.autopost_report(200, {"posted": 0, "failed": 1,
                              "results": [{"id": 47, "ok": False, "error": "token expired"}]}),
    "token expired")
has("ขึ้นเพจแล้วบันทึกไม่ได้ → เตือนห้ามยิงซ้ำ",
    bot.autopost_report(200, {"posted": 0, "failed": 1,
                              "results": [{"id": 48, "ok": False, "needsManualFix": True}]}),
    "อย่าสั่งโพสต์ซ้ำ")
has("401 → บอกรหัสสถานะ", bot.autopost_report(401, {}), "HTTP 401")

# ── สำรองข้อมูล: ตัวจับเวลา ──
early = datetime(2026, 9, 16, 0, 10)
check("ก่อนเวลาที่ตั้งไว้ → ยังไม่ทำ", bot.backup_due(early, {}), False)
check("ยังไม่เคยสำรอง → ทำเลย", bot.backup_due(now, {}), True)
check("สำรองวันนี้แล้ว → ไม่ทำซ้ำ", bot.backup_due(now, {"backup_done_date": "2026-09-16"}), False)
check("ครบ 7 วัน → ทำ", bot.backup_due(now, {"backup_done_date": "2026-09-09"}), True)
check("เพิ่ง 6 วัน → ยังไม่ทำ", bot.backup_due(now, {"backup_done_date": "2026-09-10"}), False)
check("ปิดไว้ → ไม่ทำ", bot.backup_due(now, {"backup_enabled": False}), False)
check("ค่าวันที่ในไฟล์ state พัง → ทำใหม่ ไม่ใช่เงียบไปตลอด",
      bot.backup_due(now, {"backup_done_date": "เมื่อวาน"}), True)

# ── สำรองข้อมูล: ลบชุดเก่า ──
with tempfile.TemporaryDirectory() as tmp:
    bot.BACKUP_DIR = pathlib.Path(tmp)
    for n in range(10):
        d = bot.BACKUP_DIR / f"2026-09-{n + 1:02d}T00-30-00"
        d.mkdir()
        (d / "sales.json").write_text("[]", encoding="utf-8")
    removed = bot.prune_backups(keep=8)
    check("เก็บ 8 ชุดล่าสุด → ลบ 2 ชุดเก่าสุด", removed,
          ["2026-09-01T00-30-00", "2026-09-02T00-30-00"])
    check("เหลือจริง 8 ชุด", len(list(bot.BACKUP_DIR.iterdir())), 8)
    check("ไม่ลบอะไรถ้ายังไม่เกินโควตา", bot.prune_backups(keep=8), [])

# ── ปุ่มจากแผง inline (ห้องมีหลายคน ต้องรู้ว่าใครกด) ──
check("ปุ่มซิงค์สต็อก → args ถูก", bot.CALLBACK_JOBS["stock"], (["--stock"], "ซิงค์สต็อกหน้าตู้"))
check("ปุ่มซิงค์ทั้งหมด → ไม่มี args", bot.CALLBACK_JOBS["sync"], ([], "ซิงค์ทั้งหมด"))
check("ชื่อคนกด: ชื่อ + นามสกุล", bot.who({"first_name": "สมชาย", "last_name": "ใจดี"}), "สมชาย ใจดี")
check("ชื่อคนกด: มีแต่ชื่อต้น", bot.who({"first_name": "แอดมิน"}), "แอดมิน")
check("ชื่อคนกด: มีแต่ username", bot.who({"username": "dvxadmin"}), "@dvxadmin")
check("ชื่อคนกด: เหลือแต่ id", bot.who({"id": 42}), "id 42")
check("ชื่อคนกด: ไม่มีข้อมูลเลย", bot.who(None), "id ?")

print(f"\n{'ผ่านครบ' if not fails else f'ไม่ผ่าน {fails} ข้อ'}")
sys.exit(1 if fails else 0)
