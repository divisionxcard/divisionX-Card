"""
สรุปยอดขาย + กำไรต่อสาขา → Telegram ผ่านบอท DVX Job (@dvx_marketing_bot)

สองแบบ (เจ้าของสั่ง 30 ต.ค. 2026):
  รายวัน    — ของเมื่อวาน · เทียบวันเดียวกันของสัปดาห์ก่อน (วันธรรมดา/เสาร์อาทิตย์ยอดต่างกันมาก)
  รายสัปดาห์ (--week) — จันทร์→อาทิตย์ของสัปดาห์ที่แล้ว · เทียบสัปดาห์ก่อนหน้า
รันจากบอทซิงค์ในเครื่อง (scripts/telegram_sync_bot.py): 07:45 ดึงยอดขายจากตู้อีกรอบ → 08:00 ส่ง (รายสัปดาห์ทุกวันจันทร์)
ไม่รันบน GitHub Actions เพราะ cron ที่นั่นเลื่อนได้หลายชั่วโมง (เคยวัดได้ ~234 นาที)
รูปแบบต่อยอดจาก weekly_sales_digest.py (ตัวเดิมบน GitHub · ช่วง 7 วันแบบเลื่อน ไม่ใช่จันทร์–อาทิตย์ · ไม่มีกำไร)

ส่งเข้า 2 ห้อง: แชตเจ้าของ (TELEGRAM_MKT_CHAT_ID) + กลุ่ม DVX_Admin (TELEGRAM_DVX_ADMIN_CHAT_ID · ไม่ตั้ง = ข้าม)

กำไร = ยอดขาย − ค่าธรรมเนียม Ksher (VMS 1.5% · WW 0.5% · อื่น ๆ 1.5% — เท่าหน้าเว็บ)
       − ต้นทุนต่อซอง × จำนวนซอง − เงินคืนเคลม
ต้นทุนต่อซองดูตาม "วันที่ขายของแต่ละแถว" จากตาราง sku_costs (มีผลตั้งแต่วันไหน · migration 083)
→ ไม่มีประวัติเลยค่อยใช้ skus.avg_cost / cost_price · กล่อง = ทุนต่อซอง × ซองต่อกล่อง
⚠️ สินค้าที่ต้นทุนเป็น 0/ไม่มี จะ**ไม่ถูกนับในกำไร** และขึ้นเตือนแยก — หน้าเว็บเดิมนับทุน 0 ทำให้กำไรเกินจริง

⚠️ sales.sold_at เป็นเวลา UTC จริง (ขายมากสุดช่วง 03–14 UTC = 10–21 น.) → "วันที่ไทย" = ช่วง UTC 17:00 ของวันก่อน ถึง 17:00

Env (os.environ ก่อน · ขาดค่อยอ่าน deploy/.env.local):
  SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_KEY | SUPABASE_SERVICE_ROLE_KEY
  TELEGRAM_MKT_BOT_TOKEN + TELEGRAM_MKT_CHAT_ID · TELEGRAM_DVX_ADMIN_CHAT_ID (ไม่บังคับ)

รัน:
  python deploy/agents/daily_sales_digest.py                          # เมื่อวาน (เวลาไทย) → ส่ง
  python deploy/agents/daily_sales_digest.py --week                   # จันทร์–อาทิตย์ที่แล้ว → ส่ง
  python deploy/agents/daily_sales_digest.py --date 2026-10-29 --dry-run      # วันไหนก็ได้ · ไม่ส่ง
  python deploy/agents/daily_sales_digest.py --week --date 2026-10-22 --dry-run   # สัปดาห์ที่มีวันนั้น
  --note "ข้อความ"   แนบบรรทัดท้าย (บอทบอกผลดึงยอดรอบเช้า)
  --only-owner       ส่งแค่แชตเจ้าของ ไม่เข้ากลุ่ม
"""
import argparse
import html
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

