"""
DivisionX Card — WorldWide Vending Sales Sync
ดึงยอดขายจาก WorldWide Vending portal (Photocal)

Flow:
  1. POST /sys/login.do — form-urlencoded → 302 + Set-Cookie JSESSIONID
  2. POST /order/loadOrderList.do — multipart → HTML list of transactions
     - Filter row ที่ status = "Trade Success" (skip Wait Pay/Refund)
  3. POST /order/searchDetail.do — form-urlencoded orderNum → JSON detailList
  4. Map goodsName → sku_id · detect BOX → quantity_sold
  5. Upsert sales table (on_conflict sale_key)

Schema reference:
  sales (sale_key UNIQUE, transaction_id, machine_id, sku_id,
         product_name_raw, quantity_sold, grand_total, sold_at)
"""

import os, re, sys, argparse, requests
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from supabase import create_client

# ── Config ────────────────────────────────────────────────────
WW_BASE      = "https://www.worldwidevending-vms.com"
WW_USER      = os.environ["WW_USERNAME"]
WW_PASS      = os.environ["WW_PASSWORD"]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ── จำนวนซองต่อกล่อง (ตรงกับ VMS scraper) ─────────────────────
PACKS_PER_BOX = {
    "OP 01": 24, "OP 02": 24, "OP 03": 24, "OP 04": 24, "OP 05": 24,
    "OP 06": 24, "OP 07": 24, "OP 08": 24, "OP 09": 24, "OP 10": 24,
    "OP 11": 24, "OP 12": 24, "OP 13": 24, "OP 14": 24, "OP 15": 24,
    "PRB 01": 10, "PRB 02": 10,
    "EB 01": 24, "EB 02": 24, "EB 03": 24, "EB 04": 24,
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")


# ── Helpers ───────────────────────────────────────────────────
def map_goods_to_sku(goods_name: str) -> str | None:
    """แปลงชื่อสินค้า WorldWide เช่น 'OP 15 BOX' / 'OP 15 ซอง' → 'OP 15'"""
    if not goods_name:
        return None
    upper = goods_name.upper().strip()
    m = re.match(r'(OP|EB|PRB)\s*[-]?\s*(\d+)', upper)
    if m:
        return f"{m.group(1)} {m.group(2).zfill(2)}"
    return None


def is_box(goods_name: str) -> bool:
    """ตรวจว่าสินค้าเป็น BOX (กล่อง) หรือ ซอง (pack)"""
    if not goods_name:
        return False
    return "BOX" in goods_name.upper().split()


def bkk_to_iso(dt_str: str) -> str | None:
    """Portal ส่ง 'YYYY-MM-DD HH:MM:SS' เวลาไทย (ไม่มี TZ)
    Postgres จะตีเป็น UTC ถ้าไม่ tag → shift +7 ชม. · append +07:00 ให้ตรง"""
    if not dt_str:
        return None
    return dt_str.replace(" ", "T") + "+07:00"


# ── Worldwide portal ───────────────────────────────────────────
def login() -> requests.Session:
    """Login → return Session with JSESSIONID cookie"""
    print("🔐 Login WorldWide portal...")
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "X-Requested-With": "XMLHttpRequest"})
    r = s.post(
        f"{WW_BASE}/sys/login.do",
        data={"loginname": WW_USER, "loginpwd": WW_PASS},
        allow_redirects=False,
        timeout=30,
    )
    if r.status_code != 302:
        raise SystemExit(f"❌ Login failed: HTTP {r.status_code} · {r.text[:200]}")
    if not s.cookies.get("JSESSIONID"):
        raise SystemExit("❌ Login OK but no JSESSIONID cookie")
    print("  ✅ Login สำเร็จ")
    return s


def fetch_machine_lookup(supabase) -> dict:
    """Build {vendor_id: machine_id} for brand='worldwide' machines"""
    res = supabase.table("machines").select("machine_id, config").eq("brand", "worldwide").execute()
    lookup = {}
    for row in (res.data or []):
        cfg = row.get("config") or {}
        vendor_id = cfg.get("machine_id_vendor")
        if vendor_id:
            lookup[vendor_id] = row["machine_id"]
    print(f"🗺  Machine lookup: {len(lookup)} worldwide machines")
    return lookup


