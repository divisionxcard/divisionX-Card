---
name: dvx-db
description: ใช้เมื่อต้อง query หรือแก้ข้อมูลใน Supabase, สร้าง migration, ตรวจตัวเลขว่าถูกไหม, หรือเขียน API route ที่อ่านข้อมูลจำนวนมาก
---

# เข้าถึงและแก้ข้อมูล Supabase

## ⚠️ กับดักที่ทำให้ตัวเลขผิดแบบเงียบ ๆ — PostgREST คืนมาแค่ 1000 แถว

**เคยทำให้รายงานยอดขายแสดง 286,260 บาท ทั้งที่จริง 368,230 บาท — ไม่มี error ไม่มีคำเตือน**

ทุกครั้งที่ query ตารางที่อาจเกิน 1000 แถว (`sales`, `machine_stock`, `slot_refill_events`)
**ต้องแบ่งหน้าเสมอ**:

```js
const PAGE = 1000
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) return out
  }
}
```
ฝั่ง Python ใช้ header `Range: 0-999`, `1000-1999`, ... วนจนได้น้อยกว่าที่ขอ
(`deploy/agents/dvx_data.py` → `sb_get()` ทำไว้แล้ว ใช้ตัวนั้นได้เลย)

**สัญญาณว่าโดน:** ผลลัพธ์ได้ 1000 พอดี — ไม่ใช่เรื่องบังเอิญ

### ⚠️ `.limit(5000)` **ไม่ได้กัน** — ดูเหมือนกันแต่ไม่กัน

`max-rows` ของ PostgREST ครอบทับ `.limit()` เสมอ ขอ 5000 ก็ได้ 1000 อยู่ดี
ทดสอบจริง 25 ส.ค. 2026 กับ `sales` 30 วัน (4,730 แถว) → ได้กลับมา 1,000 แถว ไม่มี error

โค้ดที่เขียน `.limit(5000)` ไว้ **อันตรายกว่าไม่เขียนอะไรเลย** เพราะคนอ่านจะคิดว่ากันไว้แล้ว
เคสจริง: `skuPicker.js` จัดอันดับซองขายดีจากข้อมูล 21% → อันดับผิดทุกอันดับ
โปสเตอร์เชียร์ OP 16 ว่าขายดีสุดมาตลอด ทั้งที่จริงคือ OP 13

**ฝั่ง JS ใช้ตัวกลางที่มีอยู่แล้ว ห้ามเขียนวนเอง:**
```js
import { fetchAll } from "@/lib/fetchAll"        // deploy/lib/fetchAll.js
const rows = await fetchAll(() => db.from("sales").select("sku_id").gte("sold_at", since))
```
⚠️ ต้องส่ง**ฟังก์ชันที่สร้าง query ใหม่ทุกครั้ง** ไม่ใช่ตัว query สำเร็จรูป —
`PostgrestBuilder` ใช้ซ้ำไม่ได้ (await แล้วจบไปเลย เรียก `.range()` ทับรอบสองไม่ทำงาน)

**นับจำนวนแถวจริงโดยไม่ต้องดึงข้อมูล:**
```
Range: 0-0  +  Prefer: count=exact   → อ่านตัวเลขท้าย Content-Range
```

## ต่อฐานข้อมูลยังไง

service key อยู่ใน `deploy/.env.local` (gitignored):
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY      ← ตัวนี้ ข้าม RLS ได้
```

Python one-liner ที่ใช้ได้เลย:
```python
import json, pathlib, urllib.request
env = {}
for line in pathlib.Path("deploy/.env.local").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1); env[k.strip()] = v.strip()
url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
     "Prefer": "return=representation"}
def req(method, path, body=None):
    r = urllib.request.Request(f"{url}/rest/v1/{path}", method=method, headers=H,
                               data=json.dumps(body).encode() if body else None)
    return json.load(urllib.request.urlopen(r))
```

**บน Windows ต้องใส่ `PYTHONIOENCODING=utf-8`** ไม่งั้น print ภาษาไทยจะพังด้วย `cp1252`
รันผ่าน Bash tool: `PYTHONIOENCODING=utf-8 py -3 - <<'EOF' ... EOF`

## ชื่อตารางและคอลัมน์จริง (เดาผิดบ่อย)

```
machine_stock   machine_id, slot_number, product_name, sku_id, remain
                ← ชื่อ "machine_stock" ไม่ใช่ slot_products
sales           machine_id, sku_id, product_name_raw, quantity_sold, grand_total,
                sold_at (UTC!), synced_at, slot_number, sale_key, transaction_id, product_id
                ← ชื่อสินค้าคือ product_name_raw ไม่ใช่ product_name
skus            sku_id, name, canonical_sku, packs_per_box, boxes_per_cotton,
                sell_price, cost_price, avg_cost(=0 ไม่ใช้แล้ว), franchise, series, is_active
machines        machine_id, name, location, status, brand, config(jsonb)
                ← ไม่มีคอลัมน์ updated_at บน production ห้ามใส่ใน UPDATE
```

ไม่แน่ใจว่าคอลัมน์อะไรบ้าง → `GET /rest/v1/<table>?limit=1` แล้วดู keys
(อย่าไปเดาจากไฟล์ migration — บาง migration ไม่เคยถูกรันบน production)

## แก้ข้อมูล: PostgREST vs Migration

| สถานการณ์ | ใช้อะไร |
|---|---|
| INSERT/UPDATE ข้อมูล (เพิ่ม SKU, แก้ตู้, เติม sku_id ที่ค้าง) | **PostgREST ตรง** — ทำเองได้ทันที |
| เปลี่ยน schema (เพิ่มคอลัมน์/ตาราง/index) | **migration file** — เจ้าของต้องเอาไปรันเองใน SQL Editor |

migration: `backend/database/migrations/NNN_ชื่อ.sql` (ล่าสุดคือ 061)
เขียนไฟล์แล้ว**บอกเจ้าของให้ไปรันเอง** อย่าคิดว่ารันแล้ว — รอให้ตอบกลับว่า "Success" ก่อนค่อยไปต่อ

## กับดักอื่น

**batch insert ต้องมี key ครบเท่ากันทุก object** — ถ้า object นึงขาด key จะได้ 400
`All object keys must match` → normalize ทุกแถวผ่าน tuple ของ field ก่อนส่ง

**embed ที่มี FK สองเส้น ต้องระบุชื่อ constraint**
```js
.select("*, idea:marketing_ideas!marketing_content_idea_id_fkey(id,url)")
```

**`sold_at` เก็บเป็น UTC แต่เจ้าของคิดเป็นเวลาไทย (UTC+7)**
แปลงขอบเขตวันก่อน query เสมอ — `dvx_data.py` มี `utc_bound()` ให้ใช้

## ตรวจว่าตัวเลขถูกจริงไหม

อย่าเชื่อว่าโค้ดถูกเพราะอ่านแล้วดูดี — **เทียบกับตัวที่รู้ว่าถูก**
มี implementation Python ที่นิ่งแล้วใน `deploy/agents/dvx_data.py` ใช้เป็นตัวเทียบได้
เทียบอย่างน้อย 2 ช่วงเวลา (เช่น 7 วัน กับ 30 วัน) — bug จาก pagination จะโผล่เฉพาะช่วงยาว

## เกี่ยวข้อง
`dvx-sku` · `dvx-machine` · `dvx-sync`
