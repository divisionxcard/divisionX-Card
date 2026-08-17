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
import urllib.parse
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


# ── การตลาด ─────────────────────────────────────────────────────────────
def _clip(text, n):
    """ตัดข้อความยาวให้พอดีบริบทของ agent · เก็บ HTML ดิบไม่มีประโยชน์"""
    t = " ".join((text or "").split())
    return t if len(t) <= n else t[:n].rstrip() + "…"


def _th_stamp(iso):
    """'2026-08-17T10:20:00+00:00' → '17 ส.ค.' (เวลาไทย) · คืน None ถ้าว่าง"""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TH)
    except ValueError:
        return None
    return thai_date(dt.date())


def query_marketing_ideas(status="new", limit=20, source=None, sku=None):
    """ไอเดียคอนเทนต์ที่ตัวเก็บไอเดียหามาได้ — เรียงตามคะแนนความเกี่ยวข้อง

    status: new (ยังไม่ได้ใช้) · picked (เลือกไปเขียนแล้ว) · all
    source: news · tiktok · youtube · internal
    """
    q = ("marketing_ideas?select=id,status,source,source_label,title,summary,url,"
         "angle,chosen_angle,score,related_sku,content_id,created_at")
    if status and status != "all":
        q += f"&status=eq.{status}"
    if source:
        q += f"&source=eq.{source}"
    if sku:
        q += f"&related_sku=eq.{urllib.parse.quote(sku)}"
    rows = sb_get(q + "&order=score.desc,created_at.desc")

    by_source = collections.Counter(r.get("source") or "?" for r in rows)
    by_sku = collections.Counter(r["related_sku"] for r in rows if r.get("related_sku"))
    # มุมเล่าซ้ำ = รากของปัญหาคอนเทนต์ซ้ำ (ดู idea_angles.py) — นับให้ agent เห็นเลย
    angles = collections.Counter(
        (r.get("chosen_angle") or r.get("angle") or "").strip() for r in rows
    )
    angles.pop("", None)
    dup_angles = [{"angle": _clip(a, 60), "count": c} for a, c in angles.most_common(3) if c > 1]

    ideas = [{
        "id": r["id"], "status": r.get("status"), "source": r.get("source"),
        "title": _clip(r.get("title"), 120),
        "angle": _clip(r.get("chosen_angle") or r.get("angle"), 160),
        "summary": _clip(r.get("summary"), 200),
        "score": r.get("score"), "related_sku": r.get("related_sku"),
        "url": r.get("url"), "created": _th_stamp(r.get("created_at")),
        "written": bool(r.get("content_id")),
    } for r in rows[:max(1, limit)]]

    return {
        "status": status, "total": len(rows), "showing": len(ideas),
        "by_source": dict(by_source),
        "top_sku": dict(by_sku.most_common(5)),
        "repeated_angles": dup_angles,
        "ideas": ideas,
        "note": ("เรียงตามคะแนนความเกี่ยวข้องกับสินค้าที่เราขายจริง (นับคำที่ตรง ไม่ได้ใช้ AI) — "
                 "คะแนนสูงไม่ได้แปลว่าคอนเทนต์จะดี แค่แปลว่าเกี่ยวกับของที่เรามี · "
                 "ถ้า repeated_angles มีตัวเลขสูง แปลว่าโจทย์ซ้ำตั้งแต่ต้นทาง เขียนยังไงก็จะออกมาแนวเดียวกัน"),
    }


