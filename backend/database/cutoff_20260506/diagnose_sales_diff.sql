-- =============================================================
-- Diagnose Sales Diff (DVX > VMS) — 1-4 พ.ค.
-- =============================================================
-- DVX ใช้ field: transaction_id, sale_key, quantity_sold, grand_total
-- (ไม่มี txid, total_price, pay_price, quantity_packs)
--
-- สาเหตุที่น่าสงสัย:
-- - scraper หาร: per_item_price = total_price / n_items → rounding loss
-- - แต่ direction ผิด (rounding ทำให้ DVX < VMS · user บอก DVX > VMS)
-- =============================================================


-- ── Block 1: Daily summary ───────────────────────────────
SELECT
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_date,
  COUNT(*) AS rows,
  COUNT(DISTINCT transaction_id) AS unique_txn,
  COUNT(DISTINCT sale_key) AS unique_sale_keys,
  SUM(quantity_sold) AS total_packs,
  SUM(grand_total) AS dvx_revenue
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-05 00:00:00+07'::timestamptz
GROUP BY 1 ORDER BY 1;


-- ── Block 2: Duplicate sale_keys ─────────────────────────
SELECT sale_key, COUNT(*) AS dup_count
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-05 00:00:00+07'::timestamptz
GROUP BY sale_key
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;


-- ── Block 3: Transactions ที่ rounding อาจมีปัญหา ─────────
-- หา txn ที่มีหลาย rows แล้ว revenue per row ไม่ลงตัว
SELECT
  transaction_id,
  COUNT(*) AS rows,
  SUM(grand_total) AS sum_grand_total,
  MAX(grand_total) AS sample_per_item,
  MAX(grand_total) * COUNT(*) AS expected_if_uniform,
  (SUM(grand_total) - MAX(grand_total) * COUNT(*)) AS rounding_diff
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-05 00:00:00+07'::timestamptz
GROUP BY transaction_id
HAVING COUNT(*) > 1
ORDER BY rounding_diff DESC
LIMIT 20;


-- ── Block 4: ดู 10 row ล่าสุด ────────────────────────────
SELECT id, sale_key, transaction_id, sku_id, machine_id,
       quantity_sold, grand_total, sold_at
FROM sales
WHERE sold_at >= '2026-05-04 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-05 00:00:00+07'::timestamptz
ORDER BY sold_at DESC
LIMIT 10;


-- ── Block 5: Distribution by hour (timezone check) ───────
SELECT
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_date,
  EXTRACT(HOUR FROM sold_at AT TIME ZONE 'Asia/Bangkok') AS hour_bkk,
  COUNT(*) AS rows
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-05 00:00:00+07'::timestamptz
GROUP BY 1, 2
ORDER BY 1, 2;
-- ดู: ห้างเปิด ~10-22 · sale ที่ตี 1-7 = timezone bug


-- ── Block 6: Many items per transaction ──────────────────
SELECT transaction_id, COUNT(*) AS rows,
       COUNT(DISTINCT sku_id) AS distinct_sku,
       SUM(grand_total) AS revenue
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-05 00:00:00+07'::timestamptz
GROUP BY transaction_id
HAVING COUNT(*) > 5
ORDER BY rows DESC
LIMIT 10;
