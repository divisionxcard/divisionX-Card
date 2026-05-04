-- =============================================================
-- Cutoff Re-Seed · Step 3b: SEED (run AFTER refill)
-- Generated: 2026-05-05T03:47:11
-- =============================================================
-- รัน "หลัง" กรรมการเติมของจริงตามรายงาน 03a เสร็จแล้ว
-- ⚠ ก่อน run · ต้อง:
--   1) Reset แล้ว (02_reset_v3.sql)
--   2) Trigger VMS sync รอบสุดท้าย (machine_stock fresh)
--   3) แก้ Excel · update main_packs ให้รวมของที่เติมแล้ว
--   4) Re-run python converter ให้ Excel data ใหม่ลง SQL นี้
-- =============================================================

BEGIN;

-- 1) stock_in: 1 row/SKU = main + user + machine + sales(1-5)
--    ใช้ unit_cost จาก Excel · total_cost = qty × cost
WITH excel_data AS (
  SELECT * FROM (VALUES
  ('OP 01', 288, 72, 326.04),
  ('OP 02', 288, 24, 208.33),
  ('OP 03', 288, 120, 207.62),
  ('OP 04', 288, 216, 190.97),
  ('OP 05', 288, 0, 188.00),
  ('OP 06', 288, 0, 187.75),
  ('OP 07', 288, 144, 104.16),
  ('OP 08', 288, 264, 79.86),
  ('OP 09', 288, 216, 184.02),
  ('OP 10', 288, 384, 83.33),
  ('OP 11', 288, 408, 246.52),
  ('OP 12', 288, 144, 121.52),
  ('OP 13', 288, 1656, 232.63),
  ('OP 14', 288, 264, 118.05),
  ('OP 15', 288, 288, 118.05),
  ('EB 01', 288, 0, 175.00),
  ('EB 02', 288, 96, 166.66),
  ('EB 03', 288, 216, 111.11),
  ('EB 04', 288, 264, 118.05),
  ('PRB 01', 100, 110, 350.00),
  ('PRB 02', 200, 210, 170.00)
  ) AS t(sku_id, packs_per_cotton, main_packs, unit_cost)
),
user_totals AS (
  SELECT sku_id, SUM(packs) AS user_packs FROM (VALUES
    ('OP 01', 97),
    ('OP 02', 70),
    ('OP 03', 75),
    ('OP 04', 31),
    ('OP 05', 0),
    ('OP 06', 50),
    ('OP 07', 145),
    ('OP 08', 137),
    ('OP 09', 139),
    ('OP 10', 65),
    ('OP 11', 179),
    ('OP 12', 115),
    ('OP 13', 202),
    ('OP 14', 144),
    ('OP 15', 217),
    ('EB 01', 53),
    ('EB 02', 80),
    ('EB 03', 58),
    ('EB 04', 46),
    ('PRB 01', 68),
    ('PRB 02', 50)
  ) AS u(sku_id, packs) GROUP BY sku_id
),
sales_totals AS (
  SELECT sku_id, COALESCE(SUM(quantity_sold), 0) AS sold
  FROM sales
  WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
    AND sold_at <  '2026-05-06 00:00:00+07'::timestamptz
    AND sku_id IS NOT NULL
  GROUP BY sku_id
),
machine_totals AS (
  -- Box slots (product_name มี 'box') → remain เป็นกล่อง · ต้อง × packs_per_box
  SELECT sku_id, SUM(CASE
    WHEN product_name ILIKE '%box%' AND sku_id LIKE 'PRB%' THEN remain * 10
    WHEN product_name ILIKE '%box%' THEN remain * 24
    ELSE remain
  END) AS machine_packs
  FROM machine_stock
  WHERE sku_id IS NOT NULL AND remain > 0
  GROUP BY sku_id
)
INSERT INTO stock_in (sku_id, source, unit, quantity, quantity_packs,
                       unit_cost, total_cost, purchased_at, note, created_by)
