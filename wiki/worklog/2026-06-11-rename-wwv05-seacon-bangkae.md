---
type: worklog
date: 2026-06-11
tags: [machine, worldwide, rename, db, migration]
commits: [d0e8251]
---

# เปลี่ยนชื่อจริง wwv05 · ยานนาวา (placeholder) → ซีคอน บางแค

admin หาตู้ "ซีคอน บางแค VCM350CKC23050301" ที่หน้าเว็บไม่เจอ (2026-06-11)

## ต้นเหตุ
- ตู้ **มีอยู่ในระบบแล้ว** = [[wwv05]] (vendor_id VCM350CKC23050301 ตรง · active · machine_stock 55 แถว sync ปกติ)
- แต่ตอนเพิ่มตู้ ([[2026-06-03-add-ww-machines|migration 044]], 3 มิ.ย.) ตู้ยังไม่ติดตั้ง · portal เป็น
  default "WorldWide Vending" → ใส่ placeholder `location = ยานนาวา` ไว้ก่อน
- 11 มิ.ย. ตู้ติดตั้งจริงแล้ว · portal เปลี่ยนเป็น site "ซีคอน บางแค" / route "ภาษีเจริญ" (inv ~95%)
  → ค้นด้วยชื่อจริงเลยไม่เจอ (DB ยังเป็นชื่อเก่า)

## งานที่ทำ
1. PATCH `machines` (REST) wwv05 → `name = ตู้ที่ 9 (wwv05) · ซีคอน บางแค`, `location = ซีคอน บางแค`
2. migration `047_rename_wwv05_seacon_bangkae.sql` บันทึก rename ไว้ตามรอย
3. แก้ wiki [[wwv05]] → location/route + ลบหมายเหตุ "รอชื่อจริง"
4. config + machine_id_vendor ไม่แตะ · sync ทำงานเดิม

## บทเรียน (why)
- ตู้ WW เพิ่มล่วงหน้าก่อนติดตั้ง = ชื่อ portal เป็น default · **ต้องตามอัปเดตชื่อจริงหลังติดตั้ง**
  ไม่งั้น admin หาที่หน้าเว็บไม่เจอแม้ตู้ทำงานปกติ · เช็คตู้ WW placeholder อื่นเป็นระยะ
