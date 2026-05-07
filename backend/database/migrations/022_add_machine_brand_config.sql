-- =============================================================
-- Migration 022: เพิ่ม brand + config ใน machines (multi-brand support)
-- =============================================================
-- เพื่อรองรับตู้ยี่ห้ออื่นที่ไม่ใช่ VMS (inboxcorp)
-- ตู้แรก: WorldWide Vending · ห้างเซ็นทรัล รามอินทรา (wwv01)
--
-- brand:
--   - 'vms'       = inboxcorp VMS (chukes01-04)
--   - 'worldwide' = WorldWide Vending (wwv01)
--
-- config (JSONB):
--   vms:       (placeholder · ใช้ hardcoded KIOSKS ใน scraper)
--   worldwide: { machine_id_vendor, version, portal_url, integration_status }
-- =============================================================

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'vms';

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';

-- Insert ตู้ใหม่ wwv01 (WorldWide Vending)
INSERT INTO machines (machine_id, name, location, status, brand, config)
VALUES (
  'wwv01',
  'ตู้ที่ 5 (wwv01) · เซ็นทรัล รามอินทรา',
  'เซ็นทรัล รามอินทรา',
  'active',
  'worldwide',
  jsonb_build_object(
    'machine_id_vendor', 'VCM350CKC25090606',
    'version', 'SXA1B31R.THA251001.014',
    'portal_url', 'https://www.worldwidevending-vms.com',
    'integration_status', 'pending_api_doc'
  )
)
ON CONFLICT (machine_id) DO UPDATE
SET brand = EXCLUDED.brand,
    config = EXCLUDED.config,
    location = EXCLUDED.location,
    name = EXCLUDED.name;
