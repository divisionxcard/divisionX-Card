-- 022: อัปเดต v_stock_balance ให้หัก stock_transfers ออกด้วย
-- สต็อกหลัก = stock_in - stock_out(เก่าไม่มี user_id) - stock_transfers

CREATE OR REPLACE VIEW v_stock_balance AS
SELECT
  s.sku_id,
  s.name,
  s.series,
  s.sell_price,
  s.cost_price,
  COALESCE(si.total_in,  0) AS total_in,
  COALESCE(so.total_out, 0) + COALESCE(tf.total_transferred, 0) AS total_out,
  COALESCE(si.total_in,  0) - COALESCE(so.total_out, 0) - COALESCE(tf.total_transferred, 0) AS balance
FROM skus s
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_in
  FROM stock_in
  GROUP BY sku_id
) si ON si.sku_id = s.sku_id
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_out
  FROM stock_out
  WHERE withdrawn_by_user_id IS NULL
  GROUP BY sku_id
) so ON so.sku_id = s.sku_id
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_transferred
  FROM stock_transfers
  GROUP BY sku_id
) tf ON tf.sku_id = s.sku_id
WHERE s.is_active = true;

COMMENT ON VIEW v_stock_balance IS 'สต็อกหลักคงเหลือ Real-time (stock_in - stock_out เก่า - stock_transfers)';
