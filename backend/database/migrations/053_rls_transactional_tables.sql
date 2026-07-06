-- =============================================================
-- Migration 053: RLS ตารางธุรกรรม (ปิดช่องอ่าน/เขียนผ่าน anon key)
-- ตาราง: sales, stock_in, stock_out, claims, machine_stock, login_history
-- =============================================================
-- ⚠ สำคัญ: ต้องทดสอบบน STAGING ก่อน prod เสมอ
--
-- ปัญหาที่แก้:
--   anon key ถูกฝังในบันเดิลเบราว์เซอร์ (public) และตารางเหล่านี้ยังไม่เปิด RLS
--   → ใครก็อ่าน/เขียนข้อมูลยอดขาย-สต็อกตรงผ่าน Supabase REST ได้
--
-- แนวทาง (ปลอดภัยและไม่ทำแอปพัง):
--   • เปิด RLS
--   • authenticated (login แล้ว): อ่าน/เขียนได้ (แอปใช้ session ของผู้ใช้ที่ login)
--   • anon (ไม่ได้ login): เข้าไม่ได้เลย
--   • service_role (GHA sync): bypass RLS อยู่แล้ว → ทำงานปกติ
--
-- หมายเหตุ: ถ้าต้องการเข้มขึ้น (เขียนได้เฉพาะ admin) ให้เปลี่ยน
--   WITH CHECK (true) → WITH CHECK (public.is_admin()) หลังทดสอบว่า
--   flow เขียนของ user ปกติ (เช่น เบิกของ) ไม่ต้องใช้สิทธิ์เขียนตารางนั้น
-- =============================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['sales','stock_in','stock_out','claims','machine_stock','login_history'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- ข้ามถ้าตารางไม่มี (กัน error ระหว่าง environment ต่างกัน)
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip: table % not found', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- ลบ policy เดิมที่อาจเปิดกว้าง
    EXECUTE format('DROP POLICY IF EXISTS allow_all_%I ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_auth ON public.%I', t, t);

    -- อ่านได้เฉพาะผู้ที่ login
    EXECUTE format(
      'CREATE POLICY %I_select_auth ON public.%I FOR SELECT TO authenticated USING (true)',
      t, t);

    -- เขียนได้เฉพาะผู้ที่ login (anon เขียนไม่ได้)
    EXECUTE format(
      'CREATE POLICY %I_write_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t);
  END LOOP;
END $$;

-- ── ตรวจสอบหลังรัน ────────────────────────────────────────────
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('sales','stock_in','stock_out','claims','machine_stock','login_history');
-- ทุกแถวควรได้ relrowsecurity = true
