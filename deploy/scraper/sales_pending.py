"""พักรายการขายของสินค้าที่ยังไม่มี SKU ในระบบ แล้วย้ายเข้ายอดขายเองเมื่อ SKU ถูกเพิ่ม

ทำไมต้องมี (23 พ.ย. 2026 · เจ้าของเลือก "พักไว้ เติมเองทีหลัง" ทั้ง 3 ยี่ห้อ):
    sales.sku_id เป็น NOT NULL + FK ไป skus · แอดมินตั้งสินค้าชุดใหม่ในตู้ก่อนที่จะมีใครเพิ่มแถวใน skus
    เป็นเรื่องที่เกิดซ้ำทุกครั้งที่มีของใหม่ (OP 16 · OP 17 · EB 05 · OP 18) และพังได้สองแบบ:
      · VMS   — upsert ล้มทั้งชุด ยอดขายทุกตู้ทุกสินค้าไม่เข้า บอทหยุดรอบ สต็อกไม่ถูกดึงต่อ (OP 18 · 22–23 พ.ย.)
      · WW / Payif — ทิ้งรายการขายของสินค้านั้นเงียบ ๆ ไม่แจ้งใคร (EB 05 หายไป 2 วัน · 14–16 พ.ย.)
    ทั้งสองแบบแก้ด้วยสิ่งเดียวกัน: รายการที่ยังลงไม่ได้ต้อง "มีที่อยู่" และ "มีคนรู้"

ทำงานยังไง:
    hold_unknown_skus()  ก่อนบันทึกยอดขาย — แยกแถวที่ sku_id ยังไม่มีใน skus ไปเก็บในตาราง sales_pending_sku
                         (ทั้งแถวพร้อม insert) · แถวที่เหลือบันทึกตามปกติ · แจ้ง Telegram เฉพาะแถวที่เพิ่งพักใหม่
    release_pending()    ต้นทุกรอบซิงค์ยอดขาย (ยี่ห้อไหนก็ได้) — แถวที่พักไว้ซึ่ง SKU มีแล้ว ย้ายเข้า sales แล้วลบจากที่พัก

ไม่เดาอะไรแทนเจ้าของ: ไม่สร้าง SKU เอง · ไม่เดาซองต่อกล่อง/ทุน · แถวที่พักเก็บค่าที่ตัวดึงคำนวณไว้ ณ ตอนดึง
    ⚠️ แถว "กล่อง" ของ SKU ใหม่ถูกคิดจำนวนซองด้วย PACKS_PER_BOX.get(sku, 24) ตอนดึง — ถ้าชุดใหม่ไม่ใช่ 24 ซอง/กล่อง
       ต้องเติม PACKS_PER_BOX ในตัวดึง **แล้วดึงช่วงนั้นซ้ำก่อนเพิ่ม SKU** (แถวที่พักถูกเขียนทับด้วยค่าที่ดึงใหม่)
       ข้อความแจ้งเตือนบอกเรื่องนี้ไว้ให้เมื่อมีแถวกล่องอยู่ในชุดที่พัก

ยังไม่ได้รัน migration 084 (ไม่มีตาราง): ไม่ล้ม — ข้ามแถวพวกนั้นเหมือนพฤติกรรมเดิมของ WW/Payif แต่แจ้งเตือนทุกรอบ
    เหตุผลเดียวกับ upsert_sales: ซิงค์กลางคืนรันจาก origin/main ลำดับ push ก่อน/หลังรัน SQL ต้องไม่ทำให้ข้อมูลทั้งวันหาย
"""
import html as _html

TABLE = "sales_pending_sku"

# คีย์ภายในของตัวดึง (เช่น _confident ของ VMS) ไม่ใช่คอลัมน์ของ sales — ห้ามเก็บลงแถวที่จะ insert ทีหลัง
def _clean(row):
    return {k: v for k, v in row.items() if not k.startswith("_")}


