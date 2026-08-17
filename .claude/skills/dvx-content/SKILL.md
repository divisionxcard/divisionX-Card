---
name: dvx-content
description: ใช้เมื่อแก้ระบบเขียนคอนเทนต์การตลาด — ปรับโทน/หลักการเขียน, เพิ่มรูปแบบโพสต์, แก้ prompt, คอนเทนต์ซ้ำ/คุณภาพตก, หรือทำงานกับหน้า /marketing
---

# ระบบเขียนคอนเทนต์ (Marketing OS)

## วงจรทั้งหมด
```
idea_collector.py  →  marketing_ideas  →  [กดเลือก]  →  marketing_content (draft)
   ข่าว/TikTok/                                              ↓ [ให้ AI เขียน]
   YouTube/ข้อมูลเราเอง                              /api/marketing/content/generate
                                                            ↓ pending
                                            [ตรวจ/อนุมัติ] → approved
                                                            ↓
                                        marketing_reminder.py → Telegram ทุกเช้า
                                                            ↓ [กด "โพสต์แล้ว"]
                                                          posted + posted_at
```

## ไฟล์ตั้งค่า — แก้ที่นี่ ไม่ต้องแตะโค้ด

| ไฟล์ | คุมอะไร | เปลี่ยนบ่อยแค่ไหน |
|---|---|---|
| `deploy/tasks/content_voice.json` | **เสียงแบรนด์** — เราเป็นใคร พูดยังไง วลีติดปาก กฎเข้ม + รายการรูปแบบโพสต์ | เปลี่ยนตอนรีแบรนด์ |
| `deploy/tasks/content_craft.json` | **ฝีมือการเขียน** — hook, framework (AIDA/PAS/BAB/FAB...), CTA, ธรรมเนียมแพลตฟอร์ม, สิ่งที่ห้ามทำ | แทบไม่เปลี่ยน (หลักสากล) |
| `deploy/tasks/idea_sources.json` | แหล่งข่าว/คีย์เวิร์ด/ช่อง YouTube | เปลี่ยนตามซีซั่น |

**แยก voice กับ craft ตั้งใจ** — สองอย่างนี้เปลี่ยนคนละจังหวะ ถ้ารวมไฟล์เดียวจะแก้โทนทีก็เสี่ยงพังหลักการเขียนไปด้วย

## รูปแบบโพสต์ผูกกับหลักการเขียน

`content_formats` แต่ละอันมี `framework` + `hook` ชี้ไปที่ key ใน `content_craft.json`
เวลาเขียน ระบบ**สุ่ม 1 รูปแบบ** แล้วดึงเฉพาะ hook/framework ที่ตรงมาใส่ prompt

```
เกาะข่าว     → hook_story_offer + curiosity_gap
ตั้งคำถาม    → APP             + direct_question
จัดอันดับ    → listicle        + specific_number
สอนมือใหม่   → APP             + useful_promise
เล่าเรื่อง   → BAB             + in_media_res
ของใกล้หมด   → PAS             + specific_number
เทียบให้เห็น → FAB             + pattern_interrupt
เบื้องหลัง   → hook_story_offer + in_media_res
```

**⚠️ ห้ามยัด `content_craft.json` ทั้งไฟล์เข้า prompt** — เหตุผล 3 ข้อ:
1. โมเดลเล็ก (qwen, gemini-flash) จมข้อมูลจนลืมโจทย์จริง
2. เปลืองโควตา free tier
3. **ให้ framework มาทั้ง 8 แบบพร้อมกัน = ไม่ได้บังคับให้ใช้แบบไหนเลย** ซึ่งทำลายจุดประสงค์ทั้งหมด

## 🔴 กฎข้อสำคัญที่สุด — "AI เขียนซ้ำ" มักไม่ใช่ปัญหาของ prompt

เคยเสียเวลาไปกับการแก้ prompt ทั้งที่ต้นตอคือ **input ซ้ำ**

