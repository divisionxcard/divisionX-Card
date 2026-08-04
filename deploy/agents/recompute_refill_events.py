"""
Recompute Refill Events — ซ่อม sold_between / qty_added ของ slot_refill_events

ปัญหาที่แก้:
  slot_tracking คำนวณ  qty_added = (qty_after − qty_before) + sold_between
  โดย sold_between อ่านจากตาราง sales *ตอนที่ stock sync รัน*
  แต่ยอดขายเข้า DB ทีหลัง (sales cron ดึงของเมื่อวานตอนเที่ยงคืน)
  → รอบ sync เช้าได้ sold_between = 0 เสมอ → qty_added ต่ำกว่าจริง

สคริปต์นี้คำนวณ sold_between ใหม่จากยอดขายที่ครบแล้ว แล้ว update แถวที่คลาดเคลื่อน
ออกแบบให้รันซ้ำได้เรื่อย ๆ (idempotent) — รันท้าย workflow ยอดขายเป็นตาข่ายกันพลาด

ขอบเขต:
  - เฉพาะ change_type='refill' (ตัวเดียวที่ qty_added ขึ้นกับ sold_between)
  - ข้ามแถว manual_adjusted=true (คนแก้มือแล้ว ห้ามทับ)
  - grain='slot' (VMS) → จับคู่ยอดขายด้วย slot_number (แม่นต่อช่อง)
  - grain='sku'  (WW/Vendos) → รวมต่อ (machine, sku) แล้วลงหน่วย pack ก่อน
                                (mirror กติกาใน slot_tracking._build_ww_events)

⚠️ กู้ไม่ได้: event ที่ "ไม่เคยถูกสร้าง" เพราะตอนนั้นคำนวณได้ qty_added ≤ 0
   (ข้อมูล qty_before/qty_after ของรอบนั้นไม่ได้ถูกเก็บไว้ที่ไหน) — แก้ได้แค่อนาคต

รัน:
  py deploy/agents/recompute_refill_events.py --dry-run        # ดูก่อนว่าจะแก้อะไร
  py deploy/agents/recompute_refill_events.py --days 3         # ซ่อม 3 วันล่าสุด
  py deploy/agents/recompute_refill_events.py --all            # ซ่อมทั้งตาราง
"""
import os
import sys
import json
import argparse
import collections
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envload import load_env_local  # noqa: E402

load_env_local()

SB_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


def sb_get(path):
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{path}",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                     "Range": f"{offset}-{offset + page - 1}"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            batch = json.loads(r.read().decode("utf-8"))
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def sb_patch(event_id, body):
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/slot_refill_events?id=eq.{event_id}",
        data=json.dumps(body).encode("utf-8"),
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()


def parse_dt(value):
    if not value:
        return None
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def compute_sold(events, sales):
    """คืน dict: event_id → sold_between ที่ควรเป็น"""
    by_slot = collections.defaultdict(list)   # (machine, slot) → [(เวลา, จำนวน)]
    by_sku = collections.defaultdict(list)    # (machine, sku)  → [(เวลา, จำนวน)]
    for s in sales:
        t = parse_dt(s.get("sold_at"))
        qty = s.get("quantity_sold") or 0
        if t is None or not qty:
            continue
        if s.get("slot_number"):
            by_slot[(s["machine_id"], s["slot_number"])].append((t, qty))
        if s.get("sku_id"):
            by_sku[(s["machine_id"], s["sku_id"])].append((t, qty))

    result = {}

    # ── grain='slot' (VMS) — จับคู่ตรงต่อช่อง ──
    for e in events:
        if e["grain"] != "slot":
            continue
        a, b = parse_dt(e["prev_synced_at"]), parse_dt(e["synced_at"])
        result[e["id"]] = sum(q for t, q in by_slot.get((e["machine_id"], e["slot_number"]), [])
                              if a < t <= b)

    # ── grain='sku' (WW/Vendos) — รวมต่อ (ตู้, sku) ใน batch เดียวกัน แล้วลงหน่วย pack ก่อน ──
    batches = collections.defaultdict(list)
    for e in events:
        if e["grain"] == "sku" and e.get("sku_id"):
            batches[(e["machine_id"], e["synced_at"], e["sku_id"])].append(e)
    for (mid, _, sku), rows in batches.items():
        a, b = parse_dt(rows[0]["prev_synced_at"]), parse_dt(rows[0]["synced_at"])
        total = sum(q for t, q in by_sku.get((mid, sku), []) if a < t <= b)
        # หน่วย pack เป็นหลัก · ถ้า batch นี้มีแต่ box ค่อยลง box (ตรงกับ _build_ww_events)
        packs = [r for r in rows if not r.get("is_box")]
        target = (packs or rows)[0]
        for r in rows:
            result[r["id"]] = total if r["id"] == target["id"] else 0

    # event ที่ไม่มี sku_id (จับคู่ยอดขายไม่ได้) → คงค่าเดิม ไม่แตะ
    for e in events:
        result.setdefault(e["id"], e["sold_between"])
    return result


