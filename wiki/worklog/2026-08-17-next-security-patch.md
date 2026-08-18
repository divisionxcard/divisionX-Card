---
type: worklog
date: 2026-08-17
tags: [deps, security, nextjs, vercel, maintenance]
commits: [21b24f4]
status: ✅ deploy ขึ้น production แล้ว — เหลือช่องโหว่ที่ต้องขึ้น Next 16 ถึงจะปิดได้
---

# อัป Next 14.2.3 → 14.2.35 ปิดช่องโหว่เท่าที่ปิดได้โดยไม่ข้ามเวอร์ชันใหญ่

เจ้าของเห็น `npm warn deprecated next@14.2.3: This version has a security vulnerability`
ระหว่างติดตั้งอย่างอื่น

## ตรวจก่อนแก้ — ไม่ได้มีแค่ตัวเดียว

```
audit ก่อน:  4 ช่องโหว่ (critical 1 · high 3)
next / nanoid / ws — ws มาจาก @supabase/realtime-js ไม่ใช่ของ Next
```

## ปิดได้ในรอบนี้ (แพตช์ล้วน ไม่แตะ API)

| แพ็กเกจ | จาก | เป็น |
|---|---|---|
| next | 14.2.3 | 14.2.35 |
| nanoid | 3.3.11 | 3.3.18 |
| postcss | 8.5.9 | 8.5.26 |
| ws | 8.20.0 | 8.21.3 |

ความรุนแรงของ next ลดจาก **critical → high**

## ที่ยังปิดไม่ได้ และเหตุผลที่ยังไม่ทำตอนนี้

เหลือ high 2 รายการ (`next` กับ `postcss` ที่ Next ผูกไว้ข้างใน)
npm บอกว่าต้องขึ้น **next@16.3.1 ซึ่งเป็น breaking change**

ประเมินความเสี่ยงตามบริบทเรา — ไม่ใช่ตามป้ายความรุนแรงลอย ๆ:
- ที่เหลือส่วนใหญ่เป็น DoS ของ image optimizer และเคส **self-hosted** · เราอยู่บน Vercel
- ทุกหน้าล็อกอินก่อนใช้ ไม่ได้เปิดให้คนนอก
- การขึ้น Next 16 ต้องย้าย API หลายจุด ควรวางแผนเป็นงานแยก ไม่พ่วงกับงานความปลอดภัยเร่งด่วน

## ทดสอบก่อน push (ไม่ใช่แค่ให้ build ผ่าน)

```
npm run build            ผ่าน · ทุก route คอมไพล์ครบรวม metrics-collect / publish-due ที่เพิ่งเพิ่ม
npm start + ยิงจริง      / · /marketing · /branches · /products · /how-to · /design-system → 200 ทุกหน้า
API ที่ต้องล็อกอิน        ยังตอบ 401 ถูกต้อง
หลัง deploy จริง          production 5 หน้าได้ 200 · metrics-collect ยังเก็บได้ 25 โพสต์
```

## กับดักที่เสียเวลาไป 1 รอบ

`npm audit fix --omit=dev` **ถอน devDependencies ออกจาก node_modules ด้วย**
build จึงล้มด้วย `Cannot find module 'tailwindcss'` ทั้งที่โค้ดกับ lockfile ไม่ได้ผิดอะไร

แก้ด้วย `npm install` ปกติซ้ำหนึ่งรอบ — **ถ้าดูแค่ข้อความ error จะไล่ผิดทางไปที่ config ของ Tailwind**
บทเรียน: flag `--omit=dev` มีผลกับ **การติดตั้ง** ไม่ใช่แค่ขอบเขตการตรวจ

## เกี่ยวข้อง
[[2026-08-17-post-metrics-and-token-recovery]]
