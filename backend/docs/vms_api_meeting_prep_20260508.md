# VMS API Meeting Prep — 8 พ.ค. 2026 บ่าย 3

> **บริบท:** VMS เรียกประชุมเอง · sales + technical จะมา · มาอัปเดต + อนุญาต API access อย่างเป็นทางการ (เราเคยขอไปก่อนหน้านี้)
>
> **บทบาทผม (เจ้าของ DivisionX):** ประมาณงาน backend ฝั่งเรา ให้รองรับ API ใหม่ของ VMS
>
> **สถานะปัจจุบัน:** ใช้งาน VMS อยู่จริง 4 ตู้ (chukes01-04) · admin เข้า portal ดูข้อมูล + กรอกสต็อกเข้าระบบหลังบ้านมือ
>
> **เป้าหมายประชุม:** รับ API access อย่างเป็นทางการ → ระบบหลังบ้านอ่านยอด/สต็อก auto sync

---

## ⚡ QUICK REFERENCE — ฉบับภาษาคน (เปิดบนมือถือในห้องประชุม)

> 📌 **API คืออะไร (ฉบับสั้น):** ช่องทางที่ระบบเราคุยกับระบบ VMS โดยตรง โดยไม่ต้องเปิดเว็บ login เอง
>
> สิ่งที่อยากได้ = ให้ VMS เปิด **"ช่องทาง API ทางการ"** ให้ระบบหลังบ้านเราต่อตรง อ่านยอดขาย/สต็อกอัตโนมัติ
>
> **Framing ที่จะใช้พูดในห้อง:** "ตอนนี้ admin ผมต้องเข้า portal ดูข้อมูลเอง + กรอกสต็อกในระบบหลังบ้านมือ ไม่ทันยอดที่ขายต่อวัน · เลยอยากต่อ API ให้ auto sync"

---

### ⚠️ ห้ามพูดในห้อง! (สำคัญมาก)

VMS **ไม่รู้ว่าเราเคยดึงข้อมูลผ่าน endpoint หลังบ้าน** ของ portal · ถ้าหลุดจะดูเหมือนเราใช้ระบบเขาผิดข้อตกลง

❌ **ห้ามพูด:**
- "ตอน 18-19 เม.ย. ที่พี่ rebuild ระบบผมพัง" *(แสดงว่าเรา scrape)*
- "ผมเช็คแล้วยอดขาย 5/1 ที่พี่ส่งกับที่ผมเก็บต่างกัน 9 transactions" *(แสดงว่าเราเก็บเอง)*
- "field `quantity_sold` / `transaction_id` / `grand_total`" *(ไม่ควรรู้ schema)*
- "endpoint `/report/sales/`" *(ไม่ควรรู้ path)*
- "ระบบ scraper" / "scrape" / "ดึง endpoint" *(ห้ามใช้คำพวกนี้)*
- "Box ของพี่ส่ง remain เป็นกล่อง 1 = 24 ซอง" *(ระดับ field detail · ห้าม)*

✅ **พูดได้:**
- "admin ผมเข้า portal ดูข้อมูลรายวันมาตลอด"
- "ระบบหลังบ้านผมตอนนี้ admin ต้องกรอกสต็อกมือ"
- "อยากให้ระบบ auto sync ลด manual work"
- "ตู้ขายเป็นกล่อง · อยากรู้ว่า API จะส่งจำนวนเป็นกล่องหรือซอง" *(ถามแบบ generic จากมุม operation จริง)*

---

### 🔴 7 เรื่องที่ต้องถาม VMS

#### 1️⃣ เราจะ login ระบบ VMS ยังไง?
- "พี่จะให้รหัส (API key/token) มาแบบไหน"
- "ใช้ password เดิม หรือสร้าง key ใหม่"
- "รหัสจะหมดอายุไหม · ต้อง renew กี่เดือนครั้ง"

