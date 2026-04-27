-- =============================================================
-- DRY RUN บน STAGING — ทดสอบ flow Reset + Seed (ใช้ machine_stock จาก DB)
-- =============================================================
-- ⚠ ต้อง run บน STAGING (dorixlcllcjszexshlwo) เท่านั้น
-- ⚠ จะลบข้อมูลทดสอบใน staging — staging เป็น mock data ทิ้งได้
--
-- Flow ใหม่:
--   1) Reset transactional (ไม่แตะ machine_stock)
--   2) Seed machine_stock เอง (ใน staging ไม่มี VMS sync · ต้อง insert เอง)
--   3) Run seed SQL (Main + User + Machine จาก machine_stock subquery)
--   4) Verify
-- =============================================================

-- ── -1) Ensure machines + skus มีใน staging ─────────────────
-- staging seed ใช้ test-kiosk-01 ไม่ใช่ chukes01-04 · เติมก่อนถ้าไม่มี
INSERT INTO machines (machine_id, name, status) VALUES
  ('chukes01', 'ตู้ 1 (dryrun)', 'active'),
  ('chukes02', 'ตู้ 2 (dryrun)', 'active'),
  ('chukes03', 'ตู้ 3 (dryrun)', 'active'),
  ('chukes04', 'ตู้ 4 (dryrun)', 'active')
ON CONFLICT (machine_id) DO NOTHING;

INSERT INTO skus (sku_id, name, series, packs_per_box, boxes_per_cotton, sell_price, cost_price) VALUES
  ('OP 01',  'OP 01 (dryrun)',  'OP',  12, 12, 100, 50),
  ('OP 02',  'OP 02 (dryrun)',  'OP',  12, 12, 100, 55),
  ('PRB 01', 'PRB 01 (dryrun)', 'PRB', 10, 12, 150, 80)
ON CONFLICT (sku_id) DO NOTHING;


-- ── 0) BEFORE RESET ─────────────────────────────────────────
SELECT '=== BEFORE RESET ===' AS step;

SELECT 'stock_in' AS tbl, COUNT(*) AS rows FROM stock_in
UNION ALL SELECT 'stock_out',         COUNT(*) FROM stock_out
UNION ALL SELECT 'stock_transfers',   COUNT(*) FROM stock_transfers
UNION ALL SELECT 'claims',            COUNT(*) FROM claims
UNION ALL SELECT 'sales',             COUNT(*) FROM sales
UNION ALL SELECT 'machine_stock',     COUNT(*) FROM machine_stock;


-- ── 1) Reset (ไม่แตะ machine_stock) ───────────────────────
SELECT '=== RESET ===' AS step;
BEGIN;
TRUNCATE TABLE stock_in, stock_out, stock_transfers, claims, sales RESTART IDENTITY;
UPDATE skus SET avg_cost = 0;
COMMIT;


-- ── 2) Seed machine_stock (จำลองว่า VMS sync แล้ว) ──────────
-- ในชีวิตจริง: VMS sync จะเติม machine_stock ก่อน reset · staging ไม่มี VMS · เราใส่เอง
SELECT '=== SEED machine_stock (mock VMS) ===' AS step;
DELETE FROM machine_stock;  -- เคลียร์ก่อน insert mock
INSERT INTO machine_stock (machine_id, kiosk_record_id, slot_number, sku_id,
                            product_name, remain, max_capacity, is_occupied, status, synced_at)
VALUES
  ('chukes01', 4, '001', 'OP 01', 'One Piece OP - 01 Pack',  10, 12, true, 'active', NOW()),
  ('chukes01', 4, '002', 'OP 02', 'One Piece OP - 02 Pack',   8, 12, true, 'active', NOW()),
  ('chukes02', 5, '001', 'OP 01', 'One Piece OP - 01 Pack',   5, 12, true, 'active', NOW()),
  ('chukes02', 5, '030', 'PRB 01', 'PRB - 01 (Pack)',         3, 10, true, 'active', NOW());


-- ── 3) Seed (sample · ใช้ logic เดียวกับ 03_seed_generated.sql) ─
SELECT '=== SEED transactional ===' AS step;
BEGIN;

-- 3.1) stock_in: Main + User + Machine (จาก machine_stock subquery)
INSERT INTO stock_in (sku_id, source, unit, quantity, quantity_packs,
                       unit_cost, total_cost, purchased_at, note, created_by)
