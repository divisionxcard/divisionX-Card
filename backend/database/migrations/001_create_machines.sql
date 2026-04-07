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