➜ **ถามเพื่อ:** รู้ว่าเก็บ secret ที่ไหน + ต้องเปลี่ยนทุกเท่าไหร่

#### 2️⃣ เขาส่ง "คู่มือ" มาให้แบบไหน?
- "พี่มี document ส่งให้ดูแบบไหน · เป็น PDF / เว็บ / Postman / Swagger"

➜ **ถามเพื่อ:** ใช้เวลาทำความเข้าใจนานแค่ไหน

#### 3️⃣ ดึงข้อมูลอะไรได้บ้าง?
- "ดึงยอดขายได้ไหม · stock ในตู้ได้ไหม"
- "**refill log** (ตอนพนักงาน VMS เติมตู้) ดึงได้ไหม" ← *จะได้รู้แม่นยำว่าตู้ถูกเติมเมื่อไหร่ · กี่ pack*
- "ถ้าลูกค้า refund/void มีบันทึกไหม"
- "ดูสถานะตู้ (online/offline/jam) ได้ไหม"

➜ **ถามเพื่อ:** ดูว่าครบหรือมีอะไรเพิ่มที่ลดงานเรา

#### 4️⃣ ⚠️ ตัวเลขที่ส่งมาเป็น "กล่อง" หรือ "ซอง"?
*(เคยทำเราพังหนักตอน cutoff 6/5 — undercount × 24)*

- "ตอนตู้ขายเป็น Box · ระบบส่งจำนวนมาเป็น box หรือ pack ครับ"
- "ถ้าเป็น box · 1 box = 24 packs (OP/EB) หรือ 10 packs (PRB) · พี่ส่งแบบไหน"

➜ **ถามเพื่อ:** ระบบเราจะคำนวณยอดผิด ×24 ถ้าเข้าใจผิด

#### 5️⃣ ขายปุ๊บส่งให้เราเลยได้ไหม? หรือต้องไปถามเอง?
- "ตู้ขาย → ระบบ push ส่งมาให้เราเลยได้ไหม (= **webhook**)"
- "ถ้าต้องเราถามเอง (= **polling**) ถามได้บ่อยสุดทุกกี่นาที"

➜ **ถามเพื่อ:** ตัดสินว่าทำ real-time ได้ไหม

#### 6️⃣ การ login portal เดิมจะยังใช้ได้อยู่ไหม?
- "ตอนต่อ API แล้ว · admin ผมยังเข้า portal เดิมดูข้อมูลได้ปกติใช่ไหมครับ"
- "ขอเวลาช่วงแรกประมาณ 2-4 สัปดาห์ ใช้ทั้ง portal + API ขนานกัน · เทียบยอดให้ตรงก่อน · แล้วค่อยเปลี่ยนมาใช้ API เต็มตัว"

➜ **ถามเพื่อ:** ขอเวลา verify ก่อน · ไม่ให้ admin ทำงานซ้ำซ้อน

#### 7️⃣ ขอให้แจ้งล่วงหน้าถ้ามีเปลี่ยนแปลง
- "ถ้าอนาคตมีอัปเดต API หรือเปลี่ยน format · ขอแจ้งล่วงหน้ากี่สัปดาห์ · ผ่านช่องทางไหน (email/Line)"

➜ **ถามเพื่อ:** ป้องกันระบบหลังบ้านเรากระทบกะทันหัน

---

### 💰 เรื่องเงิน (ถามทีม sales)

- ค่า API เดือนละเท่าไหร่ · มี setup fee ไหม
- ใช้ตามจำนวน call หรือเหมา
- เพิ่มตู้อีก 5-10 ตู้อนาคต ราคาขึ้นไหม
- Contract ผูกขั้นต่ำกี่ปี

---

### 🟢 ที่ VMS อาจถาม — ตอบยังไง (พูดได้เลย)

