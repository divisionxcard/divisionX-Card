"""
DVX Query — ถามข้อมูลสดจาก Supabase แบบ read-only แล้ว print เป็นข้อความอ่านง่าย

เขียนไว้ให้ OpenClaw skill (หรือคนใน terminal) เรียกใช้ — ไม่ส่ง Telegram ไม่เขียน DB
อ่าน env จาก deploy/.env.local อัตโนมัติ (ดู envload.py)

คำสั่ง:
  py deploy/agents/dvx_query.py machines
  py deploy/agents/dvx_query.py sales  [--days 1] [--date 2026-08-03] [--from A --to B]
                                       [--machine chukes01] [--by machine|sku|day] [--top 10] [--json]
  py deploy/agents/dvx_query.py stock  [--machine chukes01] [--low] [--json]

หมายเหตุเวลา: sold_at ใน DB เป็น UTC · ทุก --date/--from/--to ตีความเป็น "เวลาไทย" (UTC+7)
"""
import os
import sys
import json
import argparse
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

TH = timezone(timedelta(hours=7))
MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


# ── Supabase (PostgREST) ────────────────────────────────────────────────
def sb_get(path):
    """ดึงทุกหน้าจาก PostgREST (pattern เดียวกับ agent ตัวอื่นในโฟลเดอร์นี้)"""
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{path}",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                     "Range": f"{offset}-{offset + page - 1}"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.loads(r.read().decode("utf-8"))
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


# ── helpers ─────────────────────────────────────────────────────────────
def th_today():
    return datetime.now(TH).date()


def thai_date(d):
    return f"{d.day} {MONTH_TH[d.month]}"


