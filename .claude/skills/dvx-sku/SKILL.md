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

## 7 ไฟล์ที่ต้องแก้พร้อมกัน

```
deploy/agents/shared.py                  map_product_to_sku()   ตัวแปร: name
deploy/scraper/vms_stock_sync.py         map_product_to_sku()   ตัวแปร: name
deploy/scraper/vms_sales_api.py          map_product_to_sku()   ตัวแปร: name  + DIRECT_MAP (module-level)
deploy/scraper/vms_scraper.py            map_sku()              ตัวแปร: key (ผ่าน normalize()) + SKU_MAP
deploy/scraper/worldwide_stock_sync.py   map_goods_to_sku()     ตัวแปร: goods_name / upper / lower
deploy/scraper/worldwide_sales_api.py    map_goods_to_sku()     ตัวแปร: goods_name / upper / lower
deploy/scraper/payif_stock_sync.py       map_name_to_sku()      ตัวแปร: name / upper / lower  ← โครงต่างจากเพื่อน
```

`payif_sales_sync.py` **import** `map_name_to_sku` จาก `payif_stock_sync` → แก้ไฟล์เดียวได้ 2 ไฟล์

### ⚠️ `vms_scraper.py` คือตัวที่ลืมบ่อยที่สุด — skill นี้เองก็เคยลืม
เป็น**ทางสำรอง**ตอน VMS Sales API ล่ม จึงแทบไม่เคยถูกเรียก ลิสต์ในนั้นเลยตกรุ่นเงียบ ๆ
ตรวจเมื่อ 25 ส.ค. 2026 พบว่าขาดไป **9 ชื่อที่มีของอยู่ในตู้ chukes จริง ๆ** ตั้งแต่ มิ.ย.
(YGH ทั้งกลุ่ม · MLP ×2 · TF · PKM Ghost · MLBB · Naruto Jin-2)

ถ้า API ล่มวันที่ลูกค้าซื้อของกลุ่มนั้น = พังสองชั้นพร้อมกันโดยไม่มีสัญญาณ

## ✅ มีเทสต์แล้ว — รันก่อน push เสมอ

```bash
py -3 deploy/scraper/test_sku_mapping.py
```

ใช้ **ชื่อสินค้าจริง 179 แบบ** ที่ query มาจาก `machine_stock` + `sales` ไม่ใช่ชื่อที่แต่งเอง
รันได้โดยไม่ต้องต่อฐานข้อมูลและไม่ต้องมี secret (ดึงเฉพาะฟังก์ชันมา `exec`)

แต่ละเคสผูกกับ**แบรนด์ที่ส่งชื่อนั้นมา** เพราะสามแบรนด์ตั้งชื่อคนละแบบ —
ถ้าไม่ผูก เทสต์จะบังคับให้ mapper ของ VMS รู้จัก `'Naturo Serie 1'` ของ payif
กลายเป็นเตือนหลอกจนคนเลิกเชื่อ

**เพิ่ม SKU ใหม่แล้วต้องเพิ่มเคสด้วย** — ไม่งั้นเทสต์เขียวทั้งที่ยังไม่ได้ครอบคลุมของใหม่

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

### 4.5 เพิ่มรูปซอง/กล่อง

รูปเก็บใน Supabase Storage bucket `sku-images` ชื่อไฟล์ `<SLUG>-pack.webp` / `<SLUG>-box.webp`
รูปแบบที่ใช้จริงทั้ง 45 ตัว: **1024x1024 · WebP · พื้นหลังโปร่งใส · สินค้าสูงราว 90% ของเฟรม**

```bash
py -3 scripts/add_sku_image.py --sku "OP 17" --pack ซอง.png --box กล่อง.png          # ดูผลก่อน
py -3 scripts/add_sku_image.py --sku "OP 17" --pack ซอง.png --box กล่อง.png --apply   # อัปโหลดจริง
```

⚠️ **ต้องโปร่งใส ห้ามติดพื้นขาว** — รูปพวกนี้ถูกส่งให้โมเดลภาพเป็นภาพอ้างอิงที่ต้องลอกตรง ๆ
ติดพื้นขาวมา = โมเดลลอกกรอบขาวไปวางบนโปสเตอร์พื้นกรมท่าด้วย

