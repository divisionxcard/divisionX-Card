---
name: dvx-machine
description: ใช้เมื่อเพิ่มตู้ใหม่, ย้าย/สลับตู้, เปลี่ยนสถานะตู้, แก้ข้อมูลสาขา/ชั้น/แลนด์มาร์ก, หรือตู้ไหน sync ไม่เข้า
---

# เพิ่มและแก้ไขตู้ขาย

ตอนนี้มี 13 ตู้ · 3 แบรนด์: `vms` 4 ตู้ (chukes01-04) · `worldwide` 8 ตู้ (wwv01-08) · `payif` 1 ตู้ (pf01)

## ⚠️ กฎข้อแรก — เพิ่มตู้ใหม่ทำไม่เหมือนกันในแต่ละแบรนด์

| แบรนด์ | ต้องแก้โค้ดไหม | ทำอะไร |
|---|---|---|
| **worldwide** | ❌ ไม่ต้อง | INSERT แถวใน `machines` อย่างเดียว scraper อ่านเอง |
| **payif** | ❌ ไม่ต้อง | เหมือน worldwide |
| **vms** | ✅ **ต้องแก้** | ต้องเพิ่มใน `KIOSKS` dict ที่ `deploy/scraper/vms_stock_sync.py` ด้วย |

WW/payif เป็น data-driven — scraper query `machines` ด้วย `.eq("brand", ...)` แล้ววนเอง
VMS ยังใช้ dict hardcode อยู่ **ถ้าลืมแก้ KIOSKS ตู้ใหม่จะไม่ถูก sync แบบไม่มี error**

## รูปร่าง `machines`

```
machine_id  ← ใช้เป็น key ทุกที่ ตั้งแล้วห้ามเปลี่ยน (sales/machine_stock อ้างถึง)
name        "ตู้ที่ 12 (pf01) · ไอคอนสยาม (Payif)"
location    "ไอคอนสยาม"
status      active / inactive
brand       vms | worldwide | payif
config      jsonb — ดูข้างล่าง
```
❗ **production ไม่มีคอลัมน์ `updated_at`** ใส่ใน UPDATE แล้วจะ error

### `config` แต่ละแบรนด์
```jsonc
// vms — มีแค่ branch (record_id อยู่ใน KIOSKS dict ในโค้ด)
{ "branch": {...} }

// worldwide / payif
{
  "branch": {...},
  "machine_id_vendor": "208",              // WW = serial VCM...  payif = shop_id
  "portal_url": "https://vendos.one",
  "integration_status": "active",
  "version": "..."                          // WW เท่านั้น
}
```

### `config.branch` — ใช้สร้างหน้า `/branches` (data-driven)
```jsonc
{
  "display_name": "ไอคอนสยาม",
  "maps": "ICONSIAM",                       // คำที่ใช้ค้นใน Google Maps
  "floor": "ชั้น 6",
  "landmark": "หน้าร้าน Karun Thai Tea",
  "order": 12,                              // ลำดับที่แสดง
  "public": true                            // false = ไม่โชว์บนหน้าเว็บสาธารณะ
}
```

## ขั้นตอนเพิ่มตู้ใหม่

1. ขอจากเจ้าของ: **แบรนด์ · machine_id ที่จะใช้ · id ฝั่ง vendor · สาขา/ชั้น/แลนด์มาร์ก**
2. INSERT แถวใน `machines` ผ่าน PostgREST (ดู `dvx-db` — ไม่ต้องทำ migration)
3. **ถ้าเป็น vms** → เพิ่มใน `KIOSKS` ที่ `vms_stock_sync.py` พร้อม `record_id` และ `tabs`
4. สั่ง sync แล้วเช็กว่ามีแถวเข้า `machine_stock` (ดู `dvx-sync`)
5. ตรวจว่าไม่มีช่องไหน `sku_id = null` — ถ้ามีแปลว่ามีสินค้าที่ map ไม่ติด (ดู `dvx-sku`)

## กับดักที่เคยเจอจริง

**`record_id` ของ VMS เปลี่ยนได้** — ตอน VMS rebuild ระบบ (เม.ย. 2026) เลข 40-43 กลายเป็น 4-7
ถ้าตู้ VMS จู่ ๆ sync ไม่เข้าทั้งกลุ่ม ให้สงสัยตัวนี้ก่อน

**ตู้เปลี่ยนเครื่อง = `machine_id_vendor` เปลี่ยน แต่ `machine_id` ต้องคงเดิม**
(wwv04 เวสต์เกตเคยสลับเครื่องใหม่) ถ้าเปลี่ยน `machine_id` ประวัติยอดขายจะขาดออกเป็นสองท่อน

**ตู้ที่ยังไม่เปิดขาย** ให้ใส่ `status` ไม่ใช่ `active` และ `config.branch.public = false`
ไม่ใช่ลบทิ้ง — จะได้เก็บ mapping ไว้

## ตรวจสถานะตู้ทั้งหมด
```
GET /rest/v1/machines?select=machine_id,name,brand,status,config&order=id
```
ดูตู้ไหน sync ล่าสุดเมื่อไหร่ → `machine_stock?select=machine_id,synced_at&order=synced_at.desc`

## เกี่ยวข้อง
`dvx-db` · `dvx-sku` · `dvx-sync`
