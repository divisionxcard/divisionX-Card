-- =============================================================
-- Migration 025: สร้าง stock_withdrawal_requests + RLS + approve function
-- =============================================================
-- เป้าหมาย:
--   • User (admin) ส่งคำขอเบิกจาก main stock → T (main controller) อนุมัติ
--   • หน่วยจำกัด: cotton หรือ box เท่านั้น (rule: main เบิก Cotton/Box)
--   • Status: pending → approved | rejected | cancelled
--   • Approve = atomic: INSERT stock_transfers + UPDATE request (DB function)
-- =============================================================

-- ── 1) Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_withdrawal_requests (
  id                    SERIAL PRIMARY KEY,
  requester_id          UUID          NOT NULL,
  sku_id                VARCHAR(20)   NOT NULL REFERENCES public.skus(sku_id),
  unit                  VARCHAR(20)   NOT NULL
                          CHECK (unit IN ('cotton', 'box')),
  quantity              INTEGER       NOT NULL CHECK (quantity > 0),
  quantity_packs        INTEGER       NOT NULL CHECK (quantity_packs > 0),
  status                VARCHAR(20)   NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ,
  resolved_by           VARCHAR(100),
  resolved_transfer_id  INTEGER       REFERENCES public.stock_transfers(id) ON DELETE SET NULL,
  note                  TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swr_requester
  ON public.stock_withdrawal_requests(requester_id);

CREATE INDEX IF NOT EXISTS idx_swr_status
  ON public.stock_withdrawal_requests(status);

CREATE INDEX IF NOT EXISTS idx_swr_requested_at
  ON public.stock_withdrawal_requests(requested_at DESC);

COMMENT ON TABLE public.stock_withdrawal_requests
  IS 'คำขอเบิกจากสต็อกหลักโดย user (admin) · T เป็นคนอนุมัติ';

-- ── 2) RLS ───────────────────────────────────────────────────
ALTER TABLE public.stock_withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: ทุกคนที่ login เห็นได้ (user เห็นของตัวเอง · admin/T เห็นทั้งหมด)
DROP POLICY IF EXISTS swr_select_all ON public.stock_withdrawal_requests;
CREATE POLICY swr_select_all ON public.stock_withdrawal_requests
  FOR SELECT
  USING (TRUE);

-- INSERT: requester ต้อง = user ที่ login เท่านั้น (ส่งของตัวเอง)
DROP POLICY IF EXISTS swr_insert_self ON public.stock_withdrawal_requests;
CREATE POLICY swr_insert_self ON public.stock_withdrawal_requests
  FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- UPDATE: admin (T) approve/reject ได้ทุก rows · user cancel ของตัวเองได้ตอน pending
DROP POLICY IF EXISTS swr_update_admin_or_self_pending ON public.stock_withdrawal_requests;
CREATE POLICY swr_update_admin_or_self_pending ON public.stock_withdrawal_requests
  FOR UPDATE
  USING (
    public.is_admin()
    OR (requester_id = auth.uid() AND status = 'pending')
  );

-- DELETE: เฉพาะ admin (rare case · normal flow ใช้ status='cancelled')
DROP POLICY IF EXISTS swr_delete_admin ON public.stock_withdrawal_requests;
CREATE POLICY swr_delete_admin ON public.stock_withdrawal_requests
  FOR DELETE
  USING (public.is_admin());

-- ── 3) Atomic approve function ───────────────────────────────
-- รับ request_id + ข้อมูลที่ต้องสร้าง transfer · ทำ 2 อย่างใน transaction:
--   (a) INSERT stock_transfers row
--   (b) UPDATE request: status='approved' + resolved_transfer_id
-- ถ้าใด ๆ fail → rollback ทั้งคู่
CREATE OR REPLACE FUNCTION public.approve_withdrawal_request(
  p_request_id    INTEGER,
  p_lot_number    VARCHAR,
  p_resolved_by   VARCHAR
)
RETURNS public.stock_withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request   public.stock_withdrawal_requests;
  v_transfer_id INTEGER;
BEGIN
  -- Lock request row + verify still pending
  SELECT * INTO v_request
    FROM public.stock_withdrawal_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำขอ id=%', p_request_id;
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'คำขอ id=% สถานะ % ไม่ใช่ pending', p_request_id, v_request.status;
  END IF;

  -- INSERT stock_transfers (ไม่ตัดสต็อกเพิ่ม · main balance คำนวณจาก stock_in - transfers)
  INSERT INTO public.stock_transfers (
    sku_id, lot_number, to_user_id, unit, quantity, quantity_packs,
    transferred_at, note, created_by
  ) VALUES (
    v_request.sku_id,
    p_lot_number,
    v_request.requester_id,
    v_request.unit,
    v_request.quantity,
    v_request.quantity_packs,
    NOW(),
    COALESCE(v_request.note, '') || ' (อนุมัติคำขอ #' || p_request_id || ')',
    p_resolved_by
  )
  RETURNING id INTO v_transfer_id;

  -- UPDATE request → approved
  UPDATE public.stock_withdrawal_requests
    SET status               = 'approved',
        resolved_at          = NOW(),
        resolved_by          = p_resolved_by,
        resolved_transfer_id = v_transfer_id
    WHERE id = p_request_id
    RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

COMMENT ON FUNCTION public.approve_withdrawal_request(INTEGER, VARCHAR, VARCHAR)
  IS 'อนุมัติคำขอเบิก: สร้าง stock_transfers + update request → approved (atomic)';

-- ── 4) Verify ────────────────────────────────────────────────
-- SELECT id, sku_id, unit, quantity, status FROM stock_withdrawal_requests LIMIT 5;
-- SELECT proname FROM pg_proc WHERE proname = 'approve_withdrawal_request';
