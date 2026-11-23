-- =============================================================
-- Migration 084: ที่พักรายการขายของสินค้าที่ยังไม่มี SKU (23 พ.ย. 2026)
-- =============================================================
-- sales.sku_id เป็น NOT NULL + FK ไป skus · แอดมินตั้งสินค้าชุดใหม่ในตู้ก่อนมีแถวใน skus เป็นเรื่องที่เกิดซ้ำ
-- (OP 16 · OP 17 · EB 05 · OP 18) และพังสองแบบ:
--   · VMS        upsert ล้มทั้งชุด → ยอดขายทุกตู้ไม่เข้า บอทหยุดรอบ (OP 18 · 22–23 พ.ย.)
--   · WW / Payif ทิ้งรายการขายของสินค้านั้นเงียบ ๆ (EB 05 · 14–16 พ.ย.)
-- เจ้าของเลือก: พักรายการพวกนั้นไว้ แล้วย้ายเข้า sales เองเมื่อเพิ่ม SKU · ใช้ทั้ง 3 ยี่ห้อ
--
-- ผู้ใช้: deploy/scraper/sales_pending.py (hold_unknown_skus · release_pending) — service_role เท่านั้น
-- ยังไม่รันไฟล์นี้: ซิงค์ไม่ล้ม แต่รายการของสินค้าใหม่ถูกข้าม + แจ้งเตือนทุกรอบ
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run · รันซ้ำได้ไม่พัง
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_pending_sku (
  sale_key    TEXT        PRIMARY KEY,          -- คีย์เดียวกับ sales.sale_key (ดึงซ้ำ = ทับแถวเดิม)
  sku_id      TEXT        NOT NULL,             -- sku ที่ตัวดึงแปลงชื่อได้ แต่ยังไม่มีใน skus · ตั้งใจไม่ผูก FK
  machine_id  TEXT,
  brand       TEXT,                             -- vms | worldwide | payif
  sold_at     TIMESTAMPTZ,
  record      JSONB       NOT NULL,             -- แถวพร้อม insert ลง sales ทั้งแถว
  parked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_pending_sku_sku_idx ON public.sales_pending_sku (sku_id);

COMMENT ON TABLE public.sales_pending_sku IS
  'รายการขายที่ยังลง sales ไม่ได้เพราะ sku_id ยังไม่มีใน skus — ตัวซิงค์ย้ายเข้า sales เองเมื่อ SKU ถูกเพิ่ม';

-- ── สิทธิ์: ครบ 3 ข้อเหมือนตารางอื่น (migration 069 · 081) — RLS + allowlist admin/user + REVOKE anon ──
ALTER TABLE public.sales_pending_sku ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_full_access ON public.sales_pending_sku;
CREATE POLICY staff_full_access ON public.sales_pending_sku
  FOR ALL
  TO authenticated
  USING      ((SELECT public.current_app_role()) IN ('admin', 'user'))
  WITH CHECK ((SELECT public.current_app_role()) IN ('admin', 'user'));

REVOKE ALL ON public.sales_pending_sku FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_pending_sku TO authenticated;

COMMIT;

-- ให้ PostgREST เห็นตารางใหม่ทันที (ไม่งั้นรอรอบรีโหลด schema เอง)
NOTIFY pgrst, 'reload schema';
