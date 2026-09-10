# สัญญากลางของห้องตัดต่อวิดีโอ (Video Editor)

> ⚠️ **ไฟล์นี้คือแหล่งความจริงเดียว** — ทุกไฟล์ใน `deploy/components/editor/` และ
> `deploy/app/api/video/local/` ต้องตรงกับที่เขียนไว้ที่นี่ **ห้ามเดาเพิ่มเอง**
> (9 ก.ย. 2026: agent ขนานกันเดา schema กันเองแล้วได้ blocker 6 ตัว — ห้ามซ้ำ)

## แนวคิดหลัก

หนึ่งงานเรนเดอร์ = หนึ่งโฟลเดอร์ `.video-work/<project>/` ซึ่งมีของครบ:
`plan.json` · `voice.wav` · `timing.json` · `frames/frame_XXX.png` · `<project>.mp4`

**ตัวแสดงตัวอย่างไม่ใช่ mp4** — เป็น player ที่เราประกอบเองจาก `frames/` + `voice.wav`
+ ซับที่วาดเป็น HTML สด ๆ → แก้อะไรเห็นผลทันทีโดยไม่ต้องเรนเดอร์
(mp4 ที่เบิร์นซับแล้วเอาไว้ดู "ผลจริงล่าสุด" เท่านั้น เพราะซ้อนซับ HTML ทับมันจะเห็นซับสองชั้น)

การแก้ไขทั้งหมดเก็บใน `plan.edit` แล้วส่งกลับไปเรนเดอร์ใหม่ — เสียงถูกแคช
และข้ามการจับเวลา whisper เมื่อมี `edit.timing` → เรนเดอร์ซ้ำ ~30-40 วินาที

## 1. โครง `plan.edit` (เก็บใน plan.json — ตัวเรนเดอร์รองรับแล้ว)

```json
{
  "edit": {
    "timing":    [{ "index": 0, "start": 0.0, "end": 3.9 }],
    "subtitles": [{ "text": "ซองการ์ดในตู้เรา", "start": 0.0, "end": 1.62, "segment": 0 }],
    "scenes":    { "0": { "visual": "sku:OP 17", "zoom": 0.08,
                          "motion": "punch", "transition": "circleopen" } },
    "headline":  { "text": "...", "seconds": 3.0, "size": 86 },
    "sub_style": { "style": "brand", "size": 64, "bottom": 430 },
    "logo":      { "file": "logo.png", "pos": "tr", "size": 140, "opacity": 0.9 }
  }
}
```

กติกาแต่ละคีย์ (ทุกคีย์ใน edit เป็น optional — ไม่มี = ใช้ค่าอัตโนมัติเดิม):

- **timing** — ครบทุกฉากเรียงตาม index · `start` ของฉากคือ "จุดตัด" จริง
  (ตัวเรนเดอร์ยืดภาพถึง start ของฉากถัดไปเสมอ ช่องว่างหายใจถูกครอบอัตโนมัติ)
  มี timing → **ข้าม whisper** → เรนเดอร์เร็ว
