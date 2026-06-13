"""
DivisionX Card — Slot Refill Tracking (เฟส 1)
Module กลาง · ใช้ร่วมทั้ง vms_stock_sync.py และ worldwide_stock_sync.py

หน้าที่: เทียบ "ของในตู้ก่อน sync (machine_stock เดิม)" vs "ของที่ scrape มาใหม่"
        → บันทึก slot_refill_events ว่าแต่ละช่อง/SKU "เติมเข้า" เท่าไหร่

    qty_added = (qty_after − qty_before) + sold_between

⚠ ต้องเรียก "ก่อน" save_to_supabase (ตอนที่ machine_stock ยังเป็นค่ารอบก่อน)

2 grain (ดู migration 048):
  - VMS  → grain='slot' · ต่อช่อง · sold_between จาก sales.slot_number (แม่นต่อช่อง)
  - WW   → grain='sku'  · ต่อ machine+sku+หน่วย(box/pack) · SKU เดียวอยู่หลายช่อง +
           WW sales ไม่มี slot_number → รวม sold ที่ระดับ machine+sku (ลงหน่วย pack เป็นหลัก)
"""

from datetime import datetime, timezone


def _isbox(product_name: str | None) -> bool:
    """ช่องนี้เป็นกล่อง (box) หรือซอง (pack) — ดูจากชื่อสินค้า (logic เดียวกับ PageRefillPrep)"""
    return "box" in (product_name or "").lower()


def _parse_dt(value) -> datetime | None:
    """parse iso string เป็น aware datetime (UTC) · naive → ถือเป็น UTC"""
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _identity(platform: str, rec: dict):
    """product identity ของ record (ใช้เช็คว่าเปลี่ยนของไหม)
    VMS = product_id (เชื่อถือได้สุด) · WW = sku_id หรือ product_name"""
    if platform == "vms":
        return rec.get("product_id")
    return rec.get("sku_id") or rec.get("product_name")


