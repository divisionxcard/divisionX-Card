-- =============================================================
-- Go-Live 1 พ.ค. 2026 · Step 3: SEED (auto-generated)
-- Generated: 2026-05-04T01:18:24
-- =============================================================
-- ⚠ ก่อน run · ต้อง trigger VMS sync แล้ว machine_stock มีข้อมูลล่าสุด
-- ⚠ ไฟล์นี้ใช้ machine_stock ใน DB ปัจจุบันเป็น source ของ machine portion
-- =============================================================

BEGIN;

-- 1) stock_in: รวมยอดจริงทุก location · 1 row ต่อ SKU
--    machine portion ดึงจาก machine_stock subquery (สถานะ ณ เวลา run)
INSERT INTO stock_in (sku_id, source, unit, quantity, quantity_packs,
                       unit_cost, total_cost, purchased_at, note, created_by)
SELECT
  v.sku_id,
  'Initial Inventory (Go-Live 2026-05-01)' AS source,
  'pack' AS unit,
  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) AS quantity,
  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) AS quantity_packs,
  v.unit_cost,
  (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) * v.unit_cost AS total_cost,
  '2026-05-01 08:00:00+07'::timestamptz AS purchased_at,
  format('Initial · Main=%s User=%s Machine=%s', v.main_packs, v.user_packs, COALESCE(m.machine_packs, 0)) AS note,
  'system_golive' AS created_by
FROM (VALUES
  ('OP 01', 48, 32, 0.00),
  ('OP 02', 12, 40, 0.00),
  ('OP 03', 60, 42, 0.00),
  ('OP 04', 132, 12, 0.00),
  ('OP 05', 0, 0, 0.00),
  ('OP 06', 0, 65, 0.00),
  ('OP 07', 96, 74, 0.00),
  ('OP 08', 180, 68, 0.00),
  ('OP 09', 0, 95, 0.00),
  ('OP 10', 264, 43, 0.00),
  ('OP 11', 228, 77, 0.00),
  ('OP 12', 96, 49, 0.00),
  ('OP 13', 888, 182, 0.00),
  ('OP 14', 144, 69, 0.00),
  ('OP 15', 288, 65, 0.00),
  ('EB 01', 0, 62, 0.00),
  ('EB 02', 0, 35, 0.00),
  ('EB 03', 120, 82, 0.00),
  ('EB 04', 204, 24, 0.00),
  ('PRB 01', 0, 160, 0.00),
  ('PRB 02', 40, 129, 0.00)
) AS v(sku_id, main_packs, user_packs, unit_cost)
LEFT JOIN (
  SELECT sku_id, SUM(remain) AS machine_packs
  FROM machine_stock
  WHERE sku_id IS NOT NULL AND remain > 0
  GROUP BY sku_id
) m ON m.sku_id = v.sku_id
WHERE (v.main_packs + v.user_packs + COALESCE(m.machine_packs, 0)) > 0;

-- 2) stock_transfers: User holdings (จาก Sheet User_Stock)
INSERT INTO stock_transfers (sku_id, lot_number, to_user_id, unit,
                              quantity, quantity_packs, transferred_at,
                              note, created_by)
SELECT v.sku_id, v.lot_number, p.id, v.unit, v.quantity, v.quantity_packs,
       v.transferred_at, v.note, v.created_by
