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
import re
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
DOW_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
FRANCHISE_TH = {"OP": "One Piece", "DB": "Dragon Ball", "YGH": "Yu-Gi-Oh", "PKM": "Pokémon",
                "NRT": "Naruto", "MLP": "My Little Pony", "MLBB": "Mobile Legends",
                "TF": "Transformers", "SL": "Solo Leveling"}
BRAND_TH = {"vms": "VMS", "worldwide": "WorldWide", "payif": "Payif"}
SMALL_BASE = 1000           # ช่วงเทียบขายได้ไม่ถึงเท่านี้ % แกว่งแรง (เท่า DROP_MIN_BASE ของสรุปยอดทุกเช้า)
PROFIT_FORMULA = ("กำไรสุทธิ = ยอดขาย − ค่าธรรมเนียม Ksher (VMS 1.5% · WorldWide 0.5% · Payif 1.5%) "
                  "− ต้นทุนต่อซองตามวันที่ขาย × จำนวนซอง − เงินคืนเคลม "
                  "(สูตรเดียวกับสรุปยอดบอท DVX Job ทุกเช้า · ทุนชุดใหม่ใช้กับยอดตั้งแต่ 1 ส.ค. 2026)")


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
    q = "machines?select=id,machine_id,name,location,status,brand,config&order=id"
    if active_only:
        q += "&status=eq.active"
    return sb_get(q)


def machine_label(m):
    return m.get("name") or m.get("location") or m["machine_id"]


def _norm(s):
    """เทียบชื่อแบบไม่สนช่องว่าง/ตัวพิมพ์ — "เซ็นทรัล พระราม 2" = "เซ็นทรัลพระราม2" """
    return "".join(str(s or "").split()).lower()


def _branch_info(m):
    return (m.get("config") or {}).get("branch") or {}


def branch_id(m):
    """คีย์สาขา = ชื่อสาขาที่โชว์ลูกค้า (config.branch.display_name) ตัดช่องว่าง · ไม่มีค่อยใช้ location

    ไม่ใช้ location ล้วนแบบ branch_map ของสรุปยอดทุกเช้า — wwv02 (ปิดแล้ว) สะกด "เดอะมอลไลฟ์สโตร์" ขาด ล
    ห้างเดียวกับ wwv08 จึงแตกเป็น 2 สาขาเมื่อถามช่วงที่ wwv02 ยังขายอยู่ (พ.ค.–ส.ค.) · display_name ของทั้งคู่ตรงกัน
    ตู้ที่ยังใช้งานอยู่ตอนนี้แบ่งสาขาได้เท่ากันทั้งสองแบบ → กำไรรายสาขาช่วงหลังยังเท่าสรุปยอดทุกเช้า
    """
    return _norm(_branch_info(m).get("display_name") or m.get("location") or m.get("name") or m["machine_id"])


def branch_map(machines):
    """machine_id → (คีย์สาขา, ชื่อสาขา) — ชื่อที่ลูกค้าเห็นบนหน้าเว็บ"""
    out = {}
    for m in machines:
        b = _branch_info(m)
        out[m["machine_id"]] = (branch_id(m), b.get("display_name") or m.get("location") or machine_label(m))
    return out


def _machine_names(m):
    """ทุกชื่อที่คนใช้เรียกตู้นี้ — ชื่อตู้ · location · ชื่อสาขาที่โชว์ลูกค้า · ชื่อห้างในแผนที่"""
    b = _branch_info(m)
    return [m.get("name"), m.get("location"), b.get("display_name"), b.get("maps")]


def _ran_since(m, since):
    """ตู้ที่ปิดแล้วยังเปิดขายอยู่ช่วงไหนของคำถามไหม (since = วันแรกของช่วงที่ถาม · None = ถามสภาพตอนนี้)"""
    if since is None:
        return False
    retired = _branch_info(m).get("retired_at")
    return not retired or parse_date(str(retired)[:10]) >= since


def _resolve_one(spec, machines, since=None):
    """คำค้นเดียว → [machine_id] · ตรงหลายตู้ในห้างเดียวกัน = ทั้งสาขา (พระราม 2 มี 2 ตู้)

    ตรงทั้งตู้ที่ปิดแล้วกับตู้ที่ใช้งาน → เอาตู้ที่ใช้งาน (30 ต.ค. 2026 "เดอะมอลล์บางกะปิ" ไปโดน wwv02
    ที่ปิดตั้งแต่ 19 ส.ค. แล้วตอบแอดมินว่ายอด 0 เพราะยังไม่ซิงค์) · แต่ถ้าช่วงที่ถามย้อนไปถึงตอนที่
    ตู้ที่ปิดแล้วยังขายอยู่ (since <= วันปิด) ต้องรวมตู้นั้นด้วย ไม่งั้นยอดสาขาย้อนหลังหายเงียบ ๆ
    """
    ids = {m["machine_id"] for m in machines}
    if spec in ids:
        return [spec]
    key = _norm(spec)
    hits = [m for m in machines if key and any(_digit_safe_in(key, _norm(n)) for n in _machine_names(m))]
    if not hits:
        raise DvxError(f"ไม่พบตู้ '{spec}' — เรียก list_machines ดูรายชื่อก่อน")
    active = [m for m in hits if m.get("status") == "active"]
    if active:
        live = {branch_id(m) for m in active}
        pool = active + [m for m in hits if m.get("status") != "active"
                         and branch_id(m) in live and _ran_since(m, since)]
    else:
        pool = hits
    if len({branch_id(m) for m in pool}) == 1:
        return [m["machine_id"] for m in sorted(pool, key=lambda m: m.get("id") or 999)]
    raise DvxError("ตู้ '%s' กำกวม ตรงหลายสาขา: %s — ระบุ machine_id ให้ชัด"
                   % (spec, ", ".join(f"{m['machine_id']} ({machine_label(m)})" for m in active or pool)))


def resolve_machine(mid, machines):
    """รับ machine_id ตรง ๆ หรือคำค้นจากชื่อ/สาขา เช่น 'ชลบุรี' → chukes04 (ต้องได้ตู้เดียว)"""
    if not mid:
        return None
    hits = _resolve_one(mid, machines)
    if len(hits) == 1:
        return hits[0]
    raise DvxError("'%s' มีหลายตู้ในสาขาเดียวกัน: %s — ระบุ machine_id ให้ชัด" % (mid, ", ".join(hits)))


def resolve_machines(spec, machines, since=None):
    """'wwv05' · 'ซีคอน' · 'wwv05,wwv08' · 'ซีคอน กับ บางกะปิ' · 'พระราม 2' (ทั้งสาขา) → [machine_id]"""
    if not spec:
        return []
    out = []
    for part in re.split(r"\s*(?:,|/|\+|และ|กับ)\s*", str(spec)):
        if part.strip():
            out += [mid for mid in _resolve_one(part.strip(), machines, since) if mid not in out]
    return out


FRANCHISE_ALIASES = {      # ชื่อที่แอดมิน/Hermes พิมพ์จริง (ไทย · สะกดหลายแบบ) → รหัสค่าย
    "OP": ["onepiece", "วันพีซ", "วันพีช"], "DB": ["dragonball", "ดราก้อนบอล", "ดรากอนบอล"],
    "YGH": ["yugioh", "ยูกิโอ", "ยูกิ"], "PKM": ["pokemon", "โปเกมอน", "โปเกม่อน"],
    "NRT": ["naruto", "นารูโตะ", "นารุโตะ"], "MLP": ["mylittlepony", "โพนี่"],
    "MLBB": ["mobilelegends", "โมบายเลเจนด์"], "TF": ["transformers", "ทรานส์ฟอร์เมอร์ส"],
    "SL": ["sololeveling", "โซโลเลเวลลิ่ง"],
}
SKU_RENAMED = {"PKM Ghost": "PKM M5 Abyss Eye"}   # id เก่า → id ใหม่ (30 ต.ค. 2026 สินค้าเดียวกัน)


def _loose(s):
    """ตัดช่องว่าง/ขีด/เครื่องหมาย + ถอดวรรณยุกต์ละติน (é → e) — 'Yu-Gi-Oh' = 'yugioh' · 'Pokémon' = 'pokemon'"""
    import unicodedata
    t = unicodedata.normalize("NFKD", str(s or "").lower())
    return "".join(ch for ch in t if not unicodedata.combining(ch) and (ch.isalnum()))


def _sku_key(s):
    """เทียบรหัสสินค้าแบบไม่สนช่องว่าง/ขีด/เลขศูนย์นำหน้า — 'OP 1' = 'op-01' = 'OP 01'"""
    return re.sub(r"(?<=[a-z])0*(\d+)$", lambda mo: mo.group(1).zfill(2), _loose(s))


def _digit_safe_in(needle, hay):
    """needle อยู่ใน hay โดยไม่ไปตัดกลางตัวเลข — 'ut01' ใน 'yghut01' ได้ · 'b2' ใน 'b29' ไม่ได้ · 'op1' ใน 'op10' ไม่ได้"""
    return bool(needle) and re.search(r"(?<!\d)" + re.escape(needle) + r"(?!\d)", hay) is not None


def resolve_skus(spec, skus):
    """'OP 12' / 'op12' / 'OP 1' · 'UT01' · 'Naruto Jin02' · 'FB' (ทุก FB) · 'Dragon Ball' / 'ดราก้อนบอล' (ทั้งค่าย)
    · คั่นด้วย , ได้ → [sku_id]

    คำค้นที่มีเลขชุดห้ามไปตัดกลางตัวเลข — เดิม 'OP 1' หลุดไปขึ้นต้นด้วย 'op1' ได้ OP 10–17 ทั้งชุดแบบเงียบ ๆ
    """
    if not spec:
        return []
    active = {s["sku_id"] for s in skus if s.get("is_active", True)}
    out = []
    for part in [p.strip() for p in str(spec).split(",") if p.strip()]:
        key, loose = _sku_key(part), _loose(part)
        exact = [s["sku_id"] for s in skus if _sku_key(s["sku_id"]) == key]
        by_name = [s["sku_id"] for s in skus if _sku_key(s.get("name")) == key]
        fran = [code for code, names in FRANCHISE_ALIASES.items()
                if loose in [_loose(code), _loose(FRANCHISE_TH.get(code))] + [_loose(n) for n in names]]
        if exact or by_name:
            hits = exact or by_name
        elif fran:
            hits = [s["sku_id"] for s in skus if s.get("franchise") == fran[0]]
        elif re.search(r"\d$", loose):
            # มีเลขชุด: หาเฉพาะที่เลขตรงทั้งก้อน (ลองทั้งแบบพิมพ์มาและแบบเติมศูนย์) · ต้องได้ตัวเดียว ไม่งั้นถามกลับ
            hits = [s["sku_id"] for s in skus
                    if any(_digit_safe_in(n, h) for n in {loose, key}
                           for h in (_loose(s["sku_id"]), _loose(s.get("name")), _sku_key(s["sku_id"])))]
            hits = [h for h in hits if h in active] or hits
            if len(hits) > 1:
                raise DvxError(f"'{part}' ตรงหลายสินค้า: {', '.join(hits[:8])} — ระบุ sku_id ให้ชัด")
        else:
            hits = [s["sku_id"] for s in skus if _sku_key(s["sku_id"]).startswith(key)]
            if not hits:
                hits = [s["sku_id"] for s in skus if loose in _loose(s["sku_id"]) or loose in _loose(s.get("name"))]
                hits = [h for h in hits if h in active] or hits       # จับคู่หลวม — ตัดตัวที่เลิกขายแล้วเมื่อซ้ำกัน
        hits = list(dict.fromkeys(SKU_RENAMED.get(h, h) for h in hits))
        if not hits:
            raise DvxError(f"ไม่พบสินค้า '{part}' — ใช้ sku_id เช่น 'OP 12' หรือชื่อค่าย เช่น 'Dragon Ball'")
        out += [h for h in hits if h not in out]
    return out