| VMS ถาม | ตอบ |
|---|---|
| "เอา data ไปทำอะไร" | "เข้าระบบหลังบ้านที่ผมทำเอง · track ยอดขาย/stock real-time · เทียบกับสต็อกพนักงาน 4 คน · เอาไปทำงบบัญชี" |
| "มีกี่ตู้" | "ตอนนี้ 4 ตู้ครับ (chukes01-04) · กำลังจะเพิ่ม wwv01 (Worldwide) · อนาคตขยายต่อ" |
| "ขายวันละเท่าไหร่" | "200-800 transactions/วัน รวม 4 ตู้ · revenue 50-70K บาท/วัน" |
| "เก็บข้อมูลที่ไหน · ปลอดภัยไหม" | "Supabase (cloud DB) · ผมกับพนักงาน 4 คนเข้าได้เท่านั้น · มี audit log · HTTPS · ไม่ได้ขายต่อให้ใคร" |
| "อยากได้ data บ่อยแค่ไหน" | "ยอดขายทุก 5-10 นาที · สต็อกในตู้ทุก 30 นาที · ปรับตามที่พี่กำหนดได้" |
| "ใช้ภาษาอะไรเขียน · ใครทำ" | "Python กับ Next.js · ผมทำเองครับ" |
| "ทำเสร็จในกี่สัปดาห์" | "หลังได้ doc + test credentials · ประมาณ 2-4 สัปดาห์ครับ ขึ้นกับว่า schema เปลี่ยนเยอะแค่ไหน" |
| "ทำไมอยากต่อ API" | "1) ตอนนี้ admin ต้องเข้า portal มาดูยอดเองทุกวัน · 2) สต็อกในระบบหลังบ้านต้องกรอกมือ ไม่ทันยอดที่ขาย · 3) เตรียมเปลี่ยนเป็นนิติบุคคล ต้องการ audit trail อัตโนมัติ" |

---

### 🟡 ขอกลับมา 3 อย่าง (ก่อนจบประชุม)

บอกพี่ที่ VMS ว่า "ขอ 3 อย่างนี้นะครับ":

1. **เอกสารใช้งาน API** (ส่ง email/Line)
2. **ตัวอย่างข้อมูลจริง 1 ชุด** — ยอดขาย 1 วัน + สต็อก 1 snapshot ของ chukes01
3. **Test credentials** — รหัสที่ใช้ทดสอบได้ ไม่กระทบ prod

---

### 🎯 ฟัง 3 จุดนี้ — จะตัดสินได้ว่าใช้เวลานานแค่ไหน

| ที่ VMS ตอบ | งานเรา | เวลา |
|---|---|---|
| "ใช้ key ใหม่ · field เหมือนเดิม" | แค่เปลี่ยนรหัส | **1-2 วัน** |
| "ใช้ key ใหม่ · field เปลี่ยนชื่อ/format" | refactor นิดหน่อย | **3-5 วัน** |
| "ใช้ key ใหม่ + webhook + รองรับยี่ห้ออื่น" | refactor ใหญ่ + รองรับ Worldwide | **7-10 วัน** |

---

### 📖 Glossary — ศัพท์ที่อาจได้ยินจาก VMS

