"""
DivisionX Card — VMS Sales Sync via REST API
ดึงยอดขายผ่าน VMS API โดยตรง (ไม่ใช้ Playwright)
เร็วกว่า XLSX export ~10 เท่า
"""

import os, re, json, argparse, requests
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
    "OP 17": 24,
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
    """ดึง machine_stock จาก Supabase เพื่อ build lookup
    (machine_id, slot) → (sku_id, product_name, product_id, sell_price)

    ⚠ หลัง VMS rebuild · API ไม่ส่ง products+name แล้ว · ต้อง lookup จาก DB
    ⚠ sell_price (migration 071) คือราคาที่ตู้ตั้งไว้ต่อช่อง — จำเป็นเพราะ API ยอดขาย
      ส่งมาแค่ยอดรวมของบิล ไม่มีราคารายชิ้น ถ้าไม่มีราคาต้องหารเฉลี่ยซึ่งผิด
    """
    cols = "machine_id, slot_number, sku_id, product_name, product_id, sell_price"
    try:
        res = supabase.table("machine_stock").select(cols).execute()
    except Exception:
        # ยังไม่ได้รัน migration 071 → ทำงานต่อได้ แต่จะตกไปใช้ราคากลาง/หารเฉลี่ย
        print("⚠️  machine_stock ยังไม่มีคอลัมน์ sell_price (migration 071)")
        res = supabase.table("machine_stock").select(
            "machine_id, slot_number, sku_id, product_name, product_id").execute()
    lookup = {}
    for r in (res.data or []):
        key = (r.get("machine_id") or "", r.get("slot_number") or "")
        sku_id = r.get("sku_id")
        # ถ้า DB ไม่มี sku_id แต่มี product_name → ลอง regex
        if not sku_id and r.get("product_name"):
            sku_id = map_product_to_sku(r["product_name"])
        lookup[key] = (sku_id, r.get("product_name") or "", r.get("product_id"),
                       _num(r.get("sell_price")))
    priced = sum(1 for v in lookup.values() if v[3])
    print(f"🗺  Slot lookup: {len(lookup)} slots ({sum(1 for v in lookup.values() if v[0])} mapped"
          f" · {priced} มีราคา)")
    return lookup


def fetch_sku_prices(supabase) -> dict:
    """ราคากลางต่อซองจากตาราง skus — ใช้เป็นทางสำรองเมื่อช่องนั้นยังไม่มีราคา

    ⚠️ เป็นราคาเดียวใช้ทุกตู้ ซึ่ง VMS ไม่ได้ตั้งแบบนั้น (แยกตามตู้/ช่อง)
       จึงเป็นแค่ทางสำรอง ไม่ใช่ตัวหลัก
    """
    try:
        res = supabase.table("skus").select("sku_id, sell_price").execute()
    except Exception as e:
        print(f"⚠️  โหลดราคากลางจาก skus ไม่ได้: {e}")
        return {}
    return {r["sku_id"]: _num(r.get("sell_price")) for r in (res.data or []) if r.get("sku_id")}