# ── กติกาคำนวณยอดขาย/กำไร — ชุดเดียวกับสรุปยอด DVX Job ทุกเช้า ─────────
# เพิ่ม 31 ต.ค. 2026: แอดมินในกลุ่ม DVX_Admin ถาม Hermes เชิงวิเคราะห์ (กำไร · เทียบเดือน · ขายไม่ออก)
# แต่เครื่องมือเดิมมีแค่ยอดขาย → Hermes เดากำไรเป็น "20% ของยอดขาย" และเทียบรายการสินค้าผิดเอง
# ทางแก้คือให้เครื่องมือคิดให้เสร็จ ไม่ปล่อยให้โมเดลคิดเลขเอง
#
# ⚠️ ต้นทุน/ค่าธรรมเนียม/ตัดสาขา ดึงจาก daily_sales_digest.py ตรง ๆ ไม่เขียนซ้ำ — กำไรที่ Hermes ตอบ
#    ต้องเท่ากับที่บอทส่งเข้ากลุ่มทุกเช้าทุกบาท (เทสต์ scripts/test_dvx_sales_calc.py เทียบให้)
#    import ตอนใช้ ไม่ใช่บนสุด — idea_collector บน GitHub Actions ใช้ไฟล์นี้แต่ไม่ต้องคิดกำไร
# ต้นทุนต่อซองรายสินค้า: เจ้าของอนุญาตให้แอดมินรู้ (31 ต.ค. 2026 เลือกในหน้าไดอารี่) → get_sku_costs + คอลัมน์ในมุมราย SKU
# ⚠️ ตัวเลขทุนห้ามลง repo/wiki (repo สาธารณะ) — ดึงจาก DB ตอนเรียกเท่านั้น

def _dg():
    import daily_sales_digest as dg  # noqa: E402 — lazy (ดูหมายเหตุด้านบน)
    return dg


def _th_dt(sold_at):
    """sold_at (UTC ใน DB) → datetime เวลาไทย"""
    s = str(sold_at).replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TH)


def _quote_in(values):
    """ค่าใน filter in.(...) ของ PostgREST — sku_id มีช่องว่าง ต้องครอบเครื่องหมายคำพูด"""
    inner = ",".join('"%s"' % str(v).replace('"', "") for v in values)
    return urllib.parse.quote(f"({inner})", safe="(),")


def last_full_days(n, include_today=False, today=None):
    """N วันที่ "ครบวัน" ล่าสุด — จบที่เมื่อวาน (วันนี้ยังขายอยู่ ยอดยังไม่ครบ)

    30 ต.ค. 2026 Hermes ตอบ "7 วันล่าสุด" ด้วยช่วงที่รวมวันนี้ครึ่งวันแล้วเอาไปเทียบกับ 7 วันเต็ม
    """
    end = today or th_today()
    if not include_today:
        end -= timedelta(days=1)
    return end - timedelta(days=max(1, int(n or 1)) - 1), end


def pick_range(days=None, date=None, from_date=None, to_date=None, include_today=False):
    """date / from+to ชนะ · ไม่ระบุ = days วันที่ครบวันล่าสุด"""
    if date or from_date or to_date:
        return resolve_range(1, date, from_date, to_date)
    return last_full_days(days or 1, include_today)


def _sales_context(with_profit):
    """ข้อมูลประกอบการคำนวณ — ตู้ · ยี่ห้อ (ค่าธรรมเนียม) · สาขา · สินค้า · ต้นทุนตามวันที่"""
    dg = _dg()
    machines = load_machines(active_only=False)
    skus = sb_get("skus?select=sku_id,name,franchise,series,packs_per_box,avg_cost,cost_price,is_active&order=id")
    return {
        "machines": machines,
        "by_id": {m["machine_id"]: m for m in machines},
        "mname": {m["machine_id"]: machine_label(m) for m in machines},
        "morder": {m["machine_id"]: m.get("id") or 999 for m in machines},
        "brand": {m["machine_id"]: (m.get("brand") or "vms") for m in machines},
        "bmap": branch_map(machines),
        "skus": skus,
        "sku_meta": {s["sku_id"]: s for s in skus},
        # ไม่คิดกำไร = ยังต้องใช้ตัวนับซองของกล่อง (Costs.packs) ให้ตรงกับสรุปยอด
        "costs": dg.load_costs() if with_profit else dg.Costs(skus, []),
        "with_profit": with_profit,
    }


def _row_money(r, ctx):
    """แถวขาย 1 แถว → (ยอดขาย, จำนวนซอง, (ค่าธรรมเนียม, ต้นทุน) หรือ None = ไม่รู้ทุน)"""
    dg = _dg()
    rev = float(r.get("grand_total") or 0)
    qty = ctx["costs"].packs(r)
    if not ctx["with_profit"]:
        return rev, qty, None
    cost = ctx["costs"].on(r.get("sku_id") or "?", dg.thai_day(r["sold_at"]))
    if cost is None:
        return rev, qty, None
    fee = rev * dg.KSHER_FEE.get(ctx["brand"].get(r["machine_id"]), dg.KSHER_DEFAULT)
    return rev, qty, (fee, cost * qty)


_NUM = ("revenue", "packs", "box_orders", "box_packs", "box_revenue", "fee", "cogs", "costed_rev",
        "uncosted_rev", "refund", "profit")
_SETS = ("bills", "uncosted", "skus", "machines")


def _bucket():
    return {"revenue": 0.0, "packs": 0, "bills": set(), "box_orders": 0, "box_packs": 0,
            "box_revenue": 0.0, "fee": 0.0, "cogs": 0.0, "costed_rev": 0.0,
            "uncosted_rev": 0.0, "uncosted": set(), "refund": 0.0, "skus": set(),
            "profit": 0.0, "machines": set()}


def sum_buckets(buckets):
    """ยอดรวมจากรายตู้ด้วย sum() แบบเดียวกับ tot ของ summarize() — Python 3.12 sum() ชดเชยเศษทศนิยม
    ได้ค่าต่างจากบวกทีละตัว (+=) เมื่อปัดเศษที่ .5 พอดีจะต่างกัน 1 บาท (รายสาขาใช้ += แบบ by_branch)"""
    buckets = list(buckets)
    out = _bucket()
    for k in _NUM:
        out[k] = sum(b[k] for b in buckets)
    for k in _SETS:
        for b in buckets:
            out[k] |= b[k]
    return out


def merge_buckets(buckets):
    """รวมหลายกลุ่มเป็นกลุ่มเดียว ตามลำดับที่ส่งมา (ฟังก์ชันล้วน)

    ยอดรวม/รายสาขาต้องบวกจาก "รายตู้" ตามลำดับเดียวกับ summarize()/by_branch() ของสรุปยอด
    — บวกทศนิยมคนละลำดับ กำไรที่ลงท้าย .5 พอดี (ค่าธรรมเนียม WW 0.5%) ปัดคนละทาง ต่างกัน 1 บาท
    """
    out = _bucket()
    for b in buckets:
        for k in _NUM:
            out[k] += b[k]
        for k in _SETS:
            out[k] |= b[k]
    return out


def tally(rows, key_of, ctx, claims=(), claim_key=None):
    """รวมแถวขายเป็นกลุ่ม (ฟังก์ชันล้วน — ทดสอบได้) · key_of(row) → คีย์กลุ่ม

    กำไรของกลุ่ม = Σ(ยอด − ค่าธรรมเนียม − ทุน×ซอง) ของแถวที่รู้ทุน − เงินคืนเคลม
    เท่าสูตร summarize() ของสรุปยอดทุกเช้า · แถวไม่รู้ทุนไม่นับในกำไร แยกไว้ใน uncosted_rev
    """
    out = collections.defaultdict(_bucket)
    for r in rows:
        b = out[key_of(r)]
        rev, qty, money = _row_money(r, ctx)
        b["revenue"] += rev
        b["packs"] += qty
        b["skus"].add(r.get("sku_id") or "?")
        b["machines"].add(r["machine_id"])
        if r.get("transaction_id"):
            b["bills"].add(r["transaction_id"])
        if r.get("_unit") == "box":
            b["box_orders"] += 1
            b["box_packs"] += qty
            b["box_revenue"] += rev
        if not ctx["with_profit"]:
            continue
        if money is None:
            b["uncosted_rev"] += rev
            b["uncosted"].add(r.get("sku_id") or "?")
        else:
            b["costed_rev"] += rev
            b["fee"] += money[0]
            b["cogs"] += money[1]
            b["profit"] += rev - money[0] - money[1]      # ลำดับเดียวกับ summarize(): rev - fee - cost * qty
    if ctx["with_profit"] and claim_key:
        for c in claims:
            k = claim_key(c)
            if k is not None:
                amt = float(c.get("refund_amount") or 0)
                out[k]["refund"] += amt
                out[k]["profit"] -= amt
                if c.get("machine_id"):
                    out[k]["machines"].add(c["machine_id"])
    return out


def _profit(b):
    return b["profit"]


def grouped(rows, group_by, ctx, claims=()):
    """→ (ยอดรวม, กลุ่มตาม group_by) · ยอดรวมกับมุมตู้/สาขาบวกจากรายตู้ เหมือนสรุปยอดทุกเช้า"""
    m_key, m_claim = _group_key("machine", ctx)
    per = tally(rows, m_key, ctx, claims, m_claim)
    total = sum_buckets(per.values())
    if group_by == "machine":
        return total, per
    if group_by == "branch":
        out = collections.OrderedDict()
        for mid, b in per.items():
            key = ctx["bmap"].get(mid, (mid,))[0]
            out[key] = merge_buckets([out[key], b]) if key in out else merge_buckets([b])
        return total, out
    key_of, claim_key = _group_key(group_by, ctx)
    return total, tally(rows, key_of, ctx, claims, claim_key)


def _money(b, ctx, total_rev=None):
    """ตัวเลขมาตรฐานของ 1 กลุ่ม"""
    out = {"revenue": round(b["revenue"]), "packs": b["packs"], "transactions": len(b["bills"])}
    if total_rev is not None:
        out["share_pct"] = round(b["revenue"] / total_rev * 100, 1) if total_rev else 0
    if ctx["with_profit"]:
        p = _profit(b)
        out["net_profit"] = round(p)
        out["margin_pct"] = round(p / b["costed_rev"] * 100, 1) if b["costed_rev"] else None
    return out


def profit_block(b, sku_meta=None):
    """รายละเอียดกำไรของยอดรวม — ให้ Hermes อธิบายได้ว่ากำไรมาจากอะไร"""
    p = _profit(b)
    return {
        "net_profit": round(p),
        "margin_pct": round(p / b["costed_rev"] * 100, 1) if b["costed_rev"] else None,
        "revenue_counted": round(b["costed_rev"]),
        "fee_ksher": round(b["fee"]),
        "cost_of_goods": round(b["cogs"]),
        "claim_refunds": round(b["refund"]),
        "revenue_without_cost": round(b["uncosted_rev"]),
        "skus_without_cost": sorted(b["uncosted"]),
        "formula": PROFIT_FORMULA,
        "note": ("สินค้าที่ยังไม่มีต้นทุนในระบบไม่ถูกนับในกำไร (ดู skus_without_cost) — "
                 "ห้ามประมาณกำไรเป็น % ของยอดขายเอง") if b["uncosted"] else
                "ทุกแถวมีต้นทุนครบ — ใช้ตัวเลขนี้ได้เลย ห้ามประมาณกำไรเป็น % ของยอดขายเอง",
    }


def _fetch_sales(d1, d2, mids=None, skus=None):
    q = ("sales?select=machine_id,sku_id,quantity_sold,unit,grand_total,sold_at,transaction_id,"
         f"product_name_raw&sold_at=gte.{utc_bound(d1)}&sold_at=lt.{utc_bound(d2, end=True)}")
    if mids:
        q += "&machine_id=in." + _quote_in(mids)
    if skus:
        q += "&sku_id=in." + _quote_in(skus)
    rows = sb_get(q + "&order=id")       # เรียงตายตัว — ดึงทีละหน้า ไม่เรียงแล้วแถวซ้ำ/หายได้
    for r in rows:
        r["_unit"] = "box" if _is_box(r.get("product_name_raw")) else "pack"
    return rows


def _fetch_claims(d1, d2, mids=None, skus=None):
    rows = sb_get("claims?select=machine_id,sku_id,refund_amount,claimed_at"
                  f"&claimed_at=gte.{d1.isoformat()}&claimed_at=lte.{d2.isoformat()}&order=id")
    return [c for c in rows
            if (not mids or c.get("machine_id") in mids) and (not skus or c.get("sku_id") in skus)]


