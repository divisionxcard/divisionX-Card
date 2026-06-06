---
type: worklog
date: 2026-06-06
tags: [bugfix, scraper, machine-stock, export, vms, worldwide, deploy]
commits: [a793549]
---

# แก้ export หน้าเตรียมของเติมตู้ "สินค้าไม่มีชื่อ" — ต้นเหตุ: map ไม่ถูก push

ต่อจาก [[2026-06-03-add-ww-op16-pkm-ygh-skus]] — สินค้าใหม่ PKM Ghost / YGH Chaos Origins /
YGH The Revals export ออกมาไม่มีชื่อ (admin แจ้ง 2026-06-06)

## อาการ
หน้า "เตรียมของเติมตู้" → Export PDF → 3 สินค้านี้แสดงไม่มีชื่อ (join `skus` ไม่ติด)

## ต้นเหตุจริง (ไม่ใช่บั๊กโค้ด export)
- commit `56243b4` (แก้ `map_goods_to_sku()` + INSERT 5 sku) เมื่อ 2026-06-03 **ไม่เคยถูก push**
  → GitHub Actions รัน `worldwide_stock_sync.py` จาก origin/main = โค้ดเก่าที่ยังไม่รู้จักสินค้าใหม่
  → nightly stock sync เขียน `machine_stock.sku_id = NULL` ทุกคืน (ล่าสุด 2026-06-06 02:06)
  → export ใช้ `skus.find(s => s.sku_id === r.sku_id)` หาไม่เจอ → ไม่มีชื่อ
- **machine_stock เป็น source of truth ของ sku_id ที่ export ใช้** — migration 045 backfill ครั้งเดียว
  แต่ nightly sync ทับเป็น NULL อีก เพราะโค้ด deploy ยังไม่มี map

## เซอร์ไพรส์: ตู้ VMS ก็โดนด้วย
- "Pokemon Ghost" ขายทั้งตู้ WW **และ VMS (chukes01-04)**
- ตู้ VMS ส่งชื่อ `'Pokemon Ghost '` (มี **ช่องว่างต่อท้าย** · len=14) — `vms_stock_sync.py`
  ใช้คนละ scraper/คนละ `map_product_to_sku()` ซึ่งไม่มี entry นี้เลย
- raw name จริงของ YGH ใน portal = `'YU-GI-OH! Chaos Origins'` / `'YU-GI-OH! The Revals'`
  (ไม่ตรงกับที่ migration 045 เดา = `'Yuki Oh ...'`) แต่ substring map `chaos origins`/`the revals`
  จับได้อยู่แล้ว → ใช้ได้เมื่อ deploy

## งานที่ทำ
1. **push** 2 commit ค้าง (`b738746..dbc0bd8`) → Actions ได้ WW map ใหม่
2. เพิ่ม map สินค้าใหม่ (Pokemon Ghost + YGH×3) ใน `vms_stock_sync.py` → commit+push `a793549`
   — กัน nightly VMS sync (00:05) null ทับ chukes อีก
3. **patch `machine_stock` ทันทีผ่าน REST** (ไม่รอ sync รอบหน้า):
   - `Pokemon Ghost`(WW)+`Pokemon Ghost `(VMS) → PKM Ghost (7 แถว)
   - `%Chaos Origins%` → YGH Chaos Origins (7) · `%The Revals%` → YGH The Revals (7)
4. verify: NULL sku_id ที่ is_occupied=true เหลือ **0 แถว**

## backfill ยอดขาย WW (เสร็จ ✓)
- admin กด Run workflow `worldwide-sync.yml` (from=2026-06-03 to=2026-06-06) — ผมไม่มี GH_PAT/WW creds ในเครื่อง
- verify ใน DB: **276 sales rows** กลับมาครบ (wwv01-05 × 4 วัน) · สินค้าใหม่ที่เคยถูก drop (FK)
  เข้าครบ 44 rows: OP 16 (30 ซอง/6,380฿) · PKM Ghost (9/1,440฿) · YGH Chaos Origins (3/200฿) ·
  YGH The Revals (2/400฿) · The Heroes = 0 (ยังไม่เข้าตู้ ถูกต้อง)

## งานค้างต่อ
- เดิมจาก [[2026-06-03-add-ww-op16-pkm-ygh-skus]]: verify ชื่อ raw "The Heroes" ตอนเข้าตู้ ·
  sell_price/cost_price 5 sku = 0 (admin กรอก UI)
- (cleanup) migration 045 + sku_aliases external_name ของ YGH ใส่ raw name ผิด
  (`Yuki Oh ...` แทน `YU-GI-OH! ...`) — ไม่กระทบ function เพราะ scraper ใช้ substring map · แก้ทีหลังได้

## บทเรียน (why)
- **commit แล้วไม่ push = โค้ด deploy ไม่เปลี่ยน** แต่ DB ในเครื่อง dev ดู "ถูก" เพราะ migration apply ตรง
  → อาการโผล่เฉพาะ pipeline อัตโนมัติ (cron sync) ที่รันจาก origin/main · **ตรวจ `git log origin/main..HEAD` เสมอ**
- **สินค้าเดียวขายหลาย brand ตู้** (VMS+WW) → ต้องแก้ map ทุก scraper · อย่าแก้ที่เดียว
- ชื่อ portal มี **ช่องว่างต่อท้าย/รูปแบบต่างกัน** ระหว่าง brand · `.strip()` + substring match สำคัญ
- ตู้: [[wwv03]] [[wwv04]] [[wwv05]] [[chukes01]] [[chukes02]] [[chukes04]]
