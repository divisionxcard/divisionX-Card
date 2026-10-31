"""ทดสอบตัวคำนวณยอดขาย/กำไร/เทียบช่วง/ขายไม่ออก ที่ Hermes เรียกผ่าน MCP (ฟังก์ชันล้วน ไม่ยิงเน็ต ไม่แตะ DB)

หัวใจคือข้อแรก: กำไรที่ Hermes ตอบต้องเท่ากับที่บอท DVX Job ส่งเข้ากลุ่มทุกเช้า (daily_sales_digest.summarize)

⚠️ ตัวเลขต้นทุนในไฟล์นี้**แต่งขึ้นทั้งหมด** — repo สาธารณะ ห้ามใส่ทุนจริง

รัน:  python scripts/test_dvx_sales_calc.py
"""
import pathlib
import sys
from datetime import date, datetime, timedelta, timezone

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "deploy" / "agents"))
import dvx_data as d  # noqa: E402
import daily_sales_digest as dg  # noqa: E402

TH = timezone(timedelta(hours=7))
fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — ได้ {got!r} ต้องการ {want!r}"))


def utc(day, hh=12):
    """เวลาไทย day hh:00 → สตริง UTC แบบในตาราง sales"""
    return datetime(day.year, day.month, day.day, hh, tzinfo=TH).astimezone(timezone.utc).isoformat()


# ── ข้อมูลสมมติ (ทุนแต่งขึ้น) ──
SKUS = [
    {"sku_id": "AA 01", "name": "Alpha 01", "franchise": "OP", "packs_per_box": 24, "avg_cost": 0, "cost_price": 0},
    {"sku_id": "BB 01", "name": "Beta 01", "franchise": "DB", "packs_per_box": 10, "avg_cost": 0, "cost_price": 50},
    {"sku_id": "CC 01", "name": "Gamma 01", "franchise": "PKM", "packs_per_box": 30, "avg_cost": 0, "cost_price": 0},
]
HIST = [
    {"sku_id": "AA 01", "cost_per_pack": 100, "effective_from": "2000-01-01"},
    {"sku_id": "AA 01", "cost_per_pack": 80, "effective_from": "2026-08-01"},
]
BRAND = {"m1": "vms", "m2": "worldwide", "m3": "payif"}
costs = dg.Costs(SKUS, HIST)
ctx = {"costs": costs, "with_profit": True, "brand": BRAND}

D_OLD, D_NEW = date(2026, 7, 31), date(2026, 8, 1)
SALES = [
    {"machine_id": "m1", "sku_id": "AA 01", "quantity_sold": 2, "unit": "pack", "grand_total": 400,
     "transaction_id": "t1", "sold_at": utc(D_OLD)},
    {"machine_id": "m1", "sku_id": "AA 01", "quantity_sold": 1, "unit": "pack", "grand_total": 200,
     "transaction_id": "t2", "sold_at": utc(D_NEW)},
    {"machine_id": "m2", "sku_id": "AA 01", "quantity_sold": 24, "unit": "box", "grand_total": 4500,
     "transaction_id": "t3", "sold_at": utc(D_NEW), "_unit": "box"},
    {"machine_id": "m2", "sku_id": "BB 01", "quantity_sold": 1, "unit": "box", "grand_total": 900,  # กล่องที่เก็บเป็น 1
     "transaction_id": "t4", "sold_at": utc(D_NEW), "_unit": "box"},
    {"machine_id": "m3", "sku_id": "CC 01", "quantity_sold": 3, "unit": "pack", "grand_total": 600,  # ไม่รู้ทุน
     "transaction_id": "t5", "sold_at": utc(D_NEW)},
    {"machine_id": "m3", "sku_id": "BB 01", "quantity_sold": 2, "unit": "pack", "grand_total": 300,
     "transaction_id": "t5", "sold_at": utc(D_NEW)},
]
CLAIMS = [{"machine_id": "m1", "sku_id": "AA 01", "refund_amount": 50, "claimed_at": "2026-08-01"}]

# ── 1. กำไรต้องเท่าสรุปยอดทุกเช้า ──
per, tot, unknown = dg.summarize(SALES, CLAIMS, BRAND, costs)
by_m = d.tally(SALES, lambda r: r["machine_id"], ctx, CLAIMS, lambda c: c["machine_id"])
for mid in ("m1", "m2", "m3"):
    check(f"กำไร {mid} เท่าสรุปยอด", round(d._profit(by_m[mid]), 6), round(per[mid]["profit"], 6))
    check(f"ยอดขาย {mid} เท่าสรุปยอด", by_m[mid]["revenue"], per[mid]["rev"])
    check(f"จำนวนซอง {mid} เท่าสรุปยอด", by_m[mid]["packs"], per[mid]["packs"])
total = d.tally(SALES, lambda r: "all", ctx, CLAIMS, lambda c: "all")["all"]
check("กำไรรวมเท่าสรุปยอด", round(d._profit(total), 6), round(tot["profit"], 6))
check("ยอดที่ไม่รู้ทุนแยกไว้ ไม่นับในกำไร", total["uncosted_rev"], 600.0)
check("รายชื่อสินค้าไม่รู้ทุน", sorted(total["uncosted"]), sorted(unknown))
check("ทุนตามวันที่: ก่อน 1 ส.ค. ใช้ทุนเดิม", costs.on("AA 01", D_OLD), 100.0)
check("ทุนตามวันที่: ตั้งแต่ 1 ส.ค. ใช้ทุนใหม่", costs.on("AA 01", D_NEW), 80.0)
check("กล่องที่เก็บเป็น 1 → นับเป็นซองต่อกล่อง", by_m["m2"]["packs"], 24 + 10)
by_s = d.tally(SALES, lambda r: r["sku_id"], ctx, CLAIMS, lambda c: c["sku_id"])
check("แยกตามสินค้า รวมกลับได้กำไรเท่ากัน", round(sum(d._profit(b) for b in by_s.values()), 6),
      round(tot["profit"], 6))
check("บิลเดียวหลายแถว นับ 1 บิล", len(by_m["m3"]["bills"]), 1)
pb = d.profit_block(total)
check("profit_block ไม่มีต้นทุนต่อซองรายสินค้า", any("per_pack" in k for k in pb), False)
check("profit_block บอกสินค้าที่ไม่มีทุน", pb["skus_without_cost"], ["CC 01"])
no_profit = d.tally(SALES, lambda r: "all", {**ctx, "with_profit": False})["all"]
check("ไม่คิดกำไร = ไม่แตะทุน แต่ยังนับซองกล่องถูก", (no_profit["cogs"], no_profit["packs"]), (0.0, total["packs"]))

# ── 2. ช่วงวันที่ ──
today = date(2026, 10, 31)
check("7 วันล่าสุด = จบเมื่อวาน", d.last_full_days(7, today=today), (date(2026, 10, 24), date(2026, 10, 30)))
check("รวมวันนี้ได้ถ้าขอ", d.last_full_days(7, include_today=True, today=today),
      (date(2026, 10, 25), date(2026, 10, 31)))