def sync_notes(last_sync, d2, now, single_machine=()):
    """เตือนเรื่องความครบของข้อมูล (ฟังก์ชันล้วน) → {"complete": bool, "notes": [...]}

    last_sync       {ยี่ห้อ: เวลาไทยของแถวขายที่เข้า DB ล่าสุด | None}
    single_machine  ยี่ห้อที่มีตู้ใช้งานตู้เดียว (Payif) — วันที่ขายไม่ได้เลยเกิดได้จริง

    บอทในเครื่องเจ้าของดึงยอดขาย 00:10 (ของเมื่อวานครบวัน) + 10:00 · ยอดวันไหน "ครบ" = มีแถวขายเข้าหลังเที่ยงคืนของวันนั้น
    ⚠️ แถวขายได้ synced_at ตอนเข้า DB ครั้งแรกเท่านั้น และไม่มีตารางบันทึกรอบซิงค์ — ยี่ห้อตู้เดียววันที่ขายไม่ได้
       จึงดูเหมือนยังไม่ซิงค์ · เวลาซิงค์สต็อกใช้แทนไม่ได้ (workflow สต็อกบน GitHub ข้ามขั้นยอดขายที่ล้มแล้ววิ่งต่อ)
       → บอกตรง ๆ ว่ามีได้ 2 สาเหตุ ไม่ฟันธงว่าครบ
    """
    notes, complete = [], True
    today = now.date()
    if d2 >= today:
        notes.append(f"ช่วงนี้รวมวันนี้ ({thai_date(today)}) ซึ่งยังไม่จบวัน — ยอดวันนี้มีแค่ถึงรอบซิงค์ล่าสุด "
                     "อย่าเอาไปเทียบกับวันเต็ม และอย่าสรุปว่าขายไม่ได้")
        return {"complete": False, "notes": notes}
    day_end = datetime(d2.year, d2.month, d2.day, tzinfo=TH) + timedelta(days=1)
    for b, t in sorted(last_sync.items()):
        if t is not None and t >= day_end:
            continue
        complete = False
        name, when = BRAND_TH.get(b, b), (t.strftime("%Y-%m-%d %H:%M") if t else "ไม่ทราบ")
        if b in single_machine:
            notes.append(f"ตู้ {name} (ตู้เดียว) ไม่มีแถวขายใหม่หลังจบวันที่ {thai_date(d2)} (แถวล่าสุดเข้า {when}) — "
                         "อาจเป็นเพราะวันนั้นขายไม่ได้ หรือรอบดึงยอดยังไม่เข้า บอกผู้ถามทั้งสองทาง")
        else:
            notes.append(f"ยอดขายตู้ {name} ซิงค์ล่าสุด {when} — ยอดวันที่ {thai_date(d2)} อาจยังไม่ครบ")
    return {"complete": complete, "notes": notes}


def _data_status(d1, d2, mids, ctx):
    """รอบซิงค์ยอดขายล่าสุดต่อยี่ห้อ (synced_at ของแถวขาย) + เตือนถ้าช่วงที่ถามยังไม่ครบ"""
    scope = mids or [m["machine_id"] for m in ctx["machines"] if m.get("status") == "active"]
    last, single = {}, set()
    for b in sorted({ctx["brand"][m] for m in scope if m in ctx["brand"]}):
        # ใช้ทุกตู้ที่ใช้งานของยี่ห้อนั้น — ตู้เดียวที่วันนั้นขายไม่ได้จะไม่มีแถวใหม่ให้ดูเวลา
        same = [m["machine_id"] for m in ctx["machines"]
                if ctx["brand"][m["machine_id"]] == b and m.get("status") == "active"] or scope
        if len(same) == 1:
            single.add(b)
        rows = sb_get("sales?select=synced_at&machine_id=in." + _quote_in(same)
                      + "&synced_at=not.is.null&order=synced_at.desc&limit=1")
        last[b] = _th_dt(rows[0]["synced_at"]) if rows else None
    st = sync_notes(last, d2, datetime.now(TH), single)
    return {"last_sales_sync": {BRAND_TH.get(b, b): (t.strftime("%Y-%m-%d %H:%M") if t else None)
                                for b, t in last.items()}, **st}


def machine_notes(mids, ctx):
    """ตู้ที่ปิดแล้ว — ยอดหลังวันปิดเป็น 0 เพราะไม่มีตู้ ไม่ใช่เพราะยังไม่ซิงค์"""
    out = []
    for mid in mids:
        m = ctx["by_id"].get(mid) or {}
        if m and m.get("status") != "active":
            b = (m.get("config") or {}).get("branch") or {}
            note = f"{machine_label(m)} ปิดใช้งานแล้ว"
            if b.get("retired_at"):
                note += f" ตั้งแต่ {thai_date(parse_date(b['retired_at']))}"
            if b.get("retired_reason"):
                note += f" ({b['retired_reason']})"
            out.append(note + " — นับยอดช่วงที่ยังเปิดรวมไว้แล้ว · หลังวันปิดยอดเป็น 0 เพราะไม่มีตู้ "
                              "ไม่ใช่เพราะยังไม่ซิงค์")
    return out


def _group_key(group_by, ctx):
    """คีย์กลุ่มของแถวขาย และของแถวเคลม (None = แจกเคลมลงกลุ่มนี้ไม่ได้ · นับแค่ยอดรวม)"""
    bmap, meta = ctx["bmap"], ctx["sku_meta"]
    if group_by == "machine":
        return (lambda r: r["machine_id"]), (lambda c: c.get("machine_id"))
    if group_by == "branch":
        return ((lambda r: bmap.get(r["machine_id"], (r["machine_id"],))[0]),
                (lambda c: bmap.get(c.get("machine_id"), (c.get("machine_id"),))[0]))
    if group_by == "sku":
        return (lambda r: r.get("sku_id") or "(ไม่ระบุ)"), (lambda c: c.get("sku_id") or "(ไม่ระบุ)")
    if group_by == "franchise":
        fr = (lambda s: (meta.get(s) or {}).get("franchise") or "อื่น ๆ")
        return (lambda r: fr(r.get("sku_id"))), (lambda c: fr(c.get("sku_id")))
    if group_by == "day":
        return (lambda r: _th_dt(r["sold_at"]).date()), (lambda c: parse_date(str(c["claimed_at"])[:10]))
    if group_by == "weekday":
        return ((lambda r: _th_dt(r["sold_at"]).weekday()),
                (lambda c: parse_date(str(c["claimed_at"])[:10]).weekday()))
    if group_by == "hour":
        return (lambda r: _th_dt(r["sold_at"]).hour), (lambda c: None)
    raise DvxError("group_by ต้องเป็น machine, branch, sku, franchise, day, weekday หรือ hour")


def breakdown_rows(group_by, groups, ctx, d1, d2, total_rev, top=10):
    """กลุ่ม → แถวผลลัพธ์ เรียงตามแบบของแต่ละมุมมอง (ฟังก์ชันล้วน)"""
    n_days = (d2 - d1).days + 1
    rows = []
    if group_by == "machine":
        for mid in sorted(groups, key=lambda k: ctx["morder"].get(k, 999)):
            row = {"machine_id": mid, "name": ctx["mname"].get(mid, mid)}
            if (ctx["by_id"].get(mid) or {}).get("status") not in (None, "active"):
                row["status"] = "ปิดใช้งานแล้ว"
            rows.append({**row, **_money(groups[mid], ctx, total_rev)})
    elif group_by == "branch":
        labels = {key: label for key, label in ctx["bmap"].values()}
        for key in sorted(groups, key=lambda k: groups[k]["revenue"], reverse=True):
            # เฉพาะตู้ที่มียอดอยู่ในแถวนี้จริง — ไม่ใช่ทุกตู้ที่เคยอยู่สาขานี้ (กรองตู้เดียว/ตู้ที่ปิดแล้ว)
            rows.append({"branch": labels.get(key, key),
                         "machines": sorted(groups[key]["machines"], key=lambda m: ctx["morder"].get(m, 999)),
                         **_money(groups[key], ctx, total_rev)})
    elif group_by == "sku":
        ranked = sorted(groups.items(), key=lambda kv: kv[1]["revenue"], reverse=True)[:top]
        for rank, (sku, b) in enumerate(ranked, 1):
            rows.append({
                "rank": rank, "sku_id": sku,
                "name": (ctx["sku_meta"].get(sku) or {}).get("name") or sku,
                **_money(b, ctx, total_rev),
                "avg_price_per_pack": round(b["revenue"] / b["packs"]) if b["packs"] else None,
                # ทุนที่ใช้คิดกำไร ณ วันสุดท้ายของช่วง (ช่วงคร่อม 1 ส.ค. ทุนเปลี่ยนกลางช่วง — ดู get_sku_costs)
                **({"cost_per_pack": _cost_or_none(ctx["costs"].on(sku, d2))} if ctx["with_profit"] else {}),
                # แยกให้เห็นว่าที่ขายได้มาจากคนซื้อยกกล่องเท่าไหร่
                "box_orders": b["box_orders"],
                "packs_from_box": b["box_packs"],
                "packs_single": b["packs"] - b["box_packs"],
                "box_revenue": round(b["box_revenue"]),
            })
    elif group_by == "franchise":
        for code in sorted(groups, key=lambda k: groups[k]["revenue"], reverse=True):
            rows.append({"franchise": code, "name": FRANCHISE_TH.get(code, code),
                         "skus_sold": len(groups[code]["skus"] - {"?"}),
                         **_money(groups[code], ctx, total_rev)})
    elif group_by == "day":
        # ใส่ครบทุกวันแม้ไม่มียอด — วันที่เป็น 0 คือข้อมูลสำคัญ (ตู้เสีย/ห้างปิด/ยังไม่ซิงค์)
        day = d1
        while day <= d2:
            b = groups.get(day) or _bucket()
            rows.append({"date": str(day), "date_th": thai_date(day), "weekday": DOW_TH[day.weekday()],
                         **_money(b, ctx, total_rev)})
            day += timedelta(days=1)
    elif group_by == "weekday":
        count = collections.Counter((d1 + timedelta(days=i)).weekday() for i in range(n_days))
        for wd in range(7):
            if not count[wd]:
                continue
            b = groups.get(wd) or _bucket()
            rows.append({"weekday": DOW_TH[wd], "days_in_range": count[wd],
                         **_money(b, ctx, total_rev),
                         "revenue_per_day": round(b["revenue"] / count[wd])})
    else:  # hour
        # ชั่วโมงห้างเปิด (10–22) ใส่ครบแม้ยอด 0 — ชั่วโมงที่ไม่มีแถว = ขายไม่ได้ ไม่ใช่ข้อมูลหาย
        for h in sorted(set(groups) | set(range(10, 23))):
            b = groups.get(h) or _bucket()
            rows.append({"hour": f"{h:02d}:00–{h:02d}:59", **_money(b, ctx, total_rev),
                         "revenue_per_day": round(b["revenue"] / n_days)})
    return rows


