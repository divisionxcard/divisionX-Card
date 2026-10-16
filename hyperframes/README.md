# HyperFrames — ฉากเคลื่อนไหวของโรงงานวิดีโอ

[HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen · Apache 2.0 · ไม่มีค่าเรนเดอร์) เขียนฉากเป็น HTML + CSS + GSAP
แล้วให้ Chrome ถ่ายทีละเฟรม + FFmpeg ต่อเป็น MP4 — หลักเดียวกับโรงงานของเรา (Chromium วาดตัวอักษรไทย) แต่ทำอนิเมชันได้เต็มที่

ติดตั้งเมื่อ 16 ต.ค. 2026 เพราะเจ้าของดูคลิปจากทางเดิมแล้วบอกว่า *"เหมือนสไลด์ภาพนิ่งธรรมดามาก ๆ"*
ทางเดิมเป็นรูปนิ่ง + ซูมช้าด้วย ffmpeg — ในฉากไม่มีอะไรเกิดขึ้น

แยกไว้นอก `deploy/` ตั้งใจ (แบบเดียวกับ `remotion/`) — ทุกอย่างใน `deploy/` ถูกอัปขึ้น Vercel

## ใช้ยังไง

**จากหน้าเว็บ `/video`** → ขั้นตั้งค่า → *เครื่องประกอบภาพ* = **เคลื่อนไหว (HyperFrames)**
ระบบเลือกชนิดฉากเองจากรูปที่เลือกต่อบรรทัด (ดูกติกาที่ `deploy/agents/video/hf_render.py → scenes_from_plan`)

**จากเครื่อง** (แผนแบบเดียวกับ `make_video.py` + `"engine": "hyperframes"`):

```bash
cd deploy
../.venv-image/Scripts/python.exe -m agents.video.hf_render --plan แผน.json
```

ระบุฉากเองได้ด้วย `"scenes"` (ยาวเท่าจำนวนบรรทัด):

```json
"scenes": [
  {"type": "hook",    "sku": "OP 17", "title": "OP-17", "kicker": "มาถึงตู้แล้ว"},
  {"type": "pack",    "sku": "OP 17", "words": ["SEC", "Leader"], "tag": "OP-17 · BOOSTER PACK"},
  {"type": "machine", "photo": "machine:hero", "steps": ["เลือกช่อง", "กดซื้อ", "เปิดดวง"]},
  {"type": "cta",     "photo": "machine:scene", "title": "เช็กหน้าตู้ก่อนไป", "tag": "#DivisionXCard"}
]
```

## ฉากที่มี (`templates/dvx-promo/compositions/`)

| ฉาก | เกิดอะไรขึ้น | ซิงก์กับเสียง |
|---|---|---|
| `scene-hook` | ซองพุ่งชนจอ (เบลอตามแรง) · คลื่นกระแทก · ประกายไฟ · ชื่อชุดกระแทก · แสงวาบวิ่งบนซอง · ป้ายใต้ซอง | — |
| `scene-pack` | ซองหมุนสามมิติกลางวงแสง · กล้องดันเข้า · **คำเด็ดกระแทกตรงวินาทีที่เสียงพูดคำนั้น** | เวลาคำจาก whisper |
| `scene-machine` | รูปตู้จริง กล้องดันเข้าหากระจก · **ชิปขั้นตอนโผล่ตรงคำที่พูดแต่ละขั้น** + เส้นเชื่อมลากลง | เวลาคำจาก whisper |
| `scene-cta` | รูปตู้อีกมุม ดึงโฟกัสจากเบลอ · โลโก้ลงพร้อมวงแสง · ข้อความชวน · แท็กเพจ | — |
| (ทุกฉาก) | พื้นกรมท่า + แสงเรือง + ตาราง · **สายฟ้า + แสงวาบตรงรอยต่อฉาก** · โลโก้มุม · ซับไทย | เวลาท่อนซับ |

ข้อความบนจอมาจากสคริปต์/พาดหัว/รหัส SKU เท่านั้น — ช่องที่ไม่มีข้อมูลจะซ่อน ไม่แต่งเอง (กฎ overclaim)

### รูปแบบทั้งคลิป (`fmt-*.html` · 16 ต.ค. 2026)

ฉากเดียวยาวคลุมหลายบรรทัดของสคริปต์ (`"span"`) — มีของค้างบนจอที่ค่อย ๆ เติมจนเฉลย ซึ่งเป็นสิ่งที่คลิปวิวหลักล้านในวงการมีร่วมกัน
(ผลสำรวจ: `wiki/worklog/2026-10-16-video-formats-research.md`) · สคริปต์ + ฉากสร้างจากฐานข้อมูลด้วย `deploy/agents/video/hf_formats.py`

| รูปแบบ | ฉาก | เกิดอะไรขึ้น | ข้อมูล |
|---|---|---|---|
| `rank` | `fmt-rank` | กระดาน 5 ช่องว่างค้างจอ → อันดับ 5→1 ซองพุ่งกลางจอแล้วบินเข้าช่อง · อันดับ 1 ทอง + มงกุฎ + สั่น · จบกระดานเต็ม | ยอดขาย 7 วัน (แสดงแค่อันดับ) |
| `versus` | `fmt-versus` | "คุณเลือกซองไหน?" → 3 รอบ ผู้ชนะอยู่ต่อ ผู้แพ้ถูกเหวี่ยงออก · แถบสัดส่วน · ป้ายแชมป์ | ยอดขายเทียบคู่ (% ซ่อนไว้) |
| `quiz` | `fmt-quiz` | เลนส์ซูมลายบนซองแบบเบลอ + HUD สแกน → นับ 3-2-1 ตรงเสียง → แสงวาบ เฉลยเต็มซอง | รูปซอง |
| `map` | `fmt-map` | แผนที่กราฟิกกรุงเทพฯ + แม่น้ำ → หมุดทุกห้าง + นับตู้ → ซูมห้าง → จอลิฟต์ถึงชั้นจริง → จุดสังเกต | `machines.config.branch` |

