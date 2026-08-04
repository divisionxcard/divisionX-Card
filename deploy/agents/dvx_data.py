"""
DVX Data — ชั้นข้อมูลกลาง (read-only) ของระบบ DivisionX

คืนค่าเป็น dict/list ล้วน ไม่ print ไม่ฟอร์แมต — ให้ผู้เรียกไปจัดรูปเอง
ใช้ร่วมกัน 2 ที่:
  - deploy/agents/dvx_query.py   (CLI · ฟอร์แมตเป็นข้อความไทย)
  - deploy/mcp/dvx_mcp_server.py (MCP server · ส่ง dict ให้ agent)

ทุกวันที่ในอาร์กิวเมนต์และผลลัพธ์เป็น "เวลาไทย" (UTC+7) — ฟังก์ชันแปลงเป็น UTC
ให้เองก่อนยิง PostgREST (sold_at ใน DB เป็น UTC)
"""
import os
import sys
import json
import collections
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envload import load_env_local  # noqa: E402

load_env_local()

SB_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

TH = timezone(timedelta(hours=7))
MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

SALES_WINDOW_DAYS = 14      # ช่วงคำนวณ velocity (ตรงกับ restock_guard.py)


class DvxError(Exception):
    """ข้อผิดพลาดที่อธิบายให้ผู้ใช้เข้าใจได้ (ตู้ไม่เจอ / วันที่ผิด / ไม่มี key)"""


# ── Supabase (PostgREST) ────────────────────────────────────────────────
def sb_get(path):
    """ดึงทุกหน้าจาก PostgREST"""
    if not SB_URL or not SB_KEY:
        raise DvxError("ไม่มี SUPABASE_URL / SERVICE KEY — ตรวจ deploy/.env.local")
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{path}",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                     "Range": f"{offset}-{offset + page - 1}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                batch = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise DvxError(f"Supabase HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}")
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


# ── วันที่ / เวลาไทย ─────────────────────────────────────────────────────
def th_today():
    return datetime.now(TH).date()


def thai_date(d):
    return f"{d.day} {MONTH_TH[d.month]}"


