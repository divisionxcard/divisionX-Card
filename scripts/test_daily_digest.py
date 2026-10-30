"""ทดสอบสรุปยอดรายวัน/รายสัปดาห์ — ตัวจับเวลาในบอท + ตัวคิดกำไร/ต้นทุนตามวันที่ (ฟังก์ชันล้วน ไม่ยิงเน็ต ไม่แตะ DB)

⚠️ ตัวเลขต้นทุนในไฟล์นี้**แต่งขึ้นทั้งหมด** — repo สาธารณะ ห้ามใส่ทุนจริง

รัน:  .venv-image\\Scripts\\python.exe scripts\\test_daily_digest.py
"""
import importlib.util
import pathlib
import sys
from datetime import date, datetime

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bot", HERE / "telegram_sync_bot.py")
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)   # ต้องมี SYNC_BOT_TOKEN ใน deploy/.env.local (ตัวบอทเช็คตอนโหลด)

sys.path.insert(0, str(HERE.parent / "deploy" / "agents"))
spec2 = importlib.util.spec_from_file_location("dg", HERE.parent / "deploy" / "agents" / "daily_sales_digest.py")
dg = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(dg)

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — ได้ {got!r} ต้องการ {want!r}"))


# ── ตัวจับเวลารายวัน ──
early = datetime(2026, 10, 31, 7, 44)
at = datetime(2026, 10, 31, 7, 45)
late = datetime(2026, 10, 31, 13, 5)
check("ก่อน 07:45 ยังไม่ถึงเวลา", bot.digest_due(early, {}), False)
check("07:45 พอดี ถึงเวลา", bot.digest_due(at, {}), True)
check("เปิดเครื่องสาย 13:05 ยังไม่ได้ส่ง → ส่งชดเชย", bot.digest_due(late, {}), True)
check("วันนี้ส่งแล้ว → ไม่ส่งซ้ำ", bot.digest_due(late, {"digest_done_date": "2026-10-31"}), False)
check("ส่งล่าสุดเมื่อวาน → วันนี้ต้องส่ง", bot.digest_due(late, {"digest_done_date": "2026-10-30"}), True)
check("ปิดไว้ → ไม่ส่ง", bot.digest_due(late, {"digest_enabled": False}), False)
check("ยังไม่ถึงเวลาลองใหม่ → รอ", bot.digest_due(late, {"digest_retry_at": late.timestamp() + 600}), False)
check("เลยเวลาลองใหม่แล้ว → ลอง", bot.digest_due(late, {"digest_retry_at": late.timestamp() - 1}), True)
check("สถานะซิงค์/ไอเดียไม่ปนกับสรุป",
      bot.digest_due(late, {"auto_done_date": "2026-10-31", "ideas_done_date": "2026-10-31"}), True)
check("07:45 รอถึง 08:00 = 15 นาที", bot.digest_wait_sec(at), 900.0)
check("เลย 08:00 แล้ว ไม่ต้องรอ", bot.digest_wait_sec(late), 0.0)
check("รอบที่เริ่ม 23:58 สรุปเมื่อวานของวันที่เริ่ม (ไม่ใช่วันถัดไป)",
      bot.digest_period_arg("daily", datetime(2026, 10, 31, 23, 58)), "2026-10-30")

