---
type: worklog
date: 2026-10-21
tags: [video, tts, voicestudio, gemini, trend-research, agent-reach, marketing, ideas]
commits: [d879c53]
status: ✅ ตัวกรองช่องทางหน้าไอเดีย · ⏳ เสียงเจ้าของ (รอเสียงจริง + บิลลิง Gemini) · ⏳ Agent Reach ช่อง FB/IG/Reddit (รอวอร์มบัญชี)
---

# เสียงของเราในคลิป · เครื่องมือหาเทรนด์ · ตัวกรองช่องทางหน้าไอเดีย (20–21 ต.ค.)

## 1. VoiceStudio (เจ้าของขอให้ "ใช้เสียงของเราในวิดีโอแทน")

- [VoiceStudio](https://github.com/debpalash/VoiceStudio) = ทางเลือก ElevenLabs แบบรันในเครื่อง (AGPL-3.0 แอป · API 127.0.0.1:3900)
- **เครื่องยนต์ไทยหลัก OmniVoice: weights CC-BY-NC = ห้ามใช้เชิงพาณิชย์** (การ์ดโมเดลบน HF + ทะเบียนลิขสิทธิ์ของ VoiceStudio เอง)
  → ไม่ได้โหลด · ตัวที่ใช้เชิงพาณิชย์ได้และพูดไทย: Confucius4-TTS (Apache-2.0) · VoxCPM2 (Apache-2.0 แต่ต้อง ~8 GB VRAM)
- เจ้าของเลือก "VoiceStudio บนเครื่อง" → ติดตั้ง 0.5.6 (ตรวจ SHA-256) · runtime · Confucius4
  - เปิดจากเทอร์มินัล VS Code ต้องลบ `ELECTRON_RUN_AS_NODE` ก่อน ไม่งั้นแอป Electron กลายเป็น Node แล้วปิดทันที
  - กด "Install local runtime" ผ่าน CDP แบบเดียวกับ `packaged-smoke.mjs` ของเขา · ไม่ตอบ analytics/consent แทนเจ้าของ
- ผล: RTX 3050 6 GB ล้น VRAM (>15 นาทีต่อเสียง 14 วิ ถูกตัดทิ้ง) → CPU (`CUDA_VISIBLE_DEVICES=-1`)
  เสียง 12–15 วิ ใช้ 6.5–10 นาที · ถอดกลับด้วย whisper ผิด 4–14% · **เจ้าของฟังแล้ว "ยังไม่ผ่าน"**
- ทางต่อ: เจ้าของเลือก **โคลนเสียงด้วย Gemini 3.8 Flash TTS (voice replication)** — รอเสียงจริง 15–30 วิ + ประโยคยินยอม + เปิดบิลลิงคีย์ Gemini
  · จะทำเสียงเทียบกับ Confucius4 (เสียงเจ้าของ) ก่อนตัดสินใจ · VoiceStudio ยังไม่ถอน
- ⚠️ **`gemini-2.5-flash-preview-tts` (config.py) ปิด 17 พ.ย. 2026** (deprecations page อัปเดต 12 ต.ค.) → `gemini-3.8-flash-tts`
  (Flash-Lite ไม่มีไทย) · เจ้าของสั่ง "รอก่อน" 20 ต.ค. แต่เลือกทาง Gemini 3.8 แล้ว — ต้องย้ายก่อนกำหนดไม่ว่าทางไหน

## 2. Agent Reach — เครื่องมือหาเทรนด์ (YouTube/Reddit/FB/IG)

- ลิงก์ที่เจ้าของได้มาสะกด `pinniantong` = 404 · ตัวจริง `Panniantong/Agent-Reach` (MIT · ~100k ดาว) · มีตัวก๊อปชื่อคล้ายหลายตัว
- ติดตั้ง `%USERPROFILE%\.agent-reach-venv` pin commit 94f06c1 (v1.5.0) + yt-dlp · รอบแรกจาก main.zip โดนตัวกันความปลอดภัยบล็อก
- ใช้ได้: เว็บ (Jina) · RSS · YouTube (ทดลองค้น OP-13 ได้ยอดวิว/ช่องจริง)
- FB/IG/Reddit ต้องใช้ OpenCLI + บัญชีสำรองใน Chrome profile แยก (ไม่ใช่ profile "DivisionX") — เจ้าของสมัครครบแล้ว
  · ให้ใช้งานแบบคนทั่วไปถึงราว 28 ต.ค.–4 พ.ย. ก่อน · **ไม่กดติดตาม/ไลก์อัตโนมัติแทน** (พฤติกรรมบอท ผิดกฎแพลตฟอร์ม)

## 3. หน้า /marketing ไอเดียวันนี้ — กดเลือกช่องทางได้ (d879c53)

เจ้าของ: *"อยากให้ปรับหน้านี้ โดยการสามารถกดเลือกช่องทางโซเชียลที่จะสามารถดูเองได้"*

- chip ช่องทาง (ต่างประเทศ · ข้อมูลเราเอง · เพิ่มเอง · ข่าว/เทรนด์ · ทางการ · ราคาตลาด · YouTube) กดได้แล้ว + chip "ทุกช่องทาง"
  - เลือกช่องทาง → API `ideas?source=<s>&per_source=0` เอาของช่องทางนั้น **ทั้งหมด** (ไม่ใช่แค่ 3 อันเด็ด)
  - ชั้น 2 "แหล่ง:" จาก `source_label` เช่น Reddit r/OnePieceTCG · PokeBeach · TCGplayer · รายช่อง YouTube · เรดาร์คู่แข่ง
  - กด chip โหลดแค่รายการไอเดีย (`loadIdeas`) ไม่ใช่ทั้งหน้า 7 API · `counts/by_source` ยังนับทุกช่องทาง
- `deploy/app/api/marketing/ideas/route.js` รับ `source` (ตรวจ `^[a-z_]{2,20}$`)
- ยังไม่ได้เปิดดูหน้าจริงตอนล็อกอิน (หน้า /marketing ต้องมีบัญชีทีมงาน) — build ผ่าน · ให้เจ้าของเช็กหลังขึ้นเว็บ

🔗 [[2026-10-17-owner-followups]] · [[2026-10-16-hyperframes]]
