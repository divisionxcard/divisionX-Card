---
type: worklog
date: 2026-06-03
tags: [machines, worldwide, scraper, bugfix, incident]
commits: [54b0daf]
---

# แก้บั๊กตู้ WW: vendor_id อ่านผิด + FK crash จาก sku ไม่รู้จัก

ต่อจาก [[2026-06-03-add-ww-machines]] — หลังเพิ่มตู้ wwv03/04 แล้ว sync พบว่าไม่มีสินค้าหน้าตู้ สืบจน root cause เจอ 2 บั๊ก

## บั๊ก 1: vendor_id อ่านเลขจากรูปผิด (ผมทำเอง)
**อาการ:** wwv02/03/04 ดึงได้ 0 slots · wwv03/04 ขึ้น "Access denied" ใน portal

**root cause:** migration 042 กรอก `machine_id_vendor` ผิดตำแหน่งที่ 11 (`0`→`5`) **ทั้ง 3 ตู้** เพราะผมอ่านเลขจาก**ภาพถ่าย** portal แทนที่จะให้ copy เป็นตัวอักษร
- wwv02: `20050001` (จริง) → เผลอแก้เป็น `25050001` · เดิมไม่ใช่ typo — ผมไปสร้าง typo เอง
- wwv03: `20070006` (จริง) ≠ `25070006` ที่กรอก
- wwv04: `20120001` (จริง) ≠ `25120001` ที่กรอก
- wwv01 `25090606` ขึ้นต้น 25 จริง เลยรอด

**หลักฐาน:** wwv02 sync ได้ 55 slots ด้วย `20050001` เมื่อ 2026-06-02 15:26 UTC (ก่อนผมแก้) · หลังแก้เป็น `25050001` → 0 slots

**แก้:** migration 043 ตั้ง vendor_id ตรงค่า portal machine list (copy เป็นตัวอักษร ไม่ใช่อ่านรูป)

## บั๊ก 2: sku ไม่รู้จักทำให้ save ล้มทั้งชุด
**อาการ:** หลังแก้ vendor_id ทุกตู้ดึงได้ครบ 270 slots แต่ save ลง Supabase crash:
`machine_stock_sku_id_fkey: Key (sku_id)=(OP 16) is not present in table "skus"`

**root cause:** ตู้ WW ใหม่มีสินค้า **OP series ตัวที่ 16** แต่ตาราง skus มีแค่ OP01-OP15 · `map_goods_to_sku()` คืน `"OP 16"` (regex จับ OP+เลขได้) → FK violation → **save ล้มทั้ง batch 270 slots** (sku เดียวพังทั้งชุด)

**แก้ (robustness):**
- `worldwide_stock_sync`: sku ที่ไม่อยู่ใน skus → set NULL (เก็บ product_name ไว้)
- `worldwide_sales_api`: sales (sku_id NOT NULL FK) → drop record · ship_fails (nullable) → NULL
- log รายชื่อ sku ที่ไม่รู้จักไว้ตามเก็บ

## งานค้างต่อ
- **เพิ่ม SKU "OP 16"** (และ sku อื่นที่ log เตือน) ลงตาราง skus ให้ครบ แล้ว backfill sales → ตอนนี้ยอดขาย OP16 ถูก drop ชั่วคราว
- เพิ่ม wwv05 (ยานนาวา) แล้ว ([[wwv05]]) · รอติดตั้งจริง + เปลี่ยนชื่อ site

## บทเรียน (why)
- **อย่าอ่านค่า identifier จากภาพถ่าย** — เลข `0`/`5`, `O`/`0` แยกยาก · ให้ผู้ใช้ copy ตัวอักษร หรือดึงจาก URL/DB เสมอ
- **scraper ที่ดึงข้อมูลภายนอกต้องทน schema drift** — สินค้าใหม่/sku ใหม่ต้องไม่ทำให้ทั้ง batch ล้ม
- ตู้: [[wwv01]] [[wwv02]] [[wwv03]] [[wwv04]] [[wwv05]]
