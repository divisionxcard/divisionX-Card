"""
DVX Query — ถามข้อมูลสดจาก Supabase แบบ read-only แล้ว print เป็นข้อความอ่านง่าย

เป็นชั้น "ฟอร์แมต" ล้วน — logic การ query อยู่ที่ dvx_data.py (ใช้ร่วมกับ MCP server
ที่ deploy/mcp/dvx_mcp_server.py เพื่อไม่ให้ตรรกะแตกเป็นสองชุด)

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
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dvx_data as data  # noqa: E402
from dvx_data import DvxError  # noqa: E402


def baht(x):
    return f"{x:,.0f}"


# ── cmd: machines ───────────────────────────────────────────────────────
def cmd_machines(args):
    ms = data.load_machines(active_only=not args.all)
    if args.json:
        print(json.dumps(ms, ensure_ascii=False, indent=2))
        return
    print(f"🏪 ตู้ทั้งหมด {len(ms)} ตู้" + ("" if args.all else " (เฉพาะ active)"))
    for m in ms:
        flag = "" if m.get("status") == "active" else f"  [{m.get('status')}]"
        print(f"  {m['machine_id']:<10} {m.get('brand','?'):<10} {data.machine_label(m)}{flag}")


# ── cmd: sales ──────────────────────────────────────────────────────────
def cmd_sales(args):
    r = data.query_sales(days=args.days, date=args.date,
                         from_date=args.from_date, to_date=args.to,
                         machine=args.machine, group_by=args.by, top=args.top)
    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return

    d1, d2 = r["from"], r["to"]
    span = data.thai_date(data.parse_date(d1))
    if d1 != d2:
        span += f" – {data.thai_date(data.parse_date(d2))}"
    scope = f" · {r['machine']}" if args.machine else ""
    print(f"💰 ยอดขาย {span} ({r['days']} วัน){scope}")
    print(f"   รายรับ {baht(r['revenue'])} บาท · {r['packs']:,} ซอง · {r['transactions']:,} ธุรกรรม")
    if r["days"] > 1:
        print(f"   เฉลี่ย {baht(r['revenue_per_day'])} บาท/วัน")
    if not r["breakdown"]:
        print("   (ไม่มีรายการขายในช่วงนี้ — ถ้าเป็นวันนี้/เมื่อวาน อาจยังไม่ได้ sync)")
        return
    print("─" * 46)

    if r["group_by"] == "machine":
        for b in r["breakdown"]:
            print(f"  {b['name']}")
            print(f"     {baht(b['revenue'])} บาท ({b['share_pct']:.0f}%) · {b['packs']:,} ซอง")
    elif r["group_by"] == "sku":
        print(f"  Top {len(r['breakdown'])} SKU ตามรายรับ")
        for b in r["breakdown"]:
            print(f"  {b['rank']:>2}. {b['name']}")
            print(f"      {baht(b['revenue'])} บาท · {b['packs']:,} ซอง")
    else:
        for b in r["breakdown"]:
            print(f"  {b['date_th']}  {baht(b['revenue']):>9} บาท · {b['packs']:>5,} ซอง")


# ── cmd: stock ──────────────────────────────────────────────────────────
def cmd_stock(args):
    r = data.query_stock(machine=args.machine, low_only=args.low,
                         low_threshold=args.low_threshold)
    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return

    if not r["machines"]:
        print("❌ ไม่มีข้อมูลสต็อกหน้าตู้ — ลองสั่ง sync ก่อน")
        return

    if r["synced_at"]:
        stale = "  ⚠️ ข้อมูลเก่ากว่า 1 วัน" if r["stale"] else ""
        # synced_at เป็น "YYYY-MM-DD HH:MM" → แสดงแบบไทย วัน/เดือน
        when = datetime.strptime(r["synced_at"], "%Y-%m-%d %H:%M").strftime("%d/%m %H:%M")
        print(f"📦 สต็อกหน้าตู้ · ข้อมูล ณ {when} น. ({r['age_hours']:.0f} ชม.ที่แล้ว){stale}")
    if args.low:
        print(f"   แสดงเฉพาะช่องที่เหลือ ≤ {args.low_threshold}")
    print("─" * 46)

    for m in r["machines"]:
        head = f"📍 {m['name']} · {m['slots_total']} ช่อง · รวม {m['units_total']:,} ชิ้น"
        if m["slots_empty"]:
            head += f" · 🔴 ว่าง {m['slots_empty']} ช่อง"
        print(head)
        if args.low and not m["slots"]:
            print("     ✅ ไม่มีช่องใกล้หมด")
        for s in m["slots"]:
            remain = s["remain"]
            icon = "🔴" if remain == 0 else ("🟠" if remain <= args.low_threshold else "  ")
            capstr = f"/{s['capacity']}" if s["capacity"] else ""
            print(f"   {icon} ช่อง {str(s['slot'] or '?'):<4} {s['product'] or '-'}")
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
    try:
        args.func(args)
    except DvxError as e:
        sys.exit(f"❌ {e}")


if __name__ == "__main__":
    main()
