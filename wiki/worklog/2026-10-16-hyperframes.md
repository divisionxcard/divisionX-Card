---
type: worklog
date: 2026-10-16
tags: [video, hyperframes, motion, pipeline, web]
commits: [b78459f]
status: ✅ ติดตั้ง HyperFrames + เทมเพลตฉาก 4 แบบ + ผูกเข้าโรงงานวิดีโอ (make_video engine) + หน้าเว็บ /video + GitHub Actions · คลิปทดสอบ OP-17 16.4 วิ เรนเดอร์ 33-42 วิ · ✅ งานจริงบน Actions ผ่าน (233 วิทั้งงาน) · 🟡 รอเจ้าของดูคลิป
---

# HyperFrames — ฉากเคลื่อนไหวจริงแทนรูปนิ่งซูม

เจ้าของขอ (16 ต.ค.): *"https://github.com/heygen-com/hyperframes ช่วยติดตั้ง รวมถึงนำไปใช้งานกับระบบตัดต่อวิดีโอของเราได้หรือไม่"*
ต่อจาก [[2026-10-14-heroai-mcp]] ที่พักไว้เพราะ *"เหมือนสไลด์ภาพนิ่งธรรมดามาก ๆ"*

## ทำไมเป็นตัวนี้

- HyperFrames (HeyGen · Apache 2.0 · ไม่มีค่าเรนเดอร์) = ฉาก HTML/CSS/GSAP → Chrome ถ่ายทีละเฟรม → FFmpeg — **หลักเดียวกับที่เราเลือกไว้แต่แรก**
  (Chromium วาดตัวอักษรไทย ถูกสระ/วรรณยุกต์) แต่เปิดอนิเมชันได้ทั้งหมด ซึ่ง ffmpeg zoompan ของทางเดิมทำไม่ได้
- ไม่ใช่บริการ → ไม่มีปัญหาแบบ Hero AI (ตัวหาภาพอ่าน "ซอง" เป็นซองยา) · ใช้รูปจริงของเราทั้งหมด
- มี skill สำหรับ agent ติดมา (`npx hyperframes init` ลิงก์เข้า `~/.claude/skills/` อัตโนมัติ: hyperframes · core · animation · creative · cli · registry · studio · keyframes · media-use + general-video)

## ที่ทำ

1. **ติดตั้ง** `hyperframes/templates/dvx-promo/` (นอก `deploy/` แบบเดียวกับ `remotion/`) · CLI ปัก `hyperframes@0.8.163` · `doctor` ผ่าน (Node 24 · FFmpeg 7.1 · Chrome ระบบ)
2. **เทมเพลตฉาก 4 แบบ** (`compositions/scene-*.html`) อ้างท่าจากคู่มือ HyperFrames:
   hook (motion-blur-streak · particle-burst · kinetic-beat-slam · spring-pop · gloss) · pack (asr-keyword-glow · camera push · 3D tilt) ·
   machine (Ken Burns · waterfall-entry · svg-path-draw) · cta (depth-of-field rack focus · logo-sting) · โครงหลักมีสายฟ้า+แสงวาบตรงรอยต่อทุกฉาก
   ฟอนต์ Kanit (OFL) ฝังในเทมเพลต · โทนแบรนด์ #03102A / #1B8DFF / #59D2FF / โครเมียม / ทองเฉพาะคำเด็ด
3. **ตัวเชื่อม `deploy/agents/video/hf_render.py`** — ใช้ขั้น 1-3 ของโรงงานเดิม (Gemini TTS → whisper → ท่อนซับ) แล้ว:
   หาเวลาคำเด็ด (`phrase_time`: ข้อความของเราในท่อนซับ + เลื่อนตามสัดส่วนตัวอักษร · whisper ถอด "Leader" เป็น "ลีดเดอร์" จึงจับจากข้อความถอดตรง ๆ ไม่ได้) ·
   วัดกรอบซองจริงจาก alpha (`gloss_box`) · ก๊อปเทมเพลตเป็นโปรเจกต์ต่องาน `.video-work/<project>/hf/` · เขียน index.html + captions.html · `lint` → `render`
4. **`make_video.build_video`** ส่งต่อเมื่อ `plan.engine == "hyperframes"` · **`scenes_from_plan`** เลือกฉากเองเมื่อไม่ระบุ — ข้อความบนจอมาจากสคริปต์/พาดหัว/รหัส SKU เท่านั้น ช่องว่างซ่อน (ไม่แต่ง "มาถึงตู้แล้ว" ให้เอง — กฎ overclaim)
5. **หน้าเว็บ `/video`** มีตัวเลือก *เครื่องประกอบภาพ* · `api/video/render` รับ `engine` (classic | hyperframes · classic ไม่ใส่คีย์ แผนเดิมไม่เปลี่ยน) · `next build` ผ่าน
6. **`.github/workflows/video-render.yml`** Preflight อ่าน `plan.engine` → `ENGINE` · ลง Node 22 ทุกงาน · อุ่น CLI + doctor เฉพาะงาน hyperframes (รุ่นอ่านจาก package.json ของเทมเพลต)

