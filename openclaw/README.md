# OpenClaw Skills — DivisionX Card

ชุด skill ให้ [OpenClaw](https://docs.openclaw.ai/) สั่งงานระบบ DivisionX ผ่านแชต (Telegram/LINE/WhatsApp)
โดยไม่ต้องเปิดเว็บ — ถามยอดขาย ดูของเหลือหน้าตู้ สั่ง sync ได้จากมือถือ

> **เฟส 1** = skill wrapper ครอบสคริปต์ที่มีอยู่แล้วใน `deploy/agents/`
> ยังไม่มี MCP server (เฟส 2) — agent เรียกสคริปต์ผ่าน shell ตรง ๆ

## Skills

| skill | ตอบคำถามแนว | เรียก |
|---|---|---|
| `dvx-restock` 📦 | "ต้องเติมอะไรบ้าง" "ตู้ไหนของหมด" | `restock_guard.py --dry-run` |
| `dvx-sales` 💰 | "ยอดขายเมื่อวานเท่าไหร่" "ตู้ไหนขายดี" | `dvx_query.py sales` |
| `dvx-stock` 🏪 | "ตู้บางแคเหลืออะไรบ้าง" "ช่องไหนว่าง" | `dvx_query.py stock` |
| `dvx-sync` 🔄 | "ดึงข้อมูลใหม่" "backfill ยอดขาย" | `trigger_workflow.py` |
| `dvx-brief` 📣 | "สรุปการตลาด" "ขอไอเดียโพสต์" | `weekly_marketing_brief.py` (ต้องมี Ollama) |

สคริปต์ที่ skill เรียก อยู่ใน [deploy/agents/](../deploy/agents/) — อ่าน env จาก `deploy/.env.local` เอง
ผ่าน [envload.py](../deploy/agents/envload.py) จึงรันได้เลยโดยไม่ต้อง export อะไรก่อน

## ติดตั้ง

### 1. ติดตั้ง OpenClaw + ต่อช่องแชต

ทำตาม [docs.openclaw.ai/start/getting-started](https://docs.openclaw.ai/start/getting-started)
แล้วต่อ Telegram (เร็วสุด) ตาม [คู่มือ channel](https://docs.openclaw.ai/)

> ⚠️ **ต้องตั้ง `allowFrom`** ให้รับเฉพาะ chat id ของเรา ไม่งั้นใครทักบอทก็สั่งงานได้ —
> skill เหล่านี้เข้าถึงข้อมูลยอดขายและสั่ง sync ได้

### 2. ชี้ OpenClaw มาที่โฟลเดอร์นี้

แก้ `~/.openclaw/openclaw.json` เพิ่ม:

```json
{
  "skills": {
    "load": {
      "extraDirs": ["c:/Projects/divisionX Card/openclaw/skills"]
    }
  }
}
```

> เก็บ skill ไว้ใน repo แบบนี้เพื่อให้ version control ตามงานจริง — ถ้าย้าย repo ต้องแก้ path นี้
> และแก้ `cd "c:/Projects/divisionX Card"` ใน SKILL.md ทุกไฟล์ด้วย

### 3. ตรวจว่าโหลดขึ้น

```bash
openclaw skills list
```

ควรเห็น `dvx-restock`, `dvx-sales`, `dvx-stock`, `dvx-sync`, `dvx-brief`
แล้วลองพิมพ์ในแชต: **"ตู้ไหนต้องเติมของบ้าง"**

## ข้อกำหนด

| ต้องมี | หมายเหตุ |
|---|---|
| Python 3.11+ | เรียกด้วย `py` บน Windows · เปลี่ยนเป็น `python3` ใน SKILL.md ถ้าย้ายไป Linux |
| `deploy/.env.local` | ต้องมี `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GH_PAT` |
| Ollama | เฉพาะ `dvx-brief` — ถ้าไม่เปิดอยู่ skill จะรันไม่ผ่าน |

ไม่ต้องลง pip package เพิ่ม — สคริปต์ใช้ `urllib` จาก stdlib ล้วน

## ข้อควรระวัง

- **เครื่องต้องเปิดอยู่** OpenClaw จึงจะตอบได้ — ถ้าอยากให้ตอบตลอด 24 ชม. ต้องย้ายขึ้น VPS
  แต่ `deploy/.env.local` มี service key ของ Supabase ต้องคุมสิทธิ์เครื่องนั้นให้ดี
- skill ที่**อ่านอย่างเดียว**: `dvx-sales`, `dvx-stock`, `dvx-restock` (มี `--dry-run`)
- skill ที่**เปลี่ยนข้อมูลจริง**: `dvx-sync` (เขียน Supabase ผ่าน GitHub Actions) — SKILL.md
  สั่งให้ agent ยืนยันกับผู้ใช้ก่อน แต่ควรตั้ง approval ฝั่ง OpenClaw กันอีกชั้น
- สคริปต์ที่ไม่ใส่ `--dry-run` (`restock_guard`, `weekly_marketing_brief`, `content_suggester`)
  จะ**ส่งข้อความเข้ากลุ่ม Telegram การตลาดจริง** — SKILL.md กำชับไว้แล้ว แต่ให้รู้ไว้ด้วย

## รันเองใน terminal ก็ได้ (ไม่ต้องผ่าน OpenClaw)

```bash
cd "c:/Projects/divisionX Card"
py deploy/agents/dvx_query.py machines
py deploy/agents/dvx_query.py sales --days 7 --by sku --top 5
py deploy/agents/dvx_query.py stock --machine chukes01 --low
py deploy/agents/restock_guard.py --dry-run
py deploy/agents/trigger_workflow.py --list
```

## เฟส 2 — MCP server (เสร็จแล้ว ✅)

[`deploy/mcp/`](../deploy/mcp/README.md) เปิด 6 tools ให้ agent เรียกเองพร้อม argument ที่มันคิดเอง
ลงทะเบียนกับ OpenClaw แล้ว (`openclaw mcp probe` → `divisionx: 6 tools`)

**skill กับ MCP ต่างกันยังไง:** skill = สคริปต์ตายตัวที่เตรียมไว้ล่วงหน้า เหมาะกับงานประจำ ·
MCP = tool ที่ agent เลือกเรียกเอง ตอบคำถามที่เราไม่ได้เตรียมไว้ได้ (เช่น "เทียบยอด 2 สัปดาห์
แล้วบอกว่าตู้ไหนตก") ใช้คู่กันได้ ไม่ต้องเลือกอย่างใดอย่างหนึ่ง
