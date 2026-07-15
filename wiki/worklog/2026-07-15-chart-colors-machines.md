---
type: worklog
date: 2026-07-15
tags: [bugfix, frontend, charts, sales, ui]
commits: [e40e981]
---

# กราฟยอดขายแยกตู้ — ตู้ที่ 7+ เป็นสีดำ

## อาการ
หน้ายอดขาย "กราฟ 7 วันล่าสุด · แยกตู้" — ตู้ที่ 6-11 (wwv02-wwv07) แท่งเป็นสีดำหมด

## Root cause
`CHART_COLORS` มีแค่ **6 สี** แต่ตอนนี้มี **12 ตู้** (VMS4+WW7+Payif1)
`CHART_COLORS[i]` ตรง ๆ → index 6+ = `undefined` → recharts render เป็นดำ

## แก้
- `constants.js`: CHART_COLORS **6 → 14 สี** (บวก pink/lime/orange/teal/violet/yellow/sky/rose)
- ใช้ `CHART_COLORS[i % CHART_COLORS.length]` ทุกจุดที่ index ด้วยตู้/ลำดับ → วนสีไม่มีวัน undefined
  - PageSales (legend dot + bar), PageAnalytics (Top5 line) · PageMachineStockView มี modulo อยู่แล้ว

## หมายเหตุ
เพิ่มตู้เกิน 14 เมื่อไหร่ สีจะเริ่มวนซ้ำ (ไม่ดำ) — ถ้าต้องแยกชัดกว่านั้นค่อยเพิ่มพาเลต

## 🔗 เกี่ยวข้อง
[[project_ww_machines_status]] · [[project_vendos_integration]] (Payif = ตู้ที่ 12)
