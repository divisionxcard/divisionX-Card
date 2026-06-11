---
type: worklog
date: 2026-06-11
tags: [kingpower, aot, planning, knowledge-base, docs]
commits: []
---

# วางแผนงาน + KB โปรเจค King Power / AOT (ลงตู้สนามบิน)

admin ติดต่อ King Power ขอลงตู้ใหม่ที่สนามบิน · KPS ส่งคู่มือ "พัฒนาโปรแกรม POS สำหรับตู้ Vending"
มาให้ทำตาม · ขอให้ทำความเข้าใจ + เขียนแผนผังงาน + บันทึกเป็น knowledge base (2026-06-11)

## สิ่งที่ทำ
1. อ่านครบทุกไฟล์ในโฟลเดอร์คู่มือ (PDF/doc/docx — สกัดด้วย pdf-parse/adm-zip ชั่วคราว เพราะเครื่องไม่มี poppler/Word)
2. สร้าง [[kingpower-aot-plan]] — แผนผังงาน 5 เฟส (Mermaid flowchart + critical path + Gantt),
   จุดตัดสินใจ build-vs-จ้าง, checklist รวม
3. สร้าง [[kingpower-aot-reference]] — knowledge base สเปคเต็ม: Text File V9 (5 datasets/52 ฟิลด์),
   RCAgent/RCMonitor, ขั้นตอนภาษี (ภ.พ.06/09), อนุมัติราคา KPS, ผู้ติดต่อ, POS supplier ทางเลือก
4. เพิ่ม [[../projects/README|projects index]] + memory `project_kingpower_aot`

## ประเด็นสำคัญ (why)
- **คนละ track กับระบบปัจจุบัน** — เดิมดึงยอดจาก VMS/WorldWide (passive) · อันนี้ตู้ต้องเป็น POS
  ออกใบกำกับภาษีอย่างย่อ + ขอ RC Code realtime ต่อบิล + ส่ง Text File เอง
- **คอขวด = RD ID จากสรรพากร** (~1 เดือน) กั้นการทดสอบ SIT/UAT → เริ่มงานภาษีก่อน ทำคู่ขนานกับพัฒนา
- **จุดตัดสินใจค้าง:** ตู้ WorldWide/VMS ฝัง RCAgent (.NET/Java/Android) ได้ไหม — ถ้าไม่ได้
  พิจารณาจ้าง POS supplier ที่ผ่าน AOT แล้ว · ยังไม่ได้ตอบ ต้องเช็คกับ vendor ตู้
- ต้นฉบับคู่มือ **ไม่ commit เข้า git** (โฟลเดอร์ "คู่มือ - พัฒนาโปรแกรม POS สำหรับตู้ Vending")

## งานค้างต่อ
- ตัดสินใจ build เอง vs จ้าง POS supplier (ต้องเช็คความสามารถ controller ตู้ WW/VMS ก่อน)
- ขอเอกสารชุดจดทะเบียนจาก KPS (สัญญา/หนังสือยินยอม) เพื่อเริ่มงานสรรพากร
- ลิงค์ SharePoint คู่มือพัฒนา/ทดสอบของ KingPower (อยู่ในไฟล์ ICT)