def _table_missing(err):
    """แคบไว้ก่อน — error อื่นต้องดังตามเดิม (ดูบทเรียนใน sales_unit.missing_unit_column)"""
    s = str(err).lower()
    return TABLE in s and any(k in s for k in ("pgrst205", "42p01", "schema cache", "does not exist"))


def _valid_skus(supabase):
    res = supabase.table("skus").select("sku_id").execute()
    return {r["sku_id"] for r in (res.data or [])}


def _notify(text):
    """แจ้งกลุ่มแอดมิน (คนตั้งสินค้าในตู้) · ไม่มี token/ห้อง = พิมพ์อย่างเดียว · แจ้งไม่ได้ต้องไม่ทำให้ซิงค์ล้ม"""
    try:
        import telegram_alert as ta
        chat = ta.ADMIN_CHAT_ID or ta.OWNER_CHAT_ID
        return ta.send_message(chat, text)
    except Exception as e:  # noqa: BLE001
        print(f"[sales_pending] แจ้ง Telegram ไม่ได้: {e}")
        return None


def _summary(rows):
    """{sku: {"n": จำนวนแถว, "machines": {ตู้}, "names": {ชื่อดิบ}, "box": มีแถวกล่องไหม}}"""
    out = {}
    for r in rows:
        s = out.setdefault(r.get("sku_id"), {"n": 0, "machines": set(), "names": set(), "box": False})
        s["n"] += 1
        if r.get("machine_id"):
            s["machines"].add(r["machine_id"])
        if r.get("product_name_raw"):
            s["names"].add(r["product_name_raw"])
        if "box" in str(r.get("product_name_raw") or "").lower():
            s["box"] = True
    return out


def _alert_text(brand, rows, parked):
    e = _html.escape
    lines = []
    any_box = False
    for sku, s in sorted(_summary(rows).items(), key=lambda kv: str(kv[0])):
        any_box |= s["box"]
        lines.append(f"• <b>{e(str(sku))}</b> — {s['n']} รายการ · ตู้ {e(', '.join(sorted(s['machines'])) or '—')}"
                     f"\n   ชื่อในตู้: {e(' / '.join(sorted(s['names'])[:3]) or '—')}")
    head = (f"🆕 <b>สินค้าใหม่ยังไม่มี SKU ในระบบ</b> ({e(brand)})\n"
            "ยอดขายรายการอื่นเข้าตามปกติ\n\n" + "\n".join(lines) + "\n\n")
    if parked:
        tail = ("รายการข้างบน<b>พักไว้ให้แล้ว ไม่หาย</b> — เพิ่ม SKU เมื่อไหร่ ซิงค์รอบถัดไปย้ายเข้ายอดขายเองครบ\n"
                "แจ้งเจ้าของ/Claude ให้เพิ่ม SKU (ซองต่อกล่อง · ราคา · ทุน)")
        if any_box:
            tail += ("\n⚠️ มีรายการขายยกกล่อง — ระบบคิดไว้ 24 ซอง/กล่อง ถ้าชุดนี้ไม่ใช่ 24 บอกก่อนเพิ่ม SKU")
    else:
        tail = ("⚠️ <b>ยังไม่มีตารางพัก (migration 084 ยังไม่ได้รัน) — รายการข้างบนถูกข้าม</b>\n"
                "เพิ่ม SKU แล้วต้องดึงยอดย้อนหลังช่วงนี้เอง")
    return head + tail


