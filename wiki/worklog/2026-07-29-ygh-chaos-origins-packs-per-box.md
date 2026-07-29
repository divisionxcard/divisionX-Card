---
type: worklog
date: 2026-07-29
tags: [sku, packs-per-box, ygh, scraper, migration, box-conversion]
commits: [058]
status: ✅ YGH Chaos Origins 1 กล่อง = 30 ซอง (เดิม 15) · DB + scraper 4 ไฟล์
---

# YGH Chaos Origins — แก้ 1 กล่อง = 30 ซอง (เดิม 15)

## บริบท (why)
แอดมินแจ้งสเปคกล่องจริงของ **Yu-Gi-Oh Chaos Origins** คือ **30 ซอง/กล่อง** แต่ระบบตั้งไว้ 15
→ ถ้าตู้ไหนตั้ง slot เป็น **Box** ยอดขาย/สต็อกจะแปลงเป็นซองผิดครึ่งหนึ่ง
(ค่านี้ใช้แปลง box→ซอง ทั้งยอดขาย · สต็อกหน้าตู้ · รายงานเติมสินค้า)

## สิ่งที่ทำ
1. **DB**: `skus.packs_per_box = 30` (apply prod ผ่าน PostgREST) + [migration 058](../../backend/database/migrations/058_ygh_chaos_origins_packs_per_box.sql)
2. **scraper** — ค่านี้ hardcode ซ้ำใน `PACKS_PER_BOX` dict แก้ครบ 4 ไฟล์:
   - [worldwide_sales_api.py](../../deploy/scraper/worldwide_sales_api.py) · [payif_sales_sync.py](../../deploy/scraper/payif_sales_sync.py) — มี YGH อยู่แล้ว 15 → 30
   - [vms_sales_api.py](../../deploy/scraper/vms_sales_api.py) · [vms_scraper.py](../../deploy/scraper/vms_scraper.py) — **ไม่มี YGH เลย** → ถ้าขาย box จะ fallback 24 (ผิด) · เพิ่ม YGH ทั้ง 3 ตัว
     · VMS ได้ sku_id จาก slot lookup (machine_stock) ไม่ได้ผ่าน `map_product_to_sku` → เลยมียอดขาย YGH แม้ DIRECT_MAP ไม่มี
3. อัปเดต frontmatter [[YGHChaosOrigins]] (`pack_size`)

## ตรวจก่อนแก้ — ไม่มีข้อมูลย้อนหลังต้องซ่อม
- `sales` 138 แถว → **ไม่มีแถวที่ขายเป็น box** (ชื่อ raw: "YU-GI-OH! Chaos Origins" ×136 · "Yuki Oh Chaos Origins" ×2) ขายซองล้วน
- `machine_stock` 9 slot (chukes01-04 · wwv03-06 · pf01) → **เป็น slot ซองทั้งหมด** (cap 12) ไม่มี slot box
→ การแก้ครั้งนี้มีผลกับข้อมูลใหม่เท่านั้น · frontend ดึง `packs_per_box` จาก DB สด ไม่ต้อง deploy

## ⚠️ หนี้เชิงโครงสร้าง
`packs_per_box` มี **5 แหล่ง** (DB + hardcode 4 scraper) — แก้ SKU ทีต้องไล่ทุกไฟล์
· ทางออกระยะยาว: ให้ scraper อ่านจาก `skus` table ตอน start แทน dict (ตามที่ [multi_brand_support.md](../../backend/docs/multi_brand_support.md) เสนอไว้ "ใช้ตัวเลขนี้กลาง ไม่ embed ใน connector")

## 🔗 เกี่ยวข้อง
[[2026-06-03-add-ww-op16-pkm-ygh-skus]] · [[2026-06-06-fix-skuid-null-unpushed-map]] · [[project_sku_mapping_two_scraper_maps]]
