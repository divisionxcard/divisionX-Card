---
type: worklog
date: 2026-07-14
tags: [bugfix, vercel, build, deploy, supabase, utf8, incident]
commits: [ebdec13, 1f08581]
severity: high — production ค้างมา 8 วัน
---

# 🚨 Vercel deploy พังมาตั้งแต่ 6 ก.ค. — supabase.js invalid UTF-8

## อาการ
เพิ่มปุ่ม "ดึงข้อมูล Payif" แล้วปุ่มไม่ขึ้นบนเว็บ · เช็ก `/api/payif-stock-sync` บน prod = **404**
เข้า Vercel Deployments → **ทุก deploy ตั้งแต่ 6 ก.ค. (cfd3a67) เป็น Error หมด** · prod ที่ live จริงค้างที่ `2e70b0d` (4 ก.ค.)
→ งานทั้งหมดหลัง 4 ก.ค. (marketing pages, ปุ่ม Payif ฯลฯ) **ไม่เคยขึ้น production เลย**

## Root cause
```
Error: Failed to read source code from /vercel/path0/deploy/lib/supabase.js
Caused by: stream did not contain valid UTF-8
> Build failed because of webpack errors
```
commit **cfd3a67** ("security: add auth...") ทำให้ **ท้ายไฟล์ `deploy/lib/supabase.js` ถูกตัดกลางคัน**:
- คอมเมนต์ไทยบรรทัดสุดท้ายขาดครึ่ง `...ตู้ที่เลื�` → multi-byte เพี้ยน = **invalid UTF-8**
- ฟังก์ชัน `getLatestStockSyncedAt` หายทั้งอัน (ไฟล์จบดื้อ ๆ ไม่มี newline)
- **Windows (เครื่อง dev) อ่านผ่าน** `npm run build` เลย pass · แต่ **Vercel/Linux (Rust loader) เข้มกว่า reject** → build ตาย

## แก้
- working tree มีตัวเต็มถูกต้องอยู่แล้ว (valid UTF-8 + ฟังก์ชันครบ) — commit เฉพาะ `supabase.js` (ebdec13)
- เติมคอมเมนต์ + `getLatestStockSyncedAt()` (poll helper: max synced_at ของ machine_stock ต่อตู้) ให้ครบ

## บทเรียน
- **`npm run build` บน Windows ผ่าน ≠ Vercel ผ่าน** — encoding (UTF-8) กับ Rust loader เข้มกว่า
- คอมเมนต์/ข้อความไทยในโค้ด เสี่ยงถ้าไฟล์ถูกตัด/save ผิด encoding → ควรเช็ก `git diff` ตอน commit ว่ามี `\ No newline` + byte เพี้ยนไหม
- deploy Error สะสมเงียบ ๆ ได้นาน (prod ค้าง 8 วันไม่มีใครรู้ จนบังเอิญเจอตอนปุ่มไม่ขึ้น) → ควรมี alert เมื่อ Vercel deploy fail

## เจอเพิ่ม: ไม่ใช่แค่ supabase.js — cfd3a67 ตัดหลายไฟล์
หลังแก้ supabase.js แล้ว stash working tree → build HEAD → เจอ **ไฟล์ที่ 2**:
`app/api/admin/users/route.js` ตัดที่บรรทัด 135 (`co` ค้าง) = Syntax Error
→ commit `cfd3a67` **ตัดหลายไฟล์กลางคัน** · working tree มีตัวเต็มค้างเป็น `M` (build ผ่าน) แต่ไม่เคย commit

**กู้ตัวเต็ม (1f08581):** commit ไฟล์ M ทั้งหมดที่ cfd3a67 ตัด —
api/{admin/users,img,stock-sync,vms-sync,worldwide-stock-sync,worldwide-sync} +
components/{PageSales,PageStock,PageUsers,RestockSessionPanel} (admin/users 134→149 บรรทัด)
→ build HEAD ผ่าน (stash-free) · push

**วิธีจับให้ครบ:** `git stash` ไฟล์ M ออก แล้ว `npm run build` = เทสต์ตรงกับที่ Vercel build (HEAD)
อย่าเชื่อ build ที่มี working-tree M ปน — มันปิดบั๊กที่ committed truncation

## บทเรียนเพิ่ม
- working tree M ที่ค้างนาน = อันตราย: build ในเครื่องผ่านเพราะใช้ working tree · แต่ HEAD (Vercel) พัง
- commit ที่ "ตัดไฟล์" (มี `\ No newline` + บรรทัดขาดครึ่ง) = สัญญาณ tool/save เพี้ยน — ควร review diff ก่อน push เสมอ

## 🔗 เกี่ยวข้อง
[[2026-07-14-payif-machine-live]] · commit cfd3a67 (security) ต้นเหตุ
