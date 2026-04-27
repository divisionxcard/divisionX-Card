"""
Convert golive_template.xlsx (กรอกครบแล้ว) → seed SQL ready to paste

Logic (Flow ใหม่):
  1) อ่าน Main_Stock → main_packs[sku] = full_cottons*ppc + full_boxes*ppb + loose_packs
  2) อ่าน User_Stock → user_packs[(sku, user)]
  3) Machine portion ดึงจาก machine_stock ใน DB (subquery ใน SQL)
     - ไม่ต้องอ่าน sheet ที่ 3 อีก
     - เงื่อนไข: ก่อนรัน 02_reset · ต้อง trigger VMS sync ให้ machine_stock ใหม่ก่อน
  4) Generate SQL:
       INSERT stock_in        : 1 row/SKU = total (Main + User + Machine)
       INSERT stock_transfers : User holdings (จาก Excel)
       INSERT stock_out       : machine portion (FROM machine_stock GROUP BY sku, machine)
       UPDATE skus.avg_cost   : = unit_cost จาก Excel

Output: 03_seed_generated.sql

Run: py 04_excel_to_sql.py [path/to/template.xlsx]
"""

import sys
from datetime import datetime
from openpyxl import load_workbook
from collections import defaultdict


GO_LIVE_TS  = "2026-05-01 08:00:00+07"
LOT_NUMBER  = "GOLIVE-20260501"
SOURCE      = "Initial Inventory (Go-Live 2026-05-01)"
CREATED_BY  = "system_golive"


# ── ข้อมูล reference (ตรงกับ make_template.py) ──────────────
SKUS_INFO = {
    # sku_id: (series, packs_per_box, boxes_per_cotton)
    "OP 01":  ("OP",  12, 12),
    "OP 02":  ("OP",  12, 12),
    "OP 03":  ("OP",  12, 12),
    "OP 04":  ("OP",  12, 12),
    "OP 05":  ("OP",  12, 12),
    "OP 06":  ("OP",  12, 12),
    "OP 07":  ("OP",  12, 12),
    "OP 08":  ("OP",  12, 12),
    "OP 09":  ("OP",  12, 12),
    "OP 10":  ("OP",  12, 12),
    "OP 11":  ("OP",  12, 12),
    "OP 12":  ("OP",  12, 12),
    "OP 13":  ("OP",  12, 12),
    "OP 14":  ("OP",  12, 12),
    "OP 15":  ("OP",  12, 12),
    "EB 01":  ("EB",  12, 12),
    "EB 02":  ("EB",  12, 12),
    "EB 03":  ("EB",  12, 12),
    "EB 04":  ("EB",  12, 12),
    "PRB 01": ("PRB", 10, 12),
    "PRB 02": ("PRB", 10, 12),
}
KNOWN_USERS = {"divisionxcard", "pornthep_sm1991", "aofwara66", "power23n", "mzadiz1989"}


def cell(ws, row, col):
    v = ws.cell(row, col).value
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def parse_main(ws):
    """Main_Stock: row 4 = header, row 5+ = data
       Business rule: Main เก็บเฉพาะ Cotton + Box (ไม่มีซองเศษ)
       Cols: sku_id | series | packs_per_box | packs_per_cotton |
             full_cottons | full_boxes | total_packs (formula) |
             unit_cost_per_pack | note
    """
    main = {}
    cost = {}
    errors = []
    for r in range(4, 4 + 25):
        sku = cell(ws, r, 1)
        if not sku:
            continue
        if sku not in SKUS_INFO:
            errors.append(f"Main_Stock row {r}: sku_id '{sku}' ไม่รู้จัก")
            continue
        _, ppb, bpc = SKUS_INFO[sku]
        ppc = ppb * bpc

        cottons = cell(ws, r, 5) or 0
        boxes   = cell(ws, r, 6) or 0
        cost_pp = cell(ws, r, 8) or 0

        try:
            total_packs = int(cottons) * ppc + int(boxes) * ppb
        except (TypeError, ValueError):
            errors.append(f"Main_Stock row {r}: full_cottons/full_boxes ไม่ใช่ตัวเลข")
            continue
        if total_packs < 0:
            errors.append(f"Main_Stock row {r}: total_packs ติดลบ")
            continue

        main[sku] = total_packs
        try:
            cost[sku] = float(cost_pp) if cost_pp else 0.0
        except (TypeError, ValueError):
            errors.append(f"Main_Stock row {r}: unit_cost ไม่ใช่ตัวเลข")
    return main, cost, errors