def hold_unknown_skus(supabase, records, brand, notify=True):
    """แยกแถวที่ SKU ยังไม่มีในระบบไปพักไว้ → คืนเฉพาะแถวที่บันทึกลง sales ได้

    records: แถวพร้อม insert ลง sales (ต้องมี sale_key · sku_id)
    brand:   'vms' | 'worldwide' | 'payif' — ใช้ในข้อความแจ้งเตือนและคอลัมน์ brand
    """
    if not records:
        return records
    valid = _valid_skus(supabase)
    kept, unknown = [], []
    for r in records:
        (kept if r.get("sku_id") in valid else unknown).append(r)
    if not unknown:
        return kept

    counts = ", ".join(f"{k}×{v['n']}" for k, v in sorted(_summary(unknown).items(), key=lambda kv: str(kv[0])))
    rows = [{
        "sale_key":   r["sale_key"],
        "sku_id":     r["sku_id"],
        "machine_id": r.get("machine_id"),
        "brand":      brand,
        "sold_at":    r.get("sold_at"),
        "record":     _clean(r),
    } for r in unknown]

    try:
        keys = [x["sale_key"] for x in rows]
        already = set()
        for i in range(0, len(keys), 200):
            res = supabase.table(TABLE).select("sale_key").in_("sale_key", keys[i:i + 200]).execute()
            already |= {x["sale_key"] for x in (res.data or [])}
        # ทับแถวเดิมได้ (ignore_duplicates=False): ที่พักไม่ใช่ประวัติ · ดึงซ้ำหลังแก้ PACKS_PER_BOX ต้องได้ค่าใหม่
        for i in range(0, len(rows), 100):
            supabase.table(TABLE).upsert(rows[i:i + 100], on_conflict="sale_key",
                                         ignore_duplicates=False).execute()
        fresh = [r for r in unknown if r["sale_key"] not in already]
        print(f"🅿️ SKU ยังไม่มีในระบบ → พักไว้ {len(unknown)} รายการ (ใหม่ {len(fresh)}): {counts}")
        if fresh and notify:
            _notify(_alert_text(brand, fresh, parked=True))
    except Exception as e:  # noqa: BLE001
        if not _table_missing(e):
            raise
        print(f"⚠️ SKU ยังไม่มีในระบบ → ข้าม {len(unknown)} รายการ (ยังไม่มีตารางพัก — รัน migration 084): {counts}")
        if notify:
            _notify(_alert_text(brand, unknown, parked=False))
    return kept


def release_pending(supabase):
    """ย้ายแถวที่พักไว้ซึ่ง SKU มีแล้วเข้า sales → คืนจำนวนแถวที่ย้าย · เรียกต้นทุกรอบซิงค์ยอดขาย

    ลำดับ: เขียน sales ก่อน แล้วค่อยลบจากที่พัก — ล้มกลางทางแถวยังอยู่ในที่พัก รอบหน้าทำซ้ำได้
    (sales upsert แบบ ignore_duplicates จึงทำซ้ำกี่รอบก็ไม่บวกเพิ่ม)
    """
    from sales_unit import add_unit, upsert_sales

    try:
        parked, start = [], 0
        while True:
            res = supabase.table(TABLE).select("sale_key, sku_id, record") \
                .order("sale_key").range(start, start + 999).execute()
            page = res.data or []
            parked += page
            if len(page) < 1000:
                break
            start += 1000
    except Exception as e:  # noqa: BLE001
        if _table_missing(e):
            return 0
        raise
    if not parked:
        return 0

    valid = _valid_skus(supabase)
    ready = [p for p in parked if p["sku_id"] in valid]
    waiting = len(parked) - len(ready)
    if not ready:
        print(f"🅿️ รายการขายที่พักรอ SKU: {waiting} รายการ (ยังไม่มี SKU)")
        return 0

    moved = 0
    for i in range(0, len(ready), 100):
        chunk = ready[i:i + 100]
        upsert_sales(supabase, add_unit([_clean(p["record"]) for p in chunk], "product_name_raw"))
        supabase.table(TABLE).delete().in_("sale_key", [p["sale_key"] for p in chunk]).execute()
        moved += len(chunk)
    by = {}
    for p in ready:
        by[p["sku_id"]] = by.get(p["sku_id"], 0) + 1
    counts = ", ".join(f"{k}×{v}" for k, v in sorted(by.items()))
    print(f"✅ ย้ายรายการขายที่พักไว้เข้า sales {moved} รายการ: {counts}"
          + (f" · ยังรอ SKU อีก {waiting}" if waiting else ""))
    _notify(f"✅ <b>ย้ายยอดขายที่พักไว้เข้าระบบแล้ว</b> {moved} รายการ\n{_html.escape(counts)}")
    return moved