SELECT
  e.sku_id,
  'Cutoff Re-Seed (2026-05-06)' AS source,
  'pack' AS unit,
  (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) AS quantity,
  (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) AS quantity_packs,
  e.unit_cost,
  (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) * e.unit_cost AS total_cost,
  '2026-05-06 00:00:00+07'::timestamptz AS purchased_at,
  format('Cutoff · Main=%s User=%s Machine=%s Sold=%s',
    e.main_packs, COALESCE(u.user_packs, 0), COALESCE(m.machine_packs, 0), COALESCE(s.sold, 0)) AS note,
  'system_cutoff' AS created_by
FROM excel_data e
LEFT JOIN user_totals u    ON u.sku_id = e.sku_id
LEFT JOIN sales_totals s   ON s.sku_id = e.sku_id
LEFT JOIN machine_totals m ON m.sku_id = e.sku_id
WHERE (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) > 0;

-- 2) stock_transfers: User holdings (จาก Excel)
INSERT INTO stock_transfers (sku_id, lot_number, to_user_id, unit,
                              quantity, quantity_packs, transferred_at,
                              note, created_by)
SELECT v.sku_id,
       'CUTOFF-20260506' AS lot_number,
       p.id AS to_user_id,
       'pack' AS unit,
       v.packs AS quantity,
       v.packs AS quantity_packs,
       '2026-05-06 00:00:00+07'::timestamptz AS transferred_at,
       'Cutoff transfer (Re-Seed)' AS note,
       'system_cutoff' AS created_by
FROM (VALUES
  ('EB 01', 'mzadiz1989', 11),
  ('EB 01', 'power23n', 20),
  ('EB 01', 'tueza5432', 22),
  ('EB 02', 'mzadiz1989', 37),
  ('EB 02', 'power23n', 19),
  ('EB 02', 'tueza5432', 24),
  ('EB 03', 'mzadiz1989', 24),
  ('EB 03', 'power23n', 22),
  ('EB 03', 'tueza5432', 12),
  ('EB 04', 'mzadiz1989', 8),
  ('EB 04', 'power23n', 26),
  ('EB 04', 'tueza5432', 12),
  ('OP 01', 'mzadiz1989', 48),
  ('OP 01', 'power23n', 26),
  ('OP 01', 'tueza5432', 23),
  ('OP 02', 'mzadiz1989', 29),
  ('OP 02', 'power23n', 20),
  ('OP 02', 'tueza5432', 21),
  ('OP 03', 'mzadiz1989', 31),
  ('OP 03', 'power23n', 21),
  ('OP 03', 'tueza5432', 23),
  ('OP 04', 'mzadiz1989', 31),
  ('OP 06', 'mzadiz1989', 12),
  ('OP 06', 'power23n', 19),
  ('OP 06', 'tueza5432', 19),
  ('OP 07', 'mzadiz1989', 74),
  ('OP 07', 'power23n', 55),
  ('OP 07', 'tueza5432', 16),
  ('OP 08', 'mzadiz1989', 72),
  ('OP 08', 'power23n', 46),
  ('OP 08', 'tueza5432', 19),
  ('OP 09', 'mzadiz1989', 65),
  ('OP 09', 'power23n', 53),
  ('OP 09', 'tueza5432', 21),
  ('OP 10', 'mzadiz1989', 32),
  ('OP 10', 'power23n', 17),
  ('OP 10', 'tueza5432', 16),
  ('OP 11', 'mzadiz1989', 84),
  ('OP 11', 'power23n', 81),
  ('OP 11', 'tueza5432', 14),
  ('OP 12', 'mzadiz1989', 71),
  ('OP 12', 'power23n', 25),
  ('OP 12', 'tueza5432', 19),
  ('OP 13', 'mzadiz1989', 98),
  ('OP 13', 'power23n', 79),
  ('OP 13', 'tueza5432', 25),
  ('OP 14', 'mzadiz1989', 82),
  ('OP 14', 'power23n', 39),
  ('OP 14', 'tueza5432', 23),
  ('OP 15', 'mzadiz1989', 173),
  ('OP 15', 'power23n', 8),
  ('OP 15', 'tueza5432', 36),
  ('PRB 01', 'mzadiz1989', 49),
  ('PRB 01', 'power23n', 15),
  ('PRB 01', 'tueza5432', 4),
  ('PRB 02', 'mzadiz1989', 46),
  ('PRB 02', 'power23n', 4)
) AS v(sku_id, username, packs)
JOIN profiles p ON p.username = v.username;

