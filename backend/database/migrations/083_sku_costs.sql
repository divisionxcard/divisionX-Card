-- =============================================================
-- Migration 083: ต้นทุนต่อซองแบบ "มีผลตั้งแต่วันที่" (30 ต.ค. 2026)
-- =============================================================
-- เจ้าของส่งต้นทุนต่อซองชุดใหม่ทุกสินค้า และสั่ง:
--   · กำไรบนหน้าเว็บคิดด้วยต้นทุนใหม่เฉพาะ 3 เดือนย้อนหลัง (ยอดขายตั้งแต่ 1 ส.ค. 2026) ส่วนก่อนหน้าคงของเดิม
--   · เก็บต้นทุนเดิมไว้ ดึงกลับมาใช้ได้ถ้าตัวเลขใหม่ผิด
--   · ยอดขายใหม่ต่อจากนี้คิดด้วยต้นทุนใหม่
-- เดิมต้นทุนมีค่าเดียวต่อ SKU (skus.avg_cost / cost_price) — แก้ทีเดียวเปลี่ยนกำไรย้อนหลังทั้งหมด
-- จึงเก็บเป็นประวัติ: ยอดขายแต่ละแถวใช้ต้นทุนแถวล่าสุดที่ effective_from <= วันที่ขาย (เวลาไทย)
--
-- ข้อมูลที่จะใส่ (ใส่จากเครื่องผ่าน REST หลังรันไฟล์นี้ — **ตัวเลขต้นทุนไม่อยู่ในไฟล์นี้** เพราะ repo เป็นสาธารณะ):
--   · แถวตั้งต้นทุก SKU effective_from 2000-01-01 = ต้นทุนที่หน้าเว็บใช้อยู่เดิม (avg_cost > 0 ไม่งั้น cost_price)
--   · แถวต้นทุนใหม่ effective_from 2026-08-01 ตามชีตของเจ้าของ
--   ถอยกลับ = ลบแถว 2026-08-01 ทิ้ง (แถวตั้งต้นยังอยู่) · สำเนาค่าเดิมทั้งตาราง skus อยู่ใน <repo>/backups/sku-costs-before-2026-10-30/
--
-- ผู้ใช้: หน้ายอดขาย/วิเคราะห์ SKU (components/shared/costs.js) · สรุปยอดรายวัน/รายสัปดาห์ (agents/daily_sales_digest.py)
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run · รันซ้ำได้ไม่พัง
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sku_costs (
  id              BIGSERIAL PRIMARY KEY,
  sku_id          TEXT          NOT NULL REFERENCES public.skus(sku_id) ON UPDATE CASCADE,
  cost_per_pack   NUMERIC(10,2) NOT NULL CHECK (cost_per_pack >= 0),
  effective_from  DATE          NOT NULL,
  source          TEXT,                       -- เช่น 'baseline: avg_cost/cost_price เดิม' · 'owner sheet 2026-10-30'
  note            TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (sku_id, effective_from)
);

CREATE INDEX IF NOT EXISTS sku_costs_sku_eff_idx ON public.sku_costs (sku_id, effective_from);

COMMENT ON TABLE public.sku_costs IS
  'ต้นทุนต่อซองตามช่วงเวลา — แถวล่าสุดที่ effective_from <= วันที่ขาย (ไทย) · ไม่มีแถวถึงวันนั้น = skus.avg_cost > 0 → cost_price';

-- ── สิทธิ์: เหมือนตารางอื่นทั้งหมด (migration 069 · 081) — admin/user อ่านเขียนได้ · marketing และคนนอกไม่เห็นต้นทุน ──
ALTER TABLE public.sku_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_full_access ON public.sku_costs;
CREATE POLICY staff_full_access ON public.sku_costs
  FOR ALL
  TO authenticated
  USING      ((SELECT public.current_app_role()) IN ('admin', 'user'))
  WITH CHECK ((SELECT public.current_app_role()) IN ('admin', 'user'));

REVOKE ALL ON public.sku_costs FROM anon;
REVOKE ALL ON SEQUENCE public.sku_costs_id_seq FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sku_costs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.sku_costs_id_seq TO authenticated;

COMMIT;

-- ให้ PostgREST เห็นตารางใหม่ทันที (ไม่งั้นรอรอบรีโหลด schema เอง)
NOTIFY pgrst, 'reload schema';
