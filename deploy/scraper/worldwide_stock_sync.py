"""
DivisionX Card — WorldWide Machine Stock Sync
ดึงสต็อกหน้าตู้จาก WorldWide Vending portal

Flow:
  1. POST /sys/login.do → JSESSIONID
  2. For each worldwide machine in DB:
     GET /page/view_inventory/{vendor_id}.do → HTML
     Parse <tbody> → slot rows (aisle, goods_name, capacity, remain, status)
  3. Upsert machine_stock table (on_conflict machine_id+slot_number)

Schema: machine_stock(machine_id, slot_number, product_name, sku_id, remain,
                     max_capacity, is_occupied, status, synced_at, kiosk_record_id)
"""

import os, re, sys, argparse, requests
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from supabase import create_client

# unit (กล่อง/ซอง) มาจากชื่อสินค้า — SKU เดียวขายทั้งสองแบบในตู้เดียวกัน
from sales_unit import add_unit, upsert_sales  # noqa: E402

# ── Config ────────────────────────────────────────────────────
WW_BASE      = "https://www.worldwidevending-vms.com"
WW_USER      = os.environ["WW_USERNAME"]
WW_PASS      = os.environ["WW_PASSWORD"]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")


def map_goods_to_sku(goods_name: str) -> str | None:
    """รองรับ 2 format:
      1. WW legacy: 'OP 15 BOX' / 'B29 ซอง'
      2. Canonical (หลัง admin rename): 'One Piece OP - 15 Box' / 'Dragonball FB - 01'
    """
    if not goods_name:
        return None
    upper = goods_name.upper().strip()
    if re.search(r'\bB29\b', upper):
        return "B29"
    # \b + re.search รองรับทั้ง 'OP 15 BOX' และ 'ONE PIECE OP - 15 BOX'
    m = re.search(r'\b(OP|EB|PRB|FB)\s*[-]?\s*(\d+)', upper)
    if m:
        return f"{m.group(1)} {m.group(2).zfill(2)}"
    lower = goods_name.lower().strip()
    # Naruto Jin — "naruto jin - 1" / "naruto jin2" (เลขเดี่ยว ไม่ zero-pad ตาม sku เดิม)
    # ต้องมาก่อน direct map ข้างล่าง ไม่งั้น Jin-2 จะโดน "naruto jin - 1" กลืน
    m = re.search(r'naruto\s*jin\s*[-–]?\s*(\d+)', lower)
    if m:
        return f"NRT Jin - {int(m.group(1))}"
    # MLBB Hand of Destiny — "mlbb hand of destiny 02"
    m = re.search(r'hand\s*of\s*destiny\s*[-–]?\s*(\d+)', lower)
    if m:
        return f"MLBB HOD - {m.group(1).zfill(2)}"
    # Fallback: direct map สำหรับ Naruto/Pokemon/SOLO
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
        # 2026-08-13 หลังบ้านเปลี่ยนชื่อชุดนี้เป็น "Pokemon M5 Abyss Eye" (เจ้าของยืนยัน)
        # ใช้คำว่า abyss คำเดียวเพื่อรับได้ทุกรูปแบบ — ไม่มี SKU อื่นที่มีคำนี้ จึงไม่ชนกัน
        # ⚠ คงบรรทัด pokemon ghost ไว้ ตู้อื่นอาจยังใช้ชื่อเดิม + ประวัติยอดขายอ้างชื่อนี้
        ("abyss",           "PKM Ghost"),
        ("chaos origins",   "YGH Chaos Origins"),
        ("limited over",    "YGH The Revals"),   # portal เรียก "Yuki oh Limited Over Collection"
        ("the revals",      "YGH The Revals"),   # เผื่อ portal เปลี่ยนเป็นชื่อจริงทีหลัง
        # 2026-08-13 หลังบ้าน WW แก้คำสะกดเป็น "Rivals" (ของเดิมสะกดผิด)
        # ⚠ ตู้ chukes ยังใช้ "Revals" อยู่ → ต้องรับทั้งสองคำ ห้ามลบบรรทัดบน
        ("the rivals",      "YGH The Revals"),
        ("the heroes",      "YGH The Heroes"),   # ⚠ raw name ยังไม่ verify (ยังไม่มาถึงตู้)
        # ── สินค้าใหม่ 2026-08-13 · ตอนนี้อยู่แค่ตู้ chukes ใส่ไว้เผื่อมาลง WW ──
        # ⚠ MLP มี 2 ไลน์แล้ว (SEA / BP) ถ้ามีชุดใหม่ตามมาให้เปลี่ยนเป็น regex ที่บังคับมีเลข
        ("pony sea02",      "MLP SEA02"),
        ("pony bp-01",      "MLP BP-01"),
        ("overdrive",       "TF Overdrive 01"),
        ("ut01",            "YGH UT01"),
    ):
        if sub in lower:
            return sku
    return None


