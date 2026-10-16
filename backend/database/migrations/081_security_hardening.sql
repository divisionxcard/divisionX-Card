-- =============================================================
-- Migration 081: ปิดช่องสิทธิ์ที่เจอจากการตรวจความปลอดภัย (16 ต.ค. 2026)
-- =============================================================
-- เจ้าของถาม: "ลูกค้าที่เป็นโปรแกรมเมอร์ เดาและเจาะเข้าหน้าเว็บหลักของเราได้ง่ายหรือไม่"
-- ตรวจแล้ว: คนนอกที่ไม่ล็อกอินอ่านตารางไม่ได้สักตาราง (ดีอยู่แล้ว) แต่มี 3 ช่องในฐานข้อมูล:
--
-- 1) staff_full_access เขียนแบบ "ห้ามแค่ marketing" (<> 'marketing')
--    = บัญชีที่ล็อกอินได้แต่ไม่มีบทบาท ได้สิทธิ์อ่าน/เขียน/ลบทุกตาราง
--    และหน้า Supabase เปิดให้สมัครสมาชิกเองอยู่ (disable_signup = false) → คนนอกสมัคร + ยืนยันอีเมลได้เมื่อไหร่ = เข้าถึงทั้งหมด
--    → เปลี่ยนเป็น "อนุญาตเฉพาะ admin กับ user"
--    ตรวจผู้ใช้จริงก่อนแก้ (16 ต.ค.): 6 บัญชี มีแถว profiles ครบ (admin 3 · user 2 · marketing 1) → ไม่มีใครถูกล็อกออก
--
-- 2) profiles อยู่ใต้ staff_full_access ด้วย → บัญชี user แก้ role ตัวเองเป็น admin ได้จาก DevTools
--    → ผ่านเว็บอ่านได้อย่างเดียว · สร้าง/แก้ผู้ใช้ทำผ่าน /api/admin/users ซึ่งใช้ service key (ข้าม RLS) อยู่แล้ว
--      หน้าจัดการผู้ใช้จึงทำงานเหมือนเดิม
--
-- 3) ฟังก์ชันใน schema public เรียกได้โดยไม่ต้องล็อกอิน (ค่าเริ่มต้นของ Postgres ให้ EXECUTE กับ PUBLIC)
--    approve_withdrawal_request เป็น SECURITY DEFINER (ข้าม RLS) ไม่ตรวจบทบาท → คนนอกอนุมัติคำขอเบิกได้
--    → ถอนสิทธิ์ anon ทั้ง schema + ฟังก์ชันอนุมัติตรวจบทบาทในตัว
--
-- นอกไฟล์นี้ (เจ้าของต้องทำเองในหน้า Supabase):
--    Authentication → Sign In / Providers → ปิด "Allow new users to sign up"
--    (สร้างบัญชีพนักงานใหม่ยังทำได้ที่หน้าจัดการผู้ใช้ในเว็บ — ใช้ auth.admin.createUser ไม่ผ่านการสมัครเอง)
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run · รันซ้ำได้ไม่พัง
-- หลังรัน: ล็อกอินด้วยบัญชี admin และ user จริงอย่างละครั้ง เปิดหน้าภาพรวม/สต็อก/ยอดขายให้ข้อมูลขึ้น
-- =============================================================

BEGIN;

-- ── 1. ทุกตาราง (ยกเว้น profiles): อนุญาตเฉพาะ admin / user ──
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_full_access', r.tablename);
    EXECUTE format($f$
      CREATE POLICY staff_full_access ON public.%I
        FOR ALL
        TO authenticated
        USING      ((SELECT public.current_app_role()) IN ('admin', 'user'))
        WITH CHECK ((SELECT public.current_app_role()) IN ('admin', 'user'))
    $f$, r.tablename);
  END LOOP;
END $$;

-- ── 2. profiles: พนักงานอ่านได้ · marketing อ่านแถวตัวเอง · ไม่มีใครเขียนผ่านเว็บ (ใช้ service key เท่านั้น) ──
DROP POLICY IF EXISTS staff_full_access ON public.profiles;
DROP POLICY IF EXISTS staff_read_profiles ON public.profiles;
CREATE POLICY staff_read_profiles ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT public.current_app_role()) IN ('admin', 'user'));

DROP POLICY IF EXISTS marketing_read_own ON public.profiles;
CREATE POLICY marketing_read_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- ── 3. ฟังก์ชัน: คนไม่ล็อกอินเรียกไม่ได้ (รวมฟังก์ชันที่สร้างในอนาคต) ──
-- authenticated ต้องคง EXECUTE ไว้ — policy ข้างบนเรียก current_app_role() ในสิทธิ์ของผู้ใช้
-- (ถอนจาก authenticated = ทุก policy พัง ทุกคนถูกล็อกออก)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- ── 4. อนุมัติคำขอเบิก: ตรวจบทบาทในตัว (SECURITY DEFINER ข้าม RLS — ด่านเดียวคือในฟังก์ชันเอง) ──
-- เนื้อฟังก์ชันเหมือน migration 027 ทุกบรรทัด เพิ่มแค่ด่านตรวจบทบาทบรรทัดแรก
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
  IF coalesce(public.current_app_role(), '') NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์อนุมัติคำขอเบิก' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.approve_withdrawal_request(INTEGER, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_withdrawal_request(INTEGER, VARCHAR, VARCHAR) TO authenticated, service_role;

COMMIT;

-- ═══ ตรวจหลังรัน ═══
-- 1) policy ใหม่ครบทุกตาราง (ต้องเห็น IN ('admin','user') ไม่ใช่ <> 'marketing'):
--    SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;
-- 2) anon เรียกฟังก์ชันไม่ได้แล้ว (ต้องเป็น false ทุกแถว):
--    SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';
-- 3) ล็อกอินบัญชี admin และ user จริง → หน้าภาพรวม/สต็อก/ยอดขายต้องมีข้อมูลขึ้นเหมือนเดิม
--
-- ═══ ถ้ามีปัญหา (ย้อนกลับ) ═══
-- รัน migration 079_rls_performance.sql ซ้ำ = กลับไปเป็น policy แบบเดิม (<> 'marketing') ทุกตารางรวม profiles
