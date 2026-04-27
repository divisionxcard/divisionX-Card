-- =============================================================
-- Rollback Migration 024: ลบ username column ออกจาก profiles
-- =============================================================
-- ⚠ ระวัง: หลัง rollback ระบบจะกลับไปใช้ email login เท่านั้น
-- ใช้เฉพาะกรณี migration พังหรือต้องการย้อนกลับเท่านั้น
-- =============================================================

DROP INDEX IF EXISTS public.idx_profiles_username_unique;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS username;
