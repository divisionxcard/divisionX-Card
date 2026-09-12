-- 077 · เปิดให้ profiles.role เป็น 'marketing' ได้
--
-- ต้องรันคู่กับ 076 — ถ้ารันแต่ 076 แล้วไปตั้ง role เป็น marketing จะโดนปฏิเสธ
--   ERROR 23514: new row for relation "profiles" violates check constraint "profiles_role_check"
-- เพราะ constraint เดิมอนุญาตแค่ 'admin' กับ 'user'
--
-- ⚠️ ไม่รวมไว้ใน 076 เพราะตอนเขียน 076 ยังไม่รู้ว่ามี constraint นี้อยู่
--    (รู้ตอนทดสอบจริงด้วยการสร้างบัญชีทดสอบแล้วโดนปฏิเสธ)
--
-- ⚠️ ถ้ามี role อื่นเพิ่มอีกในอนาคต ต้องมาแก้ที่นี่ด้วย ไม่ใช่แค่ในโค้ด —
--    ไม่งั้นจะเจออาการ "ตั้งค่าในหน้าเว็บแล้วเงียบ ๆ ไม่เปลี่ยน" ซึ่งไล่หายาก
--    รายชื่อ role ฝั่งโค้ดอยู่ที่ deploy/lib/apiAuth.js → ROLES
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run · รันซ้ำได้ไม่พัง

BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'user', 'marketing'));

COMMIT;

-- ตรวจ:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_role_check';
--   -- ต้องเห็น marketing อยู่ในรายการ
