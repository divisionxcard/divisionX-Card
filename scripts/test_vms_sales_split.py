#!/usr/bin/env python3
"""ทดสอบการแบ่งเงินของบิล VMS ที่มีหลายรายการ (vms_sales_api.allocate + parse_api_sales)

รัน: py scripts/test_vms_sales_split.py
คืน exit 1 ถ้าแบ่งเงินไม่ตรงกับที่หลังบ้าน VMS แสดง

เคสอ้างอิงเป็น**บิลจริง**ของ chukes02 วันที่ 30 ส.ค. 2026 ที่เจ้าของจับได้ว่ายอดไม่ตรง:
    บิล 14:28:27 รวม 590 บาท → FB 04 + FB 09 + OP 17
    ระบบเก่าหารสาม  = 196.67 ทั้งสามบรรทัด
    VMS ของจริง     = 110 · 230 · 250

⚠️ ยิงผ่าน parse_api_sales() ตัวจริง ไม่ใช่เรียกแต่ allocate() —
   ตัวที่พังของจริงคือ "route" ที่ประกอบ record ไม่ใช่สูตรคณิต
   (บทเรียน 28 ส.ค.: ทดสอบไลบรารีผ่าน 34/34 แต่เส้นทางจริงเรียกไม่ได้เลย)
"""
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
sys.stdout.reconfigure(encoding="utf-8")

# โมดูลอ่าน env ตั้งแต่ import — ใส่ค่าหลอกให้ครบก่อน (ทดสอบไม่ได้ยิงออกเน็ต)
for k in ("VMS_USERNAME", "VMS_PASSWORD", "SUPABASE_SERVICE_KEY"):
    os.environ.setdefault(k, "test")
os.environ.setdefault("SUPABASE_URL", "https://example.invalid")

import vms_sales_api as v  # noqa: E402

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


# ── 1. ยอดรายบรรทัด = ราคาสินค้าชิ้นนั้น ไม่ใช่ส่วนแบ่งของยอดบิล ────────────
print("── line_amounts: ใช้ราคารายชิ้น ไม่หาร ──")


def amt(total, prices):
    return v.line_amounts(total, prices)[0]


def how(total, prices):
    return v.line_amounts(total, prices)[1]


def drift(total, prices):
    return v.line_amounts(total, prices)[2]


check("บิล 590 · ราคา 110/230/250", amt(590, [110, 230, 250]), [110.0, 230.0, 250.0])
check("บิล 220 · ซอง 80/80/60", amt(220, [80, 80, 60]), [80.0, 80.0, 60.0])
check("ของราคาเท่ากัน", amt(1550, [310] * 5), [310.0] * 5)
check("วิธีที่ใช้คือ 'ราคา' ไม่ใช่ 'หาร'", how(590, [110, 230, 250]), "price")

# เคสจริงที่ทำให้ต้องเลิกหาร — chukes04 1 ก.ย. 2026
check("บิล 390 · NRT 120 + PRB กล่อง 5100 → คืนราคาจริง ไม่ใช่ 8.97/381.03",
      amt(390, [120, 5100]), [120.0, 5100.0])
check("   และรายงานส่วนต่างออกมา ไม่กลบ", drift(390, [120, 5100]), -4830.0)
check("บิล 500 · MLP 120 + 60 → คืนราคาจริง ไม่ใช่ 333.33/166.67",
      amt(500, [120, 60]), [120.0, 60.0])
check("   ส่วนต่าง +320 ต้องโผล่ให้เห็น", drift(500, [120, 60]), 320.0)
check("ราคาตรงยอดบิลพอดี → ส่วนต่าง 0", drift(590, [110, 230, 250]), 0.0)

print("\n── ทางสุดท้าย: ไม่รู้ราคาถึงจะหารเฉลี่ย ──")
check("ไม่รู้ราคาเลย → หารเฉลี่ย", amt(590, [None, None, None]), [196.66, 196.67, 196.67])
check("รู้ราคาไม่ครบ → หารเฉลี่ยทั้งบิล", amt(300, [100, None]), [150.0, 150.0])
check("วิธีที่ใช้ถูกป้ายว่า 'even'", how(300, [100, None]), "even")
check("ราคา 0 ไม่ถือเป็นราคา (กันบรรทัดได้เงิน 0)", amt(100, [0, 50]), [50.0, 50.0])
check("หารเฉลี่ยแล้วเศษต้องไม่หาย", sum(amt(220, [None, None, None])), 220.0)
check("บิลเปล่า", amt(100, []), [])
check("_num: 0 = ไม่มีราคา", v._num(0), None)
check("_num: ข้อความตัวเลขใช้ได้", v._num("250.00"), 250.0)

