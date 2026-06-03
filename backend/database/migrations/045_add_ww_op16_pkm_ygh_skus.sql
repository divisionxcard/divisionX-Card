-- ═══════════════════════════════════════════════════════════════
-- Migration 045: Seed สินค้าใหม่ตู้ WW — OP 16 + Pokemon Ghost + Yu-Gi-Oh (3 sets)
-- 2026-06-03
--   ต่อจาก worklog 2026-06-03-fix-ww-vendor-and-fk ("งานค้าง: เพิ่ม OP 16 + sku อื่น")
--
--   ตู้ wwv03/04/05 มีสินค้าใหม่ที่ skus ยังไม่มี → machine_stock เก็บ sku_id=NULL
--   + ยอดขายถูก drop ชั่วคราว (กัน FK violation) · migration นี้เพิ่มให้ครบ
--
--   ⚠ ต้องคู่กับการแก้ map_goods_to_sku() ใน worldwide_stock_sync.py +
--     worldwide_sales_api.py (raw WW name → sku_id) มิฉะนั้น sku_id ยังเป็น NULL
--
--   ชื่อ raw จริงในตู้ (ตรวจจาก machine_stock 2026-06-03):
--     'One Piece OP - 16' / 'One Piece OP - 16 Box'  → OP 16   (regex จับได้อยู่แล้ว)
--     'Pokemon Ghost'                                → PKM Ghost
--     'Yuki Oh Chaos Origins'                        → YGH Chaos Origins
--     'Yuki oh Limited Over Collection'              → YGH The Revals  ⚠ ชื่อ portal ≠ ชื่อ DvX
--     (The Heroes ยังไม่มาถึงตู้ — pre-register · raw name รอ verify ตอนสินค้าโผล่)
--
--   series: ตาม convention เดิม — franchise นอก One Piece/Dragonball ใช้ 'OTHER'
--   sell_price/cost_price = 0 → user แก้ทีหลังผ่าน UI (PageStock)
-- ═══════════════════════════════════════════════════════════════

-- ═══ Seed skus (พร้อม canonical fields ครบเลย — table มี column แล้วตั้งแต่ mig 033) ═══
INSERT INTO skus
  (sku_id, name, series, packs_per_box, boxes_per_cotton, sell_price, cost_price, is_active,
   canonical_sku, franchise, set_code, item_type, language)
VALUES
  ('OP 16',             'One Piece OP-16',         'OP',    24, 12, 0, 0, true,
   'One Piece OP - 16',       'OP',  'OP16',   'PAK', 'EN'),
  ('PKM Ghost',         'Pokemon Ghost',           'OTHER', 30, 12, 0, 0, true,
   'Pokemon Ghost',           'PKM', 'GHOST',  'PAK', 'EN'),
  ('YGH The Heroes',    'Yu-Gi-Oh The Heroes',     'OTHER', 15, 12, 0, 0, true,
   'Yu-Gi-Oh The Heroes',     'YGH', 'HEROES', 'PAK', 'EN'),
  ('YGH The Revals',    'Yu-Gi-Oh The Revals',     'OTHER', 15, 12, 0, 0, true,
   'Yu-Gi-Oh The Revals',     'YGH', 'REVALS', 'PAK', 'EN'),
  ('YGH Chaos Origins', 'Yu-Gi-Oh Chaos Origins',  'OTHER', 15, 12, 0, 0, true,
   'Yu-Gi-Oh Chaos Origins',  'YGH', 'CHAOS',  'PAK', 'EN')
ON CONFLICT (sku_id) DO NOTHING;

-- ═══ Seed sku_aliases: raw WW name → canonical ════════════════════
-- (scraper ใช้ map_goods_to_sku() hardcoded เป็นหลัก · ตารางนี้เก็บไว้เป็น source of truth)
INSERT INTO sku_aliases (canonical_sku, source, external_name) VALUES
  ('One Piece OP - 16',      'ww', 'One Piece OP - 16'),
  ('One Piece OP - 16',      'ww', 'One Piece OP - 16 Box'),
  ('Pokemon Ghost',          'ww', 'Pokemon Ghost'),
  ('Yu-Gi-Oh Chaos Origins', 'ww', 'Yuki Oh Chaos Origins'),
  ('Yu-Gi-Oh The Revals',    'ww', 'Yuki oh Limited Over Collection')
ON CONFLICT (source, external_name) DO NOTHING;

-- ═══ Backfill machine_stock ที่ค้าง sku_id=NULL (สินค้าเหล่านี้ถูก save แบบ NULL ไปแล้ว) ═══
UPDATE machine_stock SET sku_id = 'OP 16'
  WHERE sku_id IS NULL AND product_name IN ('One Piece OP - 16', 'One Piece OP - 16 Box');
UPDATE machine_stock SET sku_id = 'PKM Ghost'
  WHERE sku_id IS NULL AND product_name = 'Pokemon Ghost';
UPDATE machine_stock SET sku_id = 'YGH Chaos Origins'
  WHERE sku_id IS NULL AND product_name = 'Yuki Oh Chaos Origins';
UPDATE machine_stock SET sku_id = 'YGH The Revals'
  WHERE sku_id IS NULL AND product_name = 'Yuki oh Limited Over Collection';

-- ═══ Verify ═══════════════════════════════════════════════════════
SELECT sku_id, name, series, franchise, packs_per_box, canonical_sku
FROM skus WHERE sku_id IN ('OP 16','PKM Ghost','YGH The Heroes','YGH The Revals','YGH Chaos Origins')
ORDER BY franchise, sku_id;

-- ตรวจว่ายังเหลือ product ไหนใน machine_stock ที่ sku_id=NULL อีก
SELECT DISTINCT product_name, machine_id FROM machine_stock
WHERE sku_id IS NULL AND is_occupied = true ORDER BY product_name;
