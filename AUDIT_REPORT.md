# รายงาน Audit โค้ด — DivisionX Card
วันที่: 6 กรกฎาคม 2026 · ขอบเขต: ทั้ง repo (เน้น `deploy/` ซึ่งเป็นแอปจริงบน Vercel)

---

## 1) ช่องโหว่ความปลอดภัย (เรียงตามความร้ายแรง)

### 🔴 CRITICAL

**C1 — `/api/admin/users` ไม่มีการตรวจสอบสิทธิ์เลย**
ไฟล์ `deploy/app/api/admin/users/route.js` ใช้ **service_role key** (สิทธิ์สูงสุด ข้าม RLS ทั้งหมด) แต่ **ไม่เช็ค auth ใดๆ** ทั้ง GET/POST/PATCH/DELETE การป้องกันอยู่แค่ฝั่ง frontend (`PageUsers.jsx` ซ่อนหน้าถ้าไม่ใช่ admin) ซึ่งข้ามได้ง่าย ใครก็ตามที่รู้ URL สามารถ:
- `GET /api/admin/users` → ดึงรายชื่อผู้ใช้ + **อีเมลทุกคน**
- `POST` → สร้างบัญชี admin ใหม่
- `PATCH` → เลื่อนตัวเองเป็น admin
- `DELETE` → ลบผู้ใช้ทิ้ง

นี่คือ **account takeover เต็มระบบ** — ร้ายแรงที่สุด

**C2 — `/api/img` เป็น SSRF (Server-Side Request Forgery)**
ไฟล์ `deploy/app/api/img/route.js` รับพารามิเตอร์ `url` แล้ว `fetch(url)` ฝั่งเซิร์ฟเวอร์โดยไม่มี allowlist ผู้โจมตีสั่งให้เซิร์ฟเวอร์ Vercel ยิงไปที่ URL ใดก็ได้ (เช่น endpoint ภายใน, cloud metadata, ใช้เป็น open proxy ฟอกทราฟฟิก)

### 🟠 HIGH

**H1 — RLS (Row Level Security) เปิดไม่ครบ**
เปิด RLS แค่ ~10 ตาราง (skus, machines, profiles, machine_assignments, stock_transfers, ship_fails, slot_products_history ฯลฯ) แต่ตาราง **ธุรกรรมหลักยังไม่เปิด**: `sales`, `stock_in`, `stock_out`, `claims`, `machine_stock`, `login_history` เนื่องจาก `anon key` ถูกฝังในบันเดิลเบราว์เซอร์ (public) ใครก็อ่าน/เขียนข้อมูลยอดขาย-สต็อกตรงผ่าน Supabase REST ได้ นอกจากนี้บางตารางตั้ง policy `USING(true) WITH CHECK(true)` = user ธรรมดา (role=user) ก็เขียนทับได้

**H2 — Endpoint สั่ง sync ไม่มี auth**
`/api/vms-sync`, `/api/stock-sync`, `/api/worldwide-sync`, `/api/worldwide-stock-sync` ใครก็ POST มาสั่งรัน GitHub Actions ซ้ำๆ ได้ → เปลือง Actions minutes, สั่ง backfill/เขียนทับข้อมูลย้อนหลังได้

### 🟡 MEDIUM

**M1 — `/api/auth/lookup-email` เปิดเผยอีเมล**
รับ username คืน **อีเมลจริง** ใช้เดา username เพื่อเก็บอีเมลทีละคนได้ (PII enumeration) จำเป็นต่อ flow login ด้วย username จริง แต่ควรมี rate-limit

**M2 — ไฟล์ลับวางอยู่ใน working tree**
`Stock-Management-/nice-limiter-*.json` (Google service account key), `client_secret.json.json`, `backend/tools/.env`, `.gdrive_token.json`, `deploy/.env.local`, `.env.staging`, `Supabase Data.txt` — ทั้งหมด **gitignore แล้ว** และตรวจแล้วว่าไม่เคยถูก commit (ดี) แต่ยังเสี่ยงหลุดถ้าเผลอ commit หรือเครื่องถูกเข้าถึง ควรย้ายออกนอก repo และ **rotate key ที่เคยวางในโค้ด** (มี comment บอกว่า `scripts/gap_analysis.mjs` เคยฝัง service key)

### 🟢 LOW
- ไม่มี rate limiting บน API route ใดเลย
- `/api/img` cache ดีแต่ไม่มี allowlist (ซ้ำกับ C2)

---

## 2) โค้ดซ้ำซ้อน / ไฟล์ที่ควรลบ

| รายการ | ขนาด | หมายเหตุ |
|--------|------|---------|
| `divisionX-Card/` | **836 MB** | สำเนา repo เก่าทั้งชุดซ้อนใน repo (ไม่ track, ไม่ได้ build) — ลบได้ |
| `frontend/` | **470 MB** | เวอร์ชัน Next.js เก่า ถูกแทนด้วย `deploy/` แล้ว — ลบได้ |
| `.claude/worktrees/` | — | worktree ค้าง 2 ชุด (สำเนาซ้ำอีก) |
| `Stock-Management-/Y17F_...EXE` | **443 MB** | ไฟล์ .EXE ไม่เกี่ยวกับโปรเจกต์ |
| `deploy/backups/` | 6.3 MB | dump JSON 4 ชุด ควรเก็บนอก repo |
| `deploy/.claude-design-output/` | 2.4 MB | ไฟล์ scratch งานออกแบบ |
| `__pycache__/`, `.understand-anything/` | — | cache เครื่องมือ |
| `CLAUDE.md` + `CLAUDE_1.md` | — | เอกสารซ้ำ |

