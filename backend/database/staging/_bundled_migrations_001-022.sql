
-- ═══════════════════════════════════════════════════════════════
-- FILE: 001_create_machines.sql
-- ═══════════════════════════════════════════════════════════════
-- =============================================================
-- Migration 001: Create machines table
-- ตาราง: ตู้จำหน่ายสินค้า
-- =============================================================

CREATE TABLE IF NOT EXISTS machines (
  id           SERIAL PRIMARY KEY,
  machine_id   VARCHAR(50)  UNIQUE NOT NULL,  -- e.g., "machine_1", "machine_2"
  name         VARCHAR(100) NOT NULL,          -- ชื่อตู้ เช่น "ตู้ที่ 1"
  location     VARCHAR(200),                   -- สถานที่ตั้ง
  status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index สำหรับ query บ่อย
CREATE INDEX idx_machines_status ON machines(status);

COMMENT ON TABLE  machines              IS 'ข้อมูลตู้จำหน่ายสินค้า';
COMMENT ON COLUMN machines.machine_id  IS 'รหัสตู้ (machine_1, machine_2, machine_3 ...)';
COMMENT ON COLUMN machines.name        IS 'ชื่อหรือชื่อเรียกตู้';
COMMENT ON COLUMN machines.location   IS 'สถานที่ตั้งตู้';
COMMENT ON COLUMN machines.status     IS 'สถานะ: active = ใช้งาน, inactive = ปิดใช้งาน';

-- ═══════════════════════════════════════════════════════════════
-- FILE: 002_create_skus.sql
-- ═══════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════
-- FILE: 003_create_stock_in.sql
-- ═══════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════
-- FILE: 004_create_stock_out.sql
-- ═══════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════
-- FILE: 005_create_sales.sql
-- ═══════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════
-- FILE: 006_create_views.sql
-- ═══════════════════════════════════════════════════════════════
-- =============================================================
-- Migration 006: Create views for stock summary & reports
-- =============================================================

-- View: ยอดคงเหลือสต็อกแบบ Real-time แยกตาม SKU
CREATE OR REPLACE VIEW v_stock_balance AS
SELECT
  s.sku_id,
  s.name,
  s.series,
  s.sell_price,
  s.cost_price,
  COALESCE(si.total_in,  0) AS total_in,
  COALESCE(so.total_out, 0) AS total_out,
  COALESCE(si.total_in,  0) - COALESCE(so.total_out, 0) AS balance
FROM skus s
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_in
  FROM stock_in
  GROUP BY sku_id
) si ON si.sku_id = s.sku_id
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_out
  FROM stock_out
  GROUP BY sku_id
) so ON so.sku_id = s.sku_id
WHERE s.is_active = true;

COMMENT ON VIEW v_stock_balance IS 'สต็อกคงเหลือ Real-time แยกตาม SKU (stock_in - stock_out)';

-- View: ยอดขายรายวันแยกตามตู้
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_date,
  machine_id,
  sku_id,
  SUM(quantity_sold) AS total_qty,
  SUM(revenue)       AS total_revenue
FROM sales
GROUP BY
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok'),
  machine_id,
  sku_id;

COMMENT ON VIEW v_daily_sales IS 'ยอดขายรายวันแยกตามตู้และ SKU (ใช้เขตเวลา Asia/Bangkok)';

