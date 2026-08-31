#!/usr/bin/env python3
"""ย้อนแก้การแบ่งเงินของบิล VMS ที่เคยถูก "หารเฉลี่ย" ให้เป็นการแบ่งตามราคาจริง

ที่มา
─────
VMS schema ใหม่ (rebuild 28 เม.ย. 2026) ส่งมาแค่ยอดรวมของบิล ไม่ส่งราคารายชิ้น
vms_sales_api.py จึงหาร total_price เท่า ๆ กันทุกบรรทัด → เงินไปนั่งผิด SKU
ยอดรวมต่อบิล/ต่อวัน/ต่อตู้ถูกหมด แต่ยอดรายตัว SKU ผิดตั้งแต่ พ.ค. 2026
(แก้ที่ต้นทางแล้วในคอมมิท 8544ebe · ตัวนี้ล้างของที่ค้างอยู่ใน DB)

⚠️ ทำไม sync ซ้ำแล้วไม่หาย: ตัวบันทึกยอดขายตั้ง ignore_duplicates=True โดยตั้งใจ
   (กันเขียนทับชื่อสินค้าของประวัติเก่า) แถวที่มีอยู่แล้วจึงไม่เคยถูกแตะอีกเลย
   ต้อง UPDATE ตรง ๆ เท่านั้น

ราคาที่เอามาถ่วงน้ำหนัก — ไล่ตามลำดับความน่าเชื่อถือ
──────────────────────────────────────────────────
  1. บิลที่ซื้อชิ้นเดียวของช่องนั้น ที่ใกล้วันนั้นที่สุด  ← ราคาจริง ณ เวลานั้น 100%
     (บิลชิ้นเดียวไม่เคยผ่านการหาร จึงเป็นราคาที่ลูกค้าจ่ายจริง)
  2. machine_stock.sell_price ของช่องนั้น (ราคาวันนี้ · migration 071)
  3. skus.sell_price (ราคากลาง · ช่องกล่องคูณ packs_per_box กลับ)
  ไม่มีสักทาง → ข้ามบิลนั้น ไม่แตะเลย

⚠️ ยอดบิลจริงกู้มาจากการบวกบรรทัดใน DB ซึ่งเพี้ยนได้ ±0.01 จากการปัดของเดิม
   (590 ถูกเก็บเป็น 196.67×3 = 590.01) · ยอดบิล VMS เป็นจำนวนเต็มบาทเสมอ
   ตรวจแล้ว: บิลชิ้นเดียว 880/880 ใบลงท้าย .00 → ปัดกลับได้อย่างปลอดภัย
   ปัดเฉพาะเมื่อห่างไม่เกิน 0.05 บาท · ห่างกว่านั้นถือว่าผิดปกติ ไม่แตะ

รัน
───
    py scripts/backfill_vms_bill_split.py --from 2026-08-01 --to 2026-08-31
    py scripts/backfill_vms_bill_split.py --from 2026-08-01 --to 2026-08-31 --apply
"""
import argparse
import collections
import json
import os
import pathlib
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
sys.stdout.reconfigure(encoding="utf-8")

from envload import load_env_local  # noqa: E402
load_env_local()
os.environ.setdefault("VMS_USERNAME", "-")
os.environ.setdefault("VMS_PASSWORD", "-")
from vms_sales_api import allocate  # noqa: E402  — ฟังก์ชันตัวเดียวกับที่ใช้ตอน sync จริง

URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
HDR = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
VMS_MACHINES = ["chukes01", "chukes02", "chukes03", "chukes04"]
SNAP_MAX = 0.05          # ยอดบิลห่างจากจำนวนเต็มเกินนี้ = ผิดปกติ ไม่แตะ


def sb(path):
    rows, off = [], 0
    while True:
        req = urllib.request.Request(f"{URL}/rest/v1/{path}&limit=1000&offset={off}", headers=HDR)
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.loads(r.read())
        rows += page
        if len(page) < 1000:
            return rows
        off += 1000