| ศัพท์ | ความหมายแบบง่าย |
|---|---|
| **API** | ช่องทางที่ระบบคุยกัน (ไม่ผ่าน user) |
| **Endpoint** | URL/ที่อยู่ของแต่ละบริการ (URL ดึงยอด · URL ดึงสต็อก) |
| **Auth / Token / API Key** | รหัสบอกว่า "เป็นเรา" — เหมือน password แต่สำหรับระบบ |
| **OAuth / JWT** | วิธี auth ขั้นสูง · ไม่ต้องเข้าใจ detail · แค่รู้ว่าจะได้ token มา |
| **Webhook** | VMS ส่งข้อมูลมาหาเราเองทันทีตอนมี event (ไม่ต้องเราไปถาม) |
| **Polling** | เราไปถามเป็นรอบๆ (ทุก 5/30 นาที) |
| **Rate Limit** | ข้อจำกัดว่าถามได้กี่ครั้ง/นาที |
| **Sandbox** | ระบบทดสอบ · แยกจาก prod |
| **Schema** | โครงสร้างข้อมูล · field ชื่ออะไร type อะไร |
| **Pagination** | ข้อมูลเยอะ → แบ่งหน้าส่งมา |
| **HMAC / Signature** | วิธีเช็คว่าข้อมูลส่งมาเป็นของจริง · ไม่ถูกแก้ระหว่างทาง |
| **IP Whitelist** | ระบุ IP ที่อนุญาต · IP อื่นเข้าไม่ได้ |
| **Deprecated** | เลิกใช้ · จะปิด |
| **Dual-run** | ใช้ทั้งระบบเก่า+ใหม่พร้อมกัน · ตรวจตัวเลขตรงกัน |
| **Cut over** | ตัดของเก่าทิ้ง · ใช้ของใหม่ 100% |
| **Breaking change** | การเปลี่ยนที่ทำให้ระบบที่ต่อไว้พัง |
| **SLA** | สัญญาว่าระบบ uptime กี่ % (เช่น 99.9%) |
| **Versioning (v1, v2)** | เวอร์ชัน API · v1 อาจถูกปิดเมื่อมี v2 |
| **Refactor** | รื้อ/เขียนใหม่ส่วนหนึ่งของระบบ (ไม่ใช่เขียนใหม่ทั้งหมด) |

---

### 💡 Tips ในห้องประชุม

- **อย่ารีบรับปาก timeline** — ฟัง spec ครบก่อน · แล้วบอกว่า "ขอกลับไปดู doc แล้วยืนยันใน 1-2 วัน"
- **ถ้าไม่เข้าใจคำที่เขาใช้** — ขอให้อธิบายเพิ่ม · "ขอโทษนะครับ คำว่า X หมายถึงอะไร"
- **บันทึกเสียง/จด** — เผื่อกลับมาทบทวน
- **ถ่ายรูปสไลด์** — ถ้ามี
- **อย่าปฏิเสธอะไรในห้อง** — ถ้าไม่แน่ใจ บอก "ขอกลับไปคิดก่อน"

---

> 📖 Detail เต็ม (สำหรับ technical reference): scroll ลงไป section A2 (บริบทเรา) · B (เทคนิค) · C (commercial) · D (ปัญหาเดิม) · E (ประมาณงาน)

---

## A. เปิดประชุม — เข้าใจสิ่งที่ VMS จะเสนอ

1. **API tier ที่จะให้** — read-only / read-write / full
2. **ครอบคลุมสิ่งที่เราต้องการไหม** (ยอด/สต็อก/refund/refill) · มี endpoint ใหม่อะไรเพิ่มที่เป็นประโยชน์
3. **Migration path** — ให้เวลา dual-run ก่อน cut over กี่สัปดาห์
4. **เริ่มใช้ได้เมื่อไหร่** — credentials พร้อมหลังประชุมเลย หรือต้องรอ

---

## A2. บริบทฝั่งเรา — ข้อจำกัดปัจจุบัน + วัตถุประสงค์ (พรีเซ็นต์ให้ VMS ฟังก่อนถามคำถาม)

> ⚠️ **ระวัง:** เนื้อหาด้านล่างใช้สำหรับเล่า "ในมุม operation ที่ admin ทำงานจริง" · **ห้ามเล่าจุดที่บ่งชี้ว่าเรา scrape data จาก portal** (เช่น schema field, endpoint name, ตัวเลข reconcile รายวัน)
>
> **เหตุผลที่ต้องเล่าให้เขาฟัง:** ถ้า VMS เข้าใจว่าเราจะเอา API ไปทำอะไร · scale + use case ของเรา · จะตอบคำถามและช่วยออกแบบให้เหมาะกับเรา

### A2.1 สภาพปัจจุบัน + ข้อจำกัด (ในมุม operation)

