-- ย้อนกลับ 076 — คืนสภาพเป็นแบบ 069 (ใครล็อกอินได้ก็ทำได้ทุกอย่าง)
--
-- ⚠️ รันแล้วบัญชี role 'marketing' จะกลับมาอ่าน/เขียนได้ทุกตารางทันที
--    ใช้เฉพาะตอนที่ policy ใหม่ทำให้เว็บพังและต้องรีบกู้เท่านั้น
--    ถ้ารัน ให้เปลี่ยน role ของบัญชีการตลาดเป็นอย่างอื่นไปก่อนด้วย

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_credit_readings', 'claims', 'login_history', 'machine_assignments',
    'machine_stock', 'machines', 'marketing_content', 'marketing_ideas',
    'post_metrics', 'profiles', 'refill_plans', 'sales', 'ship_fails',
    'sku_aliases', 'skus', 'slot_products_history', 'slot_refill_events',
    'slot_restock_sessions', 'stock_in', 'stock_out', 'stock_transfers',
    'stock_withdrawal_requests', 'video_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_full_access', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'marketing_read_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_full_access', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    $f$, 'authenticated_full_access', t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.current_app_role();

COMMIT;