def track_refill_events(supabase, platform: str, current_records: list[dict],
                        synced_at: str, detected_by: str):
    """คำนวณ + บันทึก slot_refill_events สำหรับรอบ sync นี้

    Args:
        supabase: client
        platform: 'vms' | 'worldwide'
        current_records: list ที่ scrape มาใหม่ (ก่อน save ลง machine_stock)
                         key ที่ใช้: machine_id, slot_number, product_id, product_name,
                                    sku_id, remain, max_capacity
        synced_at: iso string ของรอบ sync นี้
        detected_by: ชื่อ scraper (ลง column detected_by)
    """
    if not current_records:
        return

    grain = "slot" if platform == "vms" else "sku"
    machine_ids = sorted({r["machine_id"] for r in current_records})

    # ── 1. โหลด machine_stock เดิม (= สถานะก่อน sync นี้) ──────────────
    prev_rows = []
    try:
        res = (supabase.table("machine_stock")
               .select("machine_id, slot_number, product_id, product_name, sku_id, remain, max_capacity, synced_at")
               .in_("machine_id", machine_ids).execute())
        prev_rows = res.data or []
    except Exception as e:
        print(f"  ⚠️  slot_tracking: โหลด machine_stock เดิมไม่ได้: {e}")
        return

    if not prev_rows:
        # first run ของทุกตู้ — ไม่มีฐานเทียบ → seed เงียบ ไม่ออก event
        print(f"  📥 slot_tracking ({platform}): ไม่มี machine_stock เดิม (seed) — ข้าม")
        return

    prev_by_slot = {(r["machine_id"], r["slot_number"]): r for r in prev_rows}

    # prev_synced_at ต่อตู้ (= ครั้งล่าสุดที่ตู้นั้นถูก sync) · ใช้เป็นขอบล่างของ window ยอดขาย
    prev_synced_by_machine: dict[str, datetime] = {}
    for r in prev_rows:
        dt = _parse_dt(r.get("synced_at"))
        if dt is None:
            continue
        cur = prev_synced_by_machine.get(r["machine_id"])
        if cur is None or dt > cur:
            prev_synced_by_machine[r["machine_id"]] = dt

    machines_with_prev = set(prev_synced_by_machine.keys())
    if not machines_with_prev:
        return

    # ── 2. โหลดยอดขายในช่วง (prev_synced_at → ตอนนี้) ──────────────────
    global_min_prev = min(prev_synced_by_machine.values())
    sold_by_slot: dict[tuple, int] = {}   # VMS: (machine, slot) → qty
    sold_by_sku: dict[tuple, int] = {}    # WW:  (machine, sku)  → qty
    try:
        sres = (supabase.table("sales")
                .select("machine_id, slot_number, sku_id, quantity_sold, sold_at")
                .in_("machine_id", machine_ids)
                .gt("sold_at", global_min_prev.isoformat())
                .execute())
        for s in (sres.data or []):
            mid = s["machine_id"]
            sold_dt = _parse_dt(s.get("sold_at"))
            win = prev_synced_by_machine.get(mid)
            if sold_dt is None or win is None or sold_dt <= win:
                continue  # นอก window ของตู้นั้น
            qty = s.get("quantity_sold") or 0
            if platform == "vms":
                slot = s.get("slot_number")
                if slot:
                    sold_by_slot[(mid, slot)] = sold_by_slot.get((mid, slot), 0) + qty
            else:
                sku = s.get("sku_id")
                if sku:
                    sold_by_sku[(mid, sku)] = sold_by_sku.get((mid, sku), 0) + qty
    except Exception as e:
        print(f"  ⚠️  slot_tracking: โหลด sales ไม่ได้ (sold_between=0): {e}")

    # ── 3. สร้าง events ตาม grain ──────────────────────────────────────
    events: list[dict] = []
    base = {
        "platform": platform, "grain": grain, "detected_by": detected_by,
        "session_id": None, "synced_at": synced_at,
    }

    if platform == "vms":
        events = _build_vms_events(current_records, prev_by_slot, sold_by_slot,
                                   machines_with_prev, prev_synced_by_machine, base)
    else:
        events = _build_ww_events(current_records, prev_rows, sold_by_sku,
                                  machines_with_prev, prev_synced_by_machine, base)

    # ── 4. บันทึก ──────────────────────────────────────────────────────
    if not events:
        print(f"  📥 slot_tracking ({platform}): ไม่มีการเติม/สลับ")
        return
    try:
        for i in range(0, len(events), 100):
            supabase.table("slot_refill_events").insert(events[i:i + 100]).execute()
        n_refill = sum(1 for e in events if e["change_type"] == "refill")
        n_swap = sum(1 for e in events if e["change_type"].startswith("swap"))
        print(f"  📥 slot_tracking ({platform}): บันทึก {len(events)} events "
              f"(refill={n_refill}, swap={n_swap})")
    except Exception as e:
        print(f"  ⚠️  slot_tracking: insert slot_refill_events ไม่ได้: {e}")


def _build_vms_events(current_records, prev_by_slot, sold_by_slot,
                      machines_with_prev, prev_synced_by_machine, base) -> list[dict]:
    """VMS grain='slot' · ต่อช่อง · identity = product_id"""
    events = []
    for rec in current_records:
        mid = rec["machine_id"]
        if mid not in machines_with_prev:
            continue  # seed ตู้นั้น
        slot = rec.get("slot_number")
        key = (mid, slot)
        prev = prev_by_slot.get(key)
        after = rec.get("remain") or 0
        cap = rec.get("max_capacity")
        pname = rec.get("product_name")
        sku = rec.get("sku_id")
        id_new = _identity("vms", rec)
        prev_synced = prev_synced_by_machine[mid].isoformat()

        if prev is None:
            # ช่องนี้เพิ่งมีของ (เดิมว่าง/ไม่เคยมี) → swap_in
            if (id_new or pname) and after > 0:
                events.append({**base, "machine_id": mid, "slot_number": slot,
                               "sku_id": sku, "is_box": _isbox(pname), "product_name": pname,
                               "qty_before": 0, "qty_after": after, "sold_between": 0,
                               "qty_added": after, "capacity": cap, "change_type": "swap_in",
                               "prev_synced_at": prev_synced})
            continue

        before = prev.get("remain") or 0
        id_old = prev.get("product_id")

        if id_old == id_new:
            # ของเดิม → เติม?
            sold = sold_by_slot.get(key, 0)
            qty_added = (after - before) + sold
            if qty_added > 0:
                events.append({**base, "machine_id": mid, "slot_number": slot,
                               "sku_id": sku, "is_box": _isbox(pname), "product_name": pname,
                               "qty_before": before, "qty_after": after, "sold_between": sold,
                               "qty_added": qty_added, "capacity": cap, "change_type": "refill",
                               "prev_synced_at": prev_synced})
        else:
            # เปลี่ยนของ → swap_out (ของเก่า) + swap_in (ของใหม่)
            sold_old = sold_by_slot.get(key, 0)
            events.append({**base, "machine_id": mid, "slot_number": slot,
                           "sku_id": prev.get("sku_id"), "is_box": _isbox(prev.get("product_name")),
                           "product_name": prev.get("product_name"),
                           "qty_before": before, "qty_after": 0, "sold_between": sold_old,
                           "qty_added": 0, "capacity": prev.get("max_capacity"),
                           "change_type": "swap_out", "prev_synced_at": prev_synced})
            if after > 0 or id_new:
                events.append({**base, "machine_id": mid, "slot_number": slot,
                               "sku_id": sku, "is_box": _isbox(pname), "product_name": pname,
                               "qty_before": 0, "qty_after": after, "sold_between": 0,
                               "qty_added": after, "capacity": cap, "change_type": "swap_in",
                               "prev_synced_at": prev_synced})
    return events


