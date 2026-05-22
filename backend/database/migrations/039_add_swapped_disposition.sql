-- ═══════════════════════════════════════════════════════════════
-- Migration 039: เพิ่ม 'swapped' ใน disposition CHECK constraint
-- 2026-05-22 (Phase 2 ของ Slot Reconciliation · Slot Swap button)
--
-- ใช้กรณี admin สลับสินค้าระหว่าง 2 ช่องในตู้เดียวกัน
-- ไม่มี stock movement · ตัว slot_products_history เก็บ disposition='swapped'
-- + disposition_target = { swapped_with_slot: '<slot_number>' }
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE slot_products_history
  DROP CONSTRAINT IF EXISTS slot_products_history_disposition_check;

ALTER TABLE slot_products_history
  ADD CONSTRAINT slot_products_history_disposition_check
  CHECK (disposition IS NULL OR disposition IN
    ('returned','transferred_to_admin','moved_to_machine','lost','unknown','swapped'));

-- ═══ Verify ═══
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'slot_products_history'::regclass
  AND conname = 'slot_products_history_disposition_check';
