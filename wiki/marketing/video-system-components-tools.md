---
type: research
date: 2026-10-23
tags: [video, tools, google-flow, omni, veo, tts, music, publishing]
---

# ระบบทำวิดีโอสั้น: องค์ประกอบ · ของเราตอนนี้ · เครื่องมือเสริม (ค้น 23 ต.ค. 2026)

> เจ้าของถาม: "ทั้งระบบในการออกแบบวิดีโอคอนเทนต์ต้องมีองค์ประกอบอะไรหลัก ๆ บ้าง … หาเครื่องมือทดแทน/เสริมแต่ละจุด"
> และ "คนส่วนใหญ่ใช้ Google Flow … องค์ประกอบในการสั่งงานมีอะไรบ้าง"
>
> ราคาเป็นดอลลาร์ตามหน้าผู้ให้บริการ · **[V]** = ยืนยันจากหน้าผู้ให้บริการ · **[3P]** = แหล่งรอง · ตรวจซ้ำก่อนจ่ายเงินทุกครั้ง

## ข้อเท็จจริงที่เปลี่ยนแผน (ตรวจเองแล้ว)

- **Veo ใน Gemini API ปิดแล้ว 22 ต.ค. 2026** — หน้าเอกสาร video ของ Gemini API แจ้งเอง · ตัวแทน = **Gemini Omni Flash** (`gemini-omni-1.1-flash`, Interactions API)
- **คีย์ Gemini ฟรีของเราเรียก Omni ไม่ได้** — ยิงจริงได้ 429 "limit: 0 … on Free Tier" · ต้องเปิด billing · ราว $0.10/วินาที ที่ 720p [V จากรายงาน · หน้า pricing]
- **Sora 2 ของ OpenAI ปิด API แล้ว 24 ก.ย. 2026** แม้ชื่อยังอยู่ใน `/v1/models`
- คีย์เราเห็น `lyria-3.5` (แต่งเพลง) ด้วย — ยังไม่ได้ทดสอบว่าใช้ฟรีได้ไหม เงื่อนไขเชิงพาณิชย์ยังไม่ชัด

## องค์ประกอบ 14 ส่วน เทียบกับระบบเรา

| ส่วน | มาตรฐานที่ดีปี 2026 | ของเรา | เสริมด้วย |
|---|---|---|---|
| ไอเดีย/ฮุก | ตัดสินใจดูต่อใน ~1.7 วิ (TikTok) · ฮุกจบใน 3 วิ · ทำ 3 ฮุกต่อเรื่อง | ตัวเก็บไอเดีย + เรดาร์เทรนด์ ✅ | ขั้น "3 ฮุกต่อคลิป" |
| บท | คำถามเปิด → เฉลยท้าย · 15 วิ ดีต่อการดูจบ | LLM + เทมเพลต 4 รูปแบบ ✅ | — |
| สตอรีบอร์ด | ภาพเปลี่ยนทุก 2–3 วิ · เฟรมแรก = ฮุก | อยู่ในเทมเพลต | ใส่จังหวะภาพให้ชัดในเทมเพลต |
| เสียงพากย์ | มีชีวิต สม่ำเสมอ | Gemini TTS (รุ่น 3.8 พร้อมสลับ) | ElevenLabs v4 (ไทยได้ · $0.08/1K ตัวอักษร) สำหรับคลิปเด่น |
| เพลง | มีใบอนุญาตทุกแพลตฟอร์ม | ❌ ช่องว่าง | Epidemic Sound Pro (~$17–40/เดือน) · ElevenLabs Music API ($0.15/นาที) · เลี่ยง Udio/Suno |
| เอฟเฟกต์เสียง | ทุกรอยตัด/เฉลย | สังเคราะห์เอง ✅ | — |
| ภาพ: ฟุตเทจจริง | คนจริง/ของจริง — Meta ลดการมองเห็น Reels ที่ "ไม่ออริจินัล" | ❌ ไม่มี | ถ่ายมือถือเดือนละครั้ง ([[video-footage-shotlist]]) |
| ภาพ: AI วิดีโอ | แทรกเป็นช่วงสั้น | ❌ | Gemini Omni Flash (คีย์เดิม + billing) · สำรอง Kling 3.0 (~$0.084/วิ) |
| ภาพ: AI ภาพนิ่ง | — | ✅ ต้นแบบพื้นหลัง photo ([[2026-10-23-video-visual-photo-bg]]) | — |
| ภาพ: สต็อก | B-roll ทั่วไป | ❌ | Pexels API (ฟรี ใช้เชิงพาณิชย์ได้) |
| ตัดต่อ/ประกอบ | เทมเพลตซ้ำได้ ถูก | HyperFrames ✅ แข็งแรง | สำรอง Shotstack ถ้า Actions ล่ม |
| ซับ | เปิดตลอด อยู่ในเขตปลอดภัย | ✅ Chromium วาดไทย | เวลาจาก TTS ตรง (ElevenLabs timestamps) |
| ตรวจคุณภาพ | อัตโนมัติ: เขตปลอดภัย · −14 LUFS · ห้ามตัวละคร · ป้าย AI | บางส่วน (lint · ความดัง) | ตรวจคลิปด้วย Gemini ก่อนปล่อย |
| ทดลองหลายแบบ | 2–3 ฮุกต่อเนื้อหา · IG Trial Reels | ❌ | — |
| โพสต์ | Reels/TikTok ตั้งเวลา | ❌ (รูปเท่านั้น) | FB Reels `/{page}/video_reels` · IG Reels API · TikTok ต้องผ่าน audit (โพสต์ส่วนตัวได้อย่างเดียวจนกว่าผ่าน) |
| วัดผล | อัตราดูผ่าน 3 วิ 35–50% · IG skip rate < ~40% | พื้นฐาน | ดึง `reels_skip_rate` + เวลาดูเฉลี่ยทุกคืน |

