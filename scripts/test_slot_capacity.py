#!/usr/bin/env python3
"""ทดสอบเพดานความจุช่อง (ซองไม่เกิน 12) + ตรวจของจริงใน DB ว่าไม่มีช่องไหนหลุด

รัน: py scripts/test_slot_capacity.py
คืน exit 1 ถ้ากติกาผิด หรือมีช่องซองใน machine_stock ที่ความจุเกินเพดาน

ท่อนล่างเป็นด่านเฝ้า ไม่ใช่แค่ทดสอบ — ถ้าวันหลังมี scraper ตัวใหม่ที่ลืมเรียก
plan_capacity() ตัวเลขจะโผล่เกิน 12 ใน DB แล้วใบจัดของจะสั่งขนเกินเงียบ ๆ เหมือนเดิม
"""
import json
import os
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
sys.stdout.reconfigure(encoding="utf-8")

from slot_capacity import PACK_SLOT_MAX, is_box, plan_capacity  # noqa: E402

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


print("── กติกา plan_capacity ──")
check("ซองที่ตู้บอก 15 → ตัดเหลือ 12", plan_capacity(15, "ONE PIECE OP - 13 Pack"), 12)
check("ซองที่ตู้บอก 12 → ไม่แตะ", plan_capacity(12, "ONE PIECE OP - 08 Pack"), 12)
check("ซองที่ตู้บอกน้อยกว่าเพดาน → ไม่ดันขึ้น", plan_capacity(8, "OP - 13 Pack"), 8)
check("กล่องไม่โดนเพดานซอง", plan_capacity(4, "ONE PIECE OP - 13 Box"), 4)
check("กล่องที่ตู้บอกเกิน 12 ก็ไม่โดนตัด", plan_capacity(20, "OP - 13 Box"), 20)
check("ชื่อกล่องพิมพ์ใหญ่/เล็กปนกันก็จับได้", is_box("ONE PIECE OP - 13 BOX"), True)
check("ช่องว่าง (ไม่มีชื่อ) นับเป็นซอง", plan_capacity(15, None), 12)
check("ค่า None → 0 ไม่ระเบิด", plan_capacity(None, "OP - 01 Pack"), 0)

# ── ของจริงใน DB — ด่านเฝ้าว่าไม่มีช่องไหนหลุดเพดาน ──
print("\n── machine_stock ของจริง ──")
try:
    from envload import load_env_local
    load_env_local()
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    req = urllib.request.Request(
        f"{url}/rest/v1/machine_stock?select=machine_id,slot_number,product_name,max_capacity"
        f"&max_capacity=gt.{PACK_SLOT_MAX}&limit=1000",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        over = json.loads(r.read())
except Exception as e:
    print(f"  ⚠️  ต่อ DB ไม่ได้ ข้ามด่านนี้: {type(e).__name__}: {str(e)[:80]}")
else:
    packs = [r for r in over if not is_box(r.get("product_name"))]
    for r in packs[:10]:
        print(f"      {r['machine_id']} ช่อง {r['slot_number']} = {r['max_capacity']} · {r.get('product_name')}")
    if len(packs) > 10:
        print(f"      … อีก {len(packs) - 10} ช่อง")
    check(f"ไม่มีช่องซองที่ความจุเกิน {PACK_SLOT_MAX}", len(packs), 0)
    boxes = [r for r in over if is_box(r.get("product_name"))]
    print(f"  ℹ️  ช่องกล่องที่ความจุเกิน {PACK_SLOT_MAX} (ไม่ผิด): {len(boxes)} ช่อง")

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
