"""
DivisionX Card — VMS Scraper
Login VMS → Export XLSX → Parse → Save to Supabase
รันผ่าน GitHub Actions ทุกวัน
"""

import os, re, time, requests
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
from playwright.sync_api import sync_playwright
from supabase import create_client

# ── Config จาก Environment Variables ────────────────────────────
VMS_URL      = os.environ["VMS_URL"]       # https://vms.inboxcorp.co.th/th/login
VMS_USER     = os.environ["VMS_USERNAME"]
VMS_PASS     = os.environ["VMS_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# ── จำนวนซองต่อกล่อง (ใช้แปลง box → pack) ──────────────────
PACKS_PER_BOX = {
    "OP 01": 24, "OP 02": 24, "OP 03": 24, "OP 04": 24, "OP 05": 24,
    "OP 06": 24, "OP 07": 24, "OP 08": 24, "OP 09": 24, "OP 10": 24,
    "OP 11": 24, "OP 12": 24, "OP 13": 24, "OP 14": 24, "OP 15": 24,
    "PRB 01": 10, "PRB 02": 10,
    "EB 01": 24, "EB 02": 24, "EB 03": 24, "EB 04": 24,
}

# ── VMS Product Name → SKU ID Mapping ───────────────────────────
SKU_MAP = {
    "one piece op - 01 pack": "OP 01",
    "one piece op - 01 (box)": "OP 01",
    "one piece op - 02 pack": "OP 02",
    "one piece op - 02 (box)": "OP 02",
    "one piece op - 03 pack": "OP 03",
    "one piece op - 03 (box)": "OP 03",
    "one piece op - 04 pack": "OP 04",
    "one piece op - 04 (box)": "OP 04",
    "one piece op - 05 pack": "OP 05",
    "one piece op - 05 (box)": "OP 05",
    "one piece op - 06 pack": "OP 06",
    "one piece op - 06 (box)": "OP 06",
    "one piece op - 07 pack": "OP 07",
    "one piece op - 07 (box)": "OP 07",
    "one piece op - 08 pack": "OP 08",
    "one piece op - 08 (box)": "OP 08",
    "one piece op - 09 pack": "OP 09",
    "one piece op - 09 (box)": "OP 09",
    "one piece op - 10 pack": "OP 10",
    "one piece op - 10 (box)": "OP 10",
    "one piece op - 11 pack": "OP 11",
    "one piece op - 11 (box)": "OP 11",
    "one piece op - 12 pack": "OP 12",
    "one piece op - 12 (box)": "OP 12",
    "one piece op - 13 pack": "OP 13",
    "one piece op - 13 (box)": "OP 13",
    "one piece op - 14 pack": "OP 14",
    "one piece op - 14 (box)": "OP 14",
    "one piece op - 15 pack": "OP 15",
    "one piece op - 15 (box)": "OP 15",
    "prb - 01 (pack)": "PRB 01",
    "prb - 01 (box)": "PRB 01",
    "prb - 02 (pack)": "PRB 02",
    "prb - 02 (box)": "PRB 02",
    "prb - 02 (ฺbox)": "PRB 02",
    "one piece eb - 01 pack": "EB 01",
    "one piece eb - 01 (box)": "EB 01",
    "one piece eb - 02 pack": "EB 02",
    "one piece eb - 02 (box)": "EB 02",
    "one piece eb - 03 pack": "EB 03",
    "one piece eb - 03 (box)": "EB 03",
    "one piece eb - 04 pack": "EB 04",
    "one piece eb - 04 (box)": "EB 04",
}

def normalize(text: str) -> str:
    """Normalize text: lowercase, single spaces, ASCII dash"""
    import unicodedata
    text = unicodedata.normalize("NFKC", text)  # normalize unicode
    text = text.lower().strip()
    # แปลง en-dash, em-dash → hyphen
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    # ลด whitespace ซ้ำ
    text = " ".join(text.split())
    return text

def map_sku(product_name: str) -> str | None:
    """แปลงชื่อสินค้าจาก VMS เป็น SKU ID"""
    key = normalize(product_name)
    # ลอง exact match ก่อน
    if key in SKU_MAP:
        return SKU_MAP[key]
    # ลอง normalized match กับทุก key ใน map
    for vms_name, sku_id in SKU_MAP.items():
        if normalize(vms_name) == key:
            return sku_id
    # ลอง partial match
    for vms_name, sku_id in SKU_MAP.items():
        n = normalize(vms_name)
        if n in key or key in n:
            return sku_id
    print(f"  ⚠️  ไม่พบ SKU สำหรับ: {product_name!r}")
    return None

def download_xlsx(page, date_from: str, date_to: str) -> Path:
    """Login VMS และ Export XLSX รายงานการขาย"""
    print(f"🔐 Login VMS...")
    page.goto(VMS_URL)
    page.wait_for_load_state("networkidle")

    # Login
    page.fill('input[type="text"], input[name="username"], input[placeholder*="ชื่อผู้ใช้"]', VMS_USER)
    page.fill('input[type="password"]', VMS_PASS)
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    print(f"📊 ไปหน้า รายงานการขาย...")
    # ไปหน้า รายงาน → ยอดขาย
    page.goto(VMS_URL.replace("/th/login", "/th/report/sales"))
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    # ตั้งวันที่
    print(f"📅 ตั้งวันที่ {date_from} ถึง {date_to}...")
    try:
        date_inputs = page.query_selector_all('input[type="date"], input[placeholder*="วัน"]')
        if len(date_inputs) >= 2:
            date_inputs[0].fill(date_from)
            date_inputs[1].fill(date_to)
            page.keyboard.press("Enter")
            time.sleep(1)
    except Exception as e:
        print(f"  ⚠️  ตั้งวันที่ไม่สำเร็จ: {e}")

    # กดปุ่ม ส่งออก เพื่อสั่ง generate ไฟล์
    print("📥 กด Export...")
    xlsx_path = Path("/tmp/vms_sales.xlsx")

    try:
        page.click('button:has-text("ส่งออก"), button:has-text("Export"), a:has-text("ส่งออก")', timeout=10000)
        print("  ✅ คลิกปุ่ม ส่งออก สำเร็จ")
    except:
        export_btn = page.query_selector('[class*="export"], [class*="download"]')
        if export_btn:
            export_btn.click()
        else:
            page.screenshot(path="/tmp/no_export_btn.png")
            raise Exception("ไม่พบปุ่ม Export")

    # ไปหน้า Downloads เพื่อรอไฟล์
    downloads_url = VMS_URL.replace("/th/login", "/th/downloads")
    print(f"📂 ไปหน้า Downloads: {downloads_url}")
    page.goto(downloads_url)
    page.wait_for_load_state("networkidle")

    # รอให้แถวแรก (ล่าสุด) มีสถานะ Completed (poll ทุก 5 วิ สูงสุด 2 นาที)
    print("⏳ รอสถานะ Completed...")
    for i in range(24):
        first_row_status = page.query_selector('table tr:nth-child(2) td, tbody tr:first-child td')
        status_text = page.inner_text('tbody tr:first-child') if page.query_selector('tbody tr:first-child') else ""
        print(f"  [{i+1}] status row text: {status_text[:80]}")
        if "Completed" in status_text or "completed" in status_text.lower():
            print("  ✅ พบสถานะ Completed")
            break
        time.sleep(5)
        page.reload()
        page.wait_for_load_state("networkidle")
    else:
        page.screenshot(path="/tmp/downloads_timeout.png")
        raise Exception("Timeout รอสถานะ Completed เกิน 2 นาที")

    page.screenshot(path="/tmp/downloads_page.png")
    print("📸 screenshot: /tmp/downloads_page.png")

    # คลิกปุ่ม ดาวน์โหลด แถวแรก (ล่าสุด)
    with page.expect_download(timeout=30000) as dl:
        btn = page.query_selector('tbody tr:first-child button:has-text("ดาวน์โหลด"), tbody tr:first-child a:has-text("ดาวน์โหลด")')
        if not btn:
            page.screenshot(path="/tmp/no_download_btn.png")
            raise Exception("ไม่พบปุ่ม ดาวน์โหลด ในแถวแรก")
        btn.click()

    dl.value.save_as(str(xlsx_path))
    print(f"✅ ดาวน์โหลดสำเร็จ: {xlsx_path}")
    return xlsx_path

def parse_xlsx(xlsx_path: Path) -> list[dict]:
    """อ่านและแปลงข้อมูลจาก XLSX"""
    print(f"📋 อ่านไฟล์ XLSX...")
    df = pd.read_excel(xlsx_path)

    # Filter เฉพาะ paid
    df = df[df["Status"] == "paid"].copy()
    print(f"  รายการ paid: {len(df)} แถว")

    records = []
    skipped = 0
    # นับ line_index ต่อ transaction_id (แก้ปัญหา 1 transaction มีหลาย SKU ซ้ำกัน)
    txn_counter = {}

    for _, row in df.iterrows():
        product_raw = str(row.get("Product Name", "")).strip()
        if not product_raw or product_raw == "nan" or product_raw == "No Products":
            skipped += 1
            continue

        sku_id = map_sku(product_raw)
        if not sku_id:
            skipped += 1
            continue

        txn_id = str(row.get("Transaction ID", ""))
        # นับ index ภายใน transaction เดียวกัน
        txn_counter[txn_id] = txn_counter.get(txn_id, -1) + 1
        sale_key = f"{txn_id}-{txn_counter[txn_id]}"

        # ตรวจว่าขายแบบกล่องหรือซอง จาก product_name_raw
        name_lower = normalize(product_raw)
        is_box = "(box)" in name_lower or "box" in name_lower.split()
        qty_packs = PACKS_PER_BOX.get(sku_id, 24) if is_box else 1

        # Parse วันที่
        sold_at_raw = str(row.get("Transaction Date", ""))
        try:
            sold_at = pd.to_datetime(sold_at_raw).isoformat()
        except:
            sold_at = datetime.now().isoformat()

        records.append({
            "sale_key":         sale_key,
            "transaction_id":   txn_id,
            "machine_id":       str(row.get("KioskID", "")),
            "sku_id":           sku_id,
            "product_name_raw": product_raw,
            "quantity_sold":    qty_packs,
            "grand_total":      float(row.get("Grand Total", 0) or 0),
            "sold_at":          sold_at,
        })

    print(f"  แปลงสำเร็จ: {len(records)} รายการ | ข้าม: {skipped}")
    return records

def save_to_supabase(records: list[dict]):
    """บันทึกลง Supabase (upsert ป้องกันซ้ำ)"""
    if not records:
        print("⚠️  ไม่มีข้อมูลที่จะบันทึก")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"💾 บันทึก {len(records)} รายการลง Supabase...")

    # แบ่งเป็น batch ละ 100
    batch_size = 100
    saved = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        result = supabase.table("sales").upsert(
            batch, on_conflict="sale_key"
        ).execute()
        saved += len(batch)
        print(f"  ✅ batch {i//batch_size + 1}: {len(batch)} รายการ")

    print(f"🎉 บันทึกทั้งหมด {saved} รายการ")

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=1,
                        help="จำนวนวันย้อนหลังที่จะดึง (default: 1 = เมื่อวาน)")
    parser.add_argument("--from-date", type=str, default=None,
                        help="วันเริ่มต้น (YYYY-MM-DD) สำหรับ backfill")
    parser.add_argument("--to-date", type=str, default=None,
                        help="วันสิ้นสุด (YYYY-MM-DD) สำหรับ backfill")
    args = parser.parse_args()

    # คำนวณวันที่ตามเวลาไทย (UTC+7)
    now_bkk = datetime.utcnow() + timedelta(hours=7)

    if args.from_date and args.to_date:
        # Backfill mode: ระบุช่วงวันเอง
        date_from = args.from_date
        date_to   = args.to_date
    elif args.days == 0:
        # Live mode: ดึงข้อมูลวันนี้ (กดปุ่มดึงมือจาก DVX)
        date_from = now_bkk.strftime("%Y-%m-%d")
        date_to   = now_bkk.strftime("%Y-%m-%d")
    else:
        # Daily mode: ดึงเฉพาะ N วันย้อนหลัง (default = เมื่อวาน 1 วัน)
        date_to   = (now_bkk - timedelta(days=1)).strftime("%Y-%m-%d")
        date_from = (now_bkk - timedelta(days=args.days)).strftime("%Y-%m-%d")

    print(f"\n{'='*50}")
    print(f"DivisionX Card — VMS Scraper")
    print(f"เวลาไทย: {now_bkk.strftime('%Y-%m-%d %H:%M')}")
    print(f"ดึงข้อมูล: {date_from} → {date_to}")
    print(f"{'='*50}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            xlsx_path = download_xlsx(page, date_from, date_to)
            records   = parse_xlsx(xlsx_path)
            save_to_supabase(records)
        except Exception as e:
            print(f"❌ Error: {e}")
            raise
        finally:
            browser.close()

if __name__ == "__main__":
    main()
