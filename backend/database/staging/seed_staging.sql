-- =============================================================
-- Seed data สำหรับ STAGING เท่านั้น (ห้ามรันบน prod!)
-- =============================================================
-- Prerequisites:
--   1. Auth users ต้องสร้างก่อนใน Supabase Dashboard → Authentication → Users
--      • admin1@test.local  (password: อะไรก็ได้ ที่จำได้)
--      • admin2@test.local
--      • user1@test.local
--      • user2@test.local
--   2. รัน migrations 001-022 เสร็จแล้ว (schema ต้อง match prod)
-- =============================================================

-- ── 1) Profiles — link จาก auth.users ────────────────────────
-- ใช้ auth.users.id (uuid) เป็น FK ของ profiles.id
-- ถ้าคุณมี trigger handle_new_user → อาจมี profile แล้ว แค่ update role

INSERT INTO public.profiles (id, email, display_name, role)
SELECT id, email, 'Admin ทดสอบ 1', 'admin'
FROM auth.users WHERE email = 'admin1@test.local'
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

INSERT INTO public.profiles (id, email, display_name, role)
SELECT id, email, 'Admin ทดสอบ 2', 'admin'
FROM auth.users WHERE email = 'admin2@test.local'
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

INSERT INTO public.profiles (id, email, display_name, role)
SELECT id, email, 'User ทดสอบ 1', 'user'
FROM auth.users WHERE email = 'user1@test.local'
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

INSERT INTO public.profiles (id, email, display_name, role)
SELECT id, email, 'User ทดสอบ 2', 'user'
FROM auth.users WHERE email = 'user2@test.local'
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- ── 2) Machines ──────────────────────────────────────────────
INSERT INTO public.machines (machine_id, name, location, status) VALUES
  ('test-kiosk-01', 'ตู้ทดสอบ 1', 'Test Location A', 'active'),
  ('test-kiosk-02', 'ตู้ทดสอบ 2', 'Test Location B', 'active'),
  ('test-kiosk-03', 'ตู้ทดสอบ 3', 'Test Location C', 'active')
ON CONFLICT (machine_id) DO NOTHING;

-- ── 3) Machine assignments ───────────────────────────────────
-- user1 → ตู้ 01, user2 → ตู้ 02, ตู้ 03 ไม่มีใครรับผิดชอบ
INSERT INTO public.machine_assignments (machine_id, user_id, is_active)
SELECT 'test-kiosk-01', id, true FROM auth.users WHERE email = 'user1@test.local'
ON CONFLICT DO NOTHING;

INSERT INTO public.machine_assignments (machine_id, user_id, is_active)
SELECT 'test-kiosk-02', id, true FROM auth.users WHERE email = 'user2@test.local'
ON CONFLICT DO NOTHING;

-- ── 4) SKUs — ครอบคลุมทุก series (ทดสอบ sort order ด้วย) ────
INSERT INTO public.skus (sku_id, name, series, packs_per_box, boxes_per_cotton, avg_cost, is_active) VALUES
  ('OP 01',  'One Piece OP-01 Test',  'OP',  24, 12, 50.00, true),
  ('OP 02',  'One Piece OP-02 Test',  'OP',  24, 12, 55.00, true),
  ('PRB 01', 'PRB-01 Test',           'PRB', 10, 10, 120.00, true),
  ('EB 01',  'One Piece EB-01 Test',  'EB',  24, 12, 48.00, true)
ON CONFLICT (sku_id) DO NOTHING;

-- ── 5) Stock In — 3 Lots ─────────────────────────────────────
INSERT INTO public.stock_in (lot_number, sku_id, quantity_packs, unit_cost, total_cost, purchased_at, source, note)
VALUES
  ('LOT-TEST-20260424-OP01',  'OP 01',  100, 50.00,  5000.00, '2026-04-24', 'Test', 'seed data'),
  ('LOT-TEST-20260424-PRB01', 'PRB 01', 50,  120.00, 6000.00, '2026-04-24', 'Test', 'seed data'),
  ('LOT-TEST-20260424-EB01',  'EB 01',  80,  48.00,  3840.00, '2026-04-24', 'Test', 'seed data')
ON CONFLICT DO NOTHING;