**Migration เลขชนกัน:** `022_add_machine_brand_config` กับ `022_update_v_stock_balance_with_transfers`, `024_*` สองไฟล์, `043_*` สองไฟล์ — เสี่ยงรันผิดลำดับ ควรตั้งเลขใหม่ให้ไม่ชน

รวมพื้นที่กู้คืนได้ทันที **~1.75 GB**

---

## 3) จุดที่ทำให้แอปช้า

1. **โหลดทุกตารางแบบไม่จำกัดตอนเปิดแอป** — `loadAll()` ใน `DivisionXApp.jsx` ดึง 12 ตารางพร้อมกัน (ดีที่ใช้ `Promise.all`) แต่ `getStockIn / getStockOut / getClaims / getSales` เป็น `select("*")` **ไม่มี `.limit()` ไม่มีกรองวันที่** → ข้อมูลโตเรื่อยๆ ตามเวลา ทำให้ first paint ช้าและ payload ใหญ่ขึ้นทุกวัน
2. **`select("*")` เกือบทุก query** — ดึงคอลัมน์ที่ไม่ได้ใช้มาด้วย
3. **Client bundle ก้อนใหญ่** — `DivisionXApp.jsx` 873 บรรทัด + ทุกหน้าเป็น client component โหลดพร้อมกัน
4. `getSalesByMachine` ทำ pagination ถูกต้องแล้ว (ดี) แต่ `getSales` (บรรทัด 547) ยังดึงทั้งก้อน

**แนะนำ:** ใส่ `.limit()` / กรอง 30–90 วันในลิสต์ประวัติ, ทำ "โหลดเพิ่ม", เลือกเฉพาะคอลัมน์ที่ใช้

---

## 4) สิ่งที่ควรปรับให้ใช้งานง่ายขึ้น

- **หน้ายาวไม่มี pagination** — ประวัติรับเข้า/เบิก/ขาย แสดงทุกแถวรวดเดียว ควรมีแบ่งหน้า/กรองช่วงวัน
- **สถานะโหลดข้ามหน้า** — ควรมี skeleton/empty state ให้ครบทุกหน้า (บางหน้ามีแล้ว)
- **ปุ่ม sync ไม่บอกสิทธิ์** — หลังแก้ auth ควรซ่อน/บอกเหตุผลถ้าไม่มีสิทธิ์
- **ข้อความ error ดิบ** — บาง toast โชว์ `err.message` ตรงๆ ควรแปลงเป็นข้อความที่ผู้ใช้เข้าใจ
- **หน้า "ไม่มีสิทธิ์" ของ PageUsers** เป็น client-side gate อย่างเดียว (เชื่อมโยงกับ C1)

---

---

# ✅ สรุปการแก้ไข (ดำเนินการแล้ว)

## ข้อ 1 — ความปลอดภัย
- เพิ่มไฟล์ `deploy/lib/apiAuth.js` (`requireUser` / `requireAdmin`) และ `deploy/lib/authFetch.js`
- `/api/admin/users` — ทุก method ต้องเป็น admin + กัน admin ลบตัวเอง · `PageUsers.jsx` ส่ง token แล้ว
- `/api/img` — จำกัด https + allowlist `vms.inboxcorp.co.th`, `api.inboxcorp.co.th` (ปิด SSRF)
- `/api/vms-sync`, `/api/stock-sync`, `/api/worldwide-sync`, `/api/worldwide-stock-sync` — ต้อง login · ปรับ client 3 ไฟล์ให้ส่ง token
- เพิ่ม migration `053_rls_transactional_tables.sql` — **รอรันบน Supabase + ทดสอบ staging**
- 🔧 ต้องทำเอง: rotate Google service account key (`nice-limiter-*.json`)

## ข้อ 2 — ลบไฟล์ซ้ำ
- ลบ `divisionX-Card/`, `frontend/`, `.EXE` 443MB, `deploy/backups/`, `deploy/.claude-design-output/`, `.understand-anything/`, `__pycache__/` → คืนพื้นที่ ~1.75GB
- เพิ่ม `backend/database/migrations/README.md` บันทึกเลข migration ที่ชน + กติกาเริ่ม 054

## ข้อ 3 — Performance
- ตรวจแล้ว: DB มี index ครบเกือบหมด · ช่องว่างจริงคือ `stock_in` เรียงตาม `created_at` แต่ไม่มี index
- เพิ่ม migration `054_perf_stock_in_created_at_index.sql` (zero-risk) — **รอรันบน Supabase**
- หมายเหตุ: จำกัดจำนวนแถว stock_in/stock_out ฝั่ง client ไม่ได้ เพราะหน้าเบิกใช้คำนวณยอด Lot คงเหลือจากประวัติทั้งหมด (แนะนำ lazy-load หน้ายอดขายเป็น follow-up ที่ต้องทดสอบ)

## ข้อ 4 — UX
- หน้า "ประวัติการรับ" (`PageStock.jsx`) แสดงทีละ 50 แถว + ปุ่ม "แสดงเพิ่ม" (กันหน้าอืดเมื่อข้อมูลเยอะ)

**ต้องทำเองก่อน production:** รัน migration 053 + 054 บน Supabase (ทดสอบ staging ก่อน), rotate service key, แล้ว push ขึ้น `main` เพื่อให้ Vercel deploy