def main():
    ap = argparse.ArgumentParser(description="ซ่อม sold_between/qty_added ของ slot_refill_events")
    ap.add_argument("--days", type=int, default=3, help="ย้อนหลังกี่วันจาก synced_at (default 3)")
    ap.add_argument("--all", action="store_true", help="ทั้งตาราง (ไม่สนใจ --days)")
    ap.add_argument("--dry-run", action="store_true", help="ดูอย่างเดียว ไม่ update")
    args = ap.parse_args()

    if not SB_URL or not SB_KEY:
        sys.exit("❌ ไม่มี SUPABASE_URL / SERVICE KEY — ตรวจ deploy/.env.local")

    q = ("slot_refill_events?select=id,machine_id,platform,grain,slot_number,sku_id,is_box,"
         "qty_before,qty_after,sold_between,qty_added,prev_synced_at,synced_at"
         "&change_type=eq.refill&manual_adjusted=is.false&prev_synced_at=not.is.null")
    if not args.all:
        since = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%Y-%m-%dT%H:%M:%S")
        q += f"&synced_at=gte.{since}"
    events = sb_get(q)
    scope = "ทั้งตาราง" if args.all else f"{args.days} วันล่าสุด"
    if not events:
        print(f"[recompute] ไม่มี refill event ใน {scope} — จบ")
        return

    lo = min(parse_dt(e["prev_synced_at"]) for e in events)
    sales = sb_get("sales?select=machine_id,slot_number,sku_id,quantity_sold,sold_at"
                   f"&sold_at=gte.{lo.strftime('%Y-%m-%dT%H:%M:%S')}")
    print(f"[recompute] {scope} · refill events {len(events)} · sales {len(sales)} แถว")

    want = compute_sold(events, sales)
    changes, skipped = [], []
    for e in events:
        new_sold = want.get(e["id"], e["sold_between"])
        new_added = (e["qty_after"] - e["qty_before"]) + new_sold
        if new_sold == e["sold_between"] and new_added == e["qty_added"]:
            continue
        if new_added <= 0:
            # คำนวณใหม่แล้วกลายเป็นไม่ใช่การเติม — ไม่ลบทิ้งเอง ให้คนดู
            skipped.append((e, new_sold, new_added))
            continue
        changes.append((e, new_sold, new_added))

    if not changes and not skipped:
        print("[recompute] ✅ ตรงหมด ไม่มีอะไรต้องแก้")
        return

    delta = sum(n - e["qty_added"] for e, _, n in changes)
    print(f"[recompute] ต้องแก้ {len(changes)} แถว · qty_added รวมเปลี่ยน {delta:+d} ซอง")
    for e, new_sold, new_added in changes[:15]:
        who = f"{e['machine_id']} ช่อง {e['slot_number']}" if e["grain"] == "slot" else f"{e['machine_id']} {e['sku_id']}"
        print(f"   id={e['id']:<5} {who:<24} sold {e['sold_between']}→{new_sold} · "
              f"qty_added {e['qty_added']}→{new_added}")
    if len(changes) > 15:
        print(f"   … อีก {len(changes) - 15} แถว")

    if skipped:
        print(f"\n⚠️  {len(skipped)} แถวคำนวณใหม่แล้วได้ qty_added ≤ 0 — ข้ามไว้ ไม่แตะ (ต้องดูด้วยตา)")
        for e, ns, na in skipped[:5]:
            print(f"   id={e['id']} {e['machine_id']} · before={e['qty_before']} after={e['qty_after']} "
                  f"sold {e['sold_between']}→{ns} · qty_added {e['qty_added']}→{na}")

    if args.dry_run:
        print("\n── DRY RUN — ไม่ได้ update ──")
        return

    ok = 0
    for e, new_sold, new_added in changes:
        try:
            sb_patch(e["id"], {"sold_between": new_sold, "qty_added": new_added})
            ok += 1
        except urllib.error.HTTPError as err:
            print(f"   ❌ id={e['id']} HTTP {err.code}: {err.read().decode('utf-8', 'ignore')[:150]}")
    print(f"\n[recompute] ✅ update สำเร็จ {ok}/{len(changes)} แถว")


if __name__ == "__main__":
    main()
