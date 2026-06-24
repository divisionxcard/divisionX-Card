---
type: worklog
date: 2026-06-24
tags: [web, frontend, marketing, line-oa, how-to, public-page]
commits: [bed6790]
---

# หน้า public /how-to — ปลายทาง rich menu "วิธีการซื้อ"

## บริบท (why)
ต่อจาก [[2026-06-24-public-branches-page]] · ปุ่ม "วิธีการซื้อ" ใน rich menu LINE ต้องมีปลายทาง · ทำหน้าสอนกดตู้ที่ใช้ซ้ำได้ทุกสาขา (เนื้อหากลาง ไม่ผูกสาขา)

## สิ่งที่ทำ
- เพิ่ม route public `deploy/app/how-to/page.jsx` (server component · โทน Navy+Neon Cyan ตาม [[reference_brand_visual_identity]])
- 4 ขั้นตอน: เลือกการ์ด → ยืนยันรายการ → ชำระเงิน → รับสินค้า · + เกร็ดน่ารู้ (24ชม./ลุ้นแรร์/ติดปัญหาทักไลน์) · ปุ่มลิงก์ไป /branches
- responsive · `npm run build` ผ่าน (static) · push main → Vercel auto-deploy
- URL: `division-x-card.vercel.app/how-to` → ตั้งใน rich menu ช่อง 3

## ⚠️ จุดที่ต้อง verify กับเครื่องจริง
- ขั้นตอน "ชำระเงิน" เขียนแบบกลาง ("สแกน QR/ตามหน้าจอ") — **ปรับให้ตรง UX ตู้จริง** (วิธีจ่ายที่รองรับ: QR พร้อมเพย์/บัตร/เงินสด?) ถ้าแอดมินยืนยันวิธีจ่ายที่แท้จริงแล้วค่อยแก้ข้อความ

## 🔗 เกี่ยวข้อง
[[2026-06-24-public-branches-page]] · [[execution-playbook-8steps]] (สเต็ป 1) · [[project_marketing_assignment]]
