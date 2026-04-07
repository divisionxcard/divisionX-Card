-- =============================================================
-- Migration 005: Create sales table
-- ตาราง: ข้อมูลยอดขายจาก VMS InboxCorp
-- =============================================================

CREATE TABLE IF NOT EXISTS sales (
  id             SERIAL PRIMARY KEY,
  machine_id     VARCHAR(50)   NOT NULL REFERENCES machines(machine_id) ON UPDATE CASCADE,
  sku_id         VARCHAR(20)   NOT NULL REFERENCES skus(sku_id)    ON UPDATE CASCADE,
  quantity_sold  INTEGER       NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  revenue        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  sold_at        TIMESTAMPTZ   NOT NULL,  -- วันเวลาขายจริง (จาก VMS)
  synced_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(), -- วันเวลาที่ดึงข้อมูลจาก VMS
  vms_ref        VARCHAR(100),             -- reference ID จาก VMS (ป้องกัน duplicate)
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Unique constraint: ป้องกันข้อมูลซ้ำจากการ sync
CREATE UNIQUE INDEX idx_sales_unique_vms_ref
  ON sales(vms_ref)
  WHERE vms_ref IS NOT NULL;

CREATE INDEX idx_sales_machine_id ON sales(machine_id);
CREATE INDEX idx_sales_sku_id     ON sales(sku_id);
CREATE INDEX idx_sales_sold_at    ON sales(sold_at DESC);
-- Composite index สำหรับ daily/monthly report
CREATE INDEX idx_sales_machine_date ON sales(machine_id, sold_at DESC);

COMMENT ON TABLE  sales               IS 'ข้อมูลยอดขายจาก VMS InboxCorp (source of truth for revenue)';
COMMENT ON COLUMN sales.machine_id   IS 'ตู้ที่ขาย อ้างอิงจาก machines.machine_id';
COMMENT ON COLUMN sales.sku_id       IS 'สินค้าที่ขาย อ้างอิงจาก skus.sku_id';
COMMENT ON COLUMN sales.quantity_sold IS 'จำนวนซองที่ขายได้';
COMMENT ON COLUMN sales.revenue      IS 'ยอดรายรับ (บาท)';
COMMENT ON COLUMN sales.sold_at      IS 'วันเวลาที่ขาย (จาก VMS)';
COMMENT ON COLUMN sales.synced_at    IS 'วันเวลาที่ sync ข้อมูลจาก VMS';
COMMENT ON COLUMN sales.vms_ref      IS 'Reference ID จาก VMS เพื่อป้องกันข้อมูลซ้ำ';