| ข้อจำกัด | ผลกระทบ |
|---|---|
| **Admin ต้องเข้า portal ดูยอดเอง** ทุกวัน | เสียเวลา · ทำได้ไม่บ่อย → ไม่เห็น real-time |
| **สต็อกในระบบหลังบ้านต้องกรอกมือ** | ผิดพลาดง่าย · ไม่ทันยอดที่ขายในตู้ |
| **ลูกค้าเคลม/refund ต้องทำมือ** ในระบบเรา | เสียเวลา · balance สต็อก/ยอดเงินผิด |
| **ไม่มี alert ตอนตู้ใกล้หมด** | ต้องรอ admin เปิด portal เช็คเอง |
| **เพิ่มตู้ในอนาคต** workload จะเพิ่ม linear | scale ไม่ได้ |

### A2.2 วัตถุประสงค์ — ด้าน "บัญชี / Finance"

| สิ่งที่ทำ | ทำไมต้องการ accuracy |
|---|---|
| **Revenue tracking** per machine · per SKU · per day | เทียบ VMS portal ทุกวัน · ต้องตรง ±0 บาท (ตอนนี้รายงาน DVX > VMS +10/+4/+8/+11 บาท · กำลังหาสาเหตุ) |
| **COGS calculation** (cost_price + avg_cost ต่อ SKU) | คำนวณกำไรสุทธิ · 21 SKU มี cost ต่างกัน |
| **Daily reconciliation** | ตรวจ DVX vs VMS portal · จับความผิดพลาดเร็ว |
| **Refund / void handling** | ตอนนี้ลูกค้าเคลม manual · ต้อง auto-refund + auto-restock จาก API |
| **Commission per admin** (ถ้ามี) | จ่ายค่าตอบแทนตามผลงาน |
| **เตรียมเปลี่ยน entity บุคคลธรรมดา → นิติบุคคล** | audit trail + statement สำคัญ · ภาษีต้องตรง |
| **Export งบ/ภาษี** | รายเดือน · รายไตรมาส · พร้อมส่งบัญชี |

### A2.3 วัตถุประสงค์ — ด้าน "สต็อกสินค้า / Inventory"

**Flow ของเราที่ต้อง track ครบ:**

```
[กรรมการนับ + รับเข้า]
        ↓ stock_in (lot_number)
   [Main stock] (กรรมการดูแล)
        ↓ stock_transfer
   [User stock × 4 admins]  (admin แต่ละคน)
        ↓ stock_out (admin เบิกเติมตู้)
   [Machine stock × 4 ตู้] (chukes01-04 · per slot · box vs pack)
        ↓ sales (จาก VMS API)
        ↓ claims (ลูกค้า refund)
```

| สิ่งที่ track | Pain point ปัจจุบัน |
|---|---|
| **Stock balance ต้องตรงทุก SKU** | reconcile ทุกวัน · ตัวเลขในระบบหลังบ้านต้อง = ของจริง |
| **Lot number ทุก stock_in** | ใช้คำนวณ avg_cost (weighted average) · cutoff_20260506 lot |
| **Box conversion ใน machine_stock** | slot ที่ขายเป็น "Box" · `remain` เก็บกล่อง · ต้อง × packs_per_box ต้องตรง |
| **Refill event ของพนักงาน VMS** | อยากได้ event ตรงตอนเติม · ไม่ต้องเดาจากตัวเลขสต็อก |
| **Real-time machine_stock** | ปัจจุบัน sync 30 นาที/ครั้ง · อยาก realtime เพื่อแจ้งเติม |
| **Per-slot product mapping** | สับสน: VMS slot กับ DivisionX SKU mapping มี hardcode · เปลี่ยน slot ต้อง redeploy |
| **Cutoff snapshot** | ทำมา 2 รอบ (นับสต็อกครบทุก source) · API ใหม่ควรลดงานนี้ |

### A2.4 เป้าหมาย — ทำไมต้องการ API (ขายไอเดียให้ VMS เห็นคุณค่า)

