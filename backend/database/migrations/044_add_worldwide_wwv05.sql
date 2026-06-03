-- =============================================================
-- Migration 044: เพิ่มตู้ WorldWide wwv05 · ยานนาวา (เตรียมติดตั้ง)
-- =============================================================
-- ตู้ที่ 5 ใน WW portal (VCM350CKC23050301) — เตรียมไว้กำลังจะติดตั้ง
-- route: ยานนาวา · site portal = "WorldWide Vending" (ชื่อ default · รอชื่อจริง)
-- vendor_id copy จาก portal machine list โดยตรง (ไม่ได้อ่านจากรูป)
--
-- WorldWide เป็น data-driven — INSERT แล้ว sync อัตโนมัติ ไม่ต้องแก้ scraper
-- =============================================================

INSERT INTO machines (machine_id, name, location, status, brand, config)
VALUES (
  'wwv05',
  'ตู้ที่ 9 (wwv05) · ยานนาวา',
  'ยานนาวา',
  'active',
  'worldwide',
  jsonb_build_object(
    'machine_id_vendor', 'VCM350CKC23050301',
    'version', 'SXA1B31R.THA230915.013',
    'portal_url', 'https://www.worldwidevending-vms.com',
    'integration_status', 'pending_api_doc'
  )
)
ON CONFLICT (machine_id) DO UPDATE
SET brand    = EXCLUDED.brand,
    config   = EXCLUDED.config,
    location = EXCLUDED.location,
    name     = EXCLUDED.name,
    status   = EXCLUDED.status;
