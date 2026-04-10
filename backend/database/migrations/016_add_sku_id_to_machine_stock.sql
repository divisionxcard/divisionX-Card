-- ═══════════════════════════════════════════════════════════════
-- Migration 016: เพิ่ม sku_id ใน machine_stock เพื่อ map กับ SKU ในระบบ
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE machine_stock ADD COLUMN IF NOT EXISTS sku_id VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_machine_stock_sku ON machine_stock(sku_id);
