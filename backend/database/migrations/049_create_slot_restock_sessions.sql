-- ═══════════════════════════════════════════════════════════════
-- Migration 049: ตาราง slot_restock_sessions — "รอบจัดของ" (bracket)
-- 2026-06-13 (Slot Refill Tracking · เฟส 2)
--
-- ใช้คู่กับ slot_refill_events (mig 048):
--   - admin กด "เริ่มรอบจัดของ" → สร้าง session (status=open, started_at)
--   - จัดของจริง → กด "จัดเสร็จ" → sync ตู้ → ปิด session (closed_at) +
--     stamp session_id ลง slot_refill_events ที่อยู่ในกรอบเวลา+ตู้
--   - สรุป = query slot_refill_events ของ session นั้น (session ไม่ diff เอง)
--
-- RLS: ไม่เปิด (ตาม convention slot_products_history / slot_refill_events ·
--      frontend ใช้ anon key เข้าตรง)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS slot_restock_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_by      TEXT,                                 -- user id (auth.uid)
  started_by_name TEXT,                                 -- ชื่อแสดง (display_name/email)
  machine_ids     TEXT[]      NOT NULL,                 -- ตู้ที่จัดรอบนี้
  status          TEXT        NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  note            TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT slot_restock_sessions_status_check
    CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_srs_status  ON slot_restock_sessions (status);
CREATE INDEX IF NOT EXISTS idx_srs_started ON slot_restock_sessions (started_at DESC);

COMMENT ON TABLE slot_restock_sessions IS
  'รอบจัดของ (bracket เวลา+ตู้) · สรุปการเติมจาก slot_refill_events.session_id (เฟส 2)';

-- ═══ Verify ═══
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'slot_restock_sessions'
ORDER BY ordinal_position;