# ── ตัวจับเวลารายสัปดาห์ (2 พ.ย. 2026 = วันจันทร์) ──
mon_early = datetime(2026, 11, 2, 7, 44)
mon_at = datetime(2026, 11, 2, 7, 45)
tue_night = datetime(2026, 11, 3, 1, 0)
wed = datetime(2026, 11, 4, 9, 0)
fri = datetime(2026, 10, 30, 13, 0)
check("เป้าหมาย = จันทร์ที่แล้ว (26 ต.ค.)", bot.weekly_target(mon_at), date(2026, 10, 26))
check("เป้าหมายวันพุธยังเป็นสัปดาห์เดียวกัน", bot.weekly_target(wed), date(2026, 10, 26))
check("--date รายสัปดาห์ = จันทร์ของสัปดาห์เป้าหมาย", bot.digest_period_arg("weekly", wed), "2026-10-26")
check("จันทร์ก่อน 07:45 ยังไม่ถึง", bot.weekly_due(mon_early, {}), False)
check("จันทร์ 07:45 ถึงคิว", bot.weekly_due(mon_at, {}), True)
check("ส่งแล้วสัปดาห์นี้ → ไม่ซ้ำ", bot.weekly_due(mon_at, {"weekly_done_for": "2026-10-26"}), False)
check("เปิดเครื่องตีหนึ่งวันอังคาร → รอ 07:45 (ไม่เริ่มแล้วนอนถือล็อก)", bot.weekly_due(tue_night, {}), False)
check("เครื่องปิดวันจันทร์ → พุธยังชดเชย", bot.weekly_due(wed, {"weekly_done_for": "2026-10-19"}), True)
check("รีสตาร์ตบอทวันศุกร์ → ไม่โผล่สรุปสัปดาห์กลางสัปดาห์", bot.weekly_due(fri, {}), False)
check("ปิดสรุปไว้ → ไม่ส่งรายสัปดาห์", bot.weekly_due(mon_at, {"digest_enabled": False}), False)
check("รายสัปดาห์รอลองใหม่ → รอ", bot.weekly_due(mon_at, {"weekly_retry_at": mon_at.timestamp() + 60}), False)
check("ทำแล้วของรายวัน ≠ ทำแล้วของรายสัปดาห์",
      bot.weekly_due(mon_at, {"digest_done_date": "2026-11-02"}), True)

# ── ช่วงเวลาที่สรุป ──
today = date(2026, 11, 2)                                   # จันทร์
check("รายวัน = เมื่อวาน เทียบวันเดียวกันสัปดาห์ก่อน", dg.period_of(today),
      (date(2026, 11, 1), date(2026, 11, 1), date(2026, 10, 25), date(2026, 10, 25)))
check("รายสัปดาห์ = จันทร์–อาทิตย์ที่แล้ว เทียบสัปดาห์ก่อนหน้า", dg.period_of(today, week=True),
      (date(2026, 10, 26), date(2026, 11, 1), date(2026, 10, 19), date(2026, 10, 25)))
check("รายสัปดาห์ระบุวันกลางสัปดาห์ → ทั้งสัปดาห์นั้น", dg.period_of(today, True, date(2026, 10, 22))[:2],
      (date(2026, 10, 19), date(2026, 10, 25)))
check("sold_at UTC 17:30 = วันถัดไปของไทย", dg.thai_day("2026-10-28T17:30:00+00:00"), date(2026, 10, 29))
check("ช่วง UTC ของวันไทย", dg.utc_window(date(2026, 10, 29), date(2026, 10, 29)),
      ("2026-10-28T17:00:00Z", "2026-10-29T17:00:00Z"))

# ── ต้นทุนตามวันที่ขาย (ตัวเลขแต่ง) ──
skus = [{"sku_id": "A", "avg_cost": 100.5, "cost_price": 101},
        {"sku_id": "Z", "avg_cost": 0, "cost_price": 0},
        {"sku_id": "NEW", "avg_cost": 0, "cost_price": 99},
        {"sku_id": "OLD", "avg_cost": 300, "cost_price": 280}]
hist = [{"sku_id": "A", "cost_per_pack": 100.5, "effective_from": "2000-01-01"},
        {"sku_id": "A", "cost_per_pack": 110, "effective_from": "2026-08-01"},
        {"sku_id": "Z", "cost_per_pack": 0, "effective_from": "2000-01-01"},
        {"sku_id": "Z", "cost_per_pack": 150, "effective_from": "2026-08-01"},
        {"sku_id": "OLD", "cost_per_pack": 300, "effective_from": "2000-01-01"}]
