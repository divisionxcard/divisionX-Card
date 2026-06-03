---
type: machine
machine_id: wwv02
brand: worldwide
machine_id_vendor: VCM350CKC20050001
status: active
location: เดอะมอลไลฟ์สโตร์ บางกะปิ
route: เขตบางกะปิ
version: SXA1B31R.THA251001.014
last_updated: 2026-06-03
---

# ตู้ที่ 6 (wwv02) · เดอะมอลไลฟ์สโตร์ บางกะปิ

ตู้ WorldWide Vending — สาขาเดอะมอลล์ไลฟ์สโตร์ บางกะปิ

## ข้อมูลพื้นฐาน

| Field | Value |
|-------|-------|
| Machine ID | wwv02 |
| Brand | worldwide |
| Vendor ID | VCM350CKC20050001 |
| Route | เขตบางกะปิ |
| ที่ตั้ง | เดอะมอลไลฟ์สโตร์ บางกะปิ |
| Version | SXA1B31R.THA251001.014 |
| สถานะ | ใช้งาน (active) |

## 📦 สินค้าในตู้ (Current Slots)

_scraper จะ sync จาก machine_stock (00:15 น. เวลาไทย)_

## ⚠️ ประวัติแก้ไข (audit)

- **vendor_id ที่ถูกต้องคือ `VCM350CKC20050001`** (ขึ้นต้น 20) — sync ได้ 55 slots
- **2026-06-03** — migration 042 เผลอเปลี่ยนเป็น `VCM350CKC25050001` (อ่านเลขจากรูป portal ผิด 0→5) → wwv02 ดึงข้อมูลไม่ได้ (0 slots) · migration 043 revert กลับ · ดู [[2026-06-03-fix-ww-vendor-and-fk]]

## 📝 หมายเหตุ

- WorldWide เป็น data-driven — sync อัตโนมัติจากตาราง `machines` ไม่ต้องแก้ scraper
- ตู้พี่น้อง: [[wwv01]] · [[wwv03]] · [[wwv04]]