## ผลทดสอบ (แผน OP-17 · 4 บรรทัด · เสียง Puck)

| | |
|---|---|
| เสียง | 15.5 วิ · whisper 118 คำ · ซับ 10 ท่อน |
| คำเด็ด | SEC ที่ 0.82 วิ · Leader ที่ 1.86 วิ ของฉาก (ตรงเสียง) · ขั้นตอน 1.20 / 1.82 / 3.02 วิ |
| เรนเดอร์ | 492 เฟรม 1080×1920 30fps · **42 วิ** (รอบสอง 33 วิ) · เสียง mean −16.9 dB / peak −1.4 dB |
| `hyperframes check` | ผ่าน · คำเตือนเดียว = แทร็กซับ 10 ท่อน (ตั้งใจ: ซับอยู่แทร็กเดียวตามธรรมเนียม Studio) |
| ไฟล์ | `.video-work/op17-hf/op17-hf.mp4` (ระบุฉากเอง) · `op17-hf-web.mp4` (แผนแบบหน้าเว็บ เลือกฉากอัตโนมัติ) |

### บน GitHub Actions (งานจริงผ่านคิว `video_jobs` · แผนแบบหน้าเว็บ · `engine: hyperframes`)

| | |
|---|---|
| run | [38848634331](https://github.com/divisionxcard/divisionX-Card/actions/runs/38848634331) · ทุกขั้นผ่าน · ทั้งงาน 233 วิ (คิว → rendering ~90 วิ → done ~186 วิ) |
| คลิป | `marketing/video/op17-hf-actions-test.mp4` · 1080×1920 30fps · 520 เฟรม · 17.3 วิ · เสียง mean −18.0 / peak −1.6 dB |
| ภาพ | ดูเฟรม 0.6 / 3.5 / 8 / 14.5 วิ — ไทย สระ วรรณยุกต์ ฟอนต์ Kanit ถูก · รูปซอง/ตู้จริงครบ · Chrome ของอิมเมจใช้ได้ ไม่ต้องลงอะไรเพิ่ม |
| เสียง | ยาวกว่ารอบในเครื่อง (16.4 vs 15.5 วิ) เพราะ Gemini TTS สังเคราะห์ใหม่บนเครื่อง runner — ปกติ ไม่ใช่ของเสีย |

บั๊กที่เจอจากรอบนี้: `hf_render.build_video` คืนความยาว**เสียง** → `duration_seconds` บันทึก 16.41 ทั้งที่ไฟล์ยาว 17.33 (ขาด `TAIL` 0.9 วิ) → แก้ให้คืนความยาวคอมโพสิชัน

## กับดักที่เจอ

- lint `multiple_root_compositions` — โครงที่มี `data-composition-id` วางรากโปรเจกต์ไม่ได้ → ย้ายเข้า `scaffold/`
- `perspective` บน `#root` ของฉาก → ซองหมุนสามมิติไปทับคำ "SEC" (ภาพนิ่งยืนยัน) → ย้ายไปตัวห่อกล้อง + `z-index`
- `fromTo` ปกติแสดงสถานะเริ่มทันที → วงกระแทกค้างกลางจอก่อนซองชน → `immediateRender: false`
- แสงวาบด้วย `<img>` ซ้ำ = lint `duplicate_media_discovery_risk` → แถบแสงในกรอบตัวซองจริง (วัด alpha ด้วย PIL)
- ตัวหนังสือจางพื้นหลังโดนตรวจ contrast เป็นข้อความหลัก → ย้ายเป็น `::before` + `data-layout-ignore`
- Studio (`preview`) แทรก `data-hf-id` ลงไฟล์ต้นฉบับเอง — ปกติของมัน ไม่ใช่ของเสีย
- ฟุตเทจใน `Video/` (IMG_3170.MOV · ขั้นตอนการกดการ์ด.MOV) เป็นคลิปที่ตัดต่อแล้ว มีซับ/โลโก้ฝัง — ใช้เป็น B-roll ไม่ได้ ยังต้องการคลิปดิบ
- `npx hyperframes` เก็บสถิติการใช้งานแบบไม่ระบุตัวตนโดยปริยาย (`telemetry disable` ปิดได้ — ยังไม่ได้ปิด)

## ยังไม่ได้ทำ

- [ ] เจ้าของดูคลิปทดสอบ + ตัดสินว่าใช้แทนทางเดิมได้ไหม
- [x] ทดสอบงานจริงบน GitHub Actions (Node 22 + Chrome ของอิมเมจ) — ผ่าน 16 ต.ค.
- [ ] เพลงประกอบ (รอคลังเพลงที่มีสิทธิ์ใน music.py) · ห้องตัดต่อบนเว็บยังรองรับแค่ทางเดิม
- [ ] ฉากชนิดใหม่ตามรูปแบบโพสต์ (เทียบชุด · จัดอันดับ · สอนเล่น) · ฟุตเทจดิบหน้าตู้

เกี่ยวข้อง: [[2026-10-14-heroai-mcp]] · [[project_video_studio]] · `hyperframes/README.md`
