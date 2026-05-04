-- =============================================================
-- Cutoff Re-Seed · Pre-Step: Rename T's username
-- =============================================================
-- รัน "ก่อนเที่ยงคืน 5 พ.ค." (หรือก่อนเริ่ม cutoff)
-- ถ้าเคย rename ใน profiles ไปแล้ว · skip ไฟล์นี้ได้
--
-- ⚠ ต้องเช็คว่า DB จริงเป็น project prod (xethnqqmpvlpmafvphky)
-- =============================================================

BEGIN;

-- เช็คก่อนว่า user เก่ายังอยู่
DO $$
DECLARE
  v_old_exists BOOLEAN;
  v_new_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM profiles WHERE username = 'pornthep_sm1991') INTO v_old_exists;
  SELECT EXISTS(SELECT 1 FROM profiles WHERE username = 'tueza5432')       INTO v_new_exists;

  IF v_new_exists AND NOT v_old_exists THEN
    RAISE NOTICE 'Skip: rename ทำไปแล้ว (tueza5432 มี · pornthep_sm1991 ไม่มี)';
    RETURN;
  END IF;

  IF v_new_exists AND v_old_exists THEN
    RAISE EXCEPTION 'Conflict: มีทั้ง pornthep_sm1991 + tueza5432 · ต้องตรวจสอบ manual';
  END IF;

  IF NOT v_old_exists AND NOT v_new_exists THEN
    RAISE EXCEPTION 'Error: ทั้ง pornthep_sm1991 + tueza5432 ไม่มีใน profiles';
  END IF;

  UPDATE profiles SET username = 'tueza5432' WHERE username = 'pornthep_sm1991';
  RAISE NOTICE 'Renamed pornthep_sm1991 → tueza5432';
END $$;

COMMIT;
-- ROLLBACK;