def query_content_queue(status=None, limit=20):
    """คิวคอนเทนต์ — ร่าง/รออนุมัติ/ถูกตีตก/โพสต์แล้ว พร้อมเหตุผลที่ถูกตีตก

    status: draft · pending · approved · rejected · posted · (ว่าง = ทุกสถานะ)
    """
    q = ("marketing_content?select=id,status,platform,caption,content_format,source_sku,"
         "source_reason,reject_reason,scheduled_at,posted_at,post_url,idea_id,created_at")
    if status:
        q += f"&status=eq.{status}"
    rows = sb_get(q + "&order=created_at.desc")

    by_status = collections.Counter(r.get("status") or "?" for r in rows)
    by_format = collections.Counter(r["content_format"] for r in rows if r.get("content_format"))
    rejects = collections.Counter(
        _clip(r.get("reject_reason"), 60) for r in rows
        if r.get("status") == "rejected" and r.get("reject_reason")
    )

    items = [{
        "id": r["id"], "status": r.get("status"), "platform": r.get("platform"),
        "format": r.get("content_format"), "sku": r.get("source_sku"),
        "caption": _clip(r.get("caption"), 300),
        "why_written": _clip(r.get("source_reason"), 120),
        "reject_reason": _clip(r.get("reject_reason"), 160),
        "created": _th_stamp(r.get("created_at")),
        "posted": _th_stamp(r.get("posted_at")),
        "post_url": r.get("post_url"),
        "idea_id": r.get("idea_id"),
    } for r in rows[:max(1, limit)]]

    posted = by_status.get("posted", 0)
    return {
        "status_filter": status or "ทุกสถานะ",
        "total": len(rows), "showing": len(items),
        "by_status": dict(by_status),
        "by_format": dict(by_format.most_common()),
        "top_reject_reasons": [{"reason": r, "count": c} for r, c in rejects.most_common(5)],
        "items": items,
        "note": ("⚠ ระบบยังไม่เก็บผลลัพธ์ของโพสต์ (ยอดวิว/เอนเกจ) — ตอบไม่ได้ว่าคอนเทนต์แบบไหนเวิร์ก "
                 "บอกได้แค่ว่าผลิตอะไรไปบ้างและอะไรถูกตีตก · "
                 f"โพสต์จริงแล้ว {posted} ชิ้นจากทั้งหมด {len(rows)} ชิ้น"),
    }


# ── ด่านตรวจคอนเทนต์ (AI ตรวจก่อนถึงมือคน) ───────────────────────────────
VOICE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "tasks", "content_voice.json")


def load_content_rules():
    """กฎแบรนด์ตัวจริงจาก content_voice.json — ผู้ตรวจต้องตรวจกับไฟล์นี้ ไม่ใช่กับความจำ"""
    try:
        with open(VOICE_FILE, encoding="utf-8-sig") as f:
            v = json.load(f)
    except (OSError, ValueError) as e:
        raise DvxError(f"อ่าน content_voice.json ไม่ได้: {e}")
    return {
        "brand": v.get("brand"), "slogan": v.get("slogan"),
        "audience": v.get("audience"), "tone": v.get("tone"),
        "catchphrases": v.get("catchphrases", []),
        "hard_rules": v.get("rules", []),
        "example_good": v.get("example"),
        "formats": [{"key": f.get("key"), "label": f.get("label")}
                    for f in v.get("content_formats", [])],
    }


def query_content_for_review(limit=10, include_reviewed=False):
    """คอนเทนต์ที่รอคนอนุมัติและยังไม่ผ่านด่านตรวจ + กฎแบรนด์ที่ต้องใช้ตรวจ

    ส่งกฎไปพร้อมกันตั้งใจ — ผู้ตรวจจะได้เทียบกับกฎจริงที่แก้ได้จากไฟล์
    ไม่ใช่ตรวจตามที่จำมาซึ่งจะเพี้ยนตามเวลา
    """
    q = ("marketing_content?select=id,status,platform,caption,content_format,source_sku,"
         "source_reason,idea_id,created_at,review_verdict,review_notes,revision_count"
         "&status=in.(pending,draft)")
    if not include_reviewed:
        q += "&review_verdict=is.null"
    try:
        rows = sb_get(q + "&order=created_at.asc")
    except DvxError as e:
        # ยังไม่ได้รัน migration — บอกทางแก้ให้ชัด ดีกว่าโยน SQL error ดิบ ๆ ใส่หน้า agent
        if "review_verdict" in str(e) and "does not exist" in str(e):
            raise DvxError("ตาราง marketing_content ยังไม่มีคอลัมน์สำหรับเก็บผลตรวจ — "
                           "ต้องรัน backend/database/migrations/066_content_review.sql "
                           "ใน Supabase SQL Editor ก่อน แล้วค่อยเรียกใหม่")
        raise

    # แคปชั่นที่โพสต์/อนุมัติไปแล้ว — ให้ผู้ตรวจดูว่าชิ้นใหม่ซ้ำแนวเดิมไหม
    recent = sb_get("marketing_content?select=caption&status=in.(posted,approved)"
                    "&order=created_at.desc&limit=8")

    items = [{
        "id": r["id"], "status": r.get("status"), "platform": r.get("platform"),
        "format": r.get("content_format"), "sku": r.get("source_sku"),
        "caption": r.get("caption"),          # ตัวเต็ม — ตรวจงานต้องเห็นของจริงทั้งชิ้น
        "why_written": _clip(r.get("source_reason"), 200),
        "revision_count": r.get("revision_count") or 0,
        "created": _th_stamp(r.get("created_at")),
    } for r in rows[:max(1, limit)]]

    return {
        "waiting": len(rows), "showing": len(items),
        "rules": load_content_rules(),
        "recent_published": [_clip(r.get("caption"), 160) for r in recent if r.get("caption")],
        "items": items,
        "note": ("ตรวจทีละชิ้นแล้วบันทึกผลด้วย review_content — pass ถ้าโพสต์ได้เลย · "
                 "fix ถ้าควรแก้ (ต้องบอกจุดที่แก้ได้จริง ไม่ใช่คำติลอย ๆ) · drop ถ้าไม่ควรใช้ชิ้นนี้ · "
                 "recent_published มีไว้เทียบว่าซ้ำแนวเดิมไหม ไม่ใช่ตัวอย่างให้เลียนแบบ"),
    }