-- ── 6) Stock Transfers — main → admin/user ───────────────────
-- admin1 แจก LOT-OP01 ให้ user1 30 ซอง
INSERT INTO public.stock_transfers (sku_id, lot_number, quantity_packs, to_user_id, created_by, transferred_at)
SELECT 'OP 01', 'LOT-TEST-20260424-OP01', 30, u.id, 'Admin ทดสอบ 1', NOW()
FROM auth.users u WHERE u.email = 'user1@test.local';

-- admin1 แจก LOT-PRB01 ให้ user1 20 ซอง
INSERT INTO public.stock_transfers (sku_id, lot_number, quantity_packs, to_user_id, created_by, transferred_at)
SELECT 'PRB 01', 'LOT-TEST-20260424-PRB01', 20, u.id, 'Admin ทดสอบ 1', NOW()
FROM auth.users u WHERE u.email = 'user1@test.local';

-- admin1 แจก LOT-OP01 ให้ user2 40 ซอง (lot เดียวกัน)
INSERT INTO public.stock_transfers (sku_id, lot_number, quantity_packs, to_user_id, created_by, transferred_at)
SELECT 'OP 01', 'LOT-TEST-20260424-OP01', 40, u.id, 'Admin ทดสอบ 1', NOW()
FROM auth.users u WHERE u.email = 'user2@test.local';

-- admin1 แจก LOT-EB01 ให้ user2 30 ซอง
INSERT INTO public.stock_transfers (sku_id, lot_number, quantity_packs, to_user_id, created_by, transferred_at)
SELECT 'EB 01', 'LOT-TEST-20260424-EB01', 30, u.id, 'Admin ทดสอบ 1', NOW()
FROM auth.users u WHERE u.email = 'user2@test.local';

-- ── 7) Stock Out — user เติมตู้ ──────────────────────────────
-- user1 เบิก OP 01 (จาก lot ของตัวเอง) → ตู้ 01
INSERT INTO public.stock_out (sku_id, lot_number, quantity_packs, machine_id, withdrawn_by_user_id, created_by, withdrawn_at, note)
SELECT 'OP 01', 'LOT-TEST-20260424-OP01', 10, 'test-kiosk-01', u.id, 'User ทดสอบ 1', NOW(), 'seed data'
FROM auth.users u WHERE u.email = 'user1@test.local';

-- user2 เบิก OP 01 → ตู้ 02
INSERT INTO public.stock_out (sku_id, lot_number, quantity_packs, machine_id, withdrawn_by_user_id, created_by, withdrawn_at, note)
SELECT 'OP 01', 'LOT-TEST-20260424-OP01', 15, 'test-kiosk-02', u.id, 'User ทดสอบ 2', NOW(), 'seed data'
FROM auth.users u WHERE u.email = 'user2@test.local';

-- admin1 เบิกตรง main → ตู้ 03 (ไม่ผ่าน user)
INSERT INTO public.stock_out (sku_id, lot_number, quantity_packs, machine_id, withdrawn_by_user_id, created_by, withdrawn_at, note)
VALUES ('EB 01', 'LOT-TEST-20260424-EB01', 5, 'test-kiosk-03', NULL, 'Admin ทดสอบ 1', NOW(), 'admin direct withdraw');

-- ── 8) Claims ────────────────────────────────────────────────
-- user1 เคลม OP 01 (returned) บนตู้ 01
INSERT INTO public.claims (machine_id, sku_id, quantity, refund_amount, product_status, confirm_status, reason, managed_by_user_id, created_by, claimed_at)
SELECT 'test-kiosk-01', 'OP 01', 2, 100.00, 'returned', 'returned', 'สินค้าไม่ตก', u.id, 'User ทดสอบ 1', NOW()
FROM auth.users u WHERE u.email = 'user1@test.local';

-- user2 เคลม OP 01 (damaged pending) บนตู้ 02
INSERT INTO public.claims (machine_id, sku_id, quantity, refund_amount, product_status, confirm_status, reason, managed_by_user_id, created_by, claimed_at)
SELECT 'test-kiosk-02', 'OP 01', 1, 50.00, 'damaged', 'pending', 'สินค้าชำรุด', u.id, 'User ทดสอบ 2', NOW()
FROM auth.users u WHERE u.email = 'user2@test.local';

-- =============================================================
-- ตรวจผลลัพธ์:
--   SELECT role, display_name FROM profiles ORDER BY role DESC, email;
--   SELECT * FROM skus ORDER BY sku_id;
--   SELECT * FROM stock_in;
--   SELECT * FROM stock_transfers;
--   SELECT * FROM stock_out;
--   SELECT * FROM claims;
-- =============================================================
