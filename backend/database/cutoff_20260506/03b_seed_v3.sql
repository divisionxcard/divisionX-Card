-- =============================================================
-- Cutoff Re-Seed · Step 3b: SEED (run AFTER refill)
-- Generated: 2026-05-07T01:21:47
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
  ('OP 01', 288, 48, 326.04),
  ('OP 02', 288, 0, 208.33),
  ('OP 03', 288, 96, 207.62),
  ('OP 04', 288, 192, 190.97),
  ('OP 05', 288, 0, 188.00),
  ('OP 06', 288, 0, 187.75),
  ('OP 07', 288, 96, 104.16),
  ('OP 08', 288, 240, 79.86),
  ('OP 09', 288, 24, 184.02),
  ('OP 10', 288, 288, 83.33),
  ('OP 11', 288, 384, 246.52),
  ('OP 12', 288, 96, 121.52),
  ('OP 13', 288, 1440, 232.63),
  ('OP 14', 288, 240, 118.05),
  ('OP 15', 288, 72, 118.05),
  ('EB 01', 288, 0, 175.00),
  ('EB 02', 288, 24, 166.66),
  ('EB 03', 288, 96, 111.11),
  ('EB 04', 288, 120, 118.05),
  ('PRB 01', 100, 0, 350.00),
  ('PRB 02', 200, 90, 170.00)
  ) AS t(sku_id, packs_per_cotton, main_packs, unit_cost)
),
user_totals AS (
  SELECT sku_id, SUM(packs) AS user_packs FROM (VALUES
    ('OP 01', 96),
    ('OP 02', 70),
    ('OP 03', 74),
    ('OP 04', 30),
    ('OP 05', 0),
    ('OP 06', 60),
    ('OP 07', 145),
    ('OP 08', 190),
    ('OP 09', 194),
    ('OP 10', 138),
    ('OP 11', 178),
    ('OP 12', 138),
    ('OP 13', 425),
    ('OP 14', 143),
    ('OP 15', 302),
    ('EB 01', 60),
    ('EB 02', 108),
    ('EB 03', 156),
    ('EB 04', 136),
    ('PRB 01', 137),
    ('PRB 02', 155)
  ) AS u(sku_id, packs) GROUP BY sku_id
),
sales_totals AS (
  SELECT sku_id, COALESCE(SUM(quantity_sold), 0) AS sold
  FROM sales
  WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
    AND sold_at <  '2026-05-07 00:00:00+07'::timestamptz
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
INSERT INTO stock_in (sku_id, lot_number, source, unit, quantity, quantity_packs,
                       unit_cost, total_cost, purchased_at, note, created_by)
SELECT
  e.sku_id,
  'CUTOFF-20260507' AS lot_number,
  'Cutoff Re-Seed (2026-05-07)' AS source,
  'pack' AS unit,
  (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) AS quantity,
  (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) AS quantity_packs,
  e.unit_cost,
  (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) * e.unit_cost AS total_cost,
  '2026-05-07 00:00:00+07'::timestamptz AS purchased_at,
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
       'CUTOFF-20260507' AS lot_number,
       p.id AS to_user_id,
       'pack' AS unit,
       v.packs AS quantity,
       v.packs AS quantity_packs,
       '2026-05-07 00:00:00+07'::timestamptz AS transferred_at,
       'Cutoff transfer (Re-Seed)' AS note,
       'system_cutoff' AS created_by
FROM (VALUES
  ('EB 01', 'aofwara66', 18),
  ('EB 01', 'mzadiz1989', 22),
  ('EB 01', 'power23n', 20),
  ('EB 02', 'aofwara66', 12),
  ('EB 02', 'mzadiz1989', 53),
  ('EB 02', 'power23n', 19),
  ('EB 02', 'tueza5432', 24),
  ('EB 03', 'aofwara66', 30),
  ('EB 03', 'mzadiz1989', 92),
  ('EB 03', 'power23n', 22),
  ('EB 03', 'tueza5432', 12),
  ('EB 04', 'aofwara66', 11),
  ('EB 04', 'mzadiz1989', 87),
  ('EB 04', 'power23n', 26),
  ('EB 04', 'tueza5432', 12),
  ('OP 01', 'mzadiz1989', 47),
  ('OP 01', 'power23n', 26),
  ('OP 01', 'tueza5432', 23),
  ('OP 02', 'mzadiz1989', 29),
  ('OP 02', 'power23n', 20),
  ('OP 02', 'tueza5432', 21),
  ('OP 03', 'mzadiz1989', 30),
  ('OP 03', 'power23n', 21),
  ('OP 03', 'tueza5432', 23),
  ('OP 04', 'mzadiz1989', 30),
  ('OP 06', 'aofwara66', 16),
  ('OP 06', 'mzadiz1989', 25),
  ('OP 06', 'power23n', 19),
  ('OP 07', 'aofwara66', 3),
  ('OP 07', 'mzadiz1989', 70),
  ('OP 07', 'power23n', 56),
  ('OP 07', 'tueza5432', 16),
  ('OP 08', 'aofwara66', 37),
  ('OP 08', 'mzadiz1989', 88),
  ('OP 08', 'power23n', 46),
  ('OP 08', 'tueza5432', 19),
  ('OP 09', 'aofwara66', 44),
  ('OP 09', 'mzadiz1989', 76),
  ('OP 09', 'power23n', 53),
  ('OP 09', 'tueza5432', 21),
  ('OP 10', 'aofwara66', 11),
  ('OP 10', 'mzadiz1989', 94),
  ('OP 10', 'power23n', 17),
  ('OP 10', 'tueza5432', 16),
  ('OP 11', 'mzadiz1989', 83),
  ('OP 11', 'power23n', 81),
  ('OP 11', 'tueza5432', 14),
  ('OP 12', 'aofwara66', 3),
  ('OP 12', 'mzadiz1989', 91),
  ('OP 12', 'power23n', 25),
  ('OP 12', 'tueza5432', 19),
  ('OP 13', 'aofwara66', 78),
  ('OP 13', 'mzadiz1989', 243),
  ('OP 13', 'power23n', 79),
  ('OP 13', 'tueza5432', 25),
  ('OP 14', 'mzadiz1989', 81),
  ('OP 14', 'power23n', 39),
  ('OP 14', 'tueza5432', 23),
  ('OP 15', 'aofwara66', 1),
  ('OP 15', 'mzadiz1989', 257),
  ('OP 15', 'power23n', 8),
  ('OP 15', 'tueza5432', 36),
  ('PRB 01', 'aofwara66', 3),
  ('PRB 01', 'mzadiz1989', 115),
  ('PRB 01', 'power23n', 15),
  ('PRB 01', 'tueza5432', 4),
  ('PRB 02', 'aofwara66', 42),
  ('PRB 02', 'mzadiz1989', 109),
  ('PRB 02', 'power23n', 4)
) AS v(sku_id, username, packs)
JOIN profiles p ON p.username = v.username;

-- 3) stock_out: เติมตู้ = machine_now + sales(1-5)
--    เพราะ balance_machine = stock_out - sales · ต้องการ balance = machine_now
--    1 row/(sku, machine) · sum machine_stock + sales จัดกลุ่มตาม machine_id
INSERT INTO stock_out (sku_id, lot_number, machine_id, quantity_packs,
                        withdrawn_at, withdrawn_by_user_id, note, created_by)
