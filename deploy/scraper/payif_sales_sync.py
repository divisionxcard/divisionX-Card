"""
DivisionX Card — Payif Machine Sales Sync
ยี่ห้อตู้ = Payif · จัดการผ่าน Vendos control center API (JSON REST + Bearer token)

Flow:
  1. POST /auth/user/token {username,password} → access_token
  2. For each payif machine ใน DB (brand='payif', config.machine_id_vendor = shop_id):
       GET /cc_api/shop/order?ft_from_dt=…&ft_to_dt=…  → DataTables envelope
            data: {recordsTotal, recordsFiltered, draw, data:[order,…]}
            order: {id, order_no, timestamp, total_amount{_dec_,_exp_}, status_label, …}
            → กรอง status_label == "success"  (ข้าม fail/refund)
       GET /cc_api/shop/order/{id}  → detail
            data.details:[{product_name, slot, qty, amount{_dec_,_exp_},
                           delivery_status_label}]
       Map product_name → sku_id (mapper เดียวกับ stock sync) · box → ซอง
  3. Upsert sales (on_conflict sale_key)

Schema sales: sale_key UNIQUE, transaction_id, machine_id, sku_id,
              product_name_raw, quantity_sold, grand_total, sold_at

หมายเหตุ:
  - envelope ทุก endpoint = {"code":1000,"desc":"success","data":…}
  - ราคา/จำนวนเงิน = {"_dec_":N,"_exp_":E} → N × 10^E  (เช่น 12000×10⁻² = 120.00)
  - timestamp ไม่มี TZ → เป็นเวลาไทย (พอร์ทัลไทย เหมือน WW) → append +07:00
  - order list ไม่มี line items → ต้องเรียก detail แยกทุก order (N+1 เหมือน WW searchDetail)
"""
import os, argparse, requests
from datetime import datetime, timedelta
from supabase import create_client

# reuse mapper เดียวกับ stock sync (single source of truth ต่อ brand payif)
from payif_stock_sync import map_name_to_sku

