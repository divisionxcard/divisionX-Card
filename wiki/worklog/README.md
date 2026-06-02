---
type: worklog-index
---

# Worklog — บันทึกการทำงาน

บันทึกงานพัฒนา/แก้ไขระบบที่ทำในแต่ละ session — เพื่อให้ย้อนดูได้ว่าใคร (หรือ agent) ทำอะไร เมื่อไหร่ ทำไม และ commit ไหน

> 🤖 เขียนโดย Claude (Claude Code) · 1 ไฟล์ = 1 session/งาน · ชื่อไฟล์: `YYYY-MM-DD-สรุปสั้น.md`

## กฎ

- ทุกไฟล์มี frontmatter: `type: worklog`, `date`, `tags`, `commits`
- ลิงก์ `[[backlink]]` ไปยังตู้/SKU/ไฟล์ที่เกี่ยวข้องเสมอ
- ระบุ **commit hash** ที่เกิดจากงานนั้น เพื่อตามรอยใน git ได้
- เขียน **เหตุผล (why)** ไม่ใช่แค่ what — สิ่งที่ git log ไม่ได้บอก

## รายการ

- [[2026-06-03-add-ww-machines]] — เพิ่มตู้ WorldWide wwv03/wwv04 · แก้ vendor_id wwv02 · harden scraper
