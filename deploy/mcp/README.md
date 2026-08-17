# DivisionX MCP Server

เปิดข้อมูลตู้กดการ์ดให้ AI agent ถาม-ตอบได้อิสระ ผ่าน [Model Context Protocol](https://modelcontextprotocol.io/)
ใช้ได้ทั้ง **OpenClaw** และ **Claude Code** จากตัวเดียวกัน

> **เฟส 2** ของงานต่อ AI agent เข้าระบบ — เฟส 1 คือ [OpenClaw skills](../../openclaw/README.md)
> ต่างกันตรง: skill = สคริปต์ตายตัวที่ agent สั่งได้ · MCP = tool ที่ agent เลือกเรียกเอง
> พร้อม argument ที่มันคิดเอง ตอบคำถามที่เราไม่ได้เตรียมไว้ล่วงหน้าได้

## Tools

| tool | ตอบคำถามแนว | เขียนข้อมูล |
|---|---|---|
| `list_machines` | "มีตู้อะไรบ้าง" | — |
| `get_sales` | "ยอดขายเมื่อวาน" "ตู้ไหนขายดี" "SKU ไหนมาแรง" "เทียบ 2 สัปดาห์" | — |
| `get_stock` | "ตู้ชลบุรีเหลืออะไร" "ช่องไหนว่าง" | — |
| `get_restock_alerts` | "ต้องเติมอะไรบ้าง" "ตู้ไหนของหมด" | — |
| `get_sync_status` | "sync เสร็จยัง" "cron รอบล่าสุดผ่านไหม" | — |
| `sync_data` | "ดึงข้อมูลใหม่" "backfill ยอดขาย" | ✅ **เขียนจริง** |

ทุก tool ยกเว้น `sync_data` ประกาศ `read_only_hint: true` ไว้ใน MCP annotations
→ client ที่รองรับจะรู้เองว่าตัวไหนปลอดภัย ตัวไหนควรขออนุญาตก่อน

## สถาปัตยกรรม

```
deploy/agents/dvx_data.py        ← ชั้นข้อมูลกลาง (query Supabase · คืน dict)
        ├── deploy/agents/dvx_query.py      (CLI · ฟอร์แมตเป็นข้อความไทย)
        └── deploy/mcp/dvx_mcp_server.py    (MCP · ส่ง dict ให้ agent)
```

**ตรรกะ query อยู่ที่เดียว** — ถ้าแก้วิธีคิด velocity หรือการแปลง timezone
CLI กับ MCP ได้ผลตรงกันเสมอ ไม่ต้องไล่แก้สองที่

`sync_data` / `get_sync_status` เรียกผ่าน [trigger_workflow.py](../agents/trigger_workflow.py)
ซึ่งกัน backfill เกิน 5 วันไว้ให้แล้ว

## ติดตั้ง

```bash
py -3 -m pip install mcp
```

ต้องมี `deploy/.env.local` ที่มี `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
และ `GH_PAT` (เฉพาะ `sync_data` / `get_sync_status`) — อ่านให้เองผ่าน `envload.py`

### Claude Code

มี [`.mcp.json`](../../.mcp.json) ที่ root ของ repo อยู่แล้ว — เปิด session ใหม่ก็เห็น tools เลย

### OpenClaw

ลงทะเบียนไว้แล้วด้วย:

```bash
openclaw mcp add divisionx --command py \
  --arg -3 --arg "c:/Projects/divisionX Card/deploy/mcp/dvx_mcp_server.py" \
  --cwd "c:/Projects/divisionX Card" --parallel
```

ตรวจว่าเห็น tools ครบ:

```bash
openclaw mcp probe     # ควรขึ้น "divisionx: 6 tools"
openclaw mcp reload    # หลังแก้โค้ด server — ให้ OpenClaw ทิ้ง runtime เก่า
```

> ถ้าย้าย repo ต้องแก้ path ทั้งใน `openclaw.json` (ผ่าน `openclaw mcp set`) และ `.mcp.json`

### Hermes Agent (ต่อไว้แล้ว 2026-08-17)

config อยู่ที่ `C:\Users\choog\AppData\Local\hermes\config.yaml` (Windows ไม่ใช่ `~/.hermes`):

```yaml
mcp_servers:
  divisionx:
    command: py
    args: ['-3', 'c:/Projects/divisionX Card/deploy/mcp/dvx_mcp_server.py']
    enabled: true
    connect_timeout: 60
    tools:
      exclude: [sync_data]      # เริ่มแบบอ่านอย่างเดียว · เอาออกเมื่อพร้อมให้สั่ง sync
```

**ไม่ต้องตั้ง `cwd` หรือ `env`** — [envload.py](../agents/envload.py) หา `deploy/.env.local` จากตำแหน่งไฟล์ตัวเอง
(ต่างจาก OpenClaw ที่ต้องระบุ `--cwd`)

```bash
hermes mcp list            # ควรขึ้น divisionx · ✓ enabled
hermes mcp test divisionx  # ควรขึ้น Connected + Tools discovered: 6
hermes tools list          # ยืนยันว่า [excluded: sync_data] จริง
```

ในแชทพิมพ์ `/reload-mcp` หลังแก้โค้ด server · ตัว `hermes mcp add` ถามยืนยันแบบ interactive
รันจาก agent ไม่ได้ — แก้ `config.yaml` ตรง ๆ เร็วกว่าและได้ `exclude` ตั้งแต่แรก

## ทดสอบมือ

รัน server แล้วคุยผ่าน MCP client:

```bash
py -3 - <<'EOF'
import asyncio, json
from mcp import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters

async def main():
    p = StdioServerParameters(command="py", args=["-3", "deploy/mcp/dvx_mcp_server.py"],
                              cwd="c:/Projects/divisionX Card")
    async with stdio_client(p) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            print([t.name for t in (await s.list_tools()).tools])
            res = await s.call_tool("get_restock_alerts", {})
            print(json.loads(res.content[0].text))

asyncio.run(main())
EOF
```

## ข้อควรระวัง

- **`sync_data` เปลี่ยนข้อมูลจริง** — description บอก agent ให้ยืนยันกับผู้ใช้ก่อน
  แต่นั่นเป็นแค่คำสั่งใน prompt ไม่ใช่การบังคับ ควรตั้ง approval ฝั่ง client ด้วย
- **service key อยู่บนเครื่องที่รัน server** — MCP server เข้าถึง Supabase ด้วยสิทธิ์เต็ม
  อย่ารัน server นี้บนเครื่องที่ไม่ได้คุม
- **ยอดขายเป็นรายรับก่อนหัก** ค่าธรรมเนียม payment gateway (VMS 1.5% · WW 0.5%)
- ข้อมูลสต็อกเป็นภาพนิ่ง ณ รอบ sync — `get_stock` คืน `age_hours` กับ `stale` มาให้
  agent บอกผู้ใช้ได้ว่าข้อมูลเก่าแค่ไหน
