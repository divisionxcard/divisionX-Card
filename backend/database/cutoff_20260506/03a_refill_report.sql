-- =============================================================
-- Cutoff Re-Seed · Step 3a: REFILL REPORT (run before refill)
-- Generated: 2026-05-07T01:21:47
-- =============================================================
-- รัน "ก่อน" กรรมการเติม · ดูว่า SKU ไหนต้องเติมกี่ packs ให้ครบ Cotton
-- ไม่ INSERT อะไร · แค่ SELECT
-- ⚠ ก่อน run · กดปุ่ม VMS sync ให้ machine_stock fresh
-- =============================================================

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
SELECT
  e.sku_id,
  e.packs_per_cotton AS ppc,
  e.main_packs       AS main_now,
  COALESCE(u.user_packs, 0)    AS user_now,
  COALESCE(m.machine_packs, 0) AS machine_now,
  COALESCE(s.sold, 0)          AS sold_1_5,
  e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0) AS total_now,
  CEIL((e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0))::numeric / e.packs_per_cotton) * e.packs_per_cotton AS target,
  CEIL((e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0))::numeric / e.packs_per_cotton) * e.packs_per_cotton
    - (e.main_packs + COALESCE(u.user_packs, 0) + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0)) AS refill_packs,
  e.unit_cost
FROM excel_data e
LEFT JOIN user_totals u    ON u.sku_id = e.sku_id
LEFT JOIN sales_totals s   ON s.sku_id = e.sku_id
LEFT JOIN machine_totals m ON m.sku_id = e.sku_id
ORDER BY e.sku_id;
