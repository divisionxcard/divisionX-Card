#!/usr/bin/env python3
"""ทดสอบตัวจำ "ช่องนี้ว่างมาตั้งแต่เมื่อไหร่" (slot_empty.mark_empty_since)

รัน: py scripts/test_slot_empty.py
คืน exit 1 ถ้าตรรกะจำวันผิด

⚠️ จุดที่พังง่ายที่สุดคือ "ว่างต่อเนื่อง" — ถ้าเผลอเขียนทับด้วยเวลารอบล่าสุดทุกครั้ง
   ทุกช่องจะกลายเป็นเพิ่งว่างวันนี้ตลอดกาล แล้วธงจะไม่มีวันติด ซึ่งจะไม่มี error ใด ๆ
   ให้เห็นเลย — ต้องมีเคสนี้คุมไว้
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
sys.stdout.reconfigure(encoding="utf-8")

from slot_empty import mark_empty_since  # noqa: E402

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


OLD = "2026-08-23T10:00:00"
NOW = "2026-08-31T10:00:00"


def rec(slot, remain):
    return {"machine_id": "wwv07", "slot_number": slot, "remain": remain}


def prev(slot, remain, empty_since):
    return {"machine_id": "wwv07", "slot_number": slot, "remain": remain, "empty_since": empty_since}


print("── กติกาการจำวัน ──")

r = [rec("068", 0)]
mark_empty_since(r, [prev("068", 0, OLD)], NOW)
check("ว่างต่อเนื่อง → คงวันเดิมไว้ (ห้ามรีเซ็ต)", r[0]["empty_since"], OLD)

r = [rec("068", 0)]
mark_empty_since(r, [prev("068", 5, None)], NOW)
check("เพิ่งหมดรอบนี้ → ลงวันนี้", r[0]["empty_since"], NOW)

r = [rec("068", 12)]
mark_empty_since(r, [prev("068", 0, OLD)], NOW)
check("เติมแล้ว → ล้างเป็นว่าง", r[0]["empty_since"], None)

r = [rec("999", 0)]
mark_empty_since(r, [], NOW)
check("ช่องใหม่ที่ไม่เคยเห็น → ลงวันนี้", r[0]["empty_since"], NOW)

r = [rec("068", 0)]
mark_empty_since(r, [prev("068", 0, None)], NOW)
check("รอบก่อนว่างแต่ไม่มีวันบันทึกไว้ → ลงวันนี้", r[0]["empty_since"], NOW)

r = [rec("068", 0), rec("069", 0), rec("070", 4)]
n = mark_empty_since(r, [prev("068", 0, OLD), prev("069", 3, None), prev("070", 0, OLD)], NOW)
check("นับเฉพาะช่องที่ว่างค้างจากรอบก่อน", n, 1)
check("แต่ละช่องได้ค่าของตัวเอง",
      [x["empty_since"] for x in r], [OLD, NOW, None])

# เลขช่องมาเป็น int บ้าง str บ้างแล้วแต่แบรนด์ — ต้องจับคู่กันได้
r = [{"machine_id": "chukes01", "slot_number": 24, "remain": 0}]
mark_empty_since(r, [{"machine_id": "chukes01", "slot_number": "24", "remain": 0, "empty_since": OLD}], NOW)
check("เลขช่องคนละชนิด (24 กับ '24') ต้องจับคู่ได้", r[0]["empty_since"], OLD)

r = [rec("068", None)]
mark_empty_since(r, [prev("068", 0, OLD)], NOW)
check("remain เป็น None ถือว่าว่าง ไม่ระเบิด", r[0]["empty_since"], OLD)

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
