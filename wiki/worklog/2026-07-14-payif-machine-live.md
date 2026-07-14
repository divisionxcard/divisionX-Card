---
type: worklog
date: 2026-07-14
tags: [payif, vendos, machines, stock, live, iconsiam]
commits: [97217ae, 6c358ae]
status: pipeline live · รอทดสอบ save จริง 1 รอบ
---

# Payif ตู้แรก (ไอคอนสยาม) — pipeline live

## บริบท (why)
ต่อจาก [[2026-07-14-vendos-stock-scraper]] · dry-run ผ่านแล้ว (หลังแก้บั๊ก token)

## เคลียร์ชื่อแบรนด์ (สำคัญ)
- **Payif = ยี่ห้อตู้ (ฮาร์ดแวร์)** · **Vendos = ระบบพอร์ทัลจัดการ** (vendos.one) ที่ตู้ Payif ใช้
- → `machines.brand = 'payif'` · เปลี่ยนชื่อไฟล์ `vendos_* → payif_*` (prefix = brand เหมือน vms_/worldwide_)
- Vendos คงไว้เป็น portal/BASE url ในโค้ด

## บั๊กที่แก้
- login response ห่อ token ใน `data`: `{code,desc,data:{access_token}}` ไม่ใช่ top-level
  (api.js เขียน `resp.access_token` แต่ envelope จริงห่ออีกชั้น) → แก้อ่าน `data.access_token` (97217ae)

## สิ่งที่ทำ
- rename: `payif_stock_sync.py`, `payif_probe.py`, `payif-stock-sync.yml` · filter `brand='payif'`
- workflow เปลี่ยนเป็น **live + cron** (00:20 + 09:20 ไทย) + telegram FAIL alert (ลอก WW)
- **INSERT machines**: id=12 · `pf01` · brand=payif · location=ไอคอนสยาม · config.machine_id_vendor='208' · portal_url=vendos.one
  → เป็นตู้ที่ 12 (VMS 4 + WW 7 + Payif 1)

## ค้าง
1. กด Run workflow (live) 1 รอบ → ยืนยัน save 60 slots เข้า machine_stock + โผล่บนเว็บ
2. **sales scraper** — endpoint `/cc_api/shop/sales` เป็น summary ราย slot (ไม่มี timestamp) →
   ต้องดู `/cc_api/shop/order/{id}` (transaction) ตอนมีการขายจริง เพื่อ track ยอดขายเข้า sales table
3. ปุ่ม "ดึงข้อมูล Payif" บนเว็บ (ลอก route WW)

## 🔗 เกี่ยวข้อง
[[2026-07-14-vendos-stock-scraper]] · [[2026-07-13-vendos-brand-integration-plan]] · [[project_vendos_integration]] · [[project_ww_machines_status]]
