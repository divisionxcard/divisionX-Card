---
type: worklog
date: 2026-11-11
tags: [telegram, web, mini-app, security-headers]
commits: [13150fb]
status: ✅ ปุ่ม "เปิดหน้าเว็บ" ในบอท DVX Job ใช้ได้แล้ว · deploy ขึ้นแล้ว · ยังไม่ได้ลองกดจากแอป Telegram จริง (รอเจ้าของลอง)
---

# ปุ่ม "เปิดหน้าเว็บ" ในบอท Telegram — มินิแอปล็อกอินเว็บ (11 พ.ย.)

## เจ้าของขอ
ส่งภาพบอท AssetX (ปุ่มล่างซ้าย กดแล้วมินิแอปหน้าล็อกอินเด้งขึ้น) — "เลียนแบบปุ่ม … กดแล้วมีมินิแอปเด้งขึ้นมา เข้าเว็บไซต์ได้เลย
โดยกรอกรหัสผ่านตามปกติ ใช้ได้ทั้งมือถือและพีซี" · ย้ำว่าไม่ได้ต้องการหน้าไดอารี่ · เลือกใส่บอท **DVX Job (@dvx_marketing_bot)**

## ทำอะไร
- **ปุ่มเมนูบอท** — `scripts/set_telegram_web_button.py --bot job` (Bot API `setChatMenuButton` แบบ `web_app` · ค่าเริ่มของทุกแชตส่วนตัว)
  ลิงก์ https://division-x-card.vercel.app/ · ถอดคืนเป็นปุ่มคำสั่ง: `--remove` · ดูทุกบอท: `--show`
  · Telegram ตอบ ok ทันทีแต่อ่านกลับได้ค่าใหม่หลัง ~10–15 วิ — สคริปต์รอให้แล้ว
- **`components/TelegramMiniApp.jsx`** (ใส่ใน root layout) — โหลดสคริปต์ telegram-web-app.js **เฉพาะตอนเปิดจากใน Telegram**
  (ดูจาก `#tgWebApp…` ในลิงก์ / `TelegramWebviewProxy` / จำไว้ใน sessionStorage) → `ready()` · `expand()` (มือถือเปิดมาครึ่งจอ) ·
  `disableVerticalSwipes()` (ปัดลง = เลื่อนหน้า ไม่ใช่ปิดมินิแอป) · ลูกค้าเปิดเว็บปกติไม่โหลดอะไรเพิ่ม
- **header ความปลอดภัย** (`next.config.js`) — เดิม `X-Frame-Options: DENY` + `frame-ancestors 'none'` (ตรวจความปลอดภัย 16 ต.ค.)
  แอปมือถือ/Telegram Desktop/Unigram เปิดมินิแอปในหน้าต่างของมันเอง ไม่ติดค่านี้ แต่ **Telegram Web ฝังใน iframe** →
  เปลี่ยนเป็น `frame-ancestors https://web.telegram.org` (เว็บอื่นยังฝังไม่ได้) · ถอด XFO เพราะระบุโดเมนที่ยอมไม่ได้
- ล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านเว็บตามปกติ — ไม่ได้ผูกบัญชี Telegram · บัญชีทีมการตลาดล็อกอินแล้วไปหน้า /marketing ตามเดิม

## ตรวจแล้ว
- `npm run build` ผ่าน · Vercel deploy สำเร็จ · header จริงบน production: `frame-ancestors https://web.telegram.org` ไม่มี XFO (หน้า / และ /stock)
- พรีวิวหน้าเว็บแบบที่ Telegram ส่งมา (มีพารามิเตอร์มินิแอปต่อท้าย) จอคอม/มือถือ: หน้าล็อกอินขึ้นปกติ ไม่มี JS error
- `getChatMenuButton` ของ DVX Job = web_app "เปิดหน้าเว็บ" · บอทอีก 2 ตัวยังเป็นปุ่มคำสั่งเหมือนเดิม
- **ยังไม่ได้ลองกดจากแอป Telegram จริง** (มือถือ/คอม) — รอเจ้าของลอง

## ข้อจำกัด
- ปุ่มมินิแอปขึ้นเฉพาะแชตส่วนตัวกับบอท — ในกลุ่ม Telegram ไม่แสดง
- ปุ่มเว็บแทนที่ปุ่มรายการคำสั่ง (คำสั่ง /xxx ยังพิมพ์ได้)
- ใน webview ของ Telegram ปุ่มที่เปิดหน้าต่างใหม่ (`window.open` — Print/PDF) อาจไม่ทำงาน หรือเด้งออกไปเบราว์เซอร์ภายนอก
