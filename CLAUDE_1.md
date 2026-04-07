# CLAUDE.md — Project DivisionX Card

## Project Overview

**Project Name:** DivisionX Card
**Business Type:** ตู้ขายการ์ด One Piece (Vending Machine Card Business)
**Current Scale:** 3 ตู้จำหน่าย (มีแผนขยายในอนาคต)
**Sales Platform:** [VMS InboxCorp](https://vms.inboxcorp.co.th/th/login)

---

## Business Context

DivisionX Card เป็นธุรกิจตู้ขายการ์ด One Piece Card Game โดยปัจจุบันมีตู้จำหน่ายทั้งหมด 3 ตู้
ระบบนี้ถูกออกแบบมาเพื่อจัดการสต็อก การเติมสินค้าในตู้ และวิเคราะห์ยอดขายของแต่ละตู้และแต่ละ SKU

---

## Scope of Work (ขอบเขตงาน)

### Feature 1 — Stock Management (จัดการสต็อกสินค้า)
- บันทึกการซื้อสินค้าเข้าจากแหล่งจำหน่ายต่างๆ (Supplier/Source)
- ระบุแหล่งที่มา, จำนวน, ราคาต่อหน่วย, วันที่ซื้อ ของแต่ละรายการ
- รองรับการซื้อหลายแหล่งพร้อมกัน

### Feature 2 — Stock Summary & Receiving (สรุปยอดคงเหลือและรับเข้าสต็อก)
- สรุปยอดสต็อกคงเหลือแบบ Real-time แยกตาม SKU
- บันทึกประวัติการรับสินค้าเข้า (Receiving Log)
- แสดง stock movement history

### Feature 3 — Withdrawal / Replenishment (เบิกสินค้าเติมตู้)
- บันทึกการเบิกสินค้าออกจาก stock เพื่อเติมในแต่ละตู้จำหน่าย
- ระบุปลายทาง: ตู้ที่ 1, 2, หรือ 3 (รองรับการขยายตู้ในอนาคต)
- บันทึกวันเวลาและจำนวนที่เบิกออกต่อครั้ง

### Feature 4 — Daily/Monthly Sales Summary (สรุปยอดขาย)
- ดึงข้อมูลยอดขายโดยตรงจาก: `https://vms.inboxcorp.co.th/th/login`
- สรุปยอดขายรายวันและรายเดือน แยกตามแต่ละตู้
- แสดงผลในรูปแบบ Dashboard / Report

### Feature 5 — SKU Sales Analytics (วิเคราะห์ยอดขายแต่ละ SKU)
- วิเคราะห์ยอดขายของทุก 21 SKU
- จัดอันดับ SKU ที่ขายดีที่สุด (Best Sellers)
- วิเคราะห์ช่วงเวลาที่ขายดี (Peak Hours / Peak Days)
- แสดงแนวโน้มการขายในรูปแบบกราฟ

---

## Data Models (โครงสร้างข้อมูล)

### Vending Machines
```
machines:
  - id: machine_1 | machine_2 | machine_3
  - name: string (ชื่อตู้/ตำแหน่ง)
  - location: string
  - status: active | inactive
```

### SKUs (21 รายการ)
```
skus:
  - sku_id: string (e.g., OP-001 … OP-021)
  - name: string (ชื่อการ์ด/ชุด)
  - price: number (ราคาต่อหน่วย)
  - unit: string
```

### Stock Transactions
```
stock_in:
  - date: datetime
  - source: string (ชื่อ Supplier)
  - sku_id: ref → SKU
  - quantity: number
  - unit_cost: number
  - total_cost: number
  - note: string

stock_out (withdrawal):
  - date: datetime
  - machine_id: ref → Machine
  - sku_id: ref → SKU
  - quantity: number
  - note: string
```

### Sales Data (from VMS)
```
sales:
  - date: datetime
  - machine_id: ref → Machine
  - sku_id: ref → SKU
  - quantity_sold: number
  - revenue: number
```

---

## External Integrations

| Service | URL | Purpose |
|---------|-----|---------|
| VMS InboxCorp | https://vms.inboxcorp.co.th/th/login | ดึงข้อมูลยอดขายจากตู้ทั้ง 3 ตู้ |

> **Note:** การดึงข้อมูลจาก VMS ต้องผ่าน login session ของระบบ — ใช้ session-based scraping (Playwright/Puppeteer) และเก็บ credentials ใน environment variables เท่านั้น **ห้าม hardcode ใน source code หรือไฟล์ใดๆ ทั้งสิ้น**

---

## Environment Variables

สร้างไฟล์ `.env` ที่ root ของโปรเจค และ **add `.env` ใน `.gitignore` ทุกครั้ง**

```env
# VMS InboxCorp Credentials
VMS_URL=https://vms.inboxcorp.co.th/th/login
VMS_USERNAME=<your_username>
VMS_PASSWORD=<your_password>

# Database
DATABASE_URL=<your_database_connection_string>

# App
NODE_ENV=development
PORT=3000
```

### .gitignore (บังคับมี)

```gitignore
# Environment
.env
.env.local
.env.production

# Dependencies
node_modules/
__pycache__/

# Build
.next/
dist/
```

> ⚠️ **สำคัญ:** ห้าม commit ไฟล์ `.env` หรือ credentials ขึ้น Git ทุกกรณี — ติดต่อทีมเพื่อขอ credentials ผ่านช่องทางที่ปลอดภัยเท่านั้น

---

## Key Business Rules (กฎสำคัญของระบบ)

1. **Stock คงเหลือ** = รวม stock_in ทั้งหมด − รวม stock_out ทั้งหมด แยกตาม SKU
2. **ห้าม** เบิกสินค้าเกินจำนวนที่มีใน stock (validation required)
3. ยอดขายจาก VMS เป็น **source of truth** สำหรับ revenue
4. แต่ละตู้มี **inventory อิสระ** จากกัน (เติมแยกกัน ขายแยกกัน)
5. ระบบต้องรองรับ **การเพิ่มตู้ใหม่** โดยไม่ต้องแก้โค้ด (machine_id dynamic)

---

## SKU Reference (21 SKUs)

### หน่วยการนับ (Unit Structure)

| หน่วย | ความสัมพันธ์ | หมายเหตุ |
|-------|-------------|----------|
| **Cotton** | 1 Cotton = 12 กล่อง | หน่วยใหญ่สุด (ซื้อเข้าสต็อก) |
| **กล่อง (Box)** | 1 กล่อง = 12 ซอง | หน่วยกลาง |
| **ซอง (Pack)** | — | หน่วยขาย (จำหน่ายจากตู้) |

> ⚠️ **ข้อยกเว้น:** SKU กลุ่ม PRB (PRB 01, PRB 02) — 1 กล่อง = **10 ซอง** (ไม่ใช่ 12)

### ตาราง SKU ทั้งหมด

| # | SKU ID | ชื่อชุด | ซอง/กล่อง | กล่อง/Cotton |
|---|--------|---------|-----------|-------------|
| 1 | OP 01 | One Piece Card Game OP-01 | 12 | 12 |
| 2 | OP 02 | One Piece Card Game OP-02 | 12 | 12 |
| 3 | OP 03 | One Piece Card Game OP-03 | 12 | 12 |
| 4 | OP 04 | One Piece Card Game OP-04 | 12 | 12 |
| 5 | OP 05 | One Piece Card Game OP-05 | 12 | 12 |
| 6 | OP 06 | One Piece Card Game OP-06 | 12 | 12 |
| 7 | OP 07 | One Piece Card Game OP-07 | 12 | 12 |
| 8 | OP 08 | One Piece Card Game OP-08 | 12 | 12 |
| 9 | OP 09 | One Piece Card Game OP-09 | 12 | 12 |
| 10 | OP 10 | One Piece Card Game OP-10 | 12 | 12 |
| 11 | OP 11 | One Piece Card Game OP-11 | 12 | 12 |
| 12 | OP 12 | One Piece Card Game OP-12 | 12 | 12 |
| 13 | OP 13 | One Piece Card Game OP-13 | 12 | 12 |
| 14 | OP 14 | One Piece Card Game OP-14 | 12 | 12 |
| 15 | OP 15 | One Piece Card Game OP-15 | 12 | 12 |
| 16 | PRB 01 | One Piece Premium Booster 01 | **10** ⚠️ | 12 |
| 17 | PRB 02 | One Piece Premium Booster 02 | **10** ⚠️ | 12 |
| 18 | EB 01 | One Piece Extra Booster 01 | 12 | 12 |
| 19 | EB 02 | One Piece Extra Booster 02 | 12 | 12 |
| 20 | EB 03 | One Piece Extra Booster 03 | 12 | 12 |
| 21 | EB 04 | One Piece Extra Booster 04 | 12 | 12 |

### สูตรคำนวณจำนวนซองทั้งหมด

```
# สำหรับ OP และ EB ทั่วไป
total_packs = cottons × 12 × 12  →  1 cotton = 144 ซอง

# สำหรับ PRB 01 และ PRB 02
total_packs = cottons × 12 × 10  →  1 cotton = 120 ซอง
```

### Data Model — SKU (อัปเดต)

```
skus:
  - sku_id: string            (e.g., "OP 01", "PRB 01", "EB 04")
  - series: OP | PRB | EB     (กลุ่มสินค้า)
  - packs_per_box: number     (12 สำหรับ OP/EB, 10 สำหรับ PRB)
  - boxes_per_cotton: number  (12 ทุก SKU)
  - sell_price: number        (ราคาขายต่อซอง)
  - cost_price: number        (ต้นทุนต่อซอง)
```

---

## Tech Stack Recommendations

| Layer | Recommendation |
|-------|---------------|
| Backend | Node.js / Python FastAPI |
| Database | PostgreSQL หรือ Supabase |
| Frontend | Next.js + TailwindCSS |
| Charts | Recharts / Chart.js |
| VMS Integration | Playwright / Puppeteer (web scraping) หรือ REST API |
| Auth | JWT / Supabase Auth |
| Hosting | Vercel (Frontend) + Railway/Render (Backend) |

---

## Development Principles

- **Thai-first UI** — ทุก label และ message ในระบบให้เป็นภาษาไทย
- **Mobile-friendly** — เจ้าของธุรกิจดูยอดขายผ่านมือถือได้
- **Audit trail** — ทุก transaction บันทึก timestamp และ user ที่ทำรายการ
- **Scalable** — ออกแบบให้รองรับตู้ที่ 4, 5 … ในอนาคตโดยไม่ต้องเปลี่ยน schema
- **Data accuracy** — ยอดสต็อกต้องถูกต้อง 100% ทุกเวลา

---

## Claude Behavior Guidelines

เมื่อทำงานกับ Project นี้ให้ปฏิบัติดังนี้:

- ใช้ **ภาษาไทย** ในการตอบสนองเมื่อ user ถามเป็นภาษาไทย
- ใช้ชื่อตู้ว่า "ตู้ที่ 1", "ตู้ที่ 2", "ตู้ที่ 3" ในการสื่อสาร
- เรียก SKU ด้วย SKU ID เสมอ เช่น `OP 01`, `PRB 01`, `EB 04`
- เมื่อ query ยอดขาย ให้ระบุ machine_id และช่วงวันที่เสมอ
- Stock validation: แจ้งเตือนเมื่อ stock ต่ำกว่า threshold ที่กำหนด
- VMS data: ดึงข้อมูลผ่าน authenticated session เท่านั้น อย่า hardcode credentials

---

*Last updated: April 2026 | Version 1.2*
