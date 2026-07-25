---
type: marketing
scope: automation-architecture
date: 2026-07-25
tags: [marketing, automation, ai-insights, restock-guard, telegram, content-queue, ollama]
status: 🟢 เริ่มแล้ว — Loop 3 (restock-guard) build เสร็จ · Loop 1/2 วางแผน
---

# ใช้ AI Insights ขับเคลื่อนการตลาดอัตโนมัติ

ต่อยอดจาก [[ai-content-intelligence-plan]] — เอา **สัญญาณจาก AI Insights** (ที่มีอยู่แล้ว) มายิงเป็น **action การตลาดอัตโนมัติ** ผ่านท่อที่ระบบมีอยู่ ไม่สร้างของใหม่ทั้งหมด

## หลักการ: Insights = เครื่องยิงสัญญาณ

[/api/wiki-insights](../../deploy/app/api/wiki-insights/route.js) + [sku_profile_agent.py](../../deploy/agents/sku_profile_agent.py) ผลิต **structured signals** ต่อ SKU/ตู้อยู่แล้ว (trend_pct, net_margin_pct, velocity, ยอดต่อตู้, สต็อกคงเหลือ) — เดิมแค่โชว์บน Dashboard เฉย ๆ · แผนนี้เอา signal ไปสั่ง action

```
sku_profile_agent → wiki/skus/*.md → /api/wiki-insights → [rule engine / agent]
                                                                  ↓
                    ┌──────────────┬──────────────┬──────────────┐
                 content_queue   Telegram MKT    LINE OA        restock alert
                 (โพสต์)         (สั่งงานคน)      (broadcast)     (กันยอดหลุด)
```

## Signal → Action

| สัญญาณ | ความหมาย | Action อัตโนมัติ |
|---|---|---|
| 🔥 winner (trend +) | ของฮิต | เติมคิวโพสต์ "มาแรงประจำสัปดาห์" + ดันขึ้นต้น [products](../../deploy/app/products/page.jsx) |
| ❄️ loser (trend −) | ของตก | เตือนทำโปร/รีวิว + คอนเทนต์กระตุ้นเฉพาะตัว |
| ⚠️ low margin | กำไรบาง | เตือน **อย่าทุ่มงบแอด** ตัวนี้ · โฟกัสงบ SKU margin ดี |
| 📉 ยอดตู้ตก WoW | ทำเลอ่อน | LINE broadcast geo-targeted + คอนเทนต์ต่อสาขา |
| 📦 ฮิตใกล้หมด (velocity สูง + stock ต่ำ) | ⭐ **quick win** | เตือนเติมด่วน — "ไม่ปล่อย SKU ฮิตว่าง" = ยอดที่หายฟรี |

> จุดแรงสุด = แถวสุดท้าย · จาก [[project_marketing_assignment]] สรุปเองว่า **ปัญหาคือจำนวนบิล ไม่ใช่ AOV** และ **OP ฮิตหมดกลางวัน → ยอดถูก cap** · เติมได้เฉพาะห้างปิด (วันละรอบ) → เอา velocity+stock มายิงเตือน = ได้ยอดคืนโดยไม่เสียค่าโฆษณา

## 3 Automation Loops

### 🟢 Loop 3 — Restock Guard (build เสร็จแล้ว · เริ่มที่นี่)
เตือน "SKU ฮิตที่จะหมดก่อนเติมรอบหน้า" เข้า Telegram การตลาด — **ไม่ใช้ LLM · rule ล้วน · ฟรี · รันบน cloud cron**
- [restock_guard.py](../../deploy/agents/restock_guard.py): stock (แปลงกล่อง→ซอง) ÷ velocity (sales 14 วัน) = days_cover · flag 🔴 หมดแล้ว / 🟠 หมดวันนี้ / 🟡 เสี่ยง
- [restock-guard.yml](../../.github/workflows/restock-guard.yml): cron **11:30 + 14:30 ไทย** (หลังพีคเช้า/บ่าย) + dispatch (ปรับ threshold/velocity/dry-run)
- ทดสอบ dry-run กับข้อมูลจริง: logic ถูก (จับ OP-10 ชลบุรี, แปลงหน่วยถูก) · วันเติมเต็มไม่มี alert = ถูกต้อง
- **ต้องตั้ง GitHub Secrets** `TELEGRAM_MKT_BOT_TOKEN` + `TELEGRAM_MKT_CHAT_ID` (มีอยู่แล้วจาก weekly digest)

### 🟡 Loop 1 — Weekly Marketing Brief (ถัดไป · คุ้มสุด)
ต่อยอด [weekly_sales_digest.py](../../deploy/agents/weekly_sales_digest.py) — ดึง insights JSON → **Ollama local ฟรี** สังเคราะห์เป็น "สัปดาห์นี้ดันอะไร / หยุดอะไร / เติมอะไร" → Telegram ทุกจันทร์
- ปัญหา: Ollama รันบน cloud cron ไม่ได้ → ต้องรันในเครื่อง local + task scheduler **หรือ** ย้าย insights refresh + brief ขึ้น cloud (Claude API เฉพาะงานนี้ ประหยัด)
- ตอนนี้ weekly_digest มีชั้น AI ผ่าน Claude อยู่แล้ว (ปิดเพราะไม่ใส่ ANTHROPIC_API_KEY) → เปิด key = ได้ทันที

### 🟡 Loop 2 — Auto Content Queue จาก winners
winner ประจำสัปดาห์ → Ollama ร่าง caption original (โทน "เปิดซอง เปิดดวง") → เขียนเข้า [content_queue.json](../../deploy/tasks/content_queue.json) → [marketing_reminder.py](../../deploy/scraper/marketing_reminder.py) หยิบไปเตือนโพสต์ · **คนอนุมัติ = human-in-loop**

## ข้อจำกัดที่ยึด (จาก [[project_actual_usage_scope]] + [[ai-content-intelligence-plan]])
- **งบ AI จำกัด** → ใช้ Ollama local ฟรีเป็นหลัก · cloud API เฉพาะงานสร้างสรรค์ยาก/งาน cron
- **Human-in-the-loop เสมอ** สำหรับคอนเทนต์ที่โพสต์จริง — AI ร่าง คนอนุมัติ
- **ไม่ auto-scrape คู่แข่ง** — วิเคราะห์จากแหล่งทางการ + ข้อมูลตัวเอง
- Insights ยัง **refresh แบบรันมือ** (Ollama local) → Loop 1/2 อัตโนมัติเต็มตัวต้องแก้ให้ refresh เองก่อน

## ลำดับทำ
1. ✅ **Loop 3 restock-guard** — build + workflow เสร็จ · รอตั้ง secrets + เปิด cron
2. **Loop 1 brief** — ตัดสินใจ Ollama-local vs Claude-cloud ก่อน
3. **Loop 2 content queue** — หลัง Loop 1 พิสูจน์ว่า Ollama สรุป insight ได้ดี

## 🔗 เกี่ยวข้อง
[[ai-content-intelligence-plan]] · [[project_marketing_assignment]] · [[auto-posting-plan]] · [[2026-06-29-auto-posting-level1-2]] · [[project_slot_refill_tracking_design]] · [[project_actual_usage_scope]]
