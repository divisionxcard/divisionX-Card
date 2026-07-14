---
type: worklog
date: 2026-07-14
tags: [vendos, scraper, stock, api, sku-mapping]
commits: [6a30b0c]
status: stock scraper เขียนเสร็จ · รอ dry-run ผ่าน + สร้าง machines record
---

# Vendos stock scraper — เขียน + ทดสอบ mapper

## บริบท (why)
ต่อจาก [[2026-07-13-vendos-brand-integration-plan]] · ตู้ Vendos ตัวแรก (shop id **208**) มีข้อมูลแล้ว
เก็บ response จริงจาก DevTools Network ได้ครบ → เขียน scraper ได้

## โครงสร้าง API จริง (ยืนยันจาก response)
- **stock**: `GET /cc_api/shop/stock/{shop_id}` → `data: [{slot, product_id, product_code, sell_price:{_dec_,_exp_}, qty, capacity, warn_threshold, stock_status}]`
  - ราคา = `_dec_ × 10^_exp_` (เช่น 48000×10⁻² = 480.00) · **ไม่มีชื่อสินค้า**
- **sales**: `GET /cc_api/shop/sales/{shop_id}` → `data: {slot: {product_name, product_spec, success_qty, fail_qty, total_qty, capacity}}`
  - **มี product_name ราย slot** (แต่เป็น cumulative summary ไม่ใช่ transaction — ยังไม่มี timestamp)
- envelope ทุก endpoint: `{code:1000, desc:"success", data:...}`
- id ต่อแบบ **path param** · auth = `Authorization: Bearer <access_token>`

## Key insight
Stock endpoint ไม่มีชื่อสินค้า (มีแค่ product_id/hash) → **join stock+sales ด้วย slot** เอา product_name จาก sales
= ได้ชื่อ+คงเหลือ+ความจุครบ โดยไม่ต้องเรียก /cc_api/product

## สิ่งที่ทำ
- `deploy/scraper/vendos_stock_sync.py` — login → join stock+sales → upsert machine_stock (โครงตาม worldwide_stock_sync)
- **SKU mapper** `map_name_to_sku()`: regex OP/EB/PRB/FB + เลข → "XX NN" · substring map สำหรับ Pokemon/Naruto/Solo/YGH
  - ทดสอบกับชื่อจริง **40 ชื่อ (60 ช่อง) → map ถูก 100% · 0 พลาด** (ผ่าน node จำลอง logic)
  - รองรับเคสสกปรก: typo **"Natoru Serie 1"**, "Serie" ไม่มี s, "Pokemon  Dream EX" เว้นวรรคคู่, "Pokemon Ghost " space ท้าย, Box/Pack (SKU เดียวกัน)
- `.github/workflows/vendos-stock-sync.yml` — **workflow_dispatch เท่านั้น (ยังไม่มี cron)** รัน `--dry-run --shop-id` → ทดสอบใน GH ได้โดยไม่ต้องลง Python เอง + ไม่มี FAIL alert หลอก

## ค้าง (ทำต่อ)
1. รัน workflow (dry-run) → ยืนยัน login+fetch จริงผ่าน (ทดสอบ mapper แล้ว เหลือ live HTTP)
2. INSERT machines record: brand='vendos', machine_id (เช่น vds01), config.machine_id_vendor='208' — **ต้องรู้ location/สาขาของตู้**
3. เปลี่ยน workflow เป็น live (เอา --dry-run ออก + เพิ่ม cron + telegram alert)
4. **sales scraper แยก** — endpoint /cc_api/shop/sales เป็น summary ไม่มี timestamp → ต้องดู `/cc_api/shop/order/{id}` (transaction) ตอนมีการขายจริง
5. ปุ่ม "ดึงข้อมูล Vendos" บนเว็บ

## 🔗 เกี่ยวข้อง
[[2026-07-13-vendos-brand-integration-plan]] · [[project_vendos_integration]] · [[vendos-integration-plan]] · [[project_sku_mapping_two_scraper_maps]]