a, b = date(2026, 10, 24), date(2026, 10, 30)
check("previous = 7 วันก่อนหน้า", d.compare_range(a, b, "previous"), (date(2026, 10, 17), date(2026, 10, 23)))
check("last_week 7 วัน = เลื่อน 7", d.compare_range(a, b, "last_week"), (date(2026, 10, 17), date(2026, 10, 23)))
check("last_week 10 วัน = เลื่อน 14 ไม่ซ้อนกัน", d.compare_range(date(2026, 10, 21), b, "last_week"),
      (date(2026, 10, 7), date(2026, 10, 16)))
check("last_week วันเดียว = วันเดียวกันของสัปดาห์ก่อน",
      d.compare_range(b, b, "last_week"), (date(2026, 10, 23), date(2026, 10, 23)))
check("last_month ทั้งเดือน ต.ค. → ก.ย. (30 วัน)", d.compare_range(date(2026, 10, 1), date(2026, 10, 31), "last_month"),
      (date(2026, 9, 1), date(2026, 9, 30)))
check("last_month 31 มี.ค. → 28 ก.พ.", d.compare_range(date(2026, 3, 29), date(2026, 3, 31), "last_month"),
      (date(2026, 2, 28), date(2026, 2, 28)))
check("last_month ทั้งเดือน ก.ย. → ส.ค. ทั้งเดือน (ไม่ทิ้ง 31 ส.ค.)",
      d.compare_range(date(2026, 9, 1), date(2026, 9, 30), "last_month"), (date(2026, 8, 1), date(2026, 8, 31)))
check("last_month ก.พ. ทั้งเดือน → ม.ค. ทั้งเดือน", d.compare_range(date(2027, 2, 1), date(2027, 2, 28), "last_month"),
      (date(2027, 1, 1), date(2027, 1, 31)))
check("last_month กลางเดือนไม่โดนดันไปสิ้นเดือน", d.compare_range(date(2026, 9, 10), date(2026, 9, 20), "last_month"),
      (date(2026, 8, 10), date(2026, 8, 20)))
check("last_year ก.พ. ปีอธิกสุรทิน → สิ้น ก.พ. ปีก่อน", d.compare_range(date(2028, 2, 1), date(2028, 2, 29), "last_year"),
      (date(2027, 2, 1), date(2027, 2, 28)))
check("ทั้งเดือนเทียบเดือนสั้นกว่า → เตือนยาวไม่เท่ากัน",
      any("ยาวไม่เท่ากัน" in x for x in d.mix_notes(date(2027, 2, 1), date(2027, 2, 28),
                                                   date(2027, 1, 1), date(2027, 1, 31), 50000)), True)
check("last_month ข้ามปี ม.ค. → ธ.ค.", d.compare_range(date(2027, 1, 5), date(2027, 1, 6), "last_month"),
      (date(2026, 12, 5), date(2026, 12, 6)))
check("last_year", d.compare_range(a, b, "last_year"), (date(2025, 10, 24), date(2025, 10, 30)))
try:
    d.compare_range(date(2026, 9, 1), date(2026, 10, 30), "last_month")
    check("ช่วงซ้อนกันต้องฟ้อง", "ไม่ฟ้อง", "ฟ้อง")
except d.DvxError:
    check("ช่วงซ้อนกันต้องฟ้อง", "ฟ้อง", "ฟ้อง")

# ── 3. คำเตือนการเทียบ ──
n = d.mix_notes(date(2026, 10, 1), date(2026, 10, 31), date(2026, 9, 1), date(2026, 9, 30), 50000)
check("ยาวไม่เท่ากัน → เตือน", any("ยาวไม่เท่ากัน" in x for x in n), True)
check("เสาร์-อาทิตย์ไม่เท่ากัน → เตือน", any("เสาร์-อาทิตย์" in x for x in n), True)
check("7 วันเทียบ 7 วัน ไม่ต้องเตือน", d.mix_notes(a, b, date(2026, 10, 17), date(2026, 10, 23), 5000), [])
check("ฐานเล็ก → เตือน", any("แกว่ง" in x for x in d.mix_notes(a, b, date(2026, 10, 17), date(2026, 10, 23), 400)), True)
check("% เปลี่ยน", d.pct_change(75, 100), -25.0)
check("ช่วงก่อนเป็น 0 → ไม่มี %", d.pct_change(75, 0), None)
check("ช่วงก่อนติดลบ (กำไรขาดทุน) → ไม่มี % (หารลบแล้วเครื่องหมายกลับ)", d.pct_change(50, -100), None)

now = datetime(2026, 10, 31, 10, 30, tzinfo=TH)
synced = {"vms": datetime(2026, 10, 31, 0, 11, tzinfo=TH), "worldwide": datetime(2026, 10, 30, 10, 2, tzinfo=TH)}
st = d.sync_notes(synced, date(2026, 10, 30), now)
check("ยี่ห้อที่ยังไม่ซิงค์หลังเที่ยงคืน → เตือนยอดไม่ครบ",
      (st["complete"], len(st["notes"]), "WorldWide" in st["notes"][0]), (False, 1, True))
check("ซิงค์ครบทุกยี่ห้อ → ไม่เตือน", d.sync_notes({"vms": synced["vms"]}, date(2026, 10, 30), now),
      {"complete": True, "notes": []})
check("รวมวันนี้ → เตือนยังไม่จบวัน", "ยังไม่จบวัน" in d.sync_notes(synced, date(2026, 10, 31), now)["notes"][0], True)
# Payif ตู้เดียว วันที่ขายไม่ได้เลย = ไม่มีแถวขายใหม่ — แยกไม่ออกจากรอบดึงยอดล้ม (ไม่มีบันทึกรอบซิงค์)
# → ไม่ฟันธงว่าครบ แต่บอกว่าเป็นได้ 2 ทาง (เวลาซิงค์สต็อกพิสูจน์ไม่ได้ — workflow สต็อกข้ามขั้นยอดขายที่ล้มแล้ววิ่งต่อ)
pay = d.sync_notes({"payif": datetime(2026, 10, 26, 0, 11, tzinfo=TH)}, date(2026, 10, 26),
                   datetime(2026, 10, 27, 9, 0, tzinfo=TH), {"payif"})
check("ตู้เดียวไม่มีแถวใหม่ → ไม่ฟันธงว่าครบ + บอกว่าอาจขายไม่ได้",
      (pay["complete"], "ขายไม่ได้" in pay["notes"][0]), (False, True))
ww = d.sync_notes({"worldwide": datetime(2026, 10, 26, 0, 11, tzinfo=TH)}, date(2026, 10, 26),
                  datetime(2026, 10, 27, 9, 0, tzinfo=TH), {"payif"})
check("หลายตู้ไม่มีแถวใหม่ → เตือนยอดไม่ครบตรง ๆ", "อาจยังไม่ครบ" in ww["notes"][0], True)

