---
type: worklog
date: 2026-07-01
tags: [agents, ai, telegram, sales, automation, digest]
commits: [a13eff1, 1614cde]
---

# AI สรุปยอดขายรายสัปดาห์ → Telegram

## บริบท (why)
จากแผน [[ai-content-intelligence-plan]] เลือกทำข้อ 1 (ปลอดภัยสุด/ใช้ข้อมูลเราเอง): สรุปยอดขาย+คำแนะนำรายสัปดาห์อัตโนมัติเข้า Telegram

**ข้อค้นพบสำคัญ:** `reconcile_agent.py` เดิม (ที่ตั้งใจต่อยอด) จริงๆ ใช้ **Ollama local (qwen2.5)** ไม่ใช่ Claude — Ollama รันบน GitHub Actions cron ไม่ได้ (ไม่มี local server) → ออกแบบใหม่ให้ทำงานบน cloud cron

## สิ่งที่ทำ
- **`deploy/agents/weekly_sales_digest.py`** — สแตนด์อโลน ดึง sales 14 วันจาก Supabase REST (urllib, ไม่พึ่ง `supabase` pkg)
  - **core = คำนวณล้วน** (ไม่พึ่ง LLM): ยอดรวม + เฉลี่ย/วัน + ยอดต่อตู้ + WoW% (▲▼) + Top 5 SKU + ตู้ยอดตก ≥25%
  - ส่งเข้า **Telegram การตลาด** (`TELEGRAM_MKT_*` — bot เดียวกับ reminder, แยกจาก scraper)
  - **ชั้น AI (Claude) = optional** — `ai_insight()` เรียก `claude-opus-4-8` เขียน insight+คำแนะนำ 3 ข้อ **เฉพาะเมื่อมี `ANTHROPIC_API_KEY`** (try/except กันพัง · ไม่มี key = ส่ง digest ตัวเลขปกติ)
- **`.github/workflows/weekly-sales-digest.yml`** — cron จันทร์ 09:00 ไทย (`0 2 * * 1`) + workflow_dispatch · pip install anthropic

## ทำไมออกแบบแบบนี้
- core คำนวณล้วน → รันได้เลย ฟรี เสถียร ไม่ต้องมี LLM/คีย์
- Claude เป็นชั้นเสริม (opt-in) → อยากได้ narrative ค่อยใส่ `ANTHROPIC_API_KEY` (มีค่าใช้จ่าย opus 4.8 $5/$25 · จะสลับ sonnet-4-6 ลดคอสต์ได้)
- verified: ยอดขาย sync สด (ล่าสุด 30 มิ.ย. · 7 วัน 1,640 รายการ) → digest ไม่ว่าง

## ค้าง: ต้องมี secret ก่อนรัน
- ต้องมี `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (มีอยู่แล้ว จาก scraper) + `TELEGRAM_MKT_*` (ตั้งแล้ว)
- `ANTHROPIC_API_KEY` = optional (ยังไม่มี → ข้ามชั้น AI อัตโนมัติ)
- ทดสอบ: Actions → Weekly Sales Digest → Run workflow

## 🔗 เกี่ยวข้อง
[[ai-content-intelligence-plan]] · [[2026-06-29-telegram-marketing-reminders]] · reconcile_agent.py (ต้นแบบ · Ollama) · [[project_marketing_assignment]]
