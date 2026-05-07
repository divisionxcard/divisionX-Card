-- =============================================================
-- Incoming Stock 7 พ.ค. 2026 (กรรมการเติม)
-- =============================================================
-- หลัง cutoff รอบ 2 (commit 328993b) · กรรมการนำของมาเติม
-- ตามรายงาน refill_report_for_committee_20260507.md + เพิ่มสำรอง
--
-- 18 SKU · 6,600 packs · ใช้ cost_price จาก skus table
-- Lot: INCOMING-20260507
-- =============================================================

BEGIN;

INSERT INTO stock_in (sku_id, lot_number, source, unit, quantity, quantity_packs,
                      unit_cost, total_cost, purchased_at, note, created_by)
SELECT v.sku_id,
       'INCOMING-20260507' AS lot_number,
       'Incoming stock (กรรมการเติม 7 พ.ค.)' AS source,
       'pack' AS unit,
       v.packs AS quantity,
       v.packs AS quantity_packs,
       s.cost_price AS unit_cost,
       v.packs * s.cost_price AS total_cost,
       '2026-05-07 02:30:00+07'::timestamptz AS purchased_at,
       v.note,
       'system_incoming' AS created_by
FROM (VALUES
  ('OP 02', 48,    '2 box'),
  ('OP 03', 70,    '2 box + 22 packs'),
  ('OP 04', 16,    '16 packs'),
  ('OP 06', 2,     'adjust deficit (admin refill เกิน 2)'),
  ('OP 07', 215,   '8 box + 23 packs'),
  ('OP 08', 421,   '5 box + 13 packs + 1 cotton'),
  ('OP 09', 125,   '5 box + 5 packs'),
  ('OP 10', 801,   '9 box + 9 packs + 2 cotton'),
  ('OP 11', 533,   '10 box + 5 packs + 1 cotton'),
  ('OP 12', 497,   '8 box + 17 packs + 1 cotton'),
  ('OP 13', 1308,  '6 box + 12 packs + 4 cotton'),
  ('OP 14', 97,    '4 box + 1 pack'),
  ('OP 15', 203,   '8 box + 11 packs'),
  ('EB 02', 48,    '2 box'),
  ('EB 03', 487,   '8 box + 7 packs + 1 cotton'),
  ('EB 04', 88,    '3 box + 16 packs'),
  ('PRB 01', 1534, '3 box + 4 packs + 15 cotton'),
  ('PRB 02', 107,  '10 box + 7 packs')
) AS v(sku_id, packs, note)
JOIN skus s ON s.sku_id = v.sku_id;

DO $$
DECLARE v_in INT; v_cost NUMERIC; v_neg INT;
BEGIN
  SELECT SUM(quantity_packs), SUM(total_cost) INTO v_in, v_cost
  FROM stock_in WHERE lot_number = 'INCOMING-20260507';

  SELECT COUNT(*) INTO v_neg FROM v_stock_balance WHERE balance < 0;

  RAISE NOTICE 'Incoming OK · packs=% · total cost=% · neg balance=%',
               v_in, v_cost, v_neg;
END $$;

COMMIT;

-- หมายเหตุ:
-- OP 06 ติดลบ 2 ตอน run แรก เพราะ admin refill หลัง cutoff (62 packs)
-- > user holdings cutoff (60 packs) — count ใน Excel น้อยกว่าจริง 2 packs
-- เพิ่ม OP 06 = 2 packs เพื่อ balance ไม่ติดลบ
