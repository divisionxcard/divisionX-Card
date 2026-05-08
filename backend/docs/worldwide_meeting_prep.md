# Meeting prep — WorldWide Vending

> **สถานะ:** Template สำหรับใช้ตอนนัดประชุมจริงกับทีม WorldWide ในอนาคต · ยังไม่มีกำหนดประชุม
> **เริ่ม draft:** 2026-05-08 (ตอนนั้นเข้าใจผิดว่าจะประชุมกับ Worldwide บ่าย 3 · จริงๆ คือ VMS — ดู `vms_api_meeting_prep_20260508.md`)
>
> **บริบท:** ตู้ wwv01 ที่เซ็นทรัล รามอินทรา ปัจจุบัน manage ผ่าน **Photocal** (vendor portal) · เป้าหมายคือ integrate เข้า DivisionX Card Dashboard ให้ auto sync เหมือน VMS InboxCorp 4 ตู้ที่ใช้อยู่
>
> **สถานะ DB:** ตู้ wwv01 INSERT แล้ว (migration `022_add_machine_brand_config.sql`) · `brand='worldwide'` · `integration_status='pending_api_doc'`

---

## A. ต้องถาม (Must ask — ขาดไม่ได้)

### A1. API access & auth
| # | คำถาม | ทำไมต้องรู้ |
|---|---|---|
| 1 | มี **REST API** ให้ third-party ดึง data ไหม (ไม่ใช่แค่ portal UI) | ถ้าไม่มี = ต้อง scrape Photocal หรือ manual entry |
| 2 | **Authentication** แบบไหน — API key / OAuth / username-password / JWT? | ออกแบบ `auth.py` |
| 3 | **IP whitelist** ต้องลงทะเบียนไหม | GitHub Actions IP ไม่ fix · อาจต้อง proxy |
| 4 | มี **sandbox/test environment** ไหม | จะได้ทดสอบไม่กระทบ prod |
| 5 | **API doc** format อะไร (PDF / Swagger / OpenAPI / Postman collection) | เร็ว/ช้าในการ implement |
| 6 | **Rate limit** กี่ req/min ต่อ account | ตั้ง cron schedule |
| 7 | **HTTPS only** หรือมี HTTP fallback | security |

### A2. Sales data
| # | คำถาม |
|---|---|
| 1 | Endpoint ดึงยอดขาย + method (GET/POST) |
| 2 | **Field สำคัญ**: transaction_id, machine_id, product_id, product_name, quantity, unit_price, paid_amount, payment_method, sold_at, status (paid/refund/void) |
| 3 | **Filter ตามช่วงเวลา + ตู้** ได้ไหม (เราต้อง sync incremental) |
| 4 | **กล่อง vs ซอง** — slot ขายเป็น box แล้วลูกค้าได้กี่ pack? *(VMS เคยมี bug ตรงนี้ — slot 1 box = 24 packs)* |
| 5 | **Refund / void / cancel** มี status แยกไหม · ดึงยอดที่ filter ออกได้ไหม |
| 6 | **Promotion / discount** สะท้อนใน paid_amount ยังไง |
| 7 | **Timezone** ที่ field `sold_at` ส่งมา (UTC / Bangkok / vendor TZ?) |
| 8 | ดึงย้อนหลังได้กี่วัน (90 วัน? 1 ปี?) |
| 9 | Pagination — limit ต่อ request? |

### A3. Stock / slot data
| # | คำถาม |
|---|---|
| 1 | Endpoint ดึง slot status + remaining |
| 2 | **Field**: slot_number, product_id, product_name, remain, max_capacity, is_occupied, status, last_refilled_at |
| 3 | Update **real-time** หรือ snapshot ทุก X นาที |
| 4 | Detect **out of stock / jam / error** ได้ไหม |
| 5 | Slot config (1 slot = pack หรือ box) เก็บที่ไหน — ในตู้ / ใน vendor DB / config ผ่าน API ได้ |
| 6 | เห็น **lot number / expiry** ไหม |

### A4. Webhook (ถ้ามี)
| # | คำถาม |
|---|---|
| 1 | Support webhook (push) ไหม · หรือ pull only |
| 2 | Event อะไรบ้าง (sale / restock / refill / error / offline) |
| 3 | **Signature verification** แบบไหน (HMAC-SHA256?) · secret ส่งให้เรายังไง |
| 4 | Retry policy ถ้า endpoint ของเรา down |

### A5. Product / SKU mapping
| # | คำถาม |
|---|---|
| 1 | Vendor มี **master product list** ดึงผ่าน API ได้ไหม |
| 2 | **Product ID** ฝั่ง vendor เป็น code แบบไหน · เราเปลี่ยนเองได้ไหม (อยากให้ตรง sku_id เรา: OP 01–15, EB 01–04, PRB 01–02) |
| 3 | ผูก product กับ slot ผ่าน UI Photocal เท่านั้น หรือ API ก็ได้ |

