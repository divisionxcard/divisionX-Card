---
type: worklog
date: 2026-06-29
tags: [telegram, automation, marketing, github-actions, reminders]
commits: [1060b6d]
---

# ระบบแจ้งเตือนงานการตลาดประจำวันเข้า Telegram

## บริบท (why)
ทำการตลาด FB ([[facebook-content-plan]]) มีงานประจำวัน (โพสต์/LINE broadcast/แจกการ์ด) → อยากได้ตัวเตือน · แอดมินขอ **แยก Telegram ใหม่** ไม่ให้ปนกับแจ้งเตือน scraper เดิม (TELEGRAM_BOT_TOKEN/ADMIN/OWNER)

## สิ่งที่ทำ
- **`deploy/tasks/marketing_reminders.json`** — config งาน (แก้เองได้) · field: `slot` (morning|evening) · `days` ("daily" หรือ list Mon-Sun) · 13 งาน
- **`deploy/scraper/marketing_reminder.py`** — คำนวณเวลาไทย (UTC+7) + วันในสัปดาห์ → filter งานตาม slot/วัน → ส่ง digest เข้า Telegram
  - ใช้ env **ชุดใหม่แยก**: `TELEGRAM_MKT_BOT_TOKEN` + `TELEGRAM_MKT_CHAT_ID` (ไม่ import telegram_alert.py เพราะตัวนั้นผูก env scraper)
  - slot เดาจากเวลาไทย (<12 = เช้า) หรือรับ argv · ไม่มี secret = skip เงียบ (workflow ไม่พัง)
- **`.github/workflows/marketing-reminders.yml`** — cron 2 รอบ: `0 1 * * *` (08:00 ไทย) + `0 10 * * *` (17:00 ไทย) + workflow_dispatch (เลือก slot ทดสอบได้)

## ค้าง: แอดมินต้องตั้งเอง (ไม่งั้นยังไม่ส่ง)
1. สร้าง bot ใหม่ที่ @BotFather (หรือ reuse) → token
2. สร้างกลุ่ม Telegram ใหม่ + add bot → หา chat_id (getUpdates)
3. เพิ่ม GitHub Secrets: `TELEGRAM_MKT_BOT_TOKEN`, `TELEGRAM_MKT_CHAT_ID`
4. ทดสอบ: Actions → Marketing Task Reminders → Run workflow (เลือก slot)

## 🔗 เกี่ยวข้อง
[[facebook-content-plan]] · [[facebook-growth-playbook]] · [[project_marketing_assignment]] · เทียบ pattern: stock-low-alert.yml + telegram_alert.py