-- 3) stock_out: เติมตู้ = machine_now + sales(1-5)
--    เพราะ balance_machine = stock_out - sales · ต้องการ balance = machine_now
--    1 row/(sku, machine) · sum machine_stock + sales จัดกลุ่มตาม machine_id
INSERT INTO stock_out (sku_id, machine_id, quantity_packs,
                        withdrawn_at, withdrawn_by_user_id, note, created_by)
SELECT t.sku_id, t.machine_id, t.qty,
       '2026-05-06 00:00:00+07'::timestamptz, NULL,
       'Initial machine load (Cutoff Re-Seed)',
       'system_cutoff'
FROM (
  -- Box slots → remain เป็นกล่อง · ต้อง × packs_per_box
  SELECT sku_id, machine_id, SUM(CASE
    WHEN product_name ILIKE '%box%' AND sku_id LIKE 'PRB%' THEN remain * 10
    WHEN product_name ILIKE '%box%' THEN remain * 24
    ELSE remain
  END) AS qty
  FROM machine_stock
  WHERE sku_id IS NOT NULL AND remain > 0
  GROUP BY sku_id, machine_id
  UNION ALL
  SELECT sku_id, machine_id, COALESCE(SUM(quantity_sold), 0)
  FROM sales
  WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
    AND sold_at <  '2026-05-06 00:00:00+07'::timestamptz
    AND sku_id IS NOT NULL AND machine_id IS NOT NULL
  GROUP BY sku_id, machine_id
) t
WHERE t.qty > 0;

-- 4) อัปเดต skus.avg_cost = unit_cost จาก Excel
UPDATE skus SET avg_cost = 175.00 WHERE sku_id = 'EB 01';
UPDATE skus SET avg_cost = 166.66 WHERE sku_id = 'EB 02';
UPDATE skus SET avg_cost = 111.11 WHERE sku_id = 'EB 03';
UPDATE skus SET avg_cost = 118.05 WHERE sku_id = 'EB 04';
UPDATE skus SET avg_cost = 326.04 WHERE sku_id = 'OP 01';
UPDATE skus SET avg_cost = 208.33 WHERE sku_id = 'OP 02';
UPDATE skus SET avg_cost = 207.62 WHERE sku_id = 'OP 03';
UPDATE skus SET avg_cost = 190.97 WHERE sku_id = 'OP 04';
UPDATE skus SET avg_cost = 188.00 WHERE sku_id = 'OP 05';
UPDATE skus SET avg_cost = 187.75 WHERE sku_id = 'OP 06';
UPDATE skus SET avg_cost = 104.16 WHERE sku_id = 'OP 07';
UPDATE skus SET avg_cost = 79.86 WHERE sku_id = 'OP 08';
UPDATE skus SET avg_cost = 184.02 WHERE sku_id = 'OP 09';
UPDATE skus SET avg_cost = 83.33 WHERE sku_id = 'OP 10';
UPDATE skus SET avg_cost = 246.52 WHERE sku_id = 'OP 11';
UPDATE skus SET avg_cost = 121.52 WHERE sku_id = 'OP 12';
UPDATE skus SET avg_cost = 232.63 WHERE sku_id = 'OP 13';
UPDATE skus SET avg_cost = 118.05 WHERE sku_id = 'OP 14';
UPDATE skus SET avg_cost = 118.05 WHERE sku_id = 'OP 15';
UPDATE skus SET avg_cost = 350.00 WHERE sku_id = 'PRB 01';
UPDATE skus SET avg_cost = 170.00 WHERE sku_id = 'PRB 02';

-- 5) Verify: balance ทุก SKU ไม่ติดลบ
DO $$
DECLARE v_neg INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_neg FROM v_stock_balance WHERE balance < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION 'Seed failed: % SKU มี balance ติดลบ', v_neg;
  END IF;
  RAISE NOTICE 'Seed OK';
END $$;

COMMIT;
-- ROLLBACK;

-- Summary จาก Excel:
--   Main packs:        5096
--   User packs:        2021
--   stock_transfers:   57 rows
--   SKUs ที่มี Main:    18