# Checklist Manual Actions — Aof วันที่ 1 พ.ค. 2026

ทุก step ที่คุณต้องทำเอง · เรียงตามเวลา · ติ๊ก ☐ → ☑ ตอนทำเสร็จ

---

## 🟡 ก่อนวันงาน

### 28 เม.ย. (วันจันทร์)
- [ ] ส่ง `golive_template.xlsx` ให้แอดมินทุกคน (LINE/email)
  - ไฟล์อยู่ที่: `C:\Projects\divisionX Card\backend\database\golive_20260501\golive_template.xlsx`
  - แจ้งให้อ่าน Sheet "README" ก่อน
  - บอกให้กรอกล่วงหน้าได้เฉพาะ Sheet "Main_Stock" (ราคาทุน + ของในคลังหลัก)
  - Sheet "User_Stock" → กรอกเช้า 1 พ.ค. หลังเติมตู้

### 29 เม.ย. (วันอังคาร)
- [ ] ตอบคำถามแอดมินถ้ามี (เช่น "ใส่ตรงไหน?", "หน่วยอะไร?")
- [ ] confirm กับแอดมินทุกคนว่าจะมาเช้า 1 พ.ค. (07:00)

### 30 เม.ย. (วันพุธ ดึก ~22:00)
- [ ] **ปิด GitHub Actions workflows** (กันรันชน reset)
  1. เปิด https://github.com/divisionxcard/divisionX-Card/actions
  2. คลิก **"VMS Daily Sync"** ใน sidebar ซ้าย
  3. คลิกปุ่ม `...` มุมขวาบน → **"Disable workflow"**
  4. ทำซ้ำกับ **"VMS Stock Sync"** อีก workflow

- [ ] ตรวจ `.env.local` ของ deploy ชี้ prod (ไม่ใช่ staging)
  - เปิด `C:\Projects\divisionX Card\deploy\.env.local`
  - บรรทัดแรกควรเป็น `NEXT_PUBLIC_SUPABASE_URL=https://xethnqqmpvlpmafvphky.supabase.co`

---

## 🔴 วันงาน 1 พ.ค. (วันพฤหัส)

### ⏰ 07:00 — แอดมินมาถึง · เริ่มเติมตู้

- [ ] บอกแอดมินทุกคน: "เติมจาก stock ของตัวเอง · เติมตู้ทุกตู้ให้เต็ม"
- [ ] เตือน: ห้ามขายของจากตู้ก่อน 09:30 น. (รอ go-live)
- [ ] ติด graphic บนตู้ "ปิดปรับปรุง 07:00-09:30 น."

### ⏰ 08:30 — ตรวจตู้เต็มทุกตู้
- [ ] เดินตรวจตู้ทั้ง 4 ตู้ว่าเติมเรียบร้อย (chukes01-04)

### ⏰ 08:35 — Trigger VMS sync
- [ ] เปิด https://division-x-card.vercel.app/ (login ด้วย username `aofwara66`)
- [ ] ไปหน้า **"สต็อกหน้าตู้"**
- [ ] กดปุ่ม **"ดึงข้อมูล VMS"**
- [ ] รอ ~1 นาที · กด **Refresh**
- [ ] ตรวจ remain ของแต่ละ slot ตรงกับของจริงในตู้ (สุ่ม 2-3 slot ต่อตู้)