# ── 4. หาตู้จากชื่อ ──
MACHINES = [
    {"id": 1, "machine_id": "v1", "name": "ตู้ที่ 1 (v1) · เดอะมอลล์บางแค", "location": "เดอะมอลล์บางแค", "status": "active",
     "config": {"branch": {"display_name": "เดอะมอลล์บางแค"}}},
    {"id": 2, "machine_id": "v2", "name": "ตู้ที่ 2 (v2) · เซ็นทรัลพระราม2", "location": "เซ็นทรัลพระราม2", "status": "active",
     "config": {"branch": {"display_name": "เซ็นทรัลพระราม 2"}}},
    {"id": 6, "machine_id": "w2", "name": "ตู้ที่ 6 (w2) · เดอะมอลไลฟ์สโตร์ บางกะปิ", "location": "เดอะมอลไลฟ์สโตร์ บางกะปิ",
     "status": "inactive", "config": {"branch": {"display_name": "เดอะมอลล์บางกะปิ", "retired_at": "2026-08-19"}}},
    {"id": 9, "machine_id": "w5", "name": "ตู้ที่ 9 (w5) · ซีคอน บางแค", "location": "ซีคอน บางแค", "status": "active",
     "config": {"branch": {"display_name": "ซีคอนบางแค"}}},
    {"id": 10, "machine_id": "w6", "name": "ตู้ที่ 10 (w6) · เซ็นทรัล พระราม 2 (WW)", "location": "เซ็นทรัล พระราม 2",
     "status": "active", "config": {"branch": {"display_name": "เซ็นทรัลพระราม 2"}}},
    {"id": 13, "machine_id": "w8", "name": "ตู้ที่ 13 (w8) · เดอะมอลล์ไลฟ์สโตร์ บางกะปิ (2)",
     "location": "เดอะมอลล์ไลฟ์สโตร์ บางกะปิ", "status": "active",
     "config": {"branch": {"display_name": "เดอะมอลล์บางกะปิ"}}},
]
check("machine_id ตรง ๆ (ตู้ที่ปิดแล้วก็ได้ ถ้าระบุเอง)", d.resolve_machines("w2", MACHINES), ["w2"])
check("ชื่อตรงทั้งตู้ปิดกับตู้ใช้งาน → เอาตู้ใช้งาน", d.resolve_machines("เดอะมอลล์บางกะปิ", MACHINES), ["w8"])
check("ถามช่วงที่ตู้เก่ายังเปิด → รวมตู้ที่ปิดแล้วของห้างเดียวกันด้วย",
      d.resolve_machines("บางกะปิ", MACHINES, date(2026, 7, 1)), ["w2", "w8"])
check("ถามช่วงหลังตู้เก่าปิด → ไม่ดึงตู้ที่ปิดแล้วมา", d.resolve_machines("บางกะปิ", MACHINES, date(2026, 9, 1)), ["w8"])
check("ถามสภาพตอนนี้ (สต็อก) → ตู้ใช้งานเท่านั้น", d.resolve_machines("บางกะปิ", MACHINES), ["w8"])
bm = d.branch_map(MACHINES)
check("สาขาใช้ชื่อที่ลูกค้าเห็น — ตู้เก่าสะกดห้างผิดยังรวมสาขาเดียวกัน", bm["w2"][0] == bm["w8"][0], True)
check("พระราม 2 สองตู้ = สาขาเดียว", bm["v2"][0] == bm["w6"][0], True)
check("บางแคสองห้าง = คนละสาขา", bm["v1"][0] == bm["w5"][0], False)
check("ชื่อห้างที่มี 2 ตู้ → ทั้งสาขา (ไม่สนช่องว่าง)", d.resolve_machines("พระราม 2", MACHINES), ["v2", "w6"])
check("หลายตู้คั่น , และคำว่า กับ", d.resolve_machines("ซีคอน, w8 กับ v1", MACHINES), ["w5", "w8", "v1"])
try:
    d.resolve_machines("บางแค", MACHINES)
    check("ชื่อกำกวมข้ามสาขาต้องฟ้อง", "ไม่ฟ้อง", "ฟ้อง")
except d.DvxError as e:
    check("ชื่อกำกวมข้ามสาขาต้องฟ้อง พร้อมบอกตัวเลือก", ("v1" in str(e), "w5" in str(e)), (True, True))
check("resolve_machine (ตู้เดียว) ยังใช้กับชื่อเฉพาะได้", d.resolve_machine("ซีคอน", MACHINES), "w5")
mctx = {"by_id": {m["machine_id"]: m for m in MACHINES}}
check("ตู้ปิดแล้ว → บอกว่ายอด 0 เพราะไม่มีตู้", "ไม่ใช่เพราะยังไม่ซิงค์" in d.machine_notes(["w2"], mctx)[0], True)
check("ตู้ใช้งาน → ไม่มีหมายเหตุ", d.machine_notes(["w8"], mctx), [])

# ── 5. หาสินค้าจากชื่อ ──
SK = [{"sku_id": "OP 12", "name": "One Piece OP-12", "franchise": "OP"},
      {"sku_id": "EB 03", "name": "One Piece Extra Booster 03", "franchise": "OP"},
      {"sku_id": "FB 01", "name": "Dragonball FB-01", "franchise": "DB"},
      {"sku_id": "FB 05", "name": "Dragonball FB-05", "franchise": "DB"}]
check("sku_id ไม่สนช่องว่าง/ตัวพิมพ์", d.resolve_skus("op12", SK), ["OP 12"])
check("ชื่อค่าย → ทั้งค่าย", d.resolve_skus("Dragon Ball", SK), ["FB 01", "FB 05"])
check("ขึ้นต้น FB → ทุก FB", d.resolve_skus("FB", SK), ["FB 01", "FB 05"])
check("หลายตัวคั่น ,", d.resolve_skus("OP 12, EB 03", SK), ["OP 12", "EB 03"])
SK2 = SK + [{"sku_id": "OP 01", "name": "One Piece OP-01", "franchise": "OP"},
            {"sku_id": "OP 10", "name": "One Piece OP-10", "franchise": "OP"},
            {"sku_id": "NRT Jin - 2", "name": "Naruto Jin02", "franchise": "NRT"}]
check("'OP 1' = OP 01 (ไม่ใช่ OP 10–17)", d.resolve_skus("OP 1", SK2), ["OP 01"])
check("'OP-1' = OP 01", d.resolve_skus("OP-1", SK2), ["OP 01"])
check("'FB 1' = FB 01", d.resolve_skus("FB 1", SK2), ["FB 01"])
check("'NRT Jin 2' = NRT Jin - 2", d.resolve_skus("NRT Jin 2", SK2), ["NRT Jin - 2"])
try:
    d.resolve_skus("OP 2", SK2)
    check("เลขชุดที่ไม่มีต้องฟ้อง ไม่เดาเป็นชุดอื่น", "ไม่ฟ้อง", "ฟ้อง")
except d.DvxError:
    check("เลขชุดที่ไม่มีต้องฟ้อง ไม่เดาเป็นชุดอื่น", "ฟ้อง", "ฟ้อง")

# ── 6. มุมมองรายวัน/วันในสัปดาห์ ──
bctx = {**ctx, "with_profit": False}
day_rows = [{"machine_id": "m1", "sku_id": "AA 01", "quantity_sold": 1, "grand_total": 100, "sold_at": utc(x)}
            for x in (date(2026, 10, 24), date(2026, 10, 25), date(2026, 10, 25))]   # ส. อา. อา.