- **ลด manual work** — admin ไม่ต้องกรอกสต็อก/ยอดเอง
- **Real-time** — เห็นยอด/สต็อกทันที · ลด error · เพิ่มเติมตู้ทันเวลา
- **Scale ได้** — เพิ่มตู้ได้โดย workload ไม่เพิ่ม linear (จะเพิ่ม wwv01 + อนาคต)
- **Compliance** — เตรียม audit trail สำหรับเปลี่ยนเป็นนิติบุคคล
- **Partnership ระยะยาว** — DivisionX อยู่กับ VMS · อยากต่อยอด business ร่วมกัน

### A2.5 Volume + Scale ตอนนี้

| Metric | ค่า (ปัจจุบัน · 7-8 พ.ค.) |
|---|---:|
| ตู้ใช้งาน (VMS) | 4 ตู้ (chukes01-04) |
| Transactions/วัน/ตู้ | ~50-200 (รวม 200-800/วัน) |
| Revenue/วัน รวม | ~50,000-70,000 บาท |
| SKU active | 21 (OP 1-15, EB 1-4, PRB 1-2) |
| Admin ใช้งาน | 4 คน (mzadiz1989, power23n, tueza5432, aofwara66) |
| Owner + technical | 1+1 |

---

## B. คำถาม Technical (สำหรับทีม tech VMS)

> ⚠️ **Internal note:** section นี้เป็น checklist สำหรับ Claude/dev อ้างอิงหลังประชุม · **อย่าอ่านในห้องตรงๆ** เพราะมีศัพท์เทคนิคที่บ่งชี้ว่าเรารู้ schema ภายในของ VMS · ใช้ Quick Reference ด้านบนพูดคุยจริงในห้อง

### B1. Endpoint coverage
| # | ถาม |
|---|---|
| 1 | API ใหม่ครอบคลุม endpoint อะไรบ้าง — sales / stock / refill / machine health / alert / config |
| 2 | API ใหม่ครอบคลุม use case เราทั้งหมดไหม (sales/stock/refill/refund) |
| 3 | มี endpoint **GET machines** ดู list ตู้ + status รวมไหม |
| 4 | มี endpoint **GET refill log** (ตอน admin VMS เติมตู้) ไหม — ปัจจุบันเรา infer จาก `remain` เพิ่ม |

### B2. Authentication
| # | ถาม |
|---|---|
| 1 | API key / OAuth / JWT / username-password? |
| 2 | ผูกกับ user หรือ machine หรือ tenant |
| 3 | Token expiration + refresh flow |
| 4 | **IP whitelist** ต้องลงไหม (GitHub Actions IP ไม่ fix · ต้องมี proxy ไหม) |
| 5 | Credentials เก็บที่ไหน · rotate ได้ไหม |

### B3. Data format
| # | ถาม |
|---|---|
| 1 | มี **Swagger / OpenAPI / Postman collection** ไหม |
| 2 | Field ที่ครอบคลุม: transaction id, machine, product, quantity, price, sold timestamp, status (paid/refund/void) — เพียงพอไหม |
| 3 | **Box vs Pack** — ใน API ใหม่ slot ที่ขายเป็น Box ส่งมา raw หรือ convert ให้แล้ว? *(ปัจจุบันเรา convert เอง ×24 OP/EB · ×10 PRB · เคยเป็น bug ใหญ่)* |
| 4 | **Refund / void / cancel** มี status field แยกไหม · ยอด refund รวมหรือไม่รวม |
| 5 | **Pagination + sort + filter** by date/machine ใช้ยังไง |
| 6 | **Timezone** ที่ส่งมา (UTC / Bangkok) |

### B4. Rate limit + SLA
| # | ถาม |
|---|---|
| 1 | Rate limit (req/min · req/day) |
| 2 | SLA uptime ที่ commit |
| 3 | **Maintenance window** แจ้งล่วงหน้ากี่ชั่วโมง · ผ่านช่องไหน |
| 4 | Polling แนะนำทุกกี่นาที (sales / stock) |