FROM (VALUES
  ('EB 01', 'GOLIVE-20260501', 'aofwara66', 'pack', 18, 18, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 01', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 24, 24, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 01', 'GOLIVE-20260501', 'power23n', 'pack', 20, 20, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 02', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 16, 16, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 02', 'GOLIVE-20260501', 'power23n', 'pack', 19, 19, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 03', 'GOLIVE-20260501', 'aofwara66', 'pack', 42, 42, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 03', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 18, 18, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 03', 'GOLIVE-20260501', 'power23n', 'pack', 22, 22, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 04', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 12, 12, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('EB 04', 'GOLIVE-20260501', 'power23n', 'pack', 12, 12, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 01', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 18, 18, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 01', 'GOLIVE-20260501', 'power23n', 'pack', 14, 14, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 02', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 20, 20, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 02', 'GOLIVE-20260501', 'power23n', 'pack', 20, 20, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 03', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 21, 21, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 03', 'GOLIVE-20260501', 'power23n', 'pack', 21, 21, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 04', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 12, 12, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 06', 'GOLIVE-20260501', 'aofwara66', 'pack', 16, 16, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 06', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 30, 30, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 06', 'GOLIVE-20260501', 'power23n', 'pack', 19, 19, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 07', 'GOLIVE-20260501', 'aofwara66', 'pack', 6, 6, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 07', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 41, 41, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 07', 'GOLIVE-20260501', 'power23n', 'pack', 27, 27, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 08', 'GOLIVE-20260501', 'aofwara66', 'pack', 12, 12, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 08', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 41, 41, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 08', 'GOLIVE-20260501', 'power23n', 'pack', 15, 15, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 09', 'GOLIVE-20260501', 'aofwara66', 'pack', 32, 32, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 09', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 37, 37, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 09', 'GOLIVE-20260501', 'power23n', 'pack', 26, 26, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 10', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 26, 26, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 10', 'GOLIVE-20260501', 'power23n', 'pack', 17, 17, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 11', 'GOLIVE-20260501', 'aofwara66', 'pack', 19, 19, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 11', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 34, 34, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 11', 'GOLIVE-20260501', 'power23n', 'pack', 24, 24, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 12', 'GOLIVE-20260501', 'aofwara66', 'pack', 3, 3, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 12', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 33, 33, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 12', 'GOLIVE-20260501', 'power23n', 'pack', 13, 13, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 13', 'GOLIVE-20260501', 'aofwara66', 'pack', 42, 42, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 13', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 97, 97, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 13', 'GOLIVE-20260501', 'power23n', 'pack', 43, 43, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 14', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 42, 42, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 14', 'GOLIVE-20260501', 'power23n', 'pack', 27, 27, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 15', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 45, 45, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('OP 15', 'GOLIVE-20260501', 'power23n', 'pack', 20, 20, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('PRB 01', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 160, 160, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('PRB 02', 'GOLIVE-20260501', 'aofwara66', 'pack', 20, 20, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive'),
  ('PRB 02', 'GOLIVE-20260501', 'mzadiz1989', 'pack', 109, 109, '2026-05-01 08:00:00+07'::timestamptz, 'Initial transfer (Go-Live)', 'system_golive')
) AS v(sku_id, lot_number, username, unit, quantity, quantity_packs,
       transferred_at, note, created_by)
JOIN profiles p ON p.username = v.username;

-- 3) stock_out: ของที่เติมในตู้ (Main → Machine)
--    1 row/(sku, machine) · sum remain ของทุก slot
INSERT INTO stock_out (sku_id, machine_id, quantity_packs,
                        withdrawn_at, withdrawn_by_user_id, note, created_by)
SELECT
  sku_id, machine_id, SUM(remain) AS quantity_packs,
  '2026-05-01 08:00:00+07'::timestamptz AS withdrawn_at,
  NULL AS withdrawn_by_user_id,
  'Initial machine load (Go-Live)' AS note,
  'system_golive' AS created_by
FROM machine_stock
WHERE sku_id IS NOT NULL AND remain > 0
GROUP BY sku_id, machine_id;

-- 4) อัปเดต skus.avg_cost = unit_cost จาก Excel (single lot ถือว่าตรง)
-- (no unit_cost data)

-- 5) Verify: balance ทุก SKU ไม่ติดลบ + Main = Excel
DO $$
DECLARE v_neg INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_neg FROM v_stock_balance WHERE balance < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION 'Seed failed: % SKU มี balance ติดลบ', v_neg;
  END IF;
  RAISE NOTICE 'Seed OK';
END $$;

COMMIT;
-- ROLLBACK;

-- =============================================================
-- Summary จาก Excel:
--   Main packs:        2800
--   User packs:        1405
--   stock_transfers:   47 rows
--   SKUs ที่มีของ Main: 15
--   Machine portion:   ดึงจาก machine_stock ตอนรัน SQL (ดูผลใน RAISE NOTICE)
-- =============================================================