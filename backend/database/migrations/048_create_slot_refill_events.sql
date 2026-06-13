-- ═══════════════════════════════════════════════════════════════
-- Migration 048: ตาราง slot_refill_events — track "เติมสินค้าหน้าตู้"
-- 2026-06-13 (Slot Refill Tracking · เฟส 1)
--
-- โจทย์: เดิม slot_products_history จับแค่ตอน "เปลี่ยน SKU" ในช่อง
--        → เติม SKU เดิม (เช่น 3→24) ไม่มี log · WW ไม่ track เลย
-- ตารางนี้ log "เติมเข้าเท่าไหร่/ช่อง" ทุกรอบ sync (เทียบ scrape vs machine_stock เดิม)
--
-- 2 grain ในตารางเดียว (column `grain`):
--   - 'slot' = VMS · ต่อช่อง (sales มี slot_number → sold_between แม่นต่อช่อง)
--   - 'sku'  = WorldWide · ต่อ machine+sku+หน่วย(box/pack) · SKU เดียวอยู่หลายช่อง +
--              WW sales ไม่มี slot_number → รวมยอดที่ระดับ SKU
--
-- qty_added = (qty_after − qty_before) + sold_between
--   = จำนวนที่ "เติมเข้า" จริง (บวกกลับยอดที่ขายไประหว่าง sync)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS slot_refill_events (
  id              BIGSERIAL PRIMARY KEY,
  machine_id      TEXT        NOT NULL,
  platform        TEXT        NOT NULL,                 -- 'vms' | 'worldwide'
  grain           TEXT        NOT NULL,                 -- 'slot' | 'sku'
  slot_number     TEXT,                                 -- NULL สำหรับ grain='sku' (WW)
  sku_id          TEXT,                                 -- ไม่ผูก FK (WW อาจมี sku ใหม่ที่ยังไม่มีใน skus)
  is_box          BOOLEAN     NOT NULL DEFAULT FALSE,   -- หน่วยของช่อง (กล่อง/ซอง) จาก product_name
  product_name    TEXT,
  qty_before      INTEGER     NOT NULL DEFAULT 0,       -- คงเหลือก่อน (machine_stock เดิม)
  qty_after       INTEGER     NOT NULL DEFAULT 0,       -- คงเหลือหลัง (scrape ใหม่)
  sold_between    INTEGER     NOT NULL DEFAULT 0,       -- ยอดขายช่วง prev_synced→synced
  qty_added       INTEGER     NOT NULL DEFAULT 0,       -- = (after−before)+sold_between
  capacity        INTEGER,
  change_type     TEXT        NOT NULL,                 -- 'refill' | 'swap_in' | 'swap_out'
  detected_by     TEXT,                                 -- 'vms_stock_sync' | 'worldwide_stock_sync'
  session_id      UUID,                                 -- เฟส 2 (slot_restock_sessions) · ตอนนี้ NULL
  prev_synced_at  TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL,
  manual_adjusted BOOLEAN     NOT NULL DEFAULT FALSE,   -- เฟส 2: admin แก้ตัวเลขเอง
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT slot_refill_events_grain_check
    CHECK (grain IN ('slot', 'sku')),
  CONSTRAINT slot_refill_events_change_type_check
    CHECK (change_type IN ('refill', 'swap_in', 'swap_out'))
);

CREATE INDEX IF NOT EXISTS idx_sre_machine_sku  ON slot_refill_events (machine_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_sre_synced       ON slot_refill_events (synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_sre_session      ON slot_refill_events (session_id) WHERE session_id IS NOT NULL;

COMMENT ON TABLE slot_refill_events IS
  'Log การเติมสินค้าหน้าตู้ทุกรอบ sync · grain=slot(VMS ต่อช่อง)/sku(WW ต่อ machine+sku+หน่วย) · qty_added=(after-before)+sold_between';

-- ═══ Verify ═══
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'slot_refill_events'
ORDER BY ordinal_position;