g = d.tally(day_rows, lambda r: d._th_dt(r["sold_at"]).date(), bctx)
days = d.breakdown_rows("day", g, bctx, date(2026, 10, 23), date(2026, 10, 25), 300)
check("รายวันใส่วันที่ยอด 0 ด้วย", [(x["date"], x["revenue"]) for x in days],
      [("2026-10-23", 0), ("2026-10-24", 100), ("2026-10-25", 200)])
g = d.tally(day_rows, lambda r: d._th_dt(r["sold_at"]).weekday(), bctx)
wk = d.breakdown_rows("weekday", g, bctx, date(2026, 10, 12), date(2026, 10, 25), 300)
sun = [x for x in wk if x["weekday"] == "อาทิตย์"][0]
check("วันในสัปดาห์: นับจำนวนวันนั้นในช่วง + เฉลี่ยต่อวัน", (sun["days_in_range"], sun["revenue_per_day"]), (2, 100))
g = d.tally(day_rows, lambda r: d._th_dt(r["sold_at"]).hour, bctx)
hrs = d.breakdown_rows("hour", g, bctx, date(2026, 10, 24), date(2026, 10, 25), 300)
check("รายชั่วโมงใส่ชั่วโมงห้างเปิดครบแม้ยอด 0", [h["hour"][:2] for h in hrs], [f"{h:02d}" for h in range(10, 23)])
check("ขายตอน 23:30 ไทย นับเป็นวันนั้น (ไม่ใช่วันถัดไปแบบ UTC)",
      d._th_dt(utc(date(2026, 10, 25), 23)).date(), date(2026, 10, 25))

# ── 7. สินค้าขายไม่ออก ──
# เหตุการณ์ช่องเกิดตอนรอบซิงค์เที่ยงคืน (00:00 ไทย) · ตัวคำนวณดูภาพตอนเที่ยงของแต่ละวัน
NOW = datetime(2026, 10, 31, 10, 30, tzinfo=TH)


def ev(mid, sku, kind, day, qb=0, qa=12, slot=None, box=False, eid=0):
    return {"id": eid, "machine_id": mid, "sku_id": sku, "change_type": kind, "is_box": box,
            "slot_number": slot, "qty_before": qb, "qty_after": qa, "synced_at": utc(day, 0)}


def stock(mid, sku, remain=12, cap=12, slot="001", name=None, empty_since=None):
    return {"machine_id": mid, "sku_id": sku, "product_name": name or sku, "remain": remain,
            "max_capacity": cap, "slot_number": slot, "empty_since": empty_since}


def run(stock_rows, events, d1, d2, period=(), history=(), max_packs=0, ppb=None):
    items = d.unsold_core(stock_rows, list(period), list(history), events, {"w5": "2026-06-19", "v1": "2026-06-13"},
                          d1, d2, max_packs, today, now=NOW, ppb=ppb, slot_grain={"v1"})
    return {(i["machine_id"], i["sku_id"]): i for i in items}


OCT1, OCT29 = date(2026, 10, 1), date(2026, 10, 29)
STOCK = [
    stock("w5", "OP 08"),
    stock("w5", "OP 12", remain=8), stock("w5", "OP 12", remain=2, cap=4, slot="014", name="OP 12 Box"),
    stock("w5", "TF 01", remain=24, cap=24),
    stock("w5", "NEW 01"),
    stock("w5", "EMP 01", remain=0, empty_since="2026-09-20T05:00:00+00:00"),
    stock("w5", "MOV 01", name="Moved Rivals"),
    stock("w5", "REF 01"),
    stock("w5", "ART 01"),
    stock("v1", "EXP 01", slot="001"), stock("v1", "EXP 01", slot="002"),
    {"machine_id": "w5", "sku_id": None, "product_name": "ชื่อที่ยังไม่ผูก", "remain": 5, "max_capacity": 12},
]
EVENTS = [
    ev("w5", "NEW 01", "swap_in", date(2026, 10, 22)),
    # ย้ายช่อง/เปลี่ยนชื่อในรอบเดียวกัน — ของไม่ได้ออกจากตู้
    ev("w5", "MOV 01", "swap_out", date(2026, 10, 20), qb=12, qa=0, eid=1),
    ev("w5", "MOV 01", "swap_in", date(2026, 10, 20), qb=0, qa=12, eid=2),
    # ขายหมด 21 ก.ย. แล้วเติมจาก 0 วันที่ 6 ต.ค. (เคส MLBB chukes04)
    ev("w5", "REF 01", "refill", date(2026, 10, 6), qb=0, qa=12),
    # เติมจาก 0 แต่ไม่มีหลักฐานว่าว่าง (รอบก่อนเต็ม · ไม่มียอดขาย) = ข้อมูลหลังบ้านไม่ต่อกัน ไม่นับว่าว่าง
    ev("w5", "ART 01", "swap_in", date(2026, 8, 13), qb=0, qa=12),
    ev("w5", "ART 01", "refill", date(2026, 10, 10), qb=0, qa=12),
    # VMS เพิ่มช่องที่ 2 ให้ของที่อยู่ช่อง 001 มาตลอด — ไม่ใช่ลงตู้ใหม่
    ev("v1", "EXP 01", "swap_in", date(2026, 10, 25), slot="002"),
]
PERIOD = [{"machine_id": "w5", "sku_id": "OP 12", "quantity_sold": 3},
          {"machine_id": "w5", "sku_id": "TF 01", "quantity_sold": 1}]
HISTORY = [{"machine_id": "w5", "sku_id": "OP 08", "sold_at": utc(date(2026, 8, 29), 15)},
           {"machine_id": "w5", "sku_id": "OP 08", "sold_at": utc(date(2026, 7, 2), 15)},
           {"machine_id": "w5", "sku_id": "REF 01", "sold_at": utc(date(2026, 9, 21), 15)}]
got = run(STOCK, EVENTS, OCT1, OCT29, PERIOD, HISTORY)
st = {k[1]: v["status"] for k, v in got.items()}
check("สินค้าที่ขายได้ในช่วง ไม่ถูกนับเป็นขายไม่ออก (เคส 30 ต.ค.)", "OP 12" in st, False)
check("ขายได้ 1 ซอง ไม่ใช่ 'ขายไม่ได้เลย'", "TF 01" in st, False)
check("อยู่ทั้งช่วง มีของ ไม่มีใครกด → unsold", st.get("OP 08"), "unsold")
check("ลงตู้ 22 ต.ค. (มีของ 8 วัน) → short", (st.get("NEW 01"), got[("w5", "NEW 01")]["days_with_stock"]), ("short", 8))
check("ช่องว่างตั้งแต่ก่อนช่วง → empty", st.get("EMP 01"), "empty")
check("ย้ายช่อง/เปลี่ยนชื่อในรอบเดียวกัน → ยังเป็น unsold", st.get("MOV 01"), "unsold")
ref = got[("w5", "REF 01")]
check("ขายหมด 21 ก.ย. เติมจาก 0 วันที่ 6 ต.ค. → unsold นับวันมีของ 24 จาก 29",
      (ref["status"], ref["days_with_stock"], ref["period_days"], "24 จาก 29" in ref.get("note", "")),
      ("unsold", 24, 29, True))
