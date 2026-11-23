#!/usr/bin/env python3
"""เทสต์ตัวพักรายการขายของสินค้าที่ยังไม่มี SKU (deploy/scraper/sales_pending.py)

รันได้โดยไม่ต่อฐานข้อมูล ไม่ต้องมี secret:  python scripts/test_sales_pending.py
ใช้ฐานข้อมูลจำลองที่เลียนพฤติกรรมที่เราพึ่ง: FK ของ sales.sku_id · upsert on_conflict · ตารางยังไม่มี (PGRST205)
"""
import pathlib
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
import sales_pending as sp  # noqa: E402


class _Res:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, db, name):
        self.db, self.name, self.op = db, name, "select"
        self.filters, self.payload, self.kw, self.rng = [], None, {}, None

    def select(self, *_a, **_k):
        self.op = "select"; return self

    def upsert(self, rows, **kw):
        self.op, self.payload, self.kw = "upsert", rows, kw; return self

    def delete(self):
        self.op = "delete"; return self

    def in_(self, col, vals):
        self.filters.append((col, set(vals))); return self

    def order(self, *_a, **_k):
        return self

    def range(self, a, b):
        self.rng = (a, b); return self

    def execute(self):
        db = self.db
        if self.name == sp.TABLE and not db.has_pending_table:
            raise Exception("{'code': 'PGRST205', 'message': \"Could not find the table "
                            "'public.sales_pending_sku' in the schema cache\"}")
        t = db.tables.setdefault(self.name, [])
        match = lambda r: all(r.get(c) in v for c, v in self.filters)
        if self.op == "select":
            rows = [dict(r) for r in t if match(r)]
            if self.rng:
                rows = rows[self.rng[0]:self.rng[1] + 1]
            return _Res(rows)
        if self.op == "delete":
            db.tables[self.name] = [r for r in t if not match(r)]
            return _Res([])
        key = self.kw.get("on_conflict")
        for row in self.payload:
            if self.name == "sales" and row["sku_id"] not in {s["sku_id"] for s in db.tables["skus"]}:
                raise Exception('insert or update on table "sales" violates foreign key constraint '
                                '"sales_sku_id_fkey"')
            if self.name == "sales":
                assert not any(k.startswith("_") for k in row), f"คีย์ภายในหลุดเข้า sales: {row}"
            old = next((r for r in t if r.get(key) == row.get(key)), None)
            if old is None:
                t.append(dict(row))
            elif not self.kw.get("ignore_duplicates"):
                old.clear(); old.update(row)
        return _Res(self.payload)


class FakeDB:
    def __init__(self, skus, has_pending_table=True):
        self.tables = {"skus": [{"sku_id": s} for s in skus], "sales": [], sp.TABLE: []}
        self.has_pending_table = has_pending_table

    def table(self, name):
        return _Q(self, name)


def row(key, sku, machine="chukes01", name=None, qty=1, **extra):
    return {"sale_key": key, "transaction_id": key.split("-")[0], "machine_id": machine, "sku_id": sku,
            "product_name_raw": name or f"One Piece {sku}", "quantity_sold": qty, "grand_total": 150.0,
            "sold_at": "2026-11-22T05:00:00+00:00", **extra}


FAILS = []
SENT = []
sp._notify = lambda text: SENT.append(text)


def check(label, cond):
    print(("  ✅ " if cond else "  ❌ ") + label)
    if not cond:
        FAILS.append(label)


def save(db, records):
    """เลียนขั้นบันทึกของตัวดึงยอดขาย: ย้ายของที่พัก → พักของใหม่ → upsert ที่เหลือ"""
    from sales_unit import add_unit, upsert_sales
    sp.release_pending(db)
    kept = sp.hold_unknown_skus(db, records, "vms")
    if kept:
        upsert_sales(db, add_unit(kept, "product_name_raw"))
    return kept


print("1) สินค้าใหม่ไม่มี SKU — รายการอื่นต้องเข้า ไม่ล้มทั้งชุด")
db = FakeDB(["OP 17"])
SENT.clear()
recs = [row("a-0", "OP 17"), row("b-0", "OP 18", _confident=True), row("c-0", "OP 18", machine="chukes02"),
        row("d-0", "OP 18", name="One Piece OP - 18 Box", qty=24)]
kept = save(db, recs)
check("แถว SKU ที่มีอยู่เข้า sales", [r["sale_key"] for r in db.tables["sales"]] == ["a-0"])
check("แถว OP 18 ทั้ง 3 ถูกพัก", sorted(r["sale_key"] for r in db.tables[sp.TABLE]) == ["b-0", "c-0", "d-0"])
check("แจ้งเตือน 1 ครั้ง บอกว่าพักไว้ไม่หาย", len(SENT) == 1 and "OP 18" in SENT[0] and "ไม่หาย" in SENT[0])
check("มีแถวกล่อง → เตือนเรื่อง 24 ซอง/กล่อง", "24 ซอง/กล่อง" in SENT[0])
check("แถวที่พักไม่มีคีย์ภายใน (_confident)",
      all(not k.startswith("_") for r in db.tables[sp.TABLE] for k in r["record"]))

