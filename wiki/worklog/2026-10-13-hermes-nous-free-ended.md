---
type: worklog
date: 2026-10-13
tags: [hermes, model, review, cost, infra]
commits: []
status: 🔴 Hermes ไม่มีโมเดลใช้ตั้งแต่ 12 ต.ค. เที่ยง (Nous ฟรีตาย) · 🟡 ทดสอบไทย/ราคา/ทางฟรีครบแล้ว รอเจ้าของเช็ค OpenAI data sharing · ✅ สคริปต์เฝ้าคิวเขียน+ทดสอบแล้ว ยังไม่ผูก
---

# โมเดลฟรีของ Hermes ตาย — สืบสาเหตุ ทดสอบตัวแทน และทางฟรีที่เหลือ

ต่อจาก [[2026-10-12-review-notes-foreign-script]] ข้อค้าง "เปลี่ยนโมเดลตัวตรวจให้เก่งไทย" · เจ้าของบอก "ผมพร้อมแล้ว" (12 ต.ค. 23:40)

## ที่พบ

- **โมเดลหลัก `upstage/solar-pro4:free` หมดช่วงฟรีแล้ว** — API ตอบ 404 *"This model's free period has ended"* · รายการฟรีของ Nous
  (`GET /v1/models` 422 รุ่น) เหลือ 9 ตัว: step-3.7-flash · step-5-preview (ฟรีถึง 15 ต.ค.) · laguna-s/xs-2.1 · ling-3.0-flash-fin/sante ·
  longcat-2.0 (ตอบ 404 "no longer free") · longcat-2.5-preview · solar-mini4
- **บัญชี Nous ของเราได้ 401 "invalid, blocked or out of funds" กับโมเดลฟรีทุกตัว** แม้รีเฟรชโทเคนใหม่
  (โทเคนใน `auth.json` อายุ 1 ชม. · รีเฟรชด้วย `hermes_cli.auth.resolve_nous_access_token()`) → **ทั้งตัวตรวจ ตัววางแผน และห้องแชท Telegram ตอบไม่ได้**
- ย้อนหลัง 4-12 ต.ค. request dump ของตัวตรวจ 77 ไฟล์ = ตัวสำรอง `poolside/laguna-s-2.1:free` ล้มล้วน (429 ×44 · timeout 90-150 วิ ×26 · ต่อไม่ติด ×7)
  · `executions.db` 28 ก.ย.-5 ต.ค. รันวันละ 30-46 รอบเพราะ retry · 12 ต.ค. ล้ม 4 รอบติดตั้งแต่เที่ยง
- **โทเคนจริงต่อรอบ** (`cron/usage_audit.jsonl`): ตัวตรวจ prompt รวมทุกเทิร์นมัธยฐาน 550k (สูงสุด 3.75M) completion ~5k · ตัววางแผน ~390k
  · ต่อเทิร์น ~33k = system prompt 36k chars + **สคีมาเครื่องมือ 28 ตัว ~17k token** (bfl video ×6, browser, computer_use, terminal, tts…) + ข้อความ

## ทดสอบภาษาไทยกับแคปชั่นจริง #57 (top5) และ #56 (ranking)

สคริปต์ `thai_screen.py` (scratchpad) ยิง chat/completions ตรง ใช้ rules จาก `content_voice.json` ขอ JSON verdict+notes ไทยล้วน:

