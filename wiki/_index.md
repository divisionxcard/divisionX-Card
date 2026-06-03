---
type: index
---

# DivisionX Card — Knowledge Base

> 🤖 ไฟล์ทั้งหมดใน vault นี้เขียนและดูแลโดย LLM agent
> 📅 อัปเดตล่าสุด: 2026-05-22 (sample data — รอ agent เริ่ม run จริง)

## 🔍 ภาพรวม

### ตู้ขาย
**VMS (InboxCorp)**
- [[chukes01]] — ตู้ที่ 1 (ใช้งาน)
- [[chukes02]] — ตู้ที่ 2 (ใช้งาน)
- [[chukes03]] — ตู้ที่ 3 (ยังไม่เปิด)
- [[chukes04]] — ตู้ที่ 4 (ใช้งาน)

**WorldWide Vending**
- [[wwv01]] — ตู้ที่ 5 · เซ็นทรัล รามอินทรา (ใช้งาน)
- [[wwv02]] — ตู้ที่ 6 · เดอะมอลล์ บางกะปิ (ใช้งาน)
- [[wwv03]] — ตู้ที่ 7 · เซ็นทรัล ศาลายา (ใช้งาน · ใหม่ 2026-06-03)
- [[wwv04]] — ตู้ที่ 8 · เซ็นทรัล เวสต์เกต (ใช้งาน · ใหม่ 2026-06-03)
- [[wwv05]] — ตู้ที่ 9 · ยานนาวา (เตรียมติดตั้ง · ใหม่ 2026-06-03)

### SKU Groups
- **OP series** (01-15) — [[OP01]] · [[OP05]] · ...
- **PRB series** (01-02) — [[PRB01]] · [[PRB02]]
- **EB series** (01-04) — [[EB01]] · ...

## 📊 รายงานล่าสุด

### Discrepancies (ข้อมูลไม่ตรงกัน)
- [[2026-05-21-chukes01-OP01]] — ตัวอย่าง

### Monthly Closes
- _ยังไม่มีรายงาน — agent จะสร้างเมื่อสิ้นเดือน_

## 🎯 Top Issues (สรุปจาก agent)

_ส่วนนี้ agent จะอัปเดตทุกคืน_

## 🛠 Worklog (บันทึกการทำงาน)
- [[worklog/2026-06-03-add-ww-machines|2026-06-03]] — เพิ่มตู้ WW wwv03/wwv04 · แก้ vendor_id wwv02 · harden scraper
- [[worklog/2026-06-03-fix-ww-vendor-and-fk|2026-06-03]] — แก้บั๊ก vendor_id อ่านผิด + FK crash (sku OP 16) + wwv05

## 📖 Quick Links
- [[README]] — วิธีใช้ vault
- [[worklog/README|Worklog]] — บันทึกงานพัฒนาทั้งหมด