c = dg.Costs(skus, hist)
check("ก่อนวันตัด = ทุนเดิม", c.on("A", date(2026, 7, 31)), 100.5)
check("วันตัดพอดี = ทุนใหม่", c.on("A", date(2026, 8, 1)), 110.0)
check("ก่อนวันตัด (เดิมทุน 0) = ไม่รู้ทุน", c.on("Z", date(2026, 7, 1)), None)
check("หลังวันตัด = ทุนใหม่", c.on("Z", date(2026, 10, 29)), 150.0)
check("ไม่มีในชีต = ทุนเดิมต่อไป", c.on("OLD", date(2026, 10, 29)), 300.0)
check("SKU ใหม่ที่ยังไม่มีประวัติ = ใช้ cost_price", c.on("NEW", date(2026, 10, 29)), 99.0)
check("SKU ที่ไม่รู้จักเลย = ไม่รู้ทุน", c.on("??", date(2026, 10, 29)), None)
cl = dg.Costs([{"sku_id": "LATE", "avg_cost": 0, "cost_price": 70}], [{"sku_id": "LATE", "cost_per_pack": 80, "effective_from": "2026-08-01"}])
check("มีแค่แถวทุนใหม่ → ก่อนวันมีผลใช้ทุนใน skus", cl.on("LATE", date(2026, 7, 1)), 70.0)
check("มีแค่แถวทุนใหม่ → หลังวันมีผลใช้ทุนใหม่", cl.on("LATE", date(2026, 9, 1)), 80.0)

# ── กล่อง = ทุนต่อซอง × ซองต่อกล่อง ──
cb = dg.Costs([{"sku_id": "BX", "avg_cost": 0, "cost_price": 90, "packs_per_box": 24},
               {"sku_id": "B10", "avg_cost": 0, "cost_price": 200, "packs_per_box": 10}], [])
check("กล่องที่เก็บเป็นซองแล้ว (24) ไม่คูณซ้ำ", cb.packs({"sku_id": "BX", "unit": "box", "quantity_sold": 24}), 24)
check("กล่องที่เก็บเป็น 1 กล่อง → 24 ซอง", cb.packs({"sku_id": "BX", "unit": "box", "quantity_sold": 1}), 24)
check("กล่อง 10 ซอง เก็บเป็น 10 → 10", cb.packs({"sku_id": "B10", "unit": "box", "quantity_sold": 10}), 10)
check("ซองเดี่ยวไม่แตะ", cb.packs({"sku_id": "BX", "unit": "pack", "quantity_sold": 3}), 3)
_, tb, _ = dg.summarize([{"machine_id": "m", "sku_id": "BX", "unit": "box", "quantity_sold": 24, "grand_total": 3000,
                          "transaction_id": "x", "sold_at": "2026-10-29T05:00:00+00:00"}], [], {"m": "worldwide"}, cb)
check("กำไรกล่อง = ยอด − 0.5% − ทุนต่อซอง×24", round(tb["profit"], 2), round(3000 - 15 - 90 * 24, 2))

# ── คิดกำไร ──
T = "2026-10-29T05:00:00+00:00"
sales = [
    {"machine_id": "m1", "sku_id": "A", "quantity_sold": 2, "grand_total": 400, "transaction_id": "t1", "sold_at": T},
    {"machine_id": "m1", "sku_id": "Z", "quantity_sold": 1, "grand_total": 200, "transaction_id": "t1", "sold_at": T},
    {"machine_id": "m2", "sku_id": "??", "quantity_sold": 1, "grand_total": 100, "transaction_id": "t2", "sold_at": T},
]
claims = [{"machine_id": "m1", "refund_amount": 50}]
per, tot, unknown = dg.summarize(sales, claims, {"m1": "vms", "m2": "worldwide"}, c)
# m1: 400 − 6 − 2×110 = 174 · 200 − 3 − 150 = 47 · − เคลม 50 = 171
check("กำไร m1 = ยอด − Ksher 1.5% − ทุน − เคลม", round(per["m1"]["profit"], 3), 171.0)
check("ยอด m1 รวมทุกแถว", per["m1"]["rev"], 600.0)
check("m2 ไม่รู้ทุน → กำไร 0 แต่ยอดยังนับ", (per["m2"]["rev"], per["m2"]["profit"], per["m2"]["unknown_rev"]), (100.0, 0.0, 100.0))
check("สินค้าไม่รู้ทุนถูกแยกเตือน", unknown, {"??": 100.0})
check("บิลนับตาม transaction ไม่ซ้ำ", tot["bills"], 2)
check("ยอดที่รู้ทุน (ฐานคิด %กำไร)", tot["known_rev"], 600.0)
cross = [{"machine_id": "m1", "sku_id": "A", "quantity_sold": 1, "grand_total": 200, "sold_at": "2026-07-31T05:00:00+00:00"},
         {"machine_id": "m1", "sku_id": "A", "quantity_sold": 1, "grand_total": 200, "sold_at": "2026-08-01T05:00:00+00:00"}]
