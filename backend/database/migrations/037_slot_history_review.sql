-- ═══════════════════════════════════════════════════════════════
-- Migration 037: slot_products_history.review_status
--                Layer 5 ของ slot-change resilience
-- 2026-05-20
--
-- Status:
--   'pending'   = ตรวจพบใหม่ · admin ยังไม่ review (default)
--   'confirmed' = admin ยืนยันว่าตั้งใจเปลี่ยน · ซ่อนจาก banner
--   'flagged'   = admin ติดธงว่าผิดพลาด (bug ที่ต้อง investigate)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE slot_products_history
  ADD COLUMN IF NOT EXISTS review_status TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'confirmed', 'flagged')),
  ADD COLUMN IF NOT EXISTS review_note  TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES profiles(id);

-- Index: banner query (pending events ในช่วง N วัน)
CREATE INDEX IF NOT EXISTS idx_slot_history_pending
  ON slot_products_history(effective_to DESC)
  WHERE review_status = 'pending' AND effective_to IS NOT NULL;

-- ═══ Verify ═══
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'slot_products_history'
  AND column_name IN ('review_status','review_note','reviewed_at','reviewed_by')
ORDER BY ordinal_position;