# ── ยอดขาย ──────────────────────────────────────────────────────────────
def query_sales(days=1, date=None, from_date=None, to_date=None,
                machine=None, group_by="machine", top=10, unit=None,
                sku=None, with_profit=False, include_today=None):
    """สรุปยอดขาย · group_by = machine | branch | sku | franchise | day | weekday | hour
    · unit = pack | box (ว่าง = รวมทั้งสอง) · sku = กรองสินค้า/ค่าย · with_profit = คิดกำไรด้วย

    days: include_today=None (ค่าเดิม) = N วันรวมวันนี้ · True/False = นับแบบ last_full_days
    (MCP ส่ง False — "7 วันล่าสุด" ของคนถาม = 7 วันที่ครบวัน)

    SKU เดียวขายทั้ง "ยกกล่อง" และ "ทีละซอง" ในตู้เดียวกัน — sku_id เหมือนกันทั้งคู่
    แยกได้จากชื่อสินค้าดิบเท่านั้น (คำว่า Box ต่อท้าย) เดิมฟังก์ชันนี้ไม่เคยส่งออกไป
    รายงานและ MCP จึงเอากล่องกับซองมาบวกกันตรง ๆ โดยไม่มีใครรู้

    ⚠️ quantity_sold ของรายการกล่องคือ "จำนวนซองในกล่อง" (24 หรือ 10) ไม่ใช่จำนวนกล่อง
       ยอด packs รวมจึงถูกต้องอยู่แล้ว ตัวเลขที่เพิ่มมาคือ "แยกดูได้ว่าซื้อแบบไหน"
    """
    if unit not in (None, "", "pack", "box"):
        raise DvxError("unit ต้องเป็น pack หรือ box")
    if include_today is None:
        d1, d2 = resolve_range(days, date, from_date, to_date)
    else:
        d1, d2 = pick_range(days, date, from_date, to_date, include_today)
    ctx = _sales_context(with_profit)
    _group_key(group_by, ctx)                 # ตรวจ group_by ก่อนดึงข้อมูล
    mids = resolve_machines(machine, ctx["machines"], d1) if machine else []
    sku_ids = resolve_skus(sku, ctx["skus"]) if sku else []

    rows = _fetch_sales(d1, d2, mids, sku_ids)
    if unit:
        rows = [r for r in rows if r["_unit"] == unit]
    # เคลมไม่มีกล่อง/ซอง — กรองหน่วยแล้วไม่หักเคลม (ไม่รู้ว่าเคลมของหน่วยไหน)
    claims = _fetch_claims(d1, d2, mids, sku_ids) if with_profit and not unit else []

    total, groups = grouped(rows, group_by, ctx, claims)
    n_days = (d2 - d1).days + 1

    by_unit = {}
    for u in ("pack", "box"):
        sub = [r for r in rows if r["_unit"] == u]
        by_unit[u] = {
            "orders": len(sub),
            "packs": sum(ctx["costs"].packs(r) for r in sub),
            "revenue": round(sum(float(r.get("grand_total") or 0) for r in sub)),
        }
    if total["revenue"]:
        by_unit["box"]["revenue_share_pct"] = round(by_unit["box"]["revenue"] / total["revenue"] * 100, 1)

    out = {
        "from": str(d1), "to": str(d2), "days": n_days,
        "machine": " + ".join(ctx["mname"].get(m, m) for m in mids) if mids else "ทุกตู้",
        "sku_filter": sku_ids or "ทุกสินค้า",
        "revenue": round(total["revenue"]), "packs": total["packs"],
        "transactions": len(total["bills"]),
        "revenue_per_day": round(total["revenue"] / n_days) if n_days else 0,
        "avg_price_per_pack": round(total["revenue"] / total["packs"]) if total["packs"] else None,
        "avg_per_transaction": round(total["revenue"] / len(total["bills"])) if total["bills"] else None,
        "unit_filter": unit or "ทั้งหมด",
        "by_unit": by_unit,
        "group_by": group_by,
        "breakdown": breakdown_rows(group_by, groups, ctx, d1, d2, total["revenue"], top),
        # ยอดรวมของคำถามให้ใช้ตัวเลขด้านบน — แถวถูกตัดเหลือ top และปัดเศษทีละแถว บวกกันไม่เท่ายอดรวม
        "breakdown_note": ((f"แสดง {min(top, len(groups))} จาก {len(groups)} สินค้า · " if group_by == "sku" else "")
                           + "ยอดรวม/กำไรรวมให้ใช้ revenue / profit ด้านบน อย่าบวกจากแถว (แต่ละแถวปัดเศษแยกกัน)"),
        "note": ("ยอดขาย = เงินที่ลูกค้าจ่าย (ก่อนหักค่าธรรมเนียม) · บอทในเครื่องเจ้าของดึงยอดขาย "
                 "00:10 (ของเมื่อวานครบวัน) + 10:00 — ยอดวันนี้ยังไม่ครบวัน"),
        "unit_note": ("box = ซื้อยกกล่อง · pack = ซื้อทีละซอง · "
                      "packs ของ box คือจำนวนซองในกล่อง ไม่ใช่จำนวนกล่อง "
                      "(ยอด packs รวมจึงเทียบกันได้ตรง ๆ ไม่ต้องคูณเพิ่ม)"),
    }
    if with_profit:
        out["profit"] = profit_block(total)
        if unit:
            out["profit"]["note"] += " · กรองหน่วยอยู่ จึงไม่หักเงินคืนเคลม"
    out["data_status"] = _data_status(d1, d2, mids, ctx)
    if with_profit and not total["bills"] and not total["revenue"]:
        out["profit"]["note"] = ("ไม่มีแถวขายในช่วงนี้ — กำไร 0 ไม่ได้แปลว่าขาดทุนหรือขายไม่ได้ "
                                 "ดู data_status / machine_notes ก่อนตอบ")
    elif with_profit and not out["data_status"]["complete"]:
        out["profit"]["note"] += " · ข้อมูลช่วงนี้ยังไม่ครบ กำไรนับเฉพาะยอดที่ซิงค์แล้ว"
    notes = machine_notes(mids, ctx)
    if notes:
        out["machine_notes"] = notes
    return out


