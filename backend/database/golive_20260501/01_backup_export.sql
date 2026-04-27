-- =============================================================
-- Go-Live 1 พ.ค. 2026 · Step 1: Backup ก่อน Reset
-- =============================================================
-- วิธีใช้:
--   1) เปิด PROD Supabase SQL Editor
--   2) Run ทีละ query (แต่ละ block) → กด "Export" → "CSV"
--   3) ตั้งชื่อไฟล์ตามที่กำกับไว้ในแต่ละ block · เก็บใน folder
--      เช่น "C:\backup\golive\stock_in_20260501.csv"
--   4) เก็บครบ 7 ไฟล์แล้วค่อยไป Step 2 (reset)
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1/7) stock_in  →  ตั้งชื่อไฟล์: stock_in_20260501.csv
-- ──────────────────────────────────────────────────────────────
SELECT
  id, sku_id, source, unit, quantity, quantity_packs,
  unit_cost, total_cost, purchased_at, note, created_by,
  created_at, updated_at
FROM stock_in
ORDER BY id;


-- ──────────────────────────────────────────────────────────────
-- 2/7) stock_out  →  stock_out_20260501.csv
-- ──────────────────────────────────────────────────────────────
SELECT
  id, sku_id, machine_id, quantity_packs, withdrawn_at,
  withdrawn_by_user_id, note, created_by, created_at, updated_at
FROM stock_out
ORDER BY id;


-- ──────────────────────────────────────────────────────────────
-- 3/7) stock_transfers  →  stock_transfers_20260501.csv
-- ──────────────────────────────────────────────────────────────
SELECT
  id, sku_id, lot_number, to_user_id, unit, quantity, quantity_packs,
  transferred_at, note, created_by, created_at
FROM stock_transfers
ORDER BY id;


-- ──────────────────────────────────────────────────────────────
-- 4/7) claims  →  claims_20260501.csv
-- ──────────────────────────────────────────────────────────────
SELECT
  id, machine_id, sku_id, quantity, refund_amount,
  product_status, confirm_status, managed_by_user_id,
  reason, note, claimed_at, created_by, created_at
FROM claims
ORDER BY id;


-- ──────────────────────────────────────────────────────────────
-- 5/7) sales  →  sales_20260501.csv
-- ──────────────────────────────────────────────────────────────
SELECT
  id, machine_id, sku_id, quantity_sold, revenue,
  sold_at, synced_at, vms_ref, created_at
FROM sales
ORDER BY sold_at, id;


-- ──────────────────────────────────────────────────────────────
-- 6/7) machine_stock  →  machine_stock_20260501.csv
-- ──────────────────────────────────────────────────────────────
SELECT
  id, machine_id, kiosk_record_id, slot_number, product_id,
  product_name, sku_id, remain, max_capacity, is_occupied,
  status, synced_at
FROM machine_stock
ORDER BY machine_id, slot_number;


-- ──────────────────────────────────────────────────────────────
-- 7/7) login_history  →  login_history_20260501.csv
--      (ไม่ได้ reset · backup ไว้เผื่อมี audit ต้องการ)
-- ──────────────────────────────────────────────────────────────
SELECT
  id, user_id, email, display_name, action, ip_address,
  user_agent, created_at
FROM login_history
ORDER BY id;


-- ──────────────────────────────────────────────────────────────
-- BONUS: snapshot summary (เผื่อ verify ทีหลัง)  →  pre_reset_summary.csv
-- ──────────────────────────────────────────────────────────────
SELECT 'stock_in' AS table_name, COUNT(*) AS row_count, NOW() AS snapshot_at FROM stock_in
UNION ALL SELECT 'stock_out',         COUNT(*), NOW() FROM stock_out
UNION ALL SELECT 'stock_transfers',   COUNT(*), NOW() FROM stock_transfers
UNION ALL SELECT 'claims',            COUNT(*), NOW() FROM claims
UNION ALL SELECT 'sales',             COUNT(*), NOW() FROM sales
UNION ALL SELECT 'machine_stock',     COUNT(*), NOW() FROM machine_stock
UNION ALL SELECT 'login_history',     COUNT(*), NOW() FROM login_history
ORDER BY table_name;