### B5. Webhook (push)
| # | ถาม |
|---|---|
| 1 | Support webhook ไหม · event อะไรบ้าง (sale / refill / out-of-stock / offline / error) |
| 2 | **Signature verification** (HMAC-SHA256?) · secret rotate ได้ไหม |
| 3 | Retry policy ถ้า endpoint เรา down |
| 4 | Replay missed events ได้ไหม |

### B6. Test environment
| # | ถาม |
|---|---|
| 1 | Sandbox / staging แยก prod ไหม |
| 2 | ทดสอบกับ **chukes01-04 จริง** ได้ไหมตอน dev (read-only) |
| 3 | Mock data ให้ลองได้ไหม |

### B7. Migration & breaking change
| # | ถาม |
|---|---|
| 1 | Versioning policy ของ API · v1 จะถูกเลิกเมื่อไหร่ |
| 2 | Versioning policy (`/v1/`, `/v2/`) |
| 3 | Breaking change แจ้งล่วงหน้ากี่สัปดาห์ |
| 4 | Changelog / release note publish ที่ไหน |

---

## C. คำถาม Commercial (สำหรับทีม sales VMS)

| # | ถาม |
|---|---|
| 1 | **ค่าใช้จ่าย** API access — ฟรี / รายเดือน / per-call / setup fee |
| 2 | Volume tier ถ้ามี (เกิน X calls/เดือน คิดเพิ่มไหม) |
| 3 | Contract ผูกระยะเวลาขั้นต่ำไหม |
| 4 | SLA penalty (ถ้า downtime เกิน) |
| 5 | **เพิ่มตู้ในอนาคต** — รวม contract เดิม หรือต้องคุยใหม่ |
| 6 | Support package — มีทีม tech ตอบ Q&A ไหม · response time |

---

## D. ความต้องการเฉพาะที่อยากให้ API ครอบคลุม

> ⚠️ **ห้าม mention** specific incident หรือตัวเลขจาก reconcile ที่เรารู้จาก scrape · พูดในมุม "operational need" เท่านั้น

| # | ที่ต้องการ | พูดยังไง |
|---|---|---|
| 1 | **Refund / void event** | "ถ้าลูกค้า refund หรือพนักงานยกเลิก transaction · API ส่ง event บอกได้ไหม" |
| 2 | **Refill log** ตอนพนักงาน VMS เติมตู้ | "ตอนทีมพี่เติมตู้ · ระบบมี log บอกไหมว่าเติมเมื่อไหร่ · เติม SKU อะไรกี่ pack" |
| 3 | **หน่วยที่ส่งมา (กล่อง vs ซอง)** | "ตู้เราขายมีทั้งแบบกล่องและแบบซอง · API จะส่งจำนวนเป็นหน่วยอะไร · มี field บอกไหม" |
| 4 | **Machine health / online status** | "ดูได้ไหมว่าตู้ online/offline/มี jam · จะแจ้ง admin ได้" |
| 5 | **ดึงข้อมูลย้อนหลัง** | "ดึง sales/stock ย้อนหลังได้กี่วัน" |
| 6 | **แจ้งล่วงหน้าถ้ามีเปลี่ยน** | "ถ้ามีอัปเดต API/format ในอนาคต · ขอแจ้งล่วงหน้าผ่านช่องทางไหน" |

---

## E. Estimate ฝั่งเรา (ขอบเขตงาน + เวลา)

> Estimate แบ่งตาม **scenario** เพราะยังไม่รู้ว่า API ใหม่ของ VMS อยู่ระดับไหน · ตอบในห้องประชุมตามที่ได้ฟัง spec

### Scenario 1: API ตรงไปตรงมา (auth + field พื้นฐาน)
- ตั้งค่า authentication ในระบบเรา
- เขียน sync ดึง sales + stock ใส่ DB
- ทดสอบกับ chukes01-04 · verify ยอดตรงกับ portal
- **~1-2 วัน work**

