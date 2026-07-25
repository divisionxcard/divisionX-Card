"""
Restock Guard — เตือนเติม "SKU ฮิตที่จะหมดก่อนเติมรอบหน้า" → Telegram การตลาด

ปัญหาที่แก้ (จาก baseline analysis): ตู้เติมได้เฉพาะตอนห้างปิด (วันละ 1 รอบ)
→ ถ้า SKU ฮิต (velocity สูง) หมดกลางวัน = ยอดขายถูก cap = เสียเงินฟรี
"ไม่ปล่อย SKU ฮิตว่าง" = quick win ที่ได้ยอดคืนโดยไม่ต้องจ่ายค่าโฆษณา

Logic (ไม่ใช้ LLM · rule ล้วน · ฟรี · รันบน cloud cron ได้):
  1. current_stock (ซอง) ต่อ (ตู้, SKU)  ← machine_stock (แปลงกล่อง→ซอง)
  2. velocity (ซอง/วัน) ต่อ (ตู้, SKU)   ← sales 14 วันล่าสุด ÷ 14
  3. days_cover = stock ÷ velocity
  4. Flag: velocity ≥ MIN_VELOCITY (ตัดของขายช้า) และ days_cover < THRESHOLD_DAYS
     - 🔴 หมดแล้ว (stock=0, velocity สูง) = เสียยอดอยู่ตอนนี้
     - 🟠 จะหมดวันนี้ (days_cover < 0.5)
     - 🟡 เสี่ยงหมดก่อนเติมรอบหน้า (days_cover < THRESHOLD)

Env:
  SUPABASE_URL + SUPABASE_SERVICE_KEY (หรือ NEXT_PUBLIC_* / SERVICE_ROLE)
  TELEGRAM_MKT_BOT_TOKEN + TELEGRAM_MKT_CHAT_ID   (bot การตลาด · ตัวเดียวกับ weekly digest)

รัน:
  python deploy/agents/restock_guard.py                 # เตือนจริง
  python deploy/agents/restock_guard.py --dry-run       # print เฉย ไม่ส่ง
  python deploy/agents/restock_guard.py --threshold-days 1.5 --min-velocity 3
"""
import os
import sys
import json
import html
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

SB_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
TG_TOKEN = os.environ.get("TELEGRAM_MKT_BOT_TOKEN")
TG_CHAT = os.environ.get("TELEGRAM_MKT_CHAT_ID")

# ── Defaults (ปรับผ่าน args ได้) ──
DEFAULT_THRESHOLD_DAYS = 1.0   # เตือนถ้าของเหลือ < 1 วัน (เติมได้วันละรอบ)
DEFAULT_MIN_VELOCITY = 2.0     # ตัดของขายช้า (< 2 ซอง/วัน ไม่ต้องเตือน)
SALES_WINDOW_DAYS = 14         # ช่วงคำนวณ velocity


def sb_get(path):
    """ดึงทุกหน้าจาก PostgREST"""
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