def utc_bound(day_th, end=False):
    """ขอบเขต UTC ของ 'วันไทย' — ใช้ยิงเข้า PostgREST (ไม่มี '+' ใน query string)"""
    dt = datetime(day_th.year, day_th.month, day_th.day, tzinfo=TH)
    if end:
        dt += timedelta(days=1)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def parse_date(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        sys.exit(f"❌ วันที่ผิดรูปแบบ (ต้อง YYYY-MM-DD): {s}")


def resolve_range(args):
    """--date / --from+--to / --days → (วันเริ่ม, วันจบ) เป็นวันไทย (inclusive)"""
    if args.date:
        d = parse_date(args.date)
        return d, d
    if getattr(args, "from_date", None) or args.to:
        if not (args.from_date and args.to):
            sys.exit("❌ ต้องใส่ทั้ง --from และ --to")
        d1, d2 = parse_date(args.from_date), parse_date(args.to)
        if d2 < d1:
            sys.exit(f"❌ --to ({args.to}) ต้องไม่ก่อน --from ({args.from_date})")
        return d1, d2
    n = max(1, args.days)
    end = th_today()
    return end - timedelta(days=n - 1), end


def load_machines(active_only=True):
    q = "machines?select=id,machine_id,name,location,status,brand&order=id"
    if active_only:
        q += "&status=eq.active"
    return sb_get(q)


def machine_label(m):
    return m.get("name") or m.get("location") or m["machine_id"]


def baht(x):
    return f"{x:,.0f}"


def resolve_machine(mid, machines):
    """รับ machine_id ตรง ๆ หรือคำค้นจากชื่อ/สาขา เช่น 'บางแค' → chukes01"""
    ids = {m["machine_id"] for m in machines}
    if mid in ids:
        return mid
    hits = [m for m in machines if mid.lower() in machine_label(m).lower()]
    if len(hits) == 1:
        return hits[0]["machine_id"]
    if not hits:
        sys.exit(f"❌ ไม่พบตู้ '{mid}' — ดูรายชื่อด้วย: dvx_query.py machines")
    sys.exit("❌ ตู้ '%s' กำกวม ตรงหลายตัว: %s" % (mid, ", ".join(h["machine_id"] for h in hits)))


# ── cmd: machines ───────────────────────────────────────────────────────
def cmd_machines(args):
    machines = load_machines(active_only=not args.all)
    if args.json:
        print(json.dumps(machines, ensure_ascii=False, indent=2))
        return
    print(f"🏪 ตู้ทั้งหมด {len(machines)} ตู้" + ("" if args.all else " (เฉพาะ active)"))
    for m in machines:
        flag = "" if m.get("status") == "active" else f"  [{m.get('status')}]"
        print(f"  {m['machine_id']:<10} {m.get('brand','?'):<10} {machine_label(m)}{flag}")


# ── cmd: sales ──────────────────────────────────────────────────────────
def cmd_sales(args):
    d1, d2 = resolve_range(args)
    machines = load_machines(active_only=False)
    mname = {m["machine_id"]: machine_label(m) for m in machines}
    morder = {m["machine_id"]: m.get("id") or 999 for m in machines}
    target = resolve_machine(args.machine, machines) if args.machine else None

    q = ("sales?select=machine_id,sku_id,quantity_sold,grand_total,sold_at,transaction_id"
         f"&sold_at=gte.{utc_bound(d1)}&sold_at=lt.{utc_bound(d2, end=True)}")
    if target:
        q += f"&machine_id=eq.{target}"
    rows = sb_get(q)

    skus = sb_get("skus?select=sku_id,name")
    sku_name = {s["sku_id"]: (s.get("name") or s["sku_id"]) for s in skus}

    total_rev = sum(float(r.get("grand_total") or 0) for r in rows)
    total_qty = sum(int(r.get("quantity_sold") or 0) for r in rows)
    txns = len({r.get("transaction_id") for r in rows if r.get("transaction_id")})
    n_days = (d2 - d1).days + 1

    if args.json:
        print(json.dumps({
            "from": str(d1), "to": str(d2), "days": n_days,
            "revenue": total_rev, "packs": total_qty, "transactions": txns,
            "rows": len(rows),
        }, ensure_ascii=False, indent=2))
        return

    span = thai_date(d1) if d1 == d2 else f"{thai_date(d1)} – {thai_date(d2)}"
    scope = f" · {mname.get(target, target)}" if target else ""
    print(f"💰 ยอดขาย {span} ({n_days} วัน){scope}")
    print(f"   รายรับ {baht(total_rev)} บาท · {total_qty:,} ซอง · {txns:,} ธุรกรรม")
    if n_days > 1:
        print(f"   เฉลี่ย {baht(total_rev / n_days)} บาท/วัน")
    if not rows:
        print("   (ไม่มีรายการขายในช่วงนี้ — ถ้าเป็นวันนี้/เมื่อวาน อาจยังไม่ได้ sync)")
        return
    print("─" * 46)

    if args.by == "machine":
        agg = {}
        for r in rows:
            mid = r["machine_id"]
            a = agg.setdefault(mid, {"rev": 0.0, "qty": 0})
            a["rev"] += float(r.get("grand_total") or 0)
            a["qty"] += int(r.get("quantity_sold") or 0)
        for mid, a in sorted(agg.items(), key=lambda kv: morder.get(kv[0], 999)):
            share = a["rev"] / total_rev * 100 if total_rev else 0
            print(f"  {mname.get(mid, mid)}")
            print(f"     {baht(a['rev'])} บาท ({share:.0f}%) · {a['qty']:,} ซอง")

    elif args.by == "sku":
        agg = {}
        for r in rows:
            sku = r.get("sku_id") or "(ไม่ระบุ)"
            a = agg.setdefault(sku, {"rev": 0.0, "qty": 0})
            a["rev"] += float(r.get("grand_total") or 0)
            a["qty"] += int(r.get("quantity_sold") or 0)
        top = sorted(agg.items(), key=lambda kv: kv[1]["rev"], reverse=True)[:args.top]
        print(f"  Top {len(top)} SKU ตามรายรับ")
        for i, (sku, a) in enumerate(top, 1):
            print(f"  {i:>2}. {sku_name.get(sku, sku)}")
            print(f"      {baht(a['rev'])} บาท · {a['qty']:,} ซอง")

    elif args.by == "day":
        agg = {}
        for r in rows:
            # UTC → วันไทย
            dt = datetime.fromisoformat(r["sold_at"][:19]).replace(tzinfo=timezone.utc)
            day = dt.astimezone(TH).date()
            a = agg.setdefault(day, {"rev": 0.0, "qty": 0})
            a["rev"] += float(r.get("grand_total") or 0)
            a["qty"] += int(r.get("quantity_sold") or 0)
        for day in sorted(agg):
            a = agg[day]
            print(f"  {thai_date(day)}  {baht(a['rev']):>9} บาท · {a['qty']:>5,} ซอง")


# ── cmd: stock ──────────────────────────────────────────────────────────
def cmd_stock(args):
    machines = load_machines(active_only=True)
    mname = {m["machine_id"]: machine_label(m) for m in machines}
    morder = {m["machine_id"]: m.get("id") or 999 for m in machines}
    target = resolve_machine(args.machine, machines) if args.machine else None

    q = ("machine_stock?select=machine_id,slot_number,product_name,sku_id,remain,"
         "max_capacity,is_occupied,synced_at&is_occupied=eq.true&order=machine_id,slot_number")
    if target:
        q += f"&machine_id=eq.{target}"
    rows = [r for r in sb_get(q) if r["machine_id"] in mname]

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return

    if not rows:
        print("❌ ไม่มีข้อมูลสต็อกหน้าตู้ — ลองสั่ง sync ก่อน")
        return

    synced = max((r.get("synced_at") or "" for r in rows), default="")
    if synced:
        dt = datetime.fromisoformat(synced[:19]).replace(tzinfo=timezone.utc).astimezone(TH)
        age_h = (datetime.now(TH) - dt).total_seconds() / 3600
        stale = "  ⚠️ ข้อมูลเก่ากว่า 1 วัน" if age_h > 24 else ""
        print(f"📦 สต็อกหน้าตู้ · ข้อมูล ณ {dt.strftime('%d/%m %H:%M')} น. ({age_h:.0f} ชม.ที่แล้ว){stale}")
    if args.low:
        print(f"   แสดงเฉพาะช่องที่เหลือ ≤ {args.low_threshold}")
    print("─" * 46)

    by_machine = {}
    for r in rows:
        by_machine.setdefault(r["machine_id"], []).append(r)

    for mid in sorted(by_machine, key=lambda x: morder.get(x, 999)):
        slots = by_machine[mid]
        shown = [s for s in slots if (s.get("remain") or 0) <= args.low_threshold] if args.low else slots
        total_remain = sum(s.get("remain") or 0 for s in slots)
        empty = sum(1 for s in slots if (s.get("remain") or 0) == 0)
        head = f"📍 {mname.get(mid, mid)} · {len(slots)} ช่อง · รวม {total_remain:,} ชิ้น"
        if empty:
            head += f" · 🔴 ว่าง {empty} ช่อง"
        print(head)
        if args.low and not shown:
            print("     ✅ ไม่มีช่องใกล้หมด")
        for s in sorted(shown, key=lambda x: (x.get("remain") or 0)):
            remain = s.get("remain") or 0
            cap = s.get("max_capacity") or 0
            icon = "🔴" if remain == 0 else ("🟠" if remain <= args.low_threshold else "  ")
            capstr = f"/{cap}" if cap else ""
            print(f"   {icon} ช่อง {str(s.get('slot_number') or '?'):<4} {s.get('product_name') or '-'}")
            print(f"        เหลือ {remain}{capstr}")
        print()


# ── main ────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="DVX Query — อ่านข้อมูลสดจาก Supabase")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_m = sub.add_parser("machines", help="รายชื่อตู้")
    p_m.add_argument("--all", action="store_true", help="รวมตู้ที่ไม่ active")
    p_m.add_argument("--json", action="store_true")
    p_m.set_defaults(func=cmd_machines)

    p_s = sub.add_parser("sales", help="ยอดขาย")
    p_s.add_argument("--days", type=int, default=1, help="ย้อนหลังกี่วัน (รวมวันนี้ · default 1)")
    p_s.add_argument("--date", type=str, help="วันเดียว YYYY-MM-DD")
    p_s.add_argument("--from", dest="from_date", type=str, help="วันเริ่ม YYYY-MM-DD")
    p_s.add_argument("--to", type=str, help="วันจบ YYYY-MM-DD")
    p_s.add_argument("--machine", type=str, help="machine_id หรือคำค้นจากชื่อสาขา")
    p_s.add_argument("--by", choices=["machine", "sku", "day"], default="machine")
    p_s.add_argument("--top", type=int, default=10, help="จำนวนอันดับเมื่อ --by sku")
    p_s.add_argument("--json", action="store_true")
    p_s.set_defaults(func=cmd_sales)

    p_k = sub.add_parser("stock", help="สต็อกหน้าตู้")
    p_k.add_argument("--machine", type=str, help="machine_id หรือคำค้นจากชื่อสาขา")
    p_k.add_argument("--low", action="store_true", help="เฉพาะช่องที่ใกล้หมด")
    p_k.add_argument("--low-threshold", type=int, default=2, help="เกณฑ์ 'ใกล้หมด' (default 2)")
    p_k.add_argument("--json", action="store_true")
    p_k.set_defaults(func=cmd_stock)

    args = ap.parse_args()
    if not SB_URL or not SB_KEY:
        sys.exit("❌ ไม่มี SUPABASE_URL / SERVICE KEY — ตรวจ deploy/.env.local")
    try:
        args.func(args)
    except urllib.error.HTTPError as e:
        sys.exit(f"❌ Supabase HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}")


if __name__ == "__main__":
    main()
