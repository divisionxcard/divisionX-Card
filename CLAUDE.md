# CLAUDE.md — DivisionX Card Development Guide

## Quick Start สำหรับนักพัฒนา

### 1. Clone และ Setup

```bash
git clone https://github.com/divisionxcard/divisionX-Card.git
cd divisionX-Card
```

### 2. Environment Variables

สร้างไฟล์ `deploy/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xethnqqmpvlpmafvphky.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ขอจากเจ้าของโปรเจค>
GH_PAT=<GitHub Personal Access Token สำหรับ trigger workflow>
```

### 3. รัน Development

```bash
cd deploy
npm install
npm run dev
```

เปิด http://localhost:3000

### 4. Deploy

Push ไป `main` branch → Vercel auto deploy

---

## สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────┐
│                    VMS InboxCorp                         │
│            https://vms.inboxcorp.co.th                   │
├────────────┬────────────────────────────────────────────-┤
│  REST API  │  Playwright + XLSX Export                    │
│  (สต็อก)    │  (ยอดขาย — API ถูก block 403)                │
└─────┬──────┴──────────┬─────────────────────────────────-┘
      │                 │
      ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│              GitHub Actions (Automated)                   │
│  00:00 น. → VMS Daily Sync (ยอดขาย เมื่อวาน)             │
│  00:05 น. → VMS Stock Sync (สต็อกหน้าตู้)                 │
└────────────────────────┬────────────────────────────────-┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                Supabase (PostgreSQL)                      │
│  Tables: machines, skus, stock_in, stock_out,            │
│          sales, claims, machine_stock, profiles           │
└────────────────────────┬────────────────────────────────-┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              DVX Frontend (Next.js on Vercel)             │
│  URL: https://divisionx-card.vercel.app                  │
└─────────────────────────────────────────────────────────┘
```

---

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|------|--------|
| `deploy/components/DivisionXApp.jsx` | Component หลัก ทุกหน้าอยู่ในไฟล์นี้ |
| `deploy/lib/supabase.js` | Supabase client + ทุก query function |
| `deploy/scraper/vms_sales_api.py` | ดึงยอดขายจาก VMS API (ลองก่อน) |
| `deploy/scraper/vms_scraper.py` | ดึงยอดขายจาก VMS ผ่าน Playwright (fallback) |
| `deploy/scraper/vms_stock_sync.py` | ดึงสต็อกหน้าตู้จาก VMS API |
| `.github/workflows/vms-sync.yml` | Workflow ยอดขาย (00:00 น.) |
| `.github/workflows/vms-stock-sync.yml` | Workflow สต็อกหน้าตู้ (00:05 น.) |
| `deploy/app/globals.css` | CSS รวมถึง print styles |

---

## หน้าเว็บทั้งหมด

### 1. ภาพรวม (Dashboard)
- KPI: สต็อกรวม, ใกล้หมด, จำนวน Lot, มูลค่าซื้อรวม
- การ์ด SKU ทั้งหมด พร้อมรูป ยอดคงเหลือ ต้นทุนเฉลี่ย
- กดการ์ด → ดูรายละเอียด Lot

### 2. จัดการสต็อก
- **Tab ยอดคงเหลือ**: รับสินค้าเข้า (ระบุ Lot, SKU, จำนวน, ราคาทุน)
- **Tab ประวัติ**: ดูประวัติรับสินค้า กรองวัน/เดือน/ปี
- **Tab จัดการ SKU**: เพิ่ม/ปิดใช้งาน SKU
- **ปุ่มคำนวณต้นทุนใหม่**: เลือก SKU → recalculate avg_cost

### 3. เบิกเติมตู้
- เลือก SKU → เลือก Lot → เลือกตู้ปลายทาง → ระบุจำนวน
- เบิกเป็นกล่องหรือซอง ระบบแปลงให้อัตโนมัติ
- ประวัติการเบิก กรองวัน/เดือน/ปี (ล่าสุดอยู่บน)
- เมนูย่อย: เลือกดูประวัติแต่ละตู้

### 4. สต็อกหน้าตู้ (VMS)
- แสดงสินค้าแต่ละ slot ของทุกตู้ (ดึงจาก VMS API)
- ปุ่ม "ดึงข้อมูล VMS" (manual sync)
- ปุ่ม "รายงานเติมสินค้า" → ตารางยอดที่ต้องเติม + Print/PDF
- สรุปยอดรวมทุกตู้ (กล่อง/ซอง แยกกัน)
- มุมมอง: ตามช่อง / ตาม SKU / คงเหลือ

### 5. ยอดขาย
- ยอดขายรวม 30 วัน, จำนวนธุรกรรม, กำไรโดยประมาณ
- กราฟยอดขาย 7 วันล่าสุด แยกตู้
- Top SKU ยอดขายสูงสุด
- รายการขายแยก SKU ต่อตู้ (กรองรายวัน, แยกกล่อง/ซอง)
- ปุ่ม "ดึงข้อมูล VMS" (manual sync)

### 6. เคลม/คืนเงิน
- บันทึกเคลม: วันที่, ตู้, SKU, จำนวน, ยอดคืนเงิน, สาเหตุ, สถานะสินค้า
- สถานะ: คืนสต็อก / ชำรุด / สูญหาย
- สูญหาย/ชำรุด → ต้องยืนยันก่อนตัดสต็อก
- คืนสต็อก → ผู้ใช้คีย์รับเข้าระบบเองที่หน้าจัดการสต็อก

### 7. วิเคราะห์ SKU
- อันดับ SKU ตามรายรับ/จำนวน/กำไร
- กราฟ Trend 7 วัน Top 5 SKU
- สัดส่วนยอดขายตาม Series (OP/PRB/EB)

### 8. จัดการผู้ใช้ (Admin เท่านั้น)
- เพิ่ม/ลบผู้ใช้
- กำหนด role: admin / user

---

## ระบบต้นทุน (Moving Average Cost)

### หลักการ
- **avg_cost** เก็บในตาราง `skus` ต่อ SKU
- **อัปเดตเมื่อรับของเข้า**: `(คงเหลือ × avg_cost เก่า + ของใหม่ × ทุนใหม่) ÷ รวม`
- **ไม่อัปเดตเมื่อเบิกออก**: ราคาตรึงไว้
- **แก้ไข/ลบ stock_in**: คำนวณ avg_cost ใหม่อัตโนมัติ

### สูตรกำไร
```
กำไร = รายรับจริงจาก VMS (grand_total) − (จำนวนซอง × avg_cost)
```

---

## การ Sync ข้อมูล

### อัตโนมัติ (ทุกวัน)
| เวลา | Workflow | ข้อมูล |
|------|---------|--------|
| 00:00 น. | VMS Daily Sync | ยอดขายเมื่อวาน |
| 00:05 น. | VMS Stock Sync | สต็อกหน้าตู้ทั้ง 4 ตู้ |

### Manual (กดปุ่ม)
- **ปุ่ม "ดึงข้อมูล VMS"** ที่หน้ายอดขาย → ดึงยอดขายวันนี้
- **ปุ่ม "ดึงข้อมูล VMS"** ที่หน้าสต็อกหน้าตู้ → ดึงสต็อกปัจจุบัน

### Backfill (ย้อนหลัง)
GitHub Actions → VMS Daily Sync → Run workflow:
- ระบุ `from_date` + `to_date`
- **อย่าดึงเกิน 5 วันต่อครั้ง** (XLSX อาจถูกตัด)

---

## ตู้ขาย (Machines)

| ตู้ | machine_id | VMS record_id | สถานะ |
|-----|-----------|---------------|-------|
| ตู้ที่ 1 | chukes01 | 40 | ใช้งาน |
| ตู้ที่ 2 | chukes02 | 41 | ใช้งาน |
| ตู้ที่ 3 | chukes03 | 42 | **ยังไม่เปิด** |
| ตู้ที่ 4 | chukes04 | 43 | ใช้งาน |

### เพิ่มตู้ใหม่
1. เพิ่มใน VMS
2. เพิ่ม record ในตาราง `machines` ใน Supabase
3. เพิ่ม mapping ใน `deploy/scraper/vms_stock_sync.py` (KIOSKS dict)
4. ระบบจะดึงข้อมูลตู้ใหม่อัตโนมัติ

---

## SKU Reference (21 รายการ)

| กลุ่ม | จำนวน | ซอง/กล่อง | กล่อง/Cotton |
|-------|-------|----------|-------------|
| OP (01-15) | 15 | 24 | 12 |
| PRB 01 | 1 | 10 | **10** |
| PRB 02 | 1 | 10 | **20** |
| EB (01-04) | 4 | 24 | 12 |

---

## จุดเฝ้าระวัง

### 1. การบันทึก Stock In (รับสินค้าเข้า)
- **เลือก SKU ให้ถูกต้อง** — ถ้าเลือกผิด avg_cost จะคลาดเคลื่อน
- ถ้าบันทึกผิด → แก้ไขที่หน้าจัดการสต็อก → กดคำนวณต้นทุนใหม่
- **Lot Number** ควรมี SKU ID ใน prefix (เช่น LOT-20260410-OP01) เพื่อง่ายต่อการตรวจสอบ

### 2. การเบิกสินค้า (Withdrawal)
- **ต้องเลือก SKU ก่อน** ถึงจะเห็น Lot
- ถ้า Lot ที่แสดงมีชื่อไม่ตรง SKU → มีคำเตือน ⚠ แสดงว่าบันทึก stock_in ผิด SKU
- ตรวจสอบ Lot Balance ก่อนเบิก

### 3. ยอดขาย
- **Backfill อย่าเกิน 5 วัน/ครั้ง** — XLSX จาก VMS อาจถูกตัดถ้าข้อมูลมาก
- ถ้ายอดไม่ตรง → ตรวจสอบทีละวัน → ดาวน์โหลด XLSX จาก VMS เองแล้ว import ผ่าน SQL
- Sales API ถูก block (403) → ระบบ fallback ไป Playwright อัตโนมัติ

### 4. สต็อกหน้าตู้
- ข้อมูลอัปเดตวันละ 1 ครั้ง (00:05 น.) หรือกดปุ่มดึงเอง
- ตู้ 3 (chukes03) ยังไม่เปิด → ไม่แสดงในรายงาน
- รายงานเติมสินค้า → Print เฉพาะตู้ที่มีข้อมูล

### 5. เคลม
- **สูญหาย/ชำรุด** → ต้องกดยืนยันก่อนตัดสต็อก
- **คืนสต็อก** → ระบบไม่เพิ่มสต็อกอัตโนมัติ ผู้ใช้ต้องคีย์รับเข้าเอง
- ยอดคืนเงิน → หักจากกำไรอัตโนมัติ

### 6. ต้นทุนเฉลี่ย (avg_cost)
- คำนวณใหม่เมื่อ: เพิ่ม/แก้ไข/ลบ stock_in เท่านั้น
- **ไม่เปลี่ยนเมื่อเบิกออก** (ตรึงราคาไว้)
- ถ้าคลาดเคลื่อน → เลือก SKU → กดปุ่ม "คำนวณต้นทุนใหม่"

---

## GitHub Secrets ที่ต้องตั้ง

| Secret | ค่า |
|--------|-----|
| `VMS_URL` | https://vms.inboxcorp.co.th/th/login |
| `VMS_USERNAME` | username สำหรับ login VMS |
| `VMS_PASSWORD` | password สำหรับ login VMS |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

---

## VMS API (พร้อมใช้เมื่อ InboxCorp เปิดให้)

```
Base URL: https://api.inboxcorp.co.th/internal/v1

POST /auth/                              → { token: "eyJ..." }
GET  /kiosks/                            → รายชื่อตู้ทั้งหมด
GET  /slots/{tab}?kiosk_record_id={id}   → สต็อกแต่ละ slot
GET  /sales/?date_from=...&date_to=...   → ยอดขาย (ถูก block 403)
```

เมื่อ Sales API เปิด → ระบบจะสลับใช้ API อัตโนมัติ ไม่ต้องแก้โค้ด

---

## Claude Code Development Tips

- ไฟล์หลักที่แก้บ่อยที่สุด: `deploy/components/DivisionXApp.jsx`
- ทุก Supabase query อยู่ใน: `deploy/lib/supabase.js`
- Migration ใหม่ → สร้างไฟล์ใน `backend/database/migrations/` + รัน SQL ใน Supabase SQL Editor
- Push ไป `main` → Vercel auto deploy
- GitHub Actions workflow → แก้ที่ `.github/workflows/` (root ไม่ใช่ deploy/)
- Print/PDF → CSS อยู่ใน `deploy/app/globals.css` (@media print)

---

*Last updated: April 2026*
