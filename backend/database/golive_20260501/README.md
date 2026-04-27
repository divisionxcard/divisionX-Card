# Go-Live 1 พ.ค. 2026 — Playbook

ขั้นตอน reset prod + seed ด้วยข้อมูลจริง · **Flow ใหม่**: เติมตู้ก่อน → VMS sync → นับ User+Main → seed

## ไฟล์ในโฟลเดอร์

| ไฟล์ | หน้าที่ |
|---|---|
| `golive_template.xlsx` | Excel 2 sheets (Main + User) ส่งให้แอดมินกรอก |
| `make_template.py` | Re-generate template (รันใหม่ถ้าจะแก้ structure) |
| `01_backup_export.sql` | SELECT 7 ตาราง paste → Export CSV |
| `02_reset_transactional.sql` | TRUNCATE 5 ตาราง · ไม่แตะ machine_stock |
| `04_excel_to_sql.py` | Convert filled Excel → `03_seed_generated.sql` |
| `03_seed_generated.sql` | (auto-generated) INSERT statements ที่ paste ลง SQL Editor |

## Flow ใหม่ — ทำไมต้องเติมตู้ก่อน

ตู้ขายมี VMS sync ที่บอก remain ของแต่ละ slot อยู่แล้ว · ใช้ VMS เป็น source of truth ของ "ของในตู้"
- ✅ ไม่ต้องนับช่องตู้ทีละช่อง (60 ช่อง × 4 ตู้)
- ✅ Excel เหลือ 2 sheets แทน 3
- ✅ ตัวเลขตรง VMS 100%

## Timeline 4 วัน (27 เม.ย. → 1 พ.ค.)

| วัน | งาน |
|---|---|
| **27 เม.ย.** (วันนี้) | ส่ง `golive_template.xlsx` ให้แอดมิน · อธิบายขั้นตอน |
| **28-29 เม.ย.** | แอดมินดู template · ถามถ้าไม่เข้าใจ |
| **30 เม.ย.** | Dry run บน staging · ปิด GitHub Actions VMS sync ตอนคืน |
| **1 พ.ค. เช้า** | เติมตู้ → sync → นับ → reset → seed → go-live |

---

## Step-by-step วันที่ 1 พ.ค.

### 1. ⏰ 07:00-08:30 — แอดมินเติมตู้ทุกตู้
- **เติมจาก User stock ของแต่ละแอดมิน** (ของส่วนตัวที่ถืออยู่)
- เติมของจริงในตู้ทุกช่อง · ครบ 4 ตู้
- ไม่ต้องบันทึกอะไร · แค่เติม
- เติมเสร็จ → ของในมือ (User stock) จะลดลง · ของในตู้ (machine_stock) เพิ่มขึ้น

### 2. ⏰ 08:30 — Trigger VMS sync
- เปิด https://division-x-card.vercel.app/ → หน้า "สต็อกหน้าตู้"
- กดปุ่ม **"ดึงข้อมูล VMS"** → รอ ~1 นาที
- กด Refresh เพื่อ verify ว่าตัวเลขใน slot ตรงกับของจริงในตู้

### 3. ⏰ 08:35 — แอดมินนับ Main + User
- **Main** (คลังหลัก) — เก็บเฉพาะ Cotton + Box · **ไม่มีซองเศษที่ Main**
  - นับ full_cottons (ลังใหญ่) + full_boxes (กล่อง) + ราคาทุน/ซอง
  - เศษซองทั้งหมดอยู่ที่ User (Main จ่ายเป็นลัง/กล่องเต็มเสมอ)
- **User** (ของแอดมินที่ **เหลือในมือ หลังเติมตู้แล้ว**): username + SKU + ซองรวม
  - ⚠ สำคัญ — นับ "หลังเติมตู้" ไม่ใช่ก่อนเติม
  - User นับเป็น "ซองรวม" (รวม cotton/box/pack ที่ถือเป็นจำนวนซอง)
- กรอกใน `golive_template.xlsx`
- Save ส่งกลับให้ทีมเทค

