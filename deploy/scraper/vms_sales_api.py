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
# ตรวจกล่อง/ซองด้วยตัวกลาง sales_unit.unit_of — เดิมแต่ละไฟล์เขียนเงื่อนไขเอง
# แล้วหลุดชื่อที่มีอักขระแปลกปน เช่น "PRB - 02 (ฺBox)" (มี U+0E3A ก่อนคำว่า Box)
# ทำให้ 31 รายการนับเป็นซองเดี่ยว ได้ 1 แทนที่จะเป็น 10 ซอง
from sales_unit import unit_of, add_unit, upsert_sales  # noqa: E402

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
    # Naming Contract 2026-05-19: ใช้ short code (NRT/SLL/PKM) เป็น sku_id
    "NRT Series - 01": 30, "NRT Series - 02": 30, "NRT Jin - 1": 10,
    "PKM Dream EX": 10, "PKM Ninja": 30,
    "SLL UA 51": 16,
    # YGH ขายที่ตู้ VMS ด้วย (sku_id มาจาก slot lookup) — Chaos Origins 30 ซอง/กล่อง (2026-07-29)
    "YGH The Heroes": 15, "YGH The Revals": 15, "YGH Chaos Origins": 30,
    # สินค้าใหม่ 2026-08-13 (ตู้ chukes01-03) — เจ้าของยืนยันตัวเลขเอง
    "YGH UT01": 15, "TF Overdrive 01": 15, "MLP SEA02": 30, "MLP BP-01": 20,
    "PKM Ghost": 30,
    "MLBB HOD - 02": 20,
    "NRT Jin - 2": 10,
    "OP 16": 24,
}

# Direct mapping สำหรับ SKU ที่ไม่มี pattern prefix+number (Naruto/Pokemon/SOLO)
# key = substring ตรวจใน lowercase name · value = sku_id (short code) ใน DB
# รับทั้งชื่อเก่า (legacy) และชื่อมาตรฐานใหม่ (canonical) — backward compat
DIRECT_MAP = {
    # ── ชื่อมาตรฐานใหม่ (canonical name หลัง admin rename) — check ก่อน ──
    "naruto series - 02": "NRT Series - 02",
    "naruto series - 01": "NRT Series - 01",
    "naruto jin - 1":     "NRT Jin - 1",
    "pokemon dream ex":   "PKM Dream EX",
    "pokemon ninja":      "PKM Ninja",
    "solo leveling ua 51": "SLL UA 51",
    # ── ชื่อเก่า (legacy · ก่อน admin rename) — fallback ──
    "naruto series2":  "NRT Series - 02",
    "naruto series1":  "NRT Series - 01",
    "naruto jin1":     "NRT Jin - 1",
    "pokemon maga ex": "PKM Dream EX",
    "solo leveling":   "SLL UA 51",
    # ── mirror vms_stock_sync.py — ไฟล์นี้เคยตกหล่นจนยอดขายถูกทิ้งทั้งแถว ──
    # ตู้ VMS ส่ง 'Pokemon Ghost ' (มีช่องว่างท้าย) · strip() ในฟังก์ชันจัดการแล้ว
    "pokemon ghost":   "PKM Ghost",
    "abyss":           "PKM Ghost",   # 2026-08-13 หลังบ้านเปลี่ยนชื่อเป็น M5 Abyss Eye
    "chaos origins":   "YGH Chaos Origins",
    "limited over":    "YGH The Revals",
    "the revals":      "YGH The Revals",
    # ⚠ ตู้ chukes ยังสะกด "Revals" · WW แก้เป็น "Rivals" แล้ว → ต้องรับทั้งสองคำ
    "the rivals":      "YGH The Revals",
    "the heroes":      "YGH The Heroes",
    # ── สินค้าใหม่ 2026-08-13 (chukes01-04 + wwv03/04) ──
    # ⚠ MLP มี 2 ไลน์แล้ว (SEA / BP) ถ้ามี SEA03 หรือ BP-02 ตามมา
    #    ต้องเลิก substring เปลี่ยนเป็น regex ที่บังคับมีเลขชุด ไม่งั้นชุดใหม่ถูกชุดเก่ากลืน
    "pony sea02":      "MLP SEA02",
    "pony bp-01":      "MLP BP-01",
    "overdrive":       "TF Overdrive 01",
    "ut01":            "YGH UT01",
}

def map_product_to_sku(product_name: str) -> str | None:
    if not product_name: return None
    # ยุบช่องว่างซ้ำก่อนเทียบ — หลังบ้านบางตู้พิมพ์ 'Pokemon  Dream EX' (เว้นสองครั้ง)
    # แล้ว substring map ที่เขียนด้วยช่องว่างเดียวจะไม่ติด → sku_id เป็น null แบบเงียบ ๆ
    # (payif ทำแบบนี้อยู่แล้ว ไฟล์อื่นตกไป)
    name = re.sub(r"\s+", " ", product_name.lower().strip())
    # B29 standalone (Dragonball special) — check ก่อน เพื่อกัน FB pattern match ผิด
    if re.search(r'\bb29\b', name):
        return "B29"
    m = re.search(r'\bop\s*[-–]?\s*(\d+)', name)
    if m: return f"OP {m.group(1).zfill(2)}"
    m = re.search(r'prb\s*[-–]\s*(\d+)', name)
    if m: return f"PRB {m.group(1).zfill(2)}"
    m = re.search(r'eb\s*[-–]\s*(\d+)', name)
    if m: return f"EB {m.group(1).zfill(2)}"
    m = re.search(r'fb\s*[-–]?\s*(\d+)', name)
    if m: return f"FB {m.group(1).zfill(2)}"
    # Naruto Jin — "naruto jin - 1" / "naruto jin2" (เลขเดี่ยว ไม่ zero-pad ตาม sku เดิม)
    m = re.search(r'naruto\s*jin\s*[-–]?\s*(\d+)', name)
    if m:
        return f"NRT Jin - {int(m.group(1))}"
    # MLBB Hand of Destiny — "mlbb hand of destiny 02"
    m = re.search(r'hand\s*of\s*destiny\s*[-–]?\s*(\d+)', name)
    if m:
        return f"MLBB HOD - {m.group(1).zfill(2)}"
    # Fallback: direct map สำหรับ Naruto/Pokemon/SOLO (ชื่อไม่เป็น pattern)
    for key, sku in DIRECT_MAP.items():
        if key in name:
            return sku
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

