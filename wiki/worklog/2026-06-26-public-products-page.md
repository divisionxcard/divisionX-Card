---
type: worklog
date: 2026-06-26
tags: [web, frontend, marketing, line-oa, products, catalog, public-page]
commits: [bd4427a]
---

# หน้า public /products — ปลายทาง rich menu "ดูสินค้าทั้งหมด"

## บริบท (why)
ต่อจาก [[2026-06-24-public-branches-page]] + [[2026-06-24-how-to-page]] · ปุ่ม "ดูสินค้าทั้งหมด" ใน rich menu LINE ต้องมีปลายทาง · ทำหน้าแคตตาล็อกให้ลูกค้ากดดูสินค้าในตู้ทั้งหมดได้

## สิ่งที่ทำ
- เพิ่ม route public `deploy/app/products/page.jsx` (server component · โทน Navy+Cyan ตาม [[reference_brand_visual_identity]])
- **ดึงสดจาก DB** — fetch ตาราง `skus` (41 รายการ active) ผ่าน PostgREST + env `NEXT_PUBLIC_SUPABASE_*` (anon)
- **ISR `revalidate=3600`** → ราคา/สินค้าใหม่อัปเดตเองทุก 1 ชม. ไม่ต้อง build ใหม่
- จัดกลุ่มตาม `franchise`: One Piece (OP/EB/PRB 22) · Pokémon 3 · Yu-Gi-Oh 3 · Dragon Ball 9 · Naruto 3 · Solo Leveling 1
- การ์ดแสดง: รูป (`image_url`) + ชื่อ + ราคา (`sell_price`) · **ราคา 0 → "สอบถามหน้าตู้"** (กันโชว์ ฿0 สำหรับ SKU ที่ยังไม่ตั้งราคา: OP16/FB07/PKM Ghost/YGH×3)
- responsive 2→4 คอลัมน์ · footer ลิงก์แอด LINE (lin.ee/9cMKVRm) + ไปหน้า /branches
- `npm run build` ผ่าน (prerender static + ISR) · push main → Vercel auto-deploy
- URL: `division-x-card.vercel.app/products` → ตั้งใน rich menu ปุ่ม "ดูสินค้าทั้งหมด"

## ข้อสังเกต / ต่อยอด
- รูป/ราคามาจาก DB ตรง → แอดมินแก้ใน skus แล้วหน้าเว็บอัปเดตเอง (ไม่ต้องแตะโค้ด)
- ต่อยอด: โชว์ราคากล่อง (`image_url_box`/box price) · filter ตามแฟรนไชส์ · ลิงก์ไป "มีในสาขาไหน"

## 🔗 เกี่ยวข้อง
[[2026-06-24-public-branches-page]] · [[2026-06-24-how-to-page]] · [[execution-playbook-8steps]] (สเต็ป 1) · [[project_marketing_assignment]]
