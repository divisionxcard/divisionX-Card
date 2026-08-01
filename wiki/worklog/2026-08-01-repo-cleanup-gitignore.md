---
type: worklog
date: 2026-08-01
tags: [repo, gitignore, housekeeping, knowledge-base, obsidian]
commits: [ba26b17]
status: ✅ เคลียร์ untracked ค้าง · git status เหลือแต่ไฟล์ที่ต้องตัดสินใจ 7 ไฟล์
---

# เก็บกวาด untracked ใน repo + กันไฟล์ใหญ่หลุดเข้า git

## บริบท (why)
`git status` มี untracked ค้างสะสมกว่า 20 รายการมานาน — ปนกันทั้งงานจริง (knowledge base, design bundle)
กับไฟล์ที่ **ห้ามเข้า git** โดยเฉพาะ `image/` ที่โต **774MB** (ต้นฉบับรูป ซึ่งโฮสต์บน Supabase Storage อยู่แล้ว)
→ ถ้าเผลอ `git add .` ครั้งเดียวคือ repo พังถาวร (history ลบยาก) จึงต้องแยก commit/ignore ให้ชัดก่อน

## สิ่งที่ทำ
**commit เข้า repo** (งานจริง เป็น text ล้วน)
- `wiki/knowledge-base/` 5 ไฟล์ — ฐานความรู้ให้ AI agent อ่านต่อ (frameworks/stories/stances/voice)
- `deploy/docs/DivisionX-Bundle.md` + `claude-design-reference.jsx.txt` — input ของงานออกแบบ
- `.claude/settings.json` (permission allowlist ของโปรเจกต์ · ไม่มี secret) · `wiki/.obsidian/` core config

**เพิ่ม .gitignore**
| รายการ | เหตุผล |
|--------|--------|
| `image/` | 774MB · อยู่บน Supabase Storage แล้ว |
| `คู่มือ - พัฒนาโปรแกรม POS สำหรับตู้ Vending/` | PDF/doc จากคู่ค้า 8.2MB (งาน [[project_kingpower_aot]]) |
| `*.xlsx` · `deploy/docs/*.zip` | ไฟล์งานแอดมิน/ไบนารี |
| `.claude/worktrees/` · `.claude/settings.local.json` | เฉพาะเครื่อง |
| `wiki/Untitled*` | ไฟล์ที่ Obsidian เผลอสร้าง |

## ค้าง — ต้องให้เจ้าของตัดสินใจ (ไม่ลบเอง)
- `backend/database/migrations/043_revert_wwv02_vendor.sql` (62 B) — **ไม่ใช่ SQL** เป็นข้อความ paste
  (`VCM350CKC23050301 ยานนาวา WorldWide Vending 100%`) · เลข 043 ยังชนกับ `043_fix_ww_vendor_ids.sql` ที่ commit แล้ว
- ไฟล์ว่าง 0 byte 6 ไฟล์: `wiki/FB08.md` `OP08.md` `SLLUA51.md` `chukes03.md` `chukes04.md` `project_payment_gateway.md`
  · น่าจะกดสร้างพลาดใน Obsidian (ของจริงอยู่ใน `wiki/skus/` และ `wiki/machines/`)

## 🔗 เกี่ยวข้อง
[[2026-07-29-ygh-chaos-origins-packs-per-box]] · [[project_kingpower_aot]]