| โมเดล | เวลา | ผล |
|---|---|---|
| gpt-5.4 reasoning low | 5-8 วิ | วิจารณ์ตรงจุดสุด (hook จืด · "ราคาไม่ใช่ตัวนำ" ดึงโฟกัสผิด) ไม่มโน |
| gpt-5.4-mini | 3-7 วิ | ไทยดี · โหมด medium มโน "เปิดด้วยอังกฤษยาวเกิน" (ไม่จริง) · low ปกติ |
| gpt-5.6-luna ($0.2/$1.2) | 6-7 วิ | **ตัวเดียวที่จับ "ด้ง!!" (ตำแหน่ง 748 ของ #57) พิมพ์ผิดจาก DON!!** · เข้มเรื่องคำอังกฤษไปหน่อย |
| gpt-5.4-nano | 2-4 วิ | ติเรื่องที่ไม่ใช่ปัญหา |
| gpt-5-mini | 15-18 วิ | คิดนาน (1.8-2.3k token) · เข้มเรื่องความยาว |
| gemini-flash/lite-latest | 1-5 วิ | ผ่านทุกชิ้นด้วยคำชมกว้าง ๆ จับข้อผิดไม่ได้ |
| Nous ฟรี 5 ตัว | — | 401 ทดสอบไม่ได้ |

ไม่มีตัวไหนหลุดอักษรจีน/ญี่ปุ่น · ราคา (จาก `/v1/models` ของ Nous มี `input_cache_read`): gpt-5.4 2.5/15 · mini 0.75/4.5 · luna 0.2/1.2 · nano 0.2/1.25 · haiku-5.5 0.1/0.5

## ทางฟรีที่เหลือ (ค้น 13 ต.ค.)

| ทาง | สถานะ |
|---|---|
| OpenAI โทเคนฟรีรายวันผ่าน data sharing | ถ้าบัญชี "eligible": รุ่น mini ได้หลายล้าน token/วัน · แลกข้อมูลฝึกโมเดล · **เจ้าของเลือกเช็คทางนี้ก่อน** |
| Nous Portal | ฟรีเทียร์ยังมี แต่บัญชีเรา 401 · ต้องดูที่ portal เอง · ไม่น่าเชื่อถืออยู่ดี |
| Z.AI glm-4.7-flash | ฟรี · 1 concurrent · ~1,000/วัน (ไม่ยืนยัน) · tool calling ได้ · Hermes มี provider `zai` |
| Mistral Experiment | ฟรี ~1B token/เดือน · ต้องเบอร์โทร + ยอมให้ฝึก · ต้อง custom provider |
| Gemini (คีย์เดิม) | `flash-latest` ฟรี **20 คำขอ/วัน** (quotaId ใน idea_angles.py) · ไม่พอ 1 รอบ |
| Cerebras / OpenRouter / GitHub Models | บริบทฟรี 8k · 50 คำขอ/วัน · ปิดบริการกลางปี 2026 |
| Ollama ในเครื่อง (qwen2.5:14b, RTX 3050 6GB) | ช้าเป็นนาทีต่อเทิร์น · tool calling อ่อน |

## เครื่องมือที่เตรียมไว้แล้ว (ยังไม่ผูก)

- `scripts/hermes/review_monitor.py` (ก๊อปไป `hermes/scripts/`) — `monitor_script` ของงาน 47c6603299a7: พิมพ์คิว `status in (pending,draft) & review_verdict is null`
  เรียงตาม id + updated_at · Hermes เทียบไบต์ต่อไบต์ เปลี่ยนค่อยปลุกโมเดล · ทดสอบ: waiting=18 · ล้ม = exit 1 (ไม่นับเป็นการเปลี่ยน)
- `enabled_toolsets` ต่องาน (cronjob tool รับ) — ตัดสคีมาเครื่องมือที่ไม่ใช้ · MCP ของเราเข้าผ่าน `tool_search/tool_call`
- Provider ที่ resolve ผ่านแล้ว (dry-run): `openai-api` ← OPENAI_API_KEY (api_mode codex_responses) · `gemini` ← GEMINI_API_KEY · ชื่อ `openai` เฉย ๆ ไม่มี
- สำรองก่อนแก้: `backups/2026-10-13-hermes-before-gemini/` (config.yaml · jobs.json · hermes.env)

## กับดักที่เจอ

- โทเคน Nous ใน auth.json หมดอายุทุกชั่วโมง → ยิงตรงได้ 401 ทั้งที่ gateway (รีเฟรชในหน่วยความจำ) ยังใช้ได้ · ต้องรีเฟรชก่อนตีความ 401
- สถานะใน `executions.db` คือ `completed/failed` ไม่ใช่ `ok` (นับผิดรอบแรก)
- Git Bash heredoc กิน `\\` → เขียน `'\\'` ใน Python กลายเป็น `'\'` พัง · เลี่ยง double backslash ใน heredoc
- Hermes ลงที่ `%LOCALAPPDATA%\hermes\hermes-agent` (venv ในนั้น) · ตัวแปร PYTHONPATH ไม่ได้ตั้งถาวร

## รอเจ้าของ

- [ ] เช็คหน้า OpenAI → Settings → Organization → Data controls → Sharing ว่ามี "eligible for free daily usage" ไหม (เลือกทางนี้ 14 ต.ค.)
- [ ] เมื่อได้คำตอบ: ใส่คีย์ใน `hermes/.env` · config.yaml model.default/fallback · `cronjob(update)` งาน 47c6603299a7 + 34712d0ace30 (provider/model/monitor_script/enabled_toolsets) · รีสตาร์ต gateway · สั่งรัน 1 รอบดูโน้ตจริง

เกี่ยวข้อง: [[2026-10-12-review-notes-foreign-script]] · [[2026-10-10-brand-hashtag-and-op17-audit]]
