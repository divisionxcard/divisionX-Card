---
type: guide
date: 2026-10-23
tags: [video, google-flow, prompt, background]
---

# คู่มือทำคลิปพื้นหลังด้วย Google Flow (สำหรับวิดีโอ DivisionX)

> เจ้าของอยากลองใช้ Flow ก่อน (23 ต.ค. 2026) · Flow ไม่มี API → ทำด้วยมือในเว็บ แล้วส่งไฟล์ให้ระบบประกอบ
> ระบบเราวางซองจริง กระดานอันดับ ซับไทย เสียงพากย์ และเอฟเฟกต์ทับเอง — **คลิปจาก Flow เป็นแค่ "ฉากหลังที่เคลื่อนไหว"**
> ข้อมูล Flow ทั้งหมด: [[video-system-components-tools]]

## ตั้งค่าใน Flow

| ช่อง | ค่าที่ใช้ |
|---|---|
| โมเดล | **Omni Flash 1.1** (12 เครดิต/คลิป 8 วิ ที่ 720p) · ทดลองไอเดียด้วย 360p (6 เครดิต) ก่อน |
| สัดส่วน | **9:16 (แนวตั้ง)** |
| ความยาว | **8 วินาที** (ระบบยืดช้าลงได้ถึง 2 เท่า + วนซ้ำเองถ้าฉากยาวกว่า) |
| ดาวน์โหลด | 1080p (อัปสเกลฟรีบนแผนเสียเงิน) |
| ลายน้ำที่เห็นได้ | ปิดได้ในเมนูโปรไฟล์ (ไทยไม่ถูกบังคับ) · SynthID ที่มองไม่เห็นยังฝังอยู่เสมอ — ปกติ |

## กติกาของฉากหลังเรา (ใส่ท้ายคำสั่งทุกครั้ง)

```
Vertical 9:16, single continuous shot, no scene cuts. Slow, smooth camera movement.
Keep the centre of the frame calm and slightly darker. No people, no characters,
no creatures, no text, no signs, no logos, no trading cards or packs. No dialogue.
```

- **ห้ามพิมพ์ชื่อค่าย/ตัวละคร** (One Piece, Pokémon, Luffy …) — Flow มักบล็อก และเราห้ามวาดตัวละครอยู่แล้ว · บรรยาย "บรรยากาศ" แทน
- กล้องต้อง **ช้า** — ภาพหลังเคลื่อนเร็วแย่งสายตาจากซองกับกระดาน
- เสียงในคลิปไม่ถูกใช้ (ระบบตัดทิ้ง) ไม่ต้องสนใจ

## สูตรคำสั่ง (ของ Google)

**[กล้อง/เลนส์] + [ตัวหลักของฉาก] + [สิ่งที่เคลื่อนไหว] + [สถานที่/เวลา] + [สไตล์ แสง อารมณ์]** + กติกาข้างบน

## คำสั่งพร้อมใช้ (ก๊อปทั้งก้อน)

**OP — ทะเลพายุบนหัวเรือ** (แนวที่เจ้าของชอบที่สุด)
```
Slow forward dolly along the weathered wooden deck of an old sailing ship toward its bow, on a vast stormy
ocean at golden hour. The sun breaks through towering storm clouds in god rays, waves crash and spray
glitters, ropes and rigging sway in the wind. Epic cinematic matte-painting look, warm gold against deep
navy-blue shadows.
```

**OP — ถ้ำสมบัติ**
```
Slow push-in through a sea cave glittering with scattered gold coins and closed wooden treasure chests,
shafts of sunlight pouring through cracks in the rock, shimmering water reflections dancing on the walls.
Cinematic adventure-film lighting, warm gold and teal.
```

**PKM — ทุ่งหญ้ากับพายุไฟฟ้า**
```
Slow low-angle crane up over a sunlit meadow of tall grass and wildflowers rippling in the wind, a distant
storm over rolling hills crackles with bright electric-blue lightning, puffy white clouds, sparkling light
particles in the air. Bright, friendly anime feature-film background style.
```

**DB — ดินแดนหินกับพลังสีทอง**
```
Slow orbit around a vast rocky wasteland, pebbles and dust lifting into the air, golden energy crackling
across a stormy orange sky, shockwaves rippling through the clouds. Explosive, epic, cinematic.
```

**YGH — วิหารโบราณ**
```
Slow dolly through an ancient carved-stone temple hall, rows of stone tablets glowing with violet glyph
light, drifting incense haze, flickering candlelight. Mysterious, deep violet and gold.
```

**NRT — หมู่บ้านบนเขายามเย็น**
```
Slow pan across a misty mountain village at dusk, wooden rooftops and paper lanterns glowing, swirling green
leaves carried by the wind, distant waterfalls. Warm cream and orange light, ink-painting mood.
```

**SL — ประตูดันเจี้ยน**
```
Slow push toward a colossal stone dungeon gate with a swirling violet rift portal at its centre, cold blue mist
rolling across the floor, floating dust particles. Dark, ominous, cinematic.
```

**ALL — เวทีประกาศรางวัล** (ใช้ได้ทุกค่าย · เหมาะกับคลิปจัดอันดับ)
```
Slow dolly toward a futuristic awards stage in a dark arena: glossy reflective black floor, five tall glowing
electric-cyan light columns pulsing gently, volumetric spotlights sweeping through haze, tiny gold sparks
drifting. Celebratory, premium 3D render look.
```

**ALL — ห้องนักสะสมยามค่ำ**
```
Slow lateral tracking shot past glass display cabinets in a premium collector's lounge at night, shelves
glowing with warm amber and electric-cyan accent light and nothing recognisable on them, soft bokeh,
glossy floor reflections. Photorealistic, moody, cinematic.
```

### ทำให้ภาพนิ่ง AI ของเราเคลื่อนไหว (Frames to Video)

เอาภาพพื้นหลังที่ระบบวาดไว้ (เช่น `research/video-tests/bg-proto/backgrounds.png` ตัดทีละใบ) ใส่เป็น **เฟรมแรก** แล้วสั่ง:
```
Animate this image as a single continuous shot: slow push-in, waves roll, clouds drift, light rays shimmer.
Keep everything else the same. No people, no text, no dialogue.
```

## ส่งคลิปเข้าระบบ

1. ดาวน์โหลดคลิปจาก Flow → วางที่ `research/flow-clips/` บนเครื่อง
2. ตั้งชื่อไฟล์ขึ้นต้นด้วยรหัสค่าย: `OP-ทะเลพายุ-01.mp4` · `PKM-ทุ่งหญ้า.mp4` · `ALL-เวที.mp4`
   (รหัส: OP PKM DB YGH NRT SL MLBB TF MLP · ALL = ใช้ได้ทุกค่าย) · มีไฟล์ `.txt` ชื่อเดียวกันเก็บคำสั่งไว้ได้
3. บอก Claude หรือรัน `python -m agents.video.broll_import` ใน `deploy/` → ตัดเสียง · แปลงเป็นแนวตั้ง 1080×1920 · อัปขึ้นคลัง
4. คลิปถัดไปที่พระเอกเป็นค่ายนั้น ระบบหยิบคลิป Flow ไปเป็นพื้นหลังเอง (ไม่มีคลิปตรงค่าย = ให้ AI วาดภาพนิ่งแทน)
