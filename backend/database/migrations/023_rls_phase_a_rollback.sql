-- =============================================================
-- Rollback 023: กลับเป็น allow_all บน 4 ตารางฐาน
-- ใช้เมื่อ Phase A ทำให้หน้าเว็บพัง
-- =============================================================
-- รัน SQL นี้เพื่อเปลี่ยน policy ให้ allow ทุกคนทำทุกอย่าง (เหมือนก่อน Phase A)
-- NOTE: ไม่ได้ลบ is_admin() function — เผื่อจะใช้ต่อใน phase ถัดไป
-- =============================================================

-- ── ลบ policy Phase A ─────────────────────────────────────────
DROP POLICY IF EXISTS skus_select_all                ON public.skus;
DROP POLICY IF EXISTS skus_modify_admin              ON public.skus;
DROP POLICY IF EXISTS machines_select_all            ON public.machines;
DROP POLICY IF EXISTS machines_modify_admin          ON public.machines;
DROP POLICY IF EXISTS profiles_select_all            ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self_admin     ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin          ON public.profiles;
DROP POLICY IF EXISTS machine_assignments_select_all   ON public.machine_assignments;
DROP POLICY IF EXISTS machine_assignments_modify_admin ON public.machine_assignments;

-- ── กลับเป็น allow_all (เหมือนสถานะก่อน Phase A) ──────────────
CREATE POLICY allow_all_skus ON public.skus
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY allow_all_machines ON public.machines
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY allow_all_profiles ON public.profiles
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY allow_all_machine_assignments ON public.machine_assignments
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================
-- หลังรัน: ระบบกลับเป็นแบบเดิม (ทุกคนทำอะไรก็ได้)
-- ถ้าจะลอง Phase A ใหม่ → รัน 023_rls_phase_a.sql อีกรอบ
-- =============================================================
