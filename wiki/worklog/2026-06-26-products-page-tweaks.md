---
type: worklog
date: 2026-06-26
tags: [web, frontend, marketing, products, content-fix, isr]
commits: [446c724, 0657cf4, 78f4fc7]
---

# /products ปรับแก้ + แก้ข้อมูลผิด "24 ชม." ทั้งระบบ

ต่อจาก [[2026-06-26-public-products-page]] · 3 งานย่อยจาก feedback แอดมิน (2026-06-26)

## 1. เอาราคาออกจาก /products (446c724)
แอดมินขอเอาราคาออก → ลบ `sell_price` / "สอบถามหน้าตู้" จากการ์ด · เหลือรูป+ชื่อ

## 2. แก้ "เปิด 24 ชม." → "เปิดตามเวลาห้าง" ทั้งระบบ (0657cf4)
**why:** ตู้อยู่ในห้าง เปิดตามเวลาห้าง **ไม่ใช่ 24 ชม.** (ข้อมูลผิดที่ผมใส่ไว้หลายจุด)
- หน้าเว็บจริง: /products /branches /how-to (sub + meta + tip)
- สื่อ: qr-standee.html · rich-menu-mockup.html
- คอนเทนต์: chukes01-content-pack (5 จุด) · step1-line-oa-setup-design (3 จุด)
- จุดขายที่ใช้แทน: "กดเองได้ · ไม่ต้องต่อคิว · เติมสดทุกวัน" (จริง + ยังน่าสนใจ)
- ⏳ รอแอดมินยืนยันเวลาเปิด-ปิดจริง → เปลี่ยนเป็นเวลาเป๊ะได้ (เช่น 10:00–22:00)

## 3. ลด ISR cache 3600→60s (78f4fc7)
**why:** แอดมินอัปรูปใน "จัดการ SKU" แล้วไม่ขึ้นบน /products — ติด ISR cache 1 ชม.
- ยืนยัน: `uploadSkuImage` (lib/supabase.js) สร้างไฟล์ URL ใหม่ทุกครั้ง (timestamp) + อัปเดต `skus.image_url` → อัปสำเร็จจริง ติดแค่ cache
- ลด `revalidate` 3600→60 (ทั้ง page-level + fetch) → อัปรูปแล้วเห็นภายใน ~1 นาที · skus แค่ 41 แถว โหลดถี่ได้ไม่กระทบ

## รูปสินค้าอัปเองได้ที่ไหน (ตอบ recurring question)
เว็บแอป → **จัดการสต็อก → แท็บ "จัดการ SKU" (admin)** → ปุ่มรูป "ซอง" (=image_url ที่ /products ใช้) / "กล่อง" (image_url_box) · component `SkuImageManager.jsx` บีบอัด+resize อัตโนมัติ

## 🔗 เกี่ยวข้อง
[[2026-06-26-public-products-page]] · [[reference_brand_visual_identity]] · [[project_marketing_assignment]]
