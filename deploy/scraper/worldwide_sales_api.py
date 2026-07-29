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
    "FB 01": 24, "FB 02": 24, "FB 03": 24, "FB 04": 24, "FB 05": 24,
    "FB 06": 24, "FB 07": 24, "FB 08": 24, "FB 09": 24, "FB 10": 24,
    "FB 11": 24, "FB 12": 24, "FB 13": 24, "FB 14": 24, "FB 15": 24,
    "B29": 24,
    # Naming Contract 2026-05-19: short code (NRT/SLL/PKM)
    "NRT Series - 01": 30, "NRT Series - 02": 30, "NRT Jin - 1": 10,
    "PKM Dream EX": 10, "PKM Ninja": 30,
    "SLL UA 51": 16,
    # WW ตู้ wwv03/04/05 (2026-06-03)
    "OP 16": 24, "PKM Ghost": 30,
    "YGH The Heroes": 15, "YGH The Revals": 15, "YGH Chaos Origins": 30,
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")


# ── Helpers ───────────────────────────────────────────────────
def map_goods_to_sku(goods_name: str) -> str | None:
    """แปลงชื่อสินค้า WorldWide → sku_id

    รองรับ 2 format:
      1. WW legacy: 'OP 15 BOX' / 'B29 ซอง' / 'PRB 01 BOX'
      2. Canonical (หลัง admin rename): 'One Piece OP - 15 Box' / 'Dragonball FB - 01'
    """
    if not goods_name:
        return None
    upper = goods_name.upper().strip()
    # B29 standalone (Dragonball special — ไม่มี prefix FB ข้างหน้า)
    if re.search(r'\bB29\b', upper):
        return "B29"
    # ใช้ \b + re.search (ไม่ใช่ re.match) เพื่อรองรับ canonical
    # "One Piece OP - 15 Box" → \bOP\s*-?\s*15 → match
    m = re.search(r'\b(OP|EB|PRB|FB)\s*[-]?\s*(\d+)', upper)
    if m:
        return f"{m.group(1)} {m.group(2).zfill(2)}"
    # Fallback: direct map สำหรับ Naruto/Pokemon/SOLO (ชื่อไม่เป็น pattern)
    # check series2 ก่อน series1 กัน prefix collision
    lower = goods_name.lower().strip()
    for sub, sku in (
        # canonical names — check ก่อน
        ("naruto series - 02", "NRT Series - 02"),
        ("naruto series - 01", "NRT Series - 01"),
        ("naruto jin - 1",     "NRT Jin - 1"),
        ("pokemon dream ex",   "PKM Dream EX"),
        ("pokemon ninja",      "PKM Ninja"),
        ("solo leveling ua 51","SLL UA 51"),
        # legacy
        ("naruto series2",  "NRT Series - 02"),
        ("naruto series1",  "NRT Series - 01"),
        ("naruto jin1",     "NRT Jin - 1"),
        ("pokemon maga ex", "PKM Dream EX"),
        ("solo leveling",   "SLL UA 51"),
        # WW ตู้ wwv03/04/05 (2026-06-03) — ชื่อ portal ≠ ชื่อ DvX
        ("pokemon ghost",   "PKM Ghost"),
        ("chaos origins",   "YGH Chaos Origins"),
        ("limited over",    "YGH The Revals"),   # portal เรียก "Yuki oh Limited Over Collection"
        ("the revals",      "YGH The Revals"),   # เผื่อ portal เปลี่ยนเป็นชื่อจริงทีหลัง
        ("the heroes",      "YGH The Heroes"),   # ⚠ raw name ยังไม่ verify (ยังไม่มาถึงตู้)
    ):
        if sub in lower:
            return sku
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
    """POST /order/loadOrderList.do — return (trade_success_ids, total_rows_in_page, total_items_overall)

    - trade_success_ids: orderNum ที่ status = "Trade Success" เท่านั้น
    - total_rows_in_page: จำนวน <tr> ในหน้านี้ (ไม่ filter status) — สำหรับ pagination
    - total_items_overall: parse จาก "Total N Items" ใน HTML (None ถ้า parse ไม่ได้)

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
    total_rows = 0
    for tr in soup.find_all("tr"):
        onclick = tr.get("onclick", "")
        m = re.search(r"searchDetail\(['\"]([^'\"]+)['\"]\)", onclick)
        if not m:
            continue
        total_rows += 1
        # Filter: เก็บ "Trade Success" + "Ship Failed" (skip Wait Pay/Order Time Out/Refund)
        # "Ship Failed" = ลูกค้าจ่ายเงินแต่เครื่องไม่ดันสินค้า → ต้อง track ship_fails
        # "Refund" = WW คืนเงินแล้ว · ไม่ต้องเก็บ (สมดุล)
        text = tr.get_text()
        if "Trade Success" not in text and "Ship Failed" not in text:
            continue
        txn_ids.append(m.group(1))

    # Parse "Total N Items" จาก footer pagination
    m_total = re.search(r'Total\s+\d+\s+Pages?\s*\|\s*(\d+)\s+Items?', r.text)
    total_items = int(m_total.group(1)) if m_total else None
    return txn_ids, total_rows, total_items


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


def detail_to_records(detail: dict, machine_lookup: dict) -> tuple[list[dict], list[dict]]:
    """แปลง searchDetail response → (sales_records, ship_fail_records)

    sales: shippingStatus=1 + refundStatus=1 (ส่งของสำเร็จ ยังไม่ refund)
    ship_fails: shippingStatus!=1 + amount > 0 (จ่ายเงินแต่ไม่ได้ของ · WW จะ refund)
    """
    sales_records = []
    ship_fail_records = []
    vendor_id  = detail.get("machineNum", "")
    machine_id = machine_lookup.get(vendor_id)
    if not machine_id:
        return sales_records, ship_fail_records

    order_num = detail.get("orderNum", "")
    sold_at = bkk_to_iso(detail.get("paymentTime") or detail.get("createTime"))

    for idx, item in enumerate(detail.get("detailList") or []):
        goods_name = item.get("goodsName", "")
        sku_id     = map_goods_to_sku(goods_name)
        amount     = float(item.get("dealPrice") or 0)
        ship_ok    = item.get("shippingStatus") == 1
        refund_ok  = item.get("refundStatus") == 1   # 1 = ยังไม่ refund

        if ship_ok and refund_ok:
            # ── Successful sale ──
            if not sku_id:
                continue
            box = is_box(goods_name)
            qty = PACKS_PER_BOX.get(sku_id, 24) if box else 1
            sales_records.append({
                "sale_key":         f"{order_num}-{idx}",
                "transaction_id":   order_num,
                "machine_id":       machine_id,
                "sku_id":           sku_id,
                "product_name_raw": goods_name,
                "quantity_sold":    qty,
                "grand_total":      amount,
                "sold_at":          sold_at,
            })
        elif not ship_ok and amount > 0:
            # ── Ship Fail — ลูกค้าจ่ายเงินแต่เครื่องไม่ดันสินค้า ──
            # WW จัดการ refund · DVX แค่ track เพื่อ verify ภายหลัง
            ship_fail_records.append({
                "machine_id":       machine_id,
                "sku_id":           sku_id,   # may be None ถ้า map ไม่ออก
                "product_name_raw": goods_name,
                "amount":           amount,
                "sold_at":          sold_at,
                "order_number":     f"{order_num}-{idx}",
            })

    return sales_records, ship_fail_records


def filter_unknown_skus(supabase, sales: list[dict], ship_fails: list[dict]) -> list[dict]:
    """กัน FK violation จากสินค้าใหม่ที่ยังไม่มีใน skus (เช่น 'OP 16')
       - sales.sku_id = NOT NULL FK → drop record ที่ sku ไม่อยู่ใน skus
       - ship_fails.sku_id = nullable → set None
    sku เดียวที่ไม่รู้จักต้องไม่ทำให้ save ล้มทั้งชุด"""
    res = supabase.table("skus").select("sku_id").execute()
    valid = {r["sku_id"] for r in (res.data or [])}
    dropped = {}
    kept = []
    for r in sales:
        sid = r.get("sku_id")
        if sid in valid:
            kept.append(r)
        else:
            dropped[sid] = dropped.get(sid, 0) + 1
    nulled = {}
    for r in ship_fails:
        sid = r.get("sku_id")
        if sid and sid not in valid:
            nulled[sid] = nulled.get(sid, 0) + 1
            r["sku_id"] = None
    if dropped:
        print("⚠️ sales sku ไม่รู้จัก → ข้าม (เพิ่มใน skus แล้ว backfill ถึงจะเก็บยอดได้): "
              + ", ".join(f"{k}×{v}" for k, v in sorted(dropped.items())))
    if nulled:
        print("⚠️ ship_fails sku ไม่รู้จัก → set NULL: "
              + ", ".join(f"{k}×{v}" for k, v in sorted(nulled.items())))
    return kept


def save_to_supabase(supabase, records: list[dict]):
    if not records:
        print("⚠️ ไม่มีข้อมูลที่จะบันทึก")
        return
    print(f"💾 บันทึก {len(records)} รายการลง Supabase...")
    batch_size = 100
    saved = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        # ⚠ ignore_duplicates=True · กัน overwrite product_name + sku_id หลัง admin เปลี่ยนสินค้า slot
        supabase.table("sales").upsert(batch, on_conflict="sale_key", ignore_duplicates=True).execute()
        saved += len(batch)
        print(f"  ✅ batch {i // batch_size + 1}: {len(batch)} รายการ")
    print(f"🎉 บันทึกทั้งหมด {saved} รายการ")


def save_ship_fails(supabase, ship_fails: list[dict]):
    """Insert Ship Fail rows · on_conflict ON order_number (กัน sync ซ้ำ) · ส่ง Telegram alert เฉพาะ row ใหม่"""
    if not ship_fails:
        return
    print(f"⚠️ Ship Fails: {len(ship_fails)} รายการ · บันทึกลง ship_fails...")

    # 1. Pre-query: หา order_number ที่มีอยู่แล้ว → จะ skip alert (อันใหม่จริงเท่านั้นที่ alert)
    order_nums = [sf.get("order_number") for sf in ship_fails if sf.get("order_number")]
    existing_orders = set()
    if order_nums:
        try:
            res = supabase.table("ship_fails").select("order_number").in_(
                "order_number", order_nums
            ).execute()
            existing_orders = {r["order_number"] for r in (res.data or [])}
        except Exception as e:
            print(f"  ⚠️  pre-query existing failed: {e}")

    # 2. Upsert ทั้งหมด
    for sf in ship_fails:
        try:
            supabase.table("ship_fails").upsert(
                sf, on_conflict="order_number"
            ).execute()
        except Exception as e:
            print(f"  ❌ ship_fail upsert error ({sf.get('order_number')}): {e}")
    print(f"  ✅ บันทึก ship_fails เสร็จ")

    # 3. ส่ง Telegram alert เฉพาะ row ที่ไม่เคยมีก่อน (new fails จริง)
    new_orders = [sf for sf in ship_fails
                  if sf.get("order_number") and sf["order_number"] not in existing_orders]
    if not new_orders:
        return
    try:
        from telegram_alert import alert_ship_fail
        # Fetch IDs + machine names สำหรับ alert
        new_order_nums = [sf["order_number"] for sf in new_orders]
        sf_res = supabase.table("ship_fails").select(
            "id, order_number, machine_id, sku_id, qty, sold_at"
        ).in_("order_number", new_order_nums).execute()
        try:
            mres = supabase.table("machines").select("machine_id, name").execute()
            machine_names = {m["machine_id"]: m.get("name") for m in (mres.data or [])}
        except Exception:
            machine_names = {}
        for sf_row in (sf_res.data or []):
            alert_ship_fail(
                ship_fail_id=sf_row["id"],
                machine_id=sf_row["machine_id"],
                machine_name=machine_names.get(sf_row["machine_id"]),
                sku_id=sf_row.get("sku_id") or "—",
                qty=sf_row.get("qty") or 1,
                order_id=sf_row.get("order_number"),
                sold_at=sf_row.get("sold_at"),
            )
        print(f"📱 Telegram: sent {len(sf_res.data or [])} ship_fail alerts")
    except Exception as e:
        print(f"⚠️  Telegram alert failed: {e}")


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
    # ⚠ ห้าม break จาก len(trade_success_ids) — เพราะส่วนใหญ่จะเป็น Order Time Out/Wait Pay
    # ใช้ total_rows_in_page (ทุก status) หรือ total_items จาก footer แทน
    PAGE_SIZE = 100
    all_txn_ids = []
    page = 1
    total_items_overall = None
    rows_processed = 0
    while True:
        print(f"  📥 Order list page {page}...")
        ids, page_rows, total_items = fetch_order_list_page(s, start_dt, end_dt, page, page_size=PAGE_SIZE)
        if total_items_overall is None and total_items is not None:
            total_items_overall = total_items
            print(f"    📊 Total {total_items_overall} items overall")
        rows_processed += page_rows
        all_txn_ids.extend(ids)
        print(f"    page rows={page_rows} · Trade Success={len(ids)} · processed={rows_processed}")
        if page_rows == 0:
            break
        # หยุดเมื่อนับครบ total_items (วิธีที่แม่นยำสุด)
        if total_items_overall and rows_processed >= total_items_overall:
            break
        # Fallback: ถ้า page นี้ < PAGE_SIZE → หน้าสุดท้าย
        if page_rows < PAGE_SIZE:
            break
        page += 1
        if page > 1000:  # safety guard (1000 pages × 100 = 100k items)
            print("  ⚠️ Reached 1000 pages — stopping")
            break

    # Dedup (เผื่อ pagination ทับ)
    all_txn_ids = list(dict.fromkeys(all_txn_ids))
    print(f"\n📊 รวม {len(all_txn_ids)} Trade Success transactions (จาก {rows_processed} total rows)")

    # ── Fetch detail per transaction ──
    records = []
    ship_fails = []
    skipped_machine = 0
    for i, txn_id in enumerate(all_txn_ids, 1):
        if i % 50 == 0:
            print(f"  📋 Detail {i}/{len(all_txn_ids)}...")
        detail = fetch_order_detail(s, txn_id)
        if not detail:
            continue
        sales_rows, ship_fail_rows = detail_to_records(detail, machine_lookup)
        if not sales_rows and not ship_fail_rows and detail.get("machineNum") not in machine_lookup:
            skipped_machine += 1
        records.extend(sales_rows)
        ship_fails.extend(ship_fail_rows)

    print(f"📋 แปลงได้ {len(records)} sales · {len(ship_fails)} ship_fails ({skipped_machine} txn skip: ตู้ไม่อยู่ใน DB)")

    # Fail loud: ถ้าดึง txn ได้แต่แปลงไม่ออก → schema/mapping เปลี่ยน
    if len(all_txn_ids) > 0 and len(records) == 0 and len(ship_fails) == 0:
        raise SystemExit(
            f"ERROR: ดึง {len(all_txn_ids)} transactions แต่ parse ไม่ออกเลย · "
            "schema searchDetail อาจเปลี่ยน หรือ machine_id_vendor mapping ผิด"
        )

    if args.dry_run:
        print("\n🧪 DRY-RUN: ไม่ save ลง Supabase · sample 3 records:")
        for r in records[:3]:
            print(f"  {r}")
        print(f"  ... (total {len(records)} sales · {len(ship_fails)} ship_fails)")
        for sf in ship_fails[:3]:
            print(f"  SHIP FAIL: {sf}")
    else:
        records = filter_unknown_skus(supabase, records, ship_fails)
        save_to_supabase(supabase, records)
        save_ship_fails(supabase, ship_fails)


if __name__ == "__main__":
    main()
