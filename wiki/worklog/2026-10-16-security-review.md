---
type: worklog
date: 2026-10-16
tags: [security, web, supabase, rls, github-actions]
commits: [abef00a]
status: ✅ แก้ในโค้ดแล้ว 6 จุด (ข้อมูลรายรับเปิดโล่ง · ช่องรันคำสั่งใน poster workflow · header · webhook · image proxy) · 🟡 รอเจ้าของ: ปิด signup · รัน migration 081 · ตัดสินเรื่อง repo สาธารณะ
---

# ตรวจความปลอดภัยเว็บหลังบ้าน

เจ้าของถาม (16 ต.ค.): *"เว็บหลักหลังบ้านคือ division-x-card.vercel.app แต่หน้าสาขาชื่อ …/branches
ลูกค้าที่เป็นโปรแกรมเมอร์มีสิทธิรู้หรือเดาและเจาะเข้าหน้าเว็บหลักของเราได้ง่ายหรือไม่"*

## คำตอบสั้น

- **รู้ URL ไม่ใช่ปัญหา** — URL ไม่เคยเป็นความลับ (โดเมนเดียวกัน ใครก็เดาได้) ความปลอดภัยจริงอยู่ที่การล็อกอิน + สิทธิ์ในฐานข้อมูล + ด่านของทุก API
- **สิ่งที่ดีอยู่แล้ว:** หน้า `/` ไม่มีข้อมูลก่อนล็อกอิน · คนไม่ล็อกอินอ่านตารางไม่ได้สักตาราง (401/42501 ครบ 23 ตาราง) ·
  API ส่วนใหญ่ตรวจ token กับ Supabase ฝั่งเซิร์ฟเวอร์ · service key ไม่หลุดเข้าเบราว์เซอร์ · ไม่มี secret ใน commit ไหนเลย (988 commits)
- **แต่เจอช่องจริงหลายจุด** — บางจุดไม่ต้องเจาะเลย เปิดให้อ่านอยู่แล้ว (ตารางข้างล่าง)

## ที่เจอ (ยืนยันซ้ำเองทุกข้อก่อนแก้)

| ระดับ | เรื่อง | สถานะ |
|---|---|---|
| สูง | `/api/wiki-insights` ไม่มีด่าน — เรียกแบบไม่ล็อกอินได้ 200 พร้อมรายรับ 30 วัน ค่าธรรมเนียม กำไรรายชุด · `?limit=` ไม่มีเพดาน | ✅ แก้: `requireStaff` (admin/user) + เพดาน 50 · widget ส่ง token |
| สูง | GitHub repo เป็น **สาธารณะ** — มี `wiki/skus/*.md` (ต้นทุน กำไร สต็อก) · worklog · แผน King Power · โค้ด/migration ทั้งหมด | 🟡 เจ้าของตัดสิน (ดูข้างล่าง) |
| สูง | เปิดให้สมัครสมาชิกเอง (`disable_signup: false`) + policy `<> 'marketing'` = บัญชีไม่มีบทบาทได้สิทธิ์เต็มทุกตาราง | 🟡 migration 081 + เจ้าของปิด signup · ตรวจแล้ว**ยังไม่มีคนนอกสมัคร** (6 บัญชี มีบทบาทครบ) |
| สูง | `poster-render.yml` เอา `sku` จากหน้าเว็บไปต่อสตริงคำสั่งแล้ว `eval` บนเครื่องที่ถือ service key | ✅ แก้: รับผ่าน env + ตรวจรูปแบบ + ไม่มี eval · route ตรวจ sku ก่อนส่ง · `permissions: contents: read` |
| กลาง | `approve_withdrawal_request` (SECURITY DEFINER) คนไม่ล็อกอินเรียกได้ ไม่ตรวจบทบาท | 🟡 migration 081 |
| กลาง | บัญชี `user` แก้ `profiles.role` ตัวเองเป็น admin ได้ | 🟡 migration 081 (profiles อ่านอย่างเดียวผ่านเว็บ) |
| กลาง-ต่ำ | `/api/auth/lookup-email` บอกอีเมลจริงของ username ใดก็ได้ (เดาชื่อผู้ใช้ได้ + เห็นอีเมล) · ไม่มีจำกัดจำนวนครั้ง | ⏳ ยังไม่แก้ — ต้องย้ายการล็อกอินไปฝั่งเซิร์ฟเวอร์ ทดสอบกับบัญชีจริง |
| ต่ำ | ไม่มี security header (หน้าล็อกอินถูกฝังใน iframe เว็บอื่นได้) | ✅ แก้: X-Frame-Options · frame-ancestors · nosniff · Referrer-Policy |
| ต่ำ | webhook Telegram "ไม่ได้ตั้ง secret = ไม่ตรวจ" | ✅ แก้: ปฏิเสธเสมอเมื่อไม่มี secret |
| ต่ำ | `/api/img` ส่งต่อชนิดไฟล์อะไรก็ได้จากต้นทาง | ✅ แก้: รับเฉพาะรูปบิตแมป + nosniff (ตอนนี้ไม่มีหน้าไหนใช้ route นี้) |
| ต่ำ | route ซิงค์ตู้หลายตัวใช้ `requireUser` (บัญชีการตลาดสั่งได้) · `next dev` เปิดรับทั้ง LAN · รหัสผ่านขั้นต่ำ 6 ตัว | ⏳ ทีหลัง |

## เรื่อง repo สาธารณะ — ให้เจ้าของตัดสิน

- ทำให้เป็น private ได้ใน GitHub → Settings → General → Danger Zone → Change visibility
- บัญชี `divisionxcard` เป็นบัญชีบุคคล (User) → Vercel Hobby ยัง deploy จาก repo private ได้
- ข้อแลก: private repo ได้นาที GitHub Actions ฟรี 2,000 นาที/เดือน (public ไม่จำกัด) — งานที่รันบน Actions ตอนนี้: เรนเดอร์คลิป/โปสเตอร์ · เก็บไอเดีย/โพสต์อัตโนมัติ (ซิงค์รายวันย้ายไปบอทในเครื่องแล้ว)
- ของที่เคยเปิดไปแล้ว (clone/fork เก่า) เรียกคืนไม่ได้ — private กันได้แค่ต่อจากนี้

## วิธีตรวจที่ใช้

ผู้ช่วยตรวจแบบอ่านอย่างเดียว (ไม่สร้างบัญชี ไม่ส่งอีเมล ไม่เขียนฐานข้อมูล ไม่ brute force) แล้วยืนยันซ้ำเองทุกข้อ:
GET ด้วย anon key ทุกตาราง · `/auth/v1/settings` · OpenAPI ของ PostgREST (service key) · อ่านโค้ดทุก route ใน `deploy/app/api/` · workflow ที่หน้าเว็บสั่งได้

เกี่ยวข้อง: [[2026-10-16-phone-number-change]] · migration `backend/database/migrations/081_security_hardening.sql`
