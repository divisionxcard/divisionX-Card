"""
DivisionX Card — VMS Machine Stock Sync
ดึงสต็อกหน้าตู้ผ่าน VMS REST API (ไม่ใช้ Playwright)
"""

import os, requests
from datetime import datetime, timedelta
from urllib.parse import urlparse
from supabase import create_client

# ── Image cache (memory) — กัน re-upload product_id เดิมหลายรอบใน run นี้ ──
_image_cache: dict = {}
# Cache lookup ใน Supabase Storage (1 list call ต่อ run · กัน list ซ้ำ)
_existing_files: set | None = None

def cache_vms_image(supabase, product_id, vms_url: str | None) -> str | None:
    """Download VMS image + upload Supabase Storage · return permanent public URL

    - return None ถ้า product_id หรือ vms_url ว่าง
    - in-memory cache สำหรับ run นี้
    - skip download ถ้าไฟล์อยู่ใน bucket อยู่แล้ว (one-time list)
    - bucket: vms-product-images (public read)
    """
    global _existing_files
    if not product_id or not vms_url:
        return None
    if product_id in _image_cache:
        return _image_cache[product_id]

    BUCKET = "vms-product-images"

    # ตรวจ ext จาก URL path (signed URL อาจไม่มี ext ตรง — fallback jpg)
    path = urlparse(vms_url).path.lower()
    ext = "jpg"
    for e in ("jpg", "jpeg", "png", "webp"):
        if path.endswith("." + e):
            ext = e
            break
    filename = f"{product_id}.{ext}"

    # List bucket ครั้งเดียวต่อ run · cache filename set
    if _existing_files is None:
        try:
            items = supabase.storage.from_(BUCKET).list("", {"limit": 10000})
            _existing_files = {it["name"] for it in items}
            print(f"  📦 Image cache: พบ {len(_existing_files)} ไฟล์ใน bucket")
        except Exception as e:
            print(f"  ⚠️  List bucket failed: {e} (treat as empty)")
            _existing_files = set()

    if filename in _existing_files:
        url = supabase.storage.from_(BUCKET).get_public_url(filename)
        _image_cache[product_id] = url
        return url

    # Download จาก VMS
    try:
        r = requests.get(vms_url, timeout=30)
        if r.status_code != 200:
            print(f"  ⚠️  Download {product_id}: HTTP {r.status_code}")
            return None
        image_bytes = r.content
    except Exception as e:
        print(f"  ⚠️  Download {product_id}: {e}")
        return None

    # Upload Supabase Storage
    try:
        content_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
        supabase.storage.from_(BUCKET).upload(
            filename, image_bytes,
            file_options={"content-type": content_type, "upsert": "true"}
        )
        url = supabase.storage.from_(BUCKET).get_public_url(filename)
        _image_cache[product_id] = url
        _existing_files.add(filename)
        print(f"  ✅ Cached image product_id={product_id} ({len(image_bytes)//1024}KB)")
        return url
    except Exception as e:
        print(f"  ⚠️  Upload {product_id}: {e}")
        return None