import _console  # noqa: F401 — บังคับ stdout เป็น UTF-8 ต้องมาก่อน print แรก

ENV_FILE = pathlib.Path(__file__).resolve().parents[1] / ".env.local"
TH = timezone(timedelta(hours=7))
MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
DOW_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
DOW_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]
KSHER_FEE = {"vms": 0.015, "worldwide": 0.005}   # เท่า components/shared/helpers.js
KSHER_DEFAULT = 0.015
DROP_ALERT = -25                                 # % เท่ารายสัปดาห์ตัวเดิม
DROP_MIN_BASE = 1000                             # เตือนยอดตกเฉพาะสาขาที่ช่วงก่อนขายได้ถึงเท่านี้ (รายวันยอดน้อย แกว่งแรง)
MAX_CHARS = 4096                                 # เพดานข้อความ Telegram
EXIT_GROUP_FAILED = 3                            # ส่งแชตเจ้าของแล้ว แต่กลุ่ม DVX_Admin ล้ม — บอทรายงานครั้งเดียว ไม่ลองใหม่


def _env_file():
    try:
        text = ENV_FILE.read_text(encoding="utf-8-sig")
    except OSError:
        return {}
    out = {}
    for line in text.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"')
    return out


_FILE = None


def env(*keys):
    global _FILE
    for k in keys:
        if os.environ.get(k):
            return os.environ[k]
    if _FILE is None:
        _FILE = _env_file()
    for k in keys:
        if _FILE.get(k):
            return _FILE[k]
    return None


SB_URL = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = env("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY")


def sb_get(path):
    """ดึงทุกหน้าจาก PostgREST"""
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{path}",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                     "Range": f"{offset}-{offset + page - 1}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.loads(r.read().decode("utf-8"))
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def utc_window(first, last):
    """ช่วงวันที่ไทย [first, last] → ช่วง sold_at (UTC) แบบ [start, end)
    เขียนเป็น Z เลี่ยง '+' ใน query ที่ทำให้ PostgREST 400"""
    start = datetime(first.year, first.month, first.day, tzinfo=TH).astimezone(timezone.utc)
    end = datetime(last.year, last.month, last.day, tzinfo=TH).astimezone(timezone.utc) + timedelta(days=1)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")


def thai_day(sold_at):
    """sold_at (ISO มี timezone) → วันที่ไทย"""
    s = str(sold_at).replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TH).date()


def sales_between(first, last):
    a, b = utc_window(first, last)
    q = urllib.parse.quote
    return sb_get("sales?select=machine_id,sku_id,quantity_sold,unit,grand_total,transaction_id,sold_at"
                  f"&sold_at=gte.{q(a)}&sold_at=lt.{q(b)}&order=id")   # เรียงตายตัว — ดึงทีละหน้าเกิน 1,000 แถวต่อสัปดาห์ ไม่เรียงแล้วซ้ำ/หายได้


