-- =============================================================
-- STAGING ONLY — สร้าง public.profiles table
-- =============================================================
-- Prod ไม่ต้องรันไฟล์นี้ (prod มี profiles อยู่แล้วจาก Supabase auto-setup)
-- Staging ต้องรันก่อน migrations อื่น ๆ ที่ reference user_id
-- =============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  display_name  TEXT,
  role          TEXT         NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Trigger: เมื่อ user signup ใหม่ใน auth.users → สร้าง profiles row อัตโนมัติ
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- backfill: สร้าง profile สำหรับ auth.users ที่มีอยู่แล้ว (ถ้ามี)
INSERT INTO public.profiles (id, email, display_name)
SELECT id, email, split_part(email, '@', 1)
FROM auth.users
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.profiles IS 'User profiles — mirror of auth.users + role';
