---
type: integration-plan
brand: vendos
date: 2026-07-13
status: เฟส A (วางแผน) — รอ credentials + ตัวอย่างหน้าพอร์ทัลเพื่อเริ่มเฟส B
tags: [integration, vendos, new-brand, scraper, multi-brand]
---

# แผนเชื่อมตู้แบรนด์ Vendos เข้าระบบ DivisionX

แบรนด์ที่ 3 (ต่อจาก VMS + WorldWide) · ตู้กำลังจะสั่งซื้อ

## พอร์ทัล
- Login: **https://vendos.one/control_center/login**
- ประเภท: **REST API แบบ JSON + Bearer token** (หน้า HTML เป็นแค่ shell · data ไหลผ่าน `/static/js/api.js`)
- → **ใช้แพตเทิร์น VMS API** (requests + token) ไม่ต้อง scrape HTML / ไม่ต้อง Playwright — เสถียรสุด
- ต้องการดึง: **สต็อกหน้าตู้ + ยอดขาย**

## 🔌 Vendos API (ค้นจาก static JS — ยืนยันแล้ว)
Base URL: `https://vendos.one` (same origin)

```
LOGIN
  POST /auth/user/token
  Content-Type: application/json
  Body: {"username": "<user>", "password": "<pass>"}
  → { "access_token": "<JWT>" }
  (refresh: POST /auth/refresh · reload: POST /auth/user/reload-token)

ทุก request ต่อไปแนบ header:  Authorization: Bearer <access_token>

STOCK / สต็อก
  GET /cc_api/shop/stock            (ระบุ id = shop id · Aj.get(url, cb, id))
  GET /cc_api/shop/supply
  GET /cc_api/product               (รายการสินค้า)
  GET /cc_api/summary/shop-stock-alert

SALES / ยอดขาย
  GET /cc_api/shop/sales            (ระบุ id)  ← get_shop_order_sum
  GET /cc_api/shop/order            (รายการออเดอร์)
  GET /cc_api/stats/daily-trans-by-pay-type

MACHINES / ตู้-สาขา
  GET /cc_api/shop                  (list สาขา/ร้าน = 1 ตู้ = 1 shop?)
  GET /cc_api/vdm                   (vending device · undeployed: /cc_api/vdm/undeployed)
  GET /cc_api/shop/health
```

**โมเดล:** ตู้ = "shop" (มี id) · สต็อก/ยอดขาย query ต่อ shop id · ตัวเครื่อง = "vdm"
**Auth:** login → access_token (JWT) → แนบ `Authorization: Bearer` ทุก call · auto-refresh เมื่อ 401

## ⏳ ยังไม่รู้ (ต้องดู response จริง 1 ครั้ง)
1. `Aj.get(url, cb, id)` ต่อ `id` แบบ path (`/cc_api/shop/stock/<id>`) หรือ query (`?id=`/`?shop_id=`) — ดูจาก Network
2. **โครง JSON ที่ตอบกลับ** ของ shop/stock (field: slot, product, remain, capacity?) + shop/sales (field: วันเวลา, ราคา, จำนวน?)
3. shop/sales รับช่วงวันไหม (date range) สำหรับ backfill

## สถาปัตยกรรม multi-brand (มีอยู่แล้ว)
- ตาราง `machines` แยกแบรนด์ด้วยคอลัมน์ `brand` (`vms`, `worldwide`, → เพิ่ม `vendos`)
- ตู้แต่ละตัวเก็บรหัสพอร์ทัลใน `machines.config` (JSON) เช่น WW ใช้ `config.machine_id_vendor`
- ข้อมูลลงตารางกลางร่วมกัน: `machine_stock` (สต็อก), `sales` (ยอดขาย) — key ด้วย `machine_id`
- **frontend รวมยอดข้ามแบรนด์อัตโนมัติ** ผ่าน machine_id — ไม่ต้องแก้
- SKU mapping = hardcoded map ต่อ scraper (ดู [[project_sku_mapping_two_scraper_maps]])

## ไฟล์ที่ต้องสร้าง
โครงงาน (workflow/route/table machines) ลอกจาก WW · แต่ตัว scraper ใช้ **API pattern** (login token + GET JSON) คล้าย `vms_sales_api.py`/`vms_stock_sync.py` มากกว่า scrape
| ไฟล์ | หมายเหตุ |
|------|---------|
| `deploy/scraper/vendos_stock_sync.py` | login `/auth/user/token` → GET `/cc_api/shop/stock` ต่อ shop → upsert machine_stock |
| `deploy/scraper/vendos_sales_api.py` | GET `/cc_api/shop/sales` (+`/shop/order`) ต่อ shop → insert sales · รองรับ backfill |
| `.github/workflows/vendos-stock-sync.yml` | ลอก `worldwide-stock-sync.yml` · secrets VENDOS_USERNAME/PASSWORD |
| `.github/workflows/vendos-sync.yml` | ลอก `worldwide-sync.yml` · ยอดขาย + backfill inputs |
| `deploy/app/api/vendos-stock-sync/route.js` | ปุ่ม "ดึงข้อมูล Vendos" บนเว็บ |

## Secrets ที่ต้องเพิ่ม
- ✅ **GitHub Secrets: `VENDOS_USERNAME`, `VENDOS_PASSWORD` — เพิ่มแล้ว (2026-07-13)**
- Vercel env (สำหรับปุ่ม manual): เหมือน WW (ใช้ GH_PAT ที่มีอยู่ trigger workflow)

## machines.config schema (ร่าง สำหรับ Vendos)
```json
{
  "portal_url": "https://vendos.one",
  "machine_id_vendor": "<shop id ของตู้บน Vendos>",
  "vdm_id": "<vdm id ถ้าต้องใช้>",
  "integration_status": "pending_response_sample"
}
```
(brand เก็บในคอลัมน์ `brand='vendos'` · `machine_id_vendor` = shop id ที่ใช้ query stock/sales)

## 📋 ต้องเก็บจากพอร์ทัล (เริ่มเฟส B) — หลัง login ได้
1. **login form**: View Source หน้า login → ชื่อ field (user/pass) + action URL + method
2. **หน้าสต็อกหน้าตู้**: URL + View Source (HTML) + screenshot → ดูโครงตาราง slot/สินค้า/คงเหลือ
3. **หน้ายอดขาย**: URL + View Source + screenshot → ดูโครงรายการขาย/วันเวลา/ราคา
4. **รหัสตู้** ที่พอร์ทัลใช้เรียกแต่ละตู้ (เทียบ `VCM350...` ของ WW)
5. **ชื่อสินค้าบนพอร์ทัล** — เทียบกับ sku_id เรา (One Piece TCG เดิม หรือมีของใหม่)
6. **credentials** → ใส่ GitHub Secrets เท่านั้น (ห้ามพิมพ์ในแชท)

## หลักการสำคัญ
- **ไม่ commit workflow cron ที่เรียก scraper ยังไม่เสร็จ** — จะรันตาม schedule แล้ว FAIL ส่ง Telegram alert หลอก
- สร้าง scraper + ทดสอบ `--dry-run` ให้ผ่านก่อน แล้วค่อยเปิด cron workflow (build+test ในรอบเดียว)

## 🔗 เกี่ยวข้อง
[[project_add_worldwide_machine]] · [[project_ww_machines_status]] · [[project_sku_mapping_two_scraper_maps]] · [[reference_manual_stock_sync_buttons]] · [[reference_supabase_rest_access]] · [[reference_trigger_github_workflow]]