# ── เทียบสองช่วง ────────────────────────────────────────────────────────
def _month_last(y, m):
    return (datetime(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day


def _shift_month(d, months, keep_month_end=False):
    """เลื่อนเดือน · keep_month_end = วันสุดท้ายของเดือน → วันสุดท้ายของเดือนปลายทาง

    เดิม ก.ย. ทั้งเดือน (1–30) เทียบได้ 1–30 ส.ค. — 31 ส.ค. หายไปทั้งวันโดยไม่มีคำเตือน (ยาว 30 วันเท่ากัน)
    """
    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    last = _month_last(y, m)
    if keep_month_end and d.day == _month_last(d.year, d.month):
        return d.replace(year=y, month=m, day=last)
    return d.replace(year=y, month=m, day=min(d.day, last))


def compare_range(d1, d2, vs="previous", vs_from=None, vs_to=None):
    """ช่วงที่ใช้เทียบ (ฟังก์ชันล้วน)

    previous   ช่วงยาวเท่ากันที่ติดกันก่อนหน้า
    last_week  เลื่อนถอยเป็นสัปดาห์เต็ม — วันในสัปดาห์ตรงกัน (ช่วงยาวเกิน 7 วันเลื่อน 14/21… ไม่ให้ซ้อนกัน)
    last_month วันที่เดียวกันของเดือนก่อน · ถามเป็นเดือน (เริ่มวันที่ 1 จบสิ้นเดือน) → ทั้งเดือนก่อน
    last_year  วันที่เดียวกันของปีก่อน
    custom     vs_from + vs_to
    """
    n = (d2 - d1).days + 1
    whole = d1.day == 1       # เริ่มวันที่ 1 = ถามเป็นเดือน → จบสิ้นเดือนก็เทียบถึงสิ้นเดือนก่อน · ถามกลางเดือนเทียบวันที่ตรงกัน
    if vs == "previous":
        p1, p2 = d1 - timedelta(days=n), d1 - timedelta(days=1)
    elif vs == "last_week":
        shift = timedelta(days=7 * -(-n // 7))
        p1, p2 = d1 - shift, d2 - shift
    elif vs == "last_month":
        p1, p2 = _shift_month(d1, -1), _shift_month(d2, -1, keep_month_end=whole)
    elif vs == "last_year":
        p1, p2 = _shift_month(d1, -12), _shift_month(d2, -12, keep_month_end=whole)
    elif vs == "custom":
        if not (vs_from and vs_to):
            raise DvxError("vs=custom ต้องใส่ vs_from และ vs_to")
        p1, p2 = parse_date(vs_from), parse_date(vs_to)
        if p2 < p1:
            raise DvxError("vs_to ต้องไม่ก่อน vs_from")
    else:
        raise DvxError("vs ต้องเป็น previous, last_week, last_month, last_year หรือ custom")
    if p1 <= d2 and d1 <= p2:
        raise DvxError(f"ช่วงเทียบ {p1}→{p2} ซ้อนกับช่วงที่ถาม {d1}→{d2}")
    return p1, p2


def pct_change(cur, prev):
    """% เปลี่ยน · ช่วงก่อน <= 0 (เช่น กำไรติดลบ) = ไม่มี % — หารด้วยค่าติดลบเครื่องหมายกลับ เหมือน pct() ของสรุปยอด"""
    return None if prev is None or prev <= 0 else round((cur - prev) / prev * 100, 1)


def mix_notes(d1, d2, p1, p2, prev_rev, today=None):
    """คำเตือนว่าตัวเลขสองช่วงเทียบกันตรง ๆ ได้แค่ไหน (ฟังก์ชันล้วน)"""
    notes = []
    n, pn = (d2 - d1).days + 1, (p2 - p1).days + 1
    if n != pn:
        notes.append(f"สองช่วงยาวไม่เท่ากัน ({n} วัน กับ {pn} วัน) — ดู revenue_per_day ประกอบ อย่าดูแค่ยอดรวม")

    def weekend(a, b):
        return sum(1 for i in range((b - a).days + 1) if (a + timedelta(days=i)).weekday() >= 5)
    w, pw = weekend(d1, d2), weekend(p1, p2)
    if w != pw:
        notes.append(f"ช่วงนี้มีเสาร์-อาทิตย์ {w} วัน ช่วงเทียบมี {pw} วัน — วันหยุดขายดีกว่าวันธรรมดา "
                     "ส่วนต่างบางส่วนมาจากเรื่องนี้")
    if today and p2 >= today:
        notes.append(f"ช่วงเทียบ {p1} → {p2} รวมวันนี้/วันข้างหน้า — ยอดยังไม่ครบหรือยังไม่เกิด เทียบตรง ๆ ไม่ได้")
    elif not prev_rev:
        notes.append(f"ช่วงเทียบ {p1} → {p2} ไม่มียอดขายเลย — อาจเป็นช่วงก่อนเริ่มมีข้อมูล (ยอดในระบบเริ่ม "
                     "เม.ย. 2026) หรือก่อนตู้เปิด ห้ามสรุปว่าโตขึ้น")
    elif prev_rev < SMALL_BASE:
        notes.append(f"ช่วงเทียบขายได้ไม่ถึง {SMALL_BASE:,} บาท — % แกว่งแรง ให้บอกเป็นบาทประกอบ")
    return notes


def sku_movers(cur_groups, prev_groups, sku_meta, n=5):
    """→ (ขายเพิ่ม, ขายลด) เรียงตามบาทที่เปลี่ยน ไม่ใช่ % (ตัวเล็กลด 80 → 0 = ▼100% แต่ไม่สำคัญ)"""
    rows = []
    for sku in set(cur_groups) | set(prev_groups):
        now = (cur_groups.get(sku) or {}).get("revenue", 0.0)
        before = (prev_groups.get(sku) or {}).get("revenue", 0.0)
        # ช่วงก่อนมาก่อนช่วงนี้เสมอ — 31 ต.ค. Hermes เขียน "ยอดช่วงนี้ → ยอดช่วงก่อน (+%)" ตามลำดับฟิลด์เดิม (ลูกศรกลับด้าน อ่านเหมือนยอดตก)
        rows.append({"sku_id": sku,
                     "revenue_before": round(before), "revenue_now": round(now),
                     "diff": round(now - before), "change_pct": pct_change(now, before),
                     "packs_before": (prev_groups.get(sku) or {}).get("packs", 0),
                     "packs_now": (cur_groups.get(sku) or {}).get("packs", 0)})
    up = sorted([r for r in rows if r["diff"] > 0], key=lambda r: (-r["diff"], r["sku_id"]))[:n]
    down = sorted([r for r in rows if r["diff"] < 0], key=lambda r: (r["diff"], r["sku_id"]))[:n]
    return up, down


def query_compare(from_date=None, to_date=None, days=7, include_today=False, vs="previous",
                  vs_from=None, vs_to=None, machine=None, sku=None, group_by="machine", top=5):
    """เทียบยอดขาย + กำไร สองช่วง · แยกตาม machine | branch | sku | franchise + สินค้าขายเพิ่ม/ลด"""
    if group_by not in ("machine", "branch", "sku", "franchise"):
        raise DvxError("group_by ของการเทียบต้องเป็น machine, branch, sku หรือ franchise")
    d1, d2 = pick_range(days, None, from_date, to_date, include_today)
    p1, p2 = compare_range(d1, d2, vs, vs_from, vs_to)
    ctx = _sales_context(True)
    sku_key, sku_claim = _group_key("sku", ctx)
    mids = resolve_machines(machine, ctx["machines"], min(d1, p1)) if machine else []
    sku_ids = resolve_skus(sku, ctx["skus"]) if sku else []

    def period(a, b):
        rows, claims = _fetch_sales(a, b, mids, sku_ids), _fetch_claims(a, b, mids, sku_ids)
        total, groups = grouped(rows, group_by, ctx, claims)
        return total, groups, tally(rows, sku_key, ctx, claims, sku_claim)

    cur, cur_g, cur_s = period(d1, d2)
    prev, prev_g, prev_s = period(p1, p2)

    def summary(b, a, z):
        n = (z - a).days + 1
        return {"from": str(a), "to": str(z), "days": n, **_money(b, ctx),
                "revenue_per_day": round(b["revenue"] / n)}

    now_s, before_s = summary(cur, d1, d2), summary(prev, p1, p2)
    change = {k: (now_s[k] - before_s[k]) for k in ("revenue", "packs", "transactions", "net_profit")}
    change.update({f"{k}_pct": pct_change(now_s[k], before_s[k])
                   for k in ("revenue", "packs", "transactions", "net_profit", "revenue_per_day")})

    names = {"machine": lambda k: ctx["mname"].get(k, k),
             "branch": lambda k: {key: label for key, label in ctx["bmap"].values()}.get(k, k),
             "sku": lambda k: (ctx["sku_meta"].get(k) or {}).get("name") or k,
             "franchise": lambda k: FRANCHISE_TH.get(k, k)}[group_by]
    rows = []
    for k in set(cur_g) | set(prev_g):
        a, b = cur_g.get(k) or _bucket(), prev_g.get(k) or _bucket()
        row = {"key": k, "name": names(k)}
        if group_by == "machine" and (ctx["by_id"].get(k) or {}).get("status") not in (None, "active"):
            row["status"] = "ปิดใช้งานแล้ว"
        if group_by == "branch":
            row["machines_before"] = sorted(b["machines"])
            row["machines_now"] = sorted(a["machines"])
        rows.append({**row,
                     "revenue_before": round(b["revenue"]), "revenue_now": round(a["revenue"]),
                     "diff": round(a["revenue"] - b["revenue"]),
                     "change_pct": pct_change(a["revenue"], b["revenue"]),
                     "packs_before": b["packs"], "packs_now": a["packs"],
                     "net_profit_before": round(_profit(b)), "net_profit_now": round(_profit(a))})
    rows.sort(key=lambda r: (-r["revenue_now"], str(r["key"])))
    if group_by == "sku":
        rows = rows[:max(top, 10)]
    up, down = sku_movers(cur_s, prev_s, ctx["sku_meta"], top)

    notes = mix_notes(d1, d2, p1, p2, prev["revenue"], th_today()) + _data_status(d1, d2, mids, ctx)["notes"]
    # ไม่กรองตู้ก็ต้องบอก — "ก.ย. เทียบ ส.ค." ทุกตู้ wwv02 ขึ้น -100% และบางกะปิ -58% โดยไม่มีคำอธิบาย (ตู้ปิด 19 ส.ค.)
    seen = sorted(cur["machines"] | prev["machines"] | set(mids), key=lambda m: ctx["morder"].get(m, 999))
    notes += machine_notes(seen, ctx)
    for mid in seen:
        if mid not in cur["machines"]:
            continue
        first = sb_get(f"sales?select=sold_at&machine_id=eq.{mid}&order=sold_at.asc&limit=1")
        start = _th_dt(first[0]["sold_at"]).date() if first else None
        if start and start > p1:              # เปิดหลังวันเริ่มช่วงเทียบ = ช่วงเทียบมีตู้นี้ไม่ครบ/ไม่มีเลย
            notes.append(f"{ctx['mname'].get(mid, mid)} เริ่มขาย {start} — ช่วงเทียบมีตู้นี้ไม่ครบทั้งช่วง "
                         "ส่วนที่เพิ่มขึ้นส่วนหนึ่งมาจากตู้เพิ่งเปิด")
    return {
        "machine": " + ".join(ctx["mname"].get(m, m) for m in mids) if mids else "ทุกตู้",
        "sku_filter": sku_ids or "ทุกสินค้า",
        "vs": vs, "previous": before_s, "current": now_s, "change": change,
        "how_to_read": "previous = ช่วงเทียบ (ก่อน) · current = ช่วงที่ถาม · เขียนแบบ ก่อน → ตอนนี้ เสมอ",
        "group_by": group_by, "breakdown": rows,
        "sku_gainers": up, "sku_decliners": down,
        "profit_formula": PROFIT_FORMULA,
        "notes": notes,
    }


# ── ต้นทุนรายสินค้า ─────────────────────────────────────────────────────
def _cost_or_none(c):
    return round(c, 2) if c else None


def cost_rows(skus, costs, ids, day):
    """ต้นทุนต่อซอง/กล่อง ณ วันที่ + ทุนก่อนหน้า (ฟังก์ชันล้วน) — กติกาเดียวกับที่ใช้คิดกำไร (Costs.on)"""
    meta = {s["sku_id"]: s for s in skus}
    iso = day.isoformat()
    out = []
    for sid in ids:
        m = meta.get(sid) or {}
        ppb = int(m.get("packs_per_box") or 0)
        c = costs.on(sid, day)
        hist = [(eff, v) for eff, v in costs.hist.get(sid, []) if eff <= iso]
        eff = hist[-1][0] if hist else None
        prev = next(((e, v) for e, v in reversed(hist[:-1]) if v > 0), None) if hist else None
        out.append({
            "sku_id": sid,
            "cost_per_pack": _cost_or_none(c),
            "cost_per_box": _cost_or_none(c * ppb) if c and ppb > 1 else None,
            "packs_per_box": ppb or None,
            "effective_from": (eff if eff and eff > "2000-01-01" else
                               ("ทุนเดิม (ก่อนชุด 1 ส.ค. 2026)" if eff else "ค่าในตารางสินค้า")),
            "previous_cost_per_pack": _cost_or_none(prev[1]) if prev and eff and eff > "2000-01-01" else None,
            "note": None if c else "ยังไม่มีต้นทุนในระบบ — ยอดของสินค้านี้ไม่ถูกนับในกำไร",
        })
    return out


def query_sku_costs(sku=None, date=None):
    """ต้นทุนต่อซอง/กล่องรายสินค้า ณ วันที่ (ค่าเริ่ม = วันนี้)"""
    dg = _dg()
    skus = sb_get("skus?select=sku_id,name,franchise,packs_per_box,avg_cost,cost_price,is_active&order=id")
    ids = resolve_skus(sku, skus) if sku else [s["sku_id"] for s in skus if s.get("is_active", True)]
    day = parse_date(date) if date else th_today()
    return {
        "date": str(day),
        "items": cost_rows(skus, dg.load_costs(), ids, day),
        "note": ("ทุนต่อซองที่ใช้คิดกำไร ณ วันนั้น (ยอดตั้งแต่ 1 ส.ค. 2026 ใช้ทุนชุดใหม่ ก่อนนั้นทุนเดิม) · "
                 "กล่อง = ทุนต่อซอง × ซองต่อกล่อง · ข้อมูลภายในทีม ห้ามใส่ในโพสต์/ข้อความถึงลูกค้า"),
    }


# ── สินค้าขายไม่ออก ──────────────────────────────────────────────────────
NEW_GRACE_DAYS = 14         # มีของให้ขายไม่ถึงเท่านี้ (มองย้อนอย่างน้อย 14 วัน) = ยังเร็วไปที่จะเรียกว่าขายไม่ออก
UNSOLD_ITEM_CAP = 40        # รายการต่อตู้สูงสุดเมื่อถามไม่เกิน 2 ตู้
UNSOLD_ITEM_CAP_ALL = 10    # ถามหลายตู้: แสดงเฉพาะ unsold/slow ตู้ละไม่เกินนี้ — ทั้ง 12 ตู้แบบไม่จำกัด (7 วัน · ≤2 ซอง) เคยเกินแสนตัวอักษร
STATUS_TH = {"unsold": "ขายไม่ออก — มีของให้ขายพอสมควรแล้ว แต่ไม่มีใครกดเลย",
             "slow": "ขายช้า — มีของให้ขายพอสมควรแล้ว ขายได้แค่ไม่กี่ซอง (ไม่ใช่ขายไม่ออก)",
             "short": f"มีของให้ขายไม่ถึง {NEW_GRACE_DAYS} วัน (เพิ่งลงตู้ / เพิ่งเติมจากช่องว่าง / ถอดออกเร็ว) — ยังสรุปว่าขายไม่ออกไม่ได้",
             "empty": "อยู่ในตู้แต่ช่องว่างตลอดช่วง ไม่มีของให้ขาย — ปัญหาการเติม ไม่ใช่สินค้าขายไม่ออก"}
_FAR_PAST = datetime(2000, 1, 1, tzinfo=TH)
_FAR_FUTURE = datetime(2100, 1, 1, tzinfo=TH)


def _packs_of(r, ppb):
    """จำนวนซองของแถวขาย — กติกาเดียวกับ Costs.packs ของสรุปยอด (แถวกล่องที่เก็บเป็นจำนวนกล่อง → คูณซองต่อกล่อง)"""
    qty = int(r.get("quantity_sold") or 0)
    n = int((ppb or {}).get(r.get("sku_id")) or 0)
    return qty * n if r.get("unit") == "box" and n > 1 and 0 < qty < n else qty


def _slot_norm(slot):
    """'012' = '12' — เลขช่องจากตารางต่าง ๆ เติมศูนย์ไม่เท่ากัน"""
    t = str(slot or "").strip()
    return t.lstrip("0") or ("0" if t else None)


def _key_timeline(events, current, sale_times, floor=_FAR_PAST):
    """ประวัติช่อง 1 คีย์ → (ช่วงที่สินค้าอยู่ในช่อง, ช่วงที่ช่องว่าง) เป็นลิสต์ (เริ่ม, จบ) เวลาไทย (ฟังก์ชันล้วน)

    คีย์ = (ตู้, SKU, ซอง/กล่อง, ช่อง) — VMS เก็บเหตุการณ์รายช่อง · WorldWide/Payif รวมทั้ง SKU (ช่อง = None)
    current     แถวสต็อกตอนนี้ของคีย์นี้ ({"remain", "empty_since"}) หรือ None = ไม่อยู่ในตู้แล้ว
    sale_times  [(เวลาขาย, จำนวนหน่วยของคีย์นี้)] เรียงแล้ว — ใช้หาว่าช่องหมดเพราะขายตอนไหน และขายมากพอจะหมดจริงไหม
    floor       วันที่ตู้เริ่มขาย — ของที่ไม่มีประวัติลงช่องถือว่าอยู่ตั้งแต่ตอนนั้น ไม่ใช่ก่อนตู้มีอยู่จริง (wwv08 เปิด 21 ก.ค.)

    ⚠️ swap_out + swap_in ในรอบซิงค์เดียว = ย้ายช่อง/หลังบ้านเปลี่ยนชื่อ ของยังอยู่ (YGH The Revals ที่ wwv05)
    ⚠️ เหลือ 0 ตอนเติม/ตอนถอดออก (qty_before = 0) นับว่าช่องว่างก่อนหน้านั้น *เฉพาะเมื่อมีหลักฐาน*: รอบก่อนหน้าเป็น 0
       อยู่แล้ว หรือมียอดขายหลังรอบก่อนหน้า (ขายจนหมด) — ไม่มีหลักฐาน = ข้อมูลหลังบ้านไม่ต่อกัน (ชื่อสินค้าเปลี่ยน) ไม่นับว่าว่าง
    ⚠️ ลงช่องด้วยจำนวน 0 (swap_in qty_after = 0) = ตั้งช่องไว้แต่ไม่มีของ ว่างจนกว่าจะมีรอบที่ของเข้า
       (TF Overdrive 01 ที่ wwv07 — ขายหมดแล้วถอดทีหลัง เดิมนับว่ามีของจนวันที่ถอด)
    """
    groups = collections.OrderedDict()
    for e in sorted(events, key=lambda e: (e["synced_at"], e.get("id") or 0)):
        groups.setdefault(e["synced_at"], []).append(e)
    first = next(iter(groups.values()), [])
    first_types = {e["change_type"] for e in first}
    assigned = not ("swap_in" in first_types and "swap_out" not in first_types)
    open_at = floor if assigned else None
    present, empty = [], []
    qty, last_t, empty_open = None, None, None

    def evidence_start(t, by_swap_out, read_at):
        """ช่องหมดตั้งแต่เมื่อไหร่ (มีหลักฐาน) — None = ไม่มีหลักฐาน

        read_at = เวลาที่อ่านได้เลข 0 (prev_synced_at ของเหตุการณ์) — ยอดขายหลังจากนั้นเกิดหลังเติมของแล้ว
        นับเป็นตัวทำให้หมดไม่ได้ (เดิมยอดขาย 1 ซองหลังเติมกลายเป็น "ว่างตั้งแต่" แล้วซ่อนช่วงว่างหลายสัปดาห์)
        """
        if qty == 0 and last_t:
            return last_t
        sold = [(s, u) for s, u in sale_times if (last_t is None or s > last_t) and s <= read_at]
        if sold:
            # ต้องขายได้มากพอจะหมดจริง (เผื่อ 1 ชิ้น) — WW มีรอบรีเซ็ตหลังบ้านที่เลขก่อนเติมเป็น 0 เกือบทั้งตู้
            # (wwv04 15 ส.ค. 26 จาก 30 ช่อง) ขายไป 1 ซองจาก 12 แล้วนับว่าหมดตั้งแต่วันนั้น = ซ่อนของที่ขายไม่ออกจริงเป็น short
            if qty is None or sum(u for _, u in sold) >= qty - 1:
                return sold[-1][0]
            return None
        # ถอดออกตอนเหลือ 0 เป็นเหตุการณ์แรกของช่อง และไม่เคยขายได้ = ว่างมาตั้งแต่ต้น (ของลดได้ทางเดียวคือขาย ·
        # เติมทุกครั้งมีบันทึก) — wwv04/wwv05 OP 06 · EB 01 เดิมขึ้น "ขายไม่ออก" ทั้งที่ช่องว่าง
        # ⚠️ เติมจาก 0 เป็นเหตุการณ์แรกไม่นับแบบนี้ — รอบจัดตู้ใหม่ทั้งตู้ (wwv08 16 ส.ค.) เลข 0 เชื่อไม่ได้
        if by_swap_out and qty is None and last_t is None and not any(s <= read_at for s, _ in sale_times):
            return floor
        return None

    for ts, grp in groups.items():
        t = _th_dt(ts)
        types = {e["change_type"] for e in grp}
        zero = [e for e in grp if e["change_type"] in ("refill", "swap_out") and not (e.get("qty_before") or 0)]
        if zero:
            # รวมกรณีถอด+ลงในรอบเดียว (เปลี่ยนชื่อ) ด้วย — ฝั่ง swap_in ไม่อยู่ในเงื่อนไขนี้ และไม่มีหลักฐาน = ไม่นับอยู่แล้ว
            reads = [_th_dt(e["prev_synced_at"]) for e in zero if e.get("prev_synced_at")]
            read_at = min([r for r in reads if r <= t] or [t])
            start = evidence_start(t, all(e["change_type"] == "swap_out" for e in zero) and "swap_in" not in types,
                                   read_at)
            if start is not None:
                empty.append((max(start, floor), t))
        filled = [e.get("qty_after") or 0 for e in grp if e["change_type"] in ("swap_in", "refill")]
        if empty_open is not None and (any(filled) or "swap_out" in types):
            empty.append((empty_open, t))
            empty_open = None
        if "swap_in" in types:
            if open_at is None:
                open_at = t
        elif "swap_out" in types and open_at is not None:
            present.append((open_at, t))
            open_at = None
        elif open_at is None and any(filled):
            open_at = t                   # ถอดไปแล้วกลับมามีการเติมโดยไม่มี swap_in (จัดช่องใหม่) = กลับมาอยู่ในตู้
        qty = max(filled) if filled else (0 if "swap_out" in types else qty)
        if "swap_in" in types and filled and not any(filled) and open_at is not None:
            empty_open = t                # ลงช่องไว้แต่จำนวน 0
        last_t = t
    if current is not None:
        if open_at is None:
            open_at = last_t or floor
        if not (current.get("remain") or 0):
            since = current.get("empty_since")
            if empty_open is not None:
                start = empty_open
            elif since:
                start = _th_dt(since)
            else:
                sold = [s for s, _ in sale_times if last_t is None or s > last_t]
                start = sold[-1] if sold else (last_t or floor)
            empty.append((max(start, floor), _FAR_FUTURE))
        elif empty_open is not None:
            empty.append((empty_open, last_t))
        present.append((open_at, _FAR_FUTURE))
    elif open_at is not None:
        present.append((open_at, last_t or open_at))   # หายจากสต็อกโดยไม่มี swap_out — ถือว่าออกตั้งแต่รอบสุดท้าย
    return present, empty


def _inside(t, spans):
    return any(a <= t < b for a, b in spans)


def unsold_core(stock_rows, period_sales, history_sales, events, track_start, d1, d2, max_packs,
                today, now=None, ppb=None, slot_grain=frozenset(), machine_start=None):
    """สินค้าที่ขายได้ <= max_packs ซองในช่วง [d1, d2] พร้อมจำนวนวันที่มีของให้ขายจริง (ฟังก์ชันล้วน — ทดสอบได้)

    stock_rows     แถว machine_stock ตอนนี้ (ช่องละแถว)
    period_sales   แถวขายในช่วงที่ถาม · history_sales แถวขายทุกช่วงของ SKU ที่เข้าข่าย (หาวันขายล่าสุด)
    events         slot_refill_events ทุกแบบ (refill / swap_in / swap_out) ของ SKU ที่เข้าข่าย
    track_start    {ตู้: วันแรกที่มีประวัติช่อง}
    slot_grain     ตู้ที่เก็บเหตุการณ์รายช่อง (VMS) — ตู้อื่นรวมทั้ง SKU
    machine_start  {ตู้: เวลาที่ตู้เริ่มขาย} — ก่อนหน้านั้นไม่นับว่ามีของ

    นับ "วันที่มีของให้ขาย" จากภาพตอนเที่ยงของแต่ละวัน: สินค้าอยู่ในช่องไหนสักช่องที่ไม่ว่าง
    · unsold = ช่วงที่ถามขายได้ไม่เกินเกณฑ์ และมีของให้ขายอย่างน้อย 14 วัน (มองย้อนอย่างน้อย 14 วันเสมอ —
      ถามแค่ 7 วันก็ไม่เรียกของที่เพิ่งลงตู้ว่าขายไม่ออก) · short = มีของไม่ถึงเกณฑ์ · empty = อยู่ในตู้แต่ช่องว่างทั้งช่วง
    · ไม่อยู่ในตู้เลยตลอดช่วง (ลงตู้หลังช่วงนั้น) = ไม่นับ — เดิมขึ้นเป็น "เพิ่งลงตู้" พร้อมจำนวนวันติดลบ

    30 ต.ค. 2026 Hermes เอารายการยอดขายมาเทียบกับสต็อกเอง แล้วนับสินค้าที่ขายได้ 4 ตัวเป็น "ขายไม่ออก"
    → ให้เครื่องมือเทียบให้เสร็จ และบอกเหตุที่ "ขายไม่ได้แต่ไม่ใช่ขายไม่ออก"
    """
    now = now or datetime.now(TH)
    end = min(d2, today)

    def unit_of_row(s):
        return "box" if _is_box(s.get("product_name")) else "pack"

    def key(mid, sku, unit, slot):
        return (mid, sku, unit, _slot_norm(slot) if mid in slot_grain else None)

    cur = {}
    for s in stock_rows:
        if not s.get("sku_id"):
            continue
        c = cur.setdefault(key(s["machine_id"], s["sku_id"], unit_of_row(s), s.get("slot_number")),
                           {"remain": 0, "capacity": 0, "slots": [], "names": set(), "empty_since": None})
        c["remain"] += s.get("remain") or 0
        c["capacity"] += s.get("max_capacity") or 0
        c["slots"].append(s.get("slot_number"))
        c["names"].add(s.get("product_name") or "")
        es = s.get("empty_since")
        # หลายช่องของ SKU เดียว (WW/Payif รวมเป็นคีย์เดียว) ว่างครบทุกช่องตั้งแต่ช่องสุดท้ายที่หมด = เวลาที่ช้าที่สุด
        if es and (c["empty_since"] is None or es > c["empty_since"]):
            c["empty_since"] = es
    ev = collections.defaultdict(list)
    for e in events:
        if e.get("sku_id"):
            ev[key(e["machine_id"], e["sku_id"], "box" if e.get("is_box") else "pack", e.get("slot_number"))].append(e)

    sold = collections.Counter()
    for r in period_sales:
        sold[(r["machine_id"], r.get("sku_id"))] += _packs_of(r, ppb)
    sale_times = collections.defaultdict(list)          # รายสินค้า — วันขายล่าสุด
    key_sales = collections.defaultdict(list)           # รายคีย์ (ซอง/กล่อง · ช่อง VMS) — หลักฐานว่าขายจนหมด
    for r in history_sales:
        t = _th_dt(r["sold_at"])
        sale_times[(r["machine_id"], r.get("sku_id"))].append(t)
        unit = r.get("unit") or ("box" if _is_box(r.get("product_name_raw")) else "pack")
        packs = _packs_of(r, ppb)
        n = int((ppb or {}).get(r.get("sku_id")) or 0)
        units = packs / n if unit == "box" and n > 1 else packs
        slot = r.get("slot_number")
        key_sales[(r["machine_id"], r.get("sku_id"), unit,
                   _slot_norm(slot) if r["machine_id"] in slot_grain else None)].append((t, units))
    for v in sale_times.values():
        v.sort()
    for v in key_sales.values():
        v.sort()

    keys_of = collections.defaultdict(list)
    # เรียงตายตัว — เดิมวนจาก set ลำดับเปลี่ยนตาม hash seed รายการที่ตัดเหลือ 10 ตัวจึงไม่เหมือนกันแต่ละรอบ
    for k in sorted(set(cur) | set(ev), key=lambda k: (k[0], k[1], k[2], k[3] or "")):
        keys_of[k[:2]].append(k)

    def noon(day):
        t = datetime(day.year, day.month, day.day, 12, tzinfo=TH)
        return min(t, now) if day == now.date() else t

    window_start = min(d1, end - timedelta(days=NEW_GRACE_DAYS - 1))
    days = [window_start + timedelta(days=i) for i in range((end - window_start).days + 1)]
    period_days = (end - d1).days + 1 if end >= d1 else 0

    items = []
    for (mid, sku), ks in keys_of.items():
        if sold[(mid, sku)] > max_packs:
            continue
        times = sale_times.get((mid, sku), [])
        floor = (machine_start or {}).get(mid, _FAR_PAST)
        lines = [_key_timeline(ev.get(k, []), cur.get(k), key_sales.get(k, []), floor) for k in ks]
        present = [(day, any(_inside(noon(day), p) for p, _ in lines)) for day in days]
        on_sale = {day for day in days
                   if any(_inside(noon(day), p) and not _inside(noon(day), e) for p, e in lines)}
        in_period = sum(1 for day in days if day >= d1 and day in on_sale)
        there = sum(1 for day, ok in present if day >= d1 and ok)
        if not there:
            continue                      # ไม่อยู่ในตู้เลยตลอดช่วงที่ถาม
        exposure = len(on_sale)
        if not in_period:
            status = "empty"
        elif exposure < NEW_GRACE_DAYS:
            status = "short"
        else:
            # ขายได้บ้าง = ขายช้า ไม่ใช่ขายไม่ออก — 31 ต.ค. Hermes ใส่ max_packs=2 ถาม "ขายไม่ออก"
            # แล้วรายงานตัวที่ขายได้ 2 ซองว่า "ขายไม่ออกจริง"
            status = "slow" if sold[(mid, sku)] else "unsold"

        spans = sorted(p for ps, _ in lines for p in ps)
        merged = []
        for a, b in spans:
            if merged and a <= merged[-1][1] + timedelta(hours=1):
                merged[-1] = (merged[-1][0], max(merged[-1][1], b))
            else:
                merged.append((a, b))
        last_span = merged[-1] if merged else (_FAR_PAST, _FAR_FUTURE)
        ts = track_start.get(mid)
        if last_span[0] > floor:
            since = str(last_span[0].date())
        elif floor > _FAR_PAST and (not ts or str(floor.date()) >= ts):
            since = f"ตั้งแต่ตู้เริ่มขาย {floor.date()}"
        else:
            since = f"ก่อน {ts} (เริ่มเก็บประวัติช่อง)" if ts else "ไม่ทราบ"
        current = [cur[k] for k in ks if k in cur]
        if current:
            parts = collections.defaultdict(lambda: [0, 0])
            for k in ks:
                if k in cur:
                    parts[k[2]][0] += cur[k]["remain"]
                    parts[k[2]][1] += cur[k]["capacity"]
            stock = " · ".join(f"{'กล่อง' if u == 'box' else 'ซอง'} {r}/{c}"
                               for u, (r, c) in sorted(parts.items(), key=lambda kv: kv[0] != "pack"))
        else:
            stock = f"ไม่อยู่ในตู้แล้ว (ถอดออก {last_span[1].date()})"
        last = times[-1].date() if times else None
        item = {
            "machine_id": mid, "sku_id": sku, "status": status,
            "packs_sold": sold[(mid, sku)],
            "days_with_stock": in_period, "period_days": period_days,
            "stock": stock,
            "slots": sorted(x for c in current for x in c["slots"] if x),
            # ชื่อหน้าตู้ใส่เฉพาะตัวที่รหัสในระบบไม่ตรงชื่อจริง (เช่น YGH The Revals = YU-GI-OH! The Rivals)
            "name_on_machine": next((n for c in current for n in sorted(c["names"])
                                     if n and _loose(sku) not in _loose(n)), None),
            "in_machine_since": since,
            "last_sale": str(last) if last else "ไม่เคยขายได้ที่ตู้นี้ (ตั้งแต่มีข้อมูล)",
            "days_since_last_sale": (today - last).days if last else None,
        }
        if status in ("unsold", "slow") and in_period < period_days:
            item["note"] = f"มีของให้ขาย {in_period} จาก {period_days} วันในช่วงนี้"
        elif status == "short":
            item["note"] = f"มีของให้ขายแค่ {exposure} วัน (นับย้อน {len(days)} วันถึง {end})"
        items.append(item)

    order = {"unsold": 0, "slow": 1, "short": 2, "empty": 3}
    items.sort(key=lambda i: (order[i["status"]],
                              -(i["days_since_last_sale"] if i["days_since_last_sale"] is not None else 10 ** 6),
                              i["machine_id"], i["sku_id"]))
    return items


def query_unsold(machine=None, days=30, from_date=None, to_date=None, include_today=True, max_packs=0):
    """สินค้าที่ขายได้ <= max_packs ซองในช่วงที่ถาม (0 = ขายไม่ได้เลย) — เฉพาะตู้ที่ใช้งานอยู่"""
    d1, d2 = pick_range(days, None, from_date, to_date, include_today)
    today = th_today()
    if d1 > today:
        raise DvxError(f"from_date ({d1}) อยู่หลังวันนี้ ({today}) — ยังไม่มีข้อมูล")
    end = min(d2, today)
    machines = load_machines(active_only=False)
    by_id = {m["machine_id"]: m for m in machines}
    active = [m["machine_id"] for m in machines if m.get("status") == "active"]
    asked = resolve_machines(machine, machines, d1) if machine else active   # ตู้ที่ปิดแล้วของสาขา → ขึ้นหมายเหตุ
    mids = [m for m in asked if m in active]
    notes = [f"เกณฑ์: ขายได้ไม่เกิน {max_packs} ซองในช่วง {d1} → {end}",
             "status: " + " · ".join(f"{k} = {v}" for k, v in STATUS_TH.items())
             + " — ตอบแอดมินให้แยกแต่ละแบบเสมอ (ถาม 'ขายไม่ออก' = เฉพาะ unsold)",
             "days_with_stock = จำนวนวันในช่วงนี้ที่มีของให้ขายจริง · in_machine_since = ลงช่องรอบล่าสุด"]
    if d2 > today:
        notes.append(f"to_date เลยวันนี้ — นับถึง {today}")
    if (end - d1).days + 1 < 7:
        notes.append("ช่วงที่ถามสั้นไม่ถึง 7 วัน — ขายไม่ได้ในไม่กี่วันเป็นเรื่องปกติ ไม่ใช่ขายไม่ออก "
                     "ถาม 14–30 วันจะตัดสินได้จริง")
    if end >= today:
        notes.append("ยอดวันนี้ยังไม่ครบวัน (มีถึงรอบซิงค์ล่าสุด)")
    for mid in asked:
        if mid not in active:
            notes += machine_notes([mid], {"by_id": by_id})
            notes.append(f"{mid} ปิดแล้ว ไม่มีของในตู้ — ไม่ได้นับสินค้าขายไม่ออก")
    if not mids:
        return {"from": str(d1), "to": str(end), "max_packs": max_packs, "machines": [],
                "in_several_machines": [], "notes": notes}

    mname = {m["machine_id"]: machine_label(m) for m in machines}
    ids = _quote_in(mids)
    skus = sb_get("skus?select=sku_id,packs_per_box&order=id")
    ppb = {s["sku_id"]: s.get("packs_per_box") for s in skus}
    lo, hi = f"gte.{utc_bound(d1)}", f"lt.{utc_bound(end, end=True)}"
    stock = sb_get("machine_stock?select=machine_id,slot_number,product_name,sku_id,remain,max_capacity,"
                   f"empty_since,synced_at&is_occupied=eq.true&machine_id=in.{ids}&order=id")
    period_sales = sb_get("sales?select=machine_id,sku_id,quantity_sold,unit"
                          f"&machine_id=in.{ids}&sold_at={lo}&sold_at={hi}&order=id")
    events = sb_get("slot_refill_events?select=id,machine_id,slot_number,sku_id,is_box,change_type,"
                    f"qty_before,qty_after,synced_at,prev_synced_at&machine_id=in.{ids}&order=id")
    sold = collections.Counter()
    for r in period_sales:
        sold[(r["machine_id"], r.get("sku_id"))] += _packs_of(r, ppb)
    track, start = {}, {}
    for mid in mids:
        first = sorted(e["synced_at"] for e in events if e["machine_id"] == mid)
        if first:
            track[mid] = str(_th_dt(first[0]).date())
        # ตู้เริ่มขายวันไหน — ของที่ลงตั้งแต่รอบแรกไม่มี swap_in ห้ามนับว่าอยู่ก่อนตู้มีจริง
        sale0 = sb_get(f"sales?select=sold_at&machine_id=eq.{mid}&order=sold_at.asc&limit=1")
        marks = [_th_dt(x) for x in ([sale0[0]["sold_at"]] if sale0 else []) + first[:1]]
        if marks:
            t0 = min(marks)
            start[mid] = datetime(t0.year, t0.month, t0.day, tzinfo=TH)
    slot_grain = {m for m in mids if (by_id[m].get("brand") or "vms") == "vms"}
    # รอบแรกไม่ใช้ยอดขายย้อนหลัง — หาแค่ว่าตัวไหนอยู่ในตู้ช่วงนั้นและขายไม่ถึงเกณฑ์ แล้วค่อยดึงประวัติขายเฉพาะตัวพวกนั้น
    # (ดึงทุก SKU ที่เคยอยู่ในตู้ = ยอดขายทั้งปีของตัวขายดีติดมาด้วย ช้าเปล่า)
    rough = unsold_core(stock, period_sales, [], events, track, d1, end, max_packs,
                        today, ppb=ppb, slot_grain=slot_grain, machine_start=start)
    keep = {(i["machine_id"], i["sku_id"]) for i in rough}
    cand = sorted({sku for _, sku in keep})
    history = (sb_get(f"sales?select=machine_id,sku_id,sold_at,quantity_sold,unit,slot_number,product_name_raw"
                      f"&machine_id=in.{ids}&sku_id=in.{_quote_in(cand)}&order=id") if cand else [])
    # รอบสองต้องเห็นเหตุการณ์ช่องชุดเดียวกับรอบแรก (เดิมกรองทิ้ง → ของที่ลงตู้หลังช่วงที่ถามกลับมาเป็น "ขายไม่ออกทั้งเดือน")
    items = [i for i in unsold_core(stock, period_sales, history, events, track, d1, end, max_packs,
                                    today, ppb=ppb, slot_grain=slot_grain, machine_start=start)
             if (i["machine_id"], i["sku_id"]) in keep]
    wide = len(mids) > 2
    cap = UNSOLD_ITEM_CAP_ALL if wide else UNSOLD_ITEM_CAP
    per = []
    for mid in mids:
        mine = [i for i in items if i["machine_id"] == mid]
        listed = [i for i in mine if i["status"] in ("unsold", "slow")] if wide else mine
        rows = [s for s in stock if s["machine_id"] == mid]
        synced = max((s.get("synced_at") or "" for s in rows), default="")
        entry = {
            "machine_id": mid, "name": mname.get(mid, mid),
            "stock_synced_at": _th_dt(synced).strftime("%Y-%m-%d %H:%M") if synced else None,
            "skus_in_machine_now": len({s["sku_id"] for s in rows if s.get("sku_id")}),
            "count": dict(collections.Counter(i["status"] for i in mine)),
            "items": [{k: v for k, v in i.items() if k not in ("machine_id", "period_days") and v not in (None, [])}
                      for i in listed[:cap]],
        }
        if len(mine) > min(cap, len(listed)):
            entry["truncated"] = (f"แสดง {min(cap, len(listed))} จาก {len(mine)} รายการ"
                                  + (" (เฉพาะ unsold/slow · เรียงตัวที่ค้างนานสุดก่อน)" if wide else "")
                                  + " — ถามทีละตู้เพื่อดูครบ")
        unmapped = sorted({s.get("product_name") or "" for s in rows if not s.get("sku_id")} - {""})
        if unmapped:
            entry["unmapped_slots"] = unmapped
        per.append(entry)
    multi = collections.defaultdict(list)
    for i in items:
        if i["status"] in ("unsold", "slow"):
            multi[i["sku_id"]].append(i["machine_id"])
    return {
        "from": str(d1), "to": str(end), "period_days": max(0, (end - d1).days + 1), "max_packs": max_packs,
        "machines": per,
        # นับเป็น "ตู้" ไม่ใช่สาขา — พระราม 2 มี 2 ตู้
        "in_several_machines": [{"sku_id": s, "machine_count": len(ms), "machines": ms}
                                for s, ms in sorted(multi.items(), key=lambda kv: -len(kv[1])) if len(ms) >= 2],
        "notes": notes + ["in_several_machines นับเป็นจำนวนตู้ ไม่ใช่สาขา (เซ็นทรัลพระราม 2 มี 2 ตู้)"],
    }


# ── สต็อกหน้าตู้ ────────────────────────────────────────────────────────
def _is_box(product_name):
    return "box" in (product_name or "").lower()


def query_stock(machine=None, low_only=False, low_threshold=2):
    """ของเหลือรายช่อง · low_only = เฉพาะช่องที่เหลือ <= low_threshold

    machine รับหลายตู้/ทั้งสาขาได้ ("พระราม 2" = chukes02 + wwv06) — เดิมรับตู้เดียว
    """
    every = load_machines(active_only=False)
    machines = [m for m in every if m.get("status") == "active"]
    mname = {m["machine_id"]: machine_label(m) for m in machines}
    morder = {m["machine_id"]: m.get("id") or 999 for m in machines}
    asked = resolve_machines(machine, every) if machine else []
    # ตู้ที่ปิดแล้ว: ไม่โชว์สต็อกค้างก่อนปิด และบอกตรง ๆ แทน "ไม่พบตู้"
    closed = machine_notes([m for m in asked if m not in mname], {"by_id": {m["machine_id"]: m for m in every}})
    targets = [m for m in asked if m in mname]
    if asked and not targets:
        return {"synced_at": None, "machines": [], "machine_notes": closed,
                "note": "ตู้ที่ถามปิดใช้งานแล้ว ไม่มีสต็อกหน้าตู้"}

    q = ("machine_stock?select=machine_id,slot_number,product_name,sku_id,remain,"
         "max_capacity,is_occupied,synced_at&is_occupied=eq.true&order=machine_id,slot_number")
    if targets:
        q += "&machine_id=in." + _quote_in(targets)
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

    res = {
        "synced_at": synced_th, "age_hours": age_h,
        "stale": bool(age_h and age_h > 24),
        "filtered": "เฉพาะช่องที่เหลือ <= %d" % low_threshold if low_only else "ทุกช่อง",
        "machines": out,
        "note": "หน่วยต่างกันต่อช่อง — ช่อง unit=box นับเป็นกล่อง อย่ารวมกับ pack",
    }
    if closed:
        res["machine_notes"] = closed
    return res


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
                   "&is_occupied=eq.true&order=id")
    since = (datetime.now(timezone.utc) - timedelta(days=SALES_WINDOW_DAYS)).strftime("%Y-%m-%d")
    sales = sb_get(f"sales?select=machine_id,sku_id,quantity_sold,sold_at&sold_at=gte.{since}&order=id")

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
        # ด่านตรวจคำเว่อร์ — แยกจาก hard_rules เพราะเป็นคนละเรื่อง
        # hard_rules คือรูปแบบการเขียน (ยาวเท่าไหร่ แฮชแท็กกี่อัน)
        # overclaim คือ "พูดเกินจริงไหม" ซึ่งเป็นความเสี่ยงต่อชื่อเสียง ไม่ใช่เรื่องความสวยงาม
        "overclaim": v.get("overclaim", {}),
        "example_good": v.get("example"),
        # ⚠️ ต้องส่ง length ด้วย (10 ต.ค. 2026) — เดิมส่งแค่ key/label ตัวตรวจเห็นว่าชิ้นงานเป็น "top5"
        #    แต่ไม่รู้ว่ารูปแบบนี้ยาวได้ถึง 18 บรรทัด จึงตีกลับว่า "ยาวเกิน 3-5 บรรทัด" ทุกชิ้น
        #    (โค้ดนี้ถูกโหลดค้างใน MCP server — แก้แล้วมีผลหลัง Hermes gateway เปิดใหม่
        #    ระหว่างนั้นกฎความยาวของ top5 เขียนไว้ใน hard_rules ข้อ 3 ด้วย ซึ่งอ่านไฟล์ใหม่ทุกครั้ง)
        "formats": [{k: f.get(k) for k in ("key", "label", "length", "manual") if f.get(k) is not None}
                    for f in v.get("content_formats", [])],
    }


def _count_lines(text):
    """จำนวนบรรทัดเนื้อหา — ไม่นับบรรทัดว่าง และ**ไม่นับแถวที่มีแต่แฮชแท็ก**

    กฎความยาว "3-6 บรรทัด/ตามเนื้อหา" ใน content_voice.json หมายถึงเนื้อหาที่คนอ่าน แถวแฮชแท็กท้ายโพสต์
    ไม่ใช่สิ่งที่คนอ่านเป็นบรรทัด (ตัวตรวจเก่าที่ลบไปก็ไม่นับ) — 11 ต.ค. 2026 ตัวตรวจนับ #54 เป็น 7
    ทั้งที่เนื้อหา 6 แล้วตีกลับ · แถวเครดิตราคาของซีรีส์ 5 ใบเด็ดยังนับ เพราะเป็นข้อความจริง
    """
    import re
    tag_row = re.compile(r"^\s*(?:#\S+\s*)+$")
    return sum(1 for ln in (text or "").splitlines() if ln.strip() and not tag_row.match(ln))


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
        # นับให้แล้ว — ห้ามให้ผู้ตรวจนับเอง (10 ต.ค. 2026: แคปชั่น #52/#53 มีข้อความ 17 บรรทัด
        # โมเดลตรวจบอก "อย่างน้อย 19" แล้วตีกลับว่ายาวเกินกฎ 18 บรรทัด)
        "lines_nonblank": _count_lines(r.get("caption")),
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
                 "lines_nonblank = บรรทัดเนื้อหา ไม่นับบรรทัดว่างและไม่นับแถวแฮชแท็ก ใช้ตัวเลขนี้ตัดสินความยาว ห้ามนับเอง · "
                 "notes ต้องเป็นภาษาไทยล้วน (ชื่อการ์ด/ชุดเป็นอังกฤษได้) ห้ามมีอักษรจีน/ญี่ปุ่น/เกาหลี และตรวจตัวสะกดก่อนบันทึก · "
                 "recent_published มีไว้เทียบว่าซ้ำแนวเดิมไหม ไม่ใช่ตัวอย่างให้เลียนแบบ · "
                 "⚠ ตรวจ rules.overclaim ทุกชิ้นด้วย — คำโฆษณาเกินจริงคือความเสี่ยงที่ย้อนกลับมาเป็นดราม่า "
                 "และแก้ไม่ได้หลังโพสต์ ต่างจากคำผิดที่แค่ดูไม่เรียบร้อย"),
    }


