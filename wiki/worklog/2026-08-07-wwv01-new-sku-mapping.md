---
type: worklog
date: 2026-08-07
tags: [sku, scraper, mapping, wwv01, bugfix, data]
commits: [4fe288a]
status: ✅ map ได้ครบ · sku_id เข้าแล้วทั้ง 2 ช่อง — ค้างราคา MLBB + รูปทั้งคู่
---

# สินค้าใหม่ตู้รามอินทรา — และบั๊กเงียบที่เจอระหว่างทาง

## บริบท (why)
ตู้ **wwv01 (เซ็นทรัล รามอินทรา)** เปลี่ยนสินค้า 2 ช่อง
- ช่อง 020 → `MLBB Hand of Destiny 02` (ของใหม่หมด ไม่เคยมีในระบบ)
- ช่อง 027 → `Naruto Jin - 2` (ชุดต่อจาก Jin - 1 ที่มีอยู่แล้ว)

ทั้งคู่ map ไม่ติด เลยค้าง `sku_id = null` ใน `machine_stock`

**ทำไมต้องรีบ:** `sku_id = null` ไม่ได้พังแบบมีเสียงเตือน มันแค่หายไปจาก
รายงานเติมสินค้าและยอดขายแยก SKU เงียบ ๆ ถ้าปล่อยไว้จนเริ่มขาย
ยอดจะขาดโดยไม่มีใครรู้ — ตรวจแล้วโชคดีที่ยังไม่เคยขายทั้ง 2 ตัว
(ดูรายละเอียดใน [[project_actual_usage_scope]] — สิ่งที่ใช้จริงคือสต็อกหน้าตู้ + ยอดขาย
ซึ่งพึ่ง `sku_id` ทั้งคู่)

## 🐛 บั๊กเงียบที่เจอระหว่างทาง (ของแถมที่สำคัญกว่างานหลัก)

`payif_stock_sync.py` ใช้โครงคนละแบบกับไฟล์อื่น — เป็น **substring map หลวม ๆ**
และบรรทัดแรกสุดของลิสต์คือ

```python
("jin", "NRT Jin - 1"),
```

`"jin" in "naruto jin - 2"` → **True** → Jin-2 จะกลายเป็น **Jin-1**

ตอนนี้ยังไม่กระทบเพราะ Jin-2 อยู่แค่ตู้ WW แต่ถ้าวันไหนย้ายไปลง pf01
ยอดขาย Jin-2 จะถูกโยนไปรวมกับ Jin-1 ทั้งก้อน **โดยไม่มี null ให้จับได้เลย** —
อันตรายกว่าเคสเดิมมาก เพราะเคสเดิมอย่างน้อยยังเห็นว่าช่องว่าง

แก้โดยให้ regex ที่มีเลขชุดทำงาน **ก่อน** substring map เสมอ
(`payif_sales_sync.py` import ฟังก์ชันนี้ไปใช้ เลยได้แก้ตามไปด้วยฟรี)

## สิ่งที่ทำ

**โค้ด — 6 ไฟล์** (ตาม [[project_sku_mapping_two_scraper_maps]] · map กระจายอยู่หลายที่ ต้องแก้ทุกที่)
`shared.py` · `vms_stock_sync` · `vms_sales_api` · `worldwide_stock_sync` ·
`worldwide_sales_api` · `payif_stock_sync`

```
"naruto jin - 2" / "naruto jin2"  →  NRT Jin - 2     (เลขเดี่ยว ไม่ zero-pad ตาม sku เดิม)
"mlbb hand of destiny 02"         →  MLBB HOD - 02   (zero-pad 2 หลัก)
```

**ข้อมูล** — ทำผ่าน PostgREST ตรง ไม่ต้อง migration (ดู [[reference_supabase_rest_access]])
- เพิ่ม 2 SKU ในตาราง `skus` + ตั้ง `canonical_sku` (หน้าจัดช่องใช้โชว์ชื่อ)
- เติม `sku_id` ให้ `machine_stock` ช่อง 020/027 ของ wwv01
- ตรวจ `sales` ย้อนหลัง → ไม่มีแถวไหน map ผิดหรือค้าง null

## ⚠️ กับดักที่เสียเวลาไป

**ตัวแปรในแต่ละไฟล์ชื่อไม่เหมือนกัน** — ไฟล์กลุ่ม VMS/shared ใช้ `name`
แต่กลุ่ม WorldWide ใช้ `goods_name`/`upper` และประกาศ `lower` ทีหลัง
แปะ regex ชุดเดียวกันลงทุกไฟล์แล้วพัง `NameError` 2 ไฟล์

เขียน harness ดึงเฉพาะตัวฟังก์ชันออกมา `exec` แล้วยิงเคสทดสอบ 9 เคสใส่ทั้ง 6 ไฟล์
(ไม่ import ทั้งโมดูล เพราะมันจะไปต่อ network) — จับได้ทันที
**บทเรียน: แก้ map หลายไฟล์ ต้องรันเทียบทุกไฟล์ อ่านโค้ดอย่างเดียวไม่พอ**

## ค้างไว้
- [ ] **ราคา MLBB HOD - 02** — `cost_price` / `sell_price` ยังเป็น 0 (Jin-2 ได้ 48/120 ตาม Jin-1 แล้ว)
- [ ] รูปสินค้า `image_url` ทั้ง 2 ตัว
- [ ] `boxes_per_cotton` ของ MLBB ใส่ค่า default 12 ไว้ — ยังไม่ได้ยืนยัน

## เกี่ยวข้อง
[[project_sku_mapping_two_scraper_maps]] · [[project_ww_machines_status]] ·
[[reference_supabase_rest_access]] · [[reference_manual_stock_sync_buttons]]
