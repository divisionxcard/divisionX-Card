---
type: worklog
date: 2026-07-25
tags: [branches, public-page, machines, data-driven, config, iconsiam, migration]
commits: [b5a5a9d, 056]
status: ✅ หน้า /branches ดึงสดจาก machines.config · ไอคอนสยามขึ้นแล้ว (12 สาขา)
---

# หน้า /branches เป็น data-driven (แก้ตู้ใหม่ไม่ขึ้นสาขา)

## บริบท (why)
แอดมินแจ้ง [/branches](https://division-x-card.vercel.app/branches) ไม่มีสาขาใหม่ (ไอคอนสยาม pf01)
→ พบว่าหน้านี้ **hardcode 11 สาขาในโค้ด** (`BRANCHES` array) ไม่ได้ดึงจาก machines table
→ เพิ่มตู้กี่ตู้สาขาก็ไม่ขึ้นเอง

## สิ่งที่ทำ
1. **ฝัง branch info ลง `machines.config.branch`** (display_name/floor/landmark/maps/order/public)
   - 12 สาขา (11 เดิม + ไอคอนสยาม pf01) · apply prod ผ่าน PostgREST (merge `config || jsonb` ไม่ทับ key เดิม เช่น machine_id_vendor)
   - **migration 056** บันทึกไว้ reproducible
2. **refactor [page.jsx](../../deploy/app/branches/page.jsx)** — ดึงสดจาก machines (anon key · ISR 60s เหมือน /products)
   - filter `branch.public` · sort `branch.order` · รองรับ floor/landmark ว่าง (ไอคอนสยามยังไม่มี → โชว์ชื่อ+ปุ่มแผนที่)
3. verify prod หลัง deploy: **12 สาขา · ไอคอนสยามขึ้น · บางกะปิไม่ซ้ำ**

## ดีไซน์ที่ตัดสินใจ
- **wwv08 (บางกะปิ ตู้ 2) ไม่ใส่ branch** → ไม่ขึ้นการ์ดซ้ำ (site เดียวกับ wwv02) · ตู้ที่ site เดียวกัน = โชว์สาขาเดียว
- **1 machine = 1 card** ถ้าอยากโชว์ (พระราม 2 มี 2 การ์ด: chukes02 ชั้น 4 + wwv06 ชั้น G เพราะคนละจุด)
- floor/landmark **optional** — ตู้ใหม่ใส่แค่ display_name+maps ก็ขึ้นได้ เติมรายละเอียดทีหลัง

## ต่อยอด / ค้าง
- ⏳ **ไอคอนสยาม floor + landmark** ยังไม่มี (รอแอดมิน) → ตอนนี้โชว์แค่ "ไอคอนสยาม" + ปุ่มแผนที่ ICONSIAM
  · เติมได้ทันทีผ่าน `config.branch.floor/landmark` (PostgREST) ไม่ต้อง deploy
- **เพิ่มตู้ครั้งหน้า** ถ้าอยากขึ้น /branches → ใส่ `config.branch` (public=true) ก็พอ ไม่ต้องแก้โค้ด

## 🔗 เกี่ยวข้อง
[[2026-07-24-add-ww-wwv08-bangkapi2]] · [[2026-07-14-payif-machine-live]] · [[project_add_worldwide_machine]] · [[project_marketing_assignment]]