def save_content_review(content_id, verdict, notes, reviewer="hermes"):
    """บันทึกผลตรวจ — ไม่แตะ status ของคอนเทนต์ คนยังเป็นผู้ตัดสินเหมือนเดิม"""
    verdict = (verdict or "").strip().lower()
    if verdict not in ("pass", "fix", "drop"):
        raise DvxError(f"verdict ต้องเป็น pass / fix / drop เท่านั้น (ได้ '{verdict}')")
    notes = (notes or "").strip()
    if verdict != "pass" and len(notes) < 10:
        raise DvxError("verdict fix/drop ต้องเขียนเหตุผลให้ชัดว่าติดตรงไหน แก้ยังไง")
    # โมเดลตรวจ (solar-pro4 — โมเดลเกาหลี) เผลอปนอักษรจีน/ญี่ปุ่นลงโน้ตไทย เช่น "สิ่งพิเศษ過多" (#54 · 11 ต.ค. 2026)
    # โน้ตนี้ขึ้นหน้าเว็บให้เจ้าของอ่าน — ปฏิเสธตั้งแต่ตรงนี้ให้ตัวตรวจเขียนใหม่ ดีกว่าให้คนมาเจอคำอ่านไม่ออก
    import re
    foreign = re.findall(r"[぀-ヿ㐀-鿿가-힯]+", notes)
    if foreign:
        raise DvxError(f"notes ต้องเป็นภาษาไทยล้วน — พบอักษรจีน/ญี่ปุ่น/เกาหลี {foreign[:3]} "
                       "ให้เขียนคำนั้นเป็นไทยแล้วบันทึกใหม่ (ชื่อการ์ด/ชุดเป็นอังกฤษได้)")

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


