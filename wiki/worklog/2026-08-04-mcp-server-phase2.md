---
type: worklog
date: 2026-08-04
tags: [mcp, openclaw, claude-code, agents, refactor, supabase]
commits: [81b2bbc]
status: ✅ เฟส 2 เสร็จ — MCP server 6 tools · OpenClaw probe เห็นครบ · รวมชั้นข้อมูลเหลือแหล่งเดียว
---

# เฟส 2 — MCP server เปิดข้อมูล DivisionX ให้ agent ถามเอง

## บริบท (why)
เฟส 1 ([[2026-08-04-openclaw-skills-phase1]]) ทำ skill ที่ห่อสคริปต์ตายตัว — ตอบได้เฉพาะคำถาม
ที่เตรียมไว้ล่วงหน้า ถามนอกกรอบ (เช่น *"เทียบยอด 2 สัปดาห์แล้วบอกว่าตู้ไหนตก"*) ทำไม่ได้

MCP เปิด **tool ที่ agent เลือกเรียกเองพร้อม argument ที่มันคิดเอง** → ตอบคำถามที่เราไม่ได้
เตรียมไว้ได้ และใช้ตัวเดียวกันได้ทั้ง OpenClaw กับ Claude Code (ไม่ต้องเขียนซ้ำสองที่)

## สิ่งที่ทำ

### สถาปัตยกรรม — รวมตรรกะเหลือแหล่งเดียว
```
deploy/agents/dvx_data.py        ← ชั้นข้อมูลกลาง (query Supabase · คืน dict ล้วน)
        ├── deploy/agents/dvx_query.py      (CLI · ฟอร์แมตข้อความไทย)
        └── deploy/mcp/dvx_mcp_server.py    (MCP · ส่ง dict ให้ agent)
```

ตอนเขียน MCP server แรก ๆ มันไป query เองแยกจาก `dvx_query.py` → กลายเป็นตรรกะซ้ำสองชุด
**ซึ่งเป็นบั๊กแบบเดียวกับ [[project_sku_mapping_two_scraper_maps]] ที่เคยเจอมาแล้ว** จึงหยุดแล้ว
แยก `dvx_data.py` ออกมาเป็นชั้นกลาง ให้ทั้ง CLI และ MCP เรียกตัวเดียวกัน

`query_restock_alerts()` port logic จาก `restock_guard.py` มา — ตรวจแล้วให้ผลตรงกันเป๊ะ
(เกณฑ์ `--threshold-days 2 --min-velocity 1` ได้ 2 alerts เท่ากันทั้งคู่)

### Tools (6 ตัว)
| tool | ใช้ตอบ | เขียนข้อมูล |
|---|---|---|
| `list_machines` | มีตู้อะไรบ้าง | — |
| `get_sales` | ยอดขาย · แยกตู้/SKU/รายวัน · ระบุช่วงเองได้ | — |
| `get_stock` | ของเหลือรายช่อง | — |
| `get_restock_alerts` | ต้องเติมอะไรก่อน (คิด velocity ให้) | — |
| `get_sync_status` | sync เสร็จยัง | — |
| `sync_data` | สั่งดึงข้อมูลใหม่ | ✅ |

ประกาศ `read_only_hint` ใน MCP annotations → client รู้เองว่าตัวไหนปลอดภัย
`sync_data` เป็นตัวเดียวที่ `read_only_hint: false`

## จุดตัดสินใจ
- **MCP SDK v2.0.0** — `FastMCP` เปลี่ยนชื่อเป็น `MCPServer` (`mcp.server`) ตรวจ API จริงก่อนเขียน
  ไม่เดาจากที่จำมา · schema ของ tool มาจาก type hints ของฟังก์ชันอัตโนมัติ
- **Python ไม่ใช่ Node** — ตรรกะ query เป็น Python อยู่แล้ว (`restock_guard`, `dvx_query`)
  เขียน MCP เป็น Node แปลว่าต้อง port ตรรกะข้ามภาษา = ตรรกะซ้ำอีกชุด
- **ไม่ทำ resources/prompts** — ข้อมูลเป็น query แบบมีพารามิเตอร์ ไม่ใช่เอกสารนิ่ง tools ตรงกว่า
- **`instructions` ของ server เขียนเตือนเรื่อง sync** — ยอดขาย sync วันละครั้ง ถ้า agent ถามยอด
  วันนี้ได้ 0 ต้องบอกผู้ใช้ว่า "ยังไม่ sync" ไม่ใช่สรุปว่า "ขายไม่ได้"

## ทดสอบแล้ว (ของจริง)
- MCP client ต่อ stdio → `list_tools` ได้ 6 tools · annotations ถูกต้อง
- `get_sales(days=7, group_by=sku)` → 368,230 บาท · OP-13 อันดับ 1 (ตรงกับ CLI)
- `get_restock_alerts` → ตรงกับ `restock_guard.py` ทุกเกณฑ์ที่ลอง
- error path: `machine='บางแค'` → คืน error บอกว่ากำกวม ตรงหลายตู้ (ไม่เดา)
- `openclaw mcp probe` → `divisionx: 6 tools`
- **regression CLI หลัง refactor**: ตัวเลขตรงเดิมทุกคำสั่ง · เจอ 1 บั๊กจากการ refactor
  (วันที่ sync กลับด้านเป็น mm/dd) แก้แล้ว

## ค้าง / ถัดไป
- ยังไม่ได้ลองใช้ผ่านบอท Telegram จริง (ต้อง `openclaw mcp reload` แล้วทักบอท)
- `sync_data` ยังพึ่ง description บอก agent ให้ถามก่อน — ควรตั้ง approval ฝั่ง OpenClaw เพิ่ม
- ถ้าย้าย repo ต้องแก้ path 2 ที่: `~/.openclaw/openclaw.json` และ `.mcp.json`

## 🔗 เกี่ยวข้อง
[[2026-08-04-openclaw-skills-phase1]] · [[2026-08-04-refill-events-sold-between-fix]] · [[project_sku_mapping_two_scraper_maps]] · [[reference_supabase_rest_access]]
