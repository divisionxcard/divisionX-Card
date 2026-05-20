-- ═══════════════════════════════════════════════════════════════
-- Migration 035: เพิ่ม slot_number + product_id ใน sales table
-- 2026-05-20
--
-- ปัญหา: admin VMS เปลี่ยนสินค้าหน้าตู้บ่อย (matching best-sellers)
--   - VMS sales API คืน current product name ของ slot
--   - DvX ขาด info ว่า sale ตอนนั้นขายจาก slot ไหน
--   - ทำให้ track ไม่ได้ว่า slot นี้เคยขายอะไรช่วงไหน
--
-- Fix: เก็บ slot_number + product_id ที่ sale แต่ละครั้ง
--   - slot_number: VMS slot code (เช่น "012")
--   - product_id: VMS-assigned unique product ID (stable per product)
--   - เก็บ "snapshot" ตอนขายจริง · ทน slot change retroactively
--
-- Backward compat: ทั้ง 2 columns nullable · ข้อมูลเก่าไม่มี slot_number
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS slot_number TEXT,
  ADD COLUMN IF NOT EXISTS product_id  INTEGER;

CREATE INDEX IF NOT EXISTS idx_sales_slot
  ON sales(machine_id, slot_number)
  WHERE slot_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_product_id
  ON sales(product_id)
  WHERE product_id IS NOT NULL;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sales'
  AND column_name IN ('slot_number', 'product_id')
ORDER BY column_name;
