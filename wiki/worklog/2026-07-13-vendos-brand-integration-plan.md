---
type: worklog
date: 2026-07-13
tags: [integration, vendos, new-brand, api, scraper, discovery]
commits: [a633477, 866a478]
status: เฟส A เสร็จ · เฟส B รอตู้มีข้อมูล
---

# เชื่อมตู้แบรนด์ที่ 3 "Vendos" — วางแผน + ค้น API

## บริบท (why)
กำลังจะสั่งซื้อตู้ยี่ห้อใหม่ **Vendos** (ต่อจาก VMS + WorldWide) ต้องดึงสต็อก+ยอดขายมารวมในระบบเดียว
โจทย์: ระบบเรา multi-brand อยู่แล้ว (brand column + machine_id) — เพิ่มแบรนด์ใหม่ต้องรู้ว่าพอร์ทัลเปิดข้อมูลทางไหน

## สิ่งที่ค้นเจอ (สำคัญ)
พอร์ทัล https://vendos.one/control_center/login **ไม่ใช่ scrape HTML** อย่างที่เดาตอนแรก —
อ่าน static JS (`/static/js/api.js`, `ajax.js`, `screen/login.js`) เจอว่ามี **REST API เต็มรูปแบบ JSON + Bearer token**:

- `POST /auth/user/token` body `{"username","password"}` → `{"access_token"}` (JWT)
- ทุก call แนบ `Authorization: Bearer <token>` · auto-refresh เมื่อ 401
- สต็อก: `GET /cc_api/shop/stock` (ต่อ shop id) · ยอดขาย: `GET /cc_api/shop/sales` · `/shop/order`
- ตู้/สาขา: `GET /cc_api/shop` · `GET /cc_api/vdm` · โมเดล **1 ตู้ = 1 shop (มี id)**

→ ใช้แพตเทิร์น **VMS API** (token + GET JSON) ได้เลย เสถียรกว่า scrape มาก · ค้นได้จาก JS สาธารณะโดยไม่ต้อง login

## สิ่งที่ทำ
- [[vendos-integration-plan]] — เอกสารแผน + API map ครบ (commit a633477)
- `deploy/scraper/vendos_probe.py` — สคริปต์ probe: login + GET ทุก endpoint แล้ว print JSON ตัวอย่าง
  ลองต่อ shop id ทั้งแบบ path (`/stock/{id}`) และ query (`?id=`/`?shop_id=`) เพราะยังไม่รู้ว่า `Aj.get(url,cb,id)` ต่อแบบไหน (commit 866a478)

## ทำไมยังไม่เขียน scraper จริง
เว็บเพิ่งเปิด **ยังไม่มีตู้/ข้อมูลเลย** → ไม่มี response JSON ให้ดูโครง field (slot/remain/capacity/ยอดขาย)
เขียนตอนนี้ = เดา field → ต้องแก้ใหม่ · รอตู้ลงทะเบียน+มีข้อมูลก่อน แล้วรัน probe → เขียนจาก JSON จริงรอบเดียวจบ

## ค้าง (เฟส B — เมื่อตู้มีข้อมูล)
1. รัน `vendos_probe.py` (ใส่ VENDOS_USERNAME/PASSWORD env) → ส่ง output มา
2. เขียน `vendos_stock_sync.py` + `vendos_sales_api.py` ตาม field จริง
3. SKU mapping (ชื่อสินค้า Vendos → sku_id) · workflow cron · ปุ่มเว็บ · INSERT machines brand='vendos'
4. Secrets: `VENDOS_USERNAME`, `VENDOS_PASSWORD` (เตรียมใส่ GitHub Secrets ไว้ก่อนได้)

**หลักการ:** อย่า commit cron workflow ก่อน scraper เสร็จ+ทดสอบ (กัน FAIL alert หลอก)

## 🔗 เกี่ยวข้อง
[[project_vendos_integration]] · [[vendos-integration-plan]] · [[project_add_worldwide_machine]] · [[project_sku_mapping_two_scraper_maps]] · [[reference_manual_stock_sync_buttons]]
