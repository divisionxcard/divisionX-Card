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

from slot_capacity import PACK_SLOT_MAX, find_overfilled, is_box, plan_capacity  # noqa: E402
from telegram_alert import overfilled_text  # noqa: E402

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

print("\n── ตรวจจับของจริงหน้าตู้เกินเพดาน (เตือนเข้า Telegram) ──")
SLOTS = [
    {"slot_number": "011", "product_name": "ONE PIECE OP - 01 Pack", "sku_id": "OP 01",
     "remain": 15, "reported_capacity": 15},
    {"slot_number": "012", "product_name": "ONE PIECE OP - 02 Pack", "sku_id": "OP 02",
     "remain": 12, "reported_capacity": 15},
    {"slot_number": "013", "product_name": "ONE PIECE OP - 03 Pack", "sku_id": "OP 03",
     "remain": 13, "reported_capacity": 15},
    {"slot_number": "051", "product_name": "ONE PIECE OP - 11 Box", "sku_id": "OP 11",
     "remain": 20, "reported_capacity": 20},
    {"slot_number": "099", "product_name": None, "sku_id": None,
     "remain": 0, "reported_capacity": 15},
]
over = find_overfilled(SLOTS)
check("จับเฉพาะช่องที่เกินจริง", [o["slot_number"] for o in over], ["011", "013"])
check("บอกว่าเกินไปเท่าไหร่", [o["over"] for o in over], [3, 1])
check("ช่องที่เต็มพอดี 12 ไม่นับว่าเกิน", any(o["slot_number"] == "012" for o in over), False)
check("กล่องมี 20 ก็ไม่ถือว่าเกิน (คนละหน่วย)", any(o["slot_number"] == "051" for o in over), False)
check("ติดความจุที่ตู้รายงานมาด้วย", over[0]["reported_capacity"], 15)
check("ไม่มีอะไรเกิน → ไม่ต้องเตือน", find_overfilled([SLOTS[1], SLOTS[3]]), [])

msg = overfilled_text("pf01", "ตู้ที่ 12 (pf01) · ไอคอนสยาม (Payif)", over, PACK_SLOT_MAX, "2026-08-31T00:20")
check("ข้อความมีชื่อตู้", "ไอคอนสยาม" in msg, True)
check("ข้อความบอกช่องกับจำนวนจริง", "มีจริง <b>15</b>" in msg, True)
check("ข้อความบอกผลกระทบ ไม่ใช่แค่แจ้งเลข", "ใบจัดของ" in msg, True)
print("      ── ตัวอย่างข้อความที่จะส่ง ──")
import re as _re  # noqa: E402
for ln in _re.sub(r"<[^>]+>", "", msg).strip().splitlines():
    print(f"      {ln}")

# ── เส้นทางจริง: payif_stock_sync เรียกตัวเตือนเองไหม ────────────────────
# ⚠️ ปลอมแค่ชั้น api_get (ตัวคุยกับ Vendos) — fetch_slots ตัวจริงจึงได้ทำงานทั้งเส้น
#    รวมทั้ง plan_capacity() ที่ตัดความจุ · ถ้าปลอม fetch_slots ทิ้งจะไม่ได้พิสูจน์อะไรเลย
#    (บทเรียน 28 ส.ค.: ทดสอบไลบรารีผ่าน 34/34 แต่ route เรียกไม่ได้เพราะลืม import)
print("\n── เส้นทางจริง: payif_stock_sync ยิงเตือนเองไหม ──")
STOCK = [
    {"slot": "011", "qty": 15, "capacity": 15, "warn_threshold": 3},   # เกินเพดาน
    {"slot": "012", "qty": 12, "capacity": 15, "warn_threshold": 3},   # เต็มพอดี
    {"slot": "051", "qty": 20, "capacity": 20, "warn_threshold": 1},   # กล่อง ไม่นับ
]
NAMES = {
    "011": {"product_name": "ONE PIECE OP - 01 Pack"},
    "012": {"product_name": "ONE PIECE OP - 02 Pack"},
    "051": {"product_name": "ONE PIECE OP - 11 Box"},
}

import payif_stock_sync as ps          # noqa: E402
import slot_tracking                   # noqa: E402
import stock_reconcile                 # noqa: E402
import telegram_alert                  # noqa: E402

