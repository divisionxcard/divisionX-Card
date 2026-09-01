-- ═══════════════════════════════════════════════════════════════
-- Migration 074: ปิดสิทธิ์ anon ให้ตารางที่สร้างหลัง 069
-- 2026-09-01
--
-- เจอได้ยังไง: หลังรัน 073 แล้วยิง deploy/scraper/rls_check.py (ตัวเฝ้าของโปรเจกต์เอง)
-- มันฟ้อง 2 ตาราง — ตัวที่เพิ่งสร้าง และตัวที่สร้างไว้ตั้งแต่ 28 ส.ค.
--
--     ai_credit_readings   🔴 อ่านได้ · ลบได้     ← migration 070
--     refill_plans         🔴 อ่านได้ · ลบได้     ← migration 073
--
-- ต้นเหตุ: migration 070 (และ 073 ที่ลอกแบบมา) เปิด RLS + สร้าง policy
-- แต่ **ไม่ได้ REVOKE สิทธิ์ของ anon** ซึ่งเป็นด่านจริงที่ 069 ใช้
--
-- ⚠️ ทำไม RLS อย่างเดียวไม่พอ:
--    RLS + ไม่มี policy สำหรับ anon → SELECT คืน **200 ว่าง ๆ** ไม่ใช่ error
--    และ DELETE คืน 204 (ลบไม่โดนอะไร แต่ผ่านด่านสิทธิ์)
--    ข้อมูลยังไม่รั่วก็จริง แต่เหลือด่านชั้นเดียว — วันไหนมีใครเผลอสร้าง policy
--    ที่กว้างไป หรือ RLS ถูกปิด ตารางจะเปิดโล่งทันทีโดยไม่มีอะไรกั้น
--    ส่วน REVOKE ทำให้ anon ไม่มีสิทธิ์ตั้งแต่ระดับ GRANT (ตอบ 401/403 ไปเลย)
--
-- 📋 แม่แบบสำหรับตารางใหม่ทุกตารางหลังจากนี้ — ต้องมีครบ 3 อย่าง:
--       ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
--       CREATE POLICY authenticated_full_access ON public.<t> FOR ALL TO authenticated ...;
--       REVOKE ALL ON public.<t> FROM anon;      ← ตัวที่ลืมกันบ่อยที่สุด
--    แล้วรัน `py deploy/scraper/rls_check.py` ยืนยันว่าขึ้น 🟢 บล็อก ทั้งอ่านและลบ
-- ═══════════════════════════════════════════════════════════════

REVOKE ALL ON public.refill_plans       FROM anon;
REVOKE ALL ON public.ai_credit_readings FROM anon;

-- กันลืมรอบหน้า: ไล่ปิดทุกตารางใน public ที่ anon ยังมีสิทธิ์อยู่
-- (idempotent · รันซ้ำได้ · ตารางที่ปิดไปแล้วจะไม่มีอะไรเปลี่ยน)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT DISTINCT table_name
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    RAISE NOTICE 'revoked anon on %', t;
  END LOOP;
END $$;

-- ═══ Verify ═══
-- ต้องคืน 0 แถว
SELECT DISTINCT table_name
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
ORDER BY table_name;
