-- 021: เพิ่ม columns ใน stock_out และ claims สำหรับระบบสต็อกย่อย

-- stock_out: ระบุว่าเบิกจากสต็อกของ admin คนไหน (NULL = สต็อกหลัก / ข้อมูลเก่า)
ALTER TABLE stock_out
  ADD COLUMN IF NOT EXISTS withdrawn_by_user_id UUID;

-- claims: ระบุว่า admin คนไหนจัดการเคลม (NULL = ข้อมูลเก่า)
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS managed_by_user_id UUID;
