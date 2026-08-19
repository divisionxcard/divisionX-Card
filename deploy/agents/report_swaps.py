"""
รายงานการเปลี่ยนสินค้าหน้าตู้ย้อนหลัง → Telegram กลุ่มแอดมิน

ทำไมต้องมี: การแจ้งเตือนอัตโนมัติเพิ่งถูกเพิ่มให้ตู้ WorldWide/Payif เมื่อ 19 ส.ค. 2026
(ก่อนหน้านั้นมีแต่ฝั่ง VMS — ดู wiki/worklog/2026-08-19-slot-swap-alerts-missing.md)
ของที่เปลี่ยนไปก่อนวันนั้นจึงไม่เคยมีใครได้รับแจ้ง ต้องส่งย้อนหลังให้แอดมินตรวจ

ใช้ซ้ำได้เรื่อย ๆ ไม่ใช่สคริปต์ใช้ครั้งเดียว — เช่นอยากดูว่าเดือนที่แล้วตู้ไหนเปลี่ยนอะไรบ้าง

รัน:
  python deploy/agents/report_swaps.py --since 2026-08-01                 # ดูเฉย ๆ ไม่ส่ง
  python deploy/agents/report_swaps.py --since 2026-08-01 --send          # ส่งจริง
  python deploy/agents/report_swaps.py --since 2026-08-01 --machines wwv06

Env: SUPABASE_URL + SUPABASE_SERVICE_KEY · TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID
"""
import os
import sys
import json
import argparse
import collections
import datetime
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scraper"))

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
TH = datetime.timezone(datetime.timedelta(hours=7))


def sb_get(path):
    """แบ่งหน้าเสมอ — PostgREST คืนแค่ 1000 แถวโดยไม่บอก"""
    out, frm = [], 0
    while True:
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{path}",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                     "Range": f"{frm}-{frm + 999}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = json.load(r)
        out += rows
        if len(rows) < 1000:
            return out
        frm += 1000


def th_date(ts):
    d = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return d.astimezone(TH).strftime("%Y-%m-%d")


