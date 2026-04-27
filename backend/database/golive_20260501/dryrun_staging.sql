-- =============================================================
-- DRY RUN บน STAGING — ทดสอบ flow Reset + Seed ครบวงจร
-- =============================================================
-- ⚠ ต้อง run บน STAGING (dorixlcllcjszexshlwo) เท่านั้น
-- ⚠ จะลบข้อมูลทดสอบใน staging ทั้งหมด — ของ test เลย ไม่กระทบ prod
--
-- ขั้นตอน: paste ทั้งไฟล์ → Run → ดูผลที่ NOTICE และตาราง summary ท้ายสุด
-- =============================================================

-- ── 0) ก่อน Reset: ดูข้อมูลทดสอบที่มี ────────────────────────
SELECT '=== BEFORE RESET ===' AS step;

SELECT 'stock_in' AS tbl, COUNT(*) AS rows FROM stock_in
UNION ALL SELECT 'stock_out',         COUNT(*) FROM stock_out
UNION ALL SELECT 'stock_transfers',   COUNT(*) FROM stock_transfers
UNION ALL SELECT 'claims',            COUNT(*) FROM claims
UNION ALL SELECT 'sales',             COUNT(*) FROM sales
UNION ALL SELECT 'machine_stock',     COUNT(*) FROM machine_stock;


-- ── 1) Reset ─────────────────────────────────────────────────
SELECT '=== RESET ===' AS step;
BEGIN;
TRUNCATE TABLE
  stock_in, stock_out, stock_transfers, claims, sales, machine_stock
RESTART IDENTITY;
UPDATE skus SET avg_cost = 0;
COMMIT;


-- Verify reset: ทุกตารางต้องเป็น 0
SELECT 'stock_in' AS tbl, COUNT(*) AS rows FROM stock_in
UNION ALL SELECT 'stock_out',         COUNT(*) FROM stock_out
UNION ALL SELECT 'stock_transfers',   COUNT(*) FROM stock_transfers
UNION ALL SELECT 'claims',            COUNT(*) FROM claims
UNION ALL SELECT 'sales',             COUNT(*) FROM sales
UNION ALL SELECT 'machine_stock',     COUNT(*) FROM machine_stock;


-- ── 2) Seed (sample data — ใช้ staging users + 3 SKUs + 1 ตู้) ──
-- ตัวอย่างนี้จะ insert:
--   Main: OP 01 (50 packs · 50/pack), OP 02 (30 packs · 55/pack), PRB 01 (15 packs · 80/pack)
--   User: admin1 ถือ OP 01 = 10 packs · user1 ถือ OP 02 = 5 packs
--   Machine: chukes01 มี OP 01 = 5 packs ในช่อง 1
SELECT '=== SEED ===' AS step;

BEGIN;

-- 2.1) stock_in: total per SKU = Main + User + Machine
-- OP 01 total = 50 + 10 + 5 = 65
-- OP 02 total = 30 + 5 + 0 = 35
-- PRB 01 total = 15 + 0 + 0 = 15
INSERT INTO stock_in (sku_id, source, unit, quantity, quantity_packs,
                       unit_cost, total_cost, purchased_at, note, created_by)
VALUES
  ('OP 01',  'DryRun Initial', 'pack', 65, 65, 50.00, 3250.00, NOW(),
            'DryRun · Main=50 User=10 Machine=5', 'system_dryrun'),
  ('OP 02',  'DryRun Initial', 'pack', 35, 35, 55.00, 1925.00, NOW(),
            'DryRun · Main=30 User=5 Machine=0', 'system_dryrun'),
  ('PRB 01', 'DryRun Initial', 'pack', 15, 15, 80.00, 1200.00, NOW(),
            'DryRun · Main=15 User=0 Machine=0', 'system_dryrun');

-- 2.2) stock_transfers: User holdings
INSERT INTO stock_transfers (sku_id, lot_number, to_user_id, unit,
                              quantity, quantity_packs, transferred_at,
                              note, created_by)
SELECT v.sku_id, 'GOLIVE-DRYRUN', p.id, v.unit, v.quantity, v.quantity_packs,
       NOW(), 'DryRun transfer', 'system_dryrun'
FROM (VALUES
  ('OP 01', 'admin1', 'pack', 10, 10),
  ('OP 02', 'user1',  'pack', 5,  5)
) AS v(sku_id, username, unit, quantity, quantity_packs)
JOIN profiles p ON p.username = v.username;

-- 2.3) stock_out: Machine pre-load
INSERT INTO stock_out (sku_id, machine_id, quantity_packs,
                        withdrawn_at, withdrawn_by_user_id, note, created_by)
VALUES
  ('OP 01', 'chukes01', 5, NOW(), NULL, 'DryRun machine load', 'system_dryrun');

-- 2.4) machine_stock snapshot
INSERT INTO machine_stock (machine_id, kiosk_record_id, slot_number,
                            sku_id, remain, max_capacity, status, synced_at)
VALUES
  ('chukes01', 0, '1', 'OP 01', 5, 10, 'active', NOW());

-- 2.5) avg_cost
UPDATE skus SET avg_cost = 50.00 WHERE sku_id = 'OP 01';
UPDATE skus SET avg_cost = 55.00 WHERE sku_id = 'OP 02';
UPDATE skus SET avg_cost = 80.00 WHERE sku_id = 'PRB 01';

-- 2.6) Verify: balance ของแต่ละ SKU ที่ insert ไม่ติดลบ
DO $$
DECLARE
  v_neg INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_neg
  FROM v_stock_balance vsb
  WHERE vsb.balance < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION 'Seed failed: % SKU มี balance ติดลบ', v_neg;
  END IF;
END $$;

COMMIT;


-- ── 3) ตรวจผลหลัง Seed ───────────────────────────────────────
SELECT '=== AFTER SEED ===' AS step;

-- 3.1) Counts
SELECT 'stock_in' AS tbl, COUNT(*) AS rows FROM stock_in
UNION ALL SELECT 'stock_out',         COUNT(*) FROM stock_out
UNION ALL SELECT 'stock_transfers',   COUNT(*) FROM stock_transfers
UNION ALL SELECT 'machine_stock',     COUNT(*) FROM machine_stock;

-- 3.2) v_stock_balance: Main = total_in - stock_out - transfers
-- คาดว่า: OP 01 = 65-5-10 = 50 · OP 02 = 35-0-5 = 30 · PRB 01 = 15-0-0 = 15
SELECT sku_id, total_in, total_out, balance
FROM v_stock_balance
WHERE sku_id IN ('OP 01','OP 02','PRB 01')
ORDER BY sku_id;

-- 3.3) avg_cost
SELECT sku_id, avg_cost, sell_price
FROM skus
WHERE sku_id IN ('OP 01','OP 02','PRB 01')
ORDER BY sku_id;

-- 3.4) User holdings
SELECT p.username, st.sku_id, st.quantity_packs
FROM stock_transfers st
JOIN profiles p ON p.id = st.to_user_id
ORDER BY p.username, st.sku_id;

-- 3.5) Machine stock
SELECT machine_id, slot_number, sku_id, remain, max_capacity
FROM machine_stock
ORDER BY machine_id, slot_number;
