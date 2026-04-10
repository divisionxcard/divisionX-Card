-- ═══════════════════════════════════════════════════════════════
-- Migration 014: เพิ่ม confirm_status สำหรับยืนยันการตัดสต็อก
-- pending   = รอผู้ใช้ยืนยัน
-- confirmed = ยืนยันแล้ว ตัดสต็อกแล้ว
-- NULL      = ไม่ต้องยืนยัน (เช่น คืนสต็อก)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE claims ADD COLUMN IF NOT EXISTS confirm_status VARCHAR(20) DEFAULT NULL;