def save_content_review(content_id, verdict, notes, reviewer="hermes"):
    """บันทึกผลตรวจ — ไม่แตะ status ของคอนเทนต์ คนยังเป็นผู้ตัดสินเหมือนเดิม"""
    verdict = (verdict or "").strip().lower()
    if verdict not in ("pass", "fix", "drop"):
        raise DvxError(f"verdict ต้องเป็น pass / fix / drop เท่านั้น (ได้ '{verdict}')")
    notes = (notes or "").strip()
    if verdict != "pass" and len(notes) < 10:
        raise DvxError("verdict fix/drop ต้องเขียนเหตุผลให้ชัดว่าติดตรงไหน แก้ยังไง")

    body = json.dumps({
        "review_verdict": verdict, "review_notes": notes[:2000],
        "reviewed_at": datetime.now(timezone.utc).isoformat(), "reviewed_by": reviewer,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/marketing_content?id=eq.{int(content_id)}",
        data=body, method="PATCH",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:200]
        if "review_verdict" in detail and "column" in detail:
            raise DvxError("ตาราง marketing_content ยังไม่มีคอลัมน์ review_* — "
                           "ต้องรัน migration 066_content_review.sql ก่อน")
        raise DvxError(f"บันทึกผลตรวจไม่สำเร็จ (HTTP {e.code}): {detail}")
    if not out:
        raise DvxError(f"ไม่เจอคอนเทนต์ id={content_id}")
    return {"saved": True, "id": out[0]["id"], "verdict": verdict,
            "note": "บันทึกความเห็นแล้ว — สถานะยังเป็นของเดิม รอคนตัดสินใจขั้นสุดท้าย"}


# ── ปฏิทินโพสต์ ─────────────────────────────────────────────────────────
# เวลาที่ตั้งไว้จะถูกโพสต์ขึ้นเพจอัตโนมัติเมื่อถึงกำหนด (workflow marketing-autopost)
# จึงต้องกันเวลาย้อนหลังและกันตั้งชนกันไว้ที่ชั้นนี้ ไม่ใช่ไปหวังว่า agent จะคิดเอง
MIN_GAP_MINUTES = 45        # โพสต์ติดกันเกินนี้คนตามอ่านไม่ทัน และดูเหมือนสแปม


def _iso_z(dt):
    """datetime → '2026-08-17T08:30:00Z' — ใช้ในสตริง query เท่านั้น
    ⚠ ห้ามใช้ isoformat() ตรง ๆ ใน query: '+00:00' จะถูกตีความเป็นช่องว่าง
      แล้ว PostgREST ตอบ 400 invalid input syntax for timestamp (เจอจริงตอนเขียนฟังก์ชันนี้)"""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def query_post_plan(days=14, include_unscheduled=True):
    """แผนการโพสต์ข้างหน้า + ของที่อนุมัติแล้วแต่ยังไม่มีวัน

    ผู้วางแผนต้องเห็นสองอย่างนี้พร้อมกัน ไม่งั้นจะวางทับของเดิมหรือลืมของที่รออยู่
    """
    now = datetime.now(timezone.utc)
    until = _iso_z(now + timedelta(days=max(1, days)))
    rows = sb_get("marketing_content?select=id,status,caption,content_format,source_sku,"
                  "scheduled_at,posted_at,post_url,review_verdict,review_notes"
                  f"&scheduled_at=gte.{_iso_z(now)}&scheduled_at=lte.{until}"
                  "&order=scheduled_at.asc")
    planned = [{
        "id": r["id"], "status": r.get("status"),
        "when_th": _th_datetime(r.get("scheduled_at")),
        "scheduled_at": r.get("scheduled_at"),
        "format": r.get("content_format"), "sku": r.get("source_sku"),
        "review": r.get("review_verdict"),
        "caption": _clip(r.get("caption"), 120),
    } for r in rows]

    waiting = []
    if include_unscheduled:
        pend = sb_get("marketing_content?select=id,status,caption,content_format,source_sku,"
                      "review_verdict,review_notes&status=eq.approved&scheduled_at=is.null"
                      "&post_id=is.null&order=created_at.asc")
        waiting = [{
            "id": r["id"], "format": r.get("content_format"), "sku": r.get("source_sku"),
            "review": r.get("review_verdict"),
            "review_notes": _clip(r.get("review_notes"), 160),
            "caption": _clip(r.get("caption"), 120),
        } for r in pend]

    return {
        "now_th": _th_datetime(now.isoformat()),
        "window_days": days,
        "planned_count": len(planned), "waiting_count": len(waiting),
        "min_gap_minutes": MIN_GAP_MINUTES,
        "planned": planned,
        "waiting_for_date": waiting,
        "note": ("ของใน planned จะถูกโพสต์ขึ้นเพจอัตโนมัติเมื่อถึงเวลา (ตรวจทุก 15 นาที) — "
                 "เฉพาะที่เจ้าของอนุมัติแล้วเท่านั้น ชิ้นที่ผู้ตรวจให้ drop ตัวตั้งเวลาจะไม่โพสต์ · "
                 f"เว้นระยะระหว่างโพสต์อย่างน้อย {MIN_GAP_MINUTES} นาที"),
    }


def query_post_performance(days=30, min_sample=10):
    """ผลลัพธ์โพสต์บนเพจ — ไลก์/คอมเมนต์/แชร์ ต่อโพสต์ + สรุปว่าอะไรเวิร์ก

    ใช้สแนปช็อตล่าสุดของแต่ละโพสต์เป็นตัวเลขปัจจุบัน และสแนปช็อตที่อายุใกล้ 24 ชม.
    เป็นตัวเทียบข้ามโพสต์ (โพสต์เก่ามีเวลาสะสมมากกว่า เทียบตัวเลขปัจจุบันตรง ๆ ไม่ยุติธรรม)
    """
    since = _iso_z(datetime.now(timezone.utc) - timedelta(days=max(1, days)))
    try:
        snaps = sb_get("post_metrics?select=post_id,content_id,posted_at,message,permalink,"
                       "reactions,likes,comments,shares,clicks,age_hours,captured_at"
                       f"&posted_at=gte.{since}&order=captured_at.asc")
    except DvxError as e:
        # PostgREST บอกว่าไม่มีตารางได้ 2 แบบ: 404 PGRST205 (ไม่อยู่ใน schema cache)
        # กับ 42P01 ของ Postgres — ดักทั้งคู่ ไม่งั้น agent จะเห็น error ดิบที่ทำอะไรต่อไม่ถูก
        if "post_metrics" in str(e) and any(k in str(e) for k in
                                            ("PGRST205", "does not exist", "42P01", "Could not find")):
            raise DvxError("ยังไม่มีตาราง post_metrics — ต้องรัน "
                           "backend/database/migrations/067_post_metrics.sql ใน Supabase ก่อน")
        raise
    if not snaps:
        return {"posts": 0, "note": "ยังไม่มีข้อมูลผลลัพธ์โพสต์ — ตัวเก็บยังไม่ได้รัน "
                                    "หรือเพจยังไม่มีโพสต์ในช่วงเวลานี้"}

    latest, at24 = {}, {}
    for s in snaps:
        pid = s["post_id"]
        latest[pid] = s                      # เรียงตาม captured_at แล้ว ตัวท้ายคือล่าสุด
        age = float(s.get("age_hours") or 0)
        if age <= 30:                        # เผื่อรอบเก็บคลาด — 24±6 ชม. ยังเทียบกันได้
            prev = at24.get(pid)
            if prev is None or abs(age - 24) < abs(float(prev.get("age_hours") or 0) - 24):
                at24[pid] = s

    # ผูกกับคอนเทนต์ในระบบเพื่อรู้ว่ารูปแบบไหน/สินค้าไหน (โพสต์มือจะไม่มี)
    cids = [v["content_id"] for v in latest.values() if v.get("content_id")]
    meta = {}
    if cids:
        ids = ",".join(str(c) for c in set(cids))
        for c in sb_get(f"marketing_content?select=id,content_format,source_sku&id=in.({ids})"):
            meta[c["id"]] = c

    posts = []
    for pid, s in latest.items():
        m = meta.get(s.get("content_id")) or {}
        first_day = at24.get(pid)
        posts.append({
            "post_id": pid,
            "posted_th": _th_datetime(s.get("posted_at")),
            "hour_th": int(datetime.fromisoformat(s["posted_at"].replace("Z", "+00:00"))
                           .astimezone(TH).strftime("%H")) if s.get("posted_at") else None,
            "from_system": bool(s.get("content_id")),
            "format": m.get("content_format"), "sku": m.get("source_sku"),
            "reactions": s.get("reactions"), "comments": s.get("comments"),
            "shares": s.get("shares"), "clicks": s.get("clicks"),
            "reactions_24h": (first_day or {}).get("reactions"),
            "age_hours": s.get("age_hours"),
            "message": _clip(s.get("message"), 90),
            "permalink": s.get("permalink"),
        })
    posts.sort(key=lambda p: (p["reactions"] or 0), reverse=True)

    def avg(rows, key):
        vals = [r[key] for r in rows if r.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    by_format = {}
    for p in posts:
        if p["format"]:
            by_format.setdefault(p["format"], []).append(p)
    by_hour = {}
    for p in posts:
        if p["hour_th"] is not None:
            by_hour.setdefault(p["hour_th"], []).append(p)

    n = len(posts)
    return {
        "posts": n,
        "window_days": days,
        "from_system": sum(1 for p in posts if p["from_system"]),
        "avg_reactions": avg(posts, "reactions"),
        "avg_reactions_24h": avg(posts, "reactions_24h"),
        # enough = ช่องนี้มีโพสต์พอจะเชื่อได้ไหม — ค่าเฉลี่ยจาก 1-2 โพสต์คือความบังเอิญ
        # ไม่ใช่ข้อสรุป · ตัดสินใจจากมันคือวิธีสร้างความมั่นใจผิด ๆ ที่ดูมีข้อมูลรองรับ
        "by_format": {k: {"posts": len(v), "avg_reactions": avg(v, "reactions"),
                          "enough": len(v) >= 3}
                      for k, v in sorted(by_format.items())},
        "by_hour_th": {str(k): {"posts": len(v), "avg_reactions": avg(v, "reactions"),
                                "enough": len(v) >= 3}
                       for k, v in sorted(by_hour.items())},
        "top": posts[:10],
        "note": (
            f"⚠ มีแค่ {n} โพสต์ — ยังน้อยเกินกว่าจะสรุปว่ารูปแบบไหนหรือเวลาไหนดีกว่า "
            f"(ควรมีอย่างน้อย {min_sample} โพสต์) บอกได้แค่ว่าโพสต์ไหนได้เยอะกว่า "
            "อย่าเปลี่ยนกลยุทธ์จากตัวเลขชุดนี้"
            if n < min_sample else
            "reactions_24h คือตัวเทียบที่ยุติธรรมข้ามโพสต์ ส่วน reactions คือยอดสะสมถึงตอนนี้ "
            "(เป็น null ถ้าเริ่มเก็บหลังโพสต์ไปนานแล้ว — จะมีค่าเฉพาะโพสต์ที่เก็บตั้งแต่วันแรก) "
            "· ช่องที่ enough=false มีโพสต์น้อยกว่า 3 ชิ้น ห้ามใช้สรุปว่าเวลาไหน/รูปแบบไหนดีกว่า "
            "· ไม่มี reach เพราะ Meta ปลด metric ออกจาก Graph API แล้ว"
        ),
    }


def _th_datetime(iso):
    """ISO (UTC) → '17 ส.ค. 19:30' เวลาไทย"""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TH)
    except ValueError:
        return None
    return f"{thai_date(dt.date())} {dt:%H:%M}"


def _parse_th_when(when):
    """'2026-08-18 19:30' หรือ '2026-08-18T19:30' (เวลาไทย) → datetime UTC"""
    s = (when or "").strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=TH).astimezone(timezone.utc)
        except ValueError:
            continue
    raise DvxError(f"อ่านเวลาไม่ออก: '{when}' — ใช้รูปแบบ 'YYYY-MM-DD HH:MM' (เวลาไทย)")


