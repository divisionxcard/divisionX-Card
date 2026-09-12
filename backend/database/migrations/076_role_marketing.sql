-- 076 · สิทธิ์ใหม่ "marketing" — เห็นเฉพาะงานการตลาดและวิดีโอ ไม่เห็นข้อมูลธุรกิจเลย
--
-- ═══ โจทย์ ═══
-- เจ้าของเพิ่มผู้ใช้ใหม่ที่ทำงานการตลาดอย่างเดียว ต้องการให้เข้าได้แค่
-- /marketing กับ /video และ **ห้ามเห็นหน้าหลัก** (สต็อก ยอดขาย เคลม ผู้ใช้)
--
-- ═══ ทำไมซ่อนเมนูอย่างเดียวไม่พอ ═══
-- migration 069 เปิด RLS ด้วย policy "authenticated_full_access" คือ
-- **ใครล็อกอินได้ก็อ่านและเขียนได้ทุกตาราง** หน้าเว็บเป็นแค่สิ่งที่วาดให้ดู
-- ถ้ากันแค่ในหน้าเว็บ บัญชีการตลาดยังเปิด DevTools แล้วอ่าน sales / stock_in /
-- login_history (มี email + IP ของทุกคน) ได้ครบ เพราะ anon key อยู่ในหน้าเว็บอยู่แล้ว
-- ด่านจริงจึงต้องอยู่ที่ RLS · ส่วน API route คุมด้วย requireMarketing อีกชั้น
--
-- ═══ ทำไมปลอดภัยที่จะทำแบบนี้ ═══
-- ตรวจแล้วว่าหน้าที่บัญชีนี้ต้องใช้ ไม่ได้ query Supabase จากเบราว์เซอร์เลย:
--   • MarketingOS.jsx ใช้ supabase แค่ auth.getSession() — ข้อมูลทั้งหมดผ่าน API route
--   • VideoStudio.jsx ไม่มี supabase.from() เลย ใช้แค่ getProfile() อ่าน role ของตัวเอง
--   • API route ทุกตัวใช้ service key → ข้าม RLS อยู่แล้ว ไม่กระทบ
-- ฉะนั้นบัญชี marketing ต้องการสิทธิ์ตารางแค่ "อ่านโปรไฟล์ตัวเอง" ข้อเดียว
--
-- ═══ ผลกับ role เดิม ═══
-- admin กับ user ได้สิทธิ์เท่าเดิมทุกประการ (เงื่อนไขเป็นจริงเสมอสำหรับสองตัวนี้)
-- ผู้ใช้ที่ไม่มีแถวใน profiles ก็ยังเข้าได้เหมือนเดิม (coalesce กัน NULL ไว้)
--
-- ═══ วิธีรัน ═══
-- Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run · รันซ้ำได้ไม่พัง
-- ย้อนกลับ: 076_role_marketing_rollback.sql

BEGIN;

-- ── 1. ตัวอ่าน role ของคนที่กำลังเรียก ────────────────────────
--
-- security definer สำคัญสองเรื่อง:
--   1) มันอ่าน profiles เอง ถ้าไม่ข้าม RLS จะวนเรียกตัวเอง (policy ของ profiles
--      เรียกฟังก์ชัน → ฟังก์ชันอ่าน profiles → ชน policy เดิมอีกรอบ)
--   2) ต้องตรึง search_path ไม่งั้นคนสร้าง schema ซ้อนชื่อมาหลอกได้
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

-- ── 2. ทุกตารางธุรกิจ: ทุก role เหมือนเดิม ยกเว้น marketing ที่ถูกกันออก ──
--
-- ⚠️ coalesce กัน NULL: ถ้า role เป็น NULL แล้วเขียน role <> 'marketing' เฉย ๆ
--    ผลลัพธ์เป็น NULL ซึ่ง policy ถือว่าเท็จ = ล็อกผู้ใช้ที่ยังไม่มีแถว profiles ออกทั้งหมด
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_credit_readings', 'claims', 'login_history', 'machine_assignments',
    'machine_stock', 'machines', 'marketing_content', 'marketing_ideas',
    'post_metrics', 'refill_plans', 'sales', 'ship_fails', 'sku_aliases',
    'skus', 'slot_products_history', 'slot_refill_events',
    'slot_restock_sessions', 'stock_in', 'stock_out', 'stock_transfers',
    'stock_withdrawal_requests', 'video_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_full_access', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_full_access', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL
        TO authenticated
        USING      (coalesce(public.current_app_role(), '') <> 'marketing')
        WITH CHECK (coalesce(public.current_app_role(), '') <> 'marketing')
    $f$, 'staff_full_access', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ── 3. profiles — บัญชี marketing ต้องอ่านแถวของตัวเองได้ ────────
--
-- VideoStudio อ่าน role ของตัวเองตอนเปิดหน้า ถ้าอ่านไม่ได้จะค้างที่จอตรวจสิทธิ์
-- ให้อ่านได้เฉพาะแถวตัวเอง และ **แก้ไม่ได้** (เลื่อนขั้นตัวเองเป็น admin ไม่ได้)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON public.profiles;
DROP POLICY IF EXISTS staff_full_access         ON public.profiles;
DROP POLICY IF EXISTS marketing_read_own        ON public.profiles;

CREATE POLICY staff_full_access ON public.profiles
  FOR ALL TO authenticated
  USING      (coalesce(public.current_app_role(), '') <> 'marketing')
  WITH CHECK (coalesce(public.current_app_role(), '') <> 'marketing');

CREATE POLICY marketing_read_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

REVOKE ALL ON public.profiles FROM anon;

-- ── 4. view ── security_invoker ทำให้ view เดินตาม policy ของตารางข้างใต้
ALTER VIEW public.v_daily_sales   SET (security_invoker = on);
ALTER VIEW public.v_stock_balance SET (security_invoker = on);
REVOKE ALL ON public.v_daily_sales   FROM anon;
REVOKE ALL ON public.v_stock_balance FROM anon;

COMMIT;

-- ═══ ตรวจว่าได้ผลจริง ═══
-- 1) policy ครบทุกตาราง:
--      SELECT tablename, policyname FROM pg_policies
--      WHERE schemaname='public' ORDER BY tablename;
--    ทุกตารางต้องมี staff_full_access · profiles ต้องมี marketing_read_own ด้วย
--
-- 2) ทดสอบด้วยบัญชีจริง (วิธีที่เชื่อได้ที่สุด):
--      ตั้ง role ของบัญชีทดสอบเป็น 'marketing' แล้วล็อกอินในเบราว์เซอร์
--      เปิด DevTools console แล้วลอง:
--        await supabase.from('sales').select('*').limit(1)     → ต้องได้ []
--        await supabase.from('profiles').select('*')            → ต้องได้แถวตัวเองแถวเดียว
--      ถ้า sales คืนข้อมูลมา แปลว่า policy ไม่ทำงาน อย่าเพิ่งปล่อยให้ใช้จริง
--
-- 3) admin/user ต้องไม่กระทบ — เปิดหน้าหลักแล้วข้อมูลต้องขึ้นครบเหมือนเดิม
--
-- ═══ ที่ยังไม่ได้ทำ (ของเดิมจาก 069 ยังค้างอยู่) ═══
-- • login_history มี email/IP ของทุกคน — ผู้ใช้ role 'user' ยังอ่านได้อยู่
-- • profiles — role 'user' ยังแก้โปรไฟล์คนอื่นได้
-- สองข้อนี้ไม่เกี่ยวกับงานนี้โดยตรง แต่ควรเก็บในรอบถัดไป