def _build_ww_events(current_records, prev_rows, sold_by_sku,
                     machines_with_prev, prev_synced_by_machine, base) -> list[dict]:
    """WW grain='sku' · รวมต่อ (machine, sku_key, is_box) · SKU เดียวอยู่หลายช่อง"""
    def sku_key(rec):
        return rec.get("sku_id") or rec.get("product_name")

    # รวมยอดต่อ (machine, sku_key, is_box)
    def aggregate(rows):
        agg = {}
        for r in rows:
            mid = r["machine_id"]
            sk = sku_key(r)
            if not sk:
                continue
            isbox = _isbox(r.get("product_name"))
            k = (mid, sk, isbox)
            a = agg.setdefault(k, {"qty": 0, "cap": 0, "sku_id": r.get("sku_id"),
                                   "product_name": r.get("product_name")})
            a["qty"] += r.get("remain") or 0
            a["cap"] += r.get("max_capacity") or 0
        return agg

    prev_agg = aggregate(prev_rows)
    cur_agg = aggregate(current_records)

    # assign ยอดขาย (machine, sku) → หน่วย pack เป็นหลัก (box แทบไม่ขาย/แยกจาก sales ไม่ได้)
    # ถ้า sku นั้นมีแต่ box (ไม่มี pack) → ลง box
    sold_assigned: dict[tuple, int] = {}
    units_present = {}  # (machine, sku) → set ของ is_box ที่มี
    for (mid, sk, isbox) in set(prev_agg) | set(cur_agg):
        units_present.setdefault((mid, sk), set()).add(isbox)
    for (mid, sk), qty in sold_by_sku.items():
        units = units_present.get((mid, sk), {False})
        target_box = False if False in units else True
        sold_assigned[(mid, sk, target_box)] = sold_assigned.get((mid, sk, target_box), 0) + qty

    events = []
    for k in set(prev_agg) | set(cur_agg):
        mid, sk, isbox = k
        if mid not in machines_with_prev:
            continue
        p = prev_agg.get(k)
        c = cur_agg.get(k)
        before = p["qty"] if p else 0
        after = c["qty"] if c else 0
        sold = sold_assigned.get(k, 0)
        info = c or p
        prev_synced = prev_synced_by_machine[mid].isoformat()
        common = {**base, "machine_id": mid, "slot_number": None,
                  "sku_id": info.get("sku_id"), "is_box": isbox,
                  "product_name": info.get("product_name"),
                  "capacity": (c or p).get("cap"), "prev_synced_at": prev_synced}

        if p and c:
            qty_added = (after - before) + sold
            if qty_added > 0:
                events.append({**common, "qty_before": before, "qty_after": after,
                               "sold_between": sold, "qty_added": qty_added,
                               "change_type": "refill"})
        elif c and not p:
            # sku/หน่วยใหม่โผล่ในตู้ → swap_in
            events.append({**common, "qty_before": 0, "qty_after": after,
                           "sold_between": 0, "qty_added": after, "change_type": "swap_in"})
        elif p and not c:
            # sku/หน่วยหายไปจากตู้ → swap_out
            events.append({**common, "qty_before": before, "qty_after": 0,
                           "sold_between": sold, "qty_added": 0, "change_type": "swap_out"})
    return events
