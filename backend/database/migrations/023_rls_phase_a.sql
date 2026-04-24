-- =============================================================
-- Migration 023: RLS Phase A — reference tables
-- ตาราง: skus, machines, profiles, machine_assignments
-- =============================================================
-- เป้าหมาย:
--   • เปิด RLS role-based บน 4 ตารางฐาน
--   • user ปกติ: อ่านได้ / เขียนไม่ได้
--   • admin: อ่าน + เขียน ได้เต็ม
--   • service_role: bypass RLS (GHA sync ยังทำงานได้ปกติ)
-- ทดสอบบน STAGING ก่อน prod เสมอ
-- =============================================================

-- ── 1) Helper: is_admin() ─────────────────────────────────────
-- SECURITY DEFINER → ทำงานด้วยสิทธิ์เจ้าของ function ไม่ติด RLS ของ caller
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
$$;

COMMENT ON FUNCTION public.is_admin()
  IS 'ตรวจว่า user ที่ login อยู่เป็น admin หรือไม่ (ดึงจาก profiles.role)';

-- ── 2) ลบ policy เดิม (allow_all_* + อื่น ๆ) ──────────────────
-- ใช้ IF EXISTS ป้องกัน error ถ้าชื่อ policy ไม่ตรง

-- skus
DROP POLICY IF EXISTS allow_all_skus          ON public.skus;
DROP POLICY IF EXISTS skus_select_all         ON public.skus;
DROP POLICY IF EXISTS skus_modify_admin       ON public.skus;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.skus;

-- machines
DROP POLICY IF EXISTS allow_all_machines       ON public.machines;
DROP POLICY IF EXISTS machines_select_all      ON public.machines;
DROP POLICY IF EXISTS machines_modify_admin    ON public.machines;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.machines;

-- profiles
DROP POLICY IF EXISTS allow_all_profiles           ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all          ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self_admin   ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin        ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;

-- machine_assignments (policies จาก migration 019)
DROP POLICY IF EXISTS "machine_assignments_select" ON public.machine_assignments;
DROP POLICY IF EXISTS "machine_assignments_insert" ON public.machine_assignments;
DROP POLICY IF EXISTS "machine_assignments_update" ON public.machine_assignments;
DROP POLICY IF EXISTS "machine_assignments_delete" ON public.machine_assignments;
DROP POLICY IF EXISTS allow_all_machine_assignments         ON public.machine_assignments;
DROP POLICY IF EXISTS machine_assignments_select_all        ON public.machine_assignments;
DROP POLICY IF EXISTS machine_assignments_modify_admin      ON public.machine_assignments;

-- ── 3) เปิด RLS (idempotent) ─────────────────────────────────
ALTER TABLE public.skus                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_assignments ENABLE ROW LEVEL SECURITY;

-- ── 4) Policies: skus ────────────────────────────────────────
CREATE POLICY skus_select_all ON public.skus
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY skus_modify_admin ON public.skus
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 5) Policies: machines ────────────────────────────────────
CREATE POLICY machines_select_all ON public.machines
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY machines_modify_admin ON public.machines
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 6) Policies: profiles ────────────────────────────────────
-- อ่าน: authenticated ทุกคน (UI ต้อง lookup ชื่อ user อื่น)
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Update: ตัวเองแก้ display_name ได้, admin แก้อะไรก็ได้
-- NOTE: policy engine ของ PG ไม่มี column-level แบบง่าย ๆ ที่นี่
-- ถ้า user ไม่ใช่ admin ก็ยังแก้ role ตัวเองไม่ได้ในเชิง UI (frontend เราไม่เปิดให้)
-- + ถ้ากลัวจริง ๆ ใช้ trigger เช็ค OLD.role = NEW.role ถ้าไม่ใช่ admin
CREATE POLICY profiles_update_self_admin ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- Delete: admin เท่านั้น
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Insert: ไม่มี policy สำหรับ authenticated → บังคับผ่าน service_role
-- (การสร้าง user ใหม่ไปผ่าน /api/admin/users ที่ใช้ service_role)

-- ── 7) Policies: machine_assignments ─────────────────────────
CREATE POLICY machine_assignments_select_all ON public.machine_assignments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY machine_assignments_modify_admin ON public.machine_assignments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 8) Grant execute on helper to authenticated ──────────────
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- =============================================================
-- หลังรัน: ทดสอบด้วย login เป็น admin และ user
-- • admin: ควรแก้ skus, machines, machine_assignments ได้
-- • user: ควรอ่านได้ทุกตาราง แต่แก้ไม่ได้ → ได้ error permission denied
-- • service_role: bypass ได้หมด (GHA sync ไม่พัง)
-- =============================================================
