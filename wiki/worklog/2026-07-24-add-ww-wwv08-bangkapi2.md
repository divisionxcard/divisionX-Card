---
type: worklog
date: 2026-07-24
tags: [machines, worldwide, migration, bangkapi, wwv08]
commits: [055]
status: ✅ เพิ่ม wwv08 เข้า production แล้ว · trigger stock sync แล้ว
---

# เพิ่มตู้ WorldWide wwv08 · เดอะมอลล์ไลฟ์สโตร์ บางกะปิ (ตู้ที่ 2)

## บริบท (why)
แอดมินแจ้งว่าเมื่อคืน (2026-07-23) มีตู้ WW ใหม่ในพอร์ทัล — ไฮไลต์ `VCM350CKC25090603` route เขตบางกะปิ site "เดอะมอลล์ไลฟ์สโตร์ บางกะปิ NEW"
บางกะปิ **มี wwv02 (`VCM350CKC20050001`) อยู่แล้ว** → ตู้นี้เป็น **ตู้ที่ 2 ที่ site เดียวกัน คนละ vendor** = ตู้ใหม่จริง (ไม่ใช่ swap)

## สิ่งที่ทำ
- **migration 055** `055_add_worldwide_wwv08.sql` — INSERT ตู้ [[wwv08]] (id 13 · ต่อจาก pf01=ตู้ที่ 12) · status=active · brand=worldwide
- **apply ตรง production** ผ่าน PostgREST (service key, upsert `resolution=merge-duplicates`) — verify เข้าแล้ว รวม WW เป็น 8 ตู้ (wwv01–08)
- **trigger `worldwide-stock-sync`** ทันที (workflow_dispatch) ไม่รอ cron
- version portal: `SXA1B31R.THA251001.014`

## ความเปลี่ยนแปลงอื่นใน portal ที่เจอ (ยังไม่แตะ — รอยืนยันแอดมิน)
เทียบ portal 24 ก.ค. กับ DB นอกจากตู้ใหม่ยังพบ 2 จุด:
1. **เวสต์เกต swap?** — `VCM650CKN18080003` "เซ็นทรัล เวสต์เกต NEW" โผล่ + ตู้เดิม wwv04 (`VCM350CKC20120001`) **หายจาก portal** → ดูเหมือนสลับเครื่อง (เหมือนเคสพระราม 2) · ถ้าใช่ → แก้ `machines.config.machine_id_vendor` ของ wwv04
2. **พระราม 2 ตู้หลักกลับมา** — ตู้หลัก `VCM350CKC24081204` กลับออนไลน์ (Supply 07-23, เติมของแล้ว) · ตู้สำรอง `VCM350CKC24120702` หายจาก portal → **ถึงเวลา revert wwv06** กลับ `...24081204` (ดู [[2026-07-13-ww-rama2-backup-machine-swap]])

## ข้อสังเกต
- vendor prefix `VCM350` ปกติ (เหมือนตู้ส่วนใหญ่) · ไม่กระทบ scraper (data-driven อ่าน machine_id_vendor ตรง)
- ⚠️ **ตรวจหลัง sync แรก**: เช็ค SKU null + remain เข้าจริง (เหมือน wwv06/07)
- data-driven: INSERT อย่างเดียว ไม่ต้องแก้ scraper (ดู memory project_add_worldwide_machine)

## 🔗 เกี่ยวข้อง
[[wwv08]] · [[2026-06-20-add-ww-wwv07-westville]] · [[2026-06-19-add-ww-wwv06-rama2]] · [[project_ww_machines_status]] · [[project_add_worldwide_machine]]