def login() -> requests.Session:
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
        raise SystemExit(f"❌ Login failed: HTTP {r.status_code}")
    if not s.cookies.get("JSESSIONID"):
        raise SystemExit("❌ Login OK but no JSESSIONID")
    print("  ✅ Login สำเร็จ")
    return s


def fetch_worldwide_machines(supabase) -> list[dict]:
    """List worldwide machines: [{machine_id, vendor_id}]

    กรอง status='active' ด้วย — ตู้ที่ยกเลิกไปแล้วยังมีแถวอยู่ใน machines
    (ลบไม่ได้ ยอดขายเก่าอ้าง FK อยู่) ถ้าไม่กรอง มันจะถูกดึงต่อทุกคืน
    """
    res = (supabase.table("machines").select("machine_id, config")
           .eq("brand", "worldwide").eq("status", "active").execute())
    out = []
    for row in (res.data or []):
        cfg = row.get("config") or {}
        vid = cfg.get("machine_id_vendor")
        if vid:
            out.append({"machine_id": row["machine_id"], "vendor_id": vid})
    return out


def fetch_inventory(s, vendor_id: str) -> list[dict]:
    """GET /page/view_inventory/{vendor_id}.do → parse HTML slot table"""
    url = f"{WW_BASE}/page/view_inventory/{vendor_id}.do"
    r = s.get(url, timeout=60)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    slots = []
    # row format: <tr><td>aisle</td><td>goods_name</td><td>cap</td><td>remain</td><td><font>status</font></td><td>sold_out</td></tr>
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 5:
            continue
        slot_num = tds[0].get_text(strip=True)
        # ต้องเป็นเลข 3 หลัก (010-XYZ) เพื่อกัน header/อื่น
        if not re.fullmatch(r"\d{2,4}", slot_num):
            continue
        goods_name = tds[1].get_text(strip=True)
        try:
            capacity = int(tds[2].get_text(strip=True) or 0)
            remain   = int(tds[3].get_text(strip=True) or 0)
        except ValueError:
            continue
        status = tds[4].get_text(strip=True) or "unknown"
        slots.append({
            "slot_number":  slot_num,
            "product_name": goods_name,
            "max_capacity": capacity,
            "remain":       remain,
            "status":       status,
            "sku_id":       map_goods_to_sku(goods_name),
            "is_occupied":  bool(goods_name and goods_name != "—"),
        })
    return slots


def null_unknown_skus(supabase, records: list[dict]):
    """set sku_id = None สำหรับ sku ที่ไม่มีในตาราง skus (กัน FK violation)
    ตู้ WW อาจมีสินค้าใหม่ที่ยังไม่มีใน skus (เช่น 'OP 16') — เก็บ product_name ไว้
    แต่ไม่ผูก sku · sku เดียวที่ไม่รู้จักต้องไม่ทำให้ save ล้มทั้งชุด"""
    res = supabase.table("skus").select("sku_id").execute()
    valid = {r["sku_id"] for r in (res.data or [])}
    unknown = {}
    for rec in records:
        sid = rec.get("sku_id")
        if sid and sid not in valid:
            unknown[sid] = unknown.get(sid, 0) + 1
            rec["sku_id"] = None
    if unknown:
        print("⚠️ sku ไม่รู้จัก (set NULL · เก็บ product_name ไว้): "
              + ", ".join(f"{k}×{v}" for k, v in sorted(unknown.items())))


