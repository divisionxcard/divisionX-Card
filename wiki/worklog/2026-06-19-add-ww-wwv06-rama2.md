---
type: worklog
date: 2026-06-19
tags: [machines, worldwide, migration, rama2]
commits: [050, 051]
---

# เพิ่มตู้ WorldWide wwv06 · เซ็นทรัล พระราม 2 (ติดตั้งคืน 2026-06-19)

## บริบท (why)
แอดมินแจ้งว่า **คืนนี้ติดตั้งตู้ WW ใหม่ 1 ตู้ที่ เซ็นทรัล พระราม 2** — ตู้โผล่ใน WW portal แล้ว (inventory 100%, supplied 06-19 16:03) ต้องเพิ่มเข้าระบบให้ sync รอบ 00:15 น. คืนนี้จับอัตโนมัติ

ข้อมูลจาก portal: vendor `VCM350CKC24081204` · route บางขุนเทียน · site เซ็นทรัล พระราม 2 · version `SXA1B31R.THA251001.014`

## สิ่งที่ทำ
- **migration 050** `050_add_worldwide_wwv06.sql` — INSERT/upsert ตู้ [[wwv06]]
  - machine_id=wwv06 (id 10) · location "เซ็นทรัล พระราม 2" · status=active · brand=worldwide
  - config: machine_id_vendor, version, portal_url, integration_status=pending_api_doc
- **apply ตรง production** ผ่าน PostgREST (service key bypass RLS) — verify wwv06 เข้าแล้ว vendor_id ตรง portal ครบทั้ง 6 ตู้ WW
- **wiki** เพิ่ม [[wwv06]] machine page ตาม pattern wwv01-05

## ทำไม INSERT อย่างเดียว (ไม่แก้ scraper)
ตู้ WorldWide เป็น **data-driven** — scraper อ่านจากตาราง machines (brand='worldwide', config.machine_id_vendor) ตรง ไม่ต้องแก้โค้ด (ต่างจาก VMS/chukes ที่ต้องแก้ KIOSKS dict) · ดู memory `project_add_worldwide_machine`

## แยกยอด 2 ตู้ที่พระราม 2 (migration 051)
ที่ เซ็นทรัล พระราม 2 มีตู้ VMS [[chukes02]] อยู่แล้ว → wwv06 เป็นคนละ vendor อยู่ร่วมกัน · แอดมินเน้นย้ำว่า **ห้ามรวมยอด 2 ตู้นี้**

ตรวจโค้ดแล้ว: ระบบ **group ด้วย `machine_id` ทุกจุด** (PageDashboard/MachineStockView/RefillPrep/Analytics) — `location` ใช้แค่ป้ายแสดงผล ไม่เคยเป็น key รวมยอด → **ไม่ต้องแก้ logic** · ค่าธรรมเนียม Ksher ก็แยกถูกตาม brand เอง (chukes02 vms 1.5% · wwv06 ww 0.5% · ดู [[project_payment_gateway]])

เพื่อกันสับสน "สายตาคน" ในลิสต์/รายงาน → **migration 051** เติมแท็ก brand ท้ายชื่อ: chukes02 → `(VMS)` · wwv06 → `(WW)` (apply prod แล้ว · name เป็นแค่ป้ายไม่กระทบ logic)
- ⚠️ **ตรวจหลัง sync แรก (พรุ่งนี้เช้า)**: ถ้ามี SKU ที่ยังไม่อยู่ใน WW scraper map → sku_id null ("สินค้าไม่มีชื่อ") ต้องเพิ่ม map (ดู [[2026-06-06-fix-skuid-null-unpushed-map]])

## 🔗 เกี่ยวข้อง
[[wwv06]] · [[2026-06-03-add-ww-machines]] · [[2026-06-11-rename-wwv05-seacon-bangkae]] · project_add_worldwide_machine · project_ww_machines_status