-- View: ยอดขายรายเดือนแยกตามตู้
CREATE OR REPLACE VIEW v_monthly_sales AS
SELECT
  DATE_TRUNC('month', sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_month,
  machine_id,
  sku_id,
  SUM(quantity_sold) AS total_qty,
  SUM(revenue)       AS total_revenue
FROM sales
GROUP BY
  DATE_TRUNC('month', sold_at AT TIME ZONE 'Asia/Bangkok'),
  machine_id,
  sku_id;

COMMENT ON VIEW v_monthly_sales IS 'ยอดขายรายเดือนแยกตามตู้และ SKU';

-- View: Stock Movement History (ประวัติทั้งหมด)
CREATE OR REPLACE VIEW v_stock_movement AS
SELECT
  'stock_in'        AS movement_type,
  si.id             AS ref_id,
  si.sku_id,
  sk.name           AS sku_name,
  NULL::VARCHAR(50) AS machine_id,
  si.quantity_packs AS packs,
  si.source         AS description,
  si.purchased_at   AS moved_at,
  si.created_by
FROM stock_in si
JOIN skus sk ON sk.sku_id = si.sku_id
UNION ALL
SELECT
  'stock_out'       AS movement_type,
  so.id             AS ref_id,
  so.sku_id,
  sk.name           AS sku_name,
  so.machine_id,
  -so.quantity_packs AS packs,  -- negative = ออก
  CONCAT('เติม ', m.name) AS description,
  so.withdrawn_at   AS moved_at,
  so.created_by
FROM stock_out so
JOIN skus     sk ON sk.sku_id     = so.sku_id
JOIN machines m  ON m.machine_id  = so.machine_id
ORDER BY moved_at DESC;

COMMENT ON VIEW v_stock_movement IS 'ประวัติการเคลื่อนไหวสต็อกทั้งหมด (in/out รวมกัน)';

-- ═══════════════════════════════════════════════════════════════
-- FILE: 007_add_lot_number_to_stock_in.sql
-- ═══════════════════════════════════════════════════════════════
-- =============================================================
-- Migration 007: Add lot_number to stock_in
-- เพิ่มคอลัมน์ lot_number สำหรับติดตามต้นทุนแต่ละ Lot
-- =============================================================

ALTER TABLE stock_in
  ADD COLUMN IF NOT EXISTS lot_number VARCHAR(50);

COMMENT ON COLUMN stock_in.lot_number IS 'เลขที่ Lot เช่น LOT-20260407-001';

CREATE INDEX IF NOT EXISTS idx_stock_in_lot_number ON stock_in(lot_number);

-- ═══════════════════════════════════════════════════════════════
-- FILE: 008_add_lot_number_to_stock_out.sql
-- ═══════════════════════════════════════════════════════════════
-- =============================================================
-- Migration 008: Add lot_number to stock_out
-- เพิ่มคอลัมน์ lot_number เพื่อติดตามการเบิกแต่ละ Lot
-- =============================================================

ALTER TABLE stock_out
  ADD COLUMN IF NOT EXISTS lot_number VARCHAR(50);

COMMENT ON COLUMN stock_out.lot_number IS 'เลขที่ Lot ที่เบิกออก (อ้างอิง stock_in.lot_number)';

CREATE INDEX IF NOT EXISTS idx_stock_out_lot_number ON stock_out(lot_number);

-- ═══════════════════════════════════════════════════════════════
-- STAGING FIX: เพิ่ม column ที่ prod มีแต่ไม่มีใน migration 005
-- (prod เพิ่มผ่าน Supabase Console)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_name_raw TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_key TEXT UNIQUE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2);

-- ═══════════════════════════════════════════════════════════════
-- FILE: 009_fix_box_quantity_sold.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 009: แก้ quantity_sold สำหรับ box sales ที่ถูกบันทึกเป็น 1
-- ปัญหา: scraper เดิมตั้ง quantity_sold = 1 เสมอ ไม่ว่าจะขายแบบ box หรือ pack
-- แก้ไข: ถ้า product_name_raw มีคำว่า "box" → คูณ quantity_sold ด้วย packs_per_box
-- ═══════════════════════════════════════════════════════════════

UPDATE sales
SET quantity_sold = s.packs_per_box
FROM skus s
WHERE sales.sku_id = s.sku_id
  AND sales.quantity_sold = 1
  AND (
    LOWER(sales.product_name_raw) LIKE '%(box)%'
    OR LOWER(sales.product_name_raw) LIKE '% box'
  );

