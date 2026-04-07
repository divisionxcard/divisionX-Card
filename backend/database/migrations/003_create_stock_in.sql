-- =============================================================
-- Migration 003: Create stock_in table
-- ตาราง: บันทึกการรับสินค้าเข้าสต็อก
-- =============================================================

CREATE TABLE IF NOT EXISTS stock_in (
  id           SERIAL PRIMARY KEY,
  sku_id       VARCHAR(20)   NOT NULL REFERENCES skus(sku_id) ON UPDATE CASCADE,
  source       VARCHAR(200)  NOT NULL,           -- ชื่อ Supplier / แหล่งที่มา
  unit         VARCHAR(20)   NOT NULL DEFAULT 'pack'
               CHECK (unit IN ('pack', 'box', 'cotton')),  -- หน่วยที่รับเข้า
  quantity     INTEGER       NOT NULL CHECK (quantity > 0), -- จำนวนตามหน่วยที่ระบุ
  quantity_packs INTEGER     NOT NULL CHECK (quantity_packs > 0), -- จำนวนแปลงเป็นซอง (คำนวณ)
  unit_cost    NUMERIC(10,2) NOT NULL DEFAULT 0, -- ราคาต่อหน่วย (บาท)
  total_cost   NUMERIC(12,2) NOT NULL DEFAULT 0, -- ราคารวม (คำนวณอัตโนมัติ)
  purchased_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(), -- วันที่ซื้อ
  note         TEXT,                              -- หมายเหตุ
  created_by   VARCHAR(100),                      -- ผู้บันทึก
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_in_sku_id       ON stock_in(sku_id);
CREATE INDEX idx_stock_in_purchased_at ON stock_in(purchased_at DESC);
CREATE INDEX idx_stock_in_source       ON stock_in(source);

COMMENT ON TABLE  stock_in               IS 'บันทึกการรับสินค้าเข้าสต็อก';
COMMENT ON COLUMN stock_in.sku_id       IS 'รหัส SKU อ้างอิงจาก skus.sku_id';
COMMENT ON COLUMN stock_in.source       IS 'แหล่งที่มา / ชื่อผู้จำหน่าย (Supplier)';
COMMENT ON COLUMN stock_in.unit         IS 'หน่วยที่รับเข้า: pack | box | cotton';
COMMENT ON COLUMN stock_in.quantity     IS 'จำนวนตามหน่วยที่ระบุ';
COMMENT ON COLUMN stock_in.quantity_packs IS 'จำนวนซองทั้งหมด (แปลงจากหน่วยแล้ว)';
COMMENT ON COLUMN stock_in.unit_cost    IS 'ราคาต่อหน่วย (บาท)';
COMMENT ON COLUMN stock_in.total_cost   IS 'ราคารวมทั้งหมด = quantity × unit_cost';
COMMENT ON COLUMN stock_in.purchased_at IS 'วันที่ซื้อสินค้าจริง (อาจต่างจาก created_at)';
