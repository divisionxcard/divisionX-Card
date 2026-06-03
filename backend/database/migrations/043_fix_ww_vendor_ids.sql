-- =============================================================
-- Migration 043: แก้ vendor_id ตู้ WW ให้ตรง portal (042 อ่านเลขผิด)
-- =============================================================
-- migration 042 กรอก vendor_id ผิดตำแหน่งที่ 11 (อ่าน 0 เป็น 5) ทั้ง 3 ตู้
-- ทำให้ scraper ดึงข้อมูลไม่ได้:
--   - wwv02 → 0 slots (เดิม VCM350CKC20050001 เคย sync ได้ 55 slots)
--   - wwv03/wwv04 → "Access denied / Failed verification" (serial ไม่มีจริง)
--
-- ค่าจริงจาก WW portal machine list (ยืนยันด้วยตา + inventory % เต็ม):
--   wwv02 บางกะปิ  : VCM350CKC20050001  (Inventory 83%)
--   wwv03 ศาลายา   : VCM350CKC20070006  (Inventory 92%)
--   wwv04 เวสต์เกต  : VCM350CKC20120001  (Inventory 91%)
--   wwv01 รามอินทรา: VCM350CKC25090606  ← ถูกอยู่แล้ว (ขึ้นต้น 25 จริง) ไม่แตะ
--
-- บทเรียน: ยึด Machine ID ที่ copy เป็นตัวอักษรจาก portal · อย่าอ่านจากรูป
-- =============================================================

UPDATE machines SET config = jsonb_set(config, '{machine_id_vendor}', '"VCM350CKC20050001"') WHERE machine_id = 'wwv02';
UPDATE machines SET config = jsonb_set(config, '{machine_id_vendor}', '"VCM350CKC20070006"') WHERE machine_id = 'wwv03';
UPDATE machines SET config = jsonb_set(config, '{machine_id_vendor}', '"VCM350CKC20120001"') WHERE machine_id = 'wwv04';

-- ตรวจสอบ
-- SELECT machine_id, config->>'machine_id_vendor' AS vendor_id
-- FROM machines WHERE brand = 'worldwide' ORDER BY machine_id;