SELECT t.sku_id, 'CUTOFF-20260507', t.machine_id, t.qty,
       '2026-05-07 00:00:00+07'::timestamptz, NULL,
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
    AND sold_at <  '2026-05-07 00:00:00+07'::timestamptz
    AND sku_id IS NOT NULL AND machine_id IS NOT NULL
  GROUP BY sku_id, machine_id
) t
WHERE t.qty > 0;

-- 4) อัปเดต skus.cost_price + avg_cost = unit_cost จาก Excel
--    cost_price ใช้ใน v_stock_balance/Dashboard · avg_cost ใช้ใน profit calc
UPDATE skus SET cost_price = 175.00, avg_cost = 175.00 WHERE sku_id = 'EB 01';
UPDATE skus SET cost_price = 166.66, avg_cost = 166.66 WHERE sku_id = 'EB 02';
UPDATE skus SET cost_price = 111.11, avg_cost = 111.11 WHERE sku_id = 'EB 03';
UPDATE skus SET cost_price = 118.05, avg_cost = 118.05 WHERE sku_id = 'EB 04';
UPDATE skus SET cost_price = 326.04, avg_cost = 326.04 WHERE sku_id = 'OP 01';
UPDATE skus SET cost_price = 208.33, avg_cost = 208.33 WHERE sku_id = 'OP 02';
UPDATE skus SET cost_price = 207.62, avg_cost = 207.62 WHERE sku_id = 'OP 03';
UPDATE skus SET cost_price = 190.97, avg_cost = 190.97 WHERE sku_id = 'OP 04';
UPDATE skus SET cost_price = 188.00, avg_cost = 188.00 WHERE sku_id = 'OP 05';
UPDATE skus SET cost_price = 187.75, avg_cost = 187.75 WHERE sku_id = 'OP 06';
UPDATE skus SET cost_price = 104.16, avg_cost = 104.16 WHERE sku_id = 'OP 07';
UPDATE skus SET cost_price = 79.86, avg_cost = 79.86 WHERE sku_id = 'OP 08';
UPDATE skus SET cost_price = 184.02, avg_cost = 184.02 WHERE sku_id = 'OP 09';
UPDATE skus SET cost_price = 83.33, avg_cost = 83.33 WHERE sku_id = 'OP 10';
UPDATE skus SET cost_price = 246.52, avg_cost = 246.52 WHERE sku_id = 'OP 11';
UPDATE skus SET cost_price = 121.52, avg_cost = 121.52 WHERE sku_id = 'OP 12';
UPDATE skus SET cost_price = 232.63, avg_cost = 232.63 WHERE sku_id = 'OP 13';
UPDATE skus SET cost_price = 118.05, avg_cost = 118.05 WHERE sku_id = 'OP 14';
UPDATE skus SET cost_price = 118.05, avg_cost = 118.05 WHERE sku_id = 'OP 15';
UPDATE skus SET cost_price = 350.00, avg_cost = 350.00 WHERE sku_id = 'PRB 01';
UPDATE skus SET cost_price = 170.00, avg_cost = 170.00 WHERE sku_id = 'PRB 02';

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
--   Main packs:        3546
--   User packs:        2935
--   stock_transfers:   69 rows
--   SKUs ที่มี Main:    16