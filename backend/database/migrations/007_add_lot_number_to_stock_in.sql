-- =============================================================
-- Migration 007: Add lot_number to stock_in
-- เพิ่มคอลัมน์ lot_number สำหรับติดตามต้นทุนแต่ละ Lot
-- =============================================================

ALTER TABLE stock_in
  ADD COLUMN IF NOT EXISTS lot_number VARCHAR(50);

COMMENT ON COLUMN stock_in.lot_number IS 'เลขที่ Lot เช่น LOT-20260407-001';

CREATE INDEX IF NOT EXISTS idx_stock_in_lot_number ON stock_in(lot_number);
