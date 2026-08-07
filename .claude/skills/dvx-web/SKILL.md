---
name: dvx-web
description: ใช้เมื่อแก้หน้าเว็บ เพิ่มหน้าใหม่ แก้ UI/การ์ด/กราฟ ทำปุ่ม Print/PDF เขียน API route หรือ dev server มีปัญหา
---

# แก้หน้าเว็บ (Next.js App Router)

## โครงสร้างจริง — ⚠️ CLAUDE.md ล้าสมัยตรงนี้

CLAUDE.md เขียนว่า "ทุกหน้าอยู่ใน `DivisionXApp.jsx`" — **ไม่จริงแล้ว** ตอนนี้แยกออกมาแล้ว

```
deploy/app/page.jsx              หน้าแอปหลัก (หลัง login)
deploy/app/marketing/page.jsx    /marketing · branches · products · how-to · design-system
deploy/app/api/**/route.js       API routes (ฝั่ง server — ใช้ service key ได้)

deploy/components/DivisionXApp.jsx        เชลล์ + เมนู + routing ระหว่างหน้า (~870 บรรทัด)
deploy/components/pages/PageXxx.jsx       เนื้อของแต่ละหน้า 17 ไฟล์  ← แก้หน้าไหนแก้ที่นี่
deploy/components/shared/dx-components.jsx  ← component กลาง ใช้ตัวนี้เสมอ
deploy/lib/supabase.js                    query function ทุกตัว (~1100 บรรทัด)
deploy/app/globals.css                    รวม @media print
```

### ⚠️ มี `KpiCard` อยู่ 3 ไฟล์ — ใช้ตัวเดียวเท่านั้น
```
✅ deploy/components/shared/dx-components.jsx   ← ตัวจริง ทุกหน้า import ตัวนี้
❌ deploy/components/shared/KpiCard.jsx         ← ของเก่า ไม่มีใครใช้
❌ deploy/components/pages/ShipFailsSection.jsx ← ตัว local ในไฟล์นั้น
```
`import { KpiCard, SectionTitle, Badge, StatusDot, BoosterPH } from "../shared/dx-components"`

## กฎ UI ที่เจ้าของกำหนด

**KpiCard** — ตัวเลขต้องขนาดเท่ากันทุกใบ · ไม่เกิน **5 ใบต่อแถว** · ไอคอนมุมขวาบน

**สีแบรนด์** — ฟ้านีออนไฟฟ้า + สายฟ้า + โครเมียม บนพื้นกรมท่า (**ไม่ใช่ดำ-ทอง**)
ใช้กับงานออกแบบทุกชิ้น รวมถึงภาพประกอบและสื่อการตลาด

**ภาษา** — UI เป็นภาษาไทยทั้งหมด รวม comment ในโค้ดด้วย

## Print / PDF — ห้ามใช้ `@media print` + `visibility:hidden`

เคยลองแล้วไม่เวิร์ก ให้ใช้ **`window.open(blobUrl)`** สร้างหน้าใหม่แล้วสั่งพิมพ์แทน
ดูตัวอย่างที่ `PageRefillPrep.jsx` และ `PageSlots.jsx`

## API route

ทุก route ที่แตะตารางที่ล็อก RLS ต้อง gate ด้วย `requireAdmin` จาก `lib/apiAuth`
และใช้ `SUPABASE_SERVICE_ROLE_KEY` — **ห้ามให้ browser query ตารางพวกนี้ตรง ๆ**

```js
const gate = await requireAdmin(req)
if (gate.error) return gate.error
```

⚠️ ถ้า route อ่านข้อมูลที่อาจเกิน 1000 แถว **ต้องแบ่งหน้า** ไม่งั้นตัวเลขจะผิดแบบเงียบ ๆ
(ดู `dvx-db` — เคยทำยอดขายหายไป 82,000 บาทโดยไม่มี error)

## 🔧 dev server 500 หลังรัน `npm run build`

**สาเหตุ:** production build เขียนทับ `.next/` ที่ dev server กำลังใช้อยู่
**แก้:** หยุด dev server → ลบ `.next` → `npm run dev` ใหม่
**เลี่ยง:** อย่ารัน `npm run build` ขณะ dev server เปิดอยู่ — ถ้าจะเช็ก build ให้ปิด dev ก่อน

## Deploy

push ขึ้น `main` → Vercel auto deploy
production: **https://division-x-card.vercel.app** (มี hyphen — ไม่ใช่ `divisionx-card`)

env var ที่เพิ่มใหม่ต้องไปใส่ใน Vercel dashboard ด้วย (ติ๊ก Production + Preview)
แล้ว **redeploy** — env var ใหม่ไม่มีผลกับ deployment ที่ build ไปแล้ว

## ข้อควรรู้

ระบบสต็อกในเว็บ (รับเข้า/เบิก/lot/ต้นทุน) **เจ้าของไม่ได้ใช้จริง** — แอดมินใช้ Excel
ที่ใช้จริงคือ **สต็อกหน้าตู้ (เตรียมของไปเติม)** กับ **ยอดขาย**
→ อย่าเสนอปรับปรุงระบบสต็อกคลังเว้นแต่เจ้าของขอเอง

## เกี่ยวข้อง
`dvx-db` · `dvx-sku` · `dvx-sync`