### 4. ⏰ 08:55 — Backup ก่อนลบ
1. เปิด **prod Supabase SQL Editor** (`xethnqqmpvlpmafvphky`)
2. เปิด `01_backup_export.sql` แล้ว run ทีละ block (7 blocks)
3. หลัง run แต่ละ block → กด "Export" → CSV
4. เก็บไฟล์ใน `C:\backup\golive\`

### 5. ⏰ 09:00 — Reset
1. เปิด `02_reset_transactional.sql` ใน SQL Editor
2. **ตรวจ URL ว่าเป็น prod** (`xethnqqmpvlpmafvphky`)
3. Run ทั้งไฟล์ — มี `BEGIN ... COMMIT` ครอบ
4. เห็น `Reset OK · machine_stock พร้อมใช้ (XX slots)` → ผ่าน
5. ⚠ ถ้าเห็น WARNING `machine_stock ว่าง` → กลับไป step 2 trigger sync ก่อน

### 6. ⏰ 09:05 — Convert Excel → SQL
```bash
cd backend/database/golive_20260501
py 04_excel_to_sql.py [path/to/golive_filled.xlsx]
```
- ถ้า Excel error → script แจ้งบรรทัดที่ผิด · แก้แล้วรันใหม่
- ถ้าผ่าน → ได้ `03_seed_generated.sql`

### 7. ⏰ 09:10 — Seed
1. เปิด `03_seed_generated.sql` ใน SQL Editor
2. Run ทั้งไฟล์ (BEGIN/COMMIT ครอบ)
3. เห็น `Seed OK` → ผ่าน
4. ถ้า fail → ดู error · แก้ Excel หรือ SQL · run ใหม่

### 8. ⏰ 09:15 — Verify บนเว็บ
1. เปิด https://division-x-card.vercel.app/
2. login admin · ดู Dashboard
3. เช็ค:
   - **Main** ตรงกับ Excel
   - **สต็อก User** แต่ละคนตรง (PageMyStock)
   - **สต็อกตู้** ตรงกับ VMS (PageMachineStockView)
   - **avg_cost** ตรงกับที่กรอก

### 9. ⏰ 09:30 — Go-Live ⏯
- แจ้งทุกคนเริ่มใช้ระบบ
- ทดสอบ flow หลัก: รับเข้า · เบิกเติมตู้ · เคลม

---

## Rollback (กรณีเจอปัญหา)

### ก่อน Step 7 (ก่อน seed)
- ใน SQL Editor: เปลี่ยน COMMIT เป็น ROLLBACK ใน `02_reset_transactional.sql` · run ใหม่

### หลัง Step 7 (seed แล้ว แต่เจอ bug)
- Run reset อีกครั้ง · import CSV backup จาก step 4 กลับเข้าตาราง (Supabase Dashboard "Import")

---

## คำถามที่อาจเจอ

**Q: ถ้าตู้บางช่องเติมไม่ครบ (เช่น ของหมด) ?**
A: VMS sync จะให้ remain จริง (เช่น 0 หรือน้อยกว่า max) · seed ใช้ตัวเลขจริง · ไม่ต้องห่วง

**Q: ตู้บางช่องไม่มี SKU mapping ?**
A: VMS sync จะ map product_name → sku_id ผ่าน regex · ถ้า VMS ใช้ format ใหม่หลัง rebuild → check `vms_stock_sync.py:map_product_to_sku()` · ถ้าจำเป็นแก้ regex

**Q: ราคาทุนใส่ 0 ได้ไหม?**
A: ได้ · stock_in จะมี total_cost = 0 · Dashboard กำไรจะคำนวณไม่ตรง · แก้ทีหลังได้ที่หน้าจัดการ SKU

**Q: VMS sales sync ระหว่าง reset?**
A: ปิด GitHub Actions workflow ตอนคืน 30 เม.ย. ก่อน · ป้องกัน conflict · เปิดอีกครั้งหลัง seed เสร็จ

**Q: บันทึกการเติมตู้ตอนเช้า 1 พ.ค. ในระบบยังไง?**
A: stock_out ที่ seed สร้างให้ = "Initial machine load" · ไม่ต้องบันทึกเอง · หลัง go-live กดเบิกผ่านหน้าเว็บปกติ
