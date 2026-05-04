-- =============================================================
-- Cutoff Re-Seed · Step 3a: REFILL REPORT (run before refill)
-- Generated: 2026-05-05T03:47:11
-- =============================================================
-- รัน "ก่อน" กรรมการเติม · ดูว่า SKU ไหนต้องเติมกี่ packs ให้ครบ Cotton
-- ไม่ INSERT อะไร · แค่ SELECT
-- ⚠ ก่อน run · กดปุ่ม VMS sync ให้ machine_stock fresh
-- =============================================================

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