def fetch_order_list_page(s, start_dt: str, end_dt: str, page: int, page_size: int = 100):
    """POST /order/loadOrderList.do — return list of orderNum where status = Trade Success

    start_dt / end_dt format: 'YYYY-MM-DD HH:MM'
    """
    files = {
        "timeMode":       (None, "zdy"),
        "start":          (None, start_dt),
        "startDayTime":   (None, ""),
        "startMonthTime": (None, ""),
        "end":            (None, end_dt),
        "pageSize":       (None, str(page_size)),
        "goPageNo":       (None, ""),
        "pageNo":         (None, str(page)),
    }
    r = s.post(f"{WW_BASE}/order/loadOrderList.do", files=files, timeout=60)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    txn_ids = []
    for tr in soup.find_all("tr"):
        onclick = tr.get("onclick", "")
        m = re.search(r"searchDetail\(['\"]([^'\"]+)['\"]\)", onclick)
        if not m:
            continue
        # Filter: เก็บเฉพาะ Trade Success (skip Wait Pay/Refund)
        if "Trade Success" not in tr.get_text():
            continue
        txn_ids.append(m.group(1))
    return txn_ids


def fetch_order_detail(s, order_num: str) -> dict | None:
    """POST /order/searchDetail.do — return data dict (None ถ้า error)"""
    r = s.post(
        f"{WW_BASE}/order/searchDetail.do",
        data={"orderNum": order_num},
        timeout=30,
    )
    r.raise_for_status()
    j = r.json()
    if j.get("status") != 0:
        print(f"  ⚠️ Detail failed for {order_num}: {j}")
        return None
    return j.get("data")


def detail_to_records(detail: dict, machine_lookup: dict) -> list[dict]:
    """แปลง searchDetail response → sales records"""
    records = []
    vendor_id  = detail.get("machineNum", "")
    machine_id = machine_lookup.get(vendor_id)
    if not machine_id:
        # ตู้ใหม่ที่ยังไม่ INSERT ใน DB — skip + log
        return records

    order_num = detail.get("orderNum", "")
    # ใช้ paymentTime ถ้ามี (เวลาตัดเงินจริง) · fallback createTime · tag TZ Bangkok
    sold_at = bkk_to_iso(detail.get("paymentTime") or detail.get("createTime"))

    for idx, item in enumerate(detail.get("detailList") or []):
        # Per-item filter: เก็บเฉพาะ shippingStatus=1 + refundStatus=1
        if item.get("shippingStatus") != 1:
            continue
        if item.get("refundStatus") != 1:
            continue

        goods_name = item.get("goodsName", "")
        sku_id = map_goods_to_sku(goods_name)
        if not sku_id:
            continue

        box = is_box(goods_name)
        qty = PACKS_PER_BOX.get(sku_id, 24) if box else 1

        records.append({
            "sale_key":         f"{order_num}-{idx}",
            "transaction_id":   order_num,
            "machine_id":       machine_id,
            "sku_id":           sku_id,
            "product_name_raw": goods_name,
            "quantity_sold":    qty,
            "grand_total":      float(item.get("dealPrice") or 0),
            "sold_at":          sold_at,
        })
    return records


