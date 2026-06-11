-- =============================================================
-- Migration 047: เปลี่ยนชื่อจริง wwv05 · ยานนาวา (placeholder) → ซีคอน บางแค
-- =============================================================
-- ตอนเพิ่มตู้ (migration 044, 2026-06-03) ตู้ยังไม่ติดตั้ง · portal เป็น default
-- "WorldWide Vending" จึงใส่ placeholder location = "ยานนาวา" ไว้ก่อน
--
-- 2026-06-11: ตู้ติดตั้งใช้งานจริงแล้ว · portal แสดง
--   site  = "ซีคอน บางแค"   route = "ภาษีเจริญ"   inventory ~95%
-- vendor_id (VCM350CKC23050301) เหมือนเดิม · sync ทำงานปกติ (machine_stock 55 แถว)
--
-- แก้เฉพาะ name/location · config + machine_id_vendor ไม่เปลี่ยน
-- =============================================================

UPDATE machines
SET name     = 'ตู้ที่ 9 (wwv05) · ซีคอน บางแค',
    location = 'ซีคอน บางแค'
WHERE machine_id = 'wwv05';