- **subtitles** — แทนที่ทั้งชุด เรียงตามเวลา · `segment` = index ฉากที่สังกัด
- **scenes** — คีย์เป็น index ฉาก (สตริง เพราะ JSON) · `visual` ใช้รูปแบบเดียวกับ
  plan.visuals (`machine:hero` / `sku:OP 17` / `file:ชื่อไฟล์ในโฟลเดอร์งาน` /
  `tpl:<เทมเพลต>?img=sku:OP 17&title=...&tag=...` = **ฉากกราฟิกเคลื่อนไหว** —
  เรนเดอร์โดย motion.py จาก motion_templates/*.html · รายชื่อเทมเพลตกระจกอยู่ที่
  `MOTION_TEMPLATES` ใน editorStore + ตัวแปลง spec `parseTpl`/`buildTpl` ·
  ฉาก tpl ไม่ใช้ motion/zoom (ขยับเอง — effectiveMotion ฝั่งเว็บคืน "still")
  และเฟรมพรีวิวคือภาพนิ่งที่ motion.snapshot ถ่ายไว้ตอนเรนเดอร์) ·
  `zoom` = ความแรงการเคลื่อนกล้อง (0 = ภาพนิ่งสนิท ชนะทุกท่า, ค่าปกติ 0.08) ·
  `motion` = ท่ากล้อง (`zoom-in | zoom-out | punch | pan-lr | pan-rl |
  drift-down | drift-up` — คลังจริงอยู่ที่ `MOTIONS` ใน compose.py) ·
  `transition` = ทรานสิชันเข้าฉากนี้ (ชื่อ xfade ที่คัดไว้ใน `TRANSITIONS`
  ของ compose.py · ฉาก 0 ไม่มีความหมาย) · ทั้งคู่ไม่ใส่หรือใส่ `"auto"` =
  ผู้กำกับอัตโนมัติเลือกให้ (`_auto_motion`/`_auto_transition` ใน make_video.py
  **ถูกกระจกไว้ที่ `autoMotion`/`autoTransition` ใน editorStore.js —
  แก้ฝั่งหนึ่งต้องแก้อีกฝั่งเสมอ ไม่งั้นพรีวิวสดไม่ตรงผลเรนเดอร์**)
  · พรีวิวประมาณทรานสิชันด้วย CSS — จังหวะ/ทิศตรง ลวดลายละเอียดดูโหมด "ผลจริงล่าสุด"
- **logo** — `file` คือชื่อไฟล์ใน `.video-work/<project>/` (อัปโหลดผ่าน API ข้อ 2.5) ·
  `pos` ∈ `tl | tr | bl | br` · `size` = ความกว้าง px บนเฟรม 1080 · `opacity` 0-1
- **headline / sub_style** — override ค่าที่เคยอยู่ระดับบนของ plan

## 2. API routes (dev เท่านั้น — บน Vercel ตอบ 404)

ทุก route อยู่ใต้ `deploy/app/api/video/local/` และขึ้นต้นด้วย guard เดียวกัน:

```js
import { localOnly } from "../_guard"        // deploy/app/api/video/local/_guard.js
const gate = localOnly()                      // 404 ถ้าไม่ใช่เครื่อง dev
if (gate) return gate
```

(`_guard.js` เช็ค `process.env.NODE_ENV !== "production"` — เขียนไว้ให้แล้ว ห้ามเขียนใหม่)

### 2.1 `GET /api/video/local/projects`
→ `{ projects: [{ name, hasVideo, duration, segments, updated_at }] }` เรียงใหม่สุดก่อน

### 2.2 `GET /api/video/local/project?name=<project>`
→ `{ name, plan, timing, videoUrl, voiceUrl, frames }`
- `plan` = plan.json ทั้งก้อน (รวม edit ถ้ามี)
- `timing` = timing.json ทั้งก้อน `{ segments, timing, subtitles }`
- `videoUrl` = `/api/video/local/asset?name=X&file=X.mp4` (null ถ้ายังไม่มี)
- `voiceUrl` = `.../asset?name=X&file=voice.wav`
- `frames` = [`.../asset?name=X&file=frames/frame_000.png`, ...] เรียงตามฉาก

### 2.3 `GET /api/video/local/asset?name=&file=`
สตรีมไฟล์จากโฟลเดอร์งาน · **รองรับ Range header** (จำเป็น ไม่งั้น `<video>`/`<audio>`
seek ไม่ได้) · กัน path traversal: ชื่อโปรเจกต์ `[a-zA-Z0-9_-]` เท่านั้น และ
file ต้อง resolve อยู่ใต้โฟลเดอร์งานจริง · ไม่ gate auth (แท็ก media ส่ง header ไม่ได้)

### 2.4 `POST /api/video/local/render`
body: `{ name, plan }` (plan ทั้งก้อนรวม edit)
- เขียน plan ลง `.video-work/<name>/plan.json`
- spawn `python deploy/agents/video/make_video.py --plan <path> --out <mp4>` แบบ detach
  (python จาก `.venv-image/Scripts/python.exe` · env `HF_HUB_OFFLINE=1`)
- stdout/err เทลงไฟล์ `render.log` ในโฟลเดอร์งาน · กันรันซ้อน: มีไฟล์ `render.pid`
  และโปรเซสยังอยู่ → ตอบ 409
→ `{ started: true }`

### 2.5 `POST /api/video/local/upload?name=&file=logo.png`
body = binary · เซฟลงโฟลเดอร์งาน (จำกัด 5MB · เฉพาะ .png .jpg .webp)
→ `{ file: "logo.png" }`

### 2.6 `GET /api/video/local/render-status?name=`
อ่าน `render.log` → `{ running, step, total, message, done, error, log }`
- `step/total` แกะจากบรรทัดล่าสุดรูปแบบ `[n/6]` ของ make_video
- `done` = โปรเซสจบ + mp4 ใหม่กว่า log · `error` = จบแบบ exit != 0 (อ่านท้าย log)

## 3. โครง state ฝั่งหน้าเว็บ

อยู่ใน `editorStore.js` — **useReducer ธรรมดา ห้ามลง dependency ใหม่**
ทุก component รับ `{ state, dispatch, api }` ผ่าน props จาก shell (ไม่มี context ซ้อน)

```js
state = {
  project: "cliptest-...",
  plan: {...},                    // plan.json ปัจจุบัน (รวม edit ที่กำลังแก้)
  segments: [...],                // จาก timing.json (อ่านอย่างเดียว — ข้อความบทพากย์)
  timing: [...],                  // ใช้งานจริง = plan.edit.timing ?? timing.json.timing
  subtitles: [...],               // ใช้งานจริง = plan.edit.subtitles ?? timing.json.subtitles
  voice: "Aoede",                 // เสียงพากย์ (ระดับ plan ไม่ใช่ edit) — VOICES ใน store
  voiceStyle: "",                 // อารมณ์การอ่าน (plan.voice_style) — "" = ปกติ
  assets: { videoUrl, voiceUrl, frames: [] },
  ui: {
    t: 0,                         // เวลาปัจจุบัน (วินาที)
    playing: false,
    zoom: 1,                      // px ต่อวินาที ของ timeline = 40 * zoom
    snap: true,
    safeArea: false,
    selected: { kind: null, index: null },   // kind ∈ "scene"|"sub"|"headline"|"logo"
    dirty: false,                 // มีแก้ที่ยังไม่ได้เรนเดอร์
    rendering: { running: false, step: 0, total: 6, error: null },
  },
}
```

action ที่ reducer ต้องมี (ชื่อตายตัว — Inspector/Timeline/Cards เรียกตามนี้):

```
LOAD_PROJECT {payload}            SEEK {t}            PLAY / PAUSE
SELECT {kind,index}               SET_ZOOM {zoom}     TOGGLE_SNAP / TOGGLE_SAFE
SUB_EDIT {index, patch}           // patch: {text?|start?|end?}
SUB_SPLIT {index, at}             // แบ่งการ์ดที่เวลา at (ตัดข้อความตามสัดส่วน)
SUB_MERGE {index}                 // รวมกับใบถัดไป
SUB_NUDGE {index, edge:"start"|"end", by}
CUT_NUDGE {index, by}             // ขยับจุดตัดหน้าฉาก index (แก้ timing[index].start
                                  // และ end ของฉากก่อนหน้า · ห้ามชนกรอบข้างเคียง เว้นระยะขั้นต่ำ 0.35)
SCENE_SET {index, patch}          // patch: {visual?|zoom?}
SCENE_SWAP {index, dir:+1|-1}     // สลับ "ภาพ" กับฉากข้างเคียง (เสียงไม่ขยับ)
HEADLINE_SET {patch}              SUBSTYLE_SET {patch}     LOGO_SET {patch|null}
VOICE_SET {patch}                 // patch: {voice?|style?} — เขียนลง plan.voice /
                                  // plan.voice_style ตอน buildPlanForRender
UNDO / REDO                       RENDER_STATUS {payload}
```

⚠️ **กติกาเสียง**: เปลี่ยน voice/voice_style แล้วเรนเดอร์ = TTS สร้าง voice.wav ใหม่
ตัวเรนเดอร์ (make_video ขั้น 2) ตรวจจับเองจาก voice.stamp แล้ว**ทิ้ง edit.timing กับ
edit.subtitles ทั้งในรอบนั้นและใน plan.json** (จังหวะอ่านเปลี่ยน เวลาเก่าใช้ไม่ได้) —
ห้องตัดต่อไม่ต้องจัดการเอง แค่โหลดผลใหม่หลังเรนเดอร์เสร็จตามปกติ

- ทุก action ที่แก้เนื้อหา (SUB_* CUT_* SCENE_* HEADLINE_* SUBSTYLE_* LOGO_*)
  ต้อง push snapshot ลง undo stack (เก็บเฉพาะส่วนที่แก้ได้: timing/subtitles/edit)
  และตั้ง `ui.dirty = true`
- `buildPlanForRender(state)` ใน store แปลง state → plan พร้อม edit ครบ ส่งให้ API 2.4

## 4. ไฟล์และเจ้าของ (แต่ละ agent แตะเฉพาะไฟล์ตัวเอง)

| ไฟล์ | หน้าที่ |
|---|---|
| `deploy/app/video/editor/page.jsx` | เปลือกบาง ๆ อ่าน `?project=` → `<VideoEditor/>` |
| `deploy/components/editor/VideoEditor.jsx` | เชลล์: โหลดข้อมูล, จัด layout 3 คอลัมน์+timeline, top bar, คีย์ลัด, autosave localStorage, ปุ่มเรนเดอร์+โพลสถานะ |
| `deploy/components/editor/editorStore.js` | reducer + buildPlanForRender + ตัวช่วยเวลา (มีโครงให้แล้ว — เติมได้ ห้ามเปลี่ยนชื่อ action/คีย์ state) |
| `deploy/components/editor/PreviewPlayer.jsx` | player จาก frames+voice: `<audio>` เป็นนาฬิกาหลัก, CSS Ken Burns ต่อฉาก, ซับ/พาดหัว/โลโก้เป็น HTML ทับ, เส้น safe area |
| `deploy/components/editor/Timeline.jsx` | ruler + แทร็ก: ฉาก(รูปย่อ) เสียง(waveform canvas จาก voice.wav ผ่าน WebAudio) พาดหัว ซับ(ชิป) เพลง(ว่าง) · playhead ลาก/คลิก seek · ลากขอบชิปซับ + ลากจุดตัดฉาก (pointer events) · snap |
| `deploy/components/editor/SubtitleCards.jsx` | รายการการ์ดซับซ้ายมือ: แก้ข้อความ inline, merge/split, nudge, คลิก = seek+select |
| `deploy/components/editor/InspectorPanel.jsx` | แท็บขวา: ฉาก / ซับ / พาดหัว / โลโก้ ตาม state.ui.selected |
- **สไตล์: CSS Module ประจำไฟล์ตัวเอง** — `VideoEditor.module.css`,
  `Timeline.module.css`, `PreviewPlayer.module.css`, `SubtitleCards.module.css`,
  `InspectorPanel.module.css` · แต่ละ agent เขียนของตัวเอง **ห้ามแตะไฟล์ css ของคนอื่น**
  (เหตุผล: ไฟล์ css กลางไฟล์เดียวเขียนพร้อมกัน 5 คนคือชนกันแน่ และ App Router
  การันตีเฉพาะ CSS Module ว่า import จาก client component ได้เสมอ)

- ภาษาไทยทั้ง UI และคอมเมนต์ · สีแบรนด์: พื้นกรมท่าเข้ม `#081228`/`#0a1a3a` +
  ฟ้านีออน `#3ddcff` · ตัวรอง `#8aa2c8` · แดงเตือน `#ff4d6d`
- **ห้ามลง npm dependency ใหม่เด็ดขาด**
- คลาส global ของแอปที่ใช้ต่อได้: `dx-input` `dx-btn` (มีธีมอยู่แล้ว)

## 5. ค่าคงที่ร่วม (อยู่ท้าย editorStore.js — import จากที่เดียว)

```js
export const FPS = 30
export const MIN_SCENE = 0.35          // ฉากสั้นสุด (ตรงกับ compose.py)
export const MIN_SUB = 0.25            // ซับสั้นสุด
export const PPS_BASE = 40             // px ต่อวินาทีที่ zoom = 1
export const NUDGE = 0.1               // ปุ่มขยับละเอียด (วินาที) · Shift = 0.5
export const VOICES = [ ... 5 เสียงที่ทดสอบแล้ว ... ]
```