## Google Flow

- **คืออะไร:** แอปทำวิดีโอ AI ของ Google (flow.google.com) รวมโมเดล **Omni Flash 1.1** (หลัก ตั้งแต่ พ.ค. 2026) + **Veo 3.1** (Lite/Fast/Quality) + Nano Banana (ภาพนิ่ง)
- **ความสามารถ:** ข้อความ→วิดีโอ · เฟรมแรก/เฟรมสุดท้าย → วิดีโอ · **Ingredients** (ภาพอ้างอิงสินค้า/ฉาก) · ต่อคลิป (Extend) · แก้คลิป (Omni) · Scene Builder เรียงคลิป · 9:16 ได้ · คลิปละ 4–10 วิ · 720p (อัปเป็น 1080p ฟรีบนแผนเสียเงิน)
- **องค์ประกอบคำสั่ง (สูตรของ Google):** **[มุมกล้อง/เลนส์] + [ตัวหลัก] + [การกระทำ] + [สถานที่/บริบท] + [สไตล์ แสง อารมณ์]**
  + เสียง: บทพูดใส่ในเครื่องหมายคำพูด · `SFX:` เอฟเฟกต์ · `Ambient noise:` เสียงบรรยากาศ
  + Omni: เขียน "single continuous shot, no scene cuts" ถ้าต้องการช็อตเดียว · จับเวลาด้วย `[0-3s]` · สิ่งที่ไม่เอาเขียนในคำสั่งเลย ("No dialogue", "No on-screen text")
  + ภาพอ้างอิงควรพื้นเรียบ · คำสั่งต้องไม่ขัดกับภาพอ้างอิง
- **ค่าใช้จ่าย:** ต้องมี Google AI Plus/Pro/Ultra · **ไทยใช้ได้** · AI Pro = 1,000 เครดิต/เดือน + 50/วัน
  · Omni 720p 8 วิ = 12 เครดิต (≈ 83 คลิป/เดือน) · Veo Fast = 20 · Veo Quality = 100 · ราคาไทย AI Pro ~750 บาท/เดือน (สื่อไทย · ยังไม่ยืนยัน)
- **ลายน้ำ:** SynthID ฝังเสมอ · ลายน้ำที่เห็นได้ปิดได้ในไทย · Google ไม่อ้างสิทธิ์ในงาน
- **ข้อจำกัดของเรา:** ❌ **ไม่มี API** (ใช้มือในเว็บเท่านั้น) · เสียงพูดภาษาไทย "ยังไม่ประเมิน" · ตัวหนังสือไทยบนภาพไม่น่าเชื่อ ·
  ชื่อ One Piece/Pokémon มีแนวโน้มโดนบล็อก (หมวด "third-party content") · โลโก้/ตัวหนังสือบนซองบิดเบี้ยวได้ → วางซองจริงทับทีหลัง
- **ทางอัตโนมัติ:** Omni ผ่าน Gemini API (โมเดลเดียวกับใน Flow · ต้องเปิด billing) หรือ Veo 3.1 บน Vertex (ปลด "17 พ.ย. 2026 หรือหลังจากนั้น")

### ตัวอย่างคำสั่งสำหรับเรา (ตามสูตร · ภาษาอังกฤษตามที่ Google แนะนำ)

```
Vertical 9:16, single continuous shot, no scene cuts.
Slow low-angle dolly push-in on a glowing trading-card vending machine in a bright modern shopping-mall corridor.
Electric neon-blue rim light, chrome reflections, shallow depth of field, energetic commercial look.
SFX: soft mechanical whirr. Ambient noise: distant mall chatter.
No people. No dialogue. No on-screen text. No logos or brand names.
```

## แหล่งอ้างอิงหลัก

Gemini video/Omni: https://ai.google.dev/gemini-api/docs/video · https://ai.google.dev/gemini-api/docs/omni · https://ai.google.dev/gemini-api/docs/pricing
· Flow: https://support.google.com/flow/answer/16353333 · https://support.google.com/flow/answer/16352836 · https://support.google.com/flow/answer/16526234 · https://support.google.com/flow/answer/16353334
· สูตรคำสั่ง Veo: https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
· ElevenLabs: https://elevenlabs.io/docs/overview/models · https://elevenlabs.io/pricing/api
· Epidemic: https://developers.epidemicsound.com/ · Pexels: https://www.pexels.com/api/documentation/
· Reels/TikTok: https://developers.facebook.com/docs/video-api/guides/reels-publishing · https://developers.facebook.com/docs/instagram-platform/content-publishing · https://developers.tiktok.com/doc/content-posting-api-get-started
· แนวปฏิบัติ TikTok: https://ads.tiktok.com/help/article/creative-best-practices

เกี่ยวข้อง: [[2026-10-23-video-visual-photo-bg]] · [[2026-10-23-video-audit-audio-layer]] · [[video-footage-shotlist]]
