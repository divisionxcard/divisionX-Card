-- =============================================================
-- Migration 040: Fix typo "เซนทรัล" → "เซ็นทรัล"
-- ตู้ที่ 2 (chukes02) "เซนทรัลพระราม2" และ
-- ตู้ที่ 4 (chukes04) "เซนทรัลชลบุรี" เขียนผิด ขาดวรรณยุกต์ ็
-- =============================================================

UPDATE machines
SET
  name     = REPLACE(name,     'เซนทรัล', 'เซ็นทรัล'),
  location = REPLACE(location, 'เซนทรัล', 'เซ็นทรัล'),
  updated_at = NOW()
WHERE name LIKE '%เซนทรัล%' OR location LIKE '%เซนทรัล%';

-- ตรวจสอบผลลัพธ์
SELECT machine_id, name, location FROM machines WHERE machine_id IN ('chukes02', 'chukes04');
