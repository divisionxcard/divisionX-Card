"""
Stock-low daily alert · ส่งสรุป slot ที่ stock เหลือต่ำให้กลุ่ม Admin
รันทุกวัน 09:00 ICT (02:00 UTC) via GitHub Actions

Threshold: remain <= 3 OR (remain / max_capacity) < 25%
"""
import os
from supabase import create_client
from telegram_alert import alert_stock_low

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ABSOLUTE_THRESHOLD = 3
RELATIVE_THRESHOLD = 0.25


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # ดึง machine_stock ทั้งหมด · join product info ผ่าน select query
    res = supabase.table("machine_stock").select(
        "machine_id, slot_number, sku_id, product_name, remain, max_capacity"
    ).execute()
    rows = res.data or []

    # โหลด machines เพื่อแสดง name
    try:
        mres = supabase.table("machines").select("machine_id, name").execute()
        machine_names = {m["machine_id"]: m.get("name") for m in (mres.data or [])}
    except Exception:
        machine_names = {}

    low = []
    for r in rows:
        remain = r.get("remain") or 0
        cap = r.get("max_capacity") or 0
        # skip slot ว่าง (ไม่มีสินค้า)
        if not r.get("sku_id") and not r.get("product_name"):
            continue
        is_low_abs = remain <= ABSOLUTE_THRESHOLD
        is_low_rel = cap > 0 and (remain / cap) < RELATIVE_THRESHOLD
        if is_low_abs or is_low_rel:
            r["machine_name"] = machine_names.get(r["machine_id"])
            low.append(r)

    # เรียงตาม remain น้อยสุดก่อน → admin เห็นที่เร่งด่วนข้างบน
    low.sort(key=lambda x: (x.get("remain") or 0, x["machine_id"], x["slot_number"]))

    print(f"Found {len(low)} low-stock slots (threshold: remain<={ABSOLUTE_THRESHOLD} or <{int(RELATIVE_THRESHOLD*100)}%)")
    if not low:
        print("✅ No alert needed")
        return

    result = alert_stock_low(low)
    if result and result.get("ok"):
        print(f"📱 Telegram alert sent · message_id={result['result']['message_id']}")
    else:
        print(f"⚠️  Telegram alert failed or no token configured")


if __name__ == "__main__":
    main()
