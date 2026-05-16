-- ═══════════════════════════════════════════════════════════════
-- Migration 029: Seed Dragonball SKUs — 2 series (FB + UB)
-- 2026-05-17
--   - FB (Fusion World): FB 01-FB 08 · ชุด "Awakened Pulse"
--   - UB (Ultimate Booster): B29 · ชุด "Fearsome Rivals" (= UB02 ใน Bandai numbering)
-- ═══════════════════════════════════════════════════════════════
-- หมายเหตุ:
--   - Prod skus.series เปลี่ยน ENUM → TEXT แล้ว (refactor ผ่าน Supabase Console)
--   - ไม่ต้อง ALTER TYPE · INSERT ค่าใหม่ได้เลย
--   - sell_price/cost_price = 0 → user แก้ทีหลังผ่าน UI (PageStock)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO skus (sku_id, name, series, packs_per_box, boxes_per_cotton, sell_price, cost_price, is_active)
VALUES
  ('FB 01',  'Dragonball Fusion World FB-01',         'FB', 24, 12, 0, 0, true),
  ('FB 02',  'Dragonball Fusion World FB-02',         'FB', 24, 12, 0, 0, true),
  ('FB 03',  'Dragonball Fusion World FB-03',         'FB', 24, 12, 0, 0, true),
  ('FB 04',  'Dragonball Fusion World FB-04',         'FB', 24, 12, 0, 0, true),
  ('FB 05',  'Dragonball Fusion World FB-05',         'FB', 24, 12, 0, 0, true),
  ('FB 06',  'Dragonball Fusion World FB-06',         'FB', 24, 12, 0, 0, true),
  ('FB 07',  'Dragonball Fusion World FB-07',         'FB', 24, 12, 0, 0, true),
  ('FB 08',  'Dragonball Fusion World FB-08',         'FB', 24, 12, 0, 0, true),
  ('B29',    'Dragonball UB02 — Fearsome Rivals',     'UB', 24, 12, 0, 0, true)
ON CONFLICT (sku_id) DO NOTHING;

-- ถ้า B29 ถูก insert ไปก่อนหน้านี้ด้วย series='FB' → update เป็น 'UB'
UPDATE skus SET series = 'UB',
                name   = 'Dragonball UB02 — Fearsome Rivals'
WHERE sku_id = 'B29' AND series <> 'UB';
