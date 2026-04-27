"""
DivisionX Card — VMS Sales Sync via REST API
ดึงยอดขายผ่าน VMS API โดยตรง (ไม่ใช้ Playwright)
เร็วกว่า XLSX export ~10 เท่า
"""

import os, re, argparse, requests
from datetime import datetime, timedelta
from supabase import create_client

# ── Config ────────────────────────────────────────────────────
VMS_API_BASE = "https://api.inboxcorp.co.th/internal/v1"
VMS_USER     = os.environ["VMS_USERNAME"]
VMS_PASS     = os.environ["VMS_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# ── จำนวนซองต่อกล่อง ─────────────────────────────────────────
PACKS_PER_BOX = {
    "OP 01": 24, "OP 02": 24, "OP 03": 24, "OP 04": 24, "OP 05": 24,
    "OP 06": 24, "OP 07": 24, "OP 08": 24, "OP 09": 24, "OP 10": 24,
    "OP 11": 24, "OP 12": 24, "OP 13": 24, "OP 14": 24, "OP 15": 24,
    "PRB 01": 10, "PRB 02": 10,
    "EB 01": 24, "EB 02": 24, "EB 03": 24, "EB 04": 24,
}

def map_product_to_sku(product_name: str) -> str | None:
    if not product_name: return None
    name = product_name.lower().strip()
    m = re.search(r'op\s*[-–]\s*(\d+)', name)
    if m: return f"OP {m.group(1).zfill(2)}"
    m = re.search(r'prb\s*[-–]\s*(\d+)', name)
    if m: return f"PRB {m.group(1).zfill(2)}"
    m = re.search(r'eb\s*[-–]\s*(\d+)', name)
    if m: return f"EB {m.group(1).zfill(2)}"
    return None

def normalize(text: str) -> str:
    import unicodedata
    text = unicodedata.normalize("NFKC", text).lower().strip()
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    return " ".join(text.split())

def login() -> str:
    print("🔐 Login VMS API...")
    res = requests.post(f"{VMS_API_BASE}/auth/", json={
        "username": VMS_USER, "password": VMS_PASS,
    })
    res.raise_for_status()
    data = res.json()
    if data.get("status") != "success":
        raise Exception(f"Login failed: {data}")
    print("  ✅ Login สำเร็จ")
    return data["token"]

def fetch_sales(token: str, date_from: str, date_to: str) -> list[dict]:
    """ดึงยอดขายจาก VMS API (pagination)"""
    headers = {"Authorization": f"Bearer {token}"}
    all_sales = []
    offset = 0
    page_size = 100

    while True:
        print(f"  📥 ดึง offset={offset}...")
        # ⚠ VMS rebuild 18-19 เม.ย. 2026 ย้าย endpoint /sales/ → /report/sales/
        # เพิ่ม include_products=true (เห็นใน Network panel ของ VMS web)
        res = requests.get(f"{VMS_API_BASE}/report/sales/", headers=headers, params={
            "limit": page_size,
            "offset": offset,
            "sortBy": "created_at",
            "sortOrder": "desc",
            "date_from": date_from,
            "date_to": date_to,
            "include_products": "true",
        })

        if res.status_code == 403:
            print("  ❌ API ตอบ 403 Forbidden — ใช้ API ยอดขายไม่ได้")
            return None  # signal ให้ fallback ไป Playwright
        res.raise_for_status()

        data = res.json()
        if data.get("status") != "success":
            print(f"  ⚠️ API error: {data}")
            break

        rows = data.get("data", [])
        all_sales.extend(rows)
        print(f"  ✅ ได้ {len(rows)} รายการ (รวม {len(all_sales)})")

        pagination = data.get("pagination", {})
        total = pagination.get("total", 0)
        if len(all_sales) >= total or len(rows) < page_size:
            break
        offset += page_size

    return all_sales

def parse_api_sales(api_rows: list[dict]) -> list[dict]:
    """แปลง API response เป็น records สำหรับ Supabase"""
    records = []
    txn_counter = {}

    for row in api_rows:
        # ⚠ VMS rebuild 18-19 เม.ย. 2026 เปลี่ยน schema ของ API:
        #   transaction_id → txid (หรือ record_id)
        #   grand_total / total_amount → total_price
        #   prod.price / prod.amount → prod.pay_price
        # ก่อนหน้าใช้ key เก่า → txn_id=""  → sale_keys ชนกัน → upsert ทับ → ยอดขายหายไป

        products = row.get("products", [])
        txn_id = str(
            row.get("txid")
            or row.get("transaction_id")
            or row.get("record_id")
            or row.get("id")
            or ""
        )
        machine_id = str(row.get("kiosk_id", ""))
        sold_at = row.get("created_at", row.get("transaction_date", ""))
        outer_total = float(
            row.get("total_price")
            or row.get("grand_total")
            or row.get("total_amount")
            or 0
        )
        status = row.get("status", "")

        if status and status.lower() != "paid":
            continue
        if not txn_id:
            print(f"  ⚠️ skip row without txn_id: {row.get('record_id')}")
            continue

        if products:
            for prod in products:
                product_raw = prod.get("product_name", prod.get("name", ""))
                sku_id = map_product_to_sku(product_raw)
                if not sku_id: continue

                txn_counter[txn_id] = txn_counter.get(txn_id, -1) + 1
                sale_key = f"{txn_id}-{txn_counter[txn_id]}"

                name_lower = normalize(product_raw)
                is_box = "(box)" in name_lower or "box" in name_lower.split()
                qty = PACKS_PER_BOX.get(sku_id, 24) if is_box else 1

                prod_price = float(
                    prod.get("pay_price")
                    or prod.get("price")
                    or prod.get("amount")
                    or 0
                )

                records.append({
                    "sale_key": sale_key,
                    "transaction_id": txn_id,
                    "machine_id": machine_id,
                    "sku_id": sku_id,
                    "product_name_raw": product_raw,
                    "quantity_sold": qty,
                    "grand_total": prod_price,
                    "sold_at": sold_at,
                })
        else:
            product_raw = str(row.get("product_name", "")).strip()
            if not product_raw: continue
            sku_id = map_product_to_sku(product_raw)
            if not sku_id: continue

            txn_counter[txn_id] = txn_counter.get(txn_id, -1) + 1
            sale_key = f"{txn_id}-{txn_counter[txn_id]}"

            name_lower = normalize(product_raw)
            is_box = "(box)" in name_lower or "box" in name_lower.split()
            qty = PACKS_PER_BOX.get(sku_id, 24) if is_box else 1

            records.append({
                "sale_key": sale_key,
                "transaction_id": txn_id,
                "machine_id": machine_id,
                "sku_id": sku_id,
                "product_name_raw": product_raw,
                "quantity_sold": qty,
                "grand_total": outer_total,
                "sold_at": sold_at,
            })

    return records

def save_to_supabase(records: list[dict]):
    if not records:
        print("⚠️ ไม่มีข้อมูลที่จะบันทึก")
        return
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"💾 บันทึก {len(records)} รายการลง Supabase...")
    batch_size = 100
    saved = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        supabase.table("sales").upsert(batch, on_conflict="sale_key").execute()
        saved += len(batch)
        print(f"  ✅ batch {i//batch_size + 1}: {len(batch)} รายการ")
    print(f"🎉 บันทึกทั้งหมด {saved} รายการ")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=1)
    parser.add_argument("--from-date", type=str, default=None)
    parser.add_argument("--to-date", type=str, default=None)
    args = parser.parse_args()

    now_bkk = datetime.utcnow() + timedelta(hours=7)

    if args.from_date and args.to_date:
        date_from, date_to = args.from_date, args.to_date
    elif args.days == 0:
        date_from = date_to = now_bkk.strftime("%Y-%m-%d")
    else:
        date_to   = (now_bkk - timedelta(days=1)).strftime("%Y-%m-%d")
        date_from = (now_bkk - timedelta(days=args.days)).strftime("%Y-%m-%d")

    print(f"\n{'='*50}")
    print(f"DivisionX Card — VMS Sales API Sync")
    print(f"เวลาไทย: {now_bkk.strftime('%Y-%m-%d %H:%M')}")
    print(f"ดึงข้อมูล: {date_from} → {date_to}")
    print(f"{'='*50}\n")

    token = login()
    api_rows = fetch_sales(token, date_from, date_to)

    if api_rows is None:
        print("\n⚠️ API ถูก block (403) — fallback ไป Playwright scraper")
        print("กรุณาใช้ vms_scraper.py แทน")
        exit(1)

    print(f"\n📊 ดึงจาก API ได้ {len(api_rows)} transactions")
    records = parse_api_sales(api_rows)
    print(f"📋 แปลงได้ {len(records)} records")

    # Fail loud: ถ้าดึง transactions ได้แต่ parse ไม่ออก = schema เปลี่ยน
    if len(api_rows) > 0 and len(records) == 0:
        raise SystemExit(
            f"ERROR: ดึง {len(api_rows)} transactions แต่ parse ไม่ออกเลย · "
            "VMS API schema อาจเปลี่ยน · ตรวจ key txid/pay_price/total_price ใน vms_sales_api.py"
        )

    save_to_supabase(records)

if __name__ == "__main__":
    main()
