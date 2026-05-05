-- =============================================================
-- aofwara66 Stock Recovery (after cutoff 6 พ.ค. 2026)
-- =============================================================
-- ใส่สต็อก aofwara66 ที่ค้างไว้ตอน cutoff seed (ส่งข้อมูลภายหลัง)
-- ตัวเลข = สต็อกหลังเติมตู้ 5/5 = 359 packs (ของจริงในมือ)
-- ใช้ lot_number ใหม่ 'AOFWARA-RECOVERY-20260506' แยกจาก CUTOFF lot
-- =============================================================

BEGIN;

-- 1) stock_in (14 rows · 1 ต่อ SKU)
INSERT INTO stock_in (sku_id, lot_number, source, unit, quantity, quantity_packs,
                      unit_cost, total_cost, purchased_at, note, created_by)
SELECT
  sku_id,
  'AOFWARA-RECOVERY-20260506' AS lot_number,
  'aofwara66 stock recovery (post-cutoff)' AS source,
  'pack' AS unit,
  packs AS quantity,
  packs AS quantity_packs,
  unit_cost,
  packs * unit_cost AS total_cost,
  '2026-05-06 04:00:00+07'::timestamptz AS purchased_at,
  'aofwara66 stock at end of 5/5 (after refill)' AS note,
  'system_recovery' AS created_by
FROM (VALUES
  ('OP 06', 16, 187.75),
  ('OP 07', 3,  104.16),
  ('OP 08', 37, 79.86),
  ('OP 09', 44, 184.02),
  ('OP 10', 11, 83.33),
  ('OP 12', 3,  121.52),
  ('OP 13', 78, 232.63),
  ('OP 15', 1,  118.05),
  ('EB 01', 18, 175.00),
  ('EB 02', 12, 166.66),
  ('EB 03', 30, 111.11),
  ('EB 04', 11, 118.05),
  ('PRB 01', 43, 350.00),
  ('PRB 02', 52, 170.00)
) AS v(sku_id, packs, unit_cost);

-- 2) stock_transfers (14 rows · ทั้งหมดให้ aofwara66)
INSERT INTO stock_transfers (sku_id, lot_number, to_user_id, unit,
                              quantity, quantity_packs, transferred_at,
                              note, created_by)
SELECT
  v.sku_id,
  'AOFWARA-RECOVERY-20260506' AS lot_number,
  p.id AS to_user_id,
  'pack' AS unit,
  v.packs AS quantity,
  v.packs AS quantity_packs,
  '2026-05-06 04:00:00+07'::timestamptz AS transferred_at,
  'aofwara66 stock recovery transfer' AS note,
  'system_recovery' AS created_by
FROM (VALUES
  ('OP 06', 16),
  ('OP 07', 3),
  ('OP 08', 37),
  ('OP 09', 44),
  ('OP 10', 11),
  ('OP 12', 3),
  ('OP 13', 78),
  ('OP 15', 1),
  ('EB 01', 18),
  ('EB 02', 12),
  ('EB 03', 30),
  ('EB 04', 11),
  ('PRB 01', 43),
  ('PRB 02', 52)
) AS v(sku_id, packs)
JOIN profiles p ON p.username = 'aofwara66';

-- 3) Verify
DO $$
DECLARE
  v_in_count INTEGER;
  v_in_total INTEGER;
  v_tr_count INTEGER;
  v_tr_total INTEGER;
  v_neg INTEGER;
BEGIN
  SELECT COUNT(*), SUM(quantity_packs) INTO v_in_count, v_in_total
  FROM stock_in WHERE lot_number = 'AOFWARA-RECOVERY-20260506';

  SELECT COUNT(*), SUM(quantity_packs) INTO v_tr_count, v_tr_total
  FROM stock_transfers WHERE lot_number = 'AOFWARA-RECOVERY-20260506';

  SELECT COUNT(*) INTO v_neg FROM v_stock_balance WHERE balance < 0;

  RAISE NOTICE 'Recovery OK · stock_in: % rows / % packs · stock_transfers: % rows / % packs',
    v_in_count, v_in_total, v_tr_count, v_tr_total;

  IF v_in_total <> v_tr_total THEN
    RAISE EXCEPTION 'Mismatch: in=% != transfer=%', v_in_total, v_tr_total;
  END IF;
  IF v_neg > 0 THEN
    RAISE EXCEPTION 'Recovery failed: % SKU มี balance ติดลบ', v_neg;
  END IF;
END $$;

COMMIT;
-- ROLLBACK;
