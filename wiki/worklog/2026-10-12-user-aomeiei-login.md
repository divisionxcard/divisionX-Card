---
type: worklog
date: 2026-10-12
tags: [users, auth, support, profiles]
commits: [ea48f98]
status: ✅ ปิดงาน — เปลี่ยน username เป็น aomeiei แล้วผู้ใช้เข้าได้ (เจ้าของยืนยัน 12 ต.ค.)
---

# ผู้ใช้ "aomeiei" เข้าระบบไม่ได้

เจ้าของแจ้ง 12 ต.ค.: *"ช่วยตรวจสอบยูสเซอร์นี้ให้หน่อย เนื่องจากเข้าใช้งานไม่ได้ aomeiei"*

## ที่ตรวจ

| จุด | ผล |
|---|---|
| Supabase Auth | `thananya.aa41@gmail.com` (id b03fdab6…) สร้าง 12 ก.ย. · ยืนยันอีเมลแล้ว · ไม่ถูกแบน · **last_sign_in ว่าง** |
| profiles | display_name **aomeiei** · username **`aom`** · role `marketing` |
| login_history | ไม่มีแถวของ user นี้เลย (ตารางบันทึกเฉพาะ login/logout ที่สำเร็จ) |
| lookup-email บน Vercel | `aom` → 200 · `aomeiei` → 404 "ไม่พบผู้ใช้" |
| RLS role marketing (076/077) | ติดตั้งแล้ว (RPC `current_app_role` ตอบ 200 · policy `marketing_read_own` มี) |

**สาเหตุ:** ระบบล็อกอินด้วย **username** (`lib/supabase.js → signInWithUsername` → `/api/auth/lookup-email` → อีเมล → รหัสผ่าน)
แต่บัญชีนี้ถูกสร้างให้ username ต่างจากชื่อแสดง (`aom` vs "aomeiei") ผู้ใช้พิมพ์ชื่อแสดง จึงตกที่ด่าน lookup ทุกครั้ง
ไม่เคยไปถึงขั้นตรวจรหัสผ่านเลย

## ที่ทำ

- เจ้าของเลือก "เปลี่ยน username ให้ตรงกับที่เธอพิมพ์" → PATCH `profiles.username` `aom` → `aomeiei` (ตรง regex `^[a-z0-9_]{3,20}$` · ไม่ซ้ำใคร)
- ทดสอบระบบจริง: `aomeiei` → 200 ได้อีเมลถูกต้อง · `aom` → 404
- ไม่ได้แตะรหัสผ่าน — ถ้ายังเข้าไม่ได้ขั้นต่อไปคือรหัสผ่าน (ปุ่ม "ลืมรหัสผ่าน" ด้วย `aomeiei` → ลิงก์ไปอีเมลจริง หรือแอดมินตั้งรหัสชั่วคราวผ่าน admin API)

## บทเรียน

- หน้าจัดการผู้ใช้ (PageUsers) ให้กรอก username กับ display_name แยกกัน → คนสร้างบัญชีมักตั้งชื่อสั้นไว้ที่ username แล้วบอกผู้ใช้แค่ชื่อแสดง
  ถ้าเกิดซ้ำ ควรให้ฟอร์มสร้างผู้ใช้เติม username = display_name อัตโนมัติ (ตัดให้ตรง regex) และโชว์ข้อความ "ใช้ชื่อนี้ล็อกอิน"
- ตรวจ "เข้าไม่ได้" ให้เริ่มจาก `last_sign_in_at` ใน Auth: ว่าง = ไม่เคยผ่านด่านแรก ไม่ต้องไปไล่ RLS/สิทธิ์ก่อน

เกี่ยวข้อง: [[2026-10-10-trend-radar]] · `backend/database/migrations/076_role_marketing.sql`
