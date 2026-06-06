-- ═══════════════════════════════════════════════════════════════
-- Migration 046: เติม sku_aliases ที่ขาด — portal เปลี่ยนชื่อ + VMS ghost
-- 2026-06-06
--   ต่อจาก worklog 2026-06-06-fix-skuid-null-unpushed-map
--
--   หมายเหตุ: ตาราง sku_aliases เป็น source-of-truth/เอกสารเท่านั้น
--   scraper ใช้ map_goods_to_sku()/map_product_to_sku() แบบ hardcoded substring
--   ตารางนี้ไม่ถูก query ตอน sync · migration นี้แค่ทำให้เอกสารตรงของจริง
--
--   พบจากข้อมูลจริง (machine_stock + sales 2026-06-03..06):
--   1) WW portal "เปลี่ยนชื่อ" YGH กลางเดือน:
--        เก่า (mig 045): 'Yuki Oh Chaos Origins' / 'Yuki oh Limited Over Collection'
--        ปัจจุบัน:        'YU-GI-OH! Chaos Origins' / 'YU-GI-OH! The Revals'
--      → ชื่อเก่า "ไม่ผิด" (portal ใช้จริงช่วงต้น) · แค่ขาดชื่อใหม่ · เก็บทั้งคู่
--   2) Pokemon Ghost ขายในตู้ VMS (chukes01-04) ด้วย แต่ไม่มี alias source='vms'
--      (VMS portal ส่ง 'Pokemon Ghost ' มี trailing space · เก็บ clean name)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sku_aliases (canonical_sku, source, external_name) VALUES
  -- WW: ชื่อ portal ปัจจุบัน (หลัง rename) — คู่กับของเก่าใน mig 045
  ('Yu-Gi-Oh Chaos Origins', 'ww',  'YU-GI-OH! Chaos Origins'),
  ('Yu-Gi-Oh The Revals',    'ww',  'YU-GI-OH! The Revals'),
  -- VMS: Pokemon Ghost (chukes ก็ขาย · เดิมมีแต่ source='ww')
  ('Pokemon Ghost',          'vms', 'Pokemon Ghost')
ON CONFLICT (source, external_name) DO NOTHING;

-- ═══ Verify ═══════════════════════════════════════════════════════
SELECT canonical_sku, source, external_name FROM sku_aliases
WHERE canonical_sku IN ('Pokemon Ghost','Yu-Gi-Oh Chaos Origins','Yu-Gi-Oh The Revals')
ORDER BY canonical_sku, source, external_name;
