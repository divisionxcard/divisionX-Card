-- ═══════════════════════════════════════════════════════════════
-- Migration 029: เพิ่ม series 'FB' (Dragonball Fusion World) ใน sku_series ENUM
-- 2026-05-17 · พร้อม seed 9 SKU: FB 01-FB 08 + FB B29
-- ═══════════════════════════════════════════════════════════════
-- หมายเหตุ:
--   - ALTER TYPE ... ADD VALUE ต้อง commit ก่อนใช้ใน statement ถัดไป
--   - Supabase SQL Editor รัน auto-commit ต่อ statement → ใช้ได้ปกติ
--   - ถ้ารันใน psql transaction → ต้อง COMMIT ก่อน INSERT
-- ═══════════════════════════════════════════════════════════════

ALTER TYPE sku_series ADD VALUE IF NOT EXISTS 'FB';

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
