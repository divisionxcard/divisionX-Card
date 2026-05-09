-- =============================================================
-- Migration 026: แก้ bug · claim returned ลด main balance ผิด
-- =============================================================
-- ปัญหา: claim "คืนสต็อก" (returned) สร้าง stock_transfers row → ลด main
--         แต่ของจริงมาจาก customer คืน · main ไม่ควรเปลี่ยน
--
-- วิธีแก้:
--   1. เพิ่ม column `from_claim_id` ใน stock_transfers (nullable FK)
--   2. แก้ v_stock_balance view: skip transfers ที่ from_claim_id IS NOT NULL
--   3. confirmClaim() ใน app set from_claim_id ทุกครั้งที่ create transfer จาก claim
--   4. Backfill ของเก่า: SQL แยก (per environment) · ไม่อยู่ใน migration นี้
--      เพราะ prod อาจมี case ที่ปรับ manual แล้ว
-- =============================================================

-- ── 1) Schema change ─────────────────────────────────────────
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS from_claim_id INTEGER REFERENCES public.claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_claim
  ON public.stock_transfers(from_claim_id) WHERE from_claim_id IS NOT NULL;

COMMENT ON COLUMN public.stock_transfers.from_claim_id
  IS 'ถ้ามาจากเคลมคืน (claim returned) เก็บ claim.id · ใช้ exclude ออกจาก v_stock_balance.balance';

-- ── 2) View: main balance ไม่นับ transfers ที่ from claim ──
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
  WHERE from_claim_id IS NULL  -- ← key: skip transfers ที่มาจาก claim returned
  GROUP BY sku_id
) tf ON tf.sku_id = s.sku_id
WHERE s.is_active = true;

COMMENT ON VIEW v_stock_balance
  IS 'สต็อกหลัก = stock_in - stock_out_main - transfers (ไม่นับ transfers จาก claim returned)';

-- ── 3) Verify ────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='stock_transfers' AND column_name='from_claim_id';
-- SELECT pg_get_viewdef('v_stock_balance');
