---
type: worklog
date: 2026-07-04
tags: [bugfix, sales, frontend, supabase, pagination]
commits: [3d7cc8a]
---

# แก้ยอดขายล่าสุดไม่แสดง (ตั้งแต่ 30 มิ.ย.)

## อาการ
แอดมินแจ้ง: ยอดขายไม่แสดงตั้งแต่ 30 มิ.ย. แม้ sync แล้ว (พร้อมภาพ alert scraper FAIL เก่า มิ.ย.)

## ตรวจสอบ (สำคัญ: ข้อมูลไม่ได้หาย)
- alert FAIL ในภาพ = **ของเก่า** (commit 964ca2f · 2 มิ.ย. · ตอนติดตั้ง wwv03-05) · WW scraper 15 รันล่าสุด fail 0 ✅
- **DB ปกติ 100%**: ยอดขายทุกตู้ (11 ตู้) มีถึง 3 ก.ค. · ทุกวัน 200-300 รายการ · sync ทำงานปกติ
- → ปัญหาอยู่ที่ **การแสดงผลหน้าเว็บ ไม่ใช่ข้อมูล**

## Root cause
- หน้ายอดขายโหลด "ตั้งแต่ 1 พ.ค." = **14,775 แถว** · Supabase cap **1,000 แถว/request**
- `getSalesByMachine` (lib/supabase.js) แบ่งหน้า (pagination) ด้วย `.range()` **โดยไม่มี `.order()`**
  → PostgREST ไม่การันตีลำดับเมื่อไม่มี ORDER BY → พอ >1,000 แถว **แถวใหม่สุด (ก.ค.) หลุด/ซ้ำ** = ยอดล่าสุดหาย (ตรงกับ "ตั้งแต่ 30 มิ.ย.")

## แก้
- `getSalesByMachine`: เพิ่ม `.order("id", { ascending: true })` ก่อน `.range()` → pagination คงที่ ครบทุกแถว
- `getTopSkus`: เดิม **ไม่ paginate เลย** → โดน cap 1,000 (30 วันมี 7,000+ แถว → Top SKU เพี้ยน) → เพิ่ม pagination + order เหมือนกัน
- build ผ่าน · push main → Vercel auto-deploy

## หลัง deploy
- แอดมิน **hard-refresh (Ctrl+Shift+R)** หน้ายอดขาย → ยอด ก.ค. ควรแสดงครบ
- ⚠️ ต้นเหตุคือข้อมูลโตเกิน 1,000 แถว → ระวังฟังก์ชันอื่นที่ paginate/ดึง sales ต้อง order เสมอ

## 🔗 เกี่ยวข้อง
[[reference_supabase_rest_access]] · getSalesByMachine/getTopSkus ใน deploy/lib/supabase.js