### ⏰ 08:45 — รวบรวม Excel จากแอดมิน
- [ ] ขอไฟล์ `golive_template.xlsx` ที่กรอกครบจากแอดมิน
- [ ] เปิดดูว่า Sheet "Main_Stock" + "User_Stock" กรอกครบ
- [ ] Save เป็น `golive_filled_20260501.xlsx` ในโฟลเดอร์ `C:\Projects\divisionX Card\backend\database\golive_20260501\`

### ⏰ 09:00 — Backup ข้อมูลเก่า (CSV)
- [ ] เปิด **prod Supabase SQL Editor**: https://supabase.com/dashboard/project/xethnqqmpvlpmafvphky/sql
- [ ] **ตรวจ URL ตอนนี้ว่ามี `xethnqqmpvlpmafvphky`** (prod) ไม่ใช่ staging
- [ ] เปิดไฟล์ `01_backup_export.sql` · paste **block ที่ 1** (stock_in) → Run → กด Export → CSV → save เป็น `stock_in_20260501.csv` ในเครื่อง
- [ ] ทำซ้ำกับ block 2-7 (stock_out / stock_transfers / claims / sales / machine_stock / login_history)
- [ ] ครบ 7 ไฟล์แล้ว — เก็บใน `C:\backup\golive\`

### ⏰ 09:10 — Reset
- [ ] เปิดไฟล์ `02_reset_transactional.sql` · copy ทั้งไฟล์
- [ ] paste ใน prod SQL Editor → Run
- [ ] ดูใน "Notices" panel — ต้องเห็น `Reset OK · machine_stock พร้อมใช้ (XX slots)`
- [ ] ⚠ ถ้าเห็น `WARNING machine_stock ว่าง` → กลับไป step 08:35 trigger sync ก่อน

### ⏰ 09:15 — Convert Excel → SQL
- [ ] เปิด terminal (PowerShell หรือ Git Bash)
- [ ] Run:
  ```bash
  cd "C:\Projects\divisionX Card\backend\database\golive_20260501"
  py 04_excel_to_sql.py golive_filled_20260501.xlsx
  ```
- [ ] ถ้าสำเร็จ → จะเห็น `OK wrote 03_seed_generated.sql` + summary
- [ ] ถ้า error → script จะแจ้งบรรทัดที่ผิดใน Excel · กลับไปแก้ใน Excel แล้ว run ใหม่

### ⏰ 09:20 — Seed
- [ ] เปิดไฟล์ `03_seed_generated.sql` (เพิ่งถูกสร้าง) · copy ทั้งไฟล์
- [ ] paste ใน prod SQL Editor → Run
- [ ] ดู "Notices" — ต้องเห็น `Seed OK`
- [ ] ⚠ ถ้า fail → ดู error · บอกผมในรอบถัดไป

### ⏰ 09:25 — Verify บนเว็บ
- [ ] เปิด https://division-x-card.vercel.app/ → Refresh (Ctrl+Shift+R)
- [ ] ดู **Dashboard**:
  - "สต็อกรวม" ตรงกับยอดที่บันทึก
  - "ซื้อรวม" = total_cost จาก stock_in
- [ ] ดู **"สต็อกหน้าตู้"**: ตู้ทุกตู้มี slot ที่กำลังเติม
- [ ] ดู **"จัดการสต็อก"**: SKU มี avg_cost ถูกต้อง
- [ ] ดู **"คงเหลือในมือ"** (PageMyStock) ของแอดมินแต่ละคน

### ⏰ 09:30 — Go-Live ⏯
- [ ] แจ้งแอดมินทุกคน: "ระบบใช้งานได้แล้ว"
- [ ] ลอกป้าย "ปิดปรับปรุง" ออกจากตู้
- [ ] ทดสอบ flow:
  - Login admin → เปิดหน้าได้ปกติ
  - กดเบิก SKU 1 SKU จาก User → Machine (ทดสอบเล็ก)
  - Cancel หรือ rollback ทดสอบ

### ⏰ 09:45 — เปิด GitHub Actions กลับ
- [ ] เปิด https://github.com/divisionxcard/divisionX-Card/actions
- [ ] คลิก **"VMS Daily Sync"** → กด **"Enable workflow"**
- [ ] กด **"Run workflow"** เพื่อ trigger sync ทันที (ดึงยอดขายตั้งแต่เปิดตู้)
- [ ] ทำซ้ำกับ **"VMS Stock Sync"**

### ⏰ 10:00+ — เฝ้าระวัง
- [ ] ทุก 30 นาที่: ดู Dashboard + เปรียบเทียบยอดขายกับ VMS
- [ ] ถ้าเจอ bug → จดไว้ · แจ้งผมในรอบถัดไป

---

## 🆘 ถ้าพังกลางทาง

### ก่อน Step 09:20 (ก่อน Seed)
ระบบยังไม่มีข้อมูลใหม่ · กลับมาได้:
- ใน `02_reset_transactional.sql` เปลี่ยน `COMMIT;` เป็น `ROLLBACK;` ที่ท้ายไฟล์ → run ใหม่
- หรือ import CSV backup กลับ (Supabase Dashboard → Table editor → Import)

### หลัง Step 09:20 (Seed แล้ว แต่เจอปัญหา)
- Run `02_reset_transactional.sql` อีกครั้ง (ลบ seed)
- Import CSV backup จาก step 09:00 กลับ
- หรือ run Convert + Seed ใหม่ (ถ้า Excel ผิด แก้แล้ว run อีกที)

### ติดขัดมาก ต้องการความช่วยเหลือ
- บอกผมในรอบถัดไป · ส่ง screenshot error message
- หรือถ้าเร่งด่วน · revert commit ล่าสุดได้

---

## 📞 ข้อมูลสำคัญที่ต้องมี

- **Prod Supabase URL**: https://supabase.com/dashboard/project/xethnqqmpvlpmafvphky
- **Prod Web**: https://division-x-card.vercel.app/
- **GitHub Repo**: https://github.com/divisionxcard/divisionX-Card
- **GitHub Actions**: https://github.com/divisionxcard/divisionX-Card/actions
- **Folder งาน**: `C:\Projects\divisionX Card\backend\database\golive_20260501\`

## รายชื่อ username admin (สำหรับ login)

| display_name | username | role |
|---|---|---|
| DivisionX Card | divisionxcard | admin |
| T | pornthep_sm1991 | admin |
| AOFSEN | aofwara66 | user |
| พี่ M | power23n | user |
| M-zadiz | mzadiz1989 | user |

(รหัสผ่านเดิมใช้ต่อ · ถ้าลืม กด "ลืมรหัสผ่าน" + ใส่ username → ลิงก์ส่งไป email)