check("เติมจาก 0 แบบไม่มีหลักฐานว่าว่าง ไม่หักวัน", got[("w5", "ART 01")]["days_with_stock"], 29)
check("VMS เพิ่มช่องให้ของเดิม ไม่ใช่ลงตู้ใหม่ → unsold", st.get("EXP 01"), "unsold")
check("ช่องที่ยังไม่ผูก sku ไม่ถูกตัดสิน", None in st, False)
op8 = got[("w5", "OP 08")]
check("วันขายล่าสุด = ครั้งหลังสุด", (op8["last_sale"], op8["days_since_last_sale"]), ("2026-08-29", 63))
check("ไม่มีประวัติลงช่อง = อยู่ก่อนเริ่มเก็บประวัติ", op8["in_machine_since"].startswith("ก่อน 2026-06-19"), True)
check("ลงตู้รอบล่าสุดของ NEW 01", got[("w5", "NEW 01")]["in_machine_since"], "2026-10-22")
order = ["unsold", "slow", "short", "empty"]
seq = [v["status"] for v in d.unsold_core(STOCK, PERIOD, HISTORY, EVENTS, {}, OCT1, OCT29, 0, today, now=NOW,
                                          slot_grain={"v1"})]
check("ลำดับ: unsold ก่อน แล้ว short แล้ว empty", seq, sorted(seq, key=order.index))
check("SKU มีทั้งซองและกล่อง แสดงทั้งสองแบบ", run(STOCK, [], OCT1, OCT29)[("w5", "OP 12")]["stock"], "ซอง 8/12 · กล่อง 2/4")
slow1 = run(STOCK, EVENTS, OCT1, OCT29, PERIOD, max_packs=1)
check("max_packs=1 → ตัวที่ขายได้ 1 ซองเข้ามาเป็น slow ไม่ใช่ unsold (เคสรายงาน FB 06 ว่าขายไม่ออก)",
      slow1.get(("w5", "TF 01"), {}).get("status"), "slow")
check("max_packs=1 → ตัวที่ขายไม่ได้เลยยังเป็น unsold", slow1[("w5", "OP 08")]["status"], "unsold")
box_row = [{"machine_id": "w5", "sku_id": "TF 01", "quantity_sold": 1, "unit": "box"}]
check("แถวกล่องที่เก็บเป็นจำนวนกล่อง → นับเป็นซอง (1 กล่อง = 15 ซอง เกิน max_packs 5)",
      ("w5", "TF 01") in run(STOCK, [], OCT1, OCT29, box_row, max_packs=5, ppb={"TF 01": 15}), False)

# ถามย้อนหลัง (ส.ค.) — ใช้ประวัติช่อง ไม่ใช่สต็อกตอนนี้
AUG1, AUG31 = date(2026, 8, 1), date(2026, 8, 31)
STOCK_NOW = [stock("v1", "STI 01", slot="014"), stock("v1", "LATE 01", slot="020"),
             stock("w5", "SOLD OUT", remain=0, empty_since="2026-10-20T05:00:00+00:00")]
EV_PAST = [ev("v1", "STI 01", "swap_in", date(2026, 8, 14), slot="045"),
           ev("v1", "STI 01", "swap_out", date(2026, 8, 28), qb=12, qa=0, slot="045"),
           ev("v1", "STI 01", "swap_in", date(2026, 9, 1), slot="014"),
           ev("v1", "LATE 01", "swap_in", date(2026, 9, 9), slot="020"),
           ev("v1", "GONE 01", "swap_out", date(2026, 8, 25), qb=12, qa=0, slot="030")]
past = run(STOCK_NOW, EV_PAST, AUG1, AUG31)
check("อยู่ในตู้ 14–27 ส.ค. แล้วถอด ก่อนใส่กลับ ก.ย. → นับ 14 วันในเดือน ส.ค. = unsold (เคส chukes04 OP 03)",
      (past[("v1", "STI 01")]["status"], past[("v1", "STI 01")]["days_with_stock"]), ("unsold", 14))
check("ลงตู้หลังช่วงที่ถาม → ไม่อยู่ในรายการ (เดิมขึ้น 'เพิ่งลงตู้' วันติดลบ)", ("v1", "LATE 01") in past, False)
check("ช่องหมดหลังช่วงที่ถาม (20 ต.ค.) → ช่วง ส.ค. ยังมีของ = unsold ไม่ใช่ empty",
      past[("w5", "SOLD OUT")]["status"], "unsold")
gone = past[("v1", "GONE 01")]
check("ถอดออกจากตู้แล้ว ยังนับในช่วงที่เคยอยู่ + บอกว่าถอดแล้ว",
      (gone["days_with_stock"], gone["stock"].startswith("ไม่อยู่ในตู้แล้ว")), (24, True))

# ถามสั้น ๆ 7 วัน — มองย้อนอย่างน้อย 14 วันเสมอ ไม่งั้นคำตอบกลับไปกลับมาตามความยาวช่วง
w7 = run([stock("w5", "SHORT 01")],
         [ev("w5", "SHORT 01", "swap_out", date(2026, 10, 1), qb=12, qa=0),
          ev("w5", "SHORT 01", "swap_in", date(2026, 10, 22))],
         date(2026, 10, 23), OCT29)
check("ถาม 7 วัน ของที่ลงตู้ 22 ต.ค. → short (ไม่ใช่ unsold เพราะช่วงสั้น)", w7[("w5", "SHORT 01")]["status"], "short")
check("ถาม 7 วัน ของที่อยู่มานาน → unsold", run([stock("w5", "LONG 01")], [], date(2026, 10, 23), OCT29)[
      ("w5", "LONG 01")]["status"], "unsold")
fut = run([stock("w5", "LONG 01")], [], OCT1, date(2026, 11, 30))
check("to_date เลยวันนี้ → นับวันถึงวันนี้เท่านั้น", fut[("w5", "LONG 01")]["period_days"], 31)

# ── 8. จากรีวิวรอบ 2 ──
# เทียบเดือนก่อน: ขยายถึงสิ้นเดือนเฉพาะตอนถามเป็นเดือน (เริ่มวันที่ 1)
check("วันเดียว 30 ก.ย. เทียบเดือนก่อน = 30 ส.ค. วันเดียว",
      d.compare_range(date(2026, 9, 30), date(2026, 9, 30), "last_month"), (date(2026, 8, 30), date(2026, 8, 30)))
check("22–28 ก.พ. เทียบเดือนก่อน = 22–28 ม.ค.",
      d.compare_range(date(2027, 2, 22), date(2027, 2, 28), "last_month"), (date(2027, 1, 22), date(2027, 1, 28)))
check("last_year วันเดียว 28 ก.พ. 2029 = 28 ก.พ. 2028",
      d.compare_range(date(2029, 2, 28), date(2029, 2, 28), "last_year"), (date(2028, 2, 28), date(2028, 2, 28)))
