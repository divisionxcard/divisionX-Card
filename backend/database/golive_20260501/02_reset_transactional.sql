-- =============================================================
-- Go-Live 1 พ.ค. 2026 · Step 2: Reset Transactional Data
-- =============================================================
-- ⚠ จะลบข้อมูลในตารางต่อไปนี้ทั้งหมด:
--     stock_in, stock_out, stock_transfers, claims, sales, machine_stock
--
--   ตารางที่ "เก็บไว้" (ไม่แตะ):
--     profiles, skus, machines, machine_assignments, login_history
--
-- ก่อน Run:
--   1) ทำ Step 1 (backup CSV) ครบ 7 ไฟล์แล้ว
--   2) ตรวจ URL ว่าเป็น project prod (xethnqqmpvlpmafvphky)
--   3) มี admin คอยเฝ้าอยู่ พร้อม rollback ถ้าผิด
--
-- ทดลองก่อน:
--   - Run บน staging (dorixlcllcjszexshlwo) ทดสอบ flow ครั้งเดียวก่อน
--   - ดู v_stock_balance ว่าทุก SKU เป็น 0 หลัง reset
-- =============================================================

BEGIN;

-- ── 1) ลบข้อมูลรายวัน · reset sequence id ───────────────────
-- TRUNCATE เร็วกว่า DELETE มาก · RESTART IDENTITY = id เริ่มจาก 1 ใหม่
-- ไม่ต้อง CASCADE เพราะตารางพวกนี้ไม่มี FK อ้างไปจากตารางอื่น
TRUNCATE TABLE
  stock_in,
  stock_out,
  stock_transfers,
  claims,
  sales,
  machine_stock
RESTART IDENTITY;

-- ── 2) Reset avg_cost ของทุก SKU ─────────────────────────────
-- avg_cost คือ denormalized value · seed step 3 จะคำนวณใหม่จาก stock_in ที่ insert
UPDATE skus SET avg_cost = 0;

-- ── 3) Verify ──────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_table TEXT;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY['stock_in','stock_out','stock_transfers','claims','sales','machine_stock'])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', v_table) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'Reset failed: % still has % rows', v_table, v_count;
    END IF;
  END LOOP;
  RAISE NOTICE '✓ Reset OK — ทุกตารางว่างเปล่าพร้อม seed';
END $$;

-- ⚠ ถ้าทุกอย่างถูกต้อง → COMMIT
-- ⚠ ถ้าเห็นอะไรแปลก ๆ → เปลี่ยน COMMIT เป็น ROLLBACK
COMMIT;
-- ROLLBACK;

-- ── 4) Post-reset checks (optional · run แยก) ─────────────
-- SELECT * FROM v_stock_balance;  -- ทุกแถว balance = 0
-- SELECT COUNT(*) FROM skus WHERE is_active = true;  -- ควรยัง 21 (ไม่ลด)
-- SELECT COUNT(*) FROM machines;       -- ควรยัง 4 (ไม่ลด)
-- SELECT COUNT(*) FROM profiles;       -- ควรยัง 5 (ไม่ลด)
-- SELECT COUNT(*) FROM machine_assignments;  -- ควรเหลือเท่าเดิม
