"""
ลบแถว machine_stock ของช่องที่หายไปจากหลังบ้านตู้แล้ว

ปัญหาที่แก้ (พบ 19 ส.ค. 2026):
  scraper ทั้ง 3 แบรนด์ใช้ upsert อย่างเดียว ไม่เคยลบ → ช่องที่ถูกถอดออกจากตู้จริง
  ยังค้างอยู่ใน machine_stock พร้อมตัวเลขวันสุดท้ายที่เห็น ตลอดไป

  เกิดจริงที่ pf01 (ไอคอนสยาม): portal เลิกส่งช่อง 052/054/056/058/060
  ตั้งแต่ 14 ก.ค. 2026 (log ยืนยัน "พบ 55 slots" ทั้งที่ DB มี 60)
  ผลคือ **รายงานเตรียมของเติมตู้แสดงตัวเลขเก่าเดือนกว่า** ซึ่งแอดมินใช้ทุกวัน
  และ slot_tracking บันทึก swap_out ปลอมทุกรอบซิงค์ (36 ครั้งใน 1 เดือน)

⚠️ การลบเป็นสิ่งที่ย้อนไม่ได้ จึงมีด่านกันพลาด:
  - ไม่ลบถ้ารอบนี้ดึงมาได้ 0 ช่อง (API ล่ม/ล็อกอินหลุด)
  - ไม่ลบถ้าจำนวนช่องที่ได้ต่ำกว่าที่มีใน DB มากผิดปกติ (ค่าเริ่มต้น < 50%)
    เพราะนั่นแปลว่า API ตอบไม่ครบ ไม่ใช่ช่องถูกถอดจริง
  - พิมพ์รายการที่จะลบเสมอ ให้ตามได้จาก log ย้อนหลัง
"""

MIN_RATIO = 0.5


def reconcile_removed_slots(supabase, machine_id: str, seen_slots, *,
                            min_ratio: float = MIN_RATIO, dry_run: bool = False) -> int:
    """ลบแถวของช่องที่ไม่อยู่ใน seen_slots · คืนจำนวนแถวที่ลบ (หรือที่จะลบถ้า dry_run)"""
    seen = {str(s) for s in seen_slots if s is not None}
    if not seen:
        print(f"  ⏭️  {machine_id}: รอบนี้ไม่ได้ช่องมาเลย — ข้ามการลบ (กัน API ล่มแล้วลบทิ้งหมด)")
        return 0

    res = supabase.table("machine_stock").select(
        "slot_number, product_name, remain, synced_at").eq("machine_id", machine_id).execute()
    existing = res.data or []
    if not existing:
        return 0

    stale = [r for r in existing if str(r["slot_number"]) not in seen]
    if not stale:
        return 0

    ratio = len(seen) / len(existing)
    if ratio < min_ratio:
        print(f"  ⚠️  {machine_id}: ได้ {len(seen)} ช่อง แต่ใน DB มี {len(existing)} "
              f"({ratio:.0%}) — น้อยผิดปกติ ไม่ลบอะไรทั้งนั้น ให้คนมาดูก่อน")
        return 0

    print(f"  🧹 {machine_id}: ช่องที่หายไปจากหลังบ้านแล้ว {len(stale)} ช่อง"
          + (" (dry-run)" if dry_run else ""))
    for r in stale:
        print(f"       ช่อง {r['slot_number']:<6} {str(r.get('product_name') or '(ว่าง)')[:32]:<34}"
              f" เหลือ {r.get('remain')} · ซิงค์ล่าสุด {str(r.get('synced_at'))[:10]}")

    if dry_run:
        return len(stale)

    for r in stale:
        supabase.table("machine_stock").delete() \
            .eq("machine_id", machine_id).eq("slot_number", r["slot_number"]).execute()
    return len(stale)


def reconcile_from_records(supabase, records, *, dry_run: bool = False) -> int:
    """เรียกแบบส่ง records ทั้งก้อน (หลาย machine) — จัดกลุ่มให้เอง"""
    by_machine: dict[str, set] = {}
    for r in records:
        by_machine.setdefault(r["machine_id"], set()).add(str(r["slot_number"]))
    total = 0
    for mid, slots in by_machine.items():
        total += reconcile_removed_slots(supabase, mid, slots, dry_run=dry_run)
    return total
