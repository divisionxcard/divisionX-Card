---
type: worklog
date: 2026-08-04
tags: [marketing, frontend, nextjs, supabase, postgrest, bug]
commits: [324e8a9, 8492d43, 6f6b2cb]
status: ✅ apply migration + seed 11 ชิ้นเข้าตารางแล้ว · เหลือดูหน้าจอจริงด้วย user admin
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

## 🐛 บั๊กที่ 2 — PostgREST batch insert ต้องมี key ชุดเดียวกัน

ตอน seed ยิง 11 แถวทีเดียวได้ `400 Bad Request` แต่ยิงทีละแถวผ่านหมด
สาเหตุ: **PostgREST บังคับให้ทุก object ในอาร์เรย์ insert มี key ชุดเดียวกัน**
(`All object keys must match`) — record จาก `content_suggestions` มี `source_sku`
แต่จาก `content_queue` ไม่มี

แก้ด้วยการ normalize ให้ครบชุด `FIELDS` ก่อนส่ง · รันซ้ำแล้วได้ `จะเพิ่ม 0` (idempotent ยังทำงาน)

## ผล seed
11 แถว — `pending` 3 (ร่าง AI · จะขึ้นในโซน A) · `approved` 8 (คิวเดิมที่คนคัดแล้ว)

### 🔍 ปัญหาคุณภาพข้อมูลที่เห็นตอน seed (ของเดิม ไม่ใช่ของใหม่)
- **แถว 2 เป็นภาษาญี่ปุ่นทั้งโพสต์** — Ollama หลุดโทนแบรนด์ตอนสร้าง
  `content_suggestions.json` · ควรใส่ข้อบังคับภาษาไทยใน prompt ของ `content_suggester.py`
- **แถว 7 เขียนว่า "มี 11 สาขาแล้ว"** แต่ตอนนี้ตู้ active 13 ตู้ — คอนเทนต์ค้างเก่า
  ถ้าโพสต์ออกไปจะให้ข้อมูลผิด · ควรดึงจำนวนสาขาจาก `machines` ตอนสร้างคอนเทนต์

ทั้งสองข้อเป็นเหตุผลที่โซน A ต้องมีคนกดอนุมัติ — ไม่ใช่ปล่อยโพสต์อัตโนมัติ

## ค้าง
- เปิด `/marketing` ด้วย user role=admin ดูหน้าจอจริง (**ยังไม่ได้ทดสอบด้วย token admin** — ไม่มี credential)
- ปุ่ม "โพสต์แล้ว" ยังไม่มีบน UI — ต้องมีถึงจะเริ่มเก็บ `posted_at` ให้กราฟหมุดวันโพสต์ทำงาน

ทดสอบไปแล้ว: `npm run build` ผ่าน · `/marketing` ตอบ 200 · API ทั้ง 3 เส้นตอบ 401
เมื่อไม่มี token · ตัวเลข metrics ตรงกับ `dvx_data` · seed idempotent

## 🔗 เกี่ยวข้อง
[[marketing-os-page]] · [[2026-08-04-mcp-server-phase2]] · [[project_marketing_assignment]] · [[feedback_kpi_card_design]] · [[reference_supabase_rest_access]]
