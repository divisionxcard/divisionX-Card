-- 079 · แก้ RLS ที่ทำให้เว็บช้าลง 4 เท่า
--
-- ═══ อาการ ═══
-- หลังรัน 076-078 เจ้าของแจ้งว่าหน้าเว็บค้างที่ "กำลังโหลดข้อมูล…" หลายวินาที
-- วัดจริง (ดึง sales ตั้งแต่ 1 พ.ค. = 26,049 แถว · 27 หน้า แบบที่หน้าเว็บทำ):
--     ผ่าน RLS ด้วยสิทธิ์ผู้ใช้จริง   35.6 วินาที
--     service key (ข้าม RLS)          9.2 วินาที
-- ต่างกัน 26 วินาที = ค่า RLS ล้วน ๆ
--
-- ═══ สาเหตุ ═══
-- policy เขียนว่า USING (coalesce(public.current_app_role(), '') <> 'marketing')
-- PostgreSQL เรียกฟังก์ชันนี้ **ทีละแถว** ไม่ใช่ครั้งเดียวต่อ query
-- แม้ฟังก์ชันจะประกาศ STABLE ก็ตาม — 26,049 แถว = เรียก 26,049 ครั้ง
-- และแต่ละครั้งคือ SELECT ไปที่ profiles อีกที
--
-- ═══ วิธีแก้ ═══
-- ห่อด้วย (SELECT ...) ให้กลายเป็น InitPlan → Postgres คำนวณครั้งเดียวต่อ query
-- แล้วเอาผลไปใช้กับทุกแถว · เป็นวิธีมาตรฐานที่ Supabase แนะนำสำหรับ RLS
-- ใช้กับ auth.uid() ด้วยเหตุผลเดียวกัน
--
--     ก่อน:  USING (coalesce(public.current_app_role(), '') <> 'marketing')
--     หลัง:  USING ((SELECT coalesce(public.current_app_role(), '')) <> 'marketing')
--
-- ⚠️ ผลลัพธ์เชิงสิทธิ์เหมือนเดิมทุกประการ — เปลี่ยนแค่ "เรียกกี่ครั้ง"
--    ต้องทดสอบสิทธิ์ซ้ำหลังรันอยู่ดี เพราะ policy ถูกเขียนใหม่ทั้งชุด
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run · รันซ้ำได้ไม่พัง

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_full_access', r.tablename);
    EXECUTE format($f$
      CREATE POLICY staff_full_access ON public.%I
        FOR ALL
        TO authenticated
        USING      ((SELECT coalesce(public.current_app_role(), '')) <> 'marketing')
        WITH CHECK ((SELECT coalesce(public.current_app_role(), '')) <> 'marketing')
    $f$, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS marketing_read_own ON public.profiles;
CREATE POLICY marketing_read_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

COMMIT;

-- ═══ ตรวจ ═══
-- 1) เวลาโหลดต้องกลับมาใกล้ค่า service key (~9-12 วินาทีสำหรับ 26,000 แถว)
-- 2) สิทธิ์ต้องยังกันได้เหมือนเดิม — ทดสอบด้วยบัญชีจริงซ้ำอีกรอบ
--
-- ═══ หมายเหตุเรื่องความเร็วที่แท้จริง ═══
-- ต่อให้แก้ข้อนี้แล้ว หน้าแรกก็ยังดึง sales 26,000 แถวทีละ 1,000 = 27 รอบ
-- ซึ่งใช้เวลา ~9 วินาทีอยู่ดี · การแก้ที่ต้นเหตุจริงคือ **ไม่ต้องดึงทั้งหมด**
-- (ให้ฐานข้อมูลสรุปยอดมาให้ หรือจำกัดช่วงวันของหน้าแรก) — เป็นงานคนละชิ้น
