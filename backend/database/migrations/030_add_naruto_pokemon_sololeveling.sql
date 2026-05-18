-- ═══════════════════════════════════════════════════════════════
-- Migration 030: Seed Naruto + Pokemon + SOLO Leveling SKUs
-- 2026-05-18
--   ตัดสินใจ: ใช้ VMS product_name เป็น sku_id ตรงๆ (admin report ชื่อต่าง — scraper map ทีหลังถ้าจำเป็น)
--   series = 'OTHER' ทั้งหมด (ยังไม่แยก brand)
--   packs_per_box ตาม admin report 17/5/2026 (รูปแนบ)
-- ═══════════════════════════════════════════════════════════════
-- หมายเหตุ:
--   - Prod skus.series เป็น TEXT แล้ว · INSERT ตรงๆ ไม่ต้อง ALTER TYPE
--   - sell_price/cost_price = 0 → user แก้ทีหลังผ่าน UI
-- ═══════════════════════════════════════════════════════════════

INSERT INTO skus (sku_id, name, series, packs_per_box, boxes_per_cotton, sell_price, cost_price, is_active)
VALUES
  ('Naruto Series1',  'Naruto Series 01',          'OTHER', 30, 12, 0, 0, true),
  ('Naruto Series2',  'Naruto Series 02',          'OTHER', 30, 12, 0, 0, true),
  ('Naruto Jin1',     'Naruto Jin01',              'OTHER', 10, 12, 0, 0, true),
  ('POKEMON MAGA EX', 'Pokemon MEGA Dream ex',     'OTHER', 30, 12, 0, 0, true),
  ('POKEMON NINJA',   'Pokemon Ninja',             'OTHER', 30, 12, 0, 0, true),
  ('SOLO Leveling',   'SOLO Leveling Ua1',         'OTHER', 16, 12, 0, 0, true)
ON CONFLICT (sku_id) DO NOTHING;
