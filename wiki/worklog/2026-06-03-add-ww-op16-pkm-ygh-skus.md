---
type: worklog
date: 2026-06-03
tags: [skus, worldwide, scraper, migration]
commits: [56243b4]
---

# เพิ่มสินค้าใหม่ตู้ WW: OP 16 + Pokemon Ghost + Yu-Gi-Oh (3 sets)

ต่อจาก [[2026-06-03-fix-ww-vendor-and-fk]] หัวข้อ "งานค้าง" — เพิ่ม sku ที่ scraper เคย log เตือนแล้ว set NULL ชั่วคราว

## สินค้าที่เพิ่ม (5 SKU · migration 045)
| sku_id | packs/box | series | franchise | ชื่อ raw ในตู้ |
|--------|-----------|--------|-----------|----------------|
| OP 16 | 24 | OP | OP | `One Piece OP - 16` / `... Box` |
| PKM Ghost | 30 | OTHER | PKM | `Pokemon Ghost` |
| YGH The Heroes | 15 | OTHER | YGH | ⚠ ยังไม่มาถึงตู้ (raw name รอ verify) |
| YGH The Revals | 15 | OTHER | YGH | `Yuki oh Limited Over Collection` |
| YGH Chaos Origins | 15 | OTHER | YGH | `Yuki Oh Chaos Origins` |

## ความไม่ตรงกัน ภาพ vs ตู้จริง (สำคัญ)
ภาพที่ admin ส่งมาระบุ `YGH The Heroes` + `YGH The Revals` แต่ machine_stock จริง (wwv03/04/05)
มี `Yuki oh Limited Over Collection` ที่ไม่อยู่ในภาพ · ยืนยันกับ admin:
- **`Yuki oh Limited Over Collection` = YGH The Revals** (ชื่อ portal ≠ ชื่อ DvX)
- `YGH The Heroes` ยังไม่มาถึงตู้ → pre-register ไว้ก่อน · ชื่อ raw ตอนมาจริงต้องเช็คซ้ำแล้วแก้ map

## งานที่ทำ
1. **migration 045** — INSERT 5 sku (canonical fields ครบ) + sku_aliases (ww) + backfill machine_stock NULL
2. **map_goods_to_sku()** ทั้ง `worldwide_stock_sync.py` + `worldwide_sales_api.py`:
   - `pokemon ghost`→PKM Ghost · `chaos origins`→YGH Chaos Origins
   - `limited over`→YGH The Revals · `the revals`/`the heroes` (เผื่อ portal เปลี่ยนชื่อ)
   - OP 16 ใช้ regex เดิมจับได้อยู่แล้ว (`One Piece OP - 16` → OP 16)
3. **PACKS_PER_BOX** (sales scraper) — เพิ่ม OP 16=24, PKM Ghost=30, YGH×3=15 (กัน default 24 ผิดตอนขายกล่อง)
4. apply จริงผ่าน REST แล้ว: 5 sku (id 44-48) + machine_stock ไม่เหลือ NULL occupied อีก

## งานค้างต่อ
- **backfill ยอดขาย** ที่ถูก drop ตั้งแต่ติดตั้ง wwv03/04 (2026-06-03) — รอคุยกับ admin (รัน WW sales sync ย้อนหลัง)
- **verify ชื่อ raw ของ "The Heroes"** ตอนสินค้าโผล่ในตู้จริง — ถ้าไม่ตรง `the heroes` ต้องแก้ map
- sell_price/cost_price ของ 5 sku ยัง = 0 → admin กรอกผ่าน UI

## บทเรียน (why)
- **ตรวจชื่อ raw จาก machine_stock จริงก่อนเขียน map เสมอ** — ชื่อ portal ("Limited Over Collection")
  ต่างจากชื่อที่ admin แจ้ง ("The Revals") · ถ้า map จากภาพอย่างเดียวจะ map ผิด/ไม่ครบ
- ตู้: [[wwv03]] [[wwv04]] [[wwv05]]