class Costs:
    """ต้นทุนต่อซองตามวันที่ขาย — กติกาเดียวกับหน้าเว็บ (components/shared/costs.js)

    sku_costs: แถวล่าสุดที่ effective_from <= วันที่ขาย · ไม่มีแถวไหนถึงวันนั้น → skus.avg_cost > 0 → skus.cost_price > 0
    ได้ 0/None = ไม่รู้ต้นทุน (หน้าเว็บนับเป็น 0 เหมือนเดิม · ที่นี่แยกเตือนไม่นับในกำไร)
    """

    def __init__(self, skus, history):
        self.skus = {s["sku_id"]: s for s in skus}
        self.hist = {}
        for h in sorted(history, key=lambda h: h["effective_from"]):
            self.hist.setdefault(h["sku_id"], []).append((h["effective_from"][:10], float(h["cost_per_pack"] or 0)))

    def on(self, sku_id, day):
        iso = day.isoformat()
        hit = None
        for eff, c in self.hist.get(sku_id) or []:
            if eff <= iso:
                hit = c
        if hit is not None:
            return hit if hit > 0 else None
        s = self.skus.get(sku_id) or {}
        for k in ("avg_cost", "cost_price"):
            v = float(s.get(k) or 0)
            if v > 0:
                return v
        return None

    def packs(self, row):
        """จำนวนซองของแถวขาย — ต้นทุนกล่อง = ทุนต่อซอง × ซองต่อกล่อง (เจ้าของ 30 ต.ค. 2026)

        ทุกยี่ห้อเก็บแถวกล่องเป็นจำนวนซองอยู่แล้ว (ตรวจ 616 แถว: กล่อง OP 17 = 24) จึงใช้ตามนั้น
        กันไว้ชั้นเดียว: แถว unit=box ที่จำนวนน้อยกว่าซองต่อกล่อง = นับเป็น "กล่อง" → คูณซองต่อกล่องให้
        """
        qty = int(row.get("quantity_sold") or 0)
        ppb = int((self.skus.get(row.get("sku_id")) or {}).get("packs_per_box") or 0)
        if row.get("unit") == "box" and ppb > 1 and 0 < qty < ppb:
            return qty * ppb
        return qty


def load_costs():
    skus = sb_get("skus?select=sku_id,avg_cost,cost_price,packs_per_box")
    try:
        hist = sb_get("sku_costs?select=sku_id,cost_per_pack,effective_from&order=id")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        if e.code != 404 and "PGRST205" not in body:
            raise                       # คอลัมน์ผิด/สิทธิ์ผิด = ต้องล้มให้เห็น ไม่ใช่ใช้ทุนเก่าเงียบ ๆ
        hist = []                       # ยังไม่มีตาราง (migration 083) — ใช้ค่าใน skus ไปก่อน
    return Costs(skus, hist)


def _blank():
    return {"rev": 0.0, "profit": 0.0, "known_rev": 0.0, "unknown_rev": 0.0, "packs": 0, "bills": set(), "refund": 0.0}


def summarize(sales, claims, brand, costs):
    """→ (ต่อตู้, รวม, ยอดของสินค้าที่ไม่รู้ทุน) (ฟังก์ชันล้วน — ทดสอบได้)

    ต้นทุนดูตามวันที่ขายของแต่ละแถว — สัปดาห์ที่คร่อมวันเปลี่ยนต้นทุนจะได้ทุนถูกทั้งสองฝั่ง
    """
    per, unknown = {}, {}
    for r in sales:
        mid = r["machine_id"]
        m = per.setdefault(mid, _blank())
        rev = float(r.get("grand_total") or 0)
        qty = costs.packs(r)
        m["rev"] += rev
        m["packs"] += qty
        if r.get("transaction_id"):
            m["bills"].add(r["transaction_id"])
        sku = r.get("sku_id") or "?"
        cost = costs.on(sku, thai_day(r["sold_at"]))
        if cost is None:
            unknown[sku] = unknown.get(sku, 0.0) + rev
            m["unknown_rev"] += rev
            continue
        fee = rev * KSHER_FEE.get(brand.get(mid), KSHER_DEFAULT)
        m["known_rev"] += rev
        m["profit"] += rev - fee - cost * qty
    for c in claims:
        m = per.setdefault(c["machine_id"], _blank())
        amt = float(c.get("refund_amount") or 0)
        m["refund"] += amt
        m["profit"] -= amt
    tot = {k: sum(m[k] for m in per.values()) for k in ("rev", "profit", "known_rev", "unknown_rev", "packs", "refund")}
    tot["bills"] = sum(len(m["bills"]) for m in per.values())
    return per, tot, unknown


