---
type: worklog
date: 2026-07-01
tags: [telegram, webhook, automation, digest, on-demand]
commits: [4c29b7d]
---

# สั่ง Weekly Sales Digest จาก Telegram (คำสั่ง /digest)

## บริบท (why)
แอดมินอยากขอ digest ตอนไหนก็ได้ผ่าน Telegram (ไม่ต้องเข้า GitHub Actions กด Run workflow) · ต่อจาก [[2026-07-01-weekly-sales-digest-telegram]]

## สิ่งที่ทำ
- เพิ่ม route `deploy/app/api/telegram/mkt-webhook/route.js` — webhook ของ **บอทการตลาด** (แยกจากบอท admin ที่ /api/telegram/webhook)
- รับข้อความ `/digest` (หรือ "สรุป"/"/report") จาก **แชทที่อนุญาต** (`TELEGRAM_MKT_CHAT_ID`) → dispatch `weekly-sales-digest.yml` ผ่าน `GH_PAT` (pattern เดียวกับ /api/worldwide-stock-sync) → digest เด้งเข้าแชท
- ตอบ ack "🔄 กำลังสรุป..." ผ่าน MKT bot token · verify `x-telegram-bot-api-secret-token`
- build ผ่าน · push main → Vercel auto-deploy

## ค้าง: แอดมินตั้งค่าครั้งเดียว
1. **Vercel env** (Settings → Environment Variables): `TELEGRAM_MKT_BOT_TOKEN`, `TELEGRAM_MKT_CHAT_ID`, `TELEGRAM_MKT_WEBHOOK_SECRET` (สุ่มขึ้นมา) · `GH_PAT` มีอยู่แล้ว → **redeploy หลังเพิ่ม**
2. **setWebhook** บอท MKT (ครั้งเดียว): `curl "https://api.telegram.org/bot<MKT_TOKEN>/setWebhook" -d "url=https://division-x-card.vercel.app/api/telegram/mkt-webhook" -d "secret_token=<same secret>"`
3. ทดสอบ: พิมพ์ `/digest` ในแชทการตลาด → รอ ~1 นาที

## ข้อสังเกต
- GH_PAT อยู่ใน Vercel แล้ว (routes /api/stock-sync, /api/worldwide-stock-sync ใช้อยู่)
- บอท MKT เดิม send-only → ตั้ง webhook แล้วยัง send ได้ปกติ (reminder/digest ไม่กระทบ)

## 🔗 เกี่ยวข้อง
[[2026-07-01-weekly-sales-digest-telegram]] · [[2026-06-29-telegram-marketing-reminders]] · [[reference_trigger_github_workflow]] · [[reference_manual_stock_sync_buttons]]
