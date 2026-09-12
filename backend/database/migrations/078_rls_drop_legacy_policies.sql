-- 078 · ล้าง policy เก่าที่ค้างอยู่ — ทำให้ 076 มีผลจริง
--
-- ═══ ปัญหาที่เจอตอนทดสอบ (12 ก.ย. 2026) ═══
-- รัน 076 + 077 แล้ว สร้างบัญชีทดสอบ role='marketing' ขึ้นมาจริง แล้วพบว่า
-- **ยังอ่าน sales / stock_in / login_history / claims ได้ครบ** และ
-- **เลื่อนขั้นตัวเองเป็น admin ได้ด้วย** — policy ใหม่เหมือนไม่มีผลเลย
--
-- สาเหตุ: PostgreSQL รวม policy แบบ PERMISSIVE ด้วย **OR**
-- ผ่านอันใดอันหนึ่งก็เข้าถึงได้ · 076 ลบเฉพาะ policy ชื่อ authenticated_full_access
-- (ของ migration 069) แต่ยังมีของเก่าค้างอยู่อีกสองชุดที่ไม่ได้ถูกแตะ:
--   • 023_rls_phase_a      → skus_select_all · machines_select_all ·
--                             profiles_select_all · profiles_update_self_admin ·
--                             machine_assignments_select_all ฯลฯ
--   • 053_rls_transactional → <ตาราง>_select_auth · <ตาราง>_write_auth
-- ทั้งหมดเขียน USING (true) ไว้ จึงเปิดประตูให้ทุกคนที่ล็อกอินตลอด
--
-- หลักฐานที่ชี้ชัด: ตารางที่สร้างทีหลัง (marketing_content · video_jobs) ไม่มี
-- policy เก่า จึงถูกกันได้ถูกต้องตั้งแต่แรก ส่วนตารางเก่าเปิดหมด
--
-- ═══ บทเรียนที่ควรจำ ═══
-- เพิ่ม policy ใหม่ไม่เคย "แทนที่" ของเก่า มันบวกเข้าไปเฉย ๆ
-- ถ้าจะจำกัดสิทธิ์ ต้องลบของเก่าให้หมดก่อนเสมอ แล้วตรวจด้วยบัญชีจริง
-- การอ่านไฟล์ migration อย่างเดียวไม่พอ เพราะไม่มีใครรู้ว่าฐานข้อมูลจริงมีอะไรค้างอยู่
--
-- ═══ ผลกับ role เดิม ═══
-- ไม่เปลี่ยน — 069 ให้ทุกคนที่ล็อกอินทำได้ทุกอย่างอยู่แล้ว การลบ policy เก่า
-- ที่เคยจำกัดการเขียนไว้ (เช่น skus_modify_admin) จึงไม่ได้ขยายสิทธิ์ใครเพิ่ม
-- เพราะ 069 ขยายไปก่อนแล้วด้วย OR
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run · รันซ้ำได้ไม่พัง

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  -- 1) ลบ policy ทั้งหมดใน schema public ทิ้งก่อน
  --    ไล่จาก pg_policies ไม่ใช่ไล่ตามชื่อที่เดาเอง — นี่คือรายการจริงของฐานข้อมูล
  --    ซึ่งเป็นสิ่งเดียวที่เชื่อได้ว่าครบ
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;

  -- 2) สร้างชุดเดียวให้ทุกตารางใน public (ไล่จาก pg_tables กันตกหล่นตารางใหม่)
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format($f$
      CREATE POLICY staff_full_access ON public.%I
        FOR ALL
        TO authenticated
        USING      (coalesce(public.current_app_role(), '') <> 'marketing')
        WITH CHECK (coalesce(public.current_app_role(), '') <> 'marketing')
    $f$, r.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.tablename);
  END LOOP;
END $$;

-- 3) ข้อยกเว้นเดียว: บัญชี marketing อ่านโปรไฟล์ตัวเองได้ (VideoStudio ใช้ตรวจ role)
--    SELECT อย่างเดียว — เขียนไม่ได้ จึงเลื่อนขั้นตัวเองไม่ได้
DROP POLICY IF EXISTS marketing_read_own ON public.profiles;
CREATE POLICY marketing_read_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

COMMIT;

-- ═══ ตรวจ ═══
-- 1) ต้องเหลือ policy ชื่อเดียวต่อตาราง (ยกเว้น profiles ที่มีสอง):
--      SELECT tablename, string_agg(policyname, ', ' ORDER BY policyname) AS policies
--      FROM pg_policies WHERE schemaname='public' GROUP BY tablename ORDER BY tablename;
--
-- 2) ทดสอบด้วยบัญชีจริงเท่านั้นจึงจะเชื่อได้ — อ่าน SQL อย่างเดียวไม่พอ
--    (รอบที่แล้วทุกอย่างดู "ถูก" ในไฟล์ แต่ของจริงยังเปิดอยู่)
