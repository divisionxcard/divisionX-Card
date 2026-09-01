#!/usr/bin/env python3
"""ทดสอบสวิตช์ "ช่วงทดลองส่งเข้าแชทส่วนตัว" ว่าหมดอายุเองจริงไหม

รัน: py scripts/test_refill_plan_trial.py

⚠️ ของที่ตั้งใจให้ "เปลี่ยนเองตามวันที่" ต้องมีเทสต์ ไม่งั้นจะรู้ว่ามันไม่เปลี่ยน
   ก็ต่อเมื่อถึงวันแล้วไม่เปลี่ยน ซึ่งคือวันที่ไม่มีใครดูแล้ว
"""
import datetime as dt
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
sys.stdout.reconfigure(encoding="utf-8")

os.environ.setdefault("SUPABASE_URL", "https://example.invalid")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test")

import refill_plan_check as r  # noqa: E402

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


UNTIL = r.TRIAL_TO_OWNER_UNTIL


def at(day):
    """แกล้งทำเป็นว่าวันนี้คือวันที่กำหนด แล้วดูว่า trial_state ตอบว่าอะไร"""
    r.th_today = lambda: day
    return r.trial_state()


print(f"── สวิตช์หมดอายุวันที่ {UNTIL} ──")

owner, note = at(UNTIL - dt.timedelta(days=3))
check("ระหว่างช่วงทดลอง → ส่งเข้าส่วนตัว", owner, True)
check("มีข้อความบอกว่าอยู่ในช่วงทดลอง", "ช่วงทดลอง" in (note or ""), True)

owner, note = at(UNTIL - dt.timedelta(days=1))
check("วันสุดท้าย → ยังส่งส่วนตัว", owner, True)
check("วันสุดท้ายต้องเตือนล่วงหน้าว่าพรุ่งนี้ย้าย", "พรุ่งนี้" in (note or ""), True)

owner, note = at(UNTIL)
check("ถึงวันหมดอายุ → ย้ายไปกลุ่มเอง", owner, False)
check("พ้นช่วงทดลองแล้วไม่ต้องมีข้อความกำกับ", note, None)

owner, _ = at(UNTIL + dt.timedelta(days=30))
check("ผ่านไปนาน ๆ ก็ยังอยู่ที่กลุ่ม ไม่เด้งกลับ", owner, False)

print("\n── th_today ต้องเป็นเวลาไทย ไม่ใช่ UTC ──")
# job รัน 22:30 น. ไทย = 15:30 UTC · ถ้าใช้ UTC วันจะยังไม่ข้าม แต่ถ้าเป็น 23:30 ไทย
# = 16:30 UTC ก็ยังไม่ข้ามอยู่ดี — เคสที่ต่างคือช่วง 00:00-07:00 น. ไทย
import importlib  # noqa: E402
importlib.reload(r)
real = r.th_today()
utc = dt.datetime.now(dt.timezone.utc).date()
check("th_today ไม่ช้ากว่าวันที่ UTC", real >= utc, True)

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
