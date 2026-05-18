-- ═══════════════════════════════════════════════════════════════
-- Migration 031: เพิ่ม column image_url_box ใน skus
-- 2026-05-18
--   1 SKU เก็บได้ 2 รูป — Pack (image_url) + Box (image_url_box)
--   UI เลือกใช้ตาม slot type: ถ้า product_name มี "Box" → image_url_box
--   ถ้าไม่มี image_url_box → fallback ไปใช้ image_url
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS image_url_box TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'skus' AND column_name LIKE 'image%';
