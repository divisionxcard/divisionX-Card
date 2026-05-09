-- =============================================================
-- One-off prod backfill — claim returns (related to migration 026)
-- =============================================================
-- ใช้หลัง apply migration 026 บน prod
-- Backfill from_claim_id เฉพาะ transfers ที่ user ยืนยันว่าควร "fix" main balance
--
-- คดี (verified กับ user 2026-05-09):
--   • claim #1 → transfer #70 (OP 09 × 1) → main +1 (recover)
--   • claim #2 → transfer #71 (OP 09 × 2) → main +2 (recover)
--   • claim #4 → transfer #94 (EB 02 × 1) → main +1 (recover)
--   • claim #3 → transfer #72 (OP 06 × 2) → SKIP · main balance ปัจจุบันถูกแล้ว
--                                            (ปรับ manual ที่อื่น compensate ไปแล้ว)
--
-- Total recover: 4 ซอง (OP 09 × 3 + EB 02 × 1)
-- =============================================================

-- Verify ก่อน backfill — ดู transfers ที่จะแก้
-- SELECT id, sku_id, quantity_packs, to_user_id, note, from_claim_id
-- FROM stock_transfers
-- WHERE id IN (70, 71, 72, 94);

-- Backfill (skip 72)
UPDATE public.stock_transfers SET from_claim_id = 1 WHERE id = 70 AND from_claim_id IS NULL;
UPDATE public.stock_transfers SET from_claim_id = 2 WHERE id = 71 AND from_claim_id IS NULL;
UPDATE public.stock_transfers SET from_claim_id = 4 WHERE id = 94 AND from_claim_id IS NULL;

-- Verify หลัง backfill
-- SELECT id, sku_id, quantity_packs, from_claim_id
-- FROM stock_transfers WHERE id IN (70, 71, 72, 94)
-- ORDER BY id;
-- (#70, #71, #94 ควรมี from_claim_id ที่ตรง · #72 ยังเป็น NULL)

-- Verify main balance หลัง fix
-- SELECT sku_id, balance FROM v_stock_balance WHERE sku_id IN ('OP 09', 'OP 06', 'EB 02');
-- OP 09: เพิ่ม 3
-- OP 06: ไม่เปลี่ยน
-- EB 02: เพิ่ม 1
