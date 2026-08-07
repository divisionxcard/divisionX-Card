---
name: dvx-sku
description: ใช้เมื่อเพิ่ม/แก้/เปลี่ยนสินค้าในตู้ — เพิ่ม SKU ใหม่, สินค้าเปลี่ยนชุด, ช่องไหน sku_id ว่าง, หรือยอดขายของ SKU ไหนหายไป/ไปรวมกับตัวอื่น
---

# เพิ่ม/แก้สินค้าและ SKU mapping

## ทำไมงานนี้อันตราย

ชื่อสินค้าจากหลังบ้านตู้ → `sku_id` ทำโดย **map ที่ hardcode ไว้ 6 ไฟล์** ไม่ใช่ตาราง `sku_aliases`
เวลาพัง มันพังแบบ **ไม่มีเสียง** 2 แบบ:

| อาการ | ตรวจเจอยังไง | ความเสียหาย |
|---|---|---|
| map ไม่ติด → `sku_id = null` | เห็นได้ (query `sku_id=is.null`) | สินค้าหายจากรายงาน |
| **map ติดผิดตัว** | **มองไม่เห็นเลย** | ยอดขายไปรวมกับ SKU อื่น |

แบบที่ 2 อันตรายกว่ามาก — เคยเกิดจริงกับ `("jin", "NRT Jin - 1")` ใน payif
ที่เป็น substring หลวม ทำให้ `"Naruto Jin - 2"` จะถูกนับเป็น Jin-1

## 6 ไฟล์ที่ต้องแก้พร้อมกัน

```
deploy/agents/shared.py                  map_product_to_sku()   ตัวแปร: name
deploy/scraper/vms_stock_sync.py         map_product_to_sku()   ตัวแปร: name
deploy/scraper/vms_sales_api.py          map_product_to_sku()   ตัวแปร: name  + DIRECT_MAP (module-level)
deploy/scraper/worldwide_stock_sync.py   map_goods_to_sku()     ตัวแปร: goods_name / upper / lower
deploy/scraper/worldwide_sales_api.py    map_goods_to_sku()     ตัวแปร: goods_name / upper / lower
deploy/scraper/payif_stock_sync.py       map_name_to_sku()      ตัวแปร: name / upper / lower  ← โครงต่างจากเพื่อน
```

`payif_sales_sync.py` **import** `map_name_to_sku` จาก `payif_stock_sync` → แก้ไฟล์เดียวได้ 2 ไฟล์

### กับดัก 1 — ชื่อตัวแปรไม่เหมือนกัน
copy regex ชุดเดียวกันแปะทุกไฟล์แล้วจะได้ `NameError` ที่กลุ่ม WorldWide
เพราะไฟล์นั้นใช้ `goods_name` และประกาศ `lower` **ทีหลัง** จุดที่จะแทรก
→ เลื่อน `lower = goods_name.lower().strip()` ขึ้นมาก่อน แล้วใช้ `lower`

### กับดัก 2 — payif ใช้ substring map หลวม
`payif_stock_sync` จบด้วย `for sub, sku in (...)` ที่เช็ก `if sub in lower`
**regex ที่มีเลขชุดต้องมาก่อน loop นี้เสมอ** ไม่งั้นชุดใหม่จะถูกชุดเก่ากลืน

### กับดัก 3 — ชื่อในหลังบ้านแต่ละแบรนด์คนละ format
```
VMS/WW  : "One Piece OP - 16"        (canonical)
payif   : "ONE PIECE OP - 16 Pack"   (มี Pack/Box ต่อท้าย, ตัวพิมพ์ใหญ่)
payif   : "Naturo Serie 1"           (สะกดผิด — ห้ามแก้ regex ให้พึ่งการสะกดถูก)
```
เขียน regex ให้รับ**ทั้งสอง format** เสมอ เผื่อวันหน้าเจ้าของไปแก้ชื่อในหลังบ้าน
**ห้ามแนะนำให้เจ้าของแก้ชื่อในหลังบ้านก่อนที่โค้ดจะรับ format ใหม่ได้** — เคยเกือบทำพลาด

## ขั้นตอน

