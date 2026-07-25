---
type: marketing
scope: automation-architecture
date: 2026-07-25
tags: [marketing, automation, ai-insights, restock-guard, telegram, content-queue, ollama]
status: 🟢 ครบ 3 loops build เสร็จ — Loop 3 restock-guard (live) · Loop 1 brief · Loop 2 content suggester
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

### 🟢 Loop 1 — Weekly Marketing Brief (build เสร็จ · Ollama local)
สังเคราะห์ AI Insights → บรีฟการตลาด actionable → Telegram · **ใช้ Ollama local (ฟรี) ตามที่เลือก**
- [weekly_marketing_brief.py](../../deploy/agents/weekly_marketing_brief.py): อ่าน frontmatter `wiki/skus/*.md` → จัด winners/losers/low-margin (mirror /api/wiki-insights) + ยอดต่อตู้ WoW จาก DB → Ollama เขียนบรีฟ (📣 ดัน / 🔧 แก้ / 💸 งบ / 📦 เติม) → Telegram HTML
- [run_weekly_brief.ps1](../../deploy/agents/run_weekly_brief.ps1): รีเฟรช insight (sku_profile_agent) → ส่งบรีฟ · ตั้ง **Windows Task Scheduler จันทร์ 08:30** (คำสั่งในไฟล์)
- ทดสอบ dry-run กับข้อมูลจริง: บรีฟถูกต้อง (winners FB09/OP11 · losers OP10 · เตือนเติม wwv04/wwv08) · แปลง markdown→Telegram HTML แล้ว
- **ต้องทำ:** เพิ่ม `TELEGRAM_MKT_BOT_TOKEN` + `TELEGRAM_MKT_CHAT_ID` ใน `deploy/.env.local` (agent โหลด .env.local อัตโนมัติ) · Ollama รันอยู่ + qwen2.5:7b
- ⚠️ Ollama รันบน cloud cron ไม่ได้ → รันในเครื่อง local เท่านั้น (นี่คือ trade-off ของทางฟรี · ถ้าอยากอัตโนมัติเต็มบน cloud ต้องสลับไป Claude API)

### 🟢 Loop 2 — Content Suggester จาก winners (build เสร็จ)
winner ประจำสัปดาห์ → Ollama ร่าง caption original (โทน "เปิดซอง เปิดดวง") → **staging แยก** รออนุมัติ
- [content_suggester.py](../../deploy/agents/content_suggester.py): อ่าน winners (trend สูง) → Ollama ร่าง N แคปชั่นต่างแพลตฟอร์ม (FB เพจ/Reels/กลุ่ม) → เขียน `deploy/tasks/content_suggestions.json` (`status: pending_review` · gitignored) + ส่ง Telegram พร้อม `<code>` ก๊อปได้
- **ไม่แตะ [content_queue.json](../../deploy/tasks/content_queue.json) (curated)** — คนรีวิว/อนุมัติแล้วก๊อป object เข้าเอง = human-in-loop จริง · approved แล้ว [marketing_reminder.py](../../deploy/scraper/marketing_reminder.py) หยิบไปเตือนโพสต์
- ทดสอบ dry-run: ร่างจาก FB09/OP11/FB06 · JSON parse ผ่าน · โครงสร้างตรง content_queue format · qwen2.5:7b พอใช้ (มีคำเพี้ยน · `--model qwen2.5:14b` ดีขึ้น) — review-gated จึงรับได้
- รวมใน [run_weekly_brief.ps1](../../deploy/agents/run_weekly_brief.ps1) step 3 (ต่อจาก brief)

## ข้อจำกัดที่ยึด (จาก [[project_actual_usage_scope]] + [[ai-content-intelligence-plan]])
- **งบ AI จำกัด** → ใช้ Ollama local ฟรีเป็นหลัก · cloud API เฉพาะงานสร้างสรรค์ยาก/งาน cron
- **Human-in-the-loop เสมอ** สำหรับคอนเทนต์ที่โพสต์จริง — AI ร่าง คนอนุมัติ
- **ไม่ auto-scrape คู่แข่ง** — วิเคราะห์จากแหล่งทางการ + ข้อมูลตัวเอง
- Insights ยัง **refresh แบบรันมือ** (Ollama local) → Loop 1/2 อัตโนมัติเต็มตัวต้องแก้ให้ refresh เองก่อน

## ลำดับทำ
1. ✅ **Loop 3 restock-guard** — build + workflow + ส่ง Telegram จริงพิสูจน์แล้ว · cron active
2. ✅ **Loop 1 brief** — build เสร็จ (Ollama local) · รอเพิ่ม TELEGRAM_MKT_* ใน .env.local + ตั้ง Task Scheduler
3. ✅ **Loop 2 content suggester** — build เสร็จ (Ollama local · staging + review) · รันร่วม runner step 3

## 🔗 เกี่ยวข้อง
[[ai-content-intelligence-plan]] · [[project_marketing_assignment]] · [[auto-posting-plan]] · [[2026-06-29-auto-posting-level1-2]] · [[project_slot_refill_tracking_design]] · [[project_actual_usage_scope]]