def parse_user(ws):
    """User_Stock: row 5 = header, row 6+ = data
       Cols: username | display_name | sku_id | total_packs | note
    """
    user_packs = defaultdict(int)
    errors = []
    for r in range(5, 66):
        username = cell(ws, r, 1)
        if not username:
            continue
        if username not in KNOWN_USERS:
            errors.append(f"User_Stock row {r}: username '{username}' ไม่รู้จัก")
            continue
        sku = cell(ws, r, 3)
        packs = cell(ws, r, 4)
        if not sku:
            errors.append(f"User_Stock row {r}: ไม่มี sku_id")
            continue
        if sku not in SKUS_INFO:
            errors.append(f"User_Stock row {r}: sku_id '{sku}' ไม่รู้จัก")
            continue
        try:
            packs = int(packs or 0)
        except (TypeError, ValueError):
            errors.append(f"User_Stock row {r}: total_packs ไม่ใช่ตัวเลข")
            continue
        if packs <= 0:
            continue
        user_packs[(sku, username)] += packs
    return dict(user_packs), errors


def sql_str(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def gen_sql(main, cost, user_packs):
    out = []
    user_sum = defaultdict(int)
    for (sku, _), p in user_packs.items():
        user_sum[sku] += p

    out.append("-- =============================================================")
    out.append("-- Go-Live 1 พ.ค. 2026 · Step 3: SEED (auto-generated)")
    out.append(f"-- Generated: {datetime.now().isoformat(timespec='seconds')}")
    out.append("-- =============================================================")
    out.append("-- ⚠ ก่อน run · ต้อง trigger VMS sync แล้ว machine_stock มีข้อมูลล่าสุด")
    out.append("-- ⚠ ไฟล์นี้ใช้ machine_stock ใน DB ปัจจุบันเป็น source ของ machine portion")
    out.append("-- =============================================================")
    out.append("")
    out.append("BEGIN;")
    out.append("")

    # ── 1) stock_in: Main + User (จาก Excel) + Machine (จาก machine_stock) ──
    out.append("-- 1) stock_in: รวมยอดจริงทุก location · 1 row ต่อ SKU")
    out.append("--    machine portion ดึงจาก machine_stock subquery (สถานะ ณ เวลา run)")
    out.append("INSERT INTO stock_in (sku_id, source, unit, quantity, quantity_packs,")
    out.append("                       unit_cost, total_cost, purchased_at, note, created_by)")
    out.append("SELECT")
    out.append("  v.sku_id,")
    out.append(f"  {sql_str(SOURCE)} AS source,")
    out.append("  'pack' AS unit,")
    out.append("  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) AS quantity,")
    out.append("  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) AS quantity_packs,")
    out.append("  v.unit_cost,")
    out.append("  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) * v.unit_cost AS total_cost,")
    out.append(f"  {sql_str(GO_LIVE_TS)}::timestamptz AS purchased_at,")
    out.append("  format('Initial · Main=%s User=%s Machine=%s', v.main_packs, v.user_packs, COALESCE(m.machine_packs, 0)) AS note,")
    out.append(f"  {sql_str(CREATED_BY)} AS created_by")
    out.append("FROM (VALUES")
    rows = []
    for sku in SKUS_INFO.keys():
        m_p = main.get(sku, 0)
        u_p = user_sum.get(sku, 0)
        c   = cost.get(sku, 0.0)
        rows.append(f"  ({sql_str(sku)}, {m_p}, {u_p}, {c:.2f})")
    out.append(",\n".join(rows))
    out.append(") AS v(sku_id, main_packs, user_packs, unit_cost)")
    out.append("LEFT JOIN (")
    out.append("  SELECT sku_id, SUM(remain) AS machine_packs")
    out.append("  FROM machine_stock")
    out.append("  WHERE sku_id IS NOT NULL AND remain > 0")
    out.append("  GROUP BY sku_id")
    out.append(") m ON m.sku_id = v.sku_id")
    out.append("WHERE (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) > 0;")
    out.append("")

    # ── 2) stock_transfers (User holdings จาก Excel) ──────────
    out.append("-- 2) stock_transfers: User holdings (จาก Sheet User_Stock)")
    if user_packs:
        out.append("INSERT INTO stock_transfers (sku_id, lot_number, to_user_id, unit,")
        out.append("                              quantity, quantity_packs, transferred_at,")
        out.append("                              note, created_by)")
        out.append("SELECT v.sku_id, v.lot_number, p.id, v.unit, v.quantity, v.quantity_packs,")
        out.append("       v.transferred_at, v.note, v.created_by")
        out.append("FROM (VALUES")
        rows = []
        for (sku, username), packs in sorted(user_packs.items()):
            rows.append(
                f"  ({sql_str(sku)}, {sql_str(LOT_NUMBER)}, {sql_str(username)}, "
                f"'pack', {packs}, {packs}, {sql_str(GO_LIVE_TS)}::timestamptz, "
                f"'Initial transfer (Go-Live)', {sql_str(CREATED_BY)})"
            )
        out.append(",\n".join(rows))
        out.append(") AS v(sku_id, lot_number, username, unit, quantity, quantity_packs,")
        out.append("       transferred_at, note, created_by)")
        out.append("JOIN profiles p ON p.username = v.username;")
    else:
        out.append("-- (no user stock)")
    out.append("")

    # ── 3) stock_out (Main → Machine จาก machine_stock) ───────
    out.append("-- 3) stock_out: ของที่เติมในตู้ (Main → Machine)")
    out.append("--    1 row/(sku, machine) · sum remain ของทุก slot")
    out.append("INSERT INTO stock_out (sku_id, machine_id, quantity_packs,")
    out.append("                        withdrawn_at, withdrawn_by_user_id, note, created_by)")
    out.append("SELECT")
    out.append("  sku_id, machine_id, SUM(remain) AS quantity_packs,")
    out.append(f"  {sql_str(GO_LIVE_TS)}::timestamptz AS withdrawn_at,")
    out.append("  NULL AS withdrawn_by_user_id,")
    out.append("  'Initial machine load (Go-Live)' AS note,")
    out.append(f"  {sql_str(CREATED_BY)} AS created_by")
    out.append("FROM machine_stock")
    out.append("WHERE sku_id IS NOT NULL AND remain > 0")
    out.append("GROUP BY sku_id, machine_id;")
    out.append("")

    # ── 4) avg_cost ───────────────────────────────────────────
    out.append("-- 4) อัปเดต skus.avg_cost = unit_cost จาก Excel (single lot ถือว่าตรง)")
    rows = []
    for sku, c in sorted(cost.items()):
        if c > 0:
            rows.append(f"UPDATE skus SET avg_cost = {c:.2f} WHERE sku_id = {sql_str(sku)};")
    if rows:
        out.extend(rows)
    else:
        out.append("-- (no unit_cost data)")
    out.append("")

    # ── 5) Verify ─────────────────────────────────────────────
    out.append("-- 5) Verify: balance ทุก SKU ไม่ติดลบ + Main = Excel")
    out.append("DO $$")
    out.append("DECLARE v_neg INTEGER;")
    out.append("BEGIN")
    out.append("  SELECT COUNT(*) INTO v_neg FROM v_stock_balance WHERE balance < 0;")
    out.append("  IF v_neg > 0 THEN")
    out.append("    RAISE EXCEPTION 'Seed failed: % SKU มี balance ติดลบ', v_neg;")
    out.append("  END IF;")
    out.append("  RAISE NOTICE 'Seed OK';")
    out.append("END $$;")
    out.append("")
    out.append("COMMIT;")
    out.append("-- ROLLBACK;")
    out.append("")

    # Summary
    out.append("-- =============================================================")
    out.append(f"-- Summary จาก Excel:")
    out.append(f"--   Main packs:        {sum(main.values())}")
    out.append(f"--   User packs:        {sum(user_packs.values())}")
    out.append(f"--   stock_transfers:   {len(user_packs)} rows")
    out.append(f"--   SKUs ที่มีของ Main: {len([s for s,p in main.items() if p > 0])}")
    out.append(f"--   Machine portion:   ดึงจาก machine_stock ตอนรัน SQL (ดูผลใน RAISE NOTICE)")
    out.append("-- =============================================================")

    return "\n".join(out)


def main():
    in_path  = sys.argv[1] if len(sys.argv) > 1 else "golive_template.xlsx"
    out_path = "03_seed_generated.sql"

    wb = load_workbook(in_path, data_only=False)
    main_packs, cost, e1 = parse_main(wb["Main_Stock"])
    user_packs, e2       = parse_user(wb["User_Stock"])

    errors = e1 + e2
    if errors:
        print("ERRORS — fix Excel ก่อนนำไป seed:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    sql = gen_sql(main_packs, cost, user_packs)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(sql)

    user_total = sum(user_packs.values())
    main_total = sum(main_packs.values())
    print(f"OK wrote {out_path}")
    print(f"  - SKUs with Main stock: {len([s for s,p in main_packs.items() if p > 0])}")
    print(f"  - Main packs total:     {main_total}")
    print(f"  - User packs total:     {user_total}")
    print(f"  - User rows:            {len(user_packs)}")
    print(f"  - Machine portion:      pulled from machine_stock at SQL run time (trigger VMS sync first)")


if __name__ == "__main__":
    main()
