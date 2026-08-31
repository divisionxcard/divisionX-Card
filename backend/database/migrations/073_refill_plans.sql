-- ═══════════════════════════════════════════════════════════════
-- Migration 073: เก็บ "ใบจัดของสั่งไปเท่าไหร่" เพื่อเทียบกับที่เติมได้จริง
-- 2026-08-31
--
-- โจทย์ที่แก้ — จุดบอดที่ทำให้เรื่อง "จัดของเกิน" หาสาเหตุไม่เจอสักที:
--   ระบบบันทึกแค่ "เติมเข้าจริงเท่าไหร่" (slot_refill_events)
--   แต่**ไม่เคยบันทึกว่าใบจัดของสั่งไปเท่าไหร่**
--   → SKU ที่ใบสั่งแล้วแอดมินใส่ไม่ได้เลย จะไม่มีแถวในระบบสักแถว
--     ของที่ขนกลับมาจึงหายไปจากข้อมูลทั้งก้อน วิเคราะห์ย้อนหลังชี้ตัวไม่ได้
--     ต้องรอแอดมินมาบอกปากเปล่าอย่างเดียว (ซึ่งคือที่มาของงานนี้ทั้งงาน)
--
-- flow:
--   1. กด Print/Export ที่ใบจัดของ → บันทึกทุกบรรทัดลงตารางนี้ (status='open')
--   2. รอบ sync ถัดไปเติม slot_refill_events ตามปกติ
--   3. refill_plan_check.py เทียบ planned_qty กับที่เติมได้จริง → ปิดเป็น 'checked'
--      แล้วสรุปเข้า Telegram ว่า "ใบเมื่อวานเกินไปกี่ซอง ที่ SKU ไหน"
--
-- ⚠️ grain = 1 แถวต่อ (ใบ, ตู้, SKU, หน่วย) ให้ตรงกับ slot_refill_events ฝั่ง WW/Payif
--    ซึ่งรวมที่ระดับ machine+sku+หน่วย (SKU เดียวอยู่ได้หลายช่อง)
--    ถ้าเก็บละเอียดกว่านี้จะเทียบกันไม่ได้
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS refill_plans (
  id               BIGSERIAL PRIMARY KEY,
  plan_id          UUID        NOT NULL,          -- 1 ใบ = 1 uuid (หลายแถว)
  planned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  planned_by       UUID,                          -- profiles.id ของคนกดพิมพ์
  planned_by_name  TEXT,
  source           TEXT        NOT NULL,          -- 'stock_report' | 'refill_prep'

  machine_id       TEXT        NOT NULL,
  sku_id           TEXT,                          -- ไม่ผูก FK · ชื่อที่ map ไม่ได้ก็ต้องเก็บ
  product_name     TEXT,
  is_box           BOOLEAN     NOT NULL DEFAULT FALSE,

  planned_qty      INTEGER     NOT NULL,          -- ที่ใบสั่งให้ขนไป (หน่วยเดียวกับ is_box)
  remain_at_plan   INTEGER,                       -- คงเหลือหน้าตู้ตอนออกใบ
  capacity_at_plan INTEGER,
  stock_synced_at  TIMESTAMPTZ,                   -- ข้อมูลที่ใบนี้ใช้ เก่าแค่ไหน

  -- ผลการเทียบ (เติมโดย refill_plan_check.py)
  status           TEXT        NOT NULL DEFAULT 'open',   -- 'open' | 'checked' | 'expired'
  actual_added     INTEGER,
  checked_at       TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT refill_plans_status_check CHECK (status IN ('open', 'checked', 'expired')),
  CONSTRAINT refill_plans_source_check CHECK (source IN ('stock_report', 'refill_prep'))
);

COMMENT ON TABLE refill_plans IS
  'ใบจัดของสั่งไปเท่าไหร่ · เทียบกับ slot_refill_events ว่าเติมเข้าจริงเท่าไหร่ '
  '→ ตอบได้เองว่าวันไหนจัดเกิน/ขาด ที่ SKU ไหน โดยไม่ต้องรอแอดมินบอก';
COMMENT ON COLUMN refill_plans.planned_qty IS
  'จำนวนที่ใบสั่งให้ขนไป · หน่วยตาม is_box (กล่อง/ซอง) เหมือน slot_refill_events';
COMMENT ON COLUMN refill_plans.actual_added IS
  'ที่เติมเข้าจริง รวมจาก slot_refill_events.qty_added หลังเวลาออกใบ · NULL = ยังไม่ได้เทียบ';

-- ตัวเทียบไล่หาแถวที่ยังไม่ปิด = query เดียวที่ใช้บ่อย
CREATE INDEX IF NOT EXISTS idx_refill_plans_open
  ON refill_plans (status, planned_at)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_refill_plans_machine_sku
  ON refill_plans (machine_id, sku_id, planned_at DESC);

-- ── RLS ── ตารางใหม่ต้องเปิดเอง ไม่ได้ถูกครอบโดย migration 069
ALTER TABLE public.refill_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_full_access ON public.refill_plans;
CREATE POLICY authenticated_full_access ON public.refill_plans
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ═══ Verify ═══
SELECT status, count(*) FROM refill_plans GROUP BY status;
