---
type: stock_event
event: stock_reset
date: YYYY-MM-DD
operator: ชื่อผู้ดำเนินการ
approved_by: ชื่อผู้อนุมัติ
scope: full|partial   # full = reset ทั้งหมด, partial = บาง SKU/ตู้
baseline_date: YYYY-MM-DD   # วันที่จะให้ agent นับ trend จากวันนี้ขึ้นไป
status: planned|in_progress|completed
---

# Stock Reset · YYYY-MM-DD

## 🎯 เหตุผล
(อธิบายว่าทำไมต้อง reset — เช่น ตรวจนับจริงพบส่วนต่าง, เปลี่ยน supplier, เริ่มปีบัญชีใหม่)

## 📋 ขอบเขต

### SKU ที่ได้รับผลกระทบ
- [[SKU-A]] — เหตุผล
- [[SKU-B]] — เหตุผล

### ตู้ที่ได้รับผลกระทบ
- [[chukes01]] — เหตุผล
- [[chukes04]] — เหตุผล

## 🔢 ข้อมูลก่อน Reset

| Metric | ก่อน |
|--------|------|
| Total stock (ทุก SKU, ทุกตู้) | XX,XXX ซอง |
| Avg cost ของ SKU หลัก | ฿XXX |
| Snapshot ใน | [[pre-reset-YYYY-MM-DD]] |

## 🔧 วิธีการ Reset

```
□ Backup database (pg_dump)
□ บันทึก stock adjustment ผ่าน UI (ไม่ใช่ SQL ตรง)
□ Verify avg_cost ถูก recalculate ทุก SKU
□ Update skus.config.baseline_date = YYYY-MM-DD
□ รัน agent รอบแรก → verify ตัวเลข
```

## 📈 ผลที่คาดหวัง (12 สัปดาห์)

- สัปดาห์ 1: trend% ไม่มีความหมาย (post-reset stabilization)
- สัปดาห์ 2-4: เริ่มมี baseline ใหม่
- สัปดาห์ 5+: ระบบ stable, trend คำนวณตามปกติ

## 🔗 เชื่อมโยง

- ก่อน reset: [[pre-reset-YYYY-MM-DD]]
- รายงานวันแรกหลัง reset: [[YYYY-MM-DD-chukes01]] (รออัปเดต)
- รายงานสรุปหลัง 30 วัน: [[YYYY-MM-post-reset-summary]] (รออัปเดต)

## 📝 Notes สำหรับ LLM Agent

> **สำคัญ:** หลัง reset 7 วันแรก — ไม่ต้อง flag trend ผิดปกติ
> baseline ใหม่ยังก่อตัวไม่เสร็จ
