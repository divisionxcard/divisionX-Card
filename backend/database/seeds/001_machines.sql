-- =============================================================
-- Seed: ข้อมูลตู้จำหน่าย (3 ตู้เริ่มต้น)
-- =============================================================

INSERT INTO machines (machine_id, name, location, status) VALUES
  ('machine_1', 'ตู้ที่ 1', 'สาขาหลัก', 'active'),
  ('machine_2', 'ตู้ที่ 2', 'สาขาหลัก', 'active'),
  ('machine_3', 'ตู้ที่ 3', 'สาขาหลัก', 'active')
ON CONFLICT (machine_id) DO NOTHING;
