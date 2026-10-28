---
type: worklog
date: 2026-10-28
tags: [social-watch, opencli, instagram, reddit]
commits: [0114c01]
status: ✅ Reddit ใช้ได้ (รันซ้ำวันนี้ผ่าน) · ⏸️ IG พัก 3 วัน (บัญชี Research ถูกจำกัด)
---

# เลน IG/Reddit เปิดวันแรก พังทั้งคู่ (28 ต.ค.)

ตามนัดว่าจะเช็กรอบแรกหลังเลน IG/Reddit เปิดตาม gates · ต่อจาก [[2026-10-22-social-watch-low-yield-angle-truth]]

รอบ 07:00: Facebook ปกติ (70 โพสต์ · แรงผิดปกติ 8 · ไอเดีย 8) แต่ **IG 0/4 · Reddit 0/5**

## Reddit: `--profile` ผิดตำแหน่ง
- `opencli reddit subreddit ... --profile research` → `unknown option '--profile'`
- `--profile` เป็นตัวเลือกระดับบนสุดของ OpenCLI ต้องอยู่**หน้าคำสั่ง** (`opencli --profile research reddit subreddit ...`)
  ส่วนคำสั่ง `browser ...` ที่เลน FB/IG ใช้มี `--profile` ของตัวเอง ต่อท้ายได้ → ตอนเขียนเลย Reddit ก็ใส่ต่อท้ายตาม
- แก้แล้วรันเฉพาะ Reddit ซ้ำวันนี้: 5 ห้อง · 43 โพสต์ · แรงผิดปกติ 5 · เข้าคิวไอเดีย 3

## IG: บัญชี Research ถูกจำกัด
- ตรวจในหน้า (อ่านอย่างเดียว): **ล็อกอินอยู่** แต่ `/api/v1/feed/user/<u>/username/` **เด้งกลับหน้าแรก** (ได้ HTML 200) ·
  `/api/v1/users/web_profile_info/` ตอบ **429** → IG จำกัดบัญชีนี้ ไม่ใช่โค้ดผิด (คำสั่ง `opencli instagram user` ก็ใช้ endpoint เดียวกัน)
- เดิมสคริปต์เรียก `r.json()` ตรง ๆ → พังเป็น SyntaxError (WatchError ธรรมดา) → **ยิงต่อครบทุกเพจ** แทนที่จะหยุด
- แก้: redirect / 429 / ตอบไม่ใช่ JSON = `blocked` → หยุดเลนทันที + พัก 3 วัน (กลไกเดิมของ FB) · ตั้ง `state.blocked.instagram` = วันนี้ไว้เลย
- **ไม่หา endpoint อื่นมาเลี่ยง** การจำกัด — ยิ่งดันยิ่งเสี่ยงบัญชีโดนแบน

## ค้าง
- เจ้าของเปิด Chrome profile Research → instagram.com ดูว่ามีแจ้งเตือนจำกัด/ขอยืนยันตัวตนไหม (ดูเฉย ๆ)
- 31 ต.ค. เลน IG ลองใหม่เอง — ถ้าโดนอีก ถามเจ้าของว่าจะลดเพจ/รอบ หรือปิดเลน IG
