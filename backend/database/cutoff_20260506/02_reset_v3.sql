-- =============================================================
-- Cutoff Re-Seed · Step 2: Reset stock tables (KEEP sales)
-- =============================================================
-- รันหลังเที่ยงคืน 5 พ.ค. (หลัง cutoff · หลัง VMS sync ครั้งสุดท้าย)
--
-- ⚠ ลบเฉพาะ stock_in / stock_out / stock_transfers / claims
-- ⚠ "ไม่แตะ" sales (เก็บประวัติยอดขาย 1-4 พ.ค. ไว้)
-- ⚠ "ไม่แตะ" machine_stock (VMS cache · seed ใช้)
--
-- ก่อน Run:
--   1) แอดมินหยุดเติมตู้แล้ว · ห้างปิด · ตู้หยุดเอง
--   2) กดปุ่ม VMS sync ครั้งสุดท้าย → machine_stock fresh
--   3) ตรวจ URL = xethnqqmpvlpmafvphky (prod)
-- =============================================================

BEGIN;

TRUNCATE TABLE
  stock_in,
  stock_out,
  stock_transfers,
  claims
RESTART IDENTITY;

-- เก็บ sales — ห้าม truncate (ประวัติยอดขาย 1-4 พ.ค.)
-- Reset avg_cost · seed step ใช้ unit_cost จาก Excel
UPDATE skus SET avg_cost = 0;

DO $$
DECLARE
  v_count INTEGER;
  v_table TEXT;
  v_sales INTEGER;
  v_machine INTEGER;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY['stock_in','stock_out','stock_transfers','claims'])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', v_table) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'Reset failed: % still has % rows', v_table, v_count;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_sales FROM sales;
  SELECT COUNT(*) INTO v_machine FROM machine_stock WHERE sku_id IS NOT NULL AND remain > 0;

  RAISE NOTICE 'Reset OK · sales เก็บไว้ (% rows) · machine_stock พร้อม (% slots)',
               v_sales, v_machine;

  IF v_sales = 0 THEN
    RAISE WARNING 'sales ว่าง · ผิดคาด เพราะมียอดขาย 1-4 พ.ค.';
  END IF;
  IF v_machine = 0 THEN
    RAISE WARNING 'machine_stock ว่าง · ก่อน seed ต้อง trigger VMS sync';
  END IF;
END $$;

COMMIT;
-- ROLLBACK;