```bash
cd deploy
../.venv-image/Scripts/python.exe -m agents.video.hf_formats rank --days 7 --render
../.venv-image/Scripts/python.exe -m agents.video.hf_formats map --machine pf01 --render
```

**รูปตู้รายสาขา** (`assets/branches/<machine_id>.jpg`): ตู้มี 3 แบรนด์ (VMS · WorldWide · Vendos) หน้าตาไม่เหมือนกัน — ใช้รูปของสาขานั้นเท่านั้น
ต้นฉบับจากเจ้าของอยู่ `image/รูปตู้แต่ละสาขา/` (ไม่ขึ้น git) → `../.venv-image/Scripts/python.exe -m agents.video.branch_photos` ครอป/ปรับแสง
(กรอบครอปต่อรูปอยู่ใน `PHOTOS` ของไฟล์นั้น · ได้รูปใหม่ให้แก้ชื่อไฟล์/กรอบแล้วรันซ้ำ) · คลิปพิกัดตู้โชว์เป็นการ์ดรูป · คลิปเฉพาะสาขาใช้เป็นฉากปิด

ซับห้ามเฉลยก่อนภาพ: ท่อนซับที่มีคำตอบในบรรทัดเฉลยจะรอขึ้นพร้อมภาพเฉลย (`_reveals` ใน hf_render) ·
จังหวะเฉลยขยับไปพยางค์แรกจริงจากช่วงเงียบในไฟล์เสียง (`speech_onsets`) เพราะ whisper ให้เวลาคำสั้น ๆ คลาด

## เปิดแก้ใน Studio (ลากคลิป แก้ข้อความ ดูทีละเฟรม)

```bash
cd hyperframes/templates/dvx-promo
npx hyperframes preview          # เปิด http://localhost:3002 · index.html คือคลิปตัวอย่าง OP-17
npx hyperframes check            # lint + runtime + layout + motion + contrast — ต้องผ่านก่อนเรนเดอร์
npx hyperframes render --output renders/ตัวอย่าง.mp4
```

> แก้ใน Studio = แก้ไฟล์ตัวอย่างในเทมเพลต · งานจริงทุกงานสร้างโปรเจกต์ใหม่ใน `.video-work/<project>/hf/` จากเทมเพลตนี้
> ถ้าแก้ฉาก (`compositions/scene-*.html`) แล้วชอบ ทุกคลิปหลังจากนั้นได้ของใหม่ทันที

## ไฟล์

```
templates/dvx-promo/
  compositions/scene-*.html     ฉาก (sub-composition) รับค่าผ่าน data-variable-values
  scaffold/host.template.html   โครงหลัก — hf_render.py เติม {{...}} เป็น index.html
  scaffold/captions.template.html  ซับทั้งคลิป (ฉากย่อยของมันเอง)
  assets/fonts/Kanit-*.ttf      ฟอนต์ไทย (OFL — ใช้เชิงพาณิชย์ได้ · OFL-Kanit.txt)
  assets/brand/logo-white.png   โลโก้ (ก๊อปจาก deploy/public/)
  assets/pack.webp · machine-*.jpg · voice.wav   ของตัวอย่างสำหรับ index.html
  package.json                  ปักรุ่น CLI (hyperframes@0.8.163) — เรนเดอร์ซ้ำได้ผลเดิม
```

## กับดักที่เจอแล้ว

- **`<style>`/`<script>` ของฉากต้องอยู่ใน `<template>`** — นอก template ถูกทิ้งตอนประกอบ (คู่มือ HyperFrames เตือนไว้)
- **ห้ามมีไฟล์ HTML ที่มี `data-composition-id` อยู่รากโปรเจกต์มากกว่าหนึ่งไฟล์** (lint `multiple_root_compositions` — เสียงซ้อน) → โครงจึงอยู่ใน `scaffold/`
- **`perspective` ห้ามใส่ที่ `#root` ของฉาก** — Chrome เรียงชั้นสามมิติใหม่ ซองหมุนแล้วไปทับคำเด็ด ใส่ที่ตัวห่อกล้องแทน + `z-index`
- **วงแสง/ของที่โผล่กลางฉากต้องใส่ `immediateRender: false`** — `fromTo` ปกติจะแสดงสถานะเริ่มตั้งแต่วินาทีแรกของฉาก (วงกลมค้างก่อนซองชน)
- แสงวาบบนซอง: อย่าใช้ `<img>` ซ้ำ (lint `duplicate_media_discovery_risk`) — ใช้แถบแสงในกรอบตัวซองจริงที่ `gloss_box()` วัดจาก alpha
- `check` ฟ้อง "ข้อความถูกบัง" กับคำที่ตั้งใจวางทับซอง — ดูภาพก่อน ถ้าตั้งใจให้ทับใส่ `data-layout-allow-occlusion`
- ตัวหนังสือจางพื้นหลังต้องเป็น `::before` ไม่งั้นโดนตรวจ contrast เป็นข้อความหลัก
- HyperFrames ส่งสถิติการใช้งานแบบไม่ระบุตัวตนโดยปริยาย — ปิดได้ `npx hyperframes telemetry disable`

ดูเพิ่ม: `deploy/agents/video/hf_render.py` (หัวไฟล์) · `wiki/worklog/2026-10-16-hyperframes.md`
