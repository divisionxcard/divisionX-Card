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
- [[2026-06-03-fix-ww-vendor-and-fk]] — แก้บั๊ก vendor_id อ่านผิด (042) + FK crash จาก sku 'OP 16' + เพิ่ม wwv05
- [[2026-06-03-add-ww-op16-pkm-ygh-skus]] — เพิ่ม 5 sku (OP 16 + PKM Ghost + YGH×3) + แก้ map · "Limited Over Collection" = The Revals
- [[2026-06-06-fix-skuid-null-unpushed-map]] — export "สินค้าไม่มีชื่อ" · ต้นเหตุ map commit ไม่ถูก push → nightly sync null sku_id · VMS ก็โดน (Pokemon Ghost) · patch DB + push
- [[2026-06-11-rename-wwv05-seacon-bangkae]] — wwv05 placeholder "ยานนาวา" → ชื่อจริง "ซีคอน บางแค" หลังติดตั้ง · DB+migration 047+wiki
- [[2026-06-11-add-favicon]] — เพิ่ม favicon โลโก้ DC บนแท็บ · app/icon.jpg ตาม Next.js convention · เดิมเป็นลูกโลก default
- [[2026-06-11-kingpower-aot-plan-kb]] — วางแผน + KB โปรเจค King Power/AOT ลงตู้สนามบิน · แผนผัง 5 เฟส + สเปค Text File V9
