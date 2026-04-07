-- =============================================================
-- Migration 004: Create stock_out table
-- ตาราง: บันทึกการเบิกสินค้าออก (เติมตู้)
-- =============================================================

CREATE TABLE IF NOT EXISTS stock_out (
  id             SERIAL PRIMARY KEY,
  sku_id         VARCHAR(20)  NOT NULL REFERENCES skus(sku_id) ON UPDATE CASCADE,
  machine_id     VARCHAR(50)  NOT NULL REFERENCES machines(machine_id) ON UPDATE CASCADE,
  quantity_packs INTEGER      NOT NULL CHECK (quantity_packs > 0), -- จำนวนซองที่เบิก
  withdrawn_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),              -- วันเวลาที่เบิก
  note           TEXT,                                              -- หมายเหตุ
  created_by     VARCHAR(100),                                      -- ผู้บันทึก
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_out_sku_id       ON stock_out(sku_id);
CREATE INDEX idx_stock_out_machine_id   ON stock_out(machine_id);
CREATE INDEX idx_stock_out_withdrawn_at ON stock_out(withdrawn_at DESC);

COMMENT ON TABLE  stock_out                  IS 'บันทึกการเบิกสินค้าออกจากสต็อกเพื่อเติมตู้';
COMMENT ON COLUMN stock_out.sku_id          IS 'รหัส SKU อ้างอิงจาก skus.sku_id';
COMMENT ON COLUMN stock_out.machine_id      IS 'ตู้ปลายทาง อ้างอิงจาก machines.machine_id';
COMMENT ON COLUMN stock_out.quantity_packs  IS 'จำนวนซองที่เบิกออก';
COMMENT ON COLUMN stock_out.withdrawn_at    IS 'วันเวลาที่เบิกสินค้าออก';