# ── เพิ่มไอเดียเข้าคิวจากภายนอก (Hermes / คน) ────────────────────────────
#
# ⚠️ ทำไมเพิ่งมี — เดิมคิวไอเดียรับจากแหล่งอัตโนมัติอย่างเดียว
#    (ข่าว · TikTok · YouTube · สัญญาณยอดขาย/สต็อก) ไม่มีทางให้คนหรือ agent
#    ใส่ไอเดียเอง เจ้าของจึงต้องก๊อปข้อความจาก Hermes มาให้ Claude Code อีกที
#
# ⚠️ ข้อควรรู้ก่อนใช้ — วัดจากของจริง 27 ส.ค. 2026:
#    คิวมี 107 ไอเดีย · เขียนเป็นคอนเทนต์ 34 · **โพสต์จริง 2**
#    คอขวดอยู่ที่ "อนุมัติ" ไม่ใช่ "ไอเดียไม่พอ" (ค้าง pending กลาง 13 วัน)
#    → tool นี้จึงเตือนกลับเมื่อคิวยาว เพื่อไม่ให้เติมต้นทางจนกองสูงขึ้นเฉย ๆ

# ⚠️ ต้องเป็นค่าที่ผ่าน CHECK constraint ของคอลัมน์ source (migration 060):
#    'news','youtube','tiktok','internal','comment','manual'
#    → ใช้ 'manual' ซึ่งตรงความหมายอยู่แล้ว ("คนหรือ agent เสนอเอง")
#    ไม่เพิ่มค่า 'hermes' เพราะต้องทำ migration ให้เจ้าของไปรันเอง แลกกับที่ได้แค่ป้ายชื่อ
#    แยกว่าใครเสนอด้วย source_label แทน
IDEA_SOURCE_EXTERNAL = "manual"
IDEA_QUEUE_WARN = 60          # 'new' เกินนี้ = คอขวดอยู่ปลายทาง ไม่ใช่ต้นทาง