check("ช่วงเทียบไม่มียอดเลย → เตือนห้ามสรุปว่าโต",
      any("ไม่มียอดขายเลย" in x for x in d.mix_notes(a, b, date(2025, 10, 24), date(2025, 10, 30), 0)), True)

# หาสินค้า: ชื่อเต็มที่ tool ส่งกลับ · รหัสสั้น · ชื่อไทย · id เก่า — แต่ไม่ตัดกลางตัวเลข
SK3 = [{"sku_id": "OP 01", "name": "One Piece OP-01", "franchise": "OP"},
       {"sku_id": "OP 10", "name": "One Piece OP-10", "franchise": "OP"},
       {"sku_id": "YGH UT01", "name": "Yu-Gi-Oh UT01", "franchise": "YGH"},
       {"sku_id": "NRT Jin - 2", "name": "Naruto Jin02", "franchise": "NRT"},
       {"sku_id": "B29", "name": "Dragon Ball B29", "franchise": "DB"},
       {"sku_id": "SLL UA 51", "name": "SOLO Leveling Ua1", "franchise": "SL"},
       {"sku_id": "PKM Ghost", "name": "PKM M5 Abyss Eye", "franchise": "PKM", "is_active": False},
       {"sku_id": "PKM M5 Abyss Eye", "name": "PKM M5 Abyss Eye", "franchise": "PKM"}]
check("ชื่อเต็มจากผลลัพธ์ 'Naruto Jin02' หาเจอ", d.resolve_skus("Naruto Jin02", SK3), ["NRT Jin - 2"])
check("รหัสสั้น 'UT01' หาเจอ", d.resolve_skus("UT01", SK3), ["YGH UT01"])
check("'PKM M5' หาเจอตัวที่ใช้งาน", d.resolve_skus("PKM M5", SK3), ["PKM M5 Abyss Eye"])
check("id เก่า 'PKM Ghost' → id ใหม่", d.resolve_skus("PKM Ghost", SK3), ["PKM M5 Abyss Eye"])
check("ชื่อไทย 'ดราก้อนบอล' = ทั้งค่าย", d.resolve_skus("ดราก้อนบอล", SK3), ["B29"])
check("'Yugioh' ไม่มีขีด = ทั้งค่าย", d.resolve_skus("Yugioh", SK3), ["YGH UT01"])
for q in ("B2", "UA 5", "OP 2"):
    try:
        d.resolve_skus(q, SK3)
        check(f"'{q}' ห้ามเดาเป็นตัวที่เลขยาวกว่า", "ไม่ฟ้อง", "ฟ้อง")
    except d.DvxError:
        check(f"'{q}' ห้ามเดาเป็นตัวที่เลขยาวกว่า", "ฟ้อง", "ฟ้อง")
try:
    d.resolve_skus("01", SK3)
    check("'01' ตรงหลายตัว → ถามกลับพร้อมรายชื่อ", "ไม่ฟ้อง", "ฟ้อง")
except d.DvxError as e:
    check("'01' ตรงหลายตัว → ถามกลับพร้อมรายชื่อ", "ตรงหลายสินค้า" in str(e), True)

# ยอดรวม/รายสาขาบวกจากรายตู้ตามลำดับเดียวกับสรุปยอด — float ต้องเท่ากันเป๊ะ (ไม่ใช่แค่ปัดแล้วเท่า)
import random
rnd = random.Random(7)
many = [{"machine_id": rnd.choice(["m1", "m2", "m3"]), "sku_id": rnd.choice(["AA 01", "BB 01"]),
         "quantity_sold": rnd.choice([1, 2, 3]), "unit": "pack", "grand_total": rnd.choice([170, 190, 230, 250, 1300]),
         "transaction_id": f"x{i}", "sold_at": utc(D_NEW, 10 + i % 10)} for i in range(400)]
per, tot, _ = dg.summarize(many, CLAIMS, BRAND, costs)
pctx = {**ctx, "sku_meta": {}, "bmap": {"m1": ("b1", "B1"), "m2": ("b2", "B2"), "m3": ("b1", "B1")}}
total, groups = d.grouped(many, "branch", pctx, CLAIMS)
check("กำไรรวม float เท่าสรุปยอดเป๊ะ", d._profit(total), tot["profit"])
br = dg.by_branch(per, {"m1": ("b1", "B1"), "m2": ("b2", "B2"), "m3": ("b1", "B1")})
check("กำไรรายสาขา float เท่าสรุปยอดเป๊ะ", {k: d._profit(v) for k, v in groups.items()},
      {k: v["profit"] for k, v in br.items()})
check("แถวสาขาบอกเฉพาะตู้ที่มียอดจริง", sorted(groups["b1"]["machines"]), ["m1", "m3"])
_, only_m1 = d.grouped([r for r in many if r["machine_id"] == "m1"], "branch", pctx)
check("กรองตู้เดียว แถวสาขาไม่อ้างตู้อื่นในสาขา", sorted(only_m1["b1"]["machines"]), ["m1"])

# ── 9. จากรีวิวรอบ 3 ──
# ขายหมดแล้วถอดทีหลัง (swap_out ตอนเหลือ 0) = ช่องว่างตั้งแต่ขายหมด ไม่ใช่มีของจนวันถอด (เคส EB 02 wwv05)
sold_out = run([], [ev("w5", "SO 01", "refill", date(2026, 6, 19), qb=0, qa=12),
                    ev("w5", "SO 01", "swap_out", date(2026, 8, 26), qb=0, qa=0)],
               AUG1, AUG31, history=[{"machine_id": "w5", "sku_id": "SO 01", "sold_at": utc(date(2026, 7, 9), 19),
                                       "quantity_sold": 12, "unit": "pack"}])
check("ขายหมด 9 ก.ค. แล้วถอด 26 ส.ค. → ส.ค. ไม่มีของเลย = empty", sold_out[("w5", "SO 01")]["status"], "empty")
# ลงช่องด้วยจำนวน 0 = ตั้งช่องไว้แต่ไม่มีของ (เคส TF Overdrive 01 wwv07)
zero_in = run([], [ev("w5", "ZI 01", "swap_in", date(2026, 8, 23), qb=0, qa=0),
                   ev("w5", "ZI 01", "swap_out", date(2026, 9, 13), qb=0, qa=0)], AUG1, AUG31)
check("ลงช่องจำนวน 0 แล้วถอด → ไม่มีวันที่มีของ = empty", zero_in[("w5", "ZI 01")]["status"], "empty")
filled_later = run([stock("w5", "ZI 02")], [ev("w5", "ZI 02", "swap_in", date(2026, 10, 1), qb=0, qa=0),
                                           ev("w5", "ZI 02", "refill", date(2026, 10, 20), qb=0, qa=12)], OCT1, OCT29)
check("ลงช่องจำนวน 0 แล้วเติม 20 ต.ค. → มีของ 10 วัน = short",
      (filled_later[("w5", "ZI 02")]["status"], filled_later[("w5", "ZI 02")]["days_with_stock"]), ("short", 10))
