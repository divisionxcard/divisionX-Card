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

import os, re, requests
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from supabase import create_client

# ── Config ────────────────────────────────────────────────────
WW_BASE      = "https://www.worldwidevending-vms.com"
WW_USER      = os.environ["WW_USERNAME"]
WW_PASS      = os.environ["WW_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")


def map_goods_to_sku(goods_name: str) -> str | None:
    if not goods_name:
        return None
    upper = goods_name.upper().strip()
    m = re.match(r'(OP|EB|PRB)\s*[-]?\s*(\d+)', upper)
    if m:
        return f"{m.group(1)} {m.group(2).zfill(2)}"
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
    """List worldwide machines: [{machine_id, vendor_id}]"""
    res = supabase.table("machines").select("machine_id, config").eq("brand", "worldwide").execute()
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


def save_to_supabase(supabase, records: list[dict]):
    if not records:
        print("⚠️ ไม่มีข้อมูลที่จะบันทึก")
        return
    print(f"💾 บันทึก {len(records)} slots ลง Supabase...")
    batch_size = 100
    saved = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        supabase.table("machine_stock").upsert(
            batch, on_conflict="machine_id,slot_number"
        ).execute()
        saved += len(batch)
    print(f"🎉 บันทึกสำเร็จ {saved} slots")


def main():
    now_bkk = datetime.utcnow() + timedelta(hours=7)
    print(f"\n{'=' * 50}")
    print(f"DivisionX Card — WorldWide Stock Sync")
    print(f"เวลาไทย: {now_bkk.strftime('%Y-%m-%d %H:%M')}")
    print(f"{'=' * 50}\n")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    machines = fetch_worldwide_machines(supabase)
    if not machines:
        raise SystemExit("❌ ไม่พบ machine brand=worldwide ใน DB")
    print(f"ตู้ทั้งหมด: {len(machines)} ตู้")

    s = login()
    synced_at = datetime.utcnow().isoformat()
    all_records = []
    machines_with_data = 0

    for m in machines:
        machine_id = m["machine_id"]
        vendor_id  = m["vendor_id"]
        print(f"\n📦 ดึงข้อมูล {machine_id} (vendor={vendor_id})...")
        slots = fetch_inventory(s, vendor_id)
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

    print(f"\n📊 รวม {len(all_records)} slots จาก {len(machines)} ตู้")

    # Fail loud ถ้าทุกตู้ดึงไม่ได้
    if machines_with_data == 0:
        raise SystemExit(
            f"ERROR: ทุกตู้ดึงข้อมูลไม่ได้ ({len(machines)} ตู้) · "
            "อาจ login fail หรือ portal เปลี่ยน HTML structure"
        )

    save_to_supabase(supabase, all_records)


if __name__ == "__main__":
    main()