def branch_map(machines):
    """machine_id → (คีย์สาขา, ชื่อสาขา) · ตู้ห้างเดียวกันรวมเป็นสาขาเดียว (ฟังก์ชันล้วน)

    เจ้าของขอ "กำไรของแต่ละสาขา" · พระราม 2 มี 2 ตู้ (VMS "เซ็นทรัลพระราม2" + WW "เซ็นทรัล พระราม 2")
    ชื่อสะกดเว้นวรรคไม่เหมือนกัน → คีย์ตัดช่องว่างทิ้ง · ชื่อที่แสดงเลือกแบบที่มีเว้นวรรค (อ่านง่ายกว่า)
    """
    labels, out = {}, {}
    for m in machines:
        loc = (m.get("location") or m.get("name") or m["machine_id"]).strip()
        key = "".join(loc.split()).lower()
        if key not in labels or len(loc) > len(labels[key]):
            labels[key] = loc
        out[m["machine_id"]] = key
    return {mid: (key, labels[key]) for mid, key in out.items()}


def by_branch(per, bmap):
    """รวมตัวเลขต่อตู้เป็นต่อสาขา (ฟังก์ชันล้วน)"""
    out = {}
    for mid, m in per.items():
        key, label = bmap.get(mid, (mid, mid))
        b = out.setdefault(key, {"label": label, "rev": 0.0, "profit": 0.0, "known_rev": 0.0,
                                 "unknown_rev": 0.0, "refund": 0.0, "machines": set()})
        for k in ("rev", "profit", "known_rev", "unknown_rev", "refund"):
            b[k] += m[k]
        b["machines"].add(mid)
    return out


def pct(cur, prev):
    return None if prev <= 0 else (cur - prev) / prev * 100


def arrow(cur, prev):
    """ลูกศรเทียบช่วงก่อน · ช่วงก่อนเป็น 0 = ของใหม่ (🆕) · ติดลบ = เทียบ % ไม่ได้ (—)"""
    p = pct(cur, prev)
    if p is None:
        return "🆕" if prev == 0 else "—"
    if p >= 5:
        return f"▲{p:.0f}%"
    if p <= -5:
        return f"▼{abs(p):.0f}%"
    return "≈"


def fmt(n):
    return f"{n:,.0f}"


def period_of(today, week=False, anchor=None):
    """→ (วันแรก, วันสุดท้าย, วันแรกของช่วงเทียบ, วันสุดท้ายของช่วงเทียบ) (ฟังก์ชันล้วน)

    รายวัน: เมื่อวาน (หรือ anchor) · เทียบวันเดียวกันของสัปดาห์ก่อน
    รายสัปดาห์: จันทร์–อาทิตย์ของสัปดาห์ที่แล้ว (หรือสัปดาห์ที่มี anchor) · เทียบสัปดาห์ก่อนหน้า
    """
    if not week:
        d = anchor or (today - timedelta(days=1))
        p = d - timedelta(days=7)
        return d, d, p, p
    ref = anchor or (today - timedelta(days=7))
    mon = ref - timedelta(days=ref.weekday())
    return mon, mon + timedelta(days=6), mon - timedelta(days=7), mon - timedelta(days=1)


def fit(lines, limit=MAX_CHARS):
    """ตัดที่ขอบบรรทัด — ตัดกลางบรรทัดอาจขาดกลาง <b>…</b> หรือ &lt; แล้ว Telegram ปฏิเสธทั้งข้อความ"""
    out, size = [], 0
    for ln in lines:
        if size + len(ln) + 1 > limit - 40:
            out.append("…(ตัดเพราะยาวเกิน)")
            break
        out.append(ln)
        size += len(ln) + 1
    return "\n".join(out)