# ── Config ────────────────────────────────────────────────────
VMS_API_BASE = "https://api.inboxcorp.co.th/internal/v1"
VMS_USER     = os.environ["VMS_USERNAME"]
VMS_PASS     = os.environ["VMS_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# ── Kiosk mapping: machine_id → { record_id, tabs } ──────────
# tabs = จำนวน Tab ของตู้ (ตอนนี้ทุกตู้ 1 Tab = 60 ช่อง · update ถ้ามีตู้ 2 tab)
# ⚠ record_id เปลี่ยนจาก 40-43 → 4-7 หลัง VMS rebuild (18-19 เม.ย. 2026)
KIOSKS = {
    "chukes01": { "record_id": 4, "tabs": 1 },
    "chukes02": { "record_id": 5, "tabs": 1 },
    "chukes03": { "record_id": 6, "tabs": 1 },
    "chukes04": { "record_id": 7, "tabs": 1 },
}

# ── Map VMS product name → SKU ID ─────────────────────────────
def map_product_to_sku(product_name: str) -> str | None:
    """แปลงชื่อสินค้า VMS เป็น SKU ID เช่น 'One Piece OP - 01 Pack' → 'OP 01'"""
    if not product_name:
        return None
    name = product_name.lower().strip()
    import re
    # B29 standalone (Dragonball special, ไม่มี prefix) — check ก่อน
    if re.search(r'\bb29\b', name):
        return "B29"
    # OP series: "one piece op - 01 pack" / "one piece op - 01 (box)"
    m = re.search(r'\bop\s*[-–]?\s*(\d+)', name)
    if m: return f"OP {m.group(1).zfill(2)}"
    # PRB series: "prb - 01 (pack)"
    m = re.search(r'prb\s*[-–]\s*(\d+)', name)
    if m: return f"PRB {m.group(1).zfill(2)}"
    # EB series: "one piece eb - 01 pack"
    m = re.search(r'eb\s*[-–]\s*(\d+)', name)
    if m: return f"EB {m.group(1).zfill(2)}"
    # FB (Dragonball Fusion World) — "fb - 01"
    m = re.search(r'fb\s*[-–]?\s*(\d+)', name)
    if m: return f"FB {m.group(1).zfill(2)}"
    # Fallback: direct map สำหรับ Naruto/Pokemon/SOLO (ชื่อไม่เป็น pattern prefix+number)
    # key = substring lowercase · check series2 ก่อน series1 กัน prefix collision
    for key, sku in (
        ("naruto series2",  "Naruto Series2"),
        ("naruto series1",  "Naruto Series1"),
        ("naruto jin1",     "Naruto Jin1"),
        ("pokemon maga ex", "POKEMON MAGA EX"),
        ("pokemon ninja",   "POKEMON NINJA"),
        ("solo leveling",   "SOLO Leveling"),
    ):
        if key in name:
            return sku
    return None

def login() -> str:
    """Login VMS API → JWT Token"""
    print("🔐 Login VMS API...")
    res = requests.post(f"{VMS_API_BASE}/auth/", json={
        "username": VMS_USER,
        "password": VMS_PASS,
    })
    res.raise_for_status()
    data = res.json()
    if data.get("status") != "success":
        raise Exception(f"Login failed: {data}")
    print("  ✅ Login สำเร็จ")
    return data["token"]

def get_slots(token: str, kiosk_record_id: int, num_tabs: int = 1) -> list[dict]:
    """ดึงข้อมูล slot ทั้งหมดของตู้"""
    headers = {"Authorization": f"Bearer {token}"}
    all_slots = []
    for tab in range(1, num_tabs + 1):
        res = requests.get(
            f"{VMS_API_BASE}/slots/{tab}",
            params={"kiosk_record_id": kiosk_record_id},
            headers=headers,
        )
        if res.status_code == 200:
            data = res.json()
            if data.get("status") == "success" and data.get("data"):
                all_slots.extend(data["data"])
        else:
            print(f"  ⚠️  Tab {tab} returned {res.status_code}")
    return all_slots

def save_to_supabase(records: list[dict]):
    """บันทึกลง Supabase (upsert by machine_id + slot_number)"""
    if not records:
        print("⚠️  ไม่มีข้อมูลที่จะบันทึก")
        return
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"💾 บันทึก {len(records)} slots ลง Supabase...")
    # Batch upsert
    batch_size = 100
    saved = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        supabase.table("machine_stock").upsert(
            batch, on_conflict="machine_id,slot_number"
        ).execute()
        saved += len(batch)
    print(f"🎉 บันทึกสำเร็จ {saved} slots")

def main():
    now_bkk = datetime.utcnow() + timedelta(hours=7)
    print(f"\n{'='*50}")
    print(f"DivisionX Card — VMS Stock Sync")
    print(f"เวลาไทย: {now_bkk.strftime('%Y-%m-%d %H:%M')}")
    print(f"ตู้ทั้งหมด: {len(KIOSKS)} ตู้")
    print(f"{'='*50}\n")

    token = login()
    synced_at = datetime.utcnow().isoformat()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    all_records = []
    machines_with_data = 0

    for machine_id, cfg in KIOSKS.items():
        record_id = cfg["record_id"]
        num_tabs  = cfg["tabs"]
        print(f"\n📦 ดึงข้อมูล {machine_id} (record_id={record_id}, tabs={num_tabs})...")
        slots = get_slots(token, record_id, num_tabs)
        print(f"  ✅ พบ {len(slots)} slots")
        if len(slots) > 0:
            machines_with_data += 1

        for slot in slots:
            product_name = slot.get("product_name") or None
            product_id   = slot.get("product_id")
            vms_img      = slot.get("product_img") or None
            # Re-host VMS image เป็น permanent URL (ไม่ expire)
            permanent_img = cache_vms_image(supabase, product_id, vms_img) or vms_img
            all_records.append({
                "machine_id":      machine_id,
                "kiosk_record_id": record_id,
                "slot_number":     slot.get("slot_number") or "",
                "product_id":      product_id,
                "product_name":    product_name,
                "product_img":     permanent_img,
                "sku_id":          map_product_to_sku(product_name),
                "remain":          slot.get("remain") or 0,
                "max_capacity":    slot.get("max_capacity") or 0,
                "is_occupied":     bool(slot.get("is_occupied")),
                "status":          slot.get("status") or "inactive",
                "synced_at":       synced_at,
            })

    print(f"\n📊 รวม {len(all_records)} slots จาก {len(KIOSKS)} ตู้")

    # Fail loud ถ้าทุกตู้ดึงข้อมูลไม่ได้เลย
    # (ป้องกัน "sync ตายเงียบ" เช่นตอน VMS rebuild ทำให้ kiosk_record_id เปลี่ยน)
    if machines_with_data == 0:
        raise SystemExit(
            f"ERROR: ทุกตู้ดึงข้อมูลไม่ได้เลย ({len(KIOSKS)} ตู้) · "
            "VMS API อาจ down หรือ kiosk_record_id เปลี่ยน · "
            "ตรวจ KIOSKS ใน deploy/scraper/vms_stock_sync.py และ workflow log"
        )

    save_to_supabase(all_records)

if __name__ == "__main__":
    main()
