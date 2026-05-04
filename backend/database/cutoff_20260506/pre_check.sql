-- =============================================================
-- Cutoff Re-Seed · Pre-Check (run ก่อน paste seed)
-- =============================================================
-- Run แต่ละ block แยกกัน · paste 1 block ครั้งละครั้งใน SQL Editor
-- ใช้ verify ว่า DB state พร้อม seed
-- =============================================================

-- ── Block 1: stock tables ต้องว่างหมด (รัน reset แล้ว) ────
SELECT 'stock_in' AS tbl, COUNT(*) AS rows FROM stock_in
UNION ALL SELECT 'stock_out', COUNT(*) FROM stock_out
UNION ALL SELECT 'stock_transfers', COUNT(*) FROM stock_transfers
UNION ALL SELECT 'claims', COUNT(*) FROM claims
ORDER BY tbl;
-- คาดหวัง: ทุก table = 0 rows (ถ้าไม่ใช่ ต้อง run 02_reset_v3.sql ก่อน)


-- ── Block 2: sales ต้องมีของ 1-5 พ.ค. ────────────────────
SELECT
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_date,
  COUNT(*) AS rows,
  SUM(quantity_sold) AS total_packs
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-06 00:00:00+07'::timestamptz
GROUP BY 1
ORDER BY 1;
-- คาดหวัง: 5 rows (1, 2, 3, 4, 5 พ.ค.) · ถ้าวันไหนหาย → ต้อง backfill VMS sync


-- ── Block 3: machine_stock fresh ────────────────────────
SELECT
  COUNT(*) FILTER (WHERE remain > 0) AS slots_with_stock,
  COUNT(*) AS slots_total,
  SUM(remain) FILTER (WHERE sku_id IS NOT NULL) AS total_packs_in_machines,
  MAX(updated_at AT TIME ZONE 'Asia/Bangkok') AS latest_sync
FROM machine_stock;
-- คาดหวัง: latest_sync ใกล้เวลาตอนนี้ (~5-10 นาทีที่แล้ว) + slots_with_stock มีค่า


-- ── Block 4: profiles 5 user (รวม tueza5432) ────────────
SELECT username, role
FROM profiles
WHERE username IN ('divisionxcard', 'tueza5432', 'aofwara66', 'power23n', 'mzadiz1989')
ORDER BY username;
-- คาดหวัง: 5 rows · ทุก username มี · ไม่มี pornthep_sm1991


-- ── Block 5: SKUs reset แล้ว ─────────────────────────────
SELECT COUNT(*) AS sku_count, COUNT(*) FILTER (WHERE avg_cost > 0) AS with_cost
FROM skus;
-- คาดหวัง: sku_count = 21 · with_cost = 0 (จะถูก update หลัง seed)