ถ้าเจอปัญหาคอนเทนต์ซ้ำ/จืด **ให้ไปดูข้อมูลจริงก่อนแก้ prompt เสมอ**:

```sql
-- angle ซ้ำกันแค่ไหน (เคยเจอ One Piece 8 ชิ้นได้ angle เดียวกันเป๊ะ)
select angle, count(*) from marketing_ideas group by angle order by 2 desc;

-- summary มีเนื้อจริงไหม (เคยเจอ 28/28 ชิ้นเป็น HTML ดิบของ Google News)
select id, left(summary, 60) from marketing_ideas where source = 'news';
```

`idea_collector.angle_for()` ยังคืนข้อความจาก **template ตายตัว 7 แบบ** อยู่ —
แก้ที่ปลายทาง (สุ่มรูปแบบ) แล้ว แต่ต้นทางยังซ้ำ

## กลไกกันซ้ำที่มีอยู่แล้ว (อย่าทำซ้ำซ้อน)

1. **สุ่มรูปแบบ** + เลี่ยงอันที่เพิ่งใช้ (ต้องมี `content_format` จาก migration 062)
2. **ส่งแคปชั่นล่าสุด 8 ชิ้นเข้า prompt** เป็นรายการ "ห้ามเขียนซ้ำแนวนี้"
   → ต้องเขียนกำกับให้ชัดว่าเอาไว้ **เลี่ยง** ไม่ใช่ **ตัวอย่าง** ไม่งั้นโมเดลจะเลียนแบบยิ่งกว่าเดิม