### 1. ดูของจริงก่อนเสมอ
```
ตาราง machine_stock — คอลัมน์: machine_id, slot_number, product_name, sku_id, remain
ตาราง sales        — คอลัมน์: machine_id, product_name_raw, sku_id, quantity_sold, sold_at
```
query `machine_stock?sku_id=is.null` ดูว่าค้างช่องไหนบ้าง (ดู skill `dvx-db` สำหรับวิธีต่อ)
⚠️ แถวที่ `product_name = null` คือ**ช่องเปล่าจริง** ไม่ใช่ปัญหา — ปกติมีที่ตู้ chukes

### 2. ถามข้อมูลที่ขาดก่อนแตะโค้ด
`sku_id` · ชื่อเต็ม · ซอง/กล่อง · กล่อง/ลัง · ทุน/ซอง · ราคาขาย/ซอง
ถ้าเป็นชุดต่อจากของเดิม (เช่น Jin-2 ต่อจาก Jin-1) ให้ถามว่าใช้ค่าเดียวกันได้ไหม

### 3. เพิ่มแถวใน `skus`
คอลัมน์จริง (ระวัง — ไม่ตรงกับที่คาด):
```
sku_id, name, series, packs_per_box, boxes_per_cotton   ← สะกด cotton ไม่ใช่ carton
sell_price, cost_price   ← ราคาอยู่ที่นี่
avg_cost                 ← เป็น 0 ทุกแถว ไม่ได้ใช้แล้ว อย่าไปยุ่ง
canonical_sku            ← ชื่อจริงหน้าตู้ · หน้า PageSlots ใช้โชว์ + ตรวจ naming contract
franchise, set_code, item_type, language, is_active, image_url, image_url_box
```

### 4. แก้ mapper ทั้ง 6 ไฟล์

### 5. ทดสอบทุกไฟล์ — บังคับ
อ่านโค้ดอย่างเดียวไม่พอ เคยพลาดมาแล้ว ใช้ harness นี้ (ดึงเฉพาะฟังก์ชันมา `exec`
เพื่อไม่ให้ `import` ไปต่อ network):

```python
import re, pathlib
CASES = [("Naruto Jin - 2", "NRT Jin - 2"), ("Naruto Jin - 1", "NRT Jin - 1"), ...]
for path in FILES:
    src = pathlib.Path(path).read_text(encoding="utf-8")
    fn = next(n for n in ("map_goods_to_sku","map_product_to_sku","map_name_to_sku") if f"def {n}" in src)
    ns = {"re": re}
    dm = re.search(r"^DIRECT_MAP\s*=\s*\{.*?^\}", src, re.S | re.M)   # vms_sales_api ต้องมีตัวนี้ด้วย
    if dm: exec(dm.group(0), ns)
    exec(re.search(rf"def {fn}\(.*?(?=\ndef |\nclass |\Z)", src, re.S).group(0), ns)
    f = ns[fn]
    ...
```
เคสที่ต้องมีเสมอ: **ชุดใหม่ · ชุดเก่าที่ใกล้เคียงกัน · ของเดิมที่ไม่ได้แตะ** (กัน regression)

### 6. เติมข้อมูลย้อนหลัง + ตรวจว่าเคยนับผิดไหม
- PATCH `sku_id` ให้แถว `machine_stock` ที่ค้าง
- query `sales` ด้วย `product_name_raw=ilike.*คำสำคัญ*` แล้วดูว่ามีแถวไหนชื่อกับ `sku_id` ไม่ตรงกัน
- ถ้ายังไม่เคยขาย → บอกเจ้าของว่าโชคดี ไม่ต้องซ่อมย้อนหลัง

## ห้ามทำ
- ❌ แก้แค่ไฟล์ stock ลืมไฟล์ sales (สต็อกถูก ยอดขายผิด)
- ❌ ใช้ substring สั้น ๆ กับสินค้าที่มีหลายชุด — ใช้ regex ที่บังคับมีตัวเลข
- ❌ สร้าง migration ไฟล์ใหม่แค่เพื่อ INSERT ข้อมูล SKU — ใช้ PostgREST ตรงได้ (ดู `dvx-db`)

## เกี่ยวข้อง
`dvx-db` (วิธีต่อฐานข้อมูล) · `dvx-machine` (เพิ่มตู้) · `wiki/worklog/2026-08-07-wwv01-new-sku-mapping.md` (เคสจริงล่าสุด)
