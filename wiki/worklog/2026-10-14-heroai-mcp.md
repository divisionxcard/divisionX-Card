---
type: worklog
date: 2026-10-14
tags: [hermes, mcp, video, heroai, claude-code]
commits: [18e9413]
status: ✅ เชื่อม Hero AI Studio ผ่าน MCP แล้วทั้ง Claude Code และ Hermes · ทดสอบคลิป 17 วิ ใช้รูปสินค้า/ตู้จริงเป็น B-roll สำเร็จ · 🟡 ยังไม่ได้ต่อเข้าคิวโพสต์ของเรา
---

# เชื่อม Hero AI Creator Studio เข้า MCP (Claude Code + Hermes) และทดสอบคลิปจริง

เจ้าของถาม (14 ต.ค.) ว่าโรงงานวิดีโอต่อ MCP กับ Claude Opus 5.5 ได้ไหม แล้วส่งหน้า Settings → AI Agent (MCP) ของ Hero AI มา
— ผมเคยตอบว่า Hero ไม่มี API (ดูจากหน้าสาธารณะ) ซึ่ง**ผิด**: หน้าหลังล็อกอินมี MCP endpoint `https://studio.heroaiengine.com/api/mcp` + สร้าง token ได้

## ที่ทำ

- **Claude Code**: `claude mcp add --transport http --scope user heroai <url> --header "Authorization: Bearer heroai_pat_…"` → เก็บใน `~/.claude.json` (นอก repo) · status Connected · เซสชันใหม่ถึงเห็นเครื่องมือ
- **Hermes**: `config.yaml → mcp_servers.heroai: {url, headers.Authorization, timeout 180}` (สำรอง `config.yaml.bak-before-heroai`) · รีสตาร์ต gateway · `hermes mcp list` ✓ enabled
- สคริปต์ยิงตรงไว้ทดสอบ: scratchpad `heroai_probe.py` (initialize → tools/list) · `heroai_call.py` (tools/call) — ต้องส่ง `Accept: application/json, text/event-stream`
- บัญชี: divisionxcard@gmail.com แผน PRO 100 นาที/เดือน + 50 เครดิต · Hero จัดการคีย์ Gemini ให้ · ไม่มี ElevenLabs/HeyGen/Pexels

## Hero MCP มี 25 เครื่องมือ — flow ที่ใช้จริง

```
prepare_video_job(script, brollSource=external, exportMode=hold, voice…)  → quoteId + confirmationUrl (หมดอายุ ~20 นาที · ยังไม่หักอะไร)
เจ้าของเปิด confirmationUrl กดยืนยัน (agent ทำแทนไม่ได้) → get_video_quote = approved
create_video_job({quoteId}) → jobId · status queued → processing → held (ตัวอย่างพร้อม ~1 นาที)
get_edit_state → windows[] (ช่วง B-roll) + captions[] → replace_broll_window(windowIndex, url) ใส่รูปจริงของเรา
  · merge_captions / split_caption แก้ซับที่ตัดกลางวลี · set_headline_hook · set_background_music(trackId, volume=จำนวนเต็ม)
export_video → rerendering → exporting → done (~2 นาที) → videoUrl / download_video(videoId)
```

## ผลทดสอบ (job `cmv838drx02wflceds4ck5svk`)

- บท 46 คำเรื่อง OP-17 มาถึงตู้ · เสียง Gemini "Zephyr" cheerful · ซับ 11 การ์ด QA passed (forced alignment) · 17.15 วิ 1080×1920 24 MB
- B-roll 5 ช่วง → รูปซอง OP-17 · ตู้ (`/machine/machine-hero.jpg`) · ซอง PRB-02 · ตู้ (`machine-scene.jpg`) · ซอง OP-17 — **เห็นสินค้าจริงทุกเฟรม ไม่มีซองยาอีกแล้ว**
- พาดหัว "OP-17 มาถึงตู้แล้ว / DivisionX Card" 3 วิแรก · เพลง Pop-Happy-Groovy 25% ducking
- ใบยืนยันระบุใช้ 1 นาทีเรนเดอร์ในแผน เครดิต 0 · หลังเสร็จ usageCount ยัง 0/100 (อาจอัปเดตช้า)
- สำเนา: `backups/2026-10-14-heroai-test/op17-test-17s.mp4` + เฟรมตรวจ · ลิงก์: https://studio.heroaiengine.com/api/renders/render-1791981616904-ab7490f9843f157a19d1f40d4af5b76e.mp4

## กับดักที่เจอ

- **ลิงก์ยืนยันเปิดตอนยังไม่ล็อกอิน → เด้งไปหน้าต้อนรับ และหลังล็อกอินไม่พากลับมา** เจ้าของกด "ยืนยัน" ไป 2 รอบแต่ใบยังเป็น draft
  → ต้องล็อกอินให้เสร็จก่อน แล้วค่อยวางลิงก์ในแท็บเดียวกัน (ขอใบใหม่ได้ฟรีด้วย `prepare_video_job` + idempotencyKey ใหม่)
- `set_background_music.volume` ต้องเป็นจำนวนเต็ม (25) ไม่ใช่ 0.25 → MCP error -32602
- สถานะหลัง create คือ `held` (ไม่ใช่ done) — ลูป poll ต้องรู้จักคำนี้ ไม่งั้นรอเปล่า 5 นาที
- รูปซองเป็น WebP โปร่ง → Hero วางบนพื้นขาว fit=cover · ถ้าอยากได้พื้นแบรนด์ต้องแปลงเป็น JPG พื้นกรมท่าก่อนส่ง (เหมือนกับดักใน [[project_video_studio]])
- ซับใหญ่ตัดกลางคำบนจอแคบ ("ไม่เท่า/กัน") — ลด `subtitleSize` หรือแบ่งการ์ดสั้นลงด้วย `regroup_captions`

## ยังไม่ได้ทำ

- ต่อผลลัพธ์เข้าคิวโพสต์ของเรา (`marketing_content` media_url) — ตอนนี้ได้แค่ลิงก์ mp4
- กฎให้ Hermes/Claude ใช้ external B-roll + รูปจริงเสมอ ควรเขียนไว้ใน SOUL/USER.md ของ Hermes (เจ้าของแก้เอง) หรือในพรอมต์ตอนสั่ง
- เทียบคุณภาพเสียง/ซับกับโรงงานวิดีโอของเราเอง (Gemini TTS เหมือนกัน · ซับ Hero ใช้ forced alignment)

เกี่ยวข้อง: [[2026-10-13-hermes-nous-free-ended]] · [[project_video_studio]]
