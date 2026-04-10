"""
DivisionX Card — VMS Machine Stock Sync
ดึงสต็อกหน้าตู้ผ่าน VMS REST API (ไม่ใช้ Playwright)
"""

import os, requests
from datetime import datetime, timedelta
from supabase import create_client

# ── Config ────────────────────────────────────────────────────
VMS_API_BASE = "https://api.inboxcorp.co.th/internal/v1"
VMS_USER     = os.environ["VMS_USERNAME"]
VMS_PASS     = os.environ["VMS_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# ── Kiosk mapping: machine_id → kiosk_record_id ──────────────
KIOSKS = {
    "chukes01": 40,
    "chukes02": 41,
    "chukes03": 42,
    "chukes04": 43,
}

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

def get_slots(token: str, kiosk_record_id: int) -> list[dict]:
    """ดึงข้อมูล slot ทั้งหมดของตู้"""
    headers = {"Authorization": f"Bearer {token}"}
    all_slots = []
    # Tab 1 (slots 001-060) และ Tab 2 (slots 101-160)
    for tab in [1, 2]:
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
    all_records = []

    for machine_id, record_id in KIOSKS.items():
        print(f"\n📦 ดึงข้อมูล {machine_id} (record_id={record_id})...")
        slots = get_slots(token, record_id)
        print(f"  ✅ พบ {len(slots)} slots")

        for slot in slots:
            all_records.append({
                "machine_id":      machine_id,
                "kiosk_record_id": record_id,
                "slot_number":     slot.get("slot_number", ""),
                "product_id":      slot.get("product_id"),
                "product_name":    slot.get("product_name"),
                "product_img":     slot.get("product_img"),
                "remain":          slot.get("remain", 0),
                "max_capacity":    slot.get("max_capacity", 0),
                "is_occupied":     slot.get("is_occupied", False),
                "status":          slot.get("status", "active"),
                "synced_at":       synced_at,
            })

    print(f"\n📊 รวม {len(all_records)} slots จาก {len(KIOSKS)} ตู้")
    save_to_supabase(all_records)

if __name__ == "__main__":
    main()