def main():
    ap = argparse.ArgumentParser(description="รายงานการเปลี่ยนสินค้าหน้าตู้ย้อนหลัง")
    ap.add_argument("--since", required=True, help="วันที่เริ่ม (YYYY-MM-DD เวลาไทย)")
    ap.add_argument("--until", help="วันที่สิ้นสุด (ไม่ใส่ = ถึงปัจจุบัน)")
    ap.add_argument("--machines", help="เจาะจงตู้ คั่นด้วย comma (ไม่ใส่ = ทุกตู้)")
    ap.add_argument("--platforms", default="worldwide,vendos",
                    help="แบรนด์ที่จะรายงาน (ค่าเริ่มต้นเว้น vms เพราะแจ้งอัตโนมัติอยู่แล้ว)")
    ap.add_argument("--send", action="store_true", help="ส่งเข้า Telegram จริง (ไม่ใส่ = แค่พิมพ์ดู)")
    args = ap.parse_args()

    if not SB_URL or not SB_KEY:
        sys.exit("❌ ไม่มี SUPABASE_URL / SUPABASE_SERVICE_KEY")

    lo = datetime.datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=TH)
    q = (f"slot_refill_events?change_type=in.(swap_in,swap_out)"
         f"&synced_at=gte.{lo.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}"
         f"&select=*&order=synced_at")
    if args.until:
        hi = (datetime.datetime.strptime(args.until, "%Y-%m-%d")
              + datetime.timedelta(days=1)).replace(tzinfo=TH)
        q += f"&synced_at=lt.{hi.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}"

    events = sb_get(q)
    plats = {p.strip() for p in args.platforms.split(",") if p.strip()}
    events = [e for e in events if e.get("platform") in plats]
    if args.machines:
        want = {m.strip() for m in args.machines.split(",") if m.strip()}
        events = [e for e in events if e["machine_id"] in want]

    machines = {m["machine_id"]: m for m in sb_get("machines?select=machine_id,name,config")}
    stock = sb_get("machine_stock?select=machine_id,slot_number,product_name")
    slots_of = collections.defaultdict(set)
    for s in stock:
        if s.get("product_name"):
            slots_of[(s["machine_id"], s["product_name"])].add(str(s["slot_number"]))

    # จัดกลุ่มเป็น (วัน, ตู้)
    groups = collections.defaultdict(lambda: {"out": [], "in": []})
    for e in events:
        groups[(th_date(e["synced_at"]), e["machine_id"])][
            "in" if e["change_type"] == "swap_in" else "out"].append(e)

    blocks, skipped_rename = [], 0
    for (day, mid), sides in sorted(groups.items()):
        # ตัดเคส "แก้ชื่อสินค้า" ออก — sku_id เดิมทั้งสองฝั่ง = ไม่ได้เปลี่ยนของจริง
        out_sku = {e.get("sku_id") for e in sides["out"] if e.get("sku_id")}
        in_sku = {e.get("sku_id") for e in sides["in"] if e.get("sku_id")}
        renamed = out_sku & in_sku
        ro = [e for e in sides["out"] if e.get("sku_id") not in renamed]
        ri = [e for e in sides["in"] if e.get("sku_id") not in renamed]
        if not ro and not ri:
            skipped_rename += 1
            continue

        # ⚠️ ถอดออกซ้ำ ๆ โดยไม่มีของเข้าแทนเลย = สัญญาณว่า scraper มองไม่เห็นช่องนั้น
        #    ไม่ใช่การเปลี่ยนของ (เกิดจริงที่ pf01 ช่อง 052-060 ตั้งแต่ 15 ก.ค. 2026)
        suspect = bool(ro) and not ri and all((e.get("qty_before") or 0) > 0 for e in ro)

        blocks.append({"day": day, "mid": mid, "out": ro, "in": ri, "suspect": suspect})

    def fmt(b):
        m = machines.get(b["mid"], {})
        name = m.get("name") or b["mid"]
        lines = [f"\n<b>{b['day']} · {name}</b>"]
        for e in b["out"]:
            sl = sorted(slots_of.get((b["mid"], e.get("product_name")), []))
            sl = f" ช่อง <code>{', '.join(sl)}</code>" if sl else ""
            left = e.get("qty_before") or 0
            lines.append(f"\n  ➖ {e.get('product_name')}{sl}"
                         + (f" · <b>เหลือ {left}</b> ⚠️" if left else " · หมดพอดี"))
        for e in b["in"]:
            sl = sorted(slots_of.get((b["mid"], e.get("product_name")), []))
            sl = f" ช่อง <code>{', '.join(sl)}</code>" if sl else ""
            lines.append(f"\n  ➕ {e.get('product_name')}{sl}")
        return "".join(lines)

    real = [b for b in blocks if not b["suspect"]]
    suspects = [b for b in blocks if b["suspect"]]

    print(f"ช่วง {args.since} → {args.until or 'ปัจจุบัน'} · แบรนด์ {', '.join(sorted(plats))}")
    print(f"เหตุการณ์ swap {len(events)} แถว")
    print(f"  เปลี่ยนของจริง        {len(real)} ครั้ง (ตู้×วัน)")
    print(f"  แก้ชื่อสินค้า ข้ามไป   {skipped_rename} ครั้ง")
    print(f"  น่าสงสัยว่าเป็นบั๊ก    {len(suspects)} ครั้ง — ไม่ส่ง")
    if suspects:
        mids = collections.Counter(b["mid"] for b in suspects)
        print("     ตู้ที่เข้าข่าย:", dict(mids))

    if not real:
        print("\nไม่มีอะไรต้องแจ้ง")
        return

    header = (f"📋 <b>สรุปการเปลี่ยนสินค้าย้อนหลัง</b>\n"
              f"ช่วง {args.since} – {args.until or 'ปัจจุบัน'} · {len(real)} ครั้ง\n"
              f"<i>ระบบเพิ่งเริ่มแจ้งเตือนอัตโนมัติ 19 ส.ค. 2026 "
              f"รายการก่อนหน้านี้จึงไม่เคยถูกแจ้ง — ส่งมาให้ตรวจย้อนหลัง</i>\n")
    body = "".join(fmt(b) for b in real)
    footer = ("\n\n<i>⚠️ = ถอดออกทั้งที่ยังมีของเหลือ ควรเช็กว่าของถูกยกกลับมาหรือยังค้างหน้าตู้</i>")
    text = header + body + footer

    if not args.send:
        print("\n--- ข้อความที่จะส่ง (โหมดดูเฉย ๆ) ---")
        print(text.replace("<b>", "").replace("</b>", "")
                  .replace("<code>", "[").replace("</code>", "]")
                  .replace("<i>", "").replace("</i>", ""))
        print("\n(ใส่ --send เพื่อส่งจริง)")
        return

    from telegram_alert import send_message, ADMIN_CHAT_ID
    if not ADMIN_CHAT_ID:
        sys.exit("❌ ไม่มี TELEGRAM_ADMIN_CHAT_ID")
    # Telegram จำกัด 4096 ตัวอักษรต่อข้อความ — แบ่งส่งตามบล็อก ไม่ตัดกลางรายการ
    chunks, cur = [], header
    for b in real:
        piece = fmt(b)
        if len(cur) + len(piece) > 3500:
            chunks.append(cur)
            cur = ""
        cur += piece
    chunks.append(cur + footer)
    for i, c in enumerate(chunks, 1):
        tag = f"\n\n<i>({i}/{len(chunks)})</i>" if len(chunks) > 1 else ""
        send_message(ADMIN_CHAT_ID, c + tag)
    print(f"\n✅ ส่งแล้ว {len(chunks)} ข้อความ · {len(real)} รายการ")


if __name__ == "__main__":
    main()
