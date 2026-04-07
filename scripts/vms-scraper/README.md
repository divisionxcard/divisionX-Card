# VMS Scraper

สคริปต์สำหรับดึงข้อมูลยอดขายจาก VMS InboxCorp

## วิธีใช้งาน

```bash
cd scripts/vms-scraper
npm install
node scraper.js
```

## ความปลอดภัย

- ข้อมูล credentials ต้องเก็บใน `.env` ที่ root โปรเจคเท่านั้น
- ห้าม hardcode username/password ในโค้ดทุกกรณี
- ไฟล์ cookies.json และ session.json ถูก gitignore แล้ว

## Environment Variables ที่ใช้

```
VMS_URL=https://vms.inboxcorp.co.th/th/login
VMS_USERNAME=...
VMS_PASSWORD=...
```
