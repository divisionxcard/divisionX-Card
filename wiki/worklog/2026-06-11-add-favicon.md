---
type: worklog
date: 2026-06-11
tags: [ui, frontend, favicon, branding, nextjs]
commits: [94e9708]
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

## หมายเหตุ (why / ข้อจำกัด)
- เครื่อง dev ไม่มี python/imagemagick/sharp → ไม่ได้ crop ตัด · ตัว DC มีขอบดำรอบ
  พอย่อเป็น 16px จะเล็กกว่าที่ควร · ถ้าต้องการ DC เต็มกรอบกว่านี้ ต้อง crop ด้วย image tool ภายหลัง
- favicon ถูก browser cache แรง → ต้อง hard refresh (Ctrl+Shift+R) ถึงเห็นทันที · จริงบน prod หลัง Vercel deploy
