# Database Migrations

รัน SQL ทีละไฟล์ตามลำดับเลขใน Supabase SQL Editor (apply แบบ manual)

## ⚠ เลข migration ที่ชนกัน (historical — apply ไปแล้ว อย่าแก้ย้อนหลัง)

ไฟล์เหล่านี้ใช้เลขซ้ำกันในอดีต ตอน apply จริงไม่มีปัญหาเพราะรันมือทีละไฟล์
แต่บันทึกไว้กันสับสน **ห้ามเปลี่ยนเลขไฟล์ที่ apply ไปแล้ว** (จะทำให้ประวัติเพี้ยน):

| เลข | ไฟล์ | หมายเหตุ |
|-----|------|---------|
| 022 | `022_add_machine_brand_config.sql` + `022_update_v_stock_balance_with_transfers.sql` | คนละ migration เลขชนกันจริง |
| 024 | `024_add_username_to_profiles.sql` + `024_add_username_to_profiles_rollback.sql` | คู่ migration/rollback (ตั้งใจ) |
| 043 | `043_fix_ww_vendor_ids.sql` + `043_revert_wwv02_vendor.sql` | คนละ migration เลขชนกันจริง |

## กติกาต่อจากนี้
- migration ใหม่ **ต้องเริ่มที่ 054** ขึ้นไป และ **ห้ามใช้เลขซ้ำ**
- ไฟล์ rollback ให้ตั้งชื่อ `<เลขเดิม>_<ชื่อ>_rollback.sql` (ใช้เลขเดียวกับ migration ที่มันย้อน)
- ตรวจก่อนสร้าง: `ls | grep -oE '^[0-9]+' | sort -n | tail -1` เพื่อดูเลขล่าสุด

## ล่าสุด
- `053_rls_transactional_tables.sql` — เปิด RLS ตารางธุรกรรม (ต้องทดสอบ staging ก่อน prod)