### Scenario 2: schema/format ต้องปรับ (refactor)
- เขียน sync ตาม spec ใหม่
- Map field + Box/Pack logic
- ทดสอบ + verify ใช้คู่ขนานกับ portal 2-3 วัน
- **~3-5 วัน work**

### Scenario 3: Multi-machine architecture (เตรียมรองรับ Worldwide ด้วย)
- ใช้โอกาสนี้ refactor ตาม plan `multi_brand_support.md` (BaseConnector pattern)
- เตรียม structure รองรับยี่ห้ออื่น (wwv01)
- Sync router ตาม `machines.brand`
- **~7-10 วัน work**

### Scenario 4: Webhook + Real-time (ถ้า VMS support push)
- เพิ่ม webhook endpoint รับ event
- Verify signature + idempotency
- Cron fallback
- **~5-7 วัน work** (เพิ่มจาก scenario 1-2)

---

## F. Risks & Considerations (เผื่อมีคนถาม)

| Risk | ผลกระทบ | Mitigation |
|---|---|---|
| ช่วง onboard API · ระบบเก่ายังต้องใช้คู่ขนาน | admin ทำงานซ้ำ | ขอ dual-run portal+API 2-4 สัปดาห์ · verify ยอดให้ตรงก่อน cut over |
| Box/Pack mapping ผิด → balance ผิด | สต็อกในระบบหลังบ้านผิด | ทดสอบกับยอดจริง 1-2 สัปดาห์ ก่อนใช้ production |
| API rate limit ต่ำกว่าที่ต้องการ | sync ช้า · ไม่ real-time | ตกลง limit ในประชุม · ปรับ schedule ตาม |
| API spec เปลี่ยนภายหลัง | ระบบหลังบ้านพัง | ขอ notification ล่วงหน้า · ใส่ใน contract |

---

## G. Action items ก่อนจบประชุม

- [ ] **API doc** ตัวเต็ม (Swagger/Postman/PDF) — link หรือ email
- [ ] **Sample response** sales 1 day + stock 1 snapshot ของ chukes01
- [ ] **Test credentials** (sandbox ถ้ามี · prod read-only ถ้าไม่มี)
- [ ] **Contact tech** ฝั่ง VMS หลังประชุม (ชื่อ + Line/email)
- [ ] **Quote ราคา + contract draft** ส่งมาหลังประชุม
- [ ] **Timeline target go-live** + ระยะ dual-run (portal + API) ก่อน cut over
- [ ] **Webhook secret** (ถ้า support) · IP whitelist (ถ้าต้อง)

---

## H. สรุปจุดสำคัญ 5 ข้อในประชุม

1. **Endpoint coverage + schema** — ตรงกับเดิมไหม → ตัดสิน scenario 1 vs 2
2. **Onboarding path** — ระยะ dual-run + timeline cut over → กระทบ priority
3. **Box/Pack handling** — VMS handle ให้แล้วหรือยัง → ลด bug surface
4. **Webhook support** — มี/ไม่มี → ตัดสิน scenario 3 vs 4
5. **Cost + timeline** — ตอบ stakeholder ฝั่งเราได้

---

## Reference (สำหรับเปิดดูในห้องประชุม)

- VMS rebuild incident: `~/.claude/projects/.../memory/incident_vms_rebuild.md`
- Multi-brand plan: `backend/docs/multi_brand_support.md`
- Cutoff bug history: `backend/database/cutoff_20260506/README_V3.md`
- VMS scraper ปัจจุบัน: `deploy/scraper/vms_sales_api.py`, `deploy/scraper/vms_stock_sync.py`
- Schema: `deploy/supabase/schema.sql`

---

**บันทึกหลังประชุม:** _(เติมที่นี่หลังกลับ — Scenario ที่เลือก + spec ที่ได้ + คำตอบของคำถาม A-D)_
