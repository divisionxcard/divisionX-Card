-- =============================================================
-- Migration 028: เพิ่ม from_claim_id ใน stock_out (revert ลบเคลม damaged/lost)
-- =============================================================
-- ปัญหา: เคลม damaged/lost confirmed → สร้าง stock_out ตัดสต็อก user
--         ลบเคลม → stock_out ค้าง · สต็อก user ไม่ recover
-- วิธีแก้: link stock_out → claim ผ่าน from_claim_id · ลบเคลมแล้ว
--         deleteClaim ลบ stock_out ที่ link ก่อน
--
-- หมายเหตุ: ไม่ต้องแก้ v_stock_balance · view กรอง stock_out
--           ด้วย WHERE withdrawn_by_user_id IS NULL อยู่แล้ว
--           (stock_out จาก confirm เคลมมี user_id เสมอ จึงไม่นับใน main)
-- =============================================================

ALTER TABLE public.stock_out
  ADD COLUMN IF NOT EXISTS from_claim_id INTEGER REFERENCES public.claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_out_from_claim
  ON public.stock_out(from_claim_id) WHERE from_claim_id IS NOT NULL;

COMMENT ON COLUMN public.stock_out.from_claim_id
  IS 'ถ้ามาจาก confirm เคลม damaged/lost เก็บ claim.id · ใช้ revert ตอนลบเคลม';

-- ── Verify ────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='stock_out' AND column_name='from_claim_id';