def sku_movers(cur_sales, prev_sales, n=5):
    """→ (ขายดี, ยอดลดลง) เป็นลิสต์ (sku, ยอดช่วงนี้, ยอดช่วงเทียบ) (ฟังก์ชันล้วน — ทดสอบได้)

    ขายดี = ยอดเงินสูงสุด n ตัว · ยอดลดลง = ลดลงเป็นบาทมากสุด n ตัว (รวมตัวที่ช่วงนี้ขายไม่ได้เลย)
    เรียงตามบาทไม่ใช่ % — ตัวขายน้อยลดจาก 80 เหลือ 0 = ▼100% แต่ไม่สำคัญเท่าตัวหลักที่หายไปหลายพัน
    """
    def by_sku(rows):
        out = {}
        for r in rows:
            k = r.get("sku_id") or "?"
            out[k] = out.get(k, 0.0) + float(r.get("grand_total") or 0)
        return out
    cur, prev = by_sku(cur_sales), by_sku(prev_sales)
    top = [(k, v, prev.get(k, 0.0)) for k, v in sorted(cur.items(), key=lambda kv: kv[1], reverse=True)[:n]]
    falls = [(k, cur.get(k, 0.0), p) for k, p in prev.items() if cur.get(k, 0.0) < p]
    down = sorted(falls, key=lambda t: t[2] - t[1], reverse=True)[:n]
    return top, down