⚠️ ตัดพื้นหลังต้องเช็ก "ต่อกับขอบภาพ" ไม่ใช่ตัดสีขาวทั้งภาพ
ไม่งั้นตัวหนังสือขาวบนซอง (ONE PIECE / CARD GAME) จะโดนเจาะเป็นรู

⚠️ สิทธิ์ครอบคลุมแค่**รูปซอง/กล่อง** — รูปหน้าการ์ดยังไม่ได้ ห้ามดึงจากเว็บทางการ

เจ้าของมักวางไฟล์ต้นฉบับไว้ที่ `docs/ref-images/` (โฟลเดอร์นี้ **ห้าม commit** — 64 MB)

### 5. ทดสอบทุกไฟล์ — บังคับ
อ่านโค้ดอย่างเดียวไม่พอ เคยพลาดมาแล้ว **ไม่ต้องเขียน harness เองแล้ว** มีไฟล์เทสต์อยู่:

```bash
py -3 deploy/scraper/test_sku_mapping.py
```

เพิ่ม SKU ใหม่ → ไปเพิ่มเคสใน `CASES` ของไฟล์นั้นด้วย โดยใส่แบรนด์ให้ตรงกับตู้ที่ขายจริง:
```python
("One Piece OP - 17", "OP 17", "vms,worldwide"),
```

เคสที่ต้องมีเสมอ: **ชุดใหม่ · ชุดเก่าที่ใกล้เคียงกัน · ของเดิมที่ไม่ได้แตะ** (กัน regression)
และ **ทุก format ที่แบรนด์นั้นใช้** — ซอง/กล่อง/ตัวพิมพ์ใหญ่/ชื่อที่สะกดผิด

ดึงชื่อจริงมาเพิ่มได้จาก:
```
machine_stock?select=product_name,sku_id&sku_id=not.is.null
sales?select=product_name_raw,sku_id&sku_id=not.is.null
```

### 6. เติมข้อมูลย้อนหลัง + ตรวจว่าเคยนับผิดไหม
- PATCH `sku_id` ให้แถว `machine_stock` ที่ค้าง
- query `sales` ด้วย `product_name_raw=ilike.*คำสำคัญ*` แล้วดูว่ามีแถวไหนชื่อกับ `sku_id` ไม่ตรงกัน
- ถ้ายังไม่เคยขาย → บอกเจ้าของว่าโชคดี ไม่ต้องซ่อมย้อนหลัง

## ห้ามทำ
- ❌ แก้แค่ไฟล์ stock ลืมไฟล์ sales (สต็อกถูก ยอดขายผิด)
- ❌ ลืม `vms_scraper.py` เพราะเป็นทางสำรอง — มันคือตัวที่ตกรุ่นบ่อยที่สุด
- ❌ ใช้ substring สั้น ๆ กับสินค้าที่มีหลายชุด — ใช้ regex ที่บังคับมีตัวเลข
- ❌ สร้าง migration ไฟล์ใหม่แค่เพื่อ INSERT ข้อมูล SKU — ใช้ PostgREST ตรงได้ (ดู `dvx-db`)
- ❌ **เชื่อว่า "ต้องแก้ 7 ไฟล์" โดยไม่รันเทสต์ก่อน** — regex `\b(OP|EB|PRB|FB)\s*-?\s*(\d+)`
  รับเลขชุดใหม่อยู่แล้ว ชุดที่ต่อจากของเดิมมักไม่ต้องแตะ mapper เลย
  (เคส OP 17 · 25 ส.ค. 2026 — ต้นเหตุจริงคือไม่มีแถวใน `skus` ทำให้ FK ตัดทิ้ง
  ถ้าไปไล่แก้ mapper ตามความเคยชินจะแก้ผิดที่แล้วปล่อยต้นเหตุไว้)

## เกี่ยวข้อง
`dvx-db` (วิธีต่อฐานข้อมูล) · `dvx-machine` (เพิ่มตู้) ·
`wiki/worklog/2026-08-07-wwv01-new-sku-mapping.md` (เคส map ไม่ติดจริง) ·
`wiki/worklog/2026-08-25-op17-missing-sku.md` (เคส FK ตัดทิ้ง — ไม่ใช่ mapper พัง)
