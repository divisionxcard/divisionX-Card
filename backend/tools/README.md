# backend/tools

Internal CLI tools สำหรับ admin · ไม่ใช่ส่วนของ web app

## generate_daily_template.py

สร้างไฟล์ Excel template สำหรับลงข้อมูลรายวันแบบ manual · เป็น backup ถ้าระบบหลักล่ม

**ออกแบบให้เหมือนไฟล์ "สต๊อกการ์ด" ที่ admin ใช้อยู่ปัจจุบัน** — โครงสร้าง column, สูตร, การจัดกลุ่ม family ตามที่คุ้นเคย

### ติดตั้ง

```bash
# Required
pip install openpyxl supabase python-dotenv

# Optional · สำหรับ auto-upload ไป Google Drive
pip install google-api-python-client google-auth-httplib2
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

### Auto-upload ไป Google Drive (ถ้าเครื่องไม่มี Excel)

Script จะ **upload ไฟล์ขึ้น GDrive + convert เป็น Google Sheets + เปิด browser อัตโนมัติ**
ไม่ต้องดาวน์โหลดเองอีก

**สำคัญ:** ต้องใช้ **OAuth** (ไม่ใช่ service account) สำหรับ personal Google account
เพราะ service account ไม่มี storage quota สำหรับ personal Drive

```bash
GOOGLE_OAUTH_CLIENT_SECRET=/path/to/client_secret.json
GOOGLE_DRIVE_FOLDER_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ
```

**Setup ครั้งแรก (~10 นาที):**

1. **Google Cloud Project**
   - https://console.cloud.google.com → New Project (หรือใช้ที่มี)

2. **Enable APIs**
   - APIs & Services → Library → ค้น "Google Drive API" → Enable
   - ค้น "Google Sheets API" → Enable

3. **OAuth Consent Screen (Google Auth Platform)**
   - APIs & Services → OAuth consent screen → Get started
   - App name: `DivisionX Tools` · User support email · Audience: **External**
   - Test users → Add: email ของคุณ
   - Save / Create

4. **OAuth Client ID**
   - APIs & Services → Credentials → Clients (หรือ Create Credentials)
   - Application type: **Desktop app**
   - ดาวน์โหลด JSON → เปลี่ยนชื่อเป็น `client_secret.json` เก็บไว้ในเครื่อง

5. **สร้าง folder บน Google Drive**
   - GDrive → New → Folder → ตั้งชื่อ "DivisionX Daily Logs"
   - เปิด folder · copy folder ID จาก URL `https://drive.google.com/drive/folders/THIS_PART`
   - (ไม่ต้อง share ที่ใดเป็นพิเศษ · OAuth ใช้สิทธิ์ของ admin โดยตรง)

6. **ตั้ง env vars** ใน `backend/tools/.env`
   ```bash
   GOOGLE_OAUTH_CLIENT_SECRET=C:/path/to/client_secret.json
   GOOGLE_DRIVE_FOLDER_ID=1aBcDeFgHi...
   AUTO_OPEN_GDRIVE=1
   ```

7. **รัน script ครั้งแรก**
   ```bash
   py generate_daily_template.py
   ```
   - Browser เปิดให้ login Google → กด **Allow**
   - Token จะถูก save ที่ `backend/tools/.gdrive_token.json`
   - ครั้งหน้ารันไม่ต้อง login ซ้ำ

8. **ผลลัพธ์**
   ```
   ✅ Saved local: DivisionX_Daily_Log_2026-05-25.xlsx
   📤 Uploading to Google Drive...
   ☁️  Uploaded · เปิดได้ทันที:
      https://docs.google.com/spreadsheets/d/abc.../edit
   ```

### หมายเหตุเรื่อง Service Account (Workspace เท่านั้น)

ถ้ามี Google Workspace · ใช้ service account ได้แทน OAuth · ตั้ง
`GOOGLE_SERVICE_ACCOUNT_JSON` แทน · กับ shared drive หรือ folder ที่ share
permission Editor กับ email ของ service account · แต่ personal account
จะ fail "storage quota exceeded" — service account ไม่มี quota

### Workflow แนะนำเมื่อระบบล่ม

1. รัน script ครั้งสุดท้ายก่อนระบบล่ม (หรือเก็บไฟล์ recent ไว้)
2. ก๊อปไฟล์ + เปลี่ยนชื่อเป็นวันที่ใช้งาน
3. ลงข้อมูลในแต่ละ sheet ตามที่ทำงานจริง · สูตรจะคำนวณให้
4. เมื่อระบบกลับมา → import กลับเข้า DB (ทำ SQL script แยกในอนาคต)
5. เทียบยอดสรุปกับ DB เพื่อตรวจสอบความครบถ้วน