# ตู้เปิดกลางช่วง: ของที่ลงตั้งแต่รอบแรก (ไม่มี swap_in) ห้ามนับก่อนตู้เปิด (เคส wwv08 เปิด 21 ก.ค.)
JUL1, JUL31 = date(2026, 7, 1), date(2026, 7, 31)
opened = d.unsold_core([stock("w8", "SEED 01")], [], [], [], {}, JUL1, JUL31, 0, today, now=NOW,
                       machine_start={"w8": datetime(2026, 7, 21, tzinfo=TH)})
check("ตู้เปิด 21 ก.ค. → ก.ค. มีของ 11 วัน = short (ไม่ใช่ขายไม่ออกทั้งเดือน)",
      (opened[0]["status"], opened[0]["days_with_stock"], opened[0]["in_machine_since"]),
      ("short", 11, "ตั้งแต่ตู้เริ่มขาย 2026-07-21"))
# WW หลายช่องของ SKU เดียว ว่างครบทุกช่องตั้งแต่ช่องที่หมดหลังสุด
two = run([stock("w5", "TWO 01", remain=0, slot="030", empty_since="2026-09-01T05:00:00+00:00"),
           stock("w5", "TWO 01", remain=0, slot="031", empty_since="2026-10-20T05:00:00+00:00")], [], OCT1, OCT29)
check("SKU 2 ช่อง ว่างหลังสุด 20 ต.ค. → มีของ 19 วัน", two[("w5", "TWO 01")]["days_with_stock"], 19)
# ยอดรวมใช้ sum() แบบ summarize — Python 3.12 sum() ชดเชยเศษ ต่างจากบวกทีละตัว
bk = []
for _ in range(10):
    x = d._bucket()
    x["profit"] = 0.1
    bk.append(x)
check("ยอดรวมจากรายตู้ = sum() เป๊ะ (ไม่ใช่ += ทีละตัว)", d.sum_buckets(bk)["profit"], sum([0.1] * 10))
# id เก่า + ชื่อซ้ำ → ไม่ซ้ำในผลลัพธ์
SK4 = [{"sku_id": "PKM Ghost", "name": "Pokemon M5 Abyss Eye", "franchise": "PKM", "is_active": False},
       {"sku_id": "PKM M5 Abyss Eye", "name": "Pokemon M5 Abyss Eye", "franchise": "PKM"}]
check("'Abyss' ได้ PKM M5 Abyss Eye ตัวเดียว", d.resolve_skus("Abyss", SK4), ["PKM M5 Abyss Eye"])
check("'Pokemon' ได้ PKM M5 Abyss Eye ตัวเดียว", d.resolve_skus("Pokemon", SK4), ["PKM M5 Abyss Eye"])

# query_unsold ทั้งเส้น ด้วยข้อมูลปลอม (ไม่แตะ DB) — ของที่ลงตู้หลังช่วงที่ถามต้องไม่โผล่ (เคส OP 17 chukes01 ก.ค.)
FAKE = {
    "machines": [{"id": 1, "machine_id": "v1", "name": "ตู้ v1", "location": "ห้าง A", "status": "active",
                  "brand": "vms", "config": {"branch": {"display_name": "ห้าง A"}}}],
    "skus": [{"sku_id": "OLD 01", "packs_per_box": 24}, {"sku_id": "LATE 01", "packs_per_box": 24}],
    "machine_stock": [dict(stock("v1", "OLD 01", slot="001"), synced_at=utc(date(2026, 10, 31), 10)),
                      dict(stock("v1", "LATE 01", slot="002"), synced_at=utc(date(2026, 10, 31), 10))],
    "slot_refill_events": [dict(ev("v1", "LATE 01", "swap_in", date(2026, 8, 25), slot="002"), id=1),
                           dict(ev("v1", "OLD 01", "refill", date(2026, 6, 13), qb=5, qa=12, slot="001"), id=2)],
    "first_sale": [{"sold_at": utc(date(2026, 4, 2), 12)}],
}


def fake_get(path):
    if path.startswith("machines?"):
        return FAKE["machines"]
    if path.startswith("skus?"):
        return FAKE["skus"]
    if path.startswith("machine_stock?"):
        return FAKE["machine_stock"]
    if path.startswith("slot_refill_events?"):
        return FAKE["slot_refill_events"]
    if path.startswith("sales?select=sold_at&machine_id=eq."):
        return FAKE["first_sale"]
    return []                     # ยอดขายในช่วง/ประวัติขาย = ไม่มี


real_get = d.sb_get
d.sb_get = fake_get
try:
    res = d.query_unsold(machine="v1", from_date="2026-07-01", to_date="2026-07-31")
    listed = {i["sku_id"]: i["status"] for m in res["machines"] for i in m["items"]}
    check("ทั้งเส้น: ของที่ลงตู้ 25 ส.ค. ไม่อยู่ในรายการขายไม่ออกเดือน ก.ค.", "LATE 01" in listed, False)
    check("ทั้งเส้น: ของที่อยู่ทั้งเดือน ก.ค. ยังเป็น unsold", listed.get("OLD 01"), "unsold")
    try:
        d.query_unsold(machine="v1", from_date="2026-12-01", to_date="2026-12-05")
        check("from_date อนาคต → ฟ้อง", "ไม่ฟ้อง", "ฟ้อง")
    except d.DvxError:
        check("from_date อนาคต → ฟ้อง", "ฟ้อง", "ฟ้อง")
finally:
    d.sb_get = real_get

# ── 10. จากรีวิวรอบ 4 ──
first_out = run([], [ev("w5", "FO 01", "swap_out", date(2026, 8, 26), qb=0, qa=0)], AUG1, AUG31)
check("เหตุการณ์แรกคือถอดตอนเหลือ 0 + ไม่เคยขาย → empty (เคส OP 06 wwv04/wwv05)",
      (first_out[("w5", "FO 01")]["status"], first_out[("w5", "FO 01")]["days_with_stock"]), ("empty", 0))
first_refill = run([stock("w5", "FR 01")], [ev("w5", "FR 01", "refill", date(2026, 8, 16), qb=0, qa=12)], AUG1, AUG31)
check("เหตุการณ์แรกคือเติมจาก 0 (รอบจัดตู้ใหม่) → ไม่นับว่าว่างก่อนหน้า", first_refill[("w5", "FR 01")]["days_with_stock"], 31)
renamed = run([stock("w5", "RN 01")],
              [ev("w5", "RN 01", "refill", date(2026, 7, 1), qb=0, qa=2, eid=1),
               ev("w5", "RN 01", "swap_out", date(2026, 8, 20), qb=0, qa=0, eid=2),
               ev("w5", "RN 01", "swap_in", date(2026, 8, 20), qb=0, qa=0, eid=3),
               ev("w5", "RN 01", "refill", date(2026, 9, 10), qb=0, qa=12, eid=4)],
              AUG1, AUG31, history=[{"machine_id": "w5", "sku_id": "RN 01", "sold_at": utc(date(2026, 7, 15), 15),
                                     "quantity_sold": 2, "unit": "pack"}])
