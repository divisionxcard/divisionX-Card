-- =============================================================
-- Migration 042: เพิ่มตู้ WorldWide ใหม่ 2 ตู้ (wwv03, wwv04)
--                + แก้ vendor_id ของ wwv02 ที่พิมพ์ผิด
-- =============================================================
-- ตู้ใหม่ติดตั้ง 2026-06-02:
--   wwv03 · เซ็นทรัล ศาลายา   (route: สามพราน) · VCM350CKC25070006
--   wwv04 · เซ็นทรัล เวสต์เกต  (route: บางใหญ่)  · VCM350CKC25120001
--
-- ระบบ WorldWide เป็น data-driven — scraper อ่านตู้จากตาราง machines
-- (brand='worldwide') โดยตรง · INSERT แถวนี้แล้ว sync ดึงข้อมูลอัตโนมัติ
-- ไม่ต้องแก้โค้ด scraper (ต่างจาก VMS ที่ต้องแก้ KIOSKS dict)
--
-- หมายเหตุ wwv02: vendor_id เดิม 'VCM350CKC20050001' พิมพ์ผิด
--   portal จริงคือ 'VCM350CKC25050001' (ตำแหน่งที่ 11: 0 → 5)
--   ทำให้ scraper ดึงข้อมูล wwv02 ไม่ได้ · แก้ในไฟล์นี้พร้อมกัน
-- =============================================================

-- ── 1) เพิ่มตู้ใหม่ wwv03 · เซ็นทรัล ศาลายา ──────────────────
INSERT INTO machines (machine_id, name, location, status, brand, config)
VALUES (
  'wwv03',
  'ตู้ที่ 7 (wwv03) · เซ็นทรัล ศาลายา',
  'เซ็นทรัล ศาลายา',
  'active',
  'worldwide',
  jsonb_build_object(
    'machine_id_vendor', 'VCM350CKC25070006',
    'version', 'SXA1B31F.THA230915.013',
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

-- ── 2) เพิ่มตู้ใหม่ wwv04 · เซ็นทรัล เวสต์เกต ────────────────
INSERT INTO machines (machine_id, name, location, status, brand, config)
VALUES (
  'wwv04',
  'ตู้ที่ 8 (wwv04) · เซ็นทรัล เวสต์เกต',
  'เซ็นทรัล เวสต์เกต',
  'active',
  'worldwide',
  jsonb_build_object(
    'machine_id_vendor', 'VCM350CKC25120001',
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

-- ── 3) แก้ vendor_id ของ wwv02 (พิมพ์ผิด → ตรง portal) ───────
UPDATE machines
SET config = jsonb_set(config, '{machine_id_vendor}', '"VCM350CKC25050001"')
WHERE machine_id = 'wwv02'
  AND config->>'machine_id_vendor' = 'VCM350CKC20050001';

-- ── ตรวจสอบผล ───────────────────────────────────────────────
-- SELECT machine_id, name, status, config->>'machine_id_vendor' AS vendor_id
-- FROM machines WHERE brand = 'worldwide' ORDER BY machine_id;
