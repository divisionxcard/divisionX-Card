-- =============================================================
-- Migration 050: เพิ่มตู้ WorldWide wwv06 · เซ็นทรัล พระราม 2 (ติดตั้ง 2026-06-19 คืนนี้)
-- =============================================================
-- ตู้ใหม่ใน WW portal (VCM350CKC24081204) — กำลังติดตั้งคืนนี้
-- route: บางขุนเทียน · site: เซ็นทรัล พระราม 2 · version SXA1B31R.THA251001.014
-- vendor_id copy จาก portal machine list โดยตรง (ตามภาพ portal)
--
-- หมายเหตุ: ที่ เซ็นทรัล พระราม 2 มีตู้ VMS chukes02 อยู่แล้ว — wwv06 เป็นคนละ vendor (WorldWide) อยู่ร่วมกันได้
-- WorldWide เป็น data-driven — INSERT แล้ว sync อัตโนมัติ ไม่ต้องแก้ scraper
-- =============================================================

INSERT INTO machines (machine_id, name, location, status, brand, config)
VALUES (
  'wwv06',
  'ตู้ที่ 10 (wwv06) · เซ็นทรัล พระราม 2',
  'เซ็นทรัล พระราม 2',
  'active',
  'worldwide',
  jsonb_build_object(
    'machine_id_vendor', 'VCM350CKC24081204',
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
