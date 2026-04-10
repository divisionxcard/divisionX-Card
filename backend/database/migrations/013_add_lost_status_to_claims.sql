-- ═══════════════════════════════════════════════════════════════
-- Migration 013: เพิ่มสถานะ 'lost' (สูญหาย) ในตาราง claims
-- กรณีตู้ปล่อยสินค้าเกินจำนวน (เช่น ซื้อ 1 ตก 2)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_product_status_check;
ALTER TABLE claims ADD CONSTRAINT claims_product_status_check
  CHECK (product_status IN ('returned', 'damaged', 'lost'));
