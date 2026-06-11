---
type: worklog
date: 2026-06-11
tags: [ui, frontend, favicon, branding, nextjs]
commits: [94e9708, e282743]
---

# เพิ่ม favicon โลโก้ DC บนแท็บเบราเซอร์

admin ขอเปลี่ยนโลโก้บนแท็บเบราเซอร์ (2026-06-11) — เดิมเป็นไอคอนลูกโลก default

## ต้นเหตุ
- [[../../deploy/app/layout.jsx|layout.jsx]] ตั้งแค่ `metadata.title/description` · **ไม่เคยมี favicon**
- ไม่มีไฟล์ icon/favicon ใน `app/` หรือ `public/` → เบราเซอร์ fallback เป็นลูกโลก

## งานที่ทำ
- copy `deploy/public/logo.jpg` (โลโก้ DC · 500×500 · สี่เหลี่ยมจัตุรัสพอดี) → `deploy/app/icon.jpg`
- ใช้ **Next.js App Router file convention** (`app/icon.(jpg|png|...)`) → Next สร้าง
  `<link rel="icon">` ให้อัตโนมัติ · ไม่ต้องแก้ layout/metadata เอง
- เลือก logo.jpg แทน logo.png เพราะ jpg เป็น square 500×500 พอดี (png = 457×414 ไม่ square)

## verify
- รัน `npm run dev` → HTML มี `<link rel="icon" href="/icon.jpg?..." type="image/jpeg" sizes="500x500"/>`
- `GET /icon.jpg` → HTTP 200

## รอบ 2: crop ให้ DC เต็มกรอบ (e282743)
- admin แจ้งรูปเล็กมาก (ขอบดำเยอะ · DC ลอยกลางจอ)
- เครื่องไม่มี python/imagemagick/sharp → ใช้ **jimp** (pure JS · ไม่ต้อง build native) ติดตั้งใน
  temp dir ชั่วคราว · scan หา bounding box ของพิกเซลขาว (bright>70) = โลโก้จริง = 246×210 px
- ครอปเป็น square 306px (center bbox + padding 12%) → resize 512×512 → `app/icon.png`
- ลบ `icon.jpg` เดิมออก (เหลือ icon เดียว กัน Next สร้าง link ซ้ำ) · ลบ temp dir
- **ทำไมใช้ bounding box อัตโนมัติ ไม่ใส่พิกัดเดา**: กัน clip ตัว DC · robust ถ้าเปลี่ยนโลโก้ในอนาคต

## หมายเหตุ (why / ข้อจำกัด)
- favicon ถูก browser cache แรง → ต้อง hard refresh (Ctrl+Shift+R) ถึงเห็นทันที · จริงบน prod หลัง Vercel deploy
- ยัง include ข้อความ "DIVISION X CARD" เล็กๆ ใต้ DC (อยู่ใน bbox) · อ่านไม่ออกตอน 16px แต่ไม่กวน
