---
type: worklog
date: 2026-07-17
tags: [payif, vendos, sales, scraper, api, live, iconsiam]
commits: [bb2e63b, 96a835b, 1bcb5c3, 6b45ba4, 485ac55, 03cd7d3]
status: ✅ live — sales scraper เสร็จ · backfill 30 orders · cron เปิดแล้ว · ปุ่มเว็บเสร็จ
---

# Payif sales scraper — ตู้ pf01 (ไอคอนสยาม) ยอดขายเข้าระบบ

## บริบท (why)
ต่อจาก [[2026-07-14-payif-machine-live]] — ตอนนั้นค้าง **sales scraper** เพราะยังไม่มีการขายจริง
ให้ดู endpoint transaction ตอนตู้เริ่มขาย · ตอนนี้ตู้ pf01 **เริ่มขายแล้ว (14 ก.ค.)** → เขียน scraper ได้

## ค้น endpoint จริง (ผ่าน probe บน GitHub Actions)
creds อยู่ใน GitHub Secrets (ไม่มีในเครื่อง dev) → รัน `payif_probe.py` ผ่าน workflow_dispatch `payif-probe.yml`

**บั๊ก/ทางตันที่เจอ:**
1. `/cc_api/shop/order/{sid}` (เดาว่า sid=shop id) → `data:null` · ที่จริง `/{id}` = **order id** ไม่ใช่ shop id
2. bare `/cc_api/shop/order` → HTTP 500 `AttributeError:'NoneType'...tzinfo` = **ต้องการ date param**
3. brute-force ชื่อ param 13 แบบ (start/from/date_from/...) → crash หมด
4. **กุญแจ**: อ่าน static `/static/js/api.js` + `config.js` → param จริงคือ **`ft_from_dt` / `ft_to_dt`**
   format `YYYY-MM-DDT00:00:00.000` / `...T23:59:59.000` (จาก `get_weekly_val` + `FMT_DATE_FROM/TO`)

## โครงสร้าง API (ยืนยันจาก response จริง)
```
LIST  GET /cc_api/shop/order?ft_from_dt=…&ft_to_dt=…&start=0&length=100
      → data: {recordsTotal, recordsFiltered, draw, data:[order,…]}  (DataTables envelope)
      order: {id, order_no, shop_id, timestamp, total_amount{_dec_,_exp_}, status_label:"success"}
      ⚠ list ไม่มี line items → ต้องเรียก detail ต่อทุก order (N+1 เหมือน WW searchDetail)
DETAIL GET /cc_api/shop/order/{id}
      → data.details:[{product_name, slot, qty, amount{_dec_,_exp_}, delivery_status_label}]
REPORT GET /cc_api/reports/order-detail-report?ft_from_dt=… → xlsx (สำรอง ไม่ได้ใช้)
```
- ราคา/เงิน = `_dec_ × 10^_exp_` (12000×10⁻² = 120.00)
- `timestamp` ไม่มี TZ = **เวลาไทย** (order ล่าสุด 21:54 vs เวลาปัจจุบัน 22:58 ไทย → ยืนยัน) → append +07:00
- `sales-summary` / obs_tree = **ว่างเปล่าทั้งบัญชี** (ยอดรวมไม่ผ่าน endpoint นี้ · ต้องใช้ order list)

## สิ่งที่ทำ
- `deploy/scraper/payif_sales_sync.py` — login → order list (paginate recordsTotal) → กรอง `status_label=success`
  → detail → sales records · **reuse `map_name_to_sku` จาก `payif_stock_sync`** (single source ต่อ brand)
  · box→ซอง (PACKS_PER_BOX) · upsert `on_conflict=sale_key` `ignore_duplicates` · `--days/--from-date/--to-date/--dry-run`
- `.github/workflows/payif-sync.yml` — cron **00:15 ไทย** (คั่นกลาง stock 00:20) + dispatch (มี dry_run toggle) + telegram FAIL alert
- `payif_probe.py` + `payif-probe.yml` — เครื่องมือ probe order endpoint (เก็บไว้ใช้ครั้งหน้า)

## ทดสอบ + live
- **dry-run** (1-17 ก.ค.): 30 orders → **30 records map ครบ 100% · 0 unknown SKU** · ฿6,641
- **backfill จริง**: save 30 rows เข้า `sales` (machine_id=pf01) — verify ผ่าน REST: `count=30`, total **฿6,641.00**
  ช่วง **14 ก.ค. 18:00 → 17 ก.ค. 21:54** (ไทย) · 17 SKU (OP/FB/PRB/NRT/PKM) — ตรง dry-run เป๊ะ
- หน้ายอดขายบนเว็บแสดง pf01 อัตโนมัติ (frontend รวมข้ามแบรนด์ผ่าน machine_id)

## ปุ่ม manual sync ยอดขายบนเว็บ (03cd7d3)
- `deploy/app/api/payif-sync/route.js` — dispatch `payif-sync.yml` (ย้อน 3 วัน `from_date/to_date` · `requireUser`) ลอก worldwide-sync
- ปุ่ม **"Sync Payif"** ใน `PageSales.jsx` ถัดจาก Sync VMS/WW (state `syncingPayif` · reuse `triggerSync`)
- `npm run build` ผ่าน · `/api/payif-sync` compiled — เดิมมีแค่ปุ่ม stock (ฝั่งสต็อกหน้าตู้)

## หมายเหตุ / ต่อยอด
- ตู้เริ่มขาย **14 ก.ค.** (order แรก) ไม่ใช่ 1 ก.ค. — backfill เผื่อช่วงกว้างไม่มีผล (order มีเท่าที่มี)
- cron active แล้วตั้งแต่ push · 00:15 คืนนี้จะดึง `--days 1` (เมื่อวาน+วันนี้) อัตโนมัติ · dup กันด้วย sale_key
- ยังไม่ทำ: ship-fail tracking (Payif refund ในตัว?) — รอเจอเคส order ที่ไม่ success ก่อน
- ✅ ปุ่ม manual sync ยอดขาย Payif เสร็จแล้ว (ดูด้านบน) — Payif มีปุ่มครบทั้ง stock + sales

## 🔗 เกี่ยวข้อง
[[2026-07-14-payif-machine-live]] · [[2026-07-14-vendos-stock-scraper]] · [[project_vendos_integration]] · [[project_sku_mapping_two_scraper_maps]] · [[reference_trigger_github_workflow]]