def fetch_slot_lookup(supabase) -> dict:
    """ดึง machine_stock จาก Supabase เพื่อ build lookup (machine_id, slot) → (sku_id, product_name, product_id)
    ⚠ หลัง VMS rebuild · API ไม่ส่ง products+name แล้ว · ต้อง lookup จาก DB
    """
    res = supabase.table("machine_stock").select(
        "machine_id, slot_number, sku_id, product_name, product_id"
    ).execute()
    lookup = {}
    for r in (res.data or []):
        key = (r.get("machine_id") or "", r.get("slot_number") or "")
        sku_id = r.get("sku_id")
        # ถ้า DB ไม่มี sku_id แต่มี product_name → ลอง regex
        if not sku_id and r.get("product_name"):
            sku_id = map_product_to_sku(r["product_name"])
        lookup[key] = (sku_id, r.get("product_name") or "", r.get("product_id"))
    print(f"🗺  Slot lookup: {len(lookup)} slots ({sum(1 for v in lookup.values() if v[0])} mapped)")
    return lookup


def parse_api_sales(api_rows: list[dict], slot_lookup: dict | None = None) -> list[dict]:
    """แปลง API response เป็น records สำหรับ Supabase
    หลัง VMS rebuild 28 เม.ย. 2026 schema เปลี่ยนเป็น cart + cart_slot (ไม่มี products+name)
    → ใช้ slot_lookup เพื่อแปลง (machine_id, slot_code) → (sku_id, product_name)
    """
    records = []
    txn_counter = {}
    slot_lookup = slot_lookup or {}
    skipped_no_lookup = 0

    for row in api_rows:
        txn_id = str(
            row.get("txid")
            or row.get("transaction_id")
            or row.get("record_id")
            or row.get("id")
            or ""
        )
        machine_id = str(row.get("kiosk_id", ""))
        sold_at = row.get("created_at", row.get("transaction_date", ""))
        total_price = float(
            row.get("total_price")
            or row.get("grand_total")
            or row.get("total_amount")
            or 0
        )
        status = row.get("status", "")

        if status and status.lower() != "paid":
            continue
        if not txn_id:
            continue

        # ── Path A: schema เก่ามี products[] (ใน API older versions) ──
        products = row.get("products", [])
        if products:
            for prod in products:
                product_raw = prod.get("product_name", prod.get("name", ""))
                sku_id = map_product_to_sku(product_raw)
                if not sku_id: continue
                txn_counter[txn_id] = txn_counter.get(txn_id, -1) + 1
                sale_key = f"{txn_id}-{txn_counter[txn_id]}"
                name_lower = normalize(product_raw)
                is_box = unit_of(product_raw) == "box"
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
                    "slot_number": prod.get("slot") or prod.get("slot_number") or None,
                    "product_id":  prod.get("product_id") or prod.get("id") or None,
                })
            continue

        # ── Path B: schema ใหม่ (post-rebuild 28 เม.ย.) ──
        # ใช้ cart + cart_slot · lookup product_name + sku_id จาก machine_stock
        cart       = row.get("cart") or []
        cart_slot  = row.get("cart_slot") or []
        n_items = len(cart_slot) or len(cart)
        if n_items == 0:
            continue
        per_item_price = total_price / n_items if n_items else 0
        for slot_code in cart_slot:
            slot_str = str(slot_code) if slot_code is not None else ""
            sku_id, product_name, product_id_val = slot_lookup.get((machine_id, slot_str), (None, "", None))
            if not sku_id:
                skipped_no_lookup += 1
                continue
            txn_counter[txn_id] = txn_counter.get(txn_id, -1) + 1
            sale_key = f"{txn_id}-{txn_counter[txn_id]}"
            name_lower = normalize(product_name)
            is_box = unit_of(product_name) == "box"
            qty = PACKS_PER_BOX.get(sku_id, 24) if is_box else 1
            records.append({
                "sale_key": sale_key,
                "transaction_id": txn_id,
                "machine_id": machine_id,
                "sku_id": sku_id,
                "product_name_raw": product_name,
                "quantity_sold": qty,
                "grand_total": per_item_price,
                "sold_at": sold_at,
                "slot_number": slot_str if slot_str else None,
                "product_id":  product_id_val,
            })

    if skipped_no_lookup:
        print(f"  ⚠️ skip {skipped_no_lookup} items: ไม่พบ slot ใน machine_stock (อาจต้อง trigger stock sync ก่อน)")
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
        # ⚠ ignore_duplicates=True · กัน overwrite product_name + sku_id หลัง admin เปลี่ยนสินค้า slot
        # (VMS API คืน current name · ถ้า upsert จะ overwrite ประวัติเดิม)
        upsert_sales(supabase, add_unit(batch, "product_name_raw"))
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

    # Build slot lookup จาก machine_stock (จำเป็นสำหรับ schema ใหม่)
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    slot_lookup = fetch_slot_lookup(supabase)

    records = parse_api_sales(api_rows, slot_lookup)
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