def schedule_content(content_id, when, force=False):
    """กำหนดเวลาโพสต์ให้คอนเทนต์ 1 ชิ้น (เวลาไทย) — ถึงเวลาแล้วระบบจะโพสต์เอง"""
    target = _parse_th_when(when)
    now = datetime.now(timezone.utc)
    if target < now - timedelta(minutes=5):
        raise DvxError(f"เวลาที่ให้มาเป็นอดีต ({_th_datetime(target.isoformat())}) — "
                       "ตั้งเวลาย้อนหลังแล้วระบบจะโพสต์ทันทีในรอบถัดไป ซึ่งไม่ใช่การวางแผน")

    rows = sb_get(f"marketing_content?select=id,status,caption,review_verdict,post_id,scheduled_at"
                  f"&id=eq.{int(content_id)}")
    if not rows:
        raise DvxError(f"ไม่เจอคอนเทนต์ id={content_id}")
    item = rows[0]
    if item.get("post_id"):
        raise DvxError("ชิ้นนี้โพสต์ขึ้นเพจไปแล้ว")
    if item.get("status") not in ("pending", "approved", "scheduled"):
        raise DvxError(f"สถานะ '{item.get('status')}' ตั้งเวลาโพสต์ไม่ได้ "
                       "(ต้องเป็น pending / approved / scheduled)")
    if item.get("review_verdict") == "drop" and not force:
        raise DvxError("ผู้ตรวจระบุว่าไม่ควรใช้ชิ้นนี้ (drop) — ถ้ายืนยันจริงให้ส่ง force=True")

    # กันตั้งชนกัน — ดูของที่วางไว้แล้วในช่วง ±MIN_GAP_MINUTES
    lo = _iso_z(target - timedelta(minutes=MIN_GAP_MINUTES))
    hi = _iso_z(target + timedelta(minutes=MIN_GAP_MINUTES))
    near = sb_get(f"marketing_content?select=id,scheduled_at&scheduled_at=gte.{lo}"
                  f"&scheduled_at=lte.{hi}&id=neq.{int(content_id)}&post_id=is.null")
    if near and not force:
        others = ", ".join(f"id={n['id']} ({_th_datetime(n['scheduled_at'])})" for n in near[:3])
        raise DvxError(f"ใกล้กับโพสต์ที่วางไว้แล้วเกินไป (ห่างน้อยกว่า {MIN_GAP_MINUTES} นาที): {others} "
                       "— เลื่อนเวลาให้ห่างขึ้น หรือส่ง force=True ถ้าตั้งใจโพสต์ติดกัน")

    body = json.dumps({"scheduled_at": target.isoformat()}).encode("utf-8")
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/marketing_content?id=eq.{int(content_id)}",
        data=body, method="PATCH",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise DvxError(f"ตั้งเวลาไม่สำเร็จ (HTTP {e.code}): {e.read().decode('utf-8', 'ignore')[:200]}")

    auto = item.get("status") in ("approved", "scheduled")
    return {
        "saved": True, "id": out[0]["id"],
        "when_th": _th_datetime(target.isoformat()),
        "will_auto_post": auto,
        "note": ("ถึงเวลาแล้วระบบจะโพสต์ขึ้นเพจให้เอง (ตรวจทุก 15 นาที)" if auto else
                 "ชิ้นนี้ยังไม่ได้อนุมัติ — ตั้งเวลาไว้ได้ แต่จะไม่โพสต์จนกว่าเจ้าของจะอนุมัติ"),
    }
