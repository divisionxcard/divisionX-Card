---
type: worklog
date: 2026-08-04
tags: [openclaw, agents, skills, telegram, automation, supabase]
commits: [1c3f280]
status: ✅ เฟส 1 เสร็จ — 5 skill + 2 สคริปต์ใหม่ ทดสอบผ่านจริงทุกคำสั่ง
---

# ต่อ OpenClaw เข้าระบบ DivisionX — เฟส 1 (skill wrapper)

## บริบท (why)
อยากสั่งงาน/ถามข้อมูลระบบตู้จากมือถือผ่านแชต ไม่ต้องเปิดเว็บ
[OpenClaw](https://docs.openclaw.ai/) คือ gateway self-hosted ที่เชื่อมแอปแชต (Telegram/LINE/WhatsApp)
เข้ากับ AI agent ที่มี shell + skill — ข้อมูลไม่ออกนอกเครื่องเพราะรันเองทั้งหมด

เลือกทำ **เฟส 1 = skill wrapper** ก่อน MCP server เพราะของที่ต้องใช้มีอยู่แล้วเกือบครบ
(`deploy/agents/` + service key + GH_PAT) → ได้ใช้จริงเร็ว โดยไม่ต้องแตะสถาปัตยกรรม

## สิ่งที่ทำ

### สคริปต์ใหม่ (`deploy/agents/`)
| ไฟล์ | หน้าที่ |
|---|---|
| `envload.py` | อ่าน `deploy/.env.local` → `os.environ` เอง ไม่ต้องพึ่ง python-dotenv · map alias `NEXT_PUBLIC_SUPABASE_URL`→`SUPABASE_URL` · บน GitHub Actions ไม่มีไฟล์ → เงียบ ใช้ secrets ตามเดิม |
| `dvx_query.py` | อ่านข้อมูลสด read-only: `machines` · `sales` (--days/--date/--from--to · --by machine\|sku\|day) · `stock` (--low) |
| `trigger_workflow.py` | สั่ง GitHub Actions ด้วยชื่อสั้น (`stock`, `sales`, `ww-sales` …) + `--status` ดูผลรันล่าสุด · เวอร์ชัน Python ข้ามแพลตฟอร์มของ `scripts/trigger-ww-backfill.ps1` และครอบทุกยี่ห้อ ไม่ใช่แค่ WW |

แก้ `restock_guard.py` เพิ่ม `load_env_local()` → รันในเครื่องได้เลยโดยไม่ต้อง export env ก่อน

### Skills (`openclaw/skills/`)
`dvx-restock` 📦 · `dvx-sales` 💰 · `dvx-stock` 🏪 · `dvx-sync` 🔄 · `dvx-brief` 📣

เก็บไว้ใน repo (ไม่ใช่ `~/.openclaw/workspace`) เพื่อให้ version control ตามงานจริง
→ ชี้ผ่าน `skills.load.extraDirs` ใน `~/.openclaw/openclaw.json` (วิธีตั้งอยู่ใน `openclaw/README.md`)

## จุดตัดสินใจ

- **`--dry-run` เป็นค่าเริ่มต้นใน SKILL.md** — `restock_guard` / `weekly_marketing_brief` /
  `content_suggester` ถ้าไม่ใส่จะยิงเข้ากลุ่ม Telegram การตลาดจริง กำชับไว้ในทุก skill ที่เกี่ยวข้อง
- **`dvx_query.py` แยกจาก `weekly_sales_digest.py`** — ตัวเดิมออกแบบมาเพื่อ "ส่ง digest ตาม cron"
  ไม่มี arg วันที่/ตู้ และส่ง Telegram เสมอ · งานถาม-ตอบต้องการ read-only + query ยืดหยุ่น
- **timezone** — `sold_at` ใน DB เป็น UTC · `dvx_query.py` แปลงขอบเขตวันไทย (UTC+7) ให้เอง
  ทุก `--date/--from/--to` จึงเป็นเวลาไทยตรง ๆ ไม่ต้องคิดเลขเอง
- **`--machine` รับคำค้นภาษาไทย** เช่น `--machine ชลบุรี` · ถ้าตรงหลายตู้ (เช่น "บางแค" ตรงทั้ง
  chukes01 กับ wwv05) จะ error พร้อมรายชื่อ ให้ agent ถามผู้ใช้ต่อ ไม่เดาเอง
- **กัน backfill > 5 วัน** ย้ายมาไว้ใน `trigger_workflow.py` ด้วย (เดิมมีแต่ใน .ps1) และ validate
  input ให้ครบก่อนยิง — กันกรณีสั่งเป็นกลุ่มแล้วพังกลางทาง

## ทดสอบแล้ว (ของจริง ไม่ mock)
- `machines` → 13 ตู้ active เรียงตาม `id` ถูกต้อง
- `sales --days 3` → 124,570 บาท · แยก 13 ตู้ · `--by sku` · `--by day` · `--date + --machine` ผ่านหมด
- `stock --machine chukes01 --low` → 🔴 ว่าง 3 ช่อง + บอกอายุข้อมูล (10 ชม.ที่แล้ว)
- `restock_guard.py --dry-run` → 2 alert ที่ chukes04 (ไม่ได้ส่ง Telegram)
- `trigger_workflow.py --status vms-stock` → เห็น 5 รอบล่าสุด · guard 20 วัน error ถูกต้อง
- `weekly_marketing_brief.py --dry-run` → Ollama qwen2.5:7b ออกบรีฟครบ

## ค้าง / ถัดไป
- ยังไม่ได้ติดตั้ง OpenClaw จริง — ฝั่งผู้ใช้ต้องลง + ต่อ Telegram + ตั้ง `allowFrom` เอง
- **`allowFrom` สำคัญ** — ถ้าไม่ตั้ง ใครทักบอทก็เห็นยอดขาย/สั่ง sync ได้
- ถ้าย้ายไป VPS ให้ตอบ 24 ชม. → service key จะไปอยู่บนเครื่องนั้น ต้องคุมสิทธิ์
- **เฟส 2**: ห่อ query เป็น MCP server → agent ถาม-ตอบได้อิสระกว่าเรียกสคริปต์ตายตัว
  และใช้ร่วมกับ Claude Code ได้

## 🔗 เกี่ยวข้อง
[[2026-08-01-repo-cleanup-gitignore]] · [[project_actual_usage_scope]] · [[project_marketing_assignment]] · [[reference_manual_stock_sync_buttons]] · [[reference_trigger_github_workflow]]
