-- ═══════════════════════════════════════════════════════════════
-- Migration 038: Slot Reconciliation columns
--                track ว่าสินค้าเก่าที่ออกจาก slot ไปอยู่ที่ไหน
-- 2026-05-22 (Phase 1 ของ Slot Reconciliation)
--
-- Dispositions:
--   returned             → คืนกลาง · INSERT stock_in source='machine_return'
--   transferred_to_admin → แอดมินถือ · INSERT stock_transfers
--   moved_to_machine     → ตู้อื่น   · INSERT stock_out + machine_stock ปลายทาง
--   lost                 → สูญหาย   · INSERT claims reason='machine_loss'
--   unknown              → ไม่ทราบ  · ไม่สร้าง movement · admin mark ให้ปิด review
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE slot_products_history
  ADD COLUMN IF NOT EXISTS pending_qty       INTEGER,
  ADD COLUMN IF NOT EXISTS disposition       TEXT
    CHECK (disposition IS NULL OR disposition IN
      ('returned','transferred_to_admin','moved_to_machine','lost','unknown')),
  ADD COLUMN IF NOT EXISTS disposition_target JSONB,
  ADD COLUMN IF NOT EXISTS reconciled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by     UUID REFERENCES profiles(id);

-- Index · query หา rows ที่ยังต้อง reconcile (closed period · ยังไม่ disposition)
CREATE INDEX IF NOT EXISTS idx_slot_history_unreconciled
  ON slot_products_history(machine_id, effective_to DESC)
  WHERE effective_to IS NOT NULL AND disposition IS NULL;

COMMENT ON COLUMN slot_products_history.pending_qty
  IS 'snapshot machine_stock.remain ตอน close period · ใช้เป็น default qty ตอน reconcile';
COMMENT ON COLUMN slot_products_history.disposition
  IS 'สถานะของสินค้าเก่าหลังถูกถอด: returned/transferred_to_admin/moved_to_machine/lost/unknown';
COMMENT ON COLUMN slot_products_history.disposition_target
  IS 'JSONB · เก็บ refs (stock_in_id/stock_transfer_id/stock_out_id/claim_id) + qty + note';

-- ═══ Verify ═══
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'slot_products_history'
  AND column_name IN ('pending_qty','disposition','disposition_target','reconciled_at','reconciled_by')
ORDER BY ordinal_position;
