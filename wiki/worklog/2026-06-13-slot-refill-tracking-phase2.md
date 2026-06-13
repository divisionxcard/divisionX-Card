---
type: worklog
date: 2026-06-13
tags: [slot-tracking, refill, restock-session, frontend, migration, phase2, ui]
commits: [a3b8fc0]
---

# Slot Refill Tracking เฟส 2 — รอบจัดของ + สรุปการเติมจริง (UI)

ต่อจากเฟส 1 ([[2026-06-13-slot-refill-tracking-phase1]]) · ทำให้ admin ใช้งานบนเว็บได้ (2026-06-13)

## เฟส 1 vs เฟส 2 (ต่างกันยังไง)
- **เฟส 1** = หลังบ้านล้วน · scraper จด `slot_refill_events` ทุก sync (ไม่มีหน้าจอ)
- **เฟส 2** = หน้าจอให้ admin "ตีกรอบรอบจัดของ" + ดูสรุปว่าเติมอะไรเข้าตู้เท่าไหร่ + แก้ตัวเลขเอง

## สิ่งที่ทำ
1. **migration 049** — ตาราง `slot_restock_sessions` (bracket: machine_ids[], status open/closed, started_at/closed_at)
   - ไม่เปิด RLS (ตาม convention slot_products_history/slot_refill_events · frontend ใช้ anon key ตรง — verify แล้ว anon read/write ได้)
2. **supabase.js** (+7 ฟังก์ชัน) — start/close/cancel session, getOpen, getRestockSessions,
   getRefillEventsForSession, updateRefillEventQty, getLatestStockSyncedAt
3. **`RestockSessionPanel.jsx`** — คอมโพเนนต์ใหม่ ฝังในหน้า "สต็อกหน้าตู้" (PageMachineStockView)

## Flow การใช้งาน (why ออกแบบแบบนี้)
1. กด **"เริ่มรอบจัดของ"** เลือกตู้ → สร้าง session (status=open)
2. จัดของหน้าตู้จริง
3. กด **"จัดเสร็จ"** → สั่ง sync ตู้ (dispatch GitHub Actions) → **poll machine_stock จนข้อมูลใหม่มา** (~1-2 นาที) → ปิด session + stamp `session_id` ลง refill events ในกรอบ
4. ดู **ตารางสรุป** แยกตู้ (ก่อน/หลัง/ขาย/เติม · รวมเป็นซอง · box→×packs_per_box) · **แก้ qty_added เองได้** (manual_adjusted)

**จุดสำคัญที่ตัดสินใจ:**
- **ไม่ sync ตอน "เริ่ม"** — ใช้สต็อกล่าสุดเป็น baseline เพราะ `sold_between` หักยอดขายระหว่างนั้นคืนให้อยู่แล้ว → admin เริ่มได้เลยไม่ต้องรอ (เร็วกว่า + แม่นเท่ากัน)
- **ปิด session เฉพาะเมื่อ sync ใหม่มาถึงจริง** (poll จน machine_stock.synced_at เปลี่ยน) — กัน race: ถ้าปิดก่อน event มา closed_at จะตัด event ที่มาทีหลังออก → สรุปว่าง · ถ้า poll timeout ไม่ปิด ปล่อย session เปิดไว้ให้กดใหม่
- **stamp session_id** ลง event (ไม่ใช่ query window อย่างเดียว) → ประวัติรอบล็อคสมาชิกชัด + แก้ตัวเลขอ้าง event id ตรง

## ทดสอบ
- `npm run build` ผ่าน (คอมโพเนนต์ compile + import ครบ)
- **data-layer flow ครบผ่าน anon key** (จำลอง frontend เป๊ะ): create session → getOpen → preview 18 → close+stamp 18 → query by session_id 18 → แก้ qty → cleanup เหลือ 0/0
- ⚠️ ยังไม่ได้ click-test บน browser จริง (ปุ่ม/polling) — verify ตอนใช้งานจริงหน้าเว็บ

## งานค้างต่อ (เฟส 3)
- สรุป "ตัดสต็อกคลัง X ซอง/SKU รวมทุกรอบ" + **export Excel** ให้ admin ลงระบบคลัง (admin ใช้ Excel เป็นหลัก — [[project_actual_usage_scope]])
- (option) Print/PDF ใบสรุปรอบจัดของ

## 🔗 เกี่ยวข้อง
[[2026-06-13-slot-refill-tracking-phase1]] · [[project_slot_refill_tracking_design]] · [[project_slot_history_tracking]]
