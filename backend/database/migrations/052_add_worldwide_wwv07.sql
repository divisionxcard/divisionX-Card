-- =============================================================
-- Migration 052: เพิ่มตู้ WorldWide wwv07 · เซ็นทรัล เวสต์วิลล์ (ติดตั้ง 2026-06-20 คืนนี้)
-- =============================================================
-- ตู้ใหม่ใน WW portal (VCM650CKC19030004) — กำลังติดตั้งคืนนี้
-- route: บางกรวย · site: เซ็นทรัล เวสต์วิลล์ · version SXA1B31R.THA251001.014
-- หมายเหตุ: vendor prefix เป็น VCM650 (ต่างจากตู้อื่น VCM350) — ไม่กระทบ scraper ใช้ค่าตรงจาก portal
--
-- WorldWide เป็น data-driven — INSERT แล้ว sync อัตโนมัติ ไม่ต้องแก้ scraper
-- =============================================================

INSERT INTO machines (machine_id, name, location, status, brand, config)
VALUES (
  'wwv07',
  'ตู้ที่ 11 (wwv07) · เซ็นทรัล เวสต์วิลล์',
  'เซ็นทรัล เวสต์วิลล์',
  'active',
  'worldwide',
  jsonb_build_object(
    'machine_id_vendor', 'VCM650CKC19030004',
    'version', 'SXA1B31R.THA251001.014',
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