def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        print("[restock-guard] TELEGRAM_MKT_* ยังไม่ตั้ง — skip send")
        print(text)
        return
    body = json.dumps({"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                                 data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        print("[restock-guard] ส่ง Telegram สำเร็จ")
    except urllib.error.HTTPError as e:
        print(f"[restock-guard] Telegram HTTPError {e.code}: {e.read().decode('utf-8','ignore')}")


def is_box(product_name):
    """ตรงกับ shared.is_box_slot — VMS/WW ใส่คำว่า 'box' ในชื่อถ้าเป็นกล่อง"""
    return "box" in (product_name or "").lower()


def main():
    ap = argparse.ArgumentParser(description="Restock Guard — เตือน SKU ฮิตใกล้หมด")
    ap.add_argument("--threshold-days", type=float, default=DEFAULT_THRESHOLD_DAYS)
    ap.add_argument("--min-velocity", type=float, default=DEFAULT_MIN_VELOCITY)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SB_URL or not SB_KEY:
        print("[restock-guard] ไม่มี SUPABASE_URL/KEY — หยุด")
        return

    # ── โหลดข้อมูล ──
    machines = sb_get("machines?select=machine_id,name,location,status&status=eq.active")
    mname = {m["machine_id"]: (m.get("name") or m.get("location") or m["machine_id"]) for m in machines}
    active_ids = set(mname)

    skus = sb_get("skus?select=sku_id,name,packs_per_box")
    packs_per_box = {s["sku_id"]: (s.get("packs_per_box") or 1) for s in skus}
    sku_name = {s["sku_id"]: (s.get("name") or s["sku_id"]) for s in skus}

    stock = sb_get("machine_stock?select=machine_id,sku_id,product_name,remain,is_occupied&is_occupied=eq.true")

    since = (datetime.now(timezone.utc) - timedelta(days=SALES_WINDOW_DAYS)).strftime("%Y-%m-%d")
    sales = sb_get(f"sales?select=machine_id,sku_id,quantity_sold,sold_at&sold_at=gte.{since}")

    # ── รวม stock (ซอง) ต่อ (ตู้, SKU) ──
    stock_packs = {}  # (mid, sku) -> ซอง
    for r in stock:
        mid, sku = r.get("machine_id"), r.get("sku_id")
        if mid not in active_ids or not sku:
            continue
        units = r.get("remain") or 0
        if is_box(r.get("product_name")):
            units *= packs_per_box.get(sku, 1)
        stock_packs[(mid, sku)] = stock_packs.get((mid, sku), 0) + units

    # ── velocity (ซอง/วัน) ต่อ (ตู้, SKU) ──
    sold = {}  # (mid, sku) -> ซองรวม 14 วัน
    for s in sales:
        mid, sku = s.get("machine_id"), s.get("sku_id")
        if mid not in active_ids or not sku:
            continue
        sold[(mid, sku)] = sold.get((mid, sku), 0) + (s.get("quantity_sold") or 0)

    # ── ประเมินความเสี่ยง ──
    # พิจารณาทุก (ตู้, SKU) ที่มีการขาย (มี velocity) — รวมถึงที่ stock=0
    alerts = []  # dict: mid, sku, stock, vel, days_cover, tier
    for key, total_sold in sold.items():
        vel = total_sold / SALES_WINDOW_DAYS
        if vel < args.min_velocity:
            continue  # ขายช้า — ไม่เตือน
        stk = stock_packs.get(key, 0)
        days_cover = stk / vel if vel > 0 else 999

        if stk == 0:
            tier = 0  # 🔴 หมดแล้ว — เสียยอดอยู่ตอนนี้
        elif days_cover < 0.5:
            tier = 1  # 🟠 จะหมดวันนี้
        elif days_cover < args.threshold_days:
            tier = 2  # 🟡 เสี่ยงหมดก่อนเติมรอบหน้า
        else:
            continue  # ยังพอ

        mid, sku = key
        alerts.append({
            "mid": mid, "sku": sku, "stock": stk, "vel": vel,
            "days_cover": days_cover, "tier": tier,
        })

    if not alerts:
        print("[restock-guard] ✅ ไม่มี SKU ฮิตเสี่ยงหมด — ไม่ส่งเตือน")
        return

    # ── จัดกลุ่มตามตู้ · เรียงตู้ตามจำนวน alert · ใน ตู้ เรียงตาม tier แล้ว days_cover ──
    TIER_ICON = {0: "🔴", 1: "🟠", 2: "🟡"}
    TIER_LABEL = {0: "หมดแล้ว", 1: "หมดวันนี้", 2: "เสี่ยงหมด"}
    by_machine = {}
    for a in alerts:
        by_machine.setdefault(a["mid"], []).append(a)
    for lst in by_machine.values():
        lst.sort(key=lambda a: (a["tier"], a["days_cover"]))
    machines_sorted = sorted(by_machine.items(), key=lambda kv: (
        min(a["tier"] for a in kv[1]), -len(kv[1])))

    n_crit = sum(1 for a in alerts if a["tier"] == 0)
    lines = [
        "🚨 <b>เตือนเติมสต็อก · SKU ฮิตใกล้หมด</b>",
        f"<i>{datetime.now().strftime('%d/%m %H:%M')} · เกณฑ์ &lt;{args.threshold_days:g} วัน · velocity ≥ {args.min_velocity:g} ซอง/วัน</i>",
        "━━━━━━━━━━━━━",
    ]
    if n_crit:
        lines.append(f"🔴 <b>{n_crit} SKU หมดแล้ว</b> — กำลังเสียยอดตอนนี้")
        lines.append("")

    for mid, lst in machines_sorted:
        lines.append(f"📍 <b>{html.escape(mname.get(mid, mid))}</b>")
        for a in lst:
            name = html.escape(sku_name.get(a["sku"], a["sku"]))
            if a["tier"] == 0:
                cover = "หมด"
            else:
                cover = f"~{a['days_cover'] * 24:.0f} ชม." if a["days_cover"] < 1 else f"~{a['days_cover']:.1f} วัน"
            lines.append(
                f"  {TIER_ICON[a['tier']]} {name} · เหลือ {a['stock']:.0f} ซอง · "
                f"ขาย {a['vel']:.0f}/วัน · {cover}"
            )
        lines.append("")

    lines.append("💡 เติม SKU 🔴🟠 ก่อนในรอบเติมถัดไป — ป้องกันยอดหลุดช่วงกลางวัน")
    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3950] + "\n…(ตัดเพราะยาวเกิน)"

    print(f"[restock-guard] พบ {len(alerts)} alert ใน {len(by_machine)} ตู้ (🔴{n_crit})")
    if args.dry_run:
        print("── DRY RUN — ไม่ส่ง ──")
        print(text)
    else:
        tg_send(text)


if __name__ == "__main__":
    main()