# ── Config ────────────────────────────────────────────────────
BASE         = "https://vendos.one"
VENDOS_USER  = os.environ.get("VENDOS_USERNAME", "")
VENDOS_PASS  = os.environ.get("VENDOS_PASSWORD", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")

# ── จำนวนซองต่อกล่อง (ตรงกับ VMS/WW scraper) ─────────────────
PACKS_PER_BOX = {
    "OP 01": 24, "OP 02": 24, "OP 03": 24, "OP 04": 24, "OP 05": 24,
    "OP 06": 24, "OP 07": 24, "OP 08": 24, "OP 09": 24, "OP 10": 24,
    "OP 11": 24, "OP 12": 24, "OP 13": 24, "OP 14": 24, "OP 15": 24,
    "OP 16": 24,
    "PRB 01": 10, "PRB 02": 10,
    "EB 01": 24, "EB 02": 24, "EB 03": 24, "EB 04": 24,
    "FB 01": 24, "FB 02": 24, "FB 03": 24, "FB 04": 24, "FB 05": 24,
    "FB 06": 24, "FB 07": 24, "FB 08": 24, "FB 09": 24, "FB 10": 24,
    "FB 11": 24, "FB 12": 24, "FB 13": 24, "FB 14": 24, "FB 15": 24,
    "B29": 24,
    "NRT Series - 01": 30, "NRT Series - 02": 30, "NRT Jin - 1": 10,
    "PKM Dream EX": 10, "PKM Ninja": 30, "PKM Ghost": 30,
    "SLL UA 51": 16,
    "YGH The Heroes": 15, "YGH The Revals": 15, "YGH Chaos Origins": 30,
    # สินค้าใหม่ 2026-08-13 (ตอนนี้อยู่แค่ตู้ chukes) — เจ้าของยืนยันตัวเลขเอง
    "YGH UT01": 15, "TF Overdrive 01": 15, "MLP SEA02": 30, "MLP BP-01": 20,
}

# format วันที่ของ Vendos (จาก static config.js)
FMT_FROM = "%Y-%m-%dT00:00:00.000"
FMT_TO   = "%Y-%m-%dT23:59:59.000"


# ── Helpers ───────────────────────────────────────────────────
def dec(m) -> float:
    """{"_dec_":N,"_exp_":E} → N × 10^E (บาท)"""
    if not isinstance(m, dict):
        return 0.0
    return round(int(m.get("_dec_") or 0) * (10 ** int(m.get("_exp_") or 0)), 2)


def is_box(name: str) -> bool:
    return bool(name) and "BOX" in name.upper().split()


def sold_at_iso(ts: str) -> str | None:
    """timestamp Vendos 'YYYY-MM-DDTHH:MM:SS.ffffff' (เวลาไทย ไม่มี TZ) → tag +07:00"""
    if not ts:
        return None
    return ts.split(".")[0] + "+07:00"


def login() -> requests.Session:
    print("🔐 Login Vendos control center...")
    if not VENDOS_USER or not VENDOS_PASS:
        raise SystemExit("❌ ต้องตั้ง VENDOS_USERNAME / VENDOS_PASSWORD")
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Content-Type": "application/json"})
    r = s.post(f"{BASE}/auth/user/token",
               json={"username": VENDOS_USER, "password": VENDOS_PASS}, timeout=30)
    if r.status_code != 200:
        raise SystemExit(f"❌ Login failed: HTTP {r.status_code} · {r.text[:200]}")
    j = r.json() or {}
    tok = (j.get("data") or {}).get("access_token") or j.get("access_token")
    if not tok:
        raise SystemExit(f"❌ Login OK แต่ไม่พบ access_token: {r.text[:200]}")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    print("  ✅ Login สำเร็จ")
    return s


def api_get(s: requests.Session, path: str, params: dict | None = None):
    r = s.get(f"{BASE}{path}", params=params, timeout=60)
    r.raise_for_status()
    j = r.json()
    if j.get("code") != 1000:
        raise RuntimeError(f"API {path} code={j.get('code')} desc={j.get('desc')!r}")
    return j.get("data")


def fetch_payif_machines(supabase) -> dict:
    """{shop_id(str): machine_id} จาก machines brand='payif' ที่ยัง active

    ตู้ที่ยกเลิกแล้วต้องไม่ถูกดึงยอดต่อ
    """
    res = (supabase.table("machines").select("machine_id, config")
           .eq("brand", "payif").eq("status", "active").execute())
    out = {}
    for row in (res.data or []):
        cfg = row.get("config") or {}
        sid = cfg.get("machine_id_vendor")
        if sid:
            out[str(sid)] = row["machine_id"]
    return out


def fetch_orders(s: requests.Session, date_from: str, date_to: str) -> list[dict]:
    """ดึง order ทั้งบัญชี (ทุก shop) ในช่วงวัน · pagination ด้วย recordsTotal
    คืน list ของ order (ทุก status) — กรอง success ตอน map"""
    ft_from = datetime.strptime(date_from, "%Y-%m-%d").strftime(FMT_FROM)
    ft_to   = datetime.strptime(date_to,   "%Y-%m-%d").strftime(FMT_TO)
    PAGE = 100
    orders, start, total = [], 0, None
    while True:
        data = api_get(s, "/cc_api/shop/order", params={
            "ft_from_dt": ft_from, "ft_to_dt": ft_to,
            "start": start, "length": PAGE,
        }) or {}
        rows = data.get("data") or []
        if total is None:
            total = data.get("recordsFiltered") or data.get("recordsTotal") or 0
            print(f"  📊 recordsTotal={data.get('recordsTotal')} recordsFiltered={data.get('recordsFiltered')}")
        orders.extend(rows)
        start += len(rows)
        if not rows or start >= (total or 0):
            break
        if start > 100000:  # safety guard
            print("  ⚠️ เกิน 100k orders — หยุด")
            break
    return orders


def fetch_order_detail(s: requests.Session, order_id) -> dict | None:
    try:
        return api_get(s, f"/cc_api/shop/order/{order_id}")
    except Exception as e:
        print(f"  ⚠️ detail {order_id} ไม่ได้: {e}")
        return None


def order_to_records(detail: dict, machine_lookup: dict) -> list[dict]:
    """order detail → sales records (เฉพาะ line item ที่ส่งของสำเร็จ)"""
    shop_id = str(detail.get("shop_id") or "")
    machine_id = machine_lookup.get(shop_id)
    if not machine_id:
        return []
    # กรองเฉพาะ order สำเร็จ
    if (detail.get("status_label") or "").lower() != "success":
        return []

    order_no = detail.get("order_no") or str(detail.get("id") or "")
    sold_at  = sold_at_iso(detail.get("timestamp") or detail.get("created_at"))

    records = []
    for idx, item in enumerate(detail.get("details") or []):
        # เฉพาะสินค้าที่ดันออกสำเร็จ (delivery_status 0 = success ตาม label)
        if (item.get("delivery_status_label") or "").lower() != "success":
            continue
        name = (item.get("product_name") or "").strip()
        sku_id = map_name_to_sku(name)
        if not sku_id:
            continue
        n = int(item.get("qty") or 1)
        qty = n * PACKS_PER_BOX.get(sku_id, 24) if is_box(name) else n
        amount = dec(item.get("amount")) or (dec(item.get("sell_price")) * n)
        records.append({
            "sale_key":         f"{order_no}-{idx}",
            "transaction_id":   order_no,
            "machine_id":       machine_id,
            "sku_id":           sku_id,
            "product_name_raw": name,
            "quantity_sold":    qty,
            "grand_total":      amount,
            "sold_at":          sold_at,
        })
    return records


def filter_unknown_skus(supabase, records: list[dict]) -> list[dict]:
    """drop record ที่ sku ไม่อยู่ใน skus (sales.sku_id = NOT NULL FK)"""
    res = supabase.table("skus").select("sku_id").execute()
    valid = {r["sku_id"] for r in (res.data or [])}
    kept, dropped = [], {}
    for r in records:
        if r["sku_id"] in valid:
            kept.append(r)
        else:
            dropped[r["sku_id"]] = dropped.get(r["sku_id"], 0) + 1
    if dropped:
        print("⚠️ sku ไม่รู้จัก → ข้าม (เพิ่มใน skus ก่อน แล้ว backfill): "
              + ", ".join(f"{k}×{v}" for k, v in sorted(dropped.items())))
    return kept


def save_to_supabase(supabase, records: list[dict]):
    if not records:
        print("⚠️ ไม่มีข้อมูลที่จะบันทึก")
        return
    print(f"💾 บันทึก {len(records)} รายการลง Supabase...")
    saved = 0
    for i in range(0, len(records), 100):
        batch = records[i:i + 100]
        # ignore_duplicates=True · กัน overwrite หลัง admin เปลี่ยนสินค้า slot (ตาม WW)
        supabase.table("sales").upsert(batch, on_conflict="sale_key", ignore_duplicates=True).execute()
        saved += len(batch)
    print(f"🎉 บันทึกทั้งหมด {saved} รายการ")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=1, help="จำนวนวันย้อนหลัง (default 1 = เมื่อวาน)")
    ap.add_argument("--from-date", type=str, default=None)
    ap.add_argument("--to-date",   type=str, default=None)
    ap.add_argument("--dry-run",   action="store_true", help="login+fetch+parse แต่ไม่แตะ Supabase")
    args = ap.parse_args()

    now_bkk = datetime.utcnow() + timedelta(hours=7)
    if args.from_date and args.to_date:
        date_from, date_to = args.from_date, args.to_date
    elif args.days == 0:
        date_from = date_to = now_bkk.strftime("%Y-%m-%d")
    else:
        date_to   = now_bkk.strftime("%Y-%m-%d")
        date_from = (now_bkk - timedelta(days=args.days)).strftime("%Y-%m-%d")

    print(f"\n{'=' * 50}\nDivisionX Card — Payif Sales Sync\n"
          f"เวลาไทย: {now_bkk:%Y-%m-%d %H:%M}\nดึงข้อมูล: {date_from} → {date_to}\n{'=' * 50}\n")

    if args.dry_run:
        supabase = None
        machine_lookup = {"208": "pf01"}
        print("🧪 DRY-RUN mode: skip Supabase · ใช้ hardcoded lookup {208:pf01}")
    else:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        machine_lookup = fetch_payif_machines(supabase)
        if not machine_lookup:
            raise SystemExit("❌ ไม่พบ machine brand=payif ใน DB — INSERT machines ก่อน sync")
    print(f"🗺  Payif machines: {machine_lookup}")

    s = login()
    print(f"\n📥 ดึง orders {date_from} → {date_to}...")
    orders = fetch_orders(s, date_from, date_to)
    print(f"  ✅ พบ {len(orders)} orders (ทุก status)")

    records = []
    for i, o in enumerate(orders, 1):
        if i % 50 == 0:
            print(f"  📋 detail {i}/{len(orders)}...")
        # กรอง success + shop ที่เรารู้จัก ก่อนเรียก detail (ลด N+1)
        if (o.get("status_label") or "").lower() != "success":
            continue
        if str(o.get("shop_id") or "") not in machine_lookup:
            continue
        detail = fetch_order_detail(s, o.get("id"))
        if detail:
            records.extend(order_to_records(detail, machine_lookup))

    print(f"\n📊 แปลงได้ {len(records)} sales records")

    # Fail loud: มี order success แต่แปลงไม่ออกเลย → schema/mapping เปลี่ยน
    success_known = [o for o in orders
                     if (o.get("status_label") or "").lower() == "success"
                     and str(o.get("shop_id") or "") in machine_lookup]
    if success_known and not records:
        raise SystemExit(
            f"ERROR: มี {len(success_known)} order success แต่ parse ไม่ออกเลย · "
            "schema order detail อาจเปลี่ยน หรือ sku mapping ผิด")

    if args.dry_run:
        mapped = len(records)
        print(f"\n🧪 DRY-RUN: ไม่ save · sample {min(mapped, 8)} records:")
        for r in records[:8]:
            print(f"  {r['sold_at']} · {r['machine_id']} · {r['sku_id']:<16} "
                  f"×{r['quantity_sold']} = ฿{r['grand_total']} · {r['product_name_raw']}")
        total_baht = sum(r["grand_total"] for r in records)
        print(f"  ── รวม {mapped} รายการ · ฿{total_baht:,.2f}")
    else:
        records = filter_unknown_skus(supabase, records)
        save_to_supabase(supabase, records)


if __name__ == "__main__":
    main()