def save_to_supabase(supabase, records: list[dict]):
    if not records:
        print("⚠️ ไม่มีข้อมูลที่จะบันทึก")
        return
    print(f"💾 บันทึก {len(records)} slots ลง Supabase...")
    batch_size = 100
    saved = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        upsert_sales(supabase, add_unit(batch, "product_name"),
                     table="machine_stock", on_conflict="machine_id,slot_number")
        saved += len(batch)
    print(f"🎉 บันทึกสำเร็จ {saved} slots")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Login + fetch + parse แต่ไม่ติด Supabase + ไม่ save")
    args = parser.parse_args()

    now_bkk = datetime.utcnow() + timedelta(hours=7)
    print(f"\n{'=' * 50}")
    print(f"DivisionX Card — WorldWide Stock Sync")
    print(f"เวลาไทย: {now_bkk.strftime('%Y-%m-%d %H:%M')}")
    print(f"{'=' * 50}\n")

    if args.dry_run:
        print("🧪 DRY-RUN mode: skip Supabase")
        supabase = None
        machines = [{"machine_id": "wwv01", "vendor_id": "VCM350CKC25090606"}]
    else:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        machines = fetch_worldwide_machines(supabase)
        if not machines:
            raise SystemExit("❌ ไม่พบ machine brand=worldwide ใน DB")
    print(f"ตู้ทั้งหมด: {len(machines)} ตู้")

    s = login()
    synced_at = datetime.utcnow().isoformat()
    all_records = []
    machines_with_data = 0
    failed_machines = []

    for m in machines:
        machine_id = m["machine_id"]
        vendor_id  = m["vendor_id"]
        print(f"\n📦 ดึงข้อมูล {machine_id} (vendor={vendor_id})...")
        # ดึงทีละตู้แบบแยกกัน — ตู้เดียวพัง (เช่น ตู้ใหม่ที่ยังติดตั้งไม่เสร็จ)
        # ต้องไม่ทำให้ตู้อื่นที่ทำงานปกติ sync ไม่ได้ไปด้วย
        try:
            slots = fetch_inventory(s, vendor_id)
        except Exception as e:
            print(f"  ⚠️ ดึง {machine_id} ไม่ได้ (ข้ามตู้นี้): {e}")
            failed_machines.append(machine_id)
            continue
        print(f"  ✅ พบ {len(slots)} slots")
        if slots:
            machines_with_data += 1

        for slot in slots:
            all_records.append({
                "machine_id":      machine_id,
                "kiosk_record_id": 0,  # ไม่ใช้สำหรับ worldwide (column NOT NULL)
                "slot_number":     slot["slot_number"],
                "product_id":      None,
                "product_name":    slot["product_name"],
                "product_img":     None,
                "sku_id":          slot["sku_id"],
                "remain":          slot["remain"],
                "max_capacity":    slot["max_capacity"],
                "is_occupied":     slot["is_occupied"],
                "status":          slot["status"][:20],
                "synced_at":       synced_at,
            })

    ok_count = len(machines) - len(failed_machines)
    print(f"\n📊 รวม {len(all_records)} slots จาก {ok_count}/{len(machines)} ตู้")
    if failed_machines:
        print(f"⚠️ ตู้ที่ดึงไม่ได้: {', '.join(failed_machines)}")

    # Fail loud ถ้าทุกตู้ดึงไม่ได้
    if machines_with_data == 0:
        raise SystemExit(
            f"ERROR: ทุกตู้ดึงข้อมูลไม่ได้ ({len(machines)} ตู้) · "
            "อาจ login fail หรือ portal เปลี่ยน HTML structure"
        )

    if args.dry_run:
        print("\n🧪 DRY-RUN: ไม่ save ลง Supabase · sample 5 records:")
        for r in all_records[:5]:
            print(f"  slot={r['slot_number']} product={r['product_name']!r} sku={r['sku_id']} "
                  f"remain={r['remain']}/{r['max_capacity']} status={r['status']}")
        print(f"  ... (total {len(all_records)} slots)")
    else:
        null_unknown_skus(supabase, all_records)
        # Track refill events (slot_refill_events) — ก่อน save (เทียบกับ machine_stock เดิม)
        try:
            from slot_tracking import track_refill_events
            track_refill_events(supabase, "worldwide", all_records, synced_at, "worldwide_stock_sync")
        except Exception as e:
            print(f"⚠️  slot_refill_events tracking failed: {e}")
        save_to_supabase(supabase, all_records)
        # ลบช่องที่หลังบ้านเลิกส่งแล้ว (ดู stock_reconcile.py — เจอที่ pf01 ก่อน แต่เป็นช่องโหว่ร่วมทุกแบรนด์)
        try:
            from stock_reconcile import reconcile_from_records
            reconcile_from_records(supabase, all_records)
        except Exception as e:
            print(f"⚠️  reconcile ช่องที่หายไปไม่สำเร็จ: {e}")


if __name__ == "__main__":
    main()
