-- ═══════════════════════════════════════════════════════════════
-- Migration 036: slot_products_history — track เมื่อไหร่ slot ของแต่ละตู้
--                เปลี่ยนสินค้า (Layer 3 ของ slot-change resilience)
-- 2026-05-20
--
-- ใช้สำหรับ:
--   1. Audit trail: slot X เคยขายอะไรช่วงไหน
--   2. Sales analytics per-slot per-period
--   3. Alert admin เมื่อ slot product เปลี่ยน (Layer 4)
--
-- Logic:
--   - effective_to IS NULL = active ปัจจุบัน (slot นี้กำลังขาย product นี้)
--   - effective_to <> NULL = ปิด period · slot ขายสินค้านี้ตั้งแต่ from ถึง to
--   - 1 slot จะมี active row เดียวเสมอ
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS slot_products_history (
  id              SERIAL PRIMARY KEY,
  machine_id      VARCHAR(50)   NOT NULL REFERENCES machines(machine_id) ON UPDATE CASCADE,
  slot_number     TEXT          NOT NULL,
  product_id      INTEGER,
  product_name    TEXT,
  sku_id          VARCHAR(20)            REFERENCES skus(sku_id)         ON UPDATE CASCADE,
  effective_from  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  effective_to    TIMESTAMPTZ,            -- NULL = active
  detected_by     TEXT,                   -- 'vms_stock_sync' · 'manual' · etc.
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- เพียง 1 active row ต่อ slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_history_active
  ON slot_products_history(machine_id, slot_number)
  WHERE effective_to IS NULL;

-- ค้นหา history ของ slot
CREATE INDEX IF NOT EXISTS idx_slot_history_lookup
  ON slot_products_history(machine_id, slot_number, effective_from DESC);

-- ค้นหา product เคยอยู่ slot ไหนบ้าง
CREATE INDEX IF NOT EXISTS idx_slot_history_product
  ON slot_products_history(product_id)
  WHERE product_id IS NOT NULL;

-- RLS: admin only (อ่าน/เขียน)
ALTER TABLE slot_products_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slot_history admin read" ON slot_products_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "slot_history admin write" ON slot_products_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

GRANT ALL ON slot_products_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE slot_products_history_id_seq TO service_role;

-- ═══ Verify ═══
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'slot_products_history' ORDER BY ordinal_position;