-- ═══════════════════════════════════════════════════════════════
-- FILE: 010_fix_prb_boxes_per_cotton.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 010: แก้ boxes_per_cotton ของ PRB 01 และ PRB 02
-- PRB 01: 1 cotton = 10 กล่อง (เดิมตั้ง 12 ผิด)
-- PRB 02: 1 cotton = 20 กล่อง (เดิมตั้ง 12 ผิด)
-- ═══════════════════════════════════════════════════════════════

UPDATE skus SET boxes_per_cotton = 10 WHERE sku_id = 'PRB 01';
UPDATE skus SET boxes_per_cotton = 20 WHERE sku_id = 'PRB 02';

-- ═══════════════════════════════════════════════════════════════
-- FILE: 011_add_avg_cost_to_skus.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 011: เพิ่ม avg_cost (ต้นทุนเฉลี่ยเคลื่อนที่) ในตาราง skus
-- avg_cost จะถูกอัปเดตเฉพาะตอนรับสินค้าเข้า (stock_in)
-- ไม่เปลี่ยนแปลงตอนเบิกออก (stock_out)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE skus ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

-- คำนวณค่าเริ่มต้นจาก stock_in ที่มีอยู่ (weighted average จากทุก lot)
UPDATE skus s
SET avg_cost = sub.avg
FROM (
  SELECT sku_id,
    CASE WHEN SUM(quantity_packs) > 0
      THEN SUM(total_cost) / SUM(quantity_packs)
      ELSE 0
    END AS avg
  FROM stock_in
  GROUP BY sku_id
) sub
WHERE s.sku_id = sub.sku_id;

