# Staging Setup — DivisionX Card

คู่มือตั้งค่า staging project สำหรับทดสอบ RLS phase-by-phase ก่อน deploy prod

## Staging project info

- **Project URL:** `https://dorixlcllcjszexshlwo.supabase.co`
- **Project ref:** `dorixlcllcjszexshlwo`
- **Region:** Southeast Asia (Singapore)
- **Plan:** Free
- **วัตถุประสงค์:** ทดสอบ RLS ทีละ phase ก่อนแตะ prod

## ⚠️ Security

- `service_role` key ของ staging อย่าแชร์/commit
- Staging ไม่มี data จริง (mock ล้วน) — risk ต่ำ แต่ยังต้องระวัง
- ถ้ากังวลว่า key หลุด → Dashboard → Settings → API → Reset service_role key

## ขั้นตอน Setup ครั้งแรก (~15-20 นาที)

### Step 1A — สร้าง profiles table (staging เท่านั้น)

1. เปิด staging Supabase → **SQL Editor** → New query
2. Copy เนื้อหาจาก `backend/database/staging/000_profiles_for_staging.sql`
3. Paste → **Run**

(ไฟล์นี้สร้างตาราง `profiles` + trigger auto-create บน signup — prod มีอยู่แล้วไม่ต้องรัน)

### Step 1B — รัน schema bundle (migrations 001-022 รวม)

1. SQL Editor → New query
2. Copy เนื้อหาจาก `backend/database/staging/_bundled_migrations_001-022.sql` **ทั้งหมด** (~613 บรรทัด)
3. Paste → **Run**

> 💡 **Tip**: ถ้าติด error "already exists" ที่บาง object — ข้าม ไม่ใช่ปัญหา (idempotent block)
> ถ้าติด error "does not exist" ที่ทำให้ run หยุด → แจ้งผม

### Step 2 — สร้าง test auth users (4 คน)

ใน staging Dashboard:
- **Authentication → Users → Add user → Create new user**

สร้าง 4 คน:
| Email | Password | Role ที่จะ set ใน seed |
|---|---|---|
| admin1@test.local | test1234 | admin |
| admin2@test.local | test1234 | admin |
| user1@test.local  | test1234 | user |
| user2@test.local  | test1234 | user |

> ⚠️ อย่าลืม uncheck "Auto Confirm User" ไม่ได้ — ตั้งให้ confirm อัตโนมัติจะง่ายที่สุด

### Step 3 — รัน seed data

1. SQL Editor → New query
2. Copy จาก `backend/database/staging/seed_staging.sql`
3. Run

ตรวจผล:
```sql
SELECT role, display_name FROM profiles ORDER BY role DESC;
-- ควรเห็น 4 rows: 2 admin + 2 user

SELECT COUNT(*) FROM stock_in;         -- 3
SELECT COUNT(*) FROM stock_transfers;  -- 4
SELECT COUNT(*) FROM stock_out;        -- 3
SELECT COUNT(*) FROM claims;           -- 2
```

### Step 4 — เชื่อม local dev ชี้ staging (ไม่บังคับ)

ถ้าอยาก test หน้าเว็บจริง ๆ กับ staging DB:

1. สร้างไฟล์ `deploy/.env.staging` (gitignored):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://dorixlcllcjszexshlwo.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key ของ staging>
   ```
2. รัน `npm run dev` โดย set env var ชั่วคราว:
   ```bash
   cp deploy/.env.local deploy/.env.local.backup
   cp deploy/.env.staging deploy/.env.local
   cd deploy && npm run dev
   # ทดสอบเสร็จแล้วกลับ prod:
   cp deploy/.env.local.backup deploy/.env.local
   ```

หรือง่ายกว่า — ทดสอบผ่าน SQL Editor ตรง ๆ โดยไม่ต้องเปิดหน้าเว็บ

---

## Phase A — RLS บน reference tables

### Apply

1. เปิดไฟล์ `backend/database/migrations/023_rls_phase_a.sql`
2. Copy-paste → SQL Editor ของ staging → Run
3. ไม่มี error = ผ่าน ✓

### ทดสอบ Phase A

**Test 1: service_role bypass (GHA sync ยังทำงานได้)**

ใน SQL Editor (default รันเป็น postgres/service_role) ลอง:
```sql
SELECT * FROM skus;          -- ควรเห็นทุก row
INSERT INTO skus (sku_id, name, series, packs_per_box) VALUES ('TEST 99', 'rls test', 'OP', 24);
DELETE FROM skus WHERE sku_id = 'TEST 99';
```
ถ้าทั้ง 3 คำสั่งสำเร็จ → service_role ไม่ติด RLS ✓

**Test 2: admin permission**

SQL Editor → เปลี่ยน role ด้วย:
```sql
-- สวมบทบาท admin1 ทดสอบ
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"<uuid ของ admin1>","role":"authenticated"}';

SELECT * FROM skus;       -- ควรเห็นทุก row ✓
INSERT INTO skus (sku_id, name, series, packs_per_box) VALUES ('TEST 99', 'rls test', 'OP', 24);
-- ควรสำเร็จ ✓
DELETE FROM skus WHERE sku_id = 'TEST 99';

RESET ROLE;
```

> หา `<uuid>` ได้จาก `SELECT id FROM auth.users WHERE email='admin1@test.local';`

**Test 3: user permission (ควรจำกัด)**

```sql
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"<uuid ของ user1>","role":"authenticated"}';

SELECT * FROM skus;       -- ควรเห็นทุก row ✓
INSERT INTO skus (sku_id, name, series, packs_per_box) VALUES ('TEST 99', 'rls test', 'OP', 24);
-- ❌ ควร error: "new row violates row-level security policy"

RESET ROLE;
```

ถ้าทั้ง 3 test ผ่าน → Phase A **สำเร็จบน staging**

### Apply Phase A บน prod

1. สำรองคำสั่ง rollback ไว้ (แท็บใหม่ใน SQL Editor):
   ```sql
   -- /* เตรียมไว้ใช้ถ้าเว็บพัง */
   -- ใส่เนื้อหาจาก 023_rls_phase_a_rollback.sql
   ```
2. รัน `023_rls_phase_a.sql` บน prod SQL Editor (ช่วงเย็นวันธรรมดา, กิจกรรมน้อย)
3. เปิดหน้าเว็บ login เข้าไป → เช็คว่าทุกอย่างโหลดได้
4. ถ้าพังทันที → กด Run rollback ทันที (~1 นาที)
5. ถ้าผ่าน → ปล่อย soak 2-3 วัน ก่อนไป Phase B

### Rollback (ถ้าเกิดปัญหา)

รัน `023_rls_phase_a_rollback.sql` บน prod SQL Editor → policy กลับเป็น `allow_all_*` เหมือนเดิม

---

## ถัดไป

- Phase B: stock_out, stock_transfers, claims (ownership) — รอ ~3-5 วันหลัง Phase A stable
- Phase C: stock_in, sales (financial) — สำคัญมาก เพราะกระทบ dashboard
- Phase D: login_history, machine_stock — สั้น ๆ

คู่มือแต่ละ phase จะทยอยเพิ่ม
