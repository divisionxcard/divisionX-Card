-- ═══════════════════════════════════════════════════════════════
-- Migration 029: Seed FB series (Dragonball Fusion World) 9 SKU
-- 2026-05-17 · FB 01-FB 08 + B29 (B29 ไม่มี prefix · series ยังเป็น FB)
-- ═══════════════════════════════════════════════════════════════
-- หมายเหตุ:
--   - Prod skus.series เปลี่ยน ENUM → TEXT แล้ว (refactor ผ่าน Supabase Console)
--   - ไม่ต้อง ALTER TYPE · INSERT ค่าใหม่ได้เลย
--   - sell_price/cost_price = 0 → user แก้ทีหลังผ่าน UI (PageStock)
-- ═══════════════════════════════════════════════════════════════

-- Seed 9 SKU (sell_price / cost_price = 0 → user แก้ทีหลังผ่าน UI)
INSERT INTO skus (sku_id, name, series, packs_per_box, boxes_per_cotton, sell_price, cost_price, is_active)
VALUES
  ('FB 01',  'Dragonball Fusion World FB-01',  'FB', 24, 12, 0, 0, true),
  ('FB 02',  'Dragonball Fusion World FB-02',  'FB', 24, 12, 0, 0, true),
  ('FB 03',  'Dragonball Fusion World FB-03',  'FB', 24, 12, 0, 0, true),
  ('FB 04',  'Dragonball Fusion World FB-04',  'FB', 24, 12, 0, 0, true),
  ('FB 05',  'Dragonball Fusion World FB-05',  'FB', 24, 12, 0, 0, true),
  ('FB 06',  'Dragonball Fusion World FB-06',  'FB', 24, 12, 0, 0, true),
  ('FB 07',  'Dragonball Fusion World FB-07',  'FB', 24, 12, 0, 0, true),
  ('FB 08',  'Dragonball Fusion World FB-08',  'FB', 24, 12, 0, 0, true),
  ('B29',    'Dragonball Fusion World B29',    'FB', 24, 12, 0, 0, true)
ON CONFLICT (sku_id) DO NOTHING;
