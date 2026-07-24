---
type: worklog
date: 2026-07-24
tags: [worldwide, machines, westgate, rama2, wwv04, wwv06, ops, backup-machine, config]
status: ✅ เสร็จ — wwv04 สลับเครื่องใหม่ · wwv06 revert กลับตู้หลัก · sync ผ่านทั้งคู่
---

# เวสต์เกต (wwv04) สลับเครื่องใหม่ + revert พระราม 2 (wwv06) กลับตู้หลัก

## บริบท (why)
เทียบ portal WW (2026-07-24) กับ DB ตอนเพิ่ม [[wwv08]] เจอ 2 จุดเปลี่ยน แอดมินยืนยันแล้ว:
1. **เวสต์เกต** — `VCM650CKN18080003` "เวสต์เกต NEW" โผล่ + เครื่องเดิม `VCM350CKC20120001` หายจาก portal → **สลับเครื่องจริง**
2. **พระราม 2** — ตู้หลัก `VCM350CKC24081204` กลับออนไลน์+เติมของแล้ว (Supply 07-23) · ตู้สำรอง `VCM350CKC24120702` หายจาก portal → **ซ่อมเสร็จ ให้ revert**

## สิ่งที่ทำ (แก้ `machines.config` ผ่าน PostgREST service key)
### (1) wwv04 เวสต์เกต — สลับเครื่องใหม่
- `machine_id_vendor`: `VCM350CKC20120001` → **`VCM650CKN18080003`** (prefix VCM650CKN — รุ่นใหม่)
- เพิ่ม `machine_id_vendor_primary` = `VCM350CKC20120001` (เก็บเลขเดิม เผื่อ revert)
- เพิ่ม `vendor_swap_note` อธิบายการสลับ · อัปเดต `version` → `SXA1B31R.THA251001.014`

### (2) wwv06 พระราม 2 — REVERT กลับตู้หลัก (จบเคส swap 2026-07-13)
- `machine_id_vendor`: `VCM350CKC24120702` (สำรอง) → **`VCM350CKC24081204`** (ตู้หลักเดิม)
- **ลบ** `vendor_swap_note` + `machine_id_vendor_primary` ออก (config กลับสะอาดเหมือนก่อน swap)
- ปิดงานค้างจาก [[2026-07-13-ww-rama2-backup-machine-swap]]

## ผล (verify หลัง trigger `worldwide-stock-sync`)
- **wwv04**: 55 slots · SKU null=0 · sync ตามเครื่องใหม่ VCM650CKN18080003
- **wwv06**: 55 slots · SKU null=0 · sync ตามตู้หลัก VCM350CKC24081204
- data-driven: แก้ config อย่างเดียว ไม่ต้องแตะ scraper

## หมายเหตุ
- ยอดขาย/สต็อกของ wwv04 + wwv06 จะเข้า machine_id เดิมต่อเนื่อง (ประวัติไม่ขาด) — ระบบ map ผ่าน vendor→machine_id
- เวสต์เกต: ถ้าต้อง revert (ไม่น่ามี — เครื่องเดิมถอดถาวร) เลขเดิมอยู่ใน `machine_id_vendor_primary`

## 🔗 เกี่ยวข้อง
[[2026-07-24-add-ww-wwv08-bangkapi2]] · [[2026-07-13-ww-rama2-backup-machine-swap]] · [[project_ww_machines_status]] · [[reference_supabase_rest_access]]
