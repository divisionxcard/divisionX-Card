# Cutoff Re-Seed · 6 พ.ค. 2026 — Playbook

**เป้าหมาย**: หลัง go-live 1 พ.ค. ระบบยังไม่ได้ seed opening balance · ตัดยอดที่เที่ยงคืน 5 พ.ค. (ห้างปิดเอง · ตู้หยุดเอง) · นับสต็อกครบทุก location · กรรมการเติมของให้ครบ Cotton · paste seed รอบ 2

---

## ก่อนเริ่ม — Pre-flight ก่อน 23:30

- [ ] **บีบ aofwara66 ให้ส่งจำนวนนับใน user stock ให้ครบ** (blocker หลัก)
- [ ] T (tueza5432) เตรียมนับ user stock ของตัวเอง
- [ ] กรรมการเตรียมนับ Main + เตรียมของจะเติม (cotton/box ที่จะเอามาใส่)
- [ ] DB rename `pornthep_sm1991` → `tueza5432`:
  - paste `00_rename_t_user.sql` ใน Supabase prod (ถ้ายังไม่ได้ทำ)

---

## Timeline 5 → 6 พ.ค.

### ⏰ 23:55 — Standby
- [ ] admin ทุกคน + กรรมการ standby
- [ ] เปิด Supabase SQL Editor (prod `xethnqqmpvlpmafvphky`) ค้างไว้

### ⏰ 00:00 — ห้างปิด
- ตู้หยุดเอง · ยอดขายนิ่ง

### ⏰ 00:05 — VMS Sync ครั้งสุดท้าย
- [ ] ที่เว็บ https://division-x-card.vercel.app/ → "สต็อกหน้าตู้" → กด **"ดึงข้อมูล VMS"**
- [ ] รอ ~1 นาที → กด Refresh

### ⏰ 00:10 — นับสต็อก
- [ ] **admin ทุกคน** (4 คน: aofwara66, mzadiz1989, power23n, tueza5432) นับ User stock ที่เหลือในมือ ณ ตอนนี้ → กรอกใน sheet `User_Stock`
- [ ] **กรรมการ** นับ Main stock (Cotton/Box) + ราคาทุน → กรอก `Main_Stock`
- [ ] Save Excel เป็น `cutoff_filled_20260506.xlsx`

### ⏰ 01:00 — Run Refill Report
```bash
cd backend/database/cutoff_20260506
py 03_excel_to_sql_v3.py cutoff_filled_20260506.xlsx
```
- ได้ไฟล์ `03a_refill_report.sql` + `03b_seed_v3.sql`

- [ ] paste `03a_refill_report.sql` ใน Supabase → **Run**
- [ ] ดู column `refill_packs` ต่อ SKU = "ต้องเติมเพิ่มกี่ packs"
- [ ] ส่งรายงานให้กรรมการเตรียมของเติม

### ⏰ 06:00-08:00 (เช้า 6 พ.ค.) — เติม + Seed
- [ ] กรรมการเติมของจริงตาม `refill_packs` (เติมเข้า Main · cotton/box)
- [ ] admin update sheet `Main_Stock` ใน Excel — main_packs ใหม่ = main_old + refill_packs
  - หรือ: full_cottons/full_boxes ใหม่ = หลังเติม
- [ ] Re-run `py 03_excel_to_sql_v3.py cutoff_filled_20260506.xlsx` → `03b_seed_v3.sql` รุ่นใหม่
- [ ] paste `02_reset_v3.sql` ใน Supabase → **Run** (truncate stock_in/out/transfers/claims · เก็บ sales)
- [ ] paste `03b_seed_v3.sql` ใน Supabase → **Run** (seed final)
- [ ] เห็น `Seed OK` = ผ่าน

### ⏰ 08:30 — Verify บนเว็บ
- [ ] เว็บ Dashboard — สต็อกรวม + ราคาทุน ตรงกับ Excel
- [ ] หน้า "สต็อกหน้าตู้" — ตรงกับ VMS
- [ ] หน้า "คงเหลือในมือ" — แต่ละ user ตรง
- [ ] กราฟกำไรไม่เป็น 0 (ราคาทุนใส่ครบ)

### ⏰ 09:30 — ห้างเปิด · ใช้งานปกติ
- ระบบพร้อม ทุก user เข้าใช้

---

## สูตรคำนวณ

```
total_now    = main + user + machine + sales(1-5)
target       = ceil(total_now / packs_per_cotton) × packs_per_cotton
refill_packs = target - total_now    ← กรรมการเติมเท่านี้

stock_in     = target  (ตอน seed · main_packs ใหม่ + user + machine + sales)
```

**ตัวอย่าง OP 13** (packs/cotton = 144):
- main=200, user=170, machine=400, sold=300 → total = 1,070
- target = ceil(1070/144) × 144 = 8 × 144 = 1,152
- refill = 82 packs

---

## ⚠ Risks & Rollback

### ถ้า aofwara66 ยังไม่ส่งภายใน 01:00
- Plan B: รัน 03a/03b โดยใส่ user_packs(aofwara66) = 0 ไว้ → seed คาๆ → admin add stock_transfer ของ aofwara66 ทีหลัง

### ถ้า Reset แล้วเจอ error ก่อน Seed
- เปลี่ยน `COMMIT;` เป็น `ROLLBACK;` ใน `02_reset_v3.sql` → Run ใหม่

### ถ้า Seed แล้ว balance ติดลบ (RAISE EXCEPTION)
- transaction rollback อัตโนมัติ
- ตรวจ Excel ว่าตัวเลขผิดมั้ย → แก้แล้วรันใหม่

### ถ้า rename T ผิดทาง
- `UPDATE profiles SET username='pornthep_sm1991' WHERE username='tueza5432';`

---

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | หน้าที่ |
|---|---|
| `00_rename_t_user.sql` | Pre-step · rename pornthep_sm1991 → tueza5432 |
| `02_reset_v3.sql` | Truncate stock_in/out/transfers/claims (เก็บ sales) |
| `03_excel_to_sql_v3.py` | Convert Excel → 03a + 03b SQL |
| `03a_refill_report.sql` | (auto-gen) SELECT ดู refill ต่อ SKU |
| `03b_seed_v3.sql` | (auto-gen) INSERT seed final |
| `cutoff_filled_20260506.xlsx` | Excel ที่ admin/กรรมการกรอก |

Excel template ใช้จาก `../golive_20260501/golive_template.xlsx` ได้เลย — แต่ใน `User_Stock` ต้อง:
- ลบ row `pornthep_sm1991` ทิ้ง (ถ้ามี)
- เพิ่ม row `tueza5432` แทน
