-- =============================================================
-- Go-Live 1 พ.ค. 2026 · Step 2: Reset Transactional Data
-- =============================================================
-- ⚠ จะลบข้อมูลในตารางต่อไปนี้ทั้งหมด:
--     stock_in, stock_out, stock_transfers, claims, sales
--
--   ตารางที่ "เก็บไว้" (ไม่แตะ):
--     profiles, skus, machines, machine_assignments, login_history,
--     machine_stock ← VMS cache · seed step ใช้เป็น source ของ machine portion
--
-- ก่อน Run:
--   1) แอดมินเติมตู้ครบ + กด VMS sync เรียบร้อย (machine_stock เป็นข้อมูลล่าสุด)
--   2) ทำ Step 1 (backup CSV) ครบแล้ว
--   3) ตรวจ URL ว่าเป็น project prod (xethnqqmpvlpmafvphky)
-- =============================================================

BEGIN;

-- ── 1) ลบข้อมูลรายวัน · reset sequence id ───────────────────
-- ⚠ ไม่ truncate machine_stock เพราะเป็น VMS cache ที่ seed ใช้
TRUNCATE TABLE
  stock_in,
  stock_out,
  stock_transfers,
  claims,
  sales
RESTART IDENTITY;

-- ── 2) Reset avg_cost ของทุก SKU ─────────────────────────────
-- seed step 3 จะคำนวณใหม่จาก unit_cost ของ Excel
UPDATE skus SET avg_cost = 0;

-- ── 3) Verify ──────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_table TEXT;
  v_machine_count INTEGER;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY['stock_in','stock_out','stock_transfers','claims','sales'])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', v_table) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'Reset failed: % still has % rows', v_table, v_count;
    END IF;
  END LOOP;

  -- machine_stock ต้องมี rows (จะใช้ seed)
  SELECT COUNT(*) INTO v_machine_count
  FROM machine_stock WHERE sku_id IS NOT NULL AND remain > 0;
  IF v_machine_count = 0 THEN
    RAISE WARNING 'machine_stock ว่าง · ก่อน seed ต้อง trigger VMS sync ให้ machine_stock มีข้อมูล';
  ELSE
    RAISE NOTICE 'Reset OK · machine_stock พร้อมใช้ (% slots ที่มีของ)', v_machine_count;
  END IF;
END $$;

-- ⚠ ถ้าทุกอย่างถูกต้อง → COMMIT
-- ⚠ ถ้าเห็นอะไรแปลก ๆ → เปลี่ยน COMMIT เป็น ROLLBACK
COMMIT;
-- ROLLBACK;

-- ── 4) Post-reset checks (optional · run แยก) ─────────────
-- SELECT * FROM v_stock_balance;        -- ทุกแถว balance = 0
-- SELECT COUNT(*) FROM skus WHERE is_active = true;  -- ควรยัง 21
-- SELECT COUNT(*) FROM machines;        -- ควรยัง 4
-- SELECT COUNT(*) FROM profiles;        -- ควรยัง 5
-- SELECT machine_id, COUNT(*) FROM machine_stock GROUP BY machine_id;  -- 4 ตู้ · ~60 slots