sent, saved = [], []
# กันแตะ DB จริงทุกทาง — create_client คืนวัตถุเปล่า และตัวที่เขียน DB ถูกถอดออกหมด
ps.create_client = lambda *a, **k: object()
ps.login = lambda: None
ps.fetch_payif_machines = lambda sb: [{"machine_id": "pf01", "name": "ตู้ทดสอบ", "shop_id": "1"}]
ps.api_get = lambda s, path: (STOCK if "/stock/" in path else NAMES)
ps.null_unknown_skus = lambda sb, recs: None
ps.save_to_supabase = lambda sb, recs: saved.extend(recs)
slot_tracking.track_refill_events = lambda *a, **k: None
stock_reconcile.reconcile_from_records = lambda *a, **k: None
telegram_alert.alert_slot_overfilled = lambda *a, **k: sent.append(a)

_argv = sys.argv
sys.argv = ["payif_stock_sync.py"]
try:
    ps.main()
finally:
    sys.argv = _argv

check("sync เรียกตัวเตือนเองจริง (ไม่ต้องมีใครไปกดอะไร)", len(sent), 1)
if sent:
    check("เตือนเฉพาะช่องที่ของจริงเกิน", [o["slot_number"] for o in sent[0][2]], ["011"])
    check("บอกเพดานที่ใช้ตัดสินไปด้วย", sent[0][3], PACK_SLOT_MAX)
rec011 = next((r for r in saved if r["slot_number"] == "011"), None)
check("แถวที่เขียนลง DB ใช้ความจุที่ตัดแล้ว", rec011 and rec011["max_capacity"], 12)
check("แต่ remain ยังเป็นของจริงที่ตู้รายงาน", rec011 and rec011["remain"], 15)
check("ความจุดิบไม่หลุดลง DB", "reported_capacity" in (rec011 or {}), False)

# ── ของจริงใน DB — ด่านเฝ้าเฉพาะตู้ Payif ──
# ⚠️ ตู้ยี่ห้ออื่นไม่อยู่ใต้เพดานนี้ (คนละแบบตู้) — ถ้าเจอเกิน 12 ให้ "รายงาน" ไม่ใช่ "ฟ้อง"
#    ด่านที่ฟ้องผิดตู้จะทำให้คนเลิกเชื่อด่าน แล้วของจริงที่พังก็จะลอดไปด้วย
print("\n── machine_stock ของจริง ──")
try:
    from envload import load_env_local
    load_env_local()
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    hdr = {"apikey": key, "Authorization": f"Bearer {key}"}

    def get(path):
        with urllib.request.urlopen(urllib.request.Request(f"{url}/rest/v1/{path}", headers=hdr), timeout=60) as r:
            return json.loads(r.read())

    payif_ids = {m["machine_id"] for m in get("machines?select=machine_id&brand=eq.payif&limit=100")}
    over = get(f"machine_stock?select=machine_id,slot_number,product_name,max_capacity"
               f"&max_capacity=gt.{PACK_SLOT_MAX}&limit=1000")
except Exception as e:
    print(f"  ⚠️  ต่อ DB ไม่ได้ ข้ามด่านนี้: {type(e).__name__}: {str(e)[:80]}")
else:
    print(f"  ตู้ Payif ที่อยู่ใต้เพดานนี้: {' · '.join(sorted(payif_ids)) or '(ไม่มี)'}")
    packs = [r for r in over if not is_box(r.get("product_name"))]
    bad = [r for r in packs if r["machine_id"] in payif_ids]
    for r in bad[:10]:
        print(f"      {r['machine_id']} ช่อง {r['slot_number']} = {r['max_capacity']} · {r.get('product_name')}")
    if len(bad) > 10:
        print(f"      … อีก {len(bad) - 10} ช่อง")
    check(f"ช่องซองของตู้ Payif ไม่มีที่ความจุเกิน {PACK_SLOT_MAX}", len(bad), 0)

    other = [r for r in packs if r["machine_id"] not in payif_ids]
    if other:
        mids = sorted({r["machine_id"] for r in other})
        print(f"  ℹ️  ตู้ยี่ห้ออื่นที่ช่องซองเกิน {PACK_SLOT_MAX}: {len(other)} ช่อง ({' · '.join(mids)})")
        print("      ไม่ผิด — ตู้พวกนี้ใช้ความจุที่ตู้รายงานตรง ๆ แต่ถ้าเพิ่งโผล่มาควรถามเจ้าของ")
    boxes = [r for r in over if is_box(r.get("product_name"))]
    print(f"  ℹ️  ช่องกล่องที่ความจุเกิน {PACK_SLOT_MAX} (ไม่ผิด): {len(boxes)} ช่อง")

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
