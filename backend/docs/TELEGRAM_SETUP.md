# Telegram Alerts — Setup Guide

DvX Phase 1+2 · One-way alerts + Interactive buttons

## ที่ต้องเตรียมจาก Telegram

- **Bot token** (สร้างผ่าน @BotFather) — ตัวอย่าง format: `1234567890:AAH...xxx`
- **Owner group chat_id** (ขึ้นต้น `-100`) — กลุ่มรับ alert ระบบ
- **Admin group chat_id** (ขึ้นต้น `-100`) — กลุ่มรับ alert ปฏิบัติการ (slot/ship/stock)
- **Webhook secret** (สุ่มเอง · เช่น `openssl rand -hex 32`) — กัน fake webhook

> ⚠️ บอทต้องถูก **promote เป็น admin** ในทั้ง 2 กลุ่ม เพื่อให้ส่งข้อความและรับ callback ได้

## 1. GitHub Secrets (สำหรับ scraper cron)

ไปที่ Settings → Secrets and variables → Actions · Add:

| Name | Value |
|------|-------|
| `TELEGRAM_BOT_TOKEN` | bot token |
| `TELEGRAM_ADMIN_CHAT_ID` | `-100...` |
| `TELEGRAM_OWNER_CHAT_ID` | `-100...` |

Workflows ที่ใช้:
- `vms-stock-sync.yml` — alert slot changes
- `worldwide-sync.yml` — alert ship fails
- `vms-sync.yml` / `worldwide-stock-sync.yml` — alert ถ้า cron fail
- `stock-low-alert.yml` — daily 09:00 stock summary

## 2. Vercel env vars (สำหรับ Next.js webhook)

ไปที่ Vercel Dashboard → Project → Settings → Environment Variables · Add:

| Name | Value | Scope |
|------|-------|-------|
| `TELEGRAM_BOT_TOKEN` | bot token | Production |
| `TELEGRAM_ADMIN_CHAT_ID` | `-100...` | Production |
| `TELEGRAM_OWNER_CHAT_ID` | `-100...` | Production |
| `TELEGRAM_WEBHOOK_SECRET` | สุ่ม | Production |
| `SUPABASE_SERVICE_KEY` | sb_secret_... | Production |

(`NEXT_PUBLIC_SUPABASE_URL` ควรมีอยู่แล้ว)

Redeploy หลัง add (Vercel rebuild auto · หรือ trigger ใหม่)

## 3. Set Telegram Webhook (1 ครั้งหลัง deploy)

หลัง Vercel deploy แล้ว · เปิด URL นี้ใน browser (แทนค่าใน `<...>`):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://division-x-card.vercel.app/api/telegram/webhook&secret_token=<WEBHOOK_SECRET>
```

ควรได้ response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

ตรวจ webhook status:
```
https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

## 4. Smoke test

ทดสอบส่งข้อความได้ไหม:

```bash
# ใน scraper folder (มี telegram_alert.py)
TELEGRAM_BOT_TOKEN=<token> TELEGRAM_OWNER_CHAT_ID=<id> python telegram_alert.py test
```

## Events และปลายทาง

| Event | Group | Trigger | Interactive |
|-------|:-----:|---------|:-----------:|
| Slot product change | Admin | vms_stock_sync detect | ✅ ยืนยัน/Bug |
| Ship Fail (WW) | Admin | worldwide_sales_api detect | ✅ Resolve |
| Cron scraper FAIL | Owner | GH Actions `if: failure()` | — |
| Stock ต่ำ daily | Admin | stock-low-alert.yml @ 09:00 | — |

## Troubleshooting

- **บอทไม่ส่งใน group** → ตรวจว่า promote เป็น admin · privacy mode ตั้ง `Allow Group` ผ่าน @BotFather
- **getUpdates ว่าง** → ส่งข้อความในกลุ่มก่อน · แล้วเรียก getUpdates ใหม่
- **Webhook ไม่ทำงาน** → ตรวจ getWebhookInfo · ถ้ามี `last_error_message` แก้ตาม error
- **Inline button กดแล้วไม่มีอะไรเกิด** → check Vercel function logs ที่ `/api/telegram/webhook`
- **404 จาก setWebhook** → ตรวจว่า Vercel deploy รอบล่าสุดมี route นี้แล้ว