def save_to_supabase(supabase, records: list[dict]):
    if not records:
        print("⚠️ ไม่มีข้อมูลที่จะบันทึก")
        return
    print(f"💾 บันทึก {len(records)} รายการลง Supabase...")
    batch_size = 100
    saved = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        supabase.table("sales").upsert(batch, on_conflict="sale_key").execute()
        saved += len(batch)
        print(f"  ✅ batch {i // batch_size + 1}: {len(batch)} รายการ")
    print(f"🎉 บันทึกทั้งหมด {saved} รายการ")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=1)
    parser.add_argument("--from-date", type=str, default=None)
    parser.add_argument("--to-date",   type=str, default=None)
    parser.add_argument("--dry-run",   action="store_true",
                        help="Login + fetch + parse แต่ไม่ติด Supabase + ไม่ save")
    args = parser.parse_args()

    now_bkk = datetime.utcnow() + timedelta(hours=7)

    if args.from_date and args.to_date:
        date_from, date_to = args.from_date, args.to_date
    elif args.days == 0:
        date_from = date_to = now_bkk.strftime("%Y-%m-%d")
    else:
        date_to   = now_bkk.strftime("%Y-%m-%d")
        date_from = (now_bkk - timedelta(days=args.days)).strftime("%Y-%m-%d")

    start_dt = f"{date_from} 00:00"
    end_dt   = f"{date_to} 23:59"

    print(f"\n{'=' * 50}")
    print(f"DivisionX Card — WorldWide Sales Sync")
    print(f"เวลาไทย: {now_bkk.strftime('%Y-%m-%d %H:%M')}")
    print(f"ดึงข้อมูล: {start_dt} → {end_dt}")
    print(f"{'=' * 50}\n")

    if args.dry_run:
        print("🧪 DRY-RUN mode: skip Supabase · ใช้ hardcoded machine lookup")
        supabase = None
        machine_lookup = {"VCM350CKC25090606": "wwv01"}
    else:
        supabase       = create_client(SUPABASE_URL, SUPABASE_KEY)
        machine_lookup = fetch_machine_lookup(supabase)
        if not machine_lookup:
            raise SystemExit("❌ ไม่พบ machine brand=worldwide ใน DB — INSERT machines ก่อน sync")

    s = login()

    # ── Fetch all Trade Success transactions (pagination) ──
    all_txn_ids = []
    page = 1
    while True:
        print(f"  📥 Order list page {page}...")
        ids = fetch_order_list_page(s, start_dt, end_dt, page, page_size=100)
        print(f"    found {len(ids)} Trade Success")
        if not ids:
            break
        all_txn_ids.extend(ids)
        # Page เต็มถึง 100 → อาจมีต่อ; ถ้า < 100 = หน้าสุดท้าย
        if len(ids) < 100:
            break
        page += 1
        if page > 100:  # safety guard
            print("  ⚠️ Reached 100 pages — stopping")
            break

    # Dedup (เผื่อ pagination ทับ)
    all_txn_ids = list(dict.fromkeys(all_txn_ids))
    print(f"\n📊 รวม {len(all_txn_ids)} Trade Success transactions")

    # ── Fetch detail per transaction ──
    records = []
    skipped_machine = 0
    for i, txn_id in enumerate(all_txn_ids, 1):
        if i % 50 == 0:
            print(f"  📋 Detail {i}/{len(all_txn_ids)}...")
        detail = fetch_order_detail(s, txn_id)
        if not detail:
            continue
        rows = detail_to_records(detail, machine_lookup)
        if not rows and detail.get("machineNum") not in machine_lookup:
            skipped_machine += 1
        records.extend(rows)

    print(f"📋 แปลงได้ {len(records)} records ({skipped_machine} txn skip: ตู้ไม่อยู่ใน DB)")

    # Fail loud: ถ้าดึง txn ได้แต่แปลงไม่ออก → schema/mapping เปลี่ยน
    if len(all_txn_ids) > 0 and len(records) == 0:
        raise SystemExit(
            f"ERROR: ดึง {len(all_txn_ids)} transactions แต่ parse ไม่ออกเลย · "
            "schema searchDetail อาจเปลี่ยน หรือ machine_id_vendor mapping ผิด"
        )

    if args.dry_run:
        print("\n🧪 DRY-RUN: ไม่ save ลง Supabase · sample 3 records:")
        for r in records[:3]:
            print(f"  {r}")
        print(f"  ... (total {len(records)} records)")
    else:
        save_to_supabase(supabase, records)


if __name__ == "__main__":
    main()
