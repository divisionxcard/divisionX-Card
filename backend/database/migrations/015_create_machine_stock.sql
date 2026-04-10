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