### A6. Pricing & Operations
| # | คำถาม |
|---|---|
| 1 | **Price** config ฝั่งไหน — แก้ผ่าน API ได้ไหม หรือต้อง Photocal |
| 2 | **Refill log** — ตอน admin เติมตู้ ระบบ log อัตโนมัติไหม · ดึงผ่าน API ได้ไหม |
| 3 | Maintenance mode / firmware update — แจ้งล่วงหน้าไหม |
| 4 | **Multi-machine roadmap** — ถ้าเราเพิ่มตู้อีก 5-10 ตู้ ใช้ account เดิมได้ไหม |

---

## B. ควรถาม (work around ได้ ถ้าจำเป็น)

1. SLA / uptime ของ API
2. Audit log ของ Photocal (ใครเข้าระบบ-แก้อะไร) — แชร์ให้เราดูได้ไหม
3. Data export CSV/Excel สำรอง (กรณี API ล่ม)
4. Firmware update เปลี่ยน schema field — แจ้งล่วงหน้ากี่วัน
5. Contact channel ทาง tech (Line / email / Slack) ถ้าเจอปัญหา
6. ค่าใช้จ่าย API access — ฟรี / รายเดือน / per call

---

## C. ที่ WorldWide อาจถามเรา — เตรียมคำตอบ

| เขาอาจถาม | ตอบ |
|---|---|
| **เอา data ไปทำอะไร** | sync เข้า DivisionX Dashboard · track ยอดขาย + stock real-time · เทียบกับ user holdings 4 admins |
| **กี่ตู้** | wwv01 ตู้เดียวก่อน · อนาคตอาจขยาย |
| **Volume คาดการณ์** | ~100-300 transactions/วัน/ตู้ (อ้างอิง chukes ปัจจุบัน) |
| **เก็บข้อมูลที่ไหน** | Supabase (Postgres cloud · region: Singapore/AP) |
| **ใครเข้าถึง** | Owner + admin 4 คน · มี RLS policy + role-based access |
| **Security** | HTTPS only · token-based auth · audit log · ไม่ขาย/แชร์ data ออก |
| **Polling frequency ที่ต้องการ** | sales ทุก ~5-10 นาที · stock ทุก ~30 นาที (ปรับตาม rate limit ได้) |
| **เวลาที่ต้องการ go-live** | ภายใน 2-4 สัปดาห์หลังได้ doc + test credentials |
| **มีคนเทคทำ integration** | มี · ใช้ Python (scraper) + Next.js (dashboard) · GitHub Actions cron |

---

## D. ขอกลับมาให้ครบ (Action items)

- [ ] **API doc** ฉบับเต็ม (หรือ link Swagger / Postman collection)
- [ ] **Sample response** จริง 1 ชุด · sales 1 วัน + stock 1 snapshot ของ wwv01
- [ ] **Test credentials** (sandbox ถ้ามี · prod read-only ถ้าไม่มี sandbox)
- [ ] **Contact tech** ฝั่ง WorldWide (ชื่อ + ช่องทาง) สำหรับถามตอนทำจริง
- [ ] ตกลง **timeline + cost** integration
- [ ] ถ้า **ไม่มี API** → สอบถามทางเลือก: webhook · CSV daily export · scrape Photocal (ขออนุญาต)

---

## E. Plan B (ถ้า WorldWide ตอบว่า "ไม่มี API")

| ทางเลือก | งานเรา |
|---|---|
| Webhook only | สร้าง endpoint รับ · ออกแบบ schema receive |
| Daily CSV email/FTP | สร้าง parser + cron import |
| Manual entry ผ่าน Dashboard | enable ตู้ใน UI · admin กรอก stock_in/stock_out เอง (เหมือน main stock) |
| Scrape Photocal | ต้องขออนุญาต legal · risk เปลี่ยน UI |

---

## สรุปจุดสำคัญที่สุด 3 ข้อ

1. **Auth + endpoint sales/stock** — ขาดไม่ได้
2. **Box vs pack convention** — กับ VMS เคยมี bug · ตู้ใหม่ต้องเคลียร์ตั้งแต่ต้น
3. **Test credentials + sandbox** — ขอให้ได้ก่อนเริ่ม implement

---

## Reference

- ตู้ wwv01 ใน DB: `backend/database/migrations/022_add_machine_brand_config.sql`
- Pre-implementation plan: `backend/docs/multi_brand_support.md`
- VMS connector ปัจจุบัน (เป็น template): `deploy/scraper/vms_sales_api.py`, `deploy/scraper/vms_stock_sync.py`

---

**บันทึกหลังประชุม:** _(เติมที่นี่หลังกลับจากประชุม · เอาคำตอบที่ได้มาเทียบกับคำถามด้านบน)_
