# Verification Checklist — Cutoff Re-Seed คืน 5/6 → 5/7

> ใช้คืนวันที่ 5/6 (หลังเที่ยงคืน 5/7) · paste แต่ละ block ใน Supabase SQL Editor (prod)
> URL ตรวจ: https://supabase.com/dashboard/project/xethnqqmpvlpmafvphky/sql

---

## 🟡 PHASE 1 — Pre-Cutoff Verification (ก่อน TRUNCATE)

### Step 1A — Sales daily totals 1-6

```sql
SELECT
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_date,
  COUNT(*) AS rows,
  COUNT(DISTINCT transaction_id) AS unique_txn,
  SUM(quantity_sold) AS packs,
  SUM(grand_total) AS revenue
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-07 00:00:00+07'::timestamptz
GROUP BY 1 ORDER BY 1;
```

**ตรวจ:**
- ควรเห็น 6 rows (1, 2, 3, 4, 5, 6 พ.ค.)
- เปรียบเทียบ revenue per day กับ VMS portal "ยอดสุทธิ" → ตรงเป๊ะ

### Step 1B — Sales per machine per day (cross-check VMS portal)

```sql
SELECT
  DATE(sold_at AT TIME ZONE 'Asia/Bangkok') AS sale_date,
  machine_id,
  COUNT(*) AS rows,
  SUM(quantity_sold) AS packs,
  SUM(grand_total) AS revenue
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-07 00:00:00+07'::timestamptz
GROUP BY 1, 2 ORDER BY 1, 2;
```

**ตรวจ:** เปิด VMS portal → filter วันละตู้ → เทียบ revenue 24 ตัวเลข
- ถ้าตรงทั้งหมด ✅ → proceed
- ถ้าไม่ตรง ⚠️ → flag ก่อน paste seed

### Step 1C — Duplicate sale_keys (ห้ามมี)

```sql
SELECT sale_key, COUNT(*) AS dup_count
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-07 00:00:00+07'::timestamptz
GROUP BY sale_key
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;
```

**ผลคาดหวัง:** 0 row · ถ้ามี = bug ใน scraper · ต้องแก้ก่อน proceed

### Step 1D — Box vs Pack detection

```sql
SELECT
  sku_id,
  COUNT(*) FILTER (WHERE quantity_sold = 1)  AS pack_orders,
  COUNT(*) FILTER (WHERE quantity_sold > 1)  AS box_orders,
  STRING_AGG(DISTINCT quantity_sold::text, ', ') AS qty_values,
  SUM(quantity_sold)                         AS total_packs
FROM sales
WHERE sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND sold_at <  '2026-05-07 00:00:00+07'::timestamptz
  AND sku_id IS NOT NULL
GROUP BY sku_id ORDER BY sku_id;
```

**ตรวจ:**
- OP/EB box_orders → qty_values ควรมี `24` (= 1 box = 24 packs)
- PRB box_orders → qty_values ควรมี `10`
- ถ้าเจอเลขแปลก เช่น 12 หรือ 20 → bug (mapping ผิด)

### Step 1E — machine_stock fresh

```sql
SELECT
  COUNT(*) FILTER (WHERE remain > 0) AS slots_with_stock,
  SUM(CASE
    WHEN product_name ILIKE '%box%' AND sku_id LIKE 'PRB%' THEN remain * 10
    WHEN product_name ILIKE '%box%' THEN remain * 24
    ELSE remain
  END) FILTER (WHERE sku_id IS NOT NULL) AS total_packs_real,
  MAX(synced_at AT TIME ZONE 'Asia/Bangkok') AS latest_sync
FROM machine_stock;
```

**ตรวจ:**
- `latest_sync` ควรใกล้เวลาตอนนี้ (เพิ่ง sync เมื่อ 00:05)
- ถ้า latest_sync เก่า > 5 นาที → กดปุ่ม VMS sync ใหม่

### Step 1F — claims ค้างก่อน TRUNCATE (review)

```sql
SELECT id, machine_id, sku_id, quantity, refund_amount, product_status,
       confirm_status, reason, claimed_at
FROM claims
ORDER BY claimed_at DESC;
```

**ตรวจ:** ดูว่ามี claim pending ที่ลูกค้าค้างจัดการมั้ย · ถ้ามี → backup ก่อน TRUNCATE

---

## 🔴 PHASE 2 — TRUNCATE + SEED

### Step 2A — TRUNCATE (ลบของเก่า)

```sql
BEGIN;

TRUNCATE TABLE
  stock_in,
  stock_out,
  stock_transfers,
  claims
RESTART IDENTITY;

UPDATE skus SET avg_cost = 0, cost_price = 0;

DO $$
DECLARE v_count INT; v_table TEXT; v_sales INT; v_machine INT;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY['stock_in','stock_out','stock_transfers','claims'])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', v_table) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'Reset failed: % still has % rows', v_table, v_count;
    END IF;
  END LOOP;
  SELECT COUNT(*) INTO v_sales FROM sales;
  SELECT COUNT(*) INTO v_machine FROM machine_stock WHERE sku_id IS NOT NULL AND remain > 0;
  RAISE NOTICE 'Reset OK · sales=% · machine=% slots', v_sales, v_machine;
END $$;

COMMIT;
```

