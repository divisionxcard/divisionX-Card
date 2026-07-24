-- =============================================================
-- Migration 055: เพิ่มตู้ WorldWide wwv08 · เดอะมอลล์ไลฟ์สโตร์ บางกะปิ (ตู้ที่ 2) (ติดตั้ง 2026-07-23 คืนที่ผ่านมา)
-- =============================================================
-- ตู้ใหม่ใน WW portal (VCM350CKC25090603) — site เดียวกับ wwv02 (บางกะปิ) แต่คนละ vendor = ตู้ที่ 2
-- route: เขตบางกะปิ · site: เดอะมอลล์ไลฟ์สโตร์ บางกะปิ NEW · version SXA1B31R.THA251001.014
-- vendor_id copy จาก portal machine list โดยตรง (ตามภาพ portal 2026-07-24)
--
-- หมายเหตุ: บางกะปิ มี wwv02 (VCM350CKC20050001) อยู่แล้ว — wwv08 เป็นตู้เพิ่มที่ site เดียวกัน คนละ vendor
-- WorldWide เป็น data-driven — INSERT แล้ว sync อัตโนมัติ ไม่ต้องแก้ scraper
-- =============================================================

INSERT INTO machines (machine_id, name, location, status, brand, config)
VALUES (
  'wwv08',
  'ตู้ที่ 13 (wwv08) · เดอะมอลล์ไลฟ์สโตร์ บางกะปิ (2)',
  'เดอะมอลล์ไลฟ์สโตร์ บางกะปิ',
  'active',
  'worldwide',
  jsonb_build_object(
    'machine_id_vendor', 'VCM350CKC25090603',
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