def build_message(first, last, per, tot, unknown, prev_per, prev_tot, movers, bmap, active, note=""):
    """ข้อความ HTML ของ Telegram (ฟังก์ชันล้วน — ทดสอบได้) · first == last = รายวัน

    movers = (ขายดี, ยอดลดลง, ป้ายช่วงเทียบ) จาก sku_movers — รายวันเทียบวันก่อนหน้า · รายสัปดาห์เทียบสัปดาห์ก่อน
    """
    week = first != last
    days = (last - first).days + 1
    if week:
        title = "📊 <b>สรุปยอดขายรายสัปดาห์ · DivisionX Card</b>"
        span = (f"{DOW_SHORT[first.weekday()]} {first.day} {MONTH_TH[first.month]} – "
                f"{DOW_SHORT[last.weekday()]} {last.day} {MONTH_TH[last.month]} {last.year}")
        vs = "สัปดาห์ก่อน"
    else:
        title = "📊 <b>สรุปยอดขายประจำวัน · DivisionX Card</b>"
        span = f"{DOW_TH[first.weekday()]} {first.day} {MONTH_TH[first.month]} {first.year}"
        vs = f"{DOW_SHORT[first.weekday()]} ก่อน"
    lines = [title, f"<i>{span}</i>", "━━━━━━━━━━━━━",
             f"💰 ยอดขาย: <b>{fmt(tot['rev'])}</b> บาท ({arrow(tot['rev'], prev_tot['rev'])} จาก{vs} {fmt(prev_tot['rev'])})"]
    margin = f" · {tot['profit'] / tot['known_rev'] * 100:.0f}%" if tot["known_rev"] > 0 else ""
    lines.append(f"💵 กำไรสุทธิ: <b>{fmt(tot['profit'])}</b> บาท{margin}"
                 f" ({arrow(tot['profit'], prev_tot['profit'])} จาก{vs} {fmt(prev_tot['profit'])})")
    if week:
        lines.append(f"📅 เฉลี่ย/วัน: <b>{fmt(tot['rev'] / days)}</b> บาท · กำไร {fmt(tot['profit'] / days)} บาท")
    lines.append(f"🧾 ขาย {fmt(tot['packs'])} ซอง · {fmt(tot['bills'])} บิล"
                 + (f" · คืนเงินเคลม {fmt(tot['refund'])} บาท" if tot["refund"] else ""))

    cur_b, prev_b = by_branch(per, bmap), by_branch(prev_per, bmap)
    n_machines = {}
    for mid in active:
        key = bmap.get(mid, (mid, mid))[0]
        n_machines[key] = n_machines.get(key, 0) + 1
    lines += ["", "📈 <b>ยอด · กำไรต่อสาขา</b>"]
    shown = [kv for kv in sorted(cur_b.items(), key=lambda kv: kv[1]["rev"], reverse=True)
             if kv[1]["rev"] > 0 or kv[1]["refund"]]
    for key, b in shown:
        prev = (prev_b.get(key) or {}).get("rev", 0)
        two = f" ({n_machines[key]} ตู้)" if n_machines.get(key, 0) > 1 else ""
        star = "*" if b["unknown_rev"] > 0 else ""
        lines.append(f"• {html.escape(b['label'])}{two}: {fmt(b['rev'])} ({arrow(b['rev'], prev)})"
                     f" · กำไร {fmt(b['profit'])}{star}")
    printed = {k for k, _ in shown}
    labels = {bmap.get(mid, (mid, mid))[0]: bmap.get(mid, (mid, mid))[1] for mid in active}
    idle = sorted((k for k in labels if k not in printed), key=lambda k: labels[k])
    for key in idle:
        lines.append(f"• {html.escape(labels[key])}: 0 — ไม่มียอด")
    top, down, sku_vs = movers if movers else ([], [], "")
    if top:
        lines += ["", f"🔥 <b>ขายดี</b> (เทียบ {sku_vs}): "
                  + " · ".join(f"{html.escape(k)} {fmt(c)} ({arrow(c, p)})" for k, c, p in top)]
    if down:
        lines += [f"📉 <b>ยอดลดลง</b> (เทียบ {sku_vs}): "
                  + " · ".join(f"{html.escape(k)} {fmt(c)} ({arrow(c, p)})" for k, c, p in down)]

    drops = []
    for key, b in shown:
        prev = (prev_b.get(key) or {}).get("rev", 0)
        p = pct(b["rev"], prev)
        if prev >= DROP_MIN_BASE and p is not None and p <= DROP_ALERT:
            drops.append(f"{html.escape(b['label'])} {arrow(b['rev'], prev)}")
    for key in idle:
        if (prev_b.get(key) or {}).get("rev", 0) >= DROP_MIN_BASE:
            drops.append(f"{html.escape(labels[key])} ▼100%")
    if drops:
        lines += ["", f"⚠️ <b>สาขาที่ยอดตก ≥25%</b> (เทียบ{vs}): " + " · ".join(drops)]
    if unknown:
        lines += ["", "⚠️ <b>ยังไม่มีต้นทุนในระบบ</b> — ไม่ได้นับในกำไร (สาขาที่มี * กำไรต่ำกว่าจริง): "
                  + " · ".join(f"{html.escape(k)} ({fmt(v)})" for k, v in sorted(unknown.items(), key=lambda kv: -kv[1]))]
    if not tot["rev"]:
        lines += ["", "⚠️ ไม่พบยอดขายของช่วงนี้ในระบบ — อาจยังซิงค์ไม่เข้า เช็กด้วย /auto ในห้อง DVX_Owner"]
    if note:
        lines += ["", html.escape(note)]
    lines += ["", "<i>กำไร = ยอดขาย − ค่าธรรมเนียม Ksher − ต้นทุนต่อซอง − เงินคืนเคลม</i>"]
    return fit(lines)