_, tc, _ = dg.summarize(cross, [], {"m1": "vms"}, c)
check("คร่อมวันตัด: ทุนเดิม + ทุนใหม่ แยกตามวันที่ขาย", round(tc["profit"], 2), round(400 - 6 - 100.5 - 110, 2))

# ── สาขา (ตู้ห้างเดียวกันรวมกัน) ──
machines = [{"machine_id": "m1", "location": "สาขา <A>"}, {"machine_id": "m2", "location": "เซ็นทรัลพระราม2"},
            {"machine_id": "m3", "location": "เซ็นทรัล พระราม 2"}, {"machine_id": "m4", "location": "สาขา C"}]
bmap = dg.branch_map(machines)
check("ห้างเดียวกันสะกดเว้นวรรคต่างกัน = สาขาเดียว", bmap["m2"][0] == bmap["m3"][0], True)
check("ชื่อสาขาเลือกแบบมีเว้นวรรค", bmap["m2"][1], "เซ็นทรัล พระราม 2")
b2 = dg.by_branch({"m2": {**dg._blank(), "rev": 300.0, "profit": 50.0}, "m3": {**dg._blank(), "rev": 200.0, "profit": 40.0}}, bmap)
check("รวมยอด/กำไรสองตู้", (b2[bmap["m2"][0]]["rev"], b2[bmap["m2"][0]]["profit"]), (500.0, 90.0))

check("ลูกศร: ช่วงก่อน 0 = ของใหม่", dg.arrow(100, 0), "🆕")
check("ลูกศร: ช่วงก่อนขาดทุน = เทียบ % ไม่ได้", dg.arrow(100, -50), "—")
check("ลูกศร: ขึ้น", dg.arrow(120, 100), "▲20%")

# ── สินค้าขายดี / ยอดลดลง (เทียบวันก่อนหน้า) ──
cur_s = [{"sku_id": "A", "grand_total": 900}, {"sku_id": "B", "grand_total": 300}, {"sku_id": "C", "grand_total": 50}]
prev_s = [{"sku_id": "A", "grand_total": 600}, {"sku_id": "B", "grand_total": 1000}, {"sku_id": "C", "grand_total": 80},
          {"sku_id": "D", "grand_total": 400}]
top, down = dg.sku_movers(cur_s, prev_s)
check("ขายดีเรียงตามยอดเงิน พร้อมยอดช่วงเทียบ", top, [("A", 900.0, 600.0), ("B", 300.0, 1000.0), ("C", 50.0, 80.0)])
check("ยอดลดลงเรียงตามบาทที่หาย (รวมตัวที่วันนี้ขายไม่ได้)", [k for k, _, _ in down], ["B", "D", "C"])
check("ตัวที่ยอดขึ้นไม่อยู่ในยอดลดลง", "A" in [k for k, _, _ in down], False)
mv = (top, down, "พ. 28 ต.ค.")
day = date(2026, 10, 29)
per2 = {"m1": per["m1"], "m2": per["m2"], "m4": {**dg._blank(), "refund": 30.0, "profit": -30.0}}
msg = dg.build_message(day, day, per2, tot, unknown, {"m1": {**dg._blank(), "rev": 1000.0}, "m3": {**dg._blank(), "rev": 5000.0}},
                       {"rev": 1000, "profit": 200}, mv, bmap, ["m1", "m2", "m3", "m4"], "🔄 ทดสอบ")
