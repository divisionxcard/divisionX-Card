-- =============================================================
-- Migration 008: Add lot_number to stock_out
-- เพิ่มคอลัมน์ lot_number เพื่อติดตามการเบิกแต่ละ Lot
-- =============================================================

ALTER TABLE stock_out
  ADD COLUMN IF NOT EXISTS lot_number VARCHAR(50);

COMMENT ON COLUMN stock_out.lot_number IS 'เลขที่ Lot ที่เบิกออก (อ้างอิง stock_in.lot_number)';

CREATE INDEX IF NOT EXISTS idx_stock_out_lot_number ON stock_out(lot_number);
