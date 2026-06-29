---
type: worklog
date: 2026-06-29
tags: [marketing, automation, auto-posting, telegram, content-queue]
commits: [d604719]
---

# ระบบอัปเดตโพสต์อัตโนมัติ — ระดับ 1 + 2

## บริบท (why)
แอดมินอยากได้ระบบอัปเดตโพสต์อัตโนมัติ · วางแผนเทียบ 3 ระดับ ([[auto-posting-plan]]) → เลือก **ระดับ 1 (เครื่องมือในตัว) + ระดับ 2 (queue+เตือน)** เพราะคุ้มสุด/ไม่เสี่ยง สำหรับร้านขนาดนี้ · ระดับ 3 (Graph API) เก็บไว้ตอนสเกล

**หลักที่ยึด:** auto เฉพาะโพสต์ประจำ · **Reels เปิดซองสด = คนทำ** (ตัวเร่งผู้ติดตาม ต้องถ่ายจริง)

## สิ่งที่ทำ
**ระดับ 2 (ต่อยอดจาก Telegram reminder [[2026-06-29-telegram-marketing-reminders]]):**
- `deploy/tasks/content_queue.json` — แคปชั่นโพสต์รายวัน/slot (8 โพสต์ · แก้เองได้)
- `deploy/scraper/marketing_reminder.py` — เพิ่ม `load_captions()` → แนบแคปชั่นของวันใน Telegram digest (ใส่ `<code>` ก๊อปง่าย + เตือน "ลิงก์ใส่คอมเมนต์ ไม่ใส่ในโพสต์")
- → เตือนงาน + **ส่งแคปชั่นพร้อมก๊อปไปโพสต์** ในข้อความเดียว

**ระดับ 1 (ไม่มีโค้ด):**
- `wiki/marketing/auto-posting-level1-setup.md` — คู่มือ Meta Business Suite Planner (ตั้งโพสต์/Reels ล่วงหน้า) + LINE OA scheduler + workflow รายสัปดาห์ (จันทร์เช้า batch ทั้งสัปดาห์)

## ข้อสังเกต
- Business Suite ตั้งเวลา **Reels/วิดีโอ** ได้ ซึ่ง Graph API (ระดับ 3) ทำยาก → ระดับ 1 ครอบคลุมกว่าในหลายเคส
- content_queue แก้แล้ว push → Telegram reminder หยิบไปใช้รอบถัดไปทันที (ไม่ต้องแก้โค้ด)
- ยังต้องมีคนผลิตคอนเทนต์ (โดยเฉพาะ live pull) — automation จัดแค่ "การปล่อย"

## 🔗 เกี่ยวข้อง
[[auto-posting-plan]] · [[auto-posting-level1-setup]] · [[facebook-content-plan]] · [[2026-06-29-telegram-marketing-reminders]] · [[project_marketing_assignment]]