# ── 2. เส้นทางจริง: บิลจริงของ 30 ส.ค. 2026 ──────────────────────────────
print("\n── parse_api_sales: บิลจริง chukes02 30 ส.ค. 2026 ──")
API_ROW = {
    "txid": "01a05191d7397d50",
    "kiosk_id": "chukes02",
    "created_at": "2026-08-30T07:28:27",
    "total_price": 590,
    "status": "paid",
    "cart": [1, 1, 1],
    "cart_slot": ["054", "058", "040"],
}
# (sku_id, product_name, product_id, sell_price) — ราคาต่อช่องจาก machine_stock (migration 071)
LOOKUP_WITH_PRICE = {
    ("chukes02", "054"): ("FB 04", "Dragonball Fusion World FB - 04", None, 110.0),
    ("chukes02", "058"): ("FB 09", "Dragonball Fusion World FB - 09", None, 230.0),
    ("chukes02", "040"): ("OP 17", "One Piece OP - 17", None, 250.0),
}
recs = v.parse_api_sales([API_ROW], LOOKUP_WITH_PRICE)
got = {r["sku_id"]: r["grand_total"] for r in recs}
check("แบ่งตรงกับที่ VMS แสดง", got, {"FB 04": 110.0, "FB 09": 230.0, "OP 17": 250.0})
check("ยอดรวมของบิลไม่เปลี่ยน", round(sum(r["grand_total"] for r in recs), 2), 590.0)
check("ได้ครบ 3 บรรทัด", len(recs), 3)
check("sale_key ไม่ซ้ำกันในบิลเดียว", len({r["sale_key"] for r in recs}), 3)

print("\n── ยังไม่ได้รัน migration 071 (ช่องไม่มีราคา) → ใช้ราคากลางจาก skus ──")
LOOKUP_NO_PRICE = {k: (a, b, c, None) for k, (a, b, c, _) in LOOKUP_WITH_PRICE.items()}
recs2 = v.parse_api_sales([API_ROW], LOOKUP_NO_PRICE,
                          {"FB 04": 110.0, "FB 09": 230.0, "OP 17": 250.0})
got2 = {r["sku_id"]: r["grand_total"] for r in recs2}
check("ราคากลางช่วยได้ผลเท่ากัน", got2, {"FB 04": 110.0, "FB 09": 230.0, "OP 17": 250.0})

print("\n── ไม่มีราคาเลยทั้งสองทาง → ต้องไม่พัง แค่กลับไปหารเฉลี่ย ──")
recs3 = v.parse_api_sales([API_ROW], LOOKUP_NO_PRICE, {})
check("ยอดรวมยังเท่าเดิม", round(sum(r["grand_total"] for r in recs3), 2), 590.0)
check("หารเฉลี่ยเหมือนพฤติกรรมเดิม",
      sorted(r["grand_total"] for r in recs3), [196.66, 196.67, 196.67])

print("\n── ช่องกล่อง: ราคาสำรองต่อซองต้องคูณกลับเป็นราคาทั้งกล่อง ──")
BOX_ROW = {**API_ROW, "txid": "boxtest", "total_price": 5000,
           "cart": [1, 1], "cart_slot": ["070", "040"]}
BOX_LOOKUP = {
    ("chukes02", "070"): ("OP 13", "One Piece OP - 13 Box", None, None),
    ("chukes02", "040"): ("OP 17", "One Piece OP - 17", None, None),
}
recs4 = v.parse_api_sales([BOX_ROW], BOX_LOOKUP, {"OP 13": 310.0, "OP 17": 250.0})
by = {r["sku_id"]: r for r in recs4}
# กล่อง OP 13 = 310 × 24 = 7440 · ซอง OP 17 = 250 → กล่องต้องได้ส่วนแบ่งเยอะกว่ามาก
check("กล่องได้ราคากล่อง (310 × 24)", by["OP 13"]["grand_total"], 7440.0)
check("ซองได้ราคาซอง", by["OP 17"]["grand_total"], 250.0)
check("กล่องนับเป็น 24 ซอง", by["OP 13"]["quantity_sold"], 24)
# ⚠️ สัญญาเปลี่ยนโดยตั้งใจ: ผลรวมของบรรทัด **ไม่จำเป็นต้องเท่ายอดบิล** อีกต่อไป
#    เพราะบรรทัดถือ "ราคาสินค้า" ไม่ใช่ "ส่วนแบ่งของยอดบิล"
#    ถ้าไม่เท่า = ราคาที่เราถือไม่ตรงกับที่ตู้คิด ซึ่งต้องดังออกมา ไม่ใช่ถูกกลบ
check("ผลรวมไม่เท่ายอดบิลได้ ถ้าราคาที่เราถือไม่ตรง (ต้องถูกรายงาน)",
      round(sum(r["grand_total"] for r in recs4), 2) != 5000.0, True)