def utc_bound(day_th, end=False):
    """ขอบเขต UTC ของ 'วันไทย' — รูปแบบไม่มี '+' เพื่อไม่ให้ PostgREST 400"""
    dt = datetime(day_th.year, day_th.month, day_th.day, tzinfo=TH)
    if end:
        dt += timedelta(days=1)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def parse_date(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise DvxError(f"วันที่ผิดรูปแบบ (ต้อง YYYY-MM-DD): {s}")


def resolve_range(days=1, date=None, from_date=None, to_date=None):
    """แปลง date / from+to / days → (วันเริ่ม, วันจบ) เป็นวันไทย (รวมปลายทั้งสอง)"""
    if date:
        d = parse_date(date)
        return d, d
    if from_date or to_date:
        if not (from_date and to_date):
            raise DvxError("ต้องใส่ทั้ง from_date และ to_date")
        d1, d2 = parse_date(from_date), parse_date(to_date)
        if d2 < d1:
            raise DvxError(f"to_date ({to_date}) ต้องไม่ก่อน from_date ({from_date})")
        return d1, d2
    n = max(1, int(days or 1))
    end = th_today()
    return end - timedelta(days=n - 1), end


# ── ตู้ ──────────────────────────────────────────────────────────────────
def load_machines(active_only=True):
    q = "machines?select=id,machine_id,name,location,status,brand&order=id"
    if active_only:
        q += "&status=eq.active"
    return sb_get(q)


def machine_label(m):
    return m.get("name") or m.get("location") or m["machine_id"]


def resolve_machine(mid, machines):
    """รับ machine_id ตรง ๆ หรือคำค้นจากชื่อ/สาขา เช่น 'ชลบุรี' → chukes04"""
    if not mid:
        return None
    ids = {m["machine_id"] for m in machines}
    if mid in ids:
        return mid
    hits = [m for m in machines if mid.lower() in machine_label(m).lower()]
    if len(hits) == 1:
        return hits[0]["machine_id"]
    if not hits:
        raise DvxError(f"ไม่พบตู้ '{mid}' — เรียก list_machines ดูรายชื่อก่อน")
    raise DvxError("ตู้ '%s' กำกวม ตรงหลายตัว: %s — ระบุ machine_id ให้ชัด"
                   % (mid, ", ".join(h["machine_id"] for h in hits)))


# ── ยอดขาย ──────────────────────────────────────────────────────────────
def query_sales(days=1, date=None, from_date=None, to_date=None,
                machine=None, group_by="machine", top=10):
    """สรุปยอดขาย · group_by = machine | sku | day"""
    if group_by not in ("machine", "sku", "day"):
        raise DvxError("group_by ต้องเป็น machine, sku หรือ day")
    d1, d2 = resolve_range(days, date, from_date, to_date)
    machines = load_machines(active_only=False)
    mname = {m["machine_id"]: machine_label(m) for m in machines}
    morder = {m["machine_id"]: m.get("id") or 999 for m in machines}
    target = resolve_machine(machine, machines) if machine else None

    q = ("sales?select=machine_id,sku_id,quantity_sold,grand_total,sold_at,transaction_id"
         f"&sold_at=gte.{utc_bound(d1)}&sold_at=lt.{utc_bound(d2, end=True)}")
    if target:
        q += f"&machine_id=eq.{target}"
    rows = sb_get(q)

    sku_name = {s["sku_id"]: (s.get("name") or s["sku_id"])
                for s in sb_get("skus?select=sku_id,name")}

    total_rev = sum(float(r.get("grand_total") or 0) for r in rows)
    total_qty = sum(int(r.get("quantity_sold") or 0) for r in rows)
    txns = len({r.get("transaction_id") for r in rows if r.get("transaction_id")})
    n_days = (d2 - d1).days + 1

    breakdown = []
    if group_by == "machine":
        agg = collections.defaultdict(lambda: {"revenue": 0.0, "packs": 0})
        for r in rows:
            a = agg[r["machine_id"]]
            a["revenue"] += float(r.get("grand_total") or 0)
            a["packs"] += int(r.get("quantity_sold") or 0)
        for mid, a in sorted(agg.items(), key=lambda kv: morder.get(kv[0], 999)):
            breakdown.append({
                "machine_id": mid, "name": mname.get(mid, mid),
                "revenue": round(a["revenue"]), "packs": a["packs"],
                "share_pct": round(a["revenue"] / total_rev * 100, 1) if total_rev else 0,
            })
    elif group_by == "sku":
        agg = collections.defaultdict(lambda: {"revenue": 0.0, "packs": 0})
        for r in rows:
            a = agg[r.get("sku_id") or "(ไม่ระบุ)"]
            a["revenue"] += float(r.get("grand_total") or 0)
            a["packs"] += int(r.get("quantity_sold") or 0)
        ranked = sorted(agg.items(), key=lambda kv: kv[1]["revenue"], reverse=True)[:top]
        for rank, (sku, a) in enumerate(ranked, 1):
            breakdown.append({
                "rank": rank, "sku_id": sku, "name": sku_name.get(sku, sku),
                "revenue": round(a["revenue"]), "packs": a["packs"],
            })
    else:  # day
        agg = collections.defaultdict(lambda: {"revenue": 0.0, "packs": 0})
        for r in rows:
            dt = datetime.fromisoformat(r["sold_at"][:19]).replace(tzinfo=timezone.utc)
            a = agg[dt.astimezone(TH).date()]
            a["revenue"] += float(r.get("grand_total") or 0)
            a["packs"] += int(r.get("quantity_sold") or 0)
        for day in sorted(agg):
            a = agg[day]
            breakdown.append({
                "date": str(day), "date_th": thai_date(day),
                "revenue": round(a["revenue"]), "packs": a["packs"],
            })

    return {
        "from": str(d1), "to": str(d2), "days": n_days,
        "machine": mname.get(target, target) if target else "ทุกตู้",
        "revenue": round(total_rev), "packs": total_qty, "transactions": txns,
        "revenue_per_day": round(total_rev / n_days) if n_days else 0,
        "group_by": group_by, "breakdown": breakdown,
        "note": ("ยอดขาย sync วันละครั้งตอนเที่ยงคืน (ยอดเมื่อวาน) — "
                 "ถ้าถามวันนี้แล้วได้ 0 แปลว่ายังไม่ได้ sync"),
    }


# ── สต็อกหน้าตู้ ────────────────────────────────────────────────────────
def _is_box(product_name):
    return "box" in (product_name or "").lower()


def query_stock(machine=None, low_only=False, low_threshold=2):
    """ของเหลือรายช่อง · low_only = เฉพาะช่องที่เหลือ <= low_threshold"""
    machines = load_machines(active_only=True)
    mname = {m["machine_id"]: machine_label(m) for m in machines}
    morder = {m["machine_id"]: m.get("id") or 999 for m in machines}
    target = resolve_machine(machine, machines) if machine else None

    q = ("machine_stock?select=machine_id,slot_number,product_name,sku_id,remain,"
         "max_capacity,is_occupied,synced_at&is_occupied=eq.true&order=machine_id,slot_number")
    if target:
        q += f"&machine_id=eq.{target}"
    rows = [r for r in sb_get(q) if r["machine_id"] in mname]

    if not rows:
        return {"synced_at": None, "machines": [],
                "note": "ไม่มีข้อมูลสต็อกหน้าตู้ — ลองสั่ง sync ก่อน"}

    synced = max((r.get("synced_at") or "" for r in rows), default="")
    synced_th, age_h = None, None
    if synced:
        dt = datetime.fromisoformat(synced[:19]).replace(tzinfo=timezone.utc).astimezone(TH)
        synced_th = dt.strftime("%Y-%m-%d %H:%M")
        age_h = round((datetime.now(TH) - dt).total_seconds() / 3600, 1)

    by_machine = collections.defaultdict(list)
    for r in rows:
        by_machine[r["machine_id"]].append(r)

    out = []
    for mid in sorted(by_machine, key=lambda x: morder.get(x, 999)):
        slots = by_machine[mid]
        shown = [s for s in slots if (s.get("remain") or 0) <= low_threshold] if low_only else slots
        out.append({
            "machine_id": mid, "name": mname.get(mid, mid),
            "slots_total": len(slots),
            "units_total": sum(s.get("remain") or 0 for s in slots),
            "slots_empty": sum(1 for s in slots if (s.get("remain") or 0) == 0),
            "slots": [{
                "slot": s.get("slot_number"),
                "product": s.get("product_name"),
                "sku_id": s.get("sku_id"),
                "remain": s.get("remain") or 0,
                "capacity": s.get("max_capacity") or 0,
                "unit": "box" if _is_box(s.get("product_name")) else "pack",
            } for s in sorted(shown, key=lambda x: (x.get("remain") or 0))],
        })

    return {
        "synced_at": synced_th, "age_hours": age_h,
        "stale": bool(age_h and age_h > 24),
        "filtered": "เฉพาะช่องที่เหลือ <= %d" % low_threshold if low_only else "ทุกช่อง",
        "machines": out,
        "note": "หน่วยต่างกันต่อช่อง — ช่อง unit=box นับเป็นกล่อง อย่ารวมกับ pack",
    }


# ── เตือนเติมสต็อก ──────────────────────────────────────────────────────
def query_restock_alerts(threshold_days=1.0, min_velocity=2.0):
    """SKU ขายดีที่กำลังจะหมด — logic เดียวกับ restock_guard.py

    days_cover = สต็อก(ซอง) / velocity(ซอง/วัน) จากยอดขาย 14 วันล่าสุด
    """
    machines = load_machines(active_only=True)
    mname = {m["machine_id"]: machine_label(m) for m in machines}
    active_ids = set(mname)

    skus = sb_get("skus?select=sku_id,name,packs_per_box")
    packs_per_box = {s["sku_id"]: (s.get("packs_per_box") or 1) for s in skus}
    sku_name = {s["sku_id"]: (s.get("name") or s["sku_id"]) for s in skus}

    stock = sb_get("machine_stock?select=machine_id,sku_id,product_name,remain,is_occupied"
                   "&is_occupied=eq.true")
    since = (datetime.now(timezone.utc) - timedelta(days=SALES_WINDOW_DAYS)).strftime("%Y-%m-%d")
    sales = sb_get(f"sales?select=machine_id,sku_id,quantity_sold,sold_at&sold_at=gte.{since}")

    # สต็อกรวมเป็น "ซอง" ต่อ (ตู้, SKU) — ช่องกล่องคูณ packs_per_box
    stock_packs = collections.defaultdict(int)
    for r in stock:
        mid, sku = r.get("machine_id"), r.get("sku_id")
        if mid not in active_ids or not sku:
            continue
        units = r.get("remain") or 0
        if _is_box(r.get("product_name")):
            units *= packs_per_box.get(sku, 1)
        stock_packs[(mid, sku)] += units

    sold = collections.defaultdict(int)
    for s in sales:
        mid, sku = s.get("machine_id"), s.get("sku_id")
        if mid in active_ids and sku:
            sold[(mid, sku)] += s.get("quantity_sold") or 0

    TIER = {0: "หมดแล้ว", 1: "หมดวันนี้", 2: "เสี่ยงหมด"}
    alerts = []
    for (mid, sku), total_sold in sold.items():
        vel = total_sold / SALES_WINDOW_DAYS
        if vel < min_velocity:
            continue                      # ขายช้า — ไม่ต้องเตือน
        stk = stock_packs.get((mid, sku), 0)
        days_cover = stk / vel if vel > 0 else 999
        if stk == 0:
            tier = 0
        elif days_cover < 0.5:
            tier = 1
        elif days_cover < threshold_days:
            tier = 2
        else:
            continue                      # ยังพอ
        alerts.append({
            "machine_id": mid, "machine": mname.get(mid, mid),
            "sku_id": sku, "sku": sku_name.get(sku, sku),
            "stock_packs": round(stk), "velocity_per_day": round(vel, 1),
            "days_cover": round(days_cover, 2),
            "severity": TIER[tier], "_tier": tier,
        })

    alerts.sort(key=lambda a: (a["_tier"], a["days_cover"]))
    for a in alerts:
        a.pop("_tier")

    return {
        "threshold_days": threshold_days, "min_velocity": min_velocity,
        "sales_window_days": SALES_WINDOW_DAYS,
        "count": len(alerts),
        "out_of_stock": sum(1 for a in alerts if a["severity"] == "หมดแล้ว"),
        "alerts": alerts,
        "note": ("คำนวณจากสต็อกที่ sync ล่าสุดเทียบ velocity 14 วัน — "
                 "ถ้าเพิ่งเติมของแล้วยังไม่ sync ตัวเลขจะยังเป็นของเก่า"),
    }
