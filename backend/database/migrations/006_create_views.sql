-- =============================================================
-- Migration 006: Create views for stock summary & reports
-- =============================================================

-- View: ยอดคงเหลือสต็อกแบบ Real-time แยกตาม SKU
CREATE OR REPLACE VIEW v_stock_balance AS
SELECT
  s.sku_id,
  s.name,
  s.series,
  s.sell_price,
  s.cost_price,
  COALESCE(si.total_in,  0) AS total_packs_in,
  COALESCE(so.total_out, 0) AS total_packs_out,
  COALESCE(si.total_in, 0) - COALESCE(so.total_out, 0) AS balance_packs
FROM skus s
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_in
  FROM stock_in
  GROUP BY sku_id
) si ON si.sku_id = s.sku_id
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_out
  FROM stock_out
  GROUP BY sku_id
) so ON so.sku_id = s.sku_id
WHERE s.is_active = true;

COMMENT ON VIEW v_stock_balance IS 'สต็อกคงเหลือ Real-time แยกตาม SKU (stock_in - stock_out)';

-- View: ยอดขายรายวันแยกตามตู้
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_date,
  machine_id,
  sku_id,
  SUM(quantity_sold) AS total_qty,
  SUM(revenue)       AS total_revenue
FROM sales
GROUP BY
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok'),
  machine_id,
  sku_id;

COMMENT ON VIEW v_daily_sales IS 'ยอดขายรายวันแยกตามตู้และ SKU (ใช้เขตเวลา Asia/Bangkok)';

-- View: ยอดขายรายเดือนแยกตามตู้
CREATE OR REPLACE VIEW v_monthly_sales AS
SELECT
  DATE_TRUNC('month', sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_month,
  machine_id,
  sku_id,
  SUM(quantity_sold) AS total_qty,
  SUM(revenue)       AS total_revenue
FROM sales
GROUP BY
  DATE_TRUNC('month', sold_at AT TIME ZONE 'Asia/Bangkok'),
  machine_id,
  sku_id;

COMMENT ON VIEW v_monthly_sales IS 'ยอดขายรายเดือนแยกตามตู้และ SKU';

-- View: Stock Movement History (ประวัติทั้งหมด)
CREATE OR REPLACE VIEW v_stock_movement AS
SELECT
  'stock_in'        AS movement_type,
  si.id             AS ref_id,
  si.sku_id,
  sk.name           AS sku_name,
  NULL::VARCHAR(50) AS machine_id,
  si.quantity_packs AS packs,
  si.source         AS description,
  si.purchased_at   AS moved_at,
  si.created_by
FROM stock_in si
JOIN skus sk ON sk.sku_id = si.sku_id
UNION ALL
SELECT
  'stock_out'       AS movement_type,
  so.id             AS ref_id,
  so.sku_id,
  sk.name           AS sku_name,
  so.machine_id,
  -so.quantity_packs AS packs,  -- negative = ออก
  CONCAT('เติม ', m.name) AS description,
  so.withdrawn_at   AS moved_at,
  so.created_by
FROM stock_out so
JOIN skus     sk ON sk.sku_id     = so.sku_id
JOIN machines m  ON m.machine_id  = so.machine_id
ORDER BY moved_at DESC;

COMMENT ON VIEW v_stock_movement IS 'ประวัติการเคลื่อนไหวสต็อกทั้งหมด (in/out รวมกัน)';