def tg_send(token, chat_id, text):
    body = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            r.read()
        return True, ""
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}"
    except Exception as e:
        return False, str(e)[:200]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", action="store_true", help="สรุปจันทร์–อาทิตย์ของสัปดาห์ที่แล้ว")
    ap.add_argument("--date", help="วันที่ไทย YYYY-MM-DD (รายวัน = วันนั้น · --week = สัปดาห์ที่มีวันนั้น)")
    ap.add_argument("--dry-run", action="store_true", help="พิมพ์ข้อความ ไม่ส่ง")
    ap.add_argument("--only-owner", action="store_true", help="ไม่ส่งเข้ากลุ่ม DVX_Admin")
    ap.add_argument("--note", default="", help="บรรทัดท้ายข้อความ")
    a = ap.parse_args()
    if not SB_URL or not SB_KEY:
        print("[daily] ไม่มี SUPABASE URL/KEY — หยุด")
        return 1

    tag = "[weekly]" if a.week else "[daily]"
    anchor = date.fromisoformat(a.date) if a.date else None
    first, last, p_first, p_last = period_of(datetime.now(TH).date(), a.week, anchor)
    machines = sb_get("machines?select=machine_id,location,name,status,brand")
    bmap = branch_map(machines)
    brand = {m["machine_id"]: (m.get("brand") or "vms") for m in machines}
    active = [m["machine_id"] for m in machines if m.get("status") == "active"]
    costs = load_costs()
    lo, hi = min(first, p_first), max(last, p_last)
    claims = sb_get("claims?select=machine_id,refund_amount,claimed_at"
                    f"&claimed_at=gte.{lo.isoformat()}&claimed_at=lte.{hi.isoformat()}&order=id")

    def claims_in(d1, d2):
        return [c for c in claims if d1.isoformat() <= str(c.get("claimed_at") or "")[:10] <= d2.isoformat()]

    sales, prev_sales = sales_between(first, last), sales_between(p_first, p_last)
    per, tot, unknown = summarize(sales, claims_in(first, last), brand, costs)
    prev_per, prev_tot, _ = summarize(prev_sales, claims_in(p_first, p_last), brand, costs)
    # สินค้าขายดี/ยอดลดลง: รายวันเทียบ "วันก่อนหน้า" (เจ้าของขอ 30 ต.ค.) · รายสัปดาห์เทียบสัปดาห์ก่อน
    if first == last:
        d0 = first - timedelta(days=1)
        sku_prev, sku_vs = sales_between(d0, d0), f"{DOW_SHORT[d0.weekday()]} {d0.day} {MONTH_TH[d0.month]}"
    else:
        sku_prev, sku_vs = prev_sales, "สัปดาห์ก่อน"
    movers = sku_movers(sales, sku_prev) + (sku_vs,)
    text = build_message(first, last, per, tot, unknown, prev_per, prev_tot, movers, bmap, active, a.note)

    span = first.isoformat() if first == last else f"{first}→{last}"
    print(f"{tag} {span} · ยอด {fmt(tot['rev'])} · กำไร {fmt(tot['profit'])} · {len(sales)} แถว"
          + (f" · ไม่มีทุน {len(unknown)} SKU" if unknown else ""))
    if a.dry_run:
        print(text)
        return 0
    token = env("TELEGRAM_MKT_BOT_TOKEN")
    owner = env("TELEGRAM_MKT_CHAT_ID")
    if not token or not owner:
        print(f"{tag} TELEGRAM_MKT_* ยังไม่ตั้ง — ไม่ได้ส่ง")
        return 1
    # แชตเจ้าของคือตัวตัดสินว่า "ส่งสำเร็จ" — กลุ่มล้มอย่างเดียวห้ามให้บอทลองใหม่ (จะส่งซ้ำเข้าแชตเจ้าของ)
    ok, err = tg_send(token, owner, text)
    if not ok:
        print(f"⚠️ {tag} ส่งเข้าแชตเจ้าของไม่สำเร็จ — {err}")
        return 1
    group = None if a.only_owner else env("TELEGRAM_DVX_ADMIN_CHAT_ID")
    if not group:
        print(f"{tag} ส่งแล้ว 1/1 ห้อง" + ("" if a.only_owner else " (ยังไม่ได้ตั้งกลุ่ม DVX_Admin)"))
        return 0
    ok, err = tg_send(token, group, text)
    if not ok:
        print(f"⚠️ {tag} ส่งแชตเจ้าของแล้ว แต่ส่งเข้ากลุ่ม DVX_Admin ไม่สำเร็จ — {err}")
        return EXIT_GROUP_FAILED
    print(f"{tag} ส่งแล้ว 2/2 ห้อง")
    return 0


if __name__ == "__main__":
    sys.exit(main())