print("\n── ช่องที่ map ไม่ได้: ทิ้งทั้งบรรทัดพร้อมส่วนแบ่ง ไม่โยนเงินให้ตัวอื่น ──")
MIX = {**API_ROW, "txid": "mixtest", "total_price": 590}
MIX_LOOKUP = dict(LOOKUP_WITH_PRICE)
MIX_LOOKUP[("chukes02", "058")] = (None, "", None, None)
recs5 = v.parse_api_sales([MIX], MIX_LOOKUP)
got5 = {r["sku_id"]: r["grand_total"] for r in recs5}
check("เหลือ 2 บรรทัด", len(recs5), 2)
check("บรรทัดที่เหลือไม่พองขึ้น", got5, {"FB 04": 196.66, "OP 17": 196.67})

# -- 3. PRODUCT ID BEATS SLOT --
print("\n-- รหัสสินค้า vs ช่อง: บิลจริง chukes04 1 ก.ย. 2026 --")
# หลังบ้าน VMS: 14:05:42 ตู้ 4 = OP-17 (250) + OP-08 (140) = 390
# ตอนนั้นแอดมินเพิ่งเปลี่ยนของหน้าตู้เมื่อเช้า แต่เรา sync สต็อกตอน 14:19
# slot_lookup จึงยังถือของชุดเก่า (NRT Jin-2 / PRB 01 Box) อยู่
STALE_SLOT = {
    ("chukes04", "017"): ("NRT Jin - 2", "Naruto Jin - 2", "9001", 120.0),
    ("chukes04", "026"): ("PRB 01", "PRB - 01 (Box)", "9002", 5100.0),
}
FRESH_PRODUCT = {
    "pair": {("chukes04", "14258"): ("OP 17", "One Piece OP - 17", 250.0)},
    "pid":  {"14258": ("OP 17", "One Piece OP - 17", 250.0),
             "1408":  ("OP 08", "One Piece OP - 08", 140.0)},
}
REAL = {
    "txid": "sep01-1405", "kiosk_id": "chukes04",
    "created_at": "2026-09-01T07:05:42", "total_price": 390, "status": "paid",
    "cart": ["14258", "1408"], "cart_slot": ["017", "026"],
    "dispenseStatus": [
        {"product_id": "14258", "slot_code": "017", "status": "success"},
        {"product_id": "1408",  "slot_code": "026", "status": "success"},
    ],
}
r6 = v.parse_api_sales([REAL], STALE_SLOT, {}, FRESH_PRODUCT)
check("ได้สินค้าตามบิล ไม่ใช่ตามของที่ค้างอยู่ในช่อง",
      sorted(r["sku_id"] for r in r6), ["OP 08", "OP 17"])
check("ยอดตรงกับที่หลังบ้านแสดง (250 + 140)",
      {r["sku_id"]: r["grand_total"] for r in r6}, {"OP 17": 250.0, "OP 08": 140.0})
check("รวมได้ยอดบิลพอดี", round(sum(r["grand_total"] for r in r6), 2), 390.0)
check("นับเป็นซองเดี่ยว ไม่ใช่กล่อง 10 ซองอย่างที่ช่องค้างไว้",
      sorted(r["quantity_sold"] for r in r6), [1, 1])
check("ยังเก็บเลขช่องไว้อ้างอิง", sorted(r["slot_number"] for r in r6), ["017", "026"])

print("\n-- ไม่รู้จักรหัสสินค้า ถอยไปดูช่องได้ ไม่ทิ้งยอด --")
r7 = v.parse_api_sales([REAL], STALE_SLOT, {}, {"pair": {}, "pid": {}})
check("ยังได้ 2 บรรทัดจากช่อง", len(r7), 2)
check("ยอดรวมไม่หาย", round(sum(r["grand_total"] for r in r7), 2) > 0, True)

print("\n-- บิลเก่าที่ไม่มี dispenseStatus ใช้ zip(cart, cart_slot) แทน --")
NO_DISP = {k: val for k, val in REAL.items() if k != "dispenseStatus"}
r8 = v.parse_api_sales([NO_DISP], STALE_SLOT, {}, FRESH_PRODUCT)
check("ยังอ่านรหัสสินค้าจาก cart ได้", sorted(r["sku_id"] for r in r8), ["OP 08", "OP 17"])

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
