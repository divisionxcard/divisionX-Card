-- =============================================================
-- Migration 041: เพิ่ม initial_qty + initial_capacity ใน slot_products_history
-- เก็บ snapshot ของจำนวนสินค้า ณ ตอนเปลี่ยน (effective_from) ของแต่ละ period
-- เพื่อให้รายงานเปลี่ยนสินค้ามี "จำนวนหลัง" ที่แม่นยำ ไม่ต้องไปดู
-- machine_stock ปัจจุบันที่อาจถูกเปลี่ยนซ้ำ/ขายไปแล้ว
-- =============================================================

ALTER TABLE slot_products_history
  ADD COLUMN IF NOT EXISTS initial_qty INTEGER,
  ADD COLUMN IF NOT EXISTS initial_capacity INTEGER;

COMMENT ON COLUMN slot_products_history.initial_qty
  IS 'จำนวนสินค้าตอนเริ่ม period (snapshot ณ effective_from)';
COMMENT ON COLUMN slot_products_history.initial_capacity
  IS 'ความจุของช่องตอนเริ่ม period';

-- Backfill row active (effective_to IS NULL) จาก machine_stock ปัจจุบัน
-- เพื่อให้รายงาน Export PDF ของ change ล่าสุดมีข้อมูลทันที
UPDATE slot_products_history sph
SET
  initial_qty = ms.remain,
  initial_capacity = ms.max_capacity
FROM machine_stock ms
WHERE sph.effective_to IS NULL
  AND sph.machine_id = ms.machine_id
  AND sph.slot_number = ms.slot_number
  AND sph.initial_qty IS NULL
  AND (sph.sku_id = ms.sku_id OR sph.product_name = ms.product_name);

-- ตรวจสอบ
SELECT
  machine_id, slot_number, sku_id, product_name,
  initial_qty, initial_capacity, effective_from
FROM slot_products_history
WHERE effective_to IS NULL
ORDER BY machine_id, slot_number
LIMIT 20;
