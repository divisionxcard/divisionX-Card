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
