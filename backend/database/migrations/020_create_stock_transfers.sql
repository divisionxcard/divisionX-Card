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
