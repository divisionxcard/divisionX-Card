#!/usr/bin/env python3
"""ทดสอบข้อความสรุป "ใบจัดของ vs ของที่เติมเข้าจริง" (telegram_alert.refill_plan_text)

รัน: py scripts/test_refill_plan_check.py

⚠️ ตัวเลขในข้อความนี้จะถูกเอาไปใช้ตัดสินว่า "วันนั้นจัดของเกินไหม" —
   ถ้าเรียงผิดหรือหน่วยผิด คนอ่านจะเข้าใจผิดเรื่องคน ไม่ใช่แค่เรื่องเลข
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
sys.stdout.reconfigure(encoding="utf-8")

from telegram_alert import refill_plan_text  # noqa: E402

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


def plan(machine, sku, qty, is_box=False):
    return {"machine_id": machine, "sku_id": sku, "planned_qty": qty, "is_box": is_box,
            "product_name": sku}


OVER = [
    (plan("wwv07", "TF Overdrive 01", 24), 0),      # สั่ง 24 ใส่ไม่ได้เลย
    (plan("wwv01", "OP 14", 12), 5),
    (plan("wwv05", "OP 11", 4, is_box=True), 1),
]
UNDER = [(plan("wwv03", "OP 17", 10), 25)]

txt = refill_plan_text(OVER, UNDER)
plain = re.sub(r"<[^>]+>", "", txt)
print("── ตัวอย่างข้อความ ──")
for ln in plain.strip().splitlines():
    print(f"      {ln}")
print()

print("── ตรวจเนื้อหา ──")
check("บอกยอดเกินรวม (24-0 + 12-5 + 4-1 = 34)", "ขนไปเกิน 34 หน่วย" in plain, True)
check("บอกยอดขาดรวม (25-10 = 15)", "ขนไปไม่พอ 15 หน่วย" in plain, True)
check("เรียงตัวที่เกินมากสุดขึ้นก่อน",
      plain.index("TF Overdrive 01") < plain.index("OP 14"), True)
check("หน่วยกล่องไม่ถูกเรียกเป็นซอง", "OP 11 · สั่ง 4 กล่อง · เข้าจริง 1 กล่อง" in plain, True)
check("บอกข้อจำกัดของตัวเลขไว้ด้วย", "เพี้ยนได้" in plain, True)
check("ไม่มีอะไรเกิน/ขาด → ไม่ต้องมีหัวข้อ", "ขนไปเกิน" in refill_plan_text([], UNDER), False)

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