check("ขายหมดแล้วหลังบ้านเปลี่ยนชื่อในรอบเดียว → ยังนับว่าช่องว่าง (empty)", renamed[("w5", "RN 01")]["status"], "empty")
back = run([stock("v1", "BK 01", slot="005")],
           [ev("v1", "BK 01", "swap_out", date(2026, 9, 1), qb=12, qa=0, slot="005", eid=1),
            ev("v1", "BK 01", "refill", date(2026, 10, 5), qb=0, qa=12, slot="005", eid=2),
            ev("v1", "BK 01", "refill", date(2026, 10, 20), qb=6, qa=12, slot="005", eid=3)], OCT1, OCT29)
check("ถอดแล้วกลับมามีการเติมโดยไม่มี swap_in → อยู่ในตู้ตั้งแต่เติมครั้งแรก (25 วัน)",
      back[("v1", "BK 01")]["days_with_stock"], 25)
# รอบรีเซ็ตหลังบ้าน WW: เลขก่อนเติมเป็น 0 ทั้งที่ขายไปแค่ 1 ซองจาก 12 → ไม่ใช่ขายหมด (เคส wwv04 OP 01 ส.ค.)
reset = run([], [ev("w5", "RS 01", "refill", date(2026, 6, 14), qb=11, qa=12, eid=1),
                 ev("w5", "RS 01", "refill", date(2026, 8, 15), qb=0, qa=12, eid=2),
                 ev("w5", "RS 01", "swap_out", date(2026, 8, 25), qb=12, qa=0, eid=3)],
            AUG1, AUG31, history=[{"machine_id": "w5", "sku_id": "RS 01", "sold_at": utc(date(2026, 7, 21), 17),
                                   "quantity_sold": 1, "unit": "pack"}])
check("รอบรีเซ็ต (0 ก่อนเติม แต่ขายไปแค่ 1 จาก 12) → ไม่นับว่าว่าง = unsold 24 วัน",
      (reset[("w5", "RS 01")]["status"], reset[("w5", "RS 01")]["days_with_stock"]), ("unsold", 24))
fut_notes = d.mix_notes(date(2026, 10, 30), date(2026, 10, 30), date(2026, 10, 31), date(2026, 10, 31), 0, today)
check("ช่วงเทียบเป็นวันนี้/อนาคต → เตือน ไม่บอกว่าก่อนเริ่มมีข้อมูล",
      (any("รวมวันนี้" in x for x in fut_notes), any("ก่อนเริ่มมีข้อมูล" in x for x in fut_notes)), (True, False))

# ── 11. จากรีวิวรอบ 6 ──
# ยอดขายหลังเติมของ (หลังรอบที่อ่านเลข 0) ไม่ใช่ตัวทำให้หมด — ช่วงว่างต้องเริ่มจากยอดที่ขายจนหมดจริง
post = run([stock("v1", "PR 01", slot="050")],
           [ev("v1", "PR 01", "refill", date(2026, 7, 20), qb=0, qa=12, slot="050", eid=1),
            dict(ev("v1", "PR 01", "refill", date(2026, 9, 10), qb=0, qa=12, slot="050", eid=2),
                 synced_at=utc(date(2026, 9, 10), 15), prev_synced_at=utc(date(2026, 9, 10), 1))],
           AUG1, AUG31,
           history=[{"machine_id": "v1", "sku_id": "PR 01", "slot_number": "050", "quantity_sold": 12,
                     "unit": "pack", "sold_at": utc(date(2026, 7, 24), 16)},
                    {"machine_id": "v1", "sku_id": "PR 01", "slot_number": "050", "quantity_sold": 1,
                     "unit": "pack", "sold_at": utc(date(2026, 9, 10), 13)}])
check("ขายหมด 24 ก.ค. · เติม 10 ก.ย. แล้วขายได้ 1 ซองก่อนซิงค์ → ส.ค. ยังว่างทั้งเดือน = empty",
      post[("v1", "PR 01")]["status"], "empty")
# หาตู้: 'ตู้ที่ 1' ไม่ไปโดนตู้ที่ 10–13
M2 = MACHINES + [{"id": 10, "machine_id": "x10", "name": "ตู้ที่ 10 (x10) · ห้าง X", "location": "ห้าง X",
                  "status": "active", "config": {"branch": {"display_name": "ห้าง X"}}}]
check("'ตู้ที่ 1' = ตู้ที่ 1 ตัวเดียว (ไม่ตัดกลางตัวเลข)", d.resolve_machines("ตู้ที่ 1", M2), ["v1"])
check("'พระราม 2' ยังได้ทั้งสาขา", d.resolve_machines("พระราม 2", M2), ["v2", "w6"])
# ทั้งค่าย/ขึ้นต้น ต้องรวมตัวที่เลิกขายแล้ว (ยอดย้อนหลังยังนับ)
SK5 = [{"sku_id": "OP 01", "name": "One Piece OP-01", "franchise": "OP"},
       {"sku_id": "OP 05", "name": "One Piece OP-05", "franchise": "OP", "is_active": False}]
check("ทั้งค่ายรวมตัวที่เลิกขายแล้ว", d.resolve_skus("One Piece", SK5), ["OP 01", "OP 05"])
check("ขึ้นต้น 'OP' รวมตัวที่เลิกขายแล้ว", sorted(d.resolve_skus("OP", SK5)), ["OP 01", "OP 05"])

# ── 12. ต้นทุนรายสินค้า (เจ้าของอนุญาตให้แอดมินรู้ 31 ต.ค.) — ทุนแต่งขึ้นทั้งหมด ──
CR = d.cost_rows(SKUS, costs, ["AA 01", "BB 01", "CC 01"], D_NEW)
crow = {r["sku_id"]: r for r in CR}
check("ทุนใหม่ตั้งแต่ 1 ส.ค. + ทุนก่อนหน้า",
      (crow["AA 01"]["cost_per_pack"], crow["AA 01"]["effective_from"], crow["AA 01"]["previous_cost_per_pack"]),
      (80.0, "2026-08-01", 100.0))
check("ทุนต่อกล่อง = ทุนต่อซอง × ซองต่อกล่อง", crow["AA 01"]["cost_per_box"], 80.0 * 24)
check("ไม่มีประวัติ → ใช้ค่าในตารางสินค้า", (crow["BB 01"]["cost_per_pack"], crow["BB 01"]["effective_from"]),
      (50.0, "ค่าในตารางสินค้า"))
check("ไม่มีทุน → บอกว่าไม่นับในกำไร", (crow["CC 01"]["cost_per_pack"], crow["CC 01"]["note"] is not None), (None, True))
old_row = d.cost_rows(SKUS, costs, ["AA 01"], D_OLD)[0]
check("ก่อน 1 ส.ค. = ทุนเดิม", (old_row["cost_per_pack"], old_row["effective_from"].startswith("ทุนเดิม")), (100.0, True))

print("\n" + ("✅ ผ่านทั้งหมด" if not fails else f"❌ ไม่ผ่าน {fails} ข้อ"))
sys.exit(1 if fails else 0)
