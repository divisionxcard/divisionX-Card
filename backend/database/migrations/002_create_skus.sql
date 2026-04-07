-- =============================================================
-- Migration 002: Create skus table
-- ตาราง: รายการสินค้า (SKU) ทั้งหมด 21 รายการ
-- =============================================================

CREATE TYPE sku_series AS ENUM ('OP', 'PRB', 'EB');

CREATE TABLE IF NOT EXISTS skus (
  id               SERIAL PRIMARY KEY,
  sku_id           VARCHAR(20)   UNIQUE NOT NULL,  -- e.g., "OP 01", "PRB 01", "EB 04"
  name             VARCHAR(200)  NOT NULL,          -- ชื่อชุดการ์ด
  series           sku_series    NOT NULL,           -- กลุ่มสินค้า: OP | PRB | EB
  packs_per_box    SMALLINT      NOT NULL DEFAULT 12
                                CHECK (packs_per_box > 0),  -- ซอง/กล่อง (PRB=10, อื่นๆ=12)
  boxes_per_cotton SMALLINT      NOT NULL DEFAULT 12
                                CHECK (boxes_per_cotton > 0), -- กล่อง/Cotton (ทุก SKU=12)
  sell_price       NUMERIC(10,2) NOT NULL DEFAULT 0,  -- ราคาขายต่อซอง (บาท)
  cost_price       NUMERIC(10,2) NOT NULL DEFAULT 0,  -- ต้นทุนต่อซอง (บาท)
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Virtual column: ซองต่อ Cotton
-- packs_per_cotton = packs_per_box * boxes_per_cotton

CREATE INDEX idx_skus_series   ON skus(series);
CREATE INDEX idx_skus_is_active ON skus(is_active);

COMMENT ON TABLE  skus                  IS 'ข้อมูล SKU สินค้าทั้งหมด (One Piece Card Game)';
COMMENT ON COLUMN skus.sku_id          IS 'รหัส SKU เช่น OP 01, PRB 01, EB 04';
COMMENT ON COLUMN skus.series          IS 'กลุ่มสินค้า: OP=ชุดปกติ, PRB=Premium Booster, EB=Extra Booster';
COMMENT ON COLUMN skus.packs_per_box   IS 'จำนวนซองต่อกล่อง (OP/EB=12, PRB=10)';
COMMENT ON COLUMN skus.boxes_per_cotton IS 'จำนวนกล่องต่อ Cotton (ทุก SKU = 12)';
COMMENT ON COLUMN skus.sell_price      IS 'ราคาขายต่อซอง (บาท)';
COMMENT ON COLUMN skus.cost_price      IS 'ต้นทุนต่อซอง (บาท)';