check("หัวข้อรายวันมีวันในสัปดาห์", "สรุปยอดขายประจำวัน" in msg and "พฤหัสบดี 29 ต.ค. 2026" in msg, True)
check("เทียบวันเดียวกันสัปดาห์ก่อน", "จากพฤ. ก่อน" in msg, True)
check("ชื่อสาขาถูก escape HTML", "สาขา &lt;A&gt;" in msg, True)
check("สาขา 2 ตู้บอกจำนวนตู้", "เซ็นทรัล พระราม 2 (2 ตู้)" in msg, True)
check("สาขาที่มีสินค้าไม่รู้ทุนติด *", "กำไร 0*" in msg, True)
check("สาขาที่มีแต่เคลมขึ้นบรรทัดเดียว (ไม่ซ้ำกับ 'ไม่มียอด')", msg.count("สาขา C"), 1)
check("ตกจากฐาน ≥1,000 → เตือน", "สาขา &lt;A&gt; ▼40%" in msg, True)
check("เตือนสินค้าไม่มีทุน", "ยังไม่มีต้นทุนในระบบ" in msg, True)
check("แนบโน้ตจากบอท", "🔄 ทดสอบ" in msg, True)
check("บรรทัดขายดีมี % เทียบวันก่อนหน้า", "🔥 <b>ขายดี</b> (เทียบ พ. 28 ต.ค.): A 900 (▲50%)" in msg, True)
check("บรรทัดยอดลดลง", "📉 <b>ยอดลดลง</b> (เทียบ พ. 28 ต.ค.): B 300 (▼70%) · D 0 (▼100%)" in msg, True)
check("ยาวไม่เกินขีดจำกัด Telegram", len(msg) <= 4096, True)
small = dg.build_message(day, day, {"m1": {**dg._blank(), "rev": 100.0}}, {**tot, "rev": 100.0}, {}, {"m1": {**dg._blank(), "rev": 500.0}},
                         {"rev": 500, "profit": 0}, None, bmap, ["m1"], "")
check("ตกจากฐานต่ำกว่า 1,000 → ไม่เตือน (รายวันแกว่งแรง)", "ยอดตก" in small, False)
wk = dg.build_message(date(2026, 10, 26), date(2026, 11, 1), per, tot, unknown, {}, {"rev": 0, "profit": 0},
                      ([], [], "สัปดาห์ก่อน"), bmap, ["m1"], "")
check("หัวข้อรายสัปดาห์ + ช่วงจันทร์–อาทิตย์", "สรุปยอดขายรายสัปดาห์" in wk and "จ. 26 ต.ค. – อา. 1 พ.ย. 2026" in wk, True)
check("รายสัปดาห์มีเฉลี่ย/วัน", "เฉลี่ย/วัน" in wk, True)
check("รายสัปดาห์เทียบสัปดาห์ก่อน", "จากสัปดาห์ก่อน" in wk, True)
long = dg.fit(["<b>บรรทัด</b> " + "ก" * 90] * 200)
check("ตัดข้อความที่ขอบบรรทัด ไม่เกินเพดาน", len(long) <= 4096 and long.endswith("…(ตัดเพราะยาวเกิน)"), True)
check("ตัดแล้วแท็ก HTML ครบคู่", long.count("<b>") == long.count("</b>"), True)
btn = dg.web_button()["inline_keyboard"][0][0]
check("ปุ่มเปิดหน้ายอดขายบนเว็บ", (btn["text"], btn["url"].endswith("/?page=sales"), btn["url"].startswith("https://")),
      ("📊 ดูยอดขายบนหน้าเว็บ", True, True))

print(f"\n{'ผ่านทั้งหมด' if not fails else f'ตก {fails} ข้อ'}")
sys.exit(1 if fails else 0)
