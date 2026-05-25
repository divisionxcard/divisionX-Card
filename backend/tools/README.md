# backend/tools

Internal CLI tools สำหรับ admin · ไม่ใช่ส่วนของ web app

## generate_daily_template.py

สร้างไฟล์ Excel template สำหรับลงข้อมูลรายวันแบบ manual · ใช้เป็น backup ถ้าระบบหลักล่ม

### ติดตั้ง dependencies

```bash
pip install openpyxl supabase python-dotenv
# หรือใช้ requirements ของ scraper
pip install -r ../../deploy/scraper/requirements.txt
```

### ตั้ง env vars

สคริปต์อ่านจาก env หรือไฟล์ `.env` ตามลำดับ:
1. `backend/tools/.env`
2. `deploy/scraper/.env`
3. `deploy/.env.local`

ต้องมี:
- `SUPABASE_URL` (หรือ `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_KEY` (หรือ `NEXT_PUBLIC_SUPABASE_ANON_KEY` · read-only ก็ใช้ได้)

### รัน

```bash
cd backend/tools
py generate_daily_template.py
```

Output: `DivisionX_Daily_Log_YYYY-MM-DD.xlsx` (ในโฟลเดอร์เดียวกัน)

### โครงสร้างไฟล์ Excel

| Sheet | จุดประสงค์ |
|-------|-----------|
| 00_คู่มือ | วิธีใช้ + ผู้บันทึก + ผลัด |
| 01_ยอดขาย | บันทึกการขายเมื่อ VMS ล่ม · auto-calc รายรับ/Ksher fee/Net |
| 02_รับสินค้า | log การรับของเข้าคลัง · auto-calc รวมต้นทุน |
| 03_เบิกเติมตู้ | withdrawal จากคลังไปตู้ |
| 04_เปลี่ยนSlot | track การสลับสินค้าในช่อง |
| 05_เคลม | refund / สูญหาย / ชำรุด |
| 06_สต็อกหน้าตู้ | snapshot ปัจจุบันของแต่ละช่อง · auto-calc % เต็ม |
| Reference | SKU + Machine list (read-only · regenerate เมื่อเปลี่ยน) |

### Feature

- **Dropdown validation** ทุกคอลัมน์ที่ต้องเลือก (ตู้, SKU, หน่วย, สาเหตุ) อิงจาก Reference sheet
- **Auto-formula**: รายรับ, Ksher fee (1.5% chukes / 0.5% wwv), Net, รวมต้นทุน, % เต็ม
- **Frozen header row** + filter
- **200 empty rows** ต่อ sheet พร้อมใช้
- คอลัมน์ auto-calc สีเทา · อย่ากรอกทับ

### Workflow แนะนำเมื่อระบบล่ม

1. รัน script ครั้งสุดท้ายก่อนระบบล่ม (หรือเก็บไฟล์ recent ไว้)
2. ก๊อปไฟล์ + เปลี่ยนชื่อเป็นวันที่ใช้งาน
3. ลงข้อมูลใน sheet ที่เกี่ยวข้องระหว่างที่ระบบล่ม
4. เมื่อระบบกลับมา → import กลับเข้า DB (manual SQL หรือสคริปต์ import แยกในอนาคต)
5. เทียบยอดสรุปกับ DB เพื่อตรวจสอบความครบถ้วน
