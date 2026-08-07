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

**เช็กว่า dev server เปิดอยู่ไหมก่อนเสมอ:**
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```
ถ้าเปิดอยู่ **ไม่ต้อง build** — ใช้ dev server ที่ hot-reload ไปแล้วตรวจแทน:
ยิง `http://localhost:3000/<route>` ถ้าได้ 200 = compile ผ่าน (มี syntax error จะได้ 500)
อยากรู้ว่าโค้ดใหม่เข้า bundle จริงไหม → ดึง `/_next/static/chunks/...` แล้วค้นข้อความในนั้น
(ใช้ได้กับ UI ที่ render ฝั่ง client ซึ่ง SSR HTML จะไม่มี)

## Deploy

push ขึ้น `main` → Vercel auto deploy
production: **https://division-x-card.vercel.app** (มี hyphen — ไม่ใช่ `divisionx-card`)
Vercel root directory = `deploy/` · project `division-x-card`

env var ที่เพิ่มใหม่ต้องไปใส่ใน Vercel dashboard ด้วย (ติ๊ก Production + Preview)
แล้ว **redeploy** — env var ใหม่ไม่มีผลกับ deployment ที่ build ไปแล้ว

### 🔧 push แล้วเว็บไม่เปลี่ยน — GitHub webhook ไม่ยิงไป Vercel

เกิดจริง 2026-08-07: commit `1f47927` push ขึ้น GitHub เรียบร้อย แต่ผ่านไป 37 นาที
Vercel **ไม่มี deployment record และไม่มี check run เลย** ทั้งที่ deploy รอบก่อนหน้า
(1 ชม. ก่อน) ทำงานปกติ → เป็น webhook หลุดชั่วคราว ไม่ใช่การตั้งค่าพัง

**อย่าเพิ่งไปไล่หาบั๊กในโค้ด** ให้แยกก่อนว่า "โค้ดผิด" หรือ "deploy ไม่ขึ้น":

```powershell
# 1. commit ถึง GitHub หรือยัง
(Invoke-RestMethod "https://api.github.com/repos/divisionxcard/divisionX-Card/commits/main").sha

# 2. Vercel รับไป build หรือยัง (deployment record ล่าสุด)
Invoke-RestMethod "https://api.github.com/repos/divisionxcard/divisionX-Card/deployments?per_page=3" |
  ForEach-Object { "$($_.created_at)  $($_.sha.Substring(0,7))" }

# 3. bundle บน production มีของใหม่จริงไหม
$r = Invoke-WebRequest "https://division-x-card.vercel.app/" -UseBasicParsing
$c = ([regex]::Matches($r.Content,'/_next/static/chunks/app/page-[^"]+\.js'))[0].Value
(Invoke-WebRequest "https://division-x-card.vercel.app$c" -UseBasicParsing).Content -match 'ข้อความที่เพิ่งเพิ่ม'
```

ถ้า sha ตรงกันแต่ไม่มี deployment record → **webhook หลุด** แก้ด้วย:
```bash
git commit --allow-empty -m "chore: กระตุ้น Vercel redeploy" && git push origin main
```
หรือให้เจ้าของกด **Redeploy** ใน Vercel dashboard (ชัวร์กว่า เพราะไม่พึ่ง webhook)

**หมายเหตุ:** หน้าแรกถูก CDN cache ~1 ชม. (`x-vercel-cache: HIT`, `age: 3595`)
ตอนตรวจอย่าเชื่อ HTML — เชื่อ **ชื่อไฟล์ chunk ที่เปลี่ยน** และบอกเจ้าของให้กด Ctrl+F5

### git push ค้างไม่จบ
`git push` ค้างจน timeout แต่ `git ls-remote` เร็วปกติ = git รอ credential prompt ที่ตอบไม่ได้
แก้: `GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=echo git push origin main`

### เข้า Vercel dashboard เองไม่ได้
Vercel MCP ต้อง authorize แบบ interactive · Vercel CLI ยังไม่ได้ติดตั้งบนเครื่องนี้
→ ตรวจ deploy ได้แค่ผ่าน GitHub API + ดู bundle ตามข้างบน
ถ้าอยากสั่ง deploy เองได้ ต้องให้เจ้าของ `npm i -g vercel` แล้ว login ครั้งเดียว

## ข้อควรรู้

ระบบสต็อกในเว็บ (รับเข้า/เบิก/lot/ต้นทุน) **เจ้าของไม่ได้ใช้จริง** — แอดมินใช้ Excel
ที่ใช้จริงคือ **สต็อกหน้าตู้ (เตรียมของไปเติม)** กับ **ยอดขาย**
→ อย่าเสนอปรับปรุงระบบสต็อกคลังเว้นแต่เจ้าของขอเอง

## เกี่ยวข้อง
`dvx-db` · `dvx-sku` · `dvx-sync`