SELECT
  v.sku_id, 'DryRun Initial', 'pack',
  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)),
  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)),
  v.unit_cost,
  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) * v.unit_cost,
  NOW(),
  format('DryRun · Main=%s User=%s Machine=%s', v.main_packs, v.user_packs, COALESCE(m.machine_packs, 0)),
  'system_dryrun'
FROM (VALUES
  ('OP 01',  100, 10, 50.00),  -- Main + User · machine subquery จะเพิ่ม
  ('OP 02',   30, 0,  55.00),
  ('PRB 01',  20, 5,  80.00)
) AS v(sku_id, main_packs, user_packs, unit_cost)
LEFT JOIN (
  SELECT sku_id, SUM(remain) AS machine_packs
  FROM machine_stock
  WHERE sku_id IS NOT NULL AND remain > 0
  GROUP BY sku_id
) m ON m.sku_id = v.sku_id
WHERE (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) > 0;

-- 3.2) stock_transfers (User holdings)
INSERT INTO stock_transfers (sku_id, lot_number, to_user_id, unit,
                              quantity, quantity_packs, transferred_at,
                              note, created_by)
SELECT v.sku_id, 'GOLIVE-DRYRUN', p.id, 'pack', v.q, v.q,
       NOW(), 'DryRun transfer', 'system_dryrun'
FROM (VALUES
  ('OP 01',  'admin1', 10),
  ('PRB 01', 'admin2', 5)  -- ใช้ admin2 (stable) แทน user1 ที่อาจถูก rename ใน login test
) AS v(sku_id, username, q)
JOIN profiles p ON p.username = v.username;

-- 3.3) stock_out (Machine portion · จาก machine_stock)
INSERT INTO stock_out (sku_id, machine_id, quantity_packs,
                        withdrawn_at, withdrawn_by_user_id, note, created_by)
SELECT sku_id, machine_id, SUM(remain), NOW(), NULL,
       'DryRun machine load', 'system_dryrun'
FROM machine_stock
WHERE sku_id IS NOT NULL AND remain > 0
GROUP BY sku_id, machine_id;

-- 3.4) avg_cost
UPDATE skus SET avg_cost = 50.00 WHERE sku_id = 'OP 01';
UPDATE skus SET avg_cost = 55.00 WHERE sku_id = 'OP 02';
UPDATE skus SET avg_cost = 80.00 WHERE sku_id = 'PRB 01';

-- 3.5) Verify
DO $$
DECLARE v_neg INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_neg FROM v_stock_balance WHERE balance < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION 'Seed failed: % SKU มี balance ติดลบ', v_neg;
  END IF;
  RAISE NOTICE 'DryRun Seed OK';
END $$;

COMMIT;


-- ── 4) ตรวจผล ─────────────────────────────────────────────
SELECT '=== AFTER SEED ===' AS step;

-- 4.1) Counts
SELECT 'stock_in' AS tbl, COUNT(*) AS rows FROM stock_in
UNION ALL SELECT 'stock_out',         COUNT(*) FROM stock_out
UNION ALL SELECT 'stock_transfers',   COUNT(*) FROM stock_transfers
UNION ALL SELECT 'machine_stock',     COUNT(*) FROM machine_stock;

-- 4.2) v_stock_balance: ตรวจ Main = Excel input
-- คาดหวัง:
--   OP 01:   total = 100 + 10 + (10+5) = 125 · Main = 125 - (10+5) - 10 = 100 ✓
--   OP 02:   total = 30 + 0 + 8 = 38   · Main = 38 - 8 - 0 = 30 ✓
--   PRB 01:  total = 20 + 5 + 3 = 28   · Main = 28 - 3 - 5 = 20 ✓
SELECT sku_id, total_in, total_out, balance
FROM v_stock_balance
WHERE sku_id IN ('OP 01','OP 02','PRB 01')
ORDER BY sku_id;

-- 4.3) avg_cost
SELECT sku_id, avg_cost FROM skus WHERE sku_id IN ('OP 01','OP 02','PRB 01') ORDER BY sku_id;

-- 4.4) User holdings
SELECT p.username, st.sku_id, st.quantity_packs
FROM stock_transfers st
JOIN profiles p ON p.id = st.to_user_id
ORDER BY p.username, st.sku_id;

-- 4.5) Machine stock_out
SELECT machine_id, sku_id, quantity_packs, note
FROM stock_out
ORDER BY machine_id, sku_id;
