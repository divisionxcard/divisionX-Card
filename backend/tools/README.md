# backend/tools

Internal CLI tools สำหรับ admin · ไม่ใช่ส่วนของ web app

## generate_daily_template.py

สร้างไฟล์ Excel template สำหรับลงข้อมูลรายวันแบบ manual · เป็น backup ถ้าระบบหลักล่ม

**ออกแบบให้เหมือนไฟล์ "สต๊อกการ์ด" ที่ admin ใช้อยู่ปัจจุบัน** — โครงสร้าง column, สูตร, การจัดกลุ่ม family ตามที่คุ้นเคย

### ติดตั้ง

```bash
pip install openpyxl supabase python-dotenv
# หรือใช้ requirements ของ scraper
pip install -r ../../deploy/scraper/requirements.txt
```

### ตั้ง env vars

อ่านอัตโนมัติจาก `.env` หรือ:
1. `backend/tools/.env`
2. `deploy/scraper/.env`
3. `deploy/.env.local`

ต้องมี:
- `SUPABASE_URL` (หรือ `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_KEY` (หรือ `NEXT_PUBLIC_SUPABASE_ANON_KEY` · read-only พอ)

### รัน

```bash
cd backend/tools
py generate_daily_template.py
```

Output: `DivisionX_Daily_Log_YYYY-MM-DD.xlsx`

### โครงสร้าง 5 sheets

| # | Sheet | จุดประสงค์ |
|---|-------|-----------|
| 1 | **สต็อกหลัก** | ยอดทั้งหมดบริษัท + คลังกลาง (auto จาก เติมตู้) + สินค้ารอตรวจสอบ (HOLD/ชำรุด/สูญหาย) |
| 2 | **เติมตู้** | คลังกลาง + ยอดเติมทุกตู้ + เติมแต่ละตู้ (6 ตู้ dynamic) + ยอดคงเหลือคลังกลาง |
| 3 | **ช่องเติมตู้** | แผนผัง slot ของแต่ละตู้ · pre-fill จาก machine_stock ปัจจุบัน |
| 4 | **ยอดการซื้อบริษัท** | purchase log + ราคาขาย (markup 30%) · มีสูตร auto-calc ยอดตั้งต้น/ราคาทุน-ซอง |
| 5 | **สต็อกย่อย** | placeholder ว่างเปล่า |

### Family grouping

SKU จัดกลุ่มตาม family (เหมือนไฟล์ admin):

- **One Piece**: OP01-15 → PRB01-02 → EB01-04
- **Dragon Ball**: FB01-09 → B29
- **Naruto**: Jin → Series01 → Series02
- **Pokemon**: Mega Dream → Ninja
- **Solo Leveling**: Ua 1

### Formulas สำคัญ

| Sheet | Cell | Formula | คำอธิบาย |
|-------|------|---------|---------|
| สต็อกหลัก | E-G (คลังกลาง) | `='เติมตู้'!S<row>` | link มาที่ยอดคงเหลือใน sheet เติมตู้ |
| เติมตู้ | E (ยอดเติมทุกตู้ BOX) | `=G+I+K+M+O+Q` | sum BOX จาก 6 ตู้ |
| เติมตู้ | F (ยอดเติมทุกตู้ Pack) | `=H+J+L+N+P+R` | sum Pack จาก 6 ตู้ |
| เติมตู้ | S/T/U (ยอดคงเหลือ) | `=B`, `=C-E`, `=D-F` | คลังกลาง − ยอดเติม |
| ยอดการซื้อ | H (ยอดตั้งต้น) | `=E*ppc+F*ppb+G` | Cotton×ppc + Box×ppb + Pack |
| ยอดการซื้อ | I (ราคาทุน/ซอง) | `=J/H` | ยอดลงทุน ÷ ยอดตั้งต้น |
| ยอดการซื้อ | T (ราคาขาย) | `=S*1.3` | markup 30% |

### Workflow แนะนำเมื่อระบบล่ม

1. รัน script ครั้งสุดท้ายก่อนระบบล่ม (หรือเก็บไฟล์ recent ไว้)
2. ก๊อปไฟล์ + เปลี่ยนชื่อเป็นวันที่ใช้งาน
3. ลงข้อมูลในแต่ละ sheet ตามที่ทำงานจริง · สูตรจะคำนวณให้
4. เมื่อระบบกลับมา → import กลับเข้า DB (ทำ SQL script แยกในอนาคต)
5. เทียบยอดสรุปกับ DB เพื่อตรวจสอบความครบถ้วน
