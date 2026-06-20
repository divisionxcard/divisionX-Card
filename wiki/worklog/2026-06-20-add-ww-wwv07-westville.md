---
type: worklog
date: 2026-06-20
tags: [machines, worldwide, migration, westville]
commits: [052]
---

# เพิ่มตู้ WorldWide wwv07 · เซ็นทรัล เวสต์วิลล์ (ติดตั้งคืน 2026-06-20)

## บริบท (why)
แอดมินแจ้งติดตั้งตู้ WW ใหม่อีก 1 ตู้คืนนี้ที่ เซ็นทรัล เวสต์วิลล์ (ตู้ที่ 2 ในรอบไม่กี่วัน ต่อจาก [[wwv06]] เมื่อวาน) ต้องเพิ่มเข้าระบบให้ sync อัตโนมัติ

ข้อมูลจาก portal: vendor `VCM650CKC19030004` · route บางกรวย · site เซ็นทรัล เวสต์วิลล์ · version `SXA1B31R.THA251001.014`

## สิ่งที่ทำ
- **migration 052** `052_add_worldwide_wwv07.sql` — INSERT/upsert ตู้ [[wwv07]] (id 11) · status=active
- **apply ตรง production** ผ่าน PostgREST (service key) — verify เข้าแล้ว vendor_id ตรง portal ครบทั้ง 7 ตู้ WW
- **wiki** เพิ่ม [[wwv07]] machine page

## ข้อสังเกต
- **vendor prefix VCM650** (ต่างจากตู้อื่นที่เป็น VCM350) — รุ่นตู้อาจต่าง · ไม่กระทบ scraper (อ่าน machine_id_vendor ตรง)
- ⚠️ **ตรวจหลัง sync แรกพรุ่งนี้**: เช็ค SKU null + remain เข้าจริง (เหมือนที่ทำกับ wwv06 — ผ่านสะอาด 54/55 ช่อง 0 null)
- data-driven: INSERT อย่างเดียว ไม่ต้องแก้ scraper (ดู memory project_add_worldwide_machine)

## 🔗 เกี่ยวข้อง
[[wwv07]] · [[2026-06-19-add-ww-wwv06-rama2]] · [[2026-06-03-add-ww-machines]] · project_ww_machines_status
