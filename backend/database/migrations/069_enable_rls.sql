-- 069 · เปิด Row Level Security ทุกตาราง — แก้ช่องโหว่ที่ Supabase แจ้งเตือน 23 ส.ค. 2026
--
-- ═══ ปัญหา ═══
-- ตรวจด้วย anon key (คีย์ที่ฝังอยู่ในหน้าเว็บ ใครเปิด DevTools ก็เห็น) พบว่า:
--   • อ่านได้ทั้ง 22 ตาราง โดยไม่ต้องล็อกอิน — รวม login_history 7,163 แถว
--     ที่มี email / ip_address / user_agent ของผู้ใช้ทุกคน
--   • **ลบข้อมูลได้** ทดสอบแล้ว 9 ตาราง รวม sales 29,295 แถว · skus · machines
--   • เพิ่มแถวปลอมเข้า login_history ได้
--
-- anon key ไม่ใช่ความลับโดยการออกแบบ Supabase ตั้งใจให้เปิดเผย
-- ความปลอดภัยต้องมาจาก RLS เท่านั้น ซึ่งไม่เคยถูกเปิดเลยตั้งแต่สร้างโปรเจกต์
--
-- ═══ ทำไมปลอดภัยที่จะเปิด ═══
-- ตรวจแล้วว่าไม่มีอะไรต้องพึ่งสิทธิ์ anon:
--   • หน้าสาธารณะ (/branches /products /how-to /marketing /design-system)
--     เป็น static ทั้งหมด ไม่ได้ query Supabase จากเบราว์เซอร์เลย
--   • การแปลง username → email ตอนล็อกอิน ไปผ่าน /api/auth/lookup-email
--     ซึ่งรันฝั่งเซิร์ฟเวอร์ด้วย service key อยู่แล้ว
--   • API route ทุกตัวใช้ service key → ข้าม RLS ไม่กระทบ
--   • scraper / GitHub Actions ใช้ service key → ไม่กระทบ
--
-- ═══ ขอบเขตของ migration นี้ ═══
-- ตั้งใจให้เท่ากับพฤติกรรมเดิม "ยกเว้นต้องล็อกอินก่อน" เพื่อไม่ให้เว็บพัง
-- ยังไม่แยกสิทธิ์ admin/user ในชั้น RLS — ตอนนี้แอปคุมด้วย requireAdmin
-- ในฝั่ง API และเงื่อนไขในหน้าเว็บ ถ้าจะรัดกุมกว่านี้ค่อยทำเป็น migration ถัดไป
-- (ดูหัวข้อ "ขั้นถัดไป" ท้ายไฟล์)
--
-- ═══ วิธีรัน ═══
-- Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่พัง (ใช้ DROP POLICY IF EXISTS ก่อน CREATE)

BEGIN;

-- ── 1. เปิด RLS + ให้สิทธิ์เฉพาะคนที่ล็อกอินแล้ว ──────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'claims', 'login_history', 'machine_assignments', 'machine_stock', 'machines',
    'marketing_content', 'marketing_ideas', 'post_metrics', 'profiles', 'sales',
    'ship_fails', 'sku_aliases', 'skus', 'slot_products_history',
    'slot_refill_events', 'slot_restock_sessions', 'stock_in', 'stock_out',
    'stock_transfers', 'stock_withdrawal_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- ลบ policy เดิมชื่อเดียวกันก่อน เพื่อให้รันซ้ำได้
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   'authenticated_full_access', t);

    -- คนที่ล็อกอินแล้วทำได้ทุกอย่างเหมือนเดิม · คนนอกทำอะไรไม่ได้เลย
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true)
    $f$, 'authenticated_full_access', t);

    -- ตัดสิทธิ์ระดับตารางของ anon ออกด้วย เป็นเกราะชั้นที่สอง
    -- ถ้าวันหน้าใครเผลอ disable RLS ตารางไหน anon ก็ยังแตะไม่ได้
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ── 2. View — RLS ไม่มีผลกับ view โดยตรง ต้องจัดการต่างหาก ────
-- view ถูกสร้างโดย postgres จึงรันด้วยสิทธิ์เจ้าของ (security definer)
-- แปลว่ามันข้าม RLS ของตารางข้างใต้ไปเลย → ต้องสั่งให้ใช้สิทธิ์ผู้เรียกแทน
ALTER VIEW public.v_daily_sales   SET (security_invoker = on);
ALTER VIEW public.v_stock_balance SET (security_invoker = on);
REVOKE ALL ON public.v_daily_sales   FROM anon;
REVOKE ALL ON public.v_stock_balance FROM anon;

COMMIT;

-- ═══ ตรวจว่าได้ผลจริง ═══
-- รันในเครื่อง:  py -3 deploy/scraper/rls_check.py
-- ต้องได้ "อ่านได้โดยไม่ต้องล็อกอิน 0 ตาราง"
--
-- หรือเช็กใน SQL Editor:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' ORDER BY rowsecurity, tablename;
--   -- rowsecurity ต้องเป็น true ทุกแถว
--
-- ═══ ขั้นถัดไป (ยังไม่ทำใน migration นี้) ═══
-- 1. login_history มี email/IP ของทุกคน — ควรให้เฉพาะ admin อ่าน
--    ตอนนี้ผู้ใช้ทั่วไปที่ล็อกอินแล้วยังอ่านได้หมด
-- 2. profiles — ผู้ใช้ทั่วไปยังแก้โปรไฟล์คนอื่นได้ ควรจำกัดเป็น
--    "แก้ของตัวเองได้ · admin แก้ของทุกคนได้"
-- 3. ตารางที่เป็นข้อมูลอ่านอย่างเดียวสำหรับผู้ใช้ทั่วไป (sales, skus, machines)
--    ควรแยก policy อ่าน/เขียน ไม่ใช่ FOR ALL
-- ทั้ง 3 ข้อต้องดูว่าหน้าไหนใช้อะไรก่อน ไม่งั้นเว็บพังแบบไล่หายาก
