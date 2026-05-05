-- =============================================================
-- aofwara66 Recovery Part 2 · 5/5 refill portion → chukes04
-- =============================================================
-- หลังทำ 04_aofwara_recovery.sql (359 packs ของในมือ aof)
-- ค้นพบว่า cutoff snapshot machine_stock 6,600 = state ปลาย 5/4
-- ก่อน aof refill 5/5 morning · 123 packs ที่ aof refill ตู้ chukes04
-- ยังไม่ได้บันทึกใน DB
--
-- ไฟล์นี้:
-- 1. เพิ่ม stock_in 123 packs ใน lot AOFWARA-RECOVERY (รวมเป็น 482)
-- 2. transfer 123 ให้ aof (รวมเป็น 482 in transfers)
-- 3. stock_out 123 (aof → chukes04, ย้อน 5/5 08:00)
-- 4. aof balance = 482 - 123 = 359 ✓
-- 5. chukes04 จะมี stock_out เพิ่มจาก aof refill 123 packs
-- =============================================================

BEGIN;

-- 1) Add 123 ใน stock_in (lot เดิม · 5/5 refill portion)
INSERT INTO stock_in (sku_id, lot_number, source, unit, quantity, quantity_packs,
                      unit_cost, total_cost, purchased_at, note, created_by)
SELECT v.sku_id, 'AOFWARA-RECOVERY-20260506',
       'aofwara66 stock recovery (5/5 refill portion)', 'pack',
       v.packs, v.packs, v.unit_cost, v.packs * v.unit_cost,
       '2026-05-06 04:00:00+07'::timestamptz,
       'aof refilled chukes04 on 5/5 morning',
       'system_recovery'
FROM (VALUES
  ('EB 02', 12, 166.66),
  ('OP 15', 47, 118.05),
  ('OP 07', 3,  104.16),
  ('OP 10', 13, 83.33),
  ('PRB 01', 27, 350.00),
  ('PRB 02', 8,  170.00),
  ('EB 04', 13, 118.05)
) AS v(sku_id, packs, unit_cost);

-- 2) Transfer 123 ให้ aof
INSERT INTO stock_transfers (sku_id, lot_number, to_user_id, unit,
                              quantity, quantity_packs, transferred_at,
                              note, created_by)
SELECT v.sku_id, 'AOFWARA-RECOVERY-20260506', p.id, 'pack',
       v.packs, v.packs,
       '2026-05-06 04:00:00+07'::timestamptz,
       'aof received then refilled chukes04',
       'system_recovery'
FROM (VALUES
  ('EB 02', 12), ('OP 15', 47), ('OP 07', 3), ('OP 10', 13),
  ('PRB 01', 27), ('PRB 02', 8), ('EB 04', 13)
) AS v(sku_id, packs)
JOIN profiles p ON p.username = 'aofwara66';

-- 3) stock_out: aof → chukes04 (123 packs · 5/5 morning)
INSERT INTO stock_out (sku_id, lot_number, machine_id, quantity_packs,
                        withdrawn_at, withdrawn_by_user_id, note, created_by)
SELECT v.sku_id, 'AOFWARA-RECOVERY-20260506', 'chukes04',
       v.packs,
       '2026-05-05 08:00:00+07'::timestamptz,
       p.id,
       'aofwara66 refill chukes04 (5/5 morning)',
       'system_recovery'
FROM (VALUES
  ('EB 02', 12), ('OP 15', 47), ('OP 07', 3), ('OP 10', 13),
  ('PRB 01', 27), ('PRB 02', 8), ('EB 04', 13)
) AS v(sku_id, packs)
JOIN profiles p ON p.username = 'aofwara66';

-- 4) Verify
DO $$
DECLARE v_in INT; v_tr INT; v_out INT; v_neg INT;
BEGIN
  SELECT SUM(quantity_packs) INTO v_in  FROM stock_in        WHERE lot_number='AOFWARA-RECOVERY-20260506';
  SELECT SUM(quantity_packs) INTO v_tr  FROM stock_transfers WHERE lot_number='AOFWARA-RECOVERY-20260506';
  SELECT COALESCE(SUM(quantity_packs),0) INTO v_out FROM stock_out WHERE lot_number='AOFWARA-RECOVERY-20260506';
  SELECT COUNT(*) INTO v_neg FROM v_stock_balance WHERE balance < 0;
  RAISE NOTICE 'OK · in=%, transfer=%, out=%, neg=%', v_in, v_tr, v_out, v_neg;
  IF v_in <> 482 OR v_tr <> 482 OR v_out <> 123 THEN
    RAISE EXCEPTION 'Mismatch: in=% tr=% out=% (expect 482/482/123)', v_in, v_tr, v_out;
  END IF;
  IF v_neg > 0 THEN RAISE EXCEPTION '% SKU balance ติดลบ', v_neg; END IF;
END $$;

COMMIT;