-- ═══════════════════════════════════════════════════════════════
-- FILE: 012_create_claims.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 012: สร้างตาราง claims (เคลม/คืนเงิน)
-- กรณีสินค้าไม่ตก ลูกค้าเคลม → คืนเงิน → คืนสต็อกหรือตัดชำรุด
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS claims (
  id               SERIAL PRIMARY KEY,
  machine_id       VARCHAR(50)   NOT NULL REFERENCES machines(machine_id),
  sku_id           VARCHAR(20)   NOT NULL REFERENCES skus(sku_id),
  quantity         INTEGER       NOT NULL DEFAULT 1
                   CHECK (quantity > 0),
  refund_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  product_status   VARCHAR(20)   NOT NULL DEFAULT 'returned'
                   CHECK (product_status IN ('returned', 'damaged')),
  reason           VARCHAR(200),
  note             TEXT,
  claimed_at       DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_by       VARCHAR(100),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claims_machine_id  ON claims(machine_id);
CREATE INDEX idx_claims_sku_id      ON claims(sku_id);
CREATE INDEX idx_claims_claimed_at  ON claims(claimed_at);

-- ═══════════════════════════════════════════════════════════════
-- FILE: 013_add_lost_status_to_claims.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 013: เพิ่มสถานะ 'lost' (สูญหาย) ในตาราง claims
-- กรณีตู้ปล่อยสินค้าเกินจำนวน (เช่น ซื้อ 1 ตก 2)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_product_status_check;
ALTER TABLE claims ADD CONSTRAINT claims_product_status_check
  CHECK (product_status IN ('returned', 'damaged', 'lost'));

-- ═══════════════════════════════════════════════════════════════
-- FILE: 014_add_confirm_status_to_claims.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 014: เพิ่ม confirm_status สำหรับยืนยันการตัดสต็อก
-- pending   = รอผู้ใช้ยืนยัน
-- confirmed = ยืนยันแล้ว ตัดสต็อกแล้ว
-- NULL      = ไม่ต้องยืนยัน (เช่น คืนสต็อก)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE claims ADD COLUMN IF NOT EXISTS confirm_status VARCHAR(20) DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════
-- FILE: 015_create_machine_stock.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 015: สร้างตาราง machine_stock (สต็อกหน้าตู้จาก VMS API)
-- ดึงข้อมูลจาก VMS API: /internal/v1/slots/1?kiosk_record_id={id}
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS machine_stock (
  id               SERIAL PRIMARY KEY,
  machine_id       VARCHAR(50)   NOT NULL,
  kiosk_record_id  INTEGER       NOT NULL,
  slot_number      VARCHAR(10)   NOT NULL,
  product_id       INTEGER,
  product_name     VARCHAR(255),
  product_img      TEXT,
  remain           INTEGER       NOT NULL DEFAULT 0,
  max_capacity     INTEGER       NOT NULL DEFAULT 0,
  is_occupied      BOOLEAN       NOT NULL DEFAULT false,
  status           VARCHAR(20)   NOT NULL DEFAULT 'active',
  synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(machine_id, slot_number)
);

CREATE INDEX idx_machine_stock_machine  ON machine_stock(machine_id);
CREATE INDEX idx_machine_stock_slot     ON machine_stock(machine_id, slot_number);

-- ═══════════════════════════════════════════════════════════════
-- FILE: 016_add_sku_id_to_machine_stock.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 016: เพิ่ม sku_id ใน machine_stock เพื่อ map กับ SKU ในระบบ
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE machine_stock ADD COLUMN IF NOT EXISTS sku_id VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_machine_stock_sku ON machine_stock(sku_id);

-- ═══════════════════════════════════════════════════════════════
-- FILE: 017_delete_extra_slots.sql
-- ═══════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════
-- Migration 017: ลบช่องเกินของตู้ 1-3 (มีแค่ 60 ช่อง = 001-060)
-- ตู้ 4 มี 120 ช่อง (001-060 + 101-160) → ไม่ลบ
-- ═══════════════════════════════════════════════════════════════

DELETE FROM machine_stock
WHERE machine_id IN ('chukes01', 'chukes02', 'chukes03')
  AND CAST(slot_number AS INTEGER) > 60;

-- ═══════════════════════════════════════════════════════════════
-- FILE: 018_create_login_history.sql
-- ═══════════════════════════════════════════════════════════════
-- =============================================================
-- Migration 018: Create login_history table
-- ตาราง: บันทึกประวัติการเข้า-ออกระบบ (Audit Trail)
-- =============================================================

CREATE TABLE IF NOT EXISTS login_history (
  id            SERIAL PRIMARY KEY,
  user_id       UUID,
  email         VARCHAR(200),
  display_name  VARCHAR(100),
  action        VARCHAR(20)  NOT NULL DEFAULT 'login'
                CHECK (action IN ('login', 'logout')),
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_history_user_id    ON login_history(user_id);
CREATE INDEX idx_login_history_created_at ON login_history(created_at DESC);

COMMENT ON TABLE  login_history              IS 'บันทึกประวัติการเข้า-ออกระบบ';
COMMENT ON COLUMN login_history.user_id     IS 'Supabase Auth user ID';
COMMENT ON COLUMN login_history.action      IS 'login หรือ logout';
COMMENT ON COLUMN login_history.ip_address  IS 'IP Address ของผู้ใช้';
COMMENT ON COLUMN login_history.user_agent  IS 'Browser User Agent';

-- ═══════════════════════════════════════════════════════════════
-- FILE: 019_create_machine_assignments.sql
-- ═══════════════════════════════════════════════════════════════
-- 019: สร้างตาราง machine_assignments (ผูกแอดมินกับตู้ที่รับผิดชอบ)
CREATE TABLE IF NOT EXISTS machine_assignments (
  id            SERIAL PRIMARY KEY,
  machine_id    VARCHAR(50)  NOT NULL REFERENCES machines(machine_id),
  user_id       UUID         NOT NULL,
  assigned_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(machine_id, user_id)
);

-- Index สำหรับ query ตู้ของ user
CREATE INDEX IF NOT EXISTS idx_machine_assignments_user
  ON machine_assignments(user_id) WHERE is_active = TRUE;

-- RLS
ALTER TABLE machine_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "machine_assignments_select" ON machine_assignments
  FOR SELECT USING (TRUE);

CREATE POLICY "machine_assignments_insert" ON machine_assignments
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "machine_assignments_update" ON machine_assignments
  FOR UPDATE USING (TRUE);

CREATE POLICY "machine_assignments_delete" ON machine_assignments
  FOR DELETE USING (TRUE);

-- ═══════════════════════════════════════════════════════════════
-- FILE: 020_create_stock_transfers.sql
-- ═══════════════════════════════════════════════════════════════
-- 020: สร้างตาราง stock_transfers (แจกจ่ายจากสต็อกหลักไปสต็อกย่อยของแอดมิน)
CREATE TABLE IF NOT EXISTS stock_transfers (
  id              SERIAL PRIMARY KEY,
  sku_id          VARCHAR(20)   NOT NULL REFERENCES skus(sku_id),
  lot_number      VARCHAR,
  to_user_id      UUID          NOT NULL,
  unit            VARCHAR(20)   NOT NULL DEFAULT 'pack',
  quantity         INTEGER       NOT NULL CHECK (quantity > 0),
  quantity_packs   INTEGER       NOT NULL CHECK (quantity_packs > 0),
  transferred_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  note            TEXT,
  created_by      VARCHAR(100),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index สำหรับ query transfers ของ user
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_user
  ON stock_transfers(to_user_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_sku
  ON stock_transfers(sku_id);

-- RLS
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_transfers_select" ON stock_transfers
  FOR SELECT USING (TRUE);

CREATE POLICY "stock_transfers_insert" ON stock_transfers
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "stock_transfers_update" ON stock_transfers
  FOR UPDATE USING (TRUE);

CREATE POLICY "stock_transfers_delete" ON stock_transfers
  FOR DELETE USING (TRUE);

-- ═══════════════════════════════════════════════════════════════
-- FILE: 021_add_admin_columns.sql
-- ═══════════════════════════════════════════════════════════════
-- 021: เพิ่ม columns ใน stock_out และ claims สำหรับระบบสต็อกย่อย

-- stock_out: ระบุว่าเบิกจากสต็อกของ admin คนไหน (NULL = สต็อกหลัก / ข้อมูลเก่า)
ALTER TABLE stock_out
  ADD COLUMN IF NOT EXISTS withdrawn_by_user_id UUID;

-- claims: ระบุว่า admin คนไหนจัดการเคลม (NULL = ข้อมูลเก่า)
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS managed_by_user_id UUID;

-- ═══════════════════════════════════════════════════════════════
-- FILE: 022_update_v_stock_balance_with_transfers.sql
-- ═══════════════════════════════════════════════════════════════
-- 022: อัปเดต v_stock_balance ให้หัก stock_transfers ออกด้วย
-- สต็อกหลัก = stock_in - stock_out(เก่าไม่มี user_id) - stock_transfers

CREATE OR REPLACE VIEW v_stock_balance AS
SELECT
  s.sku_id,
  s.name,
  s.series,
  s.sell_price,
  s.cost_price,
  COALESCE(si.total_in,  0) AS total_in,
  COALESCE(so.total_out, 0) + COALESCE(tf.total_transferred, 0) AS total_out,
  COALESCE(si.total_in,  0) - COALESCE(so.total_out, 0) - COALESCE(tf.total_transferred, 0) AS balance
FROM skus s
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_in
  FROM stock_in
  GROUP BY sku_id
) si ON si.sku_id = s.sku_id
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_out
  FROM stock_out
  WHERE withdrawn_by_user_id IS NULL
  GROUP BY sku_id
) so ON so.sku_id = s.sku_id
LEFT JOIN (
  SELECT sku_id, SUM(quantity_packs) AS total_transferred
  FROM stock_transfers
  GROUP BY sku_id
) tf ON tf.sku_id = s.sku_id
WHERE s.is_active = true;

COMMENT ON VIEW v_stock_balance IS 'สต็อกหลักคงเหลือ Real-time (stock_in - stock_out เก่า - stock_transfers)';
