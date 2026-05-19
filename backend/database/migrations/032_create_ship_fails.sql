-- ═══════════════════════════════════════════════════════════════
-- Migration 032: ship_fails table — track Ship Fail transactions
-- 2026-05-19
--   เก็บ Ship Fail rows จาก WW (ลูกค้าจ่ายเงินแต่เครื่องไม่ดันสินค้า)
--   WW จัดการ refund ลูกค้าเอง · DVX ใช้ table นี้ track เพื่อ verify ยอด
--   เคลียร์กับ WW ภายหลัง
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ship_fails (
  id              SERIAL PRIMARY KEY,
  machine_id      VARCHAR(50)   NOT NULL REFERENCES machines(machine_id) ON UPDATE CASCADE,
  sku_id          VARCHAR(20)            REFERENCES skus(sku_id)         ON UPDATE CASCADE,
  product_name_raw TEXT,                 -- ชื่อจาก WW (debug · เผื่อ map ไม่ออก)
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),  -- ยอดที่ลูกค้าจ่าย
  sold_at         TIMESTAMPTZ   NOT NULL,
  order_number    TEXT          UNIQUE,  -- WW order # · กัน duplicate sync

  -- Status flow: pending → resolved (admin verify + ตรวจ refund แล้ว)
  status          TEXT          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'resolved')),

  -- Verification (เมื่อ admin มาตรวจ)
  verified_at     TIMESTAMPTZ,
  verified_by     UUID          REFERENCES profiles(id),

  -- Refund tracking (WW คืนเงินลูกค้า + หักจากยอดโอนให้เรา)
  refunded_amount NUMERIC(12,2),
  refunded_at     TIMESTAMPTZ,
  refunded_note   TEXT,         -- เช่น "WW หักยอดงวด 2026-05-20"

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ship_fails_machine   ON ship_fails(machine_id);
CREATE INDEX IF NOT EXISTS idx_ship_fails_sold_at   ON ship_fails(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_ship_fails_status    ON ship_fails(status);

-- RLS: admin only (consistent กับ claims)
ALTER TABLE ship_fails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ship_fails admin read" ON ship_fails
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ship_fails admin write" ON ship_fails
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role bypass (scraper ใช้ service key)
GRANT ALL ON ship_fails TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ship_fails_id_seq TO service_role;
