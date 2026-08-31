"""จำว่าช่องไหน "ว่างมาตั้งแต่เมื่อไหร่" — ใช้ติดธงช่องที่เติมไม่ได้จริง

ทำไมต้องมี (เคสจริง 31 ส.ค. 2026):
    ใบจัดของคิดจาก ความจุ − คงเหลือ · ช่องที่ว่างสนิทจึงถูกสั่งเติมเต็มความจุทุกวัน
    TF OVERDRIVE 01 ที่ wwv07 ช่อง 068+069 ว่างมาตั้งแต่ 23 ส.ค. (8 วัน)
    ไม่มีบันทึกการเติมสำเร็จเลย แต่ใบยังสั่ง 24 ซองทุกวัน
    → ขนไป-ขนกลับ หรือแย่กว่านั้นคือแอดมินเลิกเชื่อใบไปเลย

ทำไมต้องให้ตัว sync จำให้:
    machine_stock เก็บ "สภาพช่องตอนนี้" แถวเดียวต่อช่อง เขียนทับทุกรอบ
    ในตารางจึงไม่มีข้อมูลว่าว่างมานานแค่ไหน — ต้องจำตอนที่เห็นเท่านั้น

⚠️ นี่คือข้อเท็จจริง ไม่ใช่นโยบาย — ช่องว่างค้างเกิดได้กับตู้ทุกยี่ห้อ
   (ต่างจากเพดาน 12 ซอง/ช่อง ใน slot_capacity.py ที่เป็นเรื่องของแบบตู้ Payif เท่านั้น)
"""


def mark_empty_since(records, prev_rows, synced_at):
    """เติมฟิลด์ empty_since ให้ records · คืนจำนวนช่องที่ว่างค้างอยู่

    records:   ที่ scrape มาใหม่ (จะถูกแก้ในที่)
    prev_rows: แถวเดิมใน machine_stock — ต้องมี machine_id, slot_number, remain, empty_since
    synced_at: iso string ของรอบนี้

    กติกา:
      มีของ (remain > 0)          → NULL   (นับใหม่รอบหน้าถ้าหมดอีก)
      เพิ่งหมดรอบนี้              → synced_at
      หมดต่อเนื่องจากรอบก่อน      → คงค่าเดิมไว้  ← หัวใจของทั้งเรื่อง

    ⚠️ ต้องเรียก **ก่อน** save — หลัง save แถวเดิมถูกทับไปแล้ว จะกลายเป็นว่า
       ทุกช่องเพิ่งว่างวันนี้ตลอดกาล แล้วธงจะไม่มีวันติด
    """
    prev = {}
    for r in prev_rows or []:
        prev[(r.get("machine_id"), str(r.get("slot_number") or ""))] = r

    still_empty = 0
    for rec in records:
        key = (rec.get("machine_id"), str(rec.get("slot_number") or ""))
        if (rec.get("remain") or 0) > 0:
            rec["empty_since"] = None
            continue
        old = prev.get(key) or {}
        # ว่างต่อเนื่อง = เก็บวันแรกที่เห็นว่าว่างไว้เหมือนเดิม
        was_empty = (old.get("remain") or 0) == 0 and old.get("empty_since")
        rec["empty_since"] = old["empty_since"] if was_empty else synced_at
        if was_empty:
            still_empty += 1
    return still_empty


def load_prev(supabase, machine_ids):
    """อ่านสภาพช่องรอบก่อนเท่าที่ต้องใช้ · คืน [] ถ้าตารางยังไม่มีคอลัมน์ (migration 072)"""
    try:
        res = (supabase.table("machine_stock")
               .select("machine_id, slot_number, remain, empty_since")
               .in_("machine_id", list(machine_ids)).execute())
        return res.data or []
    except Exception:
        return None          # None = ยังไม่มีคอลัมน์ → ผู้เรียกต้องข้ามฟีเจอร์นี้ไป


def apply(supabase, records, synced_at, log=print):
    """ทางลัดสำหรับ scraper — อ่านของเดิม เติม empty_since ให้ records

    ⚠️ ถ้ายังไม่ได้รัน migration 072 จะถอดฟิลด์ออกแล้วเดินต่อ
       ปล่อยให้ upsert 400 ทั้งชุด = สต็อกทั้งรอบหายเพราะฟีเจอร์เสริม
    """
    if not records:
        return
    prev = load_prev(supabase, {r.get("machine_id") for r in records if r.get("machine_id")})
    if prev is None:
        for r in records:
            r.pop("empty_since", None)
        log("⚠️  machine_stock ยังไม่มีคอลัมน์ empty_since — ข้ามการจำช่องว่างค้าง")
        log("    → รัน backend/database/migrations/072_machine_stock_empty_since.sql ก่อน")
        return
    n = mark_empty_since(records, prev, synced_at)
    empty_now = sum(1 for r in records if r.get("empty_since"))
    if empty_now:
        log(f"📭 ช่องที่ของหมด {empty_now} ช่อง (ว่างค้างจากรอบก่อน {n} ช่อง)")