def _num(v):
    """แปลงเป็นเลขบวก · 0/ว่าง/แปลงไม่ได้ = ไม่มีราคา (None)
    ⚠️ 0 ต้องไม่ถือว่าเป็นราคา ไม่งั้นบรรทัดนั้นจะได้เงิน 0 ทั้งที่ลูกค้าจ่ายจริง"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


# เจ้าของสั่ง 2 ก.ย. 2026: เลิกหารทุกกรณี ใช้ราคาสินค้ารายชิ้นเท่านั้น
DRIFT_TOL = 0.05     # ผลรวมราคารายชิ้น ห่างจากยอดบิลได้ไม่เกินนี้ถึงจะถือว่าปกติ


def line_amounts(total: float, prices: list):
    """ยอดของแต่ละบรรทัดในบิลใบเดียว · คืน (ยอดรายบรรทัด, วิธีที่ใช้, ส่วนต่างจากยอดบิล)

    **กติกาข้อเดียว: ยอดของบรรทัด = ราคาสินค้าชิ้นนั้น** ไม่ใช่ส่วนแบ่งของยอดบิล

    ทำไมต้องเลิกหาร (เจ้าของสั่งเอง 2 ก.ย. 2026 หลังเจอของจริงติดกันสองรอบ):
      รอบแรก  หารเท่ากันทุกบรรทัด → บิล 590 (FB04 110 · FB09 230 · OP17 250)
              กลายเป็น 196.67 ทั้งสามบรรทัด
      รอบสอง  เปลี่ยนเป็นถ่วงน้ำหนักตามราคา ก็ยังผิดอยู่ดีเมื่อ "ราคาที่ใช้ถ่วง" ผิด —
              บิล 390 ที่ chukes04 ได้ 8.97 / 381.03 เพราะราคาสำรองของช่องกล่อง
              ถูกคูณ packs_per_box จนกลายเป็น 5,100
      บทเรียน: **การหารคือการเดา** ต่อให้เดาด้วยสูตรที่ดีขึ้น มันก็ยังผิดได้เงียบ ๆ
              และผิดแบบที่ได้ตัวเลขหน้าตาน่าเชื่อถือ ซึ่งไม่มีใครไปสงสัย

    ตอนนี้เรามีราคาต่อช่องจริงใน machine_stock.sell_price (migration 071) แล้ว
    จึงกำหนดยอดตรง ๆ ได้ ไม่ต้องแบ่งอะไรทั้งนั้น

    ⚠️ ส่วนต่างระหว่างผลรวมราคากับยอดบิล **ห้ามเกลี่ยเข้าบรรทัด** — ต้องรายงานออกมา
       เพราะมันคือสัญญาณว่าราคาที่เราถืออยู่ไม่ตรงกับที่ตู้คิดเงินจริง (โปรโมชั่น ·
       ราคาค้างเก่า · ของในช่องเปลี่ยน) การเกลี่ยลงบรรทัดคือการซ่อนสัญญาณนั้น

    ⚠️ ไม่รู้ราคาแม้แต่บรรทัดเดียว = ยังไม่มีข้อมูลพอจะเลิกหาร ต้องหารเฉลี่ยไปก่อน
       และต้องนับไว้ให้เห็น ไม่ใช่ปล่อยเงียบ — ถ้าตัวเลขนี้ไม่เป็น 0
       แปลว่าราคาต่อช่องยังเก็บไม่ครบ ต้องไปแก้ที่ต้นทางนั้น ไม่ใช่มาแก้ที่นี่
    """
    n = len(prices)
    if n == 0:
        return [], "none", 0.0

    if all(p for p in prices):
        out = [round(float(p), 2) for p in prices]
        return out, "price", round(total - sum(out), 2)

    # ทางสุดท้ายเท่านั้น — ไม่มีราคา ก็ไม่มีข้อมูลอื่นให้ใช้นอกจากยอดรวม
    out = [round(total / n, 2)] * n
    diff = round(total - sum(out), 2)
    if diff:
        i = max(range(n), key=lambda k: out[k])
        out[i] = round(out[i] + diff, 2)
    return out, "even", 0.0


def parse_api_sales(api_rows: list[dict], slot_lookup: dict | None = None,
                    sku_prices: dict | None = None) -> list[dict]:
    """แปลง API response เป็น records สำหรับ Supabase
    หลัง VMS rebuild 28 เม.ย. 2026 schema เปลี่ยนเป็น cart + cart_slot (ไม่มี products+name)
    → ใช้ slot_lookup เพื่อแปลง (machine_id, slot_code) → (sku_id, product_name, ราคา)

    ⚠️ บิลที่มีหลายรายการ: VMS ให้มาแค่ยอดรวม ต้องแบ่งเองตามราคาต่อช่อง
       ห้ามหารเท่ากัน — เงินจะไปนั่งผิด SKU (ดู allocate() และ migration 071)
    """
    records = []
    txn_counter = {}
    slot_lookup = slot_lookup or {}
    sku_prices = sku_prices or {}
    skipped_no_lookup = 0
    weighted_txn = even_txn = 0
    drift_total, drift_bills = 0.0, []

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
        # ใช้ cart + cart_slot · lookup product_name + sku_id + ราคา จาก machine_stock
        cart       = row.get("cart") or []
        cart_slot  = row.get("cart_slot") or []

        # ⚠️ ตัวช่วยสืบ (ชั่วคราว) — ตั้ง VMS_DUMP_RAW=1 แล้วดู log
        #
        # ทำไมต้องมี: การหา "ขายสินค้าอะไร" ตอนนี้ไปเดาจาก machine_stock ว่า
        # "ตอนนี้ช่องนั้นมีอะไร" ซึ่งผิดทุกครั้งที่แอดมินเปลี่ยนของแล้วเรายังไม่ได้ sync
        # เคสจริง 1 ก.ย. 2026: chukes04 เปลี่ยนของตอนเช้า เรารู้ตอน 14:19 น.
        # บิล 10:45 กับ 14:05 จึงถูกป้ายเป็นสินค้าตัวเก่าทั้งคู่ (หลังบ้าน VMS บอก OP-17/OP-08
        # แต่เราบันทึก MLP / NRT Jin-2 + PRB 01) — 118/143 แถวของตู้นั้นผิดด้วยเหตุนี้
        #
        # ถ้า cart[] มีรหัส/ชื่อสินค้าติดมาด้วย เราต้องใช้ตัวนั้นแทนการเดาจากช่อง
        # เพราะมันคือข้อเท็จจริงของบิลใบนั้น ไม่ใช่สภาพตู้ ณ เวลาที่เราไป sync
        if os.environ.get("VMS_DUMP_RAW") and cart:
            print(f"  🔍 RAW row keys: {sorted(row.keys())}")
            print(f"  🔍 cart      = {json.dumps(cart, ensure_ascii=False)[:600]}")
            print(f"  🔍 cart_slot = {json.dumps(cart_slot, ensure_ascii=False)[:300]}")
            os.environ.pop("VMS_DUMP_RAW")      # พิมพ์ครั้งเดียวพอ ไม่ให้ log ท่วม
        n_items = len(cart_slot) or len(cart)
        if n_items == 0:
            continue

        # รอบแรก: แปลงทุกช่องในบิลให้เป็นรายการก่อน แล้วค่อยแบ่งเงิน
        # ต้องรู้ราคาของ *ทุก* บรรทัดก่อน ถึงจะถ่วงน้ำหนักได้ถูก
        line_items = []
        for slot_code in cart_slot:
            slot_str = str(slot_code) if slot_code is not None else ""
            sku_id, product_name, product_id_val, slot_price = \
                slot_lookup.get((machine_id, slot_str), (None, "", None, None))
            is_box = unit_of(product_name) == "box"
            # ราคาสำรองจากตาราง skus เป็นราคา "ต่อซอง" — ช่องกล่องต้องคูณกลับ
            # ไม่งั้นบิลที่มีทั้งกล่องและซองจะถ่วงน้ำหนักผิดหนัก
            fallback = sku_prices.get(sku_id) if sku_id else None
            if fallback and is_box:
                fallback = fallback * PACKS_PER_BOX.get(sku_id, 24)
            line_items.append({
                "sku_id": sku_id, "product_name": product_name,
                "product_id": product_id_val, "slot": slot_str,
                "is_box": is_box, "price": slot_price or fallback,
            })

        prices = [li["price"] for li in line_items]
        amounts, method, drift = line_amounts(total_price, prices)
        if method == "price":
            weighted_txn += 1
            # ⚠️ เก็บส่วนต่างไว้รายงาน ไม่เกลี่ยลงบรรทัด — มันคือสัญญาณว่าราคาที่เราถือ
            #    ไม่ตรงกับที่ตู้คิดเงินจริง เกลี่ยลงไปเมื่อไหร่คือกลบสัญญาณทิ้ง
            if abs(drift) > DRIFT_TOL:
                drift_total += drift
                drift_bills.append((txn_id, machine_id, total_price, round(sum(amounts), 2)))
        else:
            even_txn += 1

        for li, amount in zip(line_items, amounts):
            if not li["sku_id"]:
                # ช่องที่ map ไม่ได้ → ทิ้งทั้งบรรทัดพร้อมส่วนแบ่งของมัน
                # (ไม่โยนเงินไปให้บรรทัดอื่น ไม่งั้น SKU อื่นจะพองเกินจริง)
                skipped_no_lookup += 1
                continue
            txn_counter[txn_id] = txn_counter.get(txn_id, -1) + 1
            sale_key = f"{txn_id}-{txn_counter[txn_id]}"
            qty = PACKS_PER_BOX.get(li["sku_id"], 24) if li["is_box"] else 1
            records.append({
                "sale_key": sale_key,
                "transaction_id": txn_id,
                "machine_id": machine_id,
                "sku_id": li["sku_id"],
                "product_name_raw": li["product_name"],
                "quantity_sold": qty,
                "grand_total": amount,
                "sold_at": sold_at,
                "slot_number": li["slot"] or None,
                "product_id":  li["product_id"],
            })

    if skipped_no_lookup:
        print(f"  ⚠️ skip {skipped_no_lookup} items: ไม่พบ slot ใน machine_stock (อาจต้อง trigger stock sync ก่อน)")
    if weighted_txn or even_txn:
        print(f"  💰 ใช้ราคาสินค้ารายชิ้น {weighted_txn} บิล · หารเฉลี่ยเพราะไม่รู้ราคา {even_txn} บิล")
        if even_txn:
            print("     ⚠️ บิลที่ยังต้องหารเฉลี่ยคือบิลที่เรายังไม่มีราคาต่อช่อง —")
            print("        แก้ที่ต้นทาง (รัน migration 071 + sync สต็อกให้ครบทุกตู้) ไม่ใช่แก้ที่สูตรแบ่งเงิน")
    if drift_bills:
        print(f"  ⚠️ ราคาที่เราถือ ไม่ตรงกับยอดที่ตู้คิดเงินจริง {len(drift_bills)} บิล "
              f"· ต่างรวม {drift_total:+,.2f} บาท")
        print("     (โปรโมชั่น · ราคาค้างเก่า · หรือของในช่องเปลี่ยนแล้วสต็อกยังไม่ sync)")
        for t, mid, tot, ours in drift_bills[:5]:
            print(f"        {mid} บิล {t[:16]} ตู้คิด {tot:,.2f} · ราคาที่เรารวมได้ {ours:,.2f}")
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
    sku_prices  = fetch_sku_prices(supabase)   # ทางสำรองเมื่อช่องนั้นยังไม่มีราคา

    records = parse_api_sales(api_rows, slot_lookup, sku_prices)
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
