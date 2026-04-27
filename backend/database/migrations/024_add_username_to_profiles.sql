-- =============================================================
-- Migration 024: เพิ่ม username column ใน profiles
-- =============================================================
-- เป้าหมาย:
--   • ให้ user login ด้วย username (สั้น/จำง่าย) แทน email ยาว ๆ
--   • เก็บ email จริงไว้ใช้ reset password
--   • Login flow: lookup email จาก username → signInWithPassword
--   • RLS: authenticated read ได้ (เพื่อให้ lookup-email API ใช้ได้)
-- หลัง apply migration นี้ → backfill username ของ user ที่มีอยู่
-- =============================================================

-- ── 1) เพิ่ม column ──────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- ── 2) Constraint: lowercase + alphanumeric/underscore + 3-20 ตัว ──
-- รองรับ a-z, 0-9, _ เท่านั้น (กัน special chars / space / Thai)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');

-- ── 3) UNIQUE index (case-insensitive โดย enforce lowercase ที่ check) ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique
  ON public.profiles(username)
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username
  IS 'ชื่อผู้ใช้สำหรับ login (lowercase, a-z 0-9 _, 3-20 ตัว) · UNIQUE · NULL = ยังไม่ตั้ง';

-- ── 4) Backfill (manual) ─────────────────────────────────────
-- หลัง apply: เลือกอย่างใดอย่างหนึ่ง
--   (a) Auto-generate จาก email prefix:
--       UPDATE public.profiles
--       SET username = lower(regexp_replace(split_part(p.email, '@', 1), '[^a-z0-9_]', '_', 'g'))
--       FROM auth.users p WHERE profiles.id = p.id AND profiles.username IS NULL;
--   (b) ตั้งเองทีละคนผ่านหน้า "จัดการผู้ใช้"
-- ⚠ ถ้า auto-generate แล้วซ้ำ → ต้อง resolve manual

-- ── 5) Verify ────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles' AND column_name='username';
-- SELECT conname FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_username_format';
-- SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='profiles' AND indexname='idx_profiles_username_unique';
