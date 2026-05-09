-- =============================================================
-- Migration 027: ปรับ note ใน approve_withdrawal_request — เพิ่มหน่วย/จำนวน
-- =============================================================
-- ปัจจุบัน note ใน stock_transfers จากการ approve คำขอ:
--   "(อนุมัติคำขอ #N)"
-- หลังแก้:
--   "(อนุมัติคำขอ #N · 1 กล่อง)" หรือ "(อนุมัติคำขอ #N · 2 ลัง)"
-- =============================================================

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
  v_request     public.stock_withdrawal_requests;
  v_transfer_id INTEGER;
  v_unit_label  TEXT;
  v_unit_text   TEXT;
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

  -- Map unit → ภาษาไทย
  v_unit_label := CASE v_request.unit
                    WHEN 'cotton' THEN 'ลัง'
                    WHEN 'box'    THEN 'กล่อง'
                    ELSE v_request.unit
                  END;
  v_unit_text := v_request.quantity || ' ' || v_unit_label;

  -- INSERT stock_transfers
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
    COALESCE(v_request.note, '') || ' (อนุมัติคำขอ #' || p_request_id || ' · ' || v_unit_text || ')',
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
  IS 'อนุมัติคำขอเบิก: สร้าง stock_transfers + update request → approved (atomic) · note มีหน่วย/จำนวน';
