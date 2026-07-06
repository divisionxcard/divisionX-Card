-- =============================================================
-- Migration 054: index ให้ตรงกับ query จริง (perf)
-- =============================================================
-- ปัญหา: client getStockIn() เรียง ORDER BY created_at DESC
--        แต่ index วันที่ของ stock_in มีแค่ purchased_at
--        → เมื่อข้อมูลโตขึ้น query จะ sort ทั้งตาราง (ช้าลงเรื่อยๆ)
-- แก้: เพิ่ม index บน created_at DESC (ไม่เปลี่ยนพฤติกรรม แค่เร็วขึ้น)
--
-- ปลอดภัย 100% — index ไม่กระทบข้อมูลหรือ logic ใดๆ
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_stock_in_created_at
  ON public.stock_in (created_at DESC);

-- ตรวจสอบ:
-- EXPLAIN ANALYZE SELECT * FROM stock_in ORDER BY created_at DESC LIMIT 100;
-- ควรเห็น Index Scan ไม่ใช่ Seq Scan + Sort
