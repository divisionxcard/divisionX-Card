---
type: worklog
date: 2026-06-13
tags: [slot-tracking, refill, scraper, vms, worldwide, migration, phase1]
commits: [3d7ae85]
---

# Slot Refill Tracking เฟส 1 — track "เติมหน้าตู้เท่าไหร่/ช่อง"

ทำต่อจาก design ที่ตกลงไว้ ([[project_slot_refill_tracking_design]]) · เริ่มเขียนโค้ดเฟส 1 (2026-06-13)

## โจทย์ (ช่องว่างเดิม)
`slot_products_history` จับแค่ตอน **เปลี่ยน SKU** ในช่อง → เติม SKU เดิม (เช่น 3→24) **ไม่มี log**
และตู้ **WorldWide ไม่ track slot เลย** → admin ไม่รู้ว่าแต่ละรอบจัดของ เติมเข้าช่องไหนเท่าไหร่

## สิ่งที่ทำ
1. **migration 048** — ตาราง `slot_refill_events` · 2 grain ในตารางเดียว (column `grain`)
   - `qty_added = (qty_after − qty_before) + sold_between` = เติมเข้าจริง (บวกกลับยอดที่ขายไประหว่าง sync)
   - applied + verified บน Supabase แล้ว (20 columns)
2. **`slot_tracking.py`** — module กลาง ใช้ร่วม 2 scraper · เทียบ machine_stock เดิม vs scrape ใหม่
3. **wire** ทั้ง `vms_stock_sync.py` + `worldwide_stock_sync.py` (เรียก **ก่อน** save · wrap try/except)
4. unit-test pure logic (`_build_vms_events` / `_build_ww_events`) ผ่านครบ

## Decision สำคัญ (why) — grain ต่างกัน 2 ฝั่ง
ถาม user แล้วเลือก **"ระดับ SKU+หน่วย"** สำหรับ WW เพราะข้อมูลฝั่ง WW จำกัด:
- **VMS (chukes)** → `grain='slot'` ต่อช่องแม่นยำ · sales **มี `slot_number`** → attribute sold_between เข้าช่องตรง
- **WW (wwv)** → `grain='sku'` ต่อ machine+sku+หน่วย(box/pack) · เพราะ:
  - SKU เดียว**กระจายหลายช่องมาก** (เจอ 39 เคส เช่น wwv01 OP-16 อยู่ 11 ช่อง)
  - WW sales **ไม่มี `slot_number` + product_name ไม่บอก Box/Pack** → แยกยอดเข้าช่อง/หน่วยไม่ได้
  - แก้: รวม qty ต่อ (machine, sku, is_box) · sold รวมต่อ machine+sku **ลงหน่วย pack** (box แทบไม่ขาย/แยกจาก sales ไม่ได้)
- เลือกได้เพราะ warehouse ตัดสต็อกที่ระดับ SKU/หน่วยอยู่แล้ว ([[project_actual_usage_scope]]) ไม่ต้องรู้รายช่อง WW

## รายละเอียด logic
- รัน **ก่อน** save_to_supabase → machine_stock ยังเป็นค่ารอบก่อน (= "ก่อน")
- รอบแรกที่ไม่มี machine_stock เดิม = **seed เงียบ** (ไม่ออก event กันทะลัก)
- `change_type`: `refill` (qty_added>0) · `swap_in`/`swap_out` (เปลี่ยน/หาย SKU)
- ขายอย่างเดียว (เหลือลด ไม่เติม) → qty_added≤0 → **ข้าม** ไม่ออก row
- identity: VMS=`product_id` · WW=`sku_id`/`product_name`
- ไม่ fail workflow ถ้า tracking error (core sync ยัง work)

## ข้อจำกัด / จุดเฝ้าระวัง
- WW sold ลง pack ทั้งหมด → ถ้า WW มีขายจากช่อง box จริง qty_added ฝั่ง pack จะคลาดเล็กน้อย (ยอมรับได้)
- VMS sales เก่าบางส่วน `slot_number=NULL` (4631 มี / 10886 NULL) → sold_between เฉพาะ sales ที่มี slot (ล่าสุดมีครบ)
- ยังไม่รันจริง end-to-end — รอบ sync แรกจะเป็น **คืนนี้ 00:05** (VMS) · ควรเช็ค workflow log + ตาราง

## งานค้างต่อ (เฟส 2-3)
- **เฟส 2**: `slot_restock_sessions` (bracket รอบจัดของ) + supabase.js queries + ปุ่ม "เริ่มจัดของ/ซิงค์หลังเสร็จ" + ตารางสรุป + แก้ตัวเลขเอง
- **เฟส 3**: สรุป "ตัดสต็อกคลัง X ซอง/SKU" + export Excel

## 🔗 เกี่ยวข้อง
[[project_slot_refill_tracking_design]] · [[project_slot_history_tracking]] · [[project_sku_mapping_two_scraper_maps]]
