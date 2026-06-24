---
type: worklog
date: 2026-06-24
tags: [web, frontend, marketing, line-oa, branches, public-page]
commits: [fe96b4e]
---

# หน้า public /branches — ปลายทาง rich menu "ทุกสาขา"

## บริบท (why)
กำลังทำ rich menu LINE OA (งานการตลาด [[project_marketing_assignment]]) · ปุ่ม "ทุกสาขา" ต้องลิงก์ไปหน้าจริง · เลือกทำหน้าแบรนด์เองบนแอป Vercel (แทน Google My Maps) เพื่อคุมดีไซน์ + อยู่บนโดเมนเราเอง + ต่อยอดได้

## สิ่งที่ทำ
- เพิ่ม route **public** `deploy/app/branches/page.jsx` (App Router · server component · ไม่ติด auth เหมือนหน้า admin)
- 11 สาขา (ชื่อ+ชั้น+landmark ตามแอดมินให้) · ปุ่ม "นำทาง" gen ลิงก์ Google Maps จากชื่อห้าง
- โทน **Navy + Neon Cyan** ใช้ token `--dx-*` จาก globals.css (แอปใช้ธีมนี้อยู่แล้ว = ตรง brand identity ฟ้านีออน [[reference_brand_visual_identity]])
- responsive (เปิดจาก LINE บนมือถือ) · footer LINE @Divisionxcard + 086-386-3219
- `npm run build` ผ่าน → `/branches` เป็น static page · push main → Vercel auto-deploy

## ข้อสังเกต / ต่อยอด
- ข้อมูลสาขา **hardcode ในไฟล์** (marketing copy เปลี่ยนน้อย + floor/landmark ไม่มีใน DB) — ถ้าอยาก data-driven ต้องเพิ่ม field ใน machines.config
- พระราม 2 มี 2 สาขา: ชั้น 4 (chukes02 VMS) + ชั้น G (wwv06 WW) — แสดงแยกถูกต้อง
- URL ปลายทาง: `division-x-card.vercel.app/branches` → เอาไปตั้งใน rich menu ปุ่มช่อง 1
- ต่อยอด: โชว์ "ของในตู้ตอนนี้" ต่อสาขา (ดึง machine_stock) ได้ในอนาคต

## 🔗 เกี่ยวข้อง
[[reference_brand_visual_identity]] · [[execution-playbook-8steps]] (สเต็ป 1) · [[step1-line-oa-setup-design]] · [[project_marketing_assignment]]
