---
type: worklog
date: 2026-06-13
tags: [slot-tracking, refill, restock-session, cron, scraper, frontend]
commits: [8cb2a21]
---

# รอบจัดของ: ดึง baseline สด + cron sync รอบเช้า (รองรับเติมช่วงห้างปิด)

ปรับ Slot Refill Tracking เฟส 2 ([[2026-06-13-slot-refill-tracking-phase2]]) ตาม constraint การทำงานจริง (2026-06-13)

## Context สำคัญ (why)
แอดมิน **เข้าไปเติม/จัดของได้เฉพาะช่วงห้างปิด** = หลัง 22:00 ถึงก่อน 10:00 (ระหว่าง 10:00-22:00 ห้างเปิดเข้าไม่ได้)
→ ช่วงจัดของจริง **ไม่มีการขายเลย** → ถ้า sync ก่อน/หลังจัดของในช่วงนี้ จะได้ window ที่ขาย=0 = ตัวเลขเติมแม่นสุด

## สิ่งที่ทำ
### 1. ปุ่ม "เริ่มรอบจัดของ" ดึง baseline สดก่อน
- เดิม: เริ่ม = สร้าง session ทันที ใช้ sync ล่าสุดเป็น baseline (อาจเก่า + window คร่อมยอดขายทั้งวัน)
- ใหม่: เริ่ม → **sync สต็อกสดก่อน** (รอ ~1-2 นาที) → แล้วค่อยสร้าง session
  → before = สต็อก ณ ตอนเริ่มจัด (ห้างปิด) · after = ตอนจัดเสร็จ (ห้างปิด) → ขาย=0 → `เติม = after − before` ตรงๆ ไม่พึ่ง sold_between
- แยก logic sync+poll เป็น `syncAndWait()` ใช้ร่วมทั้ง start/finish (ลดโค้ดซ้ำ) · มี spinner + นับเวลาระหว่างรอ

### 2. cron stock sync เพิ่มรอบเช้า
- VMS `0 2 * * *` = 09:00 น.ไทย · WW `10 2 * * *` = 09:10 น.ไทย (ของเดิม 00:05/00:15 ยังอยู่)
- **why 09:00**: ก่อนห้างเปิด 10:00 · window 00:05→09:00 อยู่ในช่วงห้างปิดทั้งหมด (ขาย=0)
  → จับการเติมข้ามคืนอัตโนมัติแบบ window สะอาด **แม้แอดมินไม่กดปุ่มเลย**

## ผลลัพธ์
- กดปุ่ม → baseline สด → ตัวเลขเติมสะอาด (ไม่พึ่งการหักยอดขาย)
- ลืมกดปุ่ม → cron เช้าจับให้ + window สะอาดอยู่ดี (เพราะห้างปิด)
- สูตร `(after−before)+sold_between` ยังถูกเสมอ · การเปลี่ยนนี้แค่ทำให้ "สะอาดขึ้น" ไม่ใช่แก้ความถูกต้อง

## ทดสอบ
- `npm run build` ผ่าน · syncAndWait reuse logic เดิมที่ verify แล้ว (handleFinish)
- ⚠️ ยังไม่ได้ทดสอบ flow เริ่ม-sync สดบน browser จริง (จะ trigger sync จริง) — verify ตอนใช้งาน

## 🔗 เกี่ยวข้อง
[[2026-06-13-slot-refill-tracking-phase2]] · [[2026-06-13-slot-refill-tracking-phase1]] · [[project_slot_refill_tracking_design]]