def patch(row_id, value):
    req = urllib.request.Request(
        f"{URL}/rest/v1/sales?id=eq.{row_id}", method="PATCH",
        headers={**HDR, "Content-Type": "application/json", "Prefer": "return=minimal"},
        data=json.dumps({"grand_total": value}).encode())
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def is_box(name):
    return "box" in (name or "").lower()


def main():
    ap = argparse.ArgumentParser(description="ย้อนแก้การแบ่งเงินบิล VMS")
    ap.add_argument("--from", dest="d_from", required=True, help="วันที่เริ่ม (เวลาไทย) YYYY-MM-DD")
    ap.add_argument("--to", dest="d_to", required=True, help="วันที่จบ (เวลาไทย · รวมวันนี้ด้วย)")
    ap.add_argument("--apply", action="store_true", help="เขียนจริง (ไม่ใส่ = พรีวิวอย่างเดียว)")
    args = ap.parse_args()

    # เวลาไทย → UTC (ไทย = UTC+7)
    lo = (datetime.fromisoformat(args.d_from) - timedelta(hours=7)).isoformat()
    hi = (datetime.fromisoformat(args.d_to) + timedelta(days=1) - timedelta(hours=7)).isoformat()

    print(f"ช่วงที่ทำ: {args.d_from} → {args.d_to} (เวลาไทย)"
          + ("" if args.apply else "  · พรีวิวอย่างเดียว ยังไม่เขียน"))

    rows = sb(f"sales?select=id,transaction_id,machine_id,sku_id,slot_number,product_name_raw,"
              f"quantity_sold,grand_total,sold_at&machine_id=in.({','.join(VMS_MACHINES)})"
              f"&sold_at=gte.{urllib.parse.quote(lo)}&sold_at=lt.{urllib.parse.quote(hi)}&order=sold_at")
    print(f"ยอดขาย VMS ในช่วงนี้ {len(rows)} แถว")
    if not rows:
        return

    by_txn = collections.defaultdict(list)
    for r in rows:
        by_txn[r["transaction_id"]].append(r)

    # ── ราคา ชั้นที่ 1: จากบิลที่ซื้อชิ้นเดียว (ราคาจริง ณ เวลานั้น) ──
    observed = collections.defaultdict(list)      # (machine, slot) → [(เวลา, ราคา)]
    for items in by_txn.values():
        if len(items) != 1:
            continue
        i = items[0]
        key = (i["machine_id"], i["slot_number"] or "")
        if key[1] and i["grand_total"]:
            observed[key].append((i["sold_at"], float(i["grand_total"])))
    for v in observed.values():
        v.sort()
    print(f"ราคาอ้างอิงจากบิลชิ้นเดียว: {len(observed)} ช่อง")

    # ── ราคา ชั้นที่ 2/3 ──
    slot_now = {}
    for r in sb("machine_stock?select=machine_id,slot_number,sell_price&limit=1000"):
        if r.get("sell_price"):
            slot_now[(r["machine_id"], r["slot_number"])] = float(r["sell_price"])
    sku_price, packs = {}, {}
    for s in sb("skus?select=sku_id,sell_price,packs_per_box&limit=300"):
        if s.get("sell_price"):
            sku_price[s["sku_id"]] = float(s["sell_price"])
        packs[s["sku_id"]] = s.get("packs_per_box") or 24

    src_count = collections.Counter()

    def price_of(item):
        key = (item["machine_id"], item["slot_number"] or "")
        seen = observed.get(key)
        if seen:
            # อันที่ใกล้เวลาบิลนี้ที่สุด — ราคาเปลี่ยนกลางเดือนก็ยังตามทัน
            best = min(seen, key=lambda x: abs(
                (datetime.fromisoformat(x[0].replace("Z", "+00:00"))
                 - datetime.fromisoformat(item["sold_at"].replace("Z", "+00:00"))).total_seconds()))
            src_count["บิลชิ้นเดียว"] += 1
            return best[1]
        if key in slot_now:
            src_count["ราคาช่องวันนี้"] += 1
            return slot_now[key]
        p = sku_price.get(item["sku_id"])
        if p:
            src_count["ราคากลาง skus"] += 1
            return p * packs.get(item["sku_id"], 24) if is_box(item["product_name_raw"]) else p
        src_count["ไม่มีราคา"] += 1
        return None

    updates, skipped_bills, snapped = [], 0, 0
    before_day = collections.Counter()
    after_day = collections.Counter()

    for txn, items in by_txn.items():
        day = items[0]["sold_at"][:10]
        for i in items:
            before_day[(day, i["machine_id"])] += i["grand_total"] or 0
        if len({i["sku_id"] for i in items}) < 2:
            for i in items:
                after_day[(day, i["machine_id"])] += i["grand_total"] or 0
            continue

        total = round(sum(i["grand_total"] or 0 for i in items), 2)
        if abs(total - round(total)) <= SNAP_MAX:
            if total != round(total):
                snapped += 1
            total = float(round(total))
        weights = [price_of(i) for i in items]
        if not all(weights):
            skipped_bills += 1
            for i in items:
                after_day[(day, i["machine_id"])] += i["grand_total"] or 0
            continue
        for i, amt in zip(items, allocate(total, weights)):
            after_day[(day, i["machine_id"])] += amt
            if abs(amt - (i["grand_total"] or 0)) >= 0.01:
                updates.append((i, amt))

    print(f"\nบิลทั้งหมด {len(by_txn)} · ข้ามเพราะไม่รู้ราคา {skipped_bills} · "
          f"ปัดยอดบิลกลับเป็นจำนวนเต็ม {snapped} ใบ")
    print("ที่มาของราคาที่ใช้: " + " · ".join(f"{k} {v}" for k, v in src_count.most_common()))
    print(f"แถวที่ยอดจะเปลี่ยน {len(updates)} จาก {len(rows)} แถว")

    # ── ด่านความปลอดภัย: ยอดรวมรายวันต่อตู้ต้องไม่ขยับ ──
    bad_days = []
    for k in set(before_day) | set(after_day):
        if abs(before_day[k] - after_day[k]) > 0.02:
            bad_days.append((k, before_day[k], after_day[k]))
    if bad_days:
        print(f"\n❌ ยอดรวมรายวันเปลี่ยน {len(bad_days)} วัน — หยุด ไม่เขียนอะไรทั้งนั้น")
        for k, b, a in bad_days[:10]:
            print(f"    {k[0]} {k[1]}  {b:.2f} → {a:.2f}  ({a-b:+.2f})")
        sys.exit(1)
    print(f"✅ ยอดรวมรายวันต่อตู้ไม่ขยับสักบาท ({len(before_day)} วัน-ตู้)")

    delta = collections.Counter()
    for i, amt in updates:
        delta[i["sku_id"]] += amt - (i["grand_total"] or 0)
    print(f"\n{'SKU':<20}{'เปลี่ยนไป (บาท)':>18}")
    for k, v in sorted(delta.items(), key=lambda x: -abs(x[1])):
        if abs(v) >= 1:
            print(f"   {k:<20}{v:>+14.2f}")
    print(f"   {'ผลรวม':<20}{sum(delta.values()):>+14.2f}  (ต้องเป็น 0)")

    if not args.apply:
        print("\n── พรีวิวเท่านั้น · ใส่ --apply เพื่อเขียนจริง ──")
        return

    print(f"\n💾 กำลังเขียน {len(updates)} แถว...")
    done = fail = 0
    for i, amt in updates:
        try:
            patch(i["id"], amt)
            done += 1
        except Exception as e:
            fail += 1
            print(f"    ✗ id={i['id']}: {str(e)[:90]}")
        if done % 100 == 0 and done:
            print(f"    ... {done}/{len(updates)}")
    print(f"🎉 แก้แล้ว {done} แถว" + (f" · ล้มเหลว {fail}" if fail else ""))


if __name__ == "__main__":
    main()
