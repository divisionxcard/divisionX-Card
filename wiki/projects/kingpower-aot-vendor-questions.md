---
type: project
project: kingpower-aot
status: action-needed
created: 2026-06-11
tags: [kingpower, aot, vendor, worldwide, vms, rcagent, build-vs-buy]
---

# ❓ ชุดคำถามส่ง WorldWide / VMS — ตู้รองรับ AOT RR ได้ไหม

> ใช้ตัดสินจุด build เอง vs จ้าง POS supplier ใน [[kingpower-aot-plan]]
> สเปคอ้างอิง: [[kingpower-aot-reference]]

## ⭐ ทำไมต้องถาม vendor (ไม่ใช่ทำเองทั้งหมด)
ส่วน **Realtime (RCAgent)** ต้องรัน**บนตัว controller ของตู้** และทำงาน**ตอนจังหวะขาย** (ขอ RC Code
ก่อน/ตอนจ่ายของ) — จังหวะนี้มีแต่ **เจ้าของ firmware (WorldWide/VMS)** ที่เข้าถึงได้ เราเขียนจากภายนอกเองไม่ได้
→ ถ้า vendor ทำให้/เปิด hook ไม่ได้ = ต้องเปลี่ยนไปใช้ POS supplier ที่ผ่าน AOT แล้ว

**คำถามชี้ขาด = หมวด A + B** (ที่เหลือคือรายละเอียด)

---

## 0. คำถามตั้งต้น
1. ตู้ที่จะลงสนามบินจะใช้แพลตฟอร์มไหน — **WorldWide หรือ VMS**? (รุ่น/controller อะไร)
2. vendor เคยทำ integration กับ **สรรพากร / AOT RR / King Power** มาก่อนไหม? มีตู้ตัวอื่นที่สนามบินอยู่แล้วไหม?

## A. Controller & การติดตั้งโปรแกรมเพิ่ม  ⭐ชี้ขาด
3. controller ของตู้รัน OS อะไร (**Android / Linux / Windows / embedded อื่น**)?
4. ติดตั้ง **library/โปรแกรมของ AOT เพิ่มบนเครื่องได้ไหม** — RCAgent (มีให้เป็น .NET / Java / Android) + RCMonitor?
5. เครื่องรัน **process background ตลอดเวลา** (RCMonitor heartbeat ส่งสถานะ Login/Logout) ได้ไหม?
6. มี network ที่ตู้ที่เชื่อม server ภายนอก (AOT RC Server) แบบ realtime ได้ไหม?

## B. Hook ตอนขาย (Realtime RC Code)  ⭐ชี้ขาด
7. ระบบมี **hook/callback ที่จังหวะ "ชำระเงินสำเร็จ ก่อนจ่ายสินค้า"** ให้เราเรียก RCAgent ขอ RC Code
   แล้วผูก RC Code เข้ากับธุรกรรมนั้นได้ไหม? (ต้อง **realtime ต่อบิล**)
8. ถ้าฝัง RCAgent บน firmware ไม่ได้ → vendor เปิด **API แบบ synchronous ที่ point-of-sale**
   (เรียกออกไปขอ RC code แล้วรอผลก่อนจ่ายของ) ให้ได้ไหม?
9. รองรับ **Offline mode** ตามที่ AOT กำหนดไหม — server ล่ม → เก็บบิล local + ออก RC Code เอง → ส่งเมื่อ online?

## C. ใบเสร็จ / แสดง RC Code
10. ตู้ **พิมพ์ใบเสร็จได้ไหม**? ถ้าไม่มีเครื่องพิมพ์ — แสดง/ส่ง **e-receipt** (จอ/QR/อีเมล/SMS) ที่มี
    **RC Code 16 หลัก** และเป็น **ใบกำกับภาษีอย่างย่อ (ม.86/6)** ได้ไหม?
11. ใส่ข้อความ/เลขที่กำหนด (RC Code, POS_NO, เลขที่ใบเสร็จ) ลงบนใบเสร็จ/e-receipt ได้ไหม?
    *(ข้อนี้ต้องเช็คกับ KPS/สรรพากรด้วยว่ายอมรับ e-receipt สำหรับ vending)*

## D. ข้อมูล / Text File รายวัน
12. เปิด **ข้อมูลธุรกรรมระดับบิล** ให้เรา (ผ่าน API/export) ครบพอจะสร้าง **Text File 5 datasets** เองได้ไหม?
    ต้องมี: header + line items + payment + **VAT แยก (exc/vat/inc)** + ส่วนลด + timestamp +
    machine id + payment type + **RC_CODE** + ใบ Void (ยอดติดลบ)
13. หรือ vendor จะ **generate Text File ตามสเปค AOT V9 ให้เลย** (รวมอัปโหลด 9:00 น.)?
14. data model ปัจจุบันมีฟิลด์ที่ AOT บังคับครบไหม — โดยเฉพาะ **VAT breakdown, ส่วนลดท้ายบิล,
    POS_NO (RD ID), RC_CODE, currency/exchange rate, payment type (รองรับ QR=7)**?

## E. รหัสเครื่อง / ภาษี
15. ผูก **POS_NO (RD ID ที่สรรพากรออกต่อเครื่อง)** กับตู้ และส่งไปทุกธุรกรรมได้ไหม?
16. ตู้สนามบินรับชำระแบบไหน (เงินสด/บัตร/**QR**)? map เป็น PAY_TYPE ของ AOT ได้ไหม?

## F. การทดสอบ & ซัพพอร์ต
17. vendor ยินดีร่วม **SIT** (cloud จำลอง, MS Teams กับ IT ทอท.) และ **UAT** (onsite หน้าตู้จริง) ไหม?
18. มีทีม integrate ช่วยเราตลอดขั้นตอนทดสอบไหม? ใช้เวลาโดยประมาณเท่าไหร่?

## G. เชิงพาณิชย์ & ดูแลต่อ
19. ค่าใช้จ่าย integration (ครั้งเดียว) + ค่ารายเดือน?
20. ใครรับผิดชอบ **maintenance เมื่อ AOT เปลี่ยนสเปค** (เช่น V9 → V10)?
21. timeline พัฒนา+ทดสอบจนพร้อมต่อ Production?

---

## 🧭 วิธีตีความคำตอบ
| คำตอบ vendor | แปลว่า |
|--------------|--------|
| ติดตั้ง RCAgent บน controller ได้ (A4) **หรือ** เปิด realtime hook/API ตอนขาย (B7/B8) | ✅ **เดินหน้าทำเองได้** (vendor + เรา integrate) |
| ทำ realtime ไม่ได้ทั้งคู่ แต่เปิด data ให้ครบ (D12) | ⚠️ ได้แค่ส่วน Text File — **ส่วน realtime ยังขาด** ต้องหาทางอื่น |
| realtime ไม่ได้ + data ไม่ครบ | ❌ **ต้องจ้าง POS supplier ที่ผ่าน AOT** (Idea POS / เจ้าพระยาคอมพิวเทค / DTOTAL / CMPOS) |

> 💡 ก่อนถาม vendor ควรเคลียร์กับ **KPS** ก่อนว่า: ตู้ vending ที่ไม่มีคนเฝ้า ต้องออก **RC Code realtime ทุกบิล** จริงไหม
> และยอมรับ **e-receipt** (ไม่พิมพ์กระดาษ) ไหม — เพราะถ้า KPS ผ่อนปรนให้ตู้ vending ขอบเขตงานจะลดลงมาก

## 🔗 เกี่ยวข้อง
[[kingpower-aot-plan]] · [[kingpower-aot-reference]] · [[wwv05]]
