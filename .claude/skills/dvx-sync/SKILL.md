---
name: dvx-sync
description: ใช้เมื่อต้อง sync ข้อมูลจากตู้, backfill ยอดขายย้อนหลัง, ตัวเลขไม่ตรง/ข้อมูลไม่เข้า, หรือแก้ไข GitHub Actions workflow
---

# Sync ข้อมูลจากตู้ · Backfill · ตรวจตัวเลข

## ตารางเวลาจริง (cron เป็น UTC — เวลาไทย = +7)

| UTC | เวลาไทย | workflow | ทำอะไร |
|---|---|---|---|
| 17:00 | **00:00** | `vms-sync` | ยอดขาย VMS เมื่อวาน |
| 17:05 | 00:05 | `vms-stock-sync` | สต็อกหน้าตู้ VMS |
| 17:10 | 00:10 | `worldwide-sync` | ยอดขาย WW |
| 17:15 | 00:15 | `worldwide-stock-sync` | สต็อกหน้าตู้ WW |
| 17:15 | 00:15 | `payif-sync` | ยอดขาย payif |
| 17:20 | 00:20 | `payif-stock-sync` | สต็อกหน้าตู้ payif |
| 20:00 | 03:00 | `refill-recompute` | ซ่อม `slot_refill_events` ที่คำนวณพลาด |
| 02:00 | 09:00 | `stock-low-alert` | แจ้งเตือนของใกล้หมด |
| 04:30 | 11:30 | `restock-guard` | เตือนเตรียมของไปเติม |

**ลำดับสำคัญ: ยอดขายต้องมาก่อนสต็อกเสมอ** เพราะ `slot_refill_events` ใช้ `sold_between`
มาคำนวณ `qty_added` — ถ้ายอดขายยังไม่เข้า ตัวเลขการเติมจะต่ำกว่าจริง
(ทุก stock-sync มี pre-step ดึงยอดขาย 2 วันย้อนหลังก่อน แบบ `continue-on-error`)

## ⚠️ GitHub cron ไม่ตรงเวลา — วัดแล้ว **สาย 100% ของรอบ เฉลี่ย 234 นาที**

อย่าออกแบบอะไรที่พึ่ง "workflow A จะรันก่อน workflow B" เพราะเรียงเวลาไว้ 5 นาที — ไม่จริง
วิธีรับมือที่ใช้อยู่:
1. แต่ละ stock-sync ดึงยอดขายเองก่อน (ไม่รอ workflow อื่น)
2. `refill-recompute` รันทุกวันคอยซ่อมย้อนหลังอีกชั้น

## สั่ง sync เอง

**วิธีที่ง่ายที่สุด — บอกเจ้าของกดปุ่มบนเว็บ**
หน้า "สต็อกหน้าตู้" มีปุ่ม "ดึงข้อมูล VMS / WW / Payif" · กดทีเดียว sync ทุกตู้ในแบรนด์นั้น
(ตู้ใหม่รวมอัตโนมัติ) ใช้เวลา ~1-2 นาที ทำงานแบบ async

**trigger workflow จาก CLI**
ต้องใช้ `GH_PAT` ใน `deploy/.env.local` — ⚠️ **git credential (`gho_...`) ใช้กับ API ไม่ได้**
มีตัวอย่างที่ `scripts/trigger-ww-backfill.ps1` และ `deploy/agents/trigger_workflow.py`

## Backfill ยอดขายย้อนหลัง

GitHub Actions → เลือก workflow ยอดขาย → Run workflow → ใส่ `from_date` + `to_date`

**❗ ห้ามเกิน 5 วันต่อครั้ง** — XLSX ที่ VMS ส่งกลับมาจะถูกตัดถ้าข้อมูลเยอะ
และมันตัดแบบเงียบ ๆ ไม่มี error → ได้ข้อมูลไม่ครบโดยไม่รู้ตัว

ถ้ายอดไม่ตรง → ไล่ทีละวัน → ถ้ายังไม่ตรงให้เจ้าของโหลด XLSX จาก VMS เองแล้ว import

## ตรวจว่า sync เข้าจริงไหม

```
machine_stock?select=machine_id,synced_at&order=synced_at.desc      ← ตู้ไหน sync ล่าสุดเมื่อไหร่
machine_stock?sku_id=is.null&select=machine_id,slot_number,product_name
                                                                     ← ช่องที่ map ไม่ติด
sales?sku_id=is.null                                                 ← ยอดขายที่ map ไม่ติด
```
`product_name = null` = ช่องเปล่าจริง ไม่ใช่ปัญหา (ปกติมีที่ตู้ chukes ช่อง 010/020)

⚠️ ตารางพวกนี้เกิน 1000 แถวได้ — **ต้องแบ่งหน้า** (ดู `dvx-db`)

## Sales API vs Playwright

VMS มี 2 ทาง: API (`vms_sales_api.py`) กับ Playwright (`vms_scraper.py`)
เคยโดน block 403 เลยเขียน Playwright ไว้ ตอนนี้ API ใช้ได้แล้วและระบบ **fallback อัตโนมัติ**
ถ้า API ล้ม → ไม่ต้องแก้อะไร

## เกี่ยวข้อง
`dvx-db` · `dvx-sku` · `dvx-machine`
