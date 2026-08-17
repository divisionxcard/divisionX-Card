---
type: worklog
date: 2026-08-17
tags: [mcp, hermes, agents, nous, telegram, security]
commits: []
status: ✅ ต่อเสร็จ ใช้งานได้จริงบนเครื่อง — Telegram ตั้งค่าไว้แล้วแต่ยังไม่เปิด gateway
---

# ต่อ Hermes Agent เข้ากับข้อมูลตู้ผ่าน MCP

เจ้าของถามว่าจะเชื่อม [Hermes Agent](https://hermes-agent.nousresearch.com) (Nous Research) กับระบบเรายังไง

**คำตอบสั้น ๆ: ไม่ต้องเขียนโค้ดใหม่เลย** — Hermes ต่อ MCP ได้ทั้ง stdio และ HTTP/SSE
ส่วน [MCP server ของเรา](../../deploy/mcp/dvx_mcp_server.py) ทำไว้ตั้งแต่ [[2026-08-04-mcp-server-phase2]] แล้ว
งานทั้งหมดคือเพิ่ม 12 บรรทัดใน `config.yaml` ของ Hermes

## ผลลัพธ์ที่พิสูจน์แล้ว

```
hermes -z "ตอนนี้ตู้ไหนต้องเติมของบ้าง ตอบสั้น ๆ เป็นภาษาไทย"
→ ตู้ที่ 5 (wwv01) · เซ็นทรัล รามอินทรา — One Piece OP-09 หมดแล้ว (เฉลี่ยขาย 2.4 ชิ้น/วัน)
```

ตรงกับที่ `get_restock_alerts` คืนมาเป๊ะ — โมเดลเลือกเรียก tool เองโดยไม่ต้องบอกชื่อ tool
และเรียบเรียงเป็นไทยได้ ทั้งที่เป็นโมเดลจีนบนแพ็กเกจฟรี

## ค่าที่ตั้งไว้

| | ค่า | เหตุผล |
|---|---|---|
| provider | Nous Portal (แพ็กเกจ FREE) | ไม่ต้องมี API key ของตัวเอง · Tool Gateway ที่ต้องจ่ายเงินเราไม่ได้ใช้ |
| โมเดลหลัก | `meituan/longcat-2.0:free` | เจ้าของหาข้อมูลมาเอง — MoE 1.6T ทำมาเพื่องาน agent โดยเฉพาะ |
| โมเดลสำรอง | `stepfun/step-3.7-flash:free` → `poolside/laguna-s-2.1:free` | โมเดลฟรีโดน rate limit ช่วง peak และถูกถอด listing โดยไม่แจ้ง |
| terminal backend | local | repo กับ `.env.local` อยู่เครื่องนี้ · Docker จะต้อง mount เพิ่มโดยไม่จำเป็น |
| tools ที่เปิด | 5 จาก 6 (`exclude: [sync_data]`) | เริ่มแบบอ่านอย่างเดียว |

## จุดที่เสียเวลา (เผื่อรอบหน้า)

**`hermes` ไม่โผล่ใน PATH ของ session ที่เปิดค้างไว้ก่อนติดตั้ง** — ตัวติดตั้งเขียน PATH ลง registry
แต่ process ที่รันอยู่แล้วถือ env snapshot เก่า เรียกด้วย path เต็มแทน:
`C:\Users\choog\AppData\Local\hermes\hermes-agent\bin\hermes.exe`

**บน Windows config ไม่ได้อยู่ที่ `~/.hermes`** อย่างที่เอกสารเขียน แต่อยู่ที่ `%LOCALAPPDATA%\hermes\`
(`config.yaml` · `.env` · `auth.json`)

**`hermes mcp add` ถามยืนยันแบบ interactive** ("Enable all 6 tools?") → agent ที่ไม่มี TTY ตอบไม่ได้ ถูกยกเลิกทิ้ง
แก้ `config.yaml` ตรง ๆ เร็วกว่า และได้ `tools.exclude` ตั้งแต่แรกโดยไม่ต้องไปปิดทีหลัง

**ตัวช่วยตั้งค่าเขียน `config.yaml` ใหม่จาก 101 KB เหลือ 5 KB** (ตัดคอมเมนต์ตัวอย่างทิ้ง)
แต่ **เก็บบล็อก `mcp_servers` ที่เราใส่ไว้ครบ** — สำรองไฟล์ไว้ก่อนแตะเป็นนิสัยที่ถูกแล้ว

**การล็อกอิน Nous Portal ติดที่บัญชียังไม่มีแพ็กเกจ** — หน้าอนุมัติอุปกรณ์ไม่ขึ้นจนกว่าจะเลือกแพ็กเกจ
(FREE $0 ก็ผ่าน) ระหว่างนั้น CLI ค้างที่ `Waiting for approval` จนโค้ดหมดอายุ

## ความปลอดภัย — สิ่งที่ต้องไม่ลืม

MCP server ตัวนี้ถือ **service key ของ Supabase (ข้าม RLS ทั้งฐาน) + `GH_PAT`** และ terminal backend เป็น local
แปลว่าใครสั่ง Hermes ได้ = สั่งเครื่องนี้ได้

- ตั้ง allowlist Telegram ไว้แล้ว (user ID เดียว) — ถ้าเว้นว่างคือเปิดให้ทุกคนบนโลก
- `sync_data` ปิดไว้ก่อน (เขียน DB จริง + สั่ง GitHub Actions ได้)
- **ยังไม่เปิด `hermes gateway`** — ตั้งใจ รอให้มั่นใจเรื่องคุณภาพคำตอบก่อน
  (`python-telegram-bot` ยังไม่ได้ลงด้วย · `hermes doctor` เตือนไว้)
- สร้างบอท Telegram ตัวใหม่แยกจากของ OpenClaw — บอทเดียวกันให้สองระบบดึงข้อความจะชนกัน (error 409)

## ถัดไป

- เปิด gateway จริง (ลง `python-telegram-bot` ก่อน) แล้วลองถามจากมือถือ
- ถ้าคุณภาพคำตอบดี → พิจารณาเปิด `sync_data`
- ถ้าอยากใช้จากที่อื่นที่ไม่ใช่เครื่องนี้ ต้องเพิ่ม HTTP/SSE transport + auth ให้ MCP server (ตอนนี้ stdio อย่างเดียว)

## 🔗 เกี่ยวข้อง
[[2026-08-04-mcp-server-phase2]] · [[2026-08-04-openclaw-skills-phase1]]
