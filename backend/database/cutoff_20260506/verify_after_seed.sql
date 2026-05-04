-- =============================================================
-- Cutoff Re-Seed · Verify (run หลัง paste 03b_seed_v3.sql)
-- =============================================================

-- ── Block 1: balance ทุก SKU ─────────────────────────────
SELECT
  sku_id,
  in_packs       AS received,
  out_packs      AS withdrawn,
  transfer_packs AS transferred,
  sold_packs     AS sold,
  balance        AS in_main_now
FROM v_stock_balance
ORDER BY sku_id;
-- คาดหวัง: balance >= 0 ทุก SKU · ค่า in_main_now = main_packs ใน Excel หลังเติม


-- ── Block 2: User holdings (per user · per sku) ─────────
SELECT
  p.username,
  st.sku_id,
  SUM(st.quantity_packs) AS transferred_packs,
  COALESCE(SUM(so.quantity_packs) FILTER (
    WHERE so.withdrawn_by_user_id = p.id
  ), 0) AS withdrawn_packs,
  SUM(st.quantity_packs) - COALESCE(SUM(so.quantity_packs) FILTER (
    WHERE so.withdrawn_by_user_id = p.id
  ), 0) AS holding_now
FROM stock_transfers st
JOIN profiles p ON p.id = st.to_user_id
LEFT JOIN stock_out so ON so.sku_id = st.sku_id AND so.withdrawn_by_user_id = p.id
GROUP BY p.username, st.sku_id, p.id
HAVING SUM(st.quantity_packs) > 0
ORDER BY p.username, st.sku_id;
-- คาดหวัง: ตรงกับ User_Stock ใน Excel


-- ── Block 3: Machine balance (per machine · per sku) ────
SELECT
  m.machine_code,
  so.sku_id,
  SUM(so.quantity_packs) AS loaded,
  COALESCE(SUM(s.quantity_sold), 0) AS sold_from_machine,
  SUM(so.quantity_packs) - COALESCE(SUM(s.quantity_sold), 0) AS in_machine_now
FROM stock_out so
JOIN machines m ON m.id = so.machine_id
LEFT JOIN sales s ON s.machine_id = so.machine_id AND s.sku_id = so.sku_id
  AND s.sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND s.sold_at <  '2026-05-06 00:00:00+07'::timestamptz
GROUP BY m.machine_code, so.sku_id
ORDER BY m.machine_code, so.sku_id;
-- คาดหวัง: in_machine_now ≈ machine_stock จริง


-- ── Block 4: Total stock (รวมทุก location) ──────────────
WITH all_stock AS (
  SELECT sku_id, balance AS main_packs FROM v_stock_balance
),
user_holdings AS (
  SELECT st.sku_id, SUM(st.quantity_packs) - COALESCE(
    (SELECT SUM(so.quantity_packs)
     FROM stock_out so
     WHERE so.sku_id = st.sku_id AND so.withdrawn_by_user_id IS NOT NULL),
    0
  ) AS user_packs
  FROM stock_transfers st
  GROUP BY st.sku_id
),
machine_now AS (
  SELECT sku_id, SUM(remain) AS machine_packs
  FROM machine_stock WHERE sku_id IS NOT NULL AND remain > 0
  GROUP BY sku_id
),
sales_total AS (
  SELECT sku_id, COALESCE(SUM(quantity_sold), 0) AS sold
  FROM sales
  WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
    AND sold_at <  '2026-05-06 00:00:00+07'::timestamptz
  GROUP BY sku_id
)
SELECT
  COALESCE(a.sku_id, u.sku_id, m.sku_id, s.sku_id) AS sku_id,
  COALESCE(a.main_packs, 0)    AS main,
  COALESCE(u.user_packs, 0)    AS users,
  COALESCE(m.machine_packs, 0) AS machine,
  COALESCE(s.sold, 0)          AS sold,
  COALESCE(a.main_packs, 0) + COALESCE(u.user_packs, 0)
    + COALESCE(m.machine_packs, 0) + COALESCE(s.sold, 0) AS grand_total
FROM all_stock a
FULL JOIN user_holdings u  ON u.sku_id = a.sku_id
FULL JOIN machine_now m    ON m.sku_id = COALESCE(a.sku_id, u.sku_id)
FULL JOIN sales_total s    ON s.sku_id = COALESCE(a.sku_id, u.sku_id, m.sku_id)
ORDER BY sku_id;
-- คาดหวัง: grand_total = stock_in.quantity_packs ของ SKU เดียวกัน · เป็น Cotton เต็ม


-- ── Block 5: avg_cost อัปเดต ─────────────────────────────
SELECT sku_id, avg_cost FROM skus WHERE avg_cost > 0 ORDER BY sku_id;
-- คาดหวัง: 21 rows · ทุก SKU มี avg_cost > 0