print("2) ดึงซ้ำช่วงเดิม — ไม่พักซ้ำ ไม่แจ้งซ้ำ")
SENT.clear()
save(db, [row("a-0", "OP 17"), row("b-0", "OP 18"), row("c-0", "OP 18", machine="chukes02")])
check("ที่พักยังมี 3 แถว", len(db.tables[sp.TABLE]) == 3)
check("ไม่แจ้งเตือนซ้ำ", SENT == [])
check("sales ไม่เพิ่ม", len(db.tables["sales"]) == 1)

print("3) มีรายการใหม่ของ SKU เดิมที่ยังไม่มี — แจ้งเฉพาะรายการใหม่")
SENT.clear()
save(db, [row("b-0", "OP 18"), row("e-0", "OP 18", machine="chukes04")])
check("ที่พักมี 4 แถว", len(db.tables[sp.TABLE]) == 4)
check("แจ้งเตือนนับแค่ 1 รายการใหม่", len(SENT) == 1 and "1 รายการ" in SENT[0] and "chukes04" in SENT[0])

print("4) เพิ่ม SKU แล้ว — ซิงค์รอบถัดไป (แม้ไม่มียอดใหม่) ย้ายเข้า sales เองครบ")
SENT.clear()
db.tables["skus"].append({"sku_id": "OP 18"})
save(db, [])
check("ที่พักว่าง", db.tables[sp.TABLE] == [])
check("sales ครบ 5 แถว", sorted(r["sale_key"] for r in db.tables["sales"]) == ["a-0", "b-0", "c-0", "d-0", "e-0"])
box = next(r for r in db.tables["sales"] if r["sale_key"] == "d-0")
check("แถวกล่องคงจำนวนซองและได้ unit=box", box["quantity_sold"] == 24 and box.get("unit") == "box")
check("แจ้งว่าย้ายเข้าแล้ว", len(SENT) == 1 and "4 รายการ" in SENT[0])

print("5) ย้ายเข้าแล้วดึงช่วงเดิมซ้ำ — ไม่บวกเพิ่ม")
save(db, [row("b-0", "OP 18"), row("e-0", "OP 18", machine="chukes04")])
check("sales ยัง 5 แถว", len(db.tables["sales"]) == 5)

print("6) หลาย SKU ค้าง — ย้ายเฉพาะตัวที่มี SKU แล้ว")
db = FakeDB(["OP 17"])
save(db, [row("x-0", "OP 18"), row("y-0", "EB 06")])
db.tables["skus"].append({"sku_id": "EB 06"})
save(db, [])
check("EB 06 เข้า sales · OP 18 ยังพัก",
      [r["sale_key"] for r in db.tables["sales"]] == ["y-0"]
      and [r["sale_key"] for r in db.tables[sp.TABLE]] == ["x-0"])

print("7) ยังไม่ได้รัน migration 084 (ไม่มีตารางพัก) — ไม่ล้ม · ข้าม + เตือนทุกรอบ")
db = FakeDB(["OP 17"], has_pending_table=False)
SENT.clear()
kept = save(db, [row("a-0", "OP 17"), row("b-0", "OP 18")])
check("รายการอื่นเข้า sales", [r["sale_key"] for r in db.tables["sales"]] == ["a-0"])
check("เตือนว่าถูกข้าม + ให้รัน migration", len(SENT) == 1 and "084" in SENT[0] and "ถูกข้าม" in SENT[0])
save(db, [row("b-0", "OP 18")])
check("รอบถัดไปเตือนซ้ำ (ยังไม่มีที่พัก = ยังเสี่ยงหาย)", len(SENT) == 2)

print("8) error อื่นจากตารางพักต้องดังตามเดิม ไม่ถูกกลืน")
db = FakeDB(["OP 17"])
_orig = db.table
def boom(name):
    q = _orig(name)
    if name == sp.TABLE:
        def ex():
            raise Exception("permission denied for table sales_pending_sku")
        q.execute = ex
    return q
db.table = boom
try:
    sp.hold_unknown_skus(db, [row("b-0", "OP 18")], "vms")
    check("ต้อง raise", False)
except Exception as e:  # noqa: BLE001
    check("raise ออกมา", "permission denied" in str(e))

print()
if FAILS:
    print(f"❌ ไม่ผ่าน {len(FAILS)} ข้อ")
    sys.exit(1)
print("✅ ผ่านทุกข้อ")
