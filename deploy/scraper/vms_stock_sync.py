"""
DivisionX Card — VMS Machine Stock Sync
ดึงสต็อกหน้าตู้ผ่าน VMS REST API (ไม่ใช้ Playwright)
"""

import os, re, requests
from datetime import datetime, timedelta
from urllib.parse import urlparse
from supabase import create_client

# unit (กล่อง/ซอง) มาจากชื่อสินค้า — SKU เดียวขายทั้งสองแบบในตู้เดียวกัน
from sales_unit import add_unit, upsert_sales  # noqa: E402

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
    # ยุบช่องว่างซ้ำก่อนเทียบ — หลังบ้านบางตู้พิมพ์ 'Pokemon  Dream EX' (เว้นสองครั้ง)
    # แล้ว substring map ที่เขียนด้วยช่องว่างเดียวจะไม่ติด → sku_id เป็น null แบบเงียบ ๆ
    # (payif ทำแบบนี้อยู่แล้ว ไฟล์อื่นตกไป)
    name = re.sub(r"\s+", " ", product_name.lower().strip())
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
    # Naruto Jin — "naruto jin - 1" / "naruto jin2" (เลขเดี่ยว ไม่ zero-pad ตาม sku เดิม)
    m = re.search(r'naruto\s*jin\s*[-–]?\s*(\d+)', name)
    if m:
        return f"NRT Jin - {int(m.group(1))}"
    # MLBB Hand of Destiny — "mlbb hand of destiny 02"
    m = re.search(r'hand\s*of\s*destiny\s*[-–]?\s*(\d+)', name)
    if m:
        return f"MLBB HOD - {m.group(1).zfill(2)}"
    # Fallback: direct map สำหรับ Naruto/Pokemon/SOLO (ชื่อไม่เป็น pattern prefix+number)
    # key = substring lowercase · check series2 ก่อน series1 กัน prefix collision
    for key, sku in (
        # canonical names (หลัง admin rename) — check ก่อน
        ("naruto series - 02", "NRT Series - 02"),
        ("naruto series - 01", "NRT Series - 01"),
        ("naruto jin - 1",     "NRT Jin - 1"),
        ("pokemon dream ex",   "PKM Dream EX"),
        ("pokemon ninja",      "PKM Ninja"),
        ("solo leveling ua 51","SLL UA 51"),
        # legacy names — fallback
        ("naruto series2",  "NRT Series - 02"),
        ("naruto series1",  "NRT Series - 01"),
        ("naruto jin1",     "NRT Jin - 1"),
        ("pokemon maga ex", "PKM Dream EX"),
        ("solo leveling",   "SLL UA 51"),
        # สินค้าใหม่ 2026-06 (ขายทั้งตู้ VMS + WW) — mirror worldwide_stock_sync.py
        # ตู้ VMS ส่ง 'Pokemon Ghost ' (มีช่องว่างท้าย) · strip() ด้านบนจัดการแล้ว
        ("pokemon ghost",   "PKM Ghost"),
        # 2026-08-13 หลังบ้าน WW เปลี่ยนชื่อชุดนี้เป็น "Pokemon M5 Abyss Eye"
        # ใส่ที่ VMS ด้วยเผื่อตู้ chukes เปลี่ยนตามทีหลัง
        ("abyss",           "PKM Ghost"),
        ("chaos origins",   "YGH Chaos Origins"),
        ("limited over",    "YGH The Revals"),
        ("the revals",      "YGH The Revals"),
        # 2026-08-13 หลังบ้าน WW แก้คำสะกดเป็น "Rivals" · ใส่ที่ VMS ด้วยเผื่อแก้ตามทีหลัง
        # ⚠ ตู้ chukes ยังใช้ "Revals" อยู่ → ต้องรับทั้งสองคำ ห้ามลบบรรทัดบน
        ("the rivals",      "YGH The Revals"),
        ("the heroes",      "YGH The Heroes"),
        # ── สินค้าใหม่ 2026-08-13 (ลงตู้ chukes01-03 · ช่องซอง ความจุ 12) ──
        # ⚠ MLP มี 2 ไลน์แล้ว (SEA / BP) ถ้าวันหน้ามี SEA03, BP-02 ตามมา
        #    ให้เลิกใช้ substring แล้วเปลี่ยนเป็น regex ที่บังคับมีเลขชุด
        #    ไม่งั้นชุดใหม่จะถูกชุดเก่ากลืน แบบเดียวกับที่เคยเกิดกับ Naruto Jin
        ("pony sea02",      "MLP SEA02"),
        ("pony bp-01",      "MLP BP-01"),
        ("overdrive",       "TF Overdrive 01"),
        ("ut01",            "YGH UT01"),
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

def _num(v):
    """ราคาจาก API มาเป็น str บ้าง None บ้าง — เอาที่แปลงเป็นเลขได้จริงเท่านั้น
    ⚠️ 0 ถือว่า "ไม่มีราคา" (คืน None) ไม่ใช่ "ของฟรี" — ถ้าปล่อย 0 ไปถ่วงน้ำหนัก
       บรรทัดนั้นจะได้เงิน 0 บาททั้งที่ลูกค้าจ่ายจริง"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def _has_sell_price(supabase) -> bool:
    """machine_stock มีคอลัมน์ sell_price แล้วหรือยัง (migration 071)"""
    try:
        supabase.table("machine_stock").select("sell_price").limit(1).execute()
        return True
    except Exception:
        return False


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
        upsert_sales(supabase, add_unit(batch, "product_name"),
                     table="machine_stock", on_conflict="machine_id,slot_number",
                     ignore_duplicates=False)   # ต้องอัปเดตของเดิม ไม่ใช่ข้าม
        saved += len(batch)
    print(f"🎉 บันทึกสำเร็จ {saved} slots")


def detect_slot_changes(supabase, current_records: list[dict], synced_at: str):
    """ตรวจ slot product เปลี่ยน · update slot_products_history + ส่ง Telegram alert

    Logic:
      - สำหรับแต่ละ slot ในรอบ sync นี้:
        - ดู active record ใน slot_products_history (effective_to IS NULL)
        - ถ้าไม่มี → INSERT new active record (ไม่ alert · เป็น initial seed)
        - ถ้ามี + product_id ตรงกัน → ไม่ทำอะไร
        - ถ้ามี + product_id ต่างกัน → ปิด old (set effective_to + pending_qty) + INSERT new + alert

    IMPORTANT: ต้องเรียกฟังก์ชันนี้ "ก่อน" save_to_supabase
              เพื่อให้ machine_stock.remain ยังเป็นค่าของ "สินค้าเก่า" (ใช้เป็น pending_qty)
    """
    if not current_records:
        return

    # 0. Snapshot machine_stock.remain ก่อนที่จะถูก save_to_supabase ทับ
    #    เก็บไว้เป็น pending_qty ของ closed period (= สินค้าเก่าเหลือกี่ packs ใน slot นั้น)
    try:
        ms_res = supabase.table("machine_stock").select(
            "machine_id, slot_number, remain"
        ).execute()
        remain_map = {(r["machine_id"], r["slot_number"]): r.get("remain") for r in (ms_res.data or [])}
    except Exception:
        remain_map = {}

    # 1. โหลด active history ทั้งหมด (รวม product_name สำหรับ alert)
    res = supabase.table("slot_products_history").select(
        "id, machine_id, slot_number, product_id, product_name, sku_id"
    ).is_("effective_to", "null").execute()
    active = {(r["machine_id"], r["slot_number"]): r for r in (res.data or [])}

    # โหลด machine names ครั้งเดียว สำหรับ alert
    try:
        mres = supabase.table("machines").select("machine_id, name").execute()
        machine_names = {m["machine_id"]: m.get("name") for m in (mres.data or [])}
    except Exception:
        machine_names = {}

    to_close = []  # id ของ records ที่ต้อง close
    to_insert = []
    change_events = []  # list of (old_row, new_record) สำหรับ alert · ไม่รวม initial seed
    changes = 0

    for rec in current_records:
        key = (rec["machine_id"], rec["slot_number"])
        pid_new = rec.get("product_id")
        # skip empty slots ที่ไม่เคยมีของ
        if pid_new is None and key not in active:
            continue
        existing = active.get(key)
        if existing is None:
            # New slot · INSERT (ไม่ alert · เป็น initial seed)
            to_insert.append({
                "machine_id":       rec["machine_id"],
                "slot_number":      rec["slot_number"],
                "product_id":       pid_new,
                "product_name":     rec.get("product_name"),
                "sku_id":           rec.get("sku_id"),
                "effective_from":   synced_at,
                "detected_by":      "vms_stock_sync",
                "initial_qty":      rec.get("remain"),
                "initial_capacity": rec.get("max_capacity"),
            })
            changes += 1
        elif existing["product_id"] != pid_new:
            # Product changed · close old + insert new + queue alert
            # pending_qty = machine_stock.remain ก่อน save = จำนวน "สินค้าเก่า" ที่เหลืออยู่
            to_close.append({"id": existing["id"], "pending_qty": remain_map.get(key)})
            to_insert.append({
                "machine_id":       rec["machine_id"],
                "slot_number":      rec["slot_number"],
                "product_id":       pid_new,
                "product_name":     rec.get("product_name"),
                "sku_id":           rec.get("sku_id"),
                "effective_from":   synced_at,
                "detected_by":      "vms_stock_sync",
                "initial_qty":      rec.get("remain"),
                "initial_capacity": rec.get("max_capacity"),
            })
            change_events.append((existing, rec))
            changes += 1
        # else: same product · skip

    if to_close:
        # ปิด period เก่า · batch update · เก็บ pending_qty (snapshot ก่อน save_to_supabase)
        for cid_info in to_close:
            cid = cid_info["id"] if isinstance(cid_info, dict) else cid_info
            payload = {"effective_to": synced_at}
            if isinstance(cid_info, dict) and cid_info.get("pending_qty") is not None:
                payload["pending_qty"] = cid_info["pending_qty"]
            supabase.table("slot_products_history").update(payload).eq("id", cid).execute()

    if to_insert:
        # Insert new periods · ignore duplicates (กัน race condition)
        supabase.table("slot_products_history").upsert(
            to_insert, ignore_duplicates=True
        ).execute()

    if changes:
        print(f"📜 slot_products_history: {changes} changes · {len(to_close)} closed · {len(to_insert)} inserted")
    else:
        print(f"📜 slot_products_history: no changes")

    # 2. ส่ง Telegram alert · batch ตาม machine_id (1 ข้อความ/ตู้/sync)
    if change_events:
        try:
            from telegram_alert import alert_slot_changes_batch
            from datetime import datetime as _dt
            # parse synced_at เป็น unix epoch สำหรับ batch callback window
            try:
                synced_dt = _dt.fromisoformat(synced_at.replace("Z", "+00:00"))
                synced_unix = int(synced_dt.timestamp())
            except Exception:
                synced_unix = int(_dt.utcnow().timestamp())

            # group by machine_id
            by_machine = {}
            for old_row, new_rec in change_events:
                mid = old_row["machine_id"]
                by_machine.setdefault(mid, []).append({
                    "slot_number": old_row["slot_number"],
                    "old_product": old_row.get("product_name") or "—",
                    "new_product": new_rec.get("product_name") or "—",
                    "history_id":  old_row["id"],
                })
            for mid, ch_list in by_machine.items():
                alert_slot_changes_batch(
                    machine_id=mid,
                    machine_name=machine_names.get(mid),
                    changes=ch_list,
                    synced_at_unix=synced_unix,
                )
            print(f"📱 Telegram: sent {len(by_machine)} batch alerts covering {len(change_events)} slot changes")
        except Exception as e:
            print(f"⚠️  Telegram alert failed: {e}")

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
                # ⚠️ ตู้ VMS ใช้ความจุที่ตู้รายงานตรง ๆ — เพดาน 12 ของ Payif ไม่เกี่ยวกับที่นี่
                #    (คนละแบบตู้ · ดู deploy/scraper/slot_capacity.py)
                "max_capacity":    slot.get("max_capacity") or 0,
                "is_occupied":     bool(slot.get("is_occupied")),
                "status":          slot.get("status") or "inactive",
                "synced_at":       synced_at,
                # ราคาที่ลูกค้าจ่ายจริงเมื่อกดช่องนี้ (ช่องกล่อง = ราคาทั้งกล่อง)
                # เก็บไว้เพราะ API ยอดขายของ VMS ส่งมาแค่ยอดรวมของบิล ไม่ส่งราคารายชิ้น
                # → vms_sales_api ต้องใช้ราคานี้ถ่วงน้ำหนักตอนแบ่งเงิน ไม่งั้นหารเฉลี่ยแล้วผิด
                #   (ดู migration 071 · เคสจริง 30 ส.ค. 2026 บิล 590 บาทถูกหารสามเป็น 196.67)
                "sell_price":      _num(slot.get("pay_price")),
            })

    print(f"\n📊 รวม {len(all_records)} slots จาก {len(KIOSKS)} ตู้")

    # ⚠️ ถ้ายังไม่ได้รัน migration 071 คอลัมน์ sell_price จะไม่มี แล้ว upsert จะ 400 ทั้งชุด
    #    = sync สต็อกตายทั้งรอบเพราะฟีเจอร์เสริม ซึ่งแพงกว่าที่ได้มาก
    #    เช็กก่อนครั้งเดียว ถ้าไม่มีก็ถอดฟิลด์ออกแล้วเดินต่อ พร้อมบอกวิธีแก้
    if all_records and not _has_sell_price(supabase):
        for r in all_records:
            r.pop("sell_price", None)
        print("⚠️  machine_stock ยังไม่มีคอลัมน์ sell_price — ข้ามการเก็บราคารอบนี้")
        print("    → รัน backend/database/migrations/071_machine_stock_sell_price.sql "
              "ใน Supabase SQL Editor แล้วยอดขายรายตัว SKU จะถูกต้องตั้งแต่รอบถัดไป")

    # Fail loud ถ้าทุกตู้ดึงข้อมูลไม่ได้เลย
    # (ป้องกัน "sync ตายเงียบ" เช่นตอน VMS rebuild ทำให้ kiosk_record_id เปลี่ยน)
    if machines_with_data == 0:
        raise SystemExit(
            f"ERROR: ทุกตู้ดึงข้อมูลไม่ได้เลย ({len(KIOSKS)} ตู้) · "
            "VMS API อาจ down หรือ kiosk_record_id เปลี่ยน · "
            "ตรวจ KIOSKS ใน deploy/scraper/vms_stock_sync.py และ workflow log"
        )

    # Layer 3: Track slot product changes (ก่อน save_to_supabase เพื่อ snapshot remain ของสินค้าเก่า)
    try:
        detect_slot_changes(supabase, all_records, synced_at)
    except Exception as e:
        # ไม่ fail workflow ถ้า history tracking error · core sync ยัง work
        print(f"⚠️  slot_products_history update failed: {e}")

    # Layer 4: Track refill events (slot_refill_events) — ก่อน save เช่นกัน (เทียบกับ machine_stock เดิม)
    try:
        from slot_tracking import track_refill_events
        track_refill_events(supabase, "vms", all_records, synced_at, "vms_stock_sync")
    except Exception as e:
        print(f"⚠️  slot_refill_events tracking failed: {e}")

    save_to_supabase(all_records)

    # Layer 5: ลบช่องที่ VMS เลิกส่งแล้ว — หลัง save เสมอ
    # ตู้ chukes ยังไม่เคยเจอเคสนี้ แต่เป็นช่องโหว่เดียวกับที่ทำให้ pf01 ค้างข้อมูลเก่าเดือนกว่า
    # ใส่ไว้ทั้ง 3 แบรนด์เลย จะได้ไม่ต้องรอให้พังก่อนแล้วค่อยมาไล่หาทีหลัง
    try:
        from stock_reconcile import reconcile_from_records
        reconcile_from_records(supabase, all_records)
    except Exception as e:
        print(f"⚠️  reconcile ช่องที่หายไปไม่สำเร็จ: {e}")


if __name__ == "__main__":
    main()
