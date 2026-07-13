---
type: worklog
date: 2026-07-13
tags: [worldwide, machines, rama2, wwv06, ops, backup-machine]
status: temporary — ต้อง revert เมื่อตู้หลักซ่อมเสร็จ
---

# สลับตู้ WW พระราม 2 (wwv06) ไปเครื่องสำรองชั่วคราว

## เหตุ
ตู้หลัก WW ที่เซ็นทรัล พระราม 2 ชำรุด — Status แดงในพอร์ทัล WW, อัปเดตค้างตั้งแต่ 07-10 16:47
ต้องสลับไปเครื่องสำรองที่หน้างานติดตั้งแทน

## ตู้ที่เกี่ยวข้อง (พอร์ทัล WW)
| Machine ID (vendor) | Site | สถานะ |
|---|---|---|
| VCM350CKC24081204 | เซ็นทรัล พระราม 2 | **ชำรุด** (ตู้หลักเดิม) |
| VCM350CKC24120702 | เซ็นทรัล พระราม 2 (เครื่องสำรอง) | ใช้งาน → สลับมาใช้ตัวนี้ |

## สิ่งที่ทำ
- ระบบเรา map ตู้ WW ผ่าน `machines.config.machine_id_vendor` (ใช้ทั้ง `worldwide_stock_sync.py` และ `worldwide_sales_api.py` — build lookup {vendor_id: machine_id})
- แก้ config ของ **wwv06** (เซ็นทรัล พระราม 2) ผ่าน PostgREST (service key):
  - `machine_id_vendor`: `VCM350CKC24081204` → **`VCM350CKC24120702`**
  - เพิ่ม `machine_id_vendor_primary` = `VCM350CKC24081204` (เก็บเลขตู้หลักเดิมไว้ revert)
  - เพิ่ม `vendor_swap_note` อธิบายว่าเป็นการสลับชั่วคราว
- key อื่นใน config (version, portal_url, integration_status) คงเดิมครบ

## ผล
- ยอดขาย + สต็อกหน้าตู้ของตู้สำรอง จะเข้า **wwv06 (พระราม 2)** ต่อเนื่อง — ประวัติไม่ขาด ไม่รวมกับตู้อื่น
- ไม่ต้องแก้ scraper (data-driven ผ่าน machines table) · ไม่ต้องสร้าง machine record ใหม่

## ⚠️ ต้อง REVERT เมื่อตู้หลักซ่อมเสร็จ
แก้ `machines.config.machine_id_vendor` ของ wwv06 กลับเป็น **`VCM350CKC24081204`**
(ค่าเดิมอยู่ใน `machine_id_vendor_primary` แล้ว) แล้วลบ `vendor_swap_note`/`machine_id_vendor_primary` ออกได้

## 🔗 เกี่ยวข้อง
[[project_ww_machines_status]] · [[project_add_worldwide_machine]] · [[reference_supabase_rest_access]] · [[reference_manual_stock_sync_buttons]] · migration 050 (เพิ่ม wwv06) · 051 (แท็ก brand พระราม 2)
