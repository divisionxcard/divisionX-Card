# Go-Live 1 พ.ค. 2026 — Playbook

ขั้นตอน reset prod + seed ด้วยข้อมูลจริงจาก Excel ที่แอดมินกรอก

## ไฟล์ในโฟลเดอร์

| ไฟล์ | หน้าที่ |
|---|---|
| `golive_template.xlsx` | Excel template ส่งให้แอดมินกรอก (3 sheets) |
| `make_template.py` | Re-generate template (รันถ้าต้องแก้ structure) |
| `01_backup_export.sql` | SELECT 7 ตาราง paste ใน SQL Editor → Export CSV |
| `02_reset_transactional.sql` | TRUNCATE 6 ตาราง · เก็บ profiles/skus/machines/assignments/login_history |
| `04_excel_to_sql.py` | Convert Excel ที่กรอกครบ → `03_seed_generated.sql` |
| `03_seed_generated.sql` | (auto-generated) INSERT statements ที่ paste ลง SQL Editor |

## Timeline 4 วัน (27 เม.ย. → 1 พ.ค.)

| วัน | งาน |
|---|---|
| **27 เม.ย.** (วันนี้) | ส่ง `golive_template.xlsx` ให้แอดมิน · อธิบายวิธีกรอก |
| **28-29 เม.ย.** | แอดมินดู template · ถามถ้าไม่เข้าใจ |
| **30 เม.ย.** | Dry run บน staging (รันทุก step ปลอม) · ตรวจไม่มี error |
| **1 พ.ค. เช้า** | นับสต็อกจริง → กรอก Excel → ส่งกลับ → Backup → Reset → Seed → Verify |
| **1 พ.ค. บ่าย** | Go-live เต็มระบบ |

---

## Step-by-step วันที่ 1 พ.ค.

### 1. ⏰ 07:30 — แอดมินนับสต็อกจริง
- นับ Main · User · Machine
- กรอกใน `golive_template.xlsx` (sheet ละชนิดสต็อก)
- Save ส่งกลับให้ทีมเทค

### 2. ⏰ 08:00 — Backup ก่อนลบ
1. เปิด **prod Supabase SQL Editor** (`xethnqqmpvlpmafvphky`)
2. เปิด `01_backup_export.sql` แล้ว run ทีละ block (7 blocks)
3. หลัง run แต่ละ block → กดปุ่ม "Export" → เลือก CSV
4. ตั้งชื่อไฟล์ตามที่ระบุไว้ใน comment · เก็บใน `C:\backup\golive\`
5. รัน BONUS query (snapshot summary) เก็บไว้เป็น snapshot

### 3. ⏰ 08:15 — Reset
1. เปิด `02_reset_transactional.sql` ใน SQL Editor
2. **ตรวจ URL ว่าเป็น prod อีกครั้ง** (`xethnqqmpvlpmafvphky`)
3. Run ทั้งไฟล์ — มี `BEGIN ... COMMIT` ครอบ · ถ้า verify fail จะ throw exception
4. เห็น `Reset OK` → ผ่าน · ถ้าไม่ → เปลี่ยน COMMIT เป็น ROLLBACK ก่อน run

### 4. ⏰ 08:20 — Convert Excel → SQL
```bash
cd backend/database/golive_20260501
py 04_excel_to_sql.py [path/to/golive_filled.xlsx]
```
- ถ้า Excel มี error → script จะแจ้ง บรรทัดที่ผิด · แก้ใน Excel แล้วรันใหม่
- ถ้าผ่าน → ได้ `03_seed_generated.sql` พร้อม paste

### 5. ⏰ 08:25 — Seed
1. เปิด `03_seed_generated.sql` ใน SQL Editor
2. Run ทั้งไฟล์ (มี BEGIN/COMMIT ครอบ)
3. เห็น `Seed OK` → ผ่าน
4. ถ้า fail → ดู error message · แก้ Excel หรือ SQL · run ใหม่

### 6. ⏰ 08:30 — Verify บนเว็บ
1. เปิด https://divisionx-card.vercel.app/
2. login admin · ดู Dashboard
3. เช็ค:
   - สต็อก Main ตรงกับ Excel
   - สต็อก User แต่ละคนตรง
   - สต็อกตู้ (machine_stock) มีของ
   - ราคาทุน (avg_cost) ตรงกับที่กรอก

### 7. ⏰ 09:00 — Go-Live ⏯
- แจ้งทุกคนว่าระบบเริ่มใช้แล้ว
- ทดสอบ flow หลัก: รับเข้า · เบิกเติมตู้ · เคลม

---

## Rollback (กรณีเจอปัญหา)

### ก่อน Step 5 (ก่อน seed)
- Run rollback restore: paste จาก backup CSV กลับเข้าตาราง (ใช้ Supabase Dashboard "Import")
- หรือ run `02_reset_transactional.sql` แค่ส่วน BEGIN ค้างไว้ (ROLLBACK)

### หลัง Step 5 (seed แล้ว แต่เจอ bug)
- Run `02_reset_transactional.sql` อีกครั้งเพื่อล้าง seed
- Import CSV backup กลับ
- ทุกอย่างกลับสู่สภาพก่อน Reset

---

## คำถามที่อาจเจอ

**Q: Excel กรอกแล้วบางช่อง 0 ได้ไหม?**
A: ได้ · row ที่ full_boxes=0 + loose_packs=0 → script จะข้าม (ไม่ insert stock_in)

**Q: PRB packs_per_box เท่าไหร่?**
A: 10 (อื่น ๆ 12) · column C ใน Main_Stock มีให้ดู

**Q: Machine_Stock ไม่กรอกได้ไหม?**
A: ได้ · VMS sync ครั้งถัดไปจะเติมให้เอง · แต่ระยะ 1-2 ชม. แรกหลัง go-live สต็อกตู้ในระบบจะแสดง 0 จนกว่า sync

**Q: ลืมบันทึกราคาทุน?**
A: กรอก 0 ได้ · แต่ Dashboard กำไรจะคำนวณไม่ตรง · แก้ทีหลังโดย admin > จัดการ SKU > avg_cost

**Q: VMS sales sync ตอนกำลังทำ — จะมีข้อมูลขายช่วง reset เข้ามาไหม?**
A: GitHub Actions sync ทุกวัน · ช่วง 08:00-09:00 ถ้า run จะติด TRUNCATE หรือเขียน sales ทับ · แนะนำปิด workflow ชั่วคราวจนกว่า seed เสร็จ