def _idea_key(title):
    """กันไอเดียซ้ำ — ยุบช่องว่าง/ตัวพิมพ์ แล้วตัดที่ 180 ตัวตามความยาวคอลัมน์"""
    t = " ".join(str(title or "").lower().split())
    return f"{IDEA_SOURCE_EXTERNAL}:{t}"[:180]


def add_marketing_idea(title, angle, summary="", url="", related_sku="",
                       score=2.0, source_label=""):
    """ใส่ไอเดียคอนเทนต์เข้าคิว (status = new) ให้ตัวเขียนคอนเทนต์หยิบไปใช้

    คืน dict ที่มี added (bool) · id · duplicate_of · queue_note
    """
    title = " ".join(str(title or "").split())
    angle = " ".join(str(angle or "").split())
    if len(title) < 12:
        raise DvxError("title สั้นเกินไป — เขียนให้เห็นภาพว่าโพสต์นี้เล่าอะไร (อย่างน้อย 12 ตัวอักษร)")
    if len(angle) < 15:
        raise DvxError("angle ต้องบอกให้ชัดว่าจะเล่ามุมไหน ไม่ใช่แค่ชื่อหัวข้อ "
                       "(อย่างน้อย 15 ตัวอักษร) เช่น 'สอนใส่ sleeve ให้ถูกวิธี — "
                       "โยงเข้าซองที่กดได้จากตู้'")

    key = _idea_key(title)
    existing = sb_get("marketing_ideas?select=id,title,status"
                      f"&external_key=eq.{urllib.parse.quote(key)}")
    if existing:
        e = existing[0]
        return {"added": False, "duplicate_of": e["id"], "status": e["status"],
                "note": f"มีไอเดียชื่อนี้อยู่แล้ว (id={e['id']} · {e['status']}) ไม่ได้เพิ่มซ้ำ"}

    row = {
        "status": "new", "source": IDEA_SOURCE_EXTERNAL,
        "source_label": (source_label or "Hermes · เสนอเอง")[:120],
        "title": title[:300], "summary": (summary or "")[:2000],
        "url": (url or None), "angle": angle[:500],
        "relevance": "เสนอโดย Hermes จากการวิเคราะห์คู่แข่ง/ตลาด",
        "score": float(score), "related_sku": (related_sku or None),
        "external_key": key,
    }
    body = json.dumps([row]).encode("utf-8")
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/marketing_ideas", data=body, method="POST",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise DvxError(f"เพิ่มไอเดียไม่สำเร็จ (HTTP {e.code}): "
                       f"{e.read().decode('utf-8', 'ignore')[:200]}")

    # ⚠️ เตือนกลับเมื่อคิวยาว — ไม่ใช่ error แต่ agent ควรเอาไปบอกผู้ใช้
    pending = sb_get("marketing_ideas?select=id&status=eq.new")
    note = "เพิ่มเข้าคิวแล้ว รอตัวเขียนคอนเทนต์หยิบไปใช้"
    if len(pending) > IDEA_QUEUE_WARN:
        note = (f"เพิ่มแล้ว แต่คิวมีไอเดียที่ยังไม่ถูกหยิบอยู่ {len(pending)} ชิ้น — "
                "คอขวดอยู่ที่การอนุมัติคอนเทนต์ ไม่ใช่จำนวนไอเดีย "
                "บอกเจ้าของให้ไปเคลียร์คอนเทนต์ที่ค้างอนุมัติก่อนจะได้ผลกว่าเติมไอเดียเพิ่ม")
    return {"added": True, "id": out[0]["id"], "title": title,
            "queue_new": len(pending), "note": note}


# ── กล่องจดหมายถึงคนเขียนโค้ด (Hermes → Claude Code) ─────────────────────
#
# ⚠️ ทำไมต้องเป็นไฟล์ ไม่ใช่การส่งตรง
#    Claude Code ไม่ได้รันค้างไว้ — มันมีตัวตนเฉพาะตอนเจ้าของเปิดใช้
#    จึงรับข้อความแบบ push ไม่ได้ ต้องเป็นกล่องที่ทิ้งไว้แล้วอ่านตอนเปิดครั้งถัดไป
#    (CLAUDE.md สั่งให้อ่านไฟล์นี้ทุกครั้งที่เริ่ม session)
#
# ⚠️ ใช้เฉพาะเรื่องที่ต้อง "แก้โค้ด/แก้ระบบ" เท่านั้น
#    ไอเดียคอนเทนต์ให้ใช้ add_marketing_idea แทน — มันเข้าคิวแล้วทำงานต่อได้เลย
#    ไม่ต้องรอใครมาอ่าน

HERMES_INBOX = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "wiki", "hermes-inbox.md")


def note_for_dev(topic, detail, why=""):
    """ฝากข้อเสนอเชิงระบบไว้ให้คนเขียนโค้ดอ่านรอบหน้า"""
    topic = " ".join(str(topic or "").split())
    detail = str(detail or "").strip()
    if len(topic) < 8:
        raise DvxError("topic สั้นเกินไป — เขียนให้รู้ว่าเรื่องอะไร (อย่างน้อย 8 ตัวอักษร)")
    if len(detail) < 30:
        raise DvxError("detail ต้องบอกให้ชัดว่าอยากให้แก้อะไรเป็นอะไร (อย่างน้อย 30 ตัวอักษร) "
                       "— ข้อเสนอกว้าง ๆ อย่าง 'ปรับปรุงระบบ' เอาไปทำต่อไม่ได้")

    stamp = datetime.now(timezone.utc).astimezone(
        timezone(timedelta(hours=7))).strftime("%Y-%m-%d %H:%M")
    block = [f"\n## {topic}", f"`{stamp} · เสนอโดย Hermes`", "", detail.strip()]
    if why.strip():
        block += ["", f"**ทำไม:** {why.strip()}"]
    block += ["", "- [ ] ยังไม่ได้ทำ", ""]

    os.makedirs(os.path.dirname(HERMES_INBOX), exist_ok=True)
    if not os.path.exists(HERMES_INBOX):
        with open(HERMES_INBOX, "w", encoding="utf-8") as f:
            f.write("# กล่องจดหมายจาก Hermes ถึงคนเขียนโค้ด\n\n"
                    "Hermes ฝากข้อเสนอเชิงระบบไว้ที่นี่ผ่าน tool `note_for_dev`\n"
                    "Claude Code อ่านไฟล์นี้ทุกครั้งที่เริ่มทำงาน (สั่งไว้ใน CLAUDE.md)\n\n"
                    "ทำเสร็จแล้วให้ติ๊ก `- [x]` ไว้ อย่าลบทิ้ง จะได้รู้ว่าเคยเสนออะไรไปแล้ว\n"
                    "\n---\n")
    with open(HERMES_INBOX, "a", encoding="utf-8") as f:
        f.write("\n".join(block))

    todo = 0
    with open(HERMES_INBOX, encoding="utf-8") as f:
        todo = f.read().count("- [ ] ยังไม่ได้ทำ")
    return {"saved": True, "topic": topic, "file": "wiki/hermes-inbox.md",
            "open_items": todo,
            "note": f"ฝากไว้แล้ว · ตอนนี้มีเรื่องค้าง {todo} เรื่อง "
                    "จะถูกอ่านตอนเจ้าของเปิด Claude Code ครั้งถัดไป "
                    "(ไม่ใช่ทันที — Claude Code ไม่ได้รันค้างไว้)"}
