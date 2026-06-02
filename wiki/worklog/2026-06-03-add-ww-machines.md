---
type: worklog
date: 2026-06-03
tags: [machines, worldwide, scraper, frontend]
commits: [94c81e5, 0ffcf60, aff4c35]
---

# เพิ่มตู้ WorldWide ใหม่ 2 ตู้ (wwv03, wwv04)

## บริบท
ติดตั้งตู้ WorldWide Vending ใหม่ 2 ตู้ (ช่วงติดตั้งคาดเสร็จเกือบเช้า 2026-06-03) ต้องเพิ่มเข้าระบบให้รองรับ sync อัตโนมัติ

## สิ่งที่ทำ

### 1. เพิ่มตู้ใหม่ + แก้ vendor_id เดิม → migration 042
`backend/database/migrations/042_add_worldwide_wwv03_wwv04.sql`
- [[wwv03]] · เซ็นทรัล ศาลายา · `VCM350CKC25070006` · status=active
- [[wwv04]] · เซ็นทรัล เวสต์เกต · `VCM350CKC25120001` · status=active
- แก้ vendor_id ของ [[wwv02]] : `VCM350CKC20050001` → `VCM350CKC25050001` (พิมพ์ผิดตำแหน่งที่ 11 · ทำให้ scraper ดึง wwv02 ไม่ได้มาตลอด)
- รัน SQL ใน Supabase SQL Editor + verify ผ่าน REST API ครบ 4 ตู้ (wwv01–04) vendor_id ตรง portal
- commit `94c81e5`

> 💡 **Key insight:** ตู้ WorldWide เป็น data-driven — scraper อ่านจากตาราง `machines` (brand='worldwide', config.machine_id_vendor) โดยตรง **ไม่ต้องแก้โค้ด** ต่างจาก VMS/chukes ที่ต้องแก้ KIOSKS dict ใน `vms_stock_sync.py`

### 2. Harden stock scraper — ตู้เดียวพังไม่ลามทั้ง sync
`deploy/scraper/worldwide_stock_sync.py`
- loop ดึง stock ทีละตู้เดิม **ไม่มี try/except** → ถ้าตู้ใหม่ (ยังติดตั้งไม่เสร็จ) คืน HTTP error จะ crash ทั้ง sync ตู้ที่ทำงานปกติไม่ได้อัปเดต
- เพิ่ม try/except ต่อตู้ · log + ข้ามตู้ที่พัง · เก็บ `failed_machines` · คง fail-loud เดิม (ทุกตู้พังถึง error)
- commit `0ffcf60`
- (sales scraper ปลอดภัยอยู่แล้ว — ดึง order list รวมทุกตู้ทีเดียว)

### 3. Frontend — หน้าสต็อกหน้าตู้แสดงตู้ใหม่ทันที
`deploy/components/pages/PageMachineStockView.jsx`
- เดิม derive รายชื่อตู้จาก `machine_stock` เท่านั้น → ตู้ใหม่ที่ยังไม่ sync ไม่โผล่
- แก้: `machineIds` = ตู้ status=active จากตาราง machines ∪ ตู้ที่มี machine_stock (ตู้ inactive เช่น [[chukes03]] ยังไม่แสดง)
- ตู้ที่ยังไม่มี slot → แสดง "ยังไม่มีข้อมูลสต็อก · รอ scraper"
- build ผ่าน · commit `aff4c35`

## ผล
- ตู้ใหม่ sync อัตโนมัติ: stock 00:15 น. · sales 00:10 น. (เวลาไทย) หรือ trigger workflow `worldwide-stock-sync` เอง
- ทั้ง 3 commit push ขึ้น `origin/main` แล้ว · Vercel auto-deploy

## เกี่ยวข้อง
- [[wwv01]] · [[wwv02]] · [[wwv03]] · [[wwv04]]
- ดูวิธีเพิ่มตู้ WW ในอนาคต: memory `project_add_worldwide_machine`