**ผลคาดหวัง:** Notice "Reset OK · sales=X · machine=Y slots"

### Step 2B — paste seed file

paste ทั้งไฟล์ `03b_seed_v3.sql` ที่ converter generate

**ผลคาดหวัง:** Notice "Seed OK"

### Step 2C — UPDATE cost_price (เผื่อ converter ตอนแรก gen แค่ avg_cost)

paste อันนี้เพื่อชัวร์:

```sql
-- Sync cost_price = avg_cost ทุก SKU
UPDATE skus SET cost_price = avg_cost WHERE avg_cost > 0;
```

---

## 🟢 PHASE 3 — Post-Seed Verification

### Step 3A — Balance ทุก SKU

```sql
SELECT * FROM v_stock_balance ORDER BY sku_id;
```

**ตรวจ:**
- balance >= 0 ทุก SKU
- balance ของแต่ละ SKU = main_packs ใน Excel ที่ admin กรอก
- cost_price > 0 ทุก SKU

### Step 3B — User holdings ตรงกับ Excel

```sql
SELECT p.username, st.sku_id,
       SUM(st.quantity_packs) AS transferred,
       COALESCE(SUM(so.quantity_packs) FILTER (
         WHERE so.withdrawn_by_user_id = p.id), 0) AS withdrawn,
       SUM(st.quantity_packs) - COALESCE(SUM(so.quantity_packs) FILTER (
         WHERE so.withdrawn_by_user_id = p.id), 0) AS holding_now
FROM stock_transfers st
JOIN profiles p ON p.id = st.to_user_id
LEFT JOIN stock_out so ON so.sku_id = st.sku_id AND so.withdrawn_by_user_id = p.id
GROUP BY p.username, st.sku_id, p.id
ORDER BY p.username, st.sku_id;
```

**ตรวจ:** holding_now per (user, sku) ตรงกับ Excel User_Stock

### Step 3C — Machine balance per machine per SKU

```sql
SELECT m.machine_code, so.sku_id,
       SUM(so.quantity_packs) AS loaded,
       COALESCE(SUM(s.quantity_packs), SUM(s.quantity_sold), 0) AS sold,
       SUM(so.quantity_packs) - COALESCE(SUM(s.quantity_sold), 0) AS in_machine_now
FROM stock_out so
JOIN machines m ON m.id = so.machine_id
LEFT JOIN sales s ON s.machine_id = so.machine_id AND s.sku_id = so.sku_id
  AND s.sold_at >= '2026-05-01 00:00:00+07'::timestamptz
  AND s.sold_at <  '2026-05-07 00:00:00+07'::timestamptz
GROUP BY m.machine_code, so.sku_id
ORDER BY m.machine_code, so.sku_id;
```

**ตรวจ:** in_machine_now ≈ machine_stock.remain (with box conversion)

### Step 3D — lot_number ครบ

```sql
SELECT
  COUNT(*) AS total,
  COUNT(lot_number) AS with_lot,
  COUNT(*) - COUNT(lot_number) AS missing
FROM stock_in;
```

**ตรวจ:** missing = 0 · ถ้า > 0 ต้อง UPDATE lot_number

```sql
SELECT
  COUNT(*) AS total,
  COUNT(lot_number) AS with_lot,
  COUNT(*) - COUNT(lot_number) AS missing
FROM stock_out;
```

**ตรวจ:** missing = 0

### Step 3E — Dashboard verification (manual)

เปิด https://division-x-card.vercel.app/ → ภาพรวม:
- มูลค่าสต็อก Main = ตรงกับ Excel × cost
- มูลค่าสต็อกรวมทุก User > 0
- มูลค่าสต็อกตู้ ≈ machine_stock × avg_cost
- กราฟ "ยอดขาย" แสดง 1-6 พ.ค.

---

## ⚠ Rollback (ถ้าเจอปัญหาก่อน Phase 2 COMMIT)

ใน Phase 2A · เปลี่ยน `COMMIT;` → `ROLLBACK;` · run ใหม่ → state กลับเดิม

ใน Phase 2B · ถ้า seed fail (RAISE EXCEPTION) · transaction auto rollback · แก้ Excel แล้ว run ใหม่

---

## Checklist (tick ขณะทำ)

### Phase 1 — Pre-Cutoff
- [ ] 1A Sales daily totals 1-6 (compare VMS portal)
- [ ] 1B Sales per machine (24 ตัวเลข cross-check)
- [ ] 1C Duplicate sale_keys = 0
- [ ] 1D Box vs Pack detection ปกติ
- [ ] 1E machine_stock fresh sync
- [ ] 1F Review claims (backup ถ้าจำเป็น)

### Phase 2 — TRUNCATE + SEED
- [ ] 2A TRUNCATE → "Reset OK"
- [ ] 2B Paste seed → "Seed OK"
- [ ] 2C UPDATE cost_price (sync from avg_cost)

### Phase 3 — Post-Seed
- [ ] 3A Balance ทุก SKU >= 0 + ตรง Excel
- [ ] 3B User holdings ตรง Excel
- [ ] 3C Machine balance ≈ machine_stock
- [ ] 3D lot_number ครบ
- [ ] 3E Dashboard verification (เปิดเว็บดู)

ถ้าครบทุก ✅ = ระบบ clean state · พร้อมใช้งาน 5/7
