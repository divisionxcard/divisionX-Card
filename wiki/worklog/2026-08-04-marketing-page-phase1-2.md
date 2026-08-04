---
type: worklog
date: 2026-08-04
tags: [marketing, frontend, nextjs, supabase, postgrest, bug]
commits: [324e8a9]
status: ⏳ โค้ดเสร็จ+build ผ่าน — รอ apply migration 059 แล้ว seed ถึงจะใช้ได้จริง
---

# หน้า /marketing เฟส 1+2 — กล่องอนุมัติ + สายพาน + ตัวเลข

## บริบท (why)
ต่อจากแบบใน [[marketing-os-page]] — ทำเฟส 1+2 ที่ใช้ของที่มีอยู่แล้วล้วน
ไม่ต้องรอ approval จาก Meta หรือสมัคร API ใด ๆ เพื่อให้เห็นหน้าตาจริงก่อนตัดสินใจลงทุนเฟส 3–5

## สิ่งที่ทำ

| ไฟล์ | หน้าที่ |
|---|---|
| `migrations/059_marketing_content.sql` | ตารางคิวคอนเทนต์ + RLS ปิดตาย |
| `app/api/marketing/content/route.js` | GET คิว · PATCH อนุมัติ/แก้/ทิ้ง · POST เพิ่มเอง |
| `app/api/marketing/pipeline/route.js` | สถานะ 8 workflow จาก GitHub Actions API |
| `app/api/marketing/metrics/route.js` | KPI + ยอดรายวัน + หมุดวันที่โพสต์ |
| `components/MarketingOS.jsx` | หน้าจอ 4 โซน |
| `agents/seed_marketing_content.py` | ย้ายของจาก `tasks/*.json` ลง DB (idempotent) |

### ทำไมต้องมี DB ไม่ใช่แก้ JSON ต่อ
`content_queue.json` ใช้ได้ตอนรันสคริปต์ในเครื่อง แต่ **Vercel เป็น serverless
filesystem อ่านอย่างเดียว** — กดอนุมัติบนเว็บแล้วเขียนกลับไฟล์ไม่ได้ ต้องลง DB สถานเดียว

## 🐛 บั๊กที่เจอระหว่างทาง — PostgREST cap 1000 แถว

ตอนตรวจว่าตรรกะวันไทยฝั่ง JS ตรงกับ Python ไหม เจอตัวเลขไม่ตรง:

```
JS     → 286,260 บาท · 1,257 ซอง
Python → 368,230 บาท · 1,643 ซอง   ← ต่างกัน 82,000 บาท
```

ไล่ดูแล้วไม่ใช่เรื่อง timezone (ขอบ UTC ตรงกันเป๊ะ) แต่เป็น **PostgREST คืนสูงสุด
1000 แถวต่อครั้ง** — `Content-Range: 0-999/1331` ฟ้องชัด

`dvx_data.py` วนดึงทีละ 1000 อยู่แล้ว แต่ `supabase-js` `.select()` เฉย ๆ ไม่วน
**7 วันก็เกิน 1000 แถวแล้ว** แปลว่าหน้าเว็บจะรายงานยอดต่ำกว่าจริง**แบบเงียบ ๆ ทุกครั้ง**
ไม่มี error ไม่มีคำเตือน — เห็นแค่ตัวเลขที่ดูสมเหตุสมผลแต่ผิด

แก้ด้วย `fetchAll()` วน `.range(from, from+999)` จนกว่าจะได้ไม่ครบหน้า
หลังแก้ตรงกับ Python ทั้ง 7 วัน (368,230) และ 30 วัน (1,468,661)

> **บทเรียน:** query ที่แตะ `sales` ห้ามเรียก `.select()` เปล่า ๆ เด็ดขาด
> เขียนคอมเมนต์เตือนไว้เหนือ `fetchAll` แล้ว

## จุดตัดสินใจ
- **route แยก `/marketing`** ไม่ยัดเข้า `DivisionXApp.jsx` ที่ใหญ่มากอยู่แล้ว
  แต่ใช้ auth เดิม (`requireAdmin`) และ reuse `KpiCard` ให้หน้าตาเข้าชุดกับ ops app
- **RLS ปิดตาย + service key ฝั่ง server เท่านั้น** — หน้านี้จะเห็นค่าโฆษณา/กำไรในเฟส 4
  ไม่ควรให้ anon key แตะได้ตั้งแต่แรก
- **โซน B/ROAS ขึ้นเป็นการ์ดบอกว่าติดอะไร** ไม่ใช่ช่องเปล่าหรือเลข 0 หลอกตา
- **"โพสต์ช่วยไหม" มีธงเตือนเมื่อข้อมูลน้อย** — ถ้าวันที่โพสต์ < 3 วัน จะขึ้นสีเหลืองว่า
  ยังสรุปไม่ได้ กันตีความ correlation จาก sample เล็กเกินไป

## ค้าง — ต้องทำก่อนใช้จริง
1. **apply `059_marketing_content.sql`** ใน Supabase SQL Editor (ตามกติกา repo — รันมือ)
2. `py deploy/agents/seed_marketing_content.py --dry-run` แล้วรันจริง
3. เปิด `/marketing` ด้วย user role=admin

ทดสอบไปแล้ว: `npm run build` ผ่าน · `/marketing` ตอบ 200 · API ทั้ง 3 เส้นตอบ 401
เมื่อไม่มี token · ตัวเลข metrics ตรงกับ `dvx_data`
**ยังไม่ได้ทดสอบด้วย token admin จริง** (ไม่มี credential)

## 🔗 เกี่ยวข้อง
[[marketing-os-page]] · [[2026-08-04-mcp-server-phase2]] · [[project_marketing_assignment]] · [[feedback_kpi_card_design]] · [[reference_supabase_rest_access]]