3. **วัดความคล้ายด้วย Jaccard บน 4-gram** เกิน 50% → ให้เขียนใหม่อัตโนมัติ 1 รอบ
   ถอด emoji/แฮชแท็กก่อนเทียบ เพราะสองโพสต์ที่ต่างแค่ emoji คือซ้ำในสายตาคนอ่าน
   (เกิดจริง: #1 กับ #3 ต่างแค่ FB-09 vs FB-06 → วัดได้ 88%)

## ผู้เขียน (provider) เลือกอัตโนมัติ
```
ANTHROPIC_API_KEY → Claude   ทำงานทุกที่ · เสียเงิน · คุณภาพสูงสุด
GEMINI_API_KEY    → Gemini   ทำงานทุกที่ · ฟรี 1,500/วัน  ← ที่ใช้อยู่
ไม่มี key         → Ollama   ฟรี 100% แต่ **ใช้บน Vercel ไม่ได้** (คนละเครื่อง)
```
บังคับด้วย `AI_PROVIDER=claude|gemini|ollama`

**Gemini: `maxOutputTokens` ต้อง 2048 ไม่ใช่ 1024** — รุ่นใหม่ "คิด" ก่อนตอบและ
thinking กินโควตา output ด้วย (~550 token) ตั้งน้อยไปจะได้ `MAX_TOKENS` พร้อมข้อความว่าง
ปิด thinking ไม่ได้ (`thinkingBudget: 0` ถูกปฏิเสธ)

**ห้ามเช็กชื่อโมเดลด้วย ListModels** — มันคืนรุ่นที่ถูกปลดไปแล้วมาด้วย
probe ที่ผ่านทั้งที่ใช้จริงไม่ได้ = ให้ความมั่นใจผิด แย่กว่าไม่เช็ก

**Gemini ล้มได้ 3 แบบ อย่ารวมเป็นก้อนเดียว** (route แยกไว้แล้ว — `askGemini` วน chain ให้เอง):

| อาการ | ทำยังไง |
|---|---|
| 503 / "experiencing high demand" | **ชั่วคราว** รอ 1.5s แล้ว 3s ลองซ้ำ ส่วนใหญ่หายเอง |
| 429 รายวัน (`PerDay`) | รอไปก็ไม่หาย — **สลับโมเดล** โควตานับแยกตามโมเดล |
| 429 ต่อนาที (`PerMinute`) | รอแล้วลองซ้ำได้ |
| 404 no longer available | สลับโมเดล และไปแก้รายชื่อในโค้ด |

รายชื่อที่ยิงจริงแล้วใช้ได้ (2026-08-17): `gemini-flash-latest` · `gemini-flash-lite-latest`
ที่ตายแล้ว: `gemini-2.0-flash-lite` · `gemini-2.5-flash` · `gemini-2.5-flash-lite`
**เติมชื่อใหม่เข้า chain ต้องยิงทดสอบก่อนเสมอ** (ทั้ง `route.js` และ `idea_angles.py` มี chain ของตัวเอง)

## ด่านตรวจก่อนบันทึก (มีแล้ว อย่าลบ)
- `looksThai()` — เคยเจอโมเดลเขียนโพสต์ภาษาญี่ปุ่นทั้งโพสต์หลุดเข้าคิว (#2)
- `tidy()` — ตัด ``` และเครื่องหมายคำพูดที่โมเดลชอบครอบมา
- ตรวจความคล้าย → เขียนใหม่ 1 รอบ → ยังซ้ำก็ขึ้นป้ายเตือนให้คนตัดสิน (ไม่ทิ้งเอง)

## วิธีทดสอบโดยไม่ต้องมี admin token
เรียก route ตรง ๆ ไม่ได้ (ติด `requireAdmin`) ให้ดึงฟังก์ชันออกมารันแทน:
```bash
node -e "
const src=require('fs').readFileSync('deploy/app/api/marketing/content/generate/route.js','utf8');
const grab=(n)=>{const i=src.indexOf('function '+n+'(');let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1)}}};
eval(['normalize','similarity','cleanSummary','pickFormat','craftBlock','buildPrompt','tidy'].map(grab).join('\n'));
// ...แล้วยิง Gemini ด้วย key จาก deploy/.env.local
"
```
**ทดสอบคุณภาพต้องเทียบ A/B เสมอ** (มีหลัก vs ไม่มีหลัก, ก่อนแก้ vs หลังแก้)
ดูแค่ output เดี่ยว ๆ ตัดสินไม่ได้ว่าดีขึ้นจริงหรือแค่สุ่มได้ดี

### 🔴 วิธีนี้ทดสอบ query กับ DB ไม่ได้ — ต้องแยกทดสอบต่างหาก

การ `eval` ฟังก์ชันล้วนครอบคลุมแค่ตรรกะ **ไม่แตะ supabase client เลย**
เคยพลาดมาแล้ว: ปุ่ม "ให้ AI เขียน" พังทุกครั้งด้วย `p.from(...).in is not a function`
แต่เทสต์ผ่านหมด เพราะเส้นทางที่เทสต์ไม่ได้ผ่านโค้ดที่พัง

ถ้าแตะโค้ดที่ query DB **ต้องรันกับ client จริง**:
```bash
cd deploy && node -e "
const { createClient } = require('@supabase/supabase-js')
// ...อ่าน .env.local แล้วรัน query แบบเดียวกับใน route
"
```

**⚠️ ลำดับ chain ของ supabase-js** — `from()` คืน query builder ที่มีแค่
`select/insert/update/delete` · ตัวกรอง (`.in .eq .not .order .limit`) อยู่บน
filter builder ที่ได้ **หลัง** `select()` เขียนสลับจะได้ TypeError ที่อ่านแล้ว
ไม่รู้เลยว่าเกิดจากลำดับ
```js
db.from(t).in(...).select(...)   // ❌ พัง
db.from(t).select(...).in(...)   // ✅
```

## ค้างอยู่
- `idea_collector.angle_for()` ยังเป็น template ตายตัว
- `content_suggester.py` เป็นระบบเก่าคนละทางกับ API นี้ — prompt ยังไม่บังคับภาษาไทย
- ดึงเนื้อข่าวเต็มไม่ได้ (Google News เป็นหน้า JS redirect · article id เป็น token ทึบ) — **อย่าเสียเวลาลองซ้ำ**

## เกี่ยวข้อง
`dvx-db` · `dvx-web` · `wiki/worklog/2026-08-08-content-anti-repeat.md`
