"""
DivisionX Card — SKU Profile Agent (POC)

สำหรับแต่ละ SKU active → เขียน profile .md ใน wiki/skus/
รวมข้อมูล:
  - Sales 30 วันล่าสุด (qty, revenue, gross profit)
  - Trend: 7 วันล่าสุด vs 7 วันก่อนหน้า
  - Breakdown per machine
  - Current stock ในแต่ละตู้
  - Linked discrepancies (จาก wiki/discrepancies/)

Usage:
    # ทุก SKU active
    python sku_profile_agent.py

    # แค่ 3 SKU แรก (ทดสอบ)
    python sku_profile_agent.py --limit 3

    # SKU ที่ระบุ
    python sku_profile_agent.py --skus "OP 15,PRB 02"

    # Dry-run (ไม่เรียก LLM)
    python sku_profile_agent.py --dry-run --limit 3
"""

import os
import re
import sys
import json
import argparse
from datetime import datetime, timedelta, date
from pathlib import Path
from dataclasses import dataclass, field
from collections import defaultdict

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WIKI_DIR = PROJECT_ROOT / "wiki"
SKU_DIR = WIKI_DIR / "skus"
DISCREPANCY_DIR = WIKI_DIR / "discrepancies"

ACTIVE_MACHINES = ["chukes01", "chukes02", "chukes04"]

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")


# ── Helpers ───────────────────────────────────────────────────────────

def normalize_sku_id(sku_id: str) -> str:
    """แปลง 'OP 01' → 'OP01', 'NRT Series - 01' → 'NRTSeries-01' (สำหรับ filename + backlink)"""
    return sku_id.replace(" ", "")


# ── Data classes ──────────────────────────────────────────────────────

@dataclass
class MachineBreakdown:
    machine_id: str
    sales_qty: int = 0
    sales_revenue: float = 0.0
    current_stock: int = 0


@dataclass
class SkuProfile:
    sku_id: str            # raw "OP 01"
    name: str
    series: str
    sell_price: float
    cost_price: float
    packs_per_box: int
    boxes_per_cotton: int

    # 30-day stats
    sales_qty_30d: int = 0
    sales_revenue_30d: float = 0.0
    # Trend (7d vs prev 7d)
    sales_qty_7d: int = 0
    sales_qty_prev_7d: int = 0
    # Per machine
    machines: dict[str, MachineBreakdown] = field(default_factory=dict)
    # Linked discrepancies (filenames)
    linked_discrepancies: list[str] = field(default_factory=list)

    @property
    def slug(self) -> str:
        return normalize_sku_id(self.sku_id)

    @property
    def gross_profit_30d(self) -> float:
        return self.sales_revenue_30d - (self.sales_qty_30d * self.cost_price)

    @property
    def gross_margin_pct(self) -> float:
        if self.sales_revenue_30d == 0:
            return 0.0
        return (self.gross_profit_30d / self.sales_revenue_30d) * 100

    @property
    def velocity_per_day(self) -> float:
        return self.sales_qty_30d / 30.0

    @property
    def trend_pct(self) -> float:
        """% change ของ 7d เทียบกับ prev 7d"""
        if self.sales_qty_prev_7d == 0:
            return 0.0 if self.sales_qty_7d == 0 else 100.0
        return ((self.sales_qty_7d - self.sales_qty_prev_7d) / self.sales_qty_prev_7d) * 100

    @property
    def total_current_stock(self) -> int:
        return sum(m.current_stock for m in self.machines.values())


# ── Supabase client ───────────────────────────────────────────────────

def get_supabase() -> Client:
    load_dotenv(PROJECT_ROOT / "deploy" / ".env.local")
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    )
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )
    if not url or not key:
        sys.exit("❌ ไม่พบ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


# ── Data fetching ─────────────────────────────────────────────────────

def fetch_active_skus(sb: Client) -> list[dict]:
    return sb.table("skus").select(
        "sku_id, name, series, sell_price, cost_price, packs_per_box, boxes_per_cotton"
    ).eq("is_active", True).execute().data


def build_profile(sb: Client, sku_row: dict, end_date: date) -> SkuProfile:
    """รวบรวมข้อมูลของ 1 SKU"""
    profile = SkuProfile(
        sku_id=sku_row["sku_id"],
        name=sku_row["name"],
        series=sku_row["series"],
        sell_price=float(sku_row["sell_price"] or 0),
        cost_price=float(sku_row["cost_price"] or 0),
        packs_per_box=sku_row["packs_per_box"],
        boxes_per_cotton=sku_row["boxes_per_cotton"],
    )

    # ── ช่วงเวลา ──
    d30_start = end_date - timedelta(days=30)
    d7_start = end_date - timedelta(days=7)
    d14_start = end_date - timedelta(days=14)
    end_iso = f"{(end_date + timedelta(days=1)).isoformat()}T00:00:00+07:00"

    # ── 30-day sales (รวม + per machine) ──
    sales_30 = sb.table("sales").select(
        "machine_id, quantity_sold, grand_total, sold_at"
    ).eq("sku_id", profile.sku_id).gte(
        "sold_at", f"{d30_start.isoformat()}T00:00:00+07:00"
    ).lt("sold_at", end_iso).execute().data

    d7_start_dt = datetime.fromisoformat(f"{d7_start.isoformat()}T00:00:00+07:00")
    d14_start_dt = datetime.fromisoformat(f"{d14_start.isoformat()}T00:00:00+07:00")

    for row in sales_30:
        qty = row["quantity_sold"]
        rev = float(row["grand_total"])
        mid = row["machine_id"]

        profile.sales_qty_30d += qty
        profile.sales_revenue_30d += rev

        if mid not in profile.machines:
            profile.machines[mid] = MachineBreakdown(machine_id=mid)
        profile.machines[mid].sales_qty += qty
        profile.machines[mid].sales_revenue += rev

        # Trend buckets
        sold_at = datetime.fromisoformat(row["sold_at"].replace("Z", "+00:00"))
        if sold_at >= d7_start_dt:
            profile.sales_qty_7d += qty
        elif sold_at >= d14_start_dt:
            profile.sales_qty_prev_7d += qty

    # ── Current machine_stock ──
    stock_rows = sb.table("machine_stock").select(
        "machine_id, product_name, remain"
    ).execute().data

    # ใช้ regex match SKU จาก product_name (ตามตัวอย่าง vms_stock_sync.map_product_to_sku)
    # ที่นี่ใช้วิธีง่าย: หา sku_id ใน product_name
    sku_in_name = profile.sku_id.replace(" ", "")  # "OP01"
    for row in stock_rows:
        pname = (row.get("product_name") or "").replace(" ", "").upper()
        if sku_in_name.upper() in pname:
            mid = row["machine_id"]
            if mid not in profile.machines:
                profile.machines[mid] = MachineBreakdown(machine_id=mid)
            profile.machines[mid].current_stock += row["remain"]

    # ── Linked discrepancies ──
    if DISCREPANCY_DIR.exists():
        slug = profile.slug
        for f in DISCREPANCY_DIR.glob("*.md"):
            try:
                if slug in f.read_text(encoding="utf-8"):
                    profile.linked_discrepancies.append(f.stem)
            except Exception:
                pass

    return profile


# ── Rendering ─────────────────────────────────────────────────────────

def trend_emoji(pct: float) -> str:
    if pct >= 20:
        return "🔥"  # ขายดีขึ้นมาก
    if pct >= 5:
        return "📈"
    if pct <= -20:
        return "❄️"  # ขายตกแรง
    if pct <= -5:
        return "📉"
    return "➡️"


def render_machine_table(profile: SkuProfile) -> str:
    if not profile.machines:
        return "_ไม่มีข้อมูลขายในตู้ใดเลย_"
    lines = [
        "| ตู้ | ขาย 30 วัน | รายได้ | คงเหลือ |",
        "|-----|-----------|--------|---------|",
    ]
    for mid in sorted(profile.machines.keys()):
        m = profile.machines[mid]
        lines.append(
            f"| [[{mid}]] | {m.sales_qty} ซอง | {m.sales_revenue:,.0f} | {m.current_stock} |"
        )
    return "\n".join(lines)


def render_dry_run_profile(profile: SkuProfile) -> str:
    """Template (ไม่ใช้ LLM)"""
    trend = trend_emoji(profile.trend_pct)
    return f"""---
type: sku
sku_id: {profile.sku_id}
slug: {profile.slug}
series: {profile.series}
pack_size: {profile.packs_per_box}
boxes_per_cotton: {profile.boxes_per_cotton}
sell_price: {profile.sell_price}
cost_price: {profile.cost_price}
sales_qty_30d: {profile.sales_qty_30d}
sales_revenue_30d: {profile.sales_revenue_30d:.2f}
gross_margin_pct: {profile.gross_margin_pct:.1f}
velocity_per_day: {profile.velocity_per_day:.2f}
trend_pct: {profile.trend_pct:.1f}
current_stock_total: {profile.total_current_stock}
mode: dry-run
last_updated: {datetime.now().isoformat()}
---

# {profile.slug}

> 🤖 **Dry-run** — ยังไม่ได้เรียก LLM

**Name:** {profile.name}
**Series:** {profile.series}

## 📊 Performance (30 วันล่าสุด)

| Metric | ค่า |
|--------|----|
| ยอดขาย | **{profile.sales_qty_30d} ซอง** |
| รายได้ | **{profile.sales_revenue_30d:,.0f} บาท** |
| กำไรขั้นต้น | {profile.gross_profit_30d:,.0f} บาท ({profile.gross_margin_pct:.1f}%) |
| Velocity | {profile.velocity_per_day:.1f} ซอง/วัน |
| **Trend (7d vs prev 7d)** | {trend} **{profile.trend_pct:+.0f}%** ({profile.sales_qty_prev_7d} → {profile.sales_qty_7d}) |

## 🏪 Breakdown per ตู้

{render_machine_table(profile)}

## ⚠️ Linked Discrepancies

{chr(10).join(f"- [[{d}]]" for d in profile.linked_discrepancies) if profile.linked_discrepancies else "_ไม่มี_"}

---
_Generated by `sku_profile_agent.py --dry-run`_
"""


# ── LLM ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """คุณเป็น AI analyst ของระบบ DivisionX Card (ตู้ขายการ์ดอัตโนมัติ)

หน้าที่: เขียน SKU profile เป็น Markdown ที่ผู้บริหารใช้ตัดสินใจได้

กฎเข้มงวด:
1. ใช้ **ภาษาไทย** ทั้งหมด รวมถึง section headers — ห้ามใช้ "Summary", "SKU Analysis", "Top Selling" เป็นภาษาอังกฤษ
2. ใช้คำว่า "เคลม" ไม่ใช่ "คำเรียกร้อง"
3. ใช้คำว่า "เพิ่มสต็อก" ไม่ใช่ "เรียกเก็บสินค้า"
4. ใช้ [[backlinks]] ของ Obsidian เชื่อมโยงตู้: [[chukes01]], [[chukes02]], [[chukes04]]
5. ระบุ insight ที่ actionable — ไม่ใช่แค่ list ตัวเลข

โครงสร้างรายงานที่ต้องการ:
## 📝 ภาพรวม
(2-3 บรรทัด: SKU นี้สุขภาพดีไหม + จุดเด่นจุดเสี่ยง)

## 🔍 ข้อสังเกต
(จุดที่น่าสนใจ: ตู้ไหนขายดี/ไม่ดี, trend, stock health, anomaly)

## ✅ Action ที่แนะนำ
(2-3 ข้อ ที่นำไปทำได้จริง)
"""


def call_ollama(profile: SkuProfile) -> str:
    try:
        from ollama import Client
    except ImportError:
        sys.exit("❌ ติดตั้ง ollama ก่อน: pip install -r requirements.txt")

    client = Client(host=OLLAMA_HOST)

    data = {
        "sku_id": profile.sku_id,
        "name": profile.name,
        "series": profile.series,
        "sell_price_baht": profile.sell_price,
        "cost_price_baht": profile.cost_price,
        "stats_30d": {
            "sales_qty": profile.sales_qty_30d,
            "sales_revenue_baht": round(profile.sales_revenue_30d, 2),
            "gross_profit_baht": round(profile.gross_profit_30d, 2),
            "gross_margin_pct": round(profile.gross_margin_pct, 1),
            "velocity_per_day": round(profile.velocity_per_day, 2),
        },
        "trend": {
            "sales_qty_last_7d": profile.sales_qty_7d,
            "sales_qty_prev_7d": profile.sales_qty_prev_7d,
            "change_pct": round(profile.trend_pct, 1),
        },
        "per_machine": [
            {
                "machine_id": m.machine_id,
                "sales_qty_30d": m.sales_qty,
                "sales_revenue_30d": round(m.sales_revenue, 2),
                "current_stock": m.current_stock,
            }
            for m in profile.machines.values()
        ],
        "linked_discrepancies_count": len(profile.linked_discrepancies),
    }

    user_prompt = f"""ข้อมูล SKU {profile.sku_id}:

```json
{json.dumps(data, ensure_ascii=False, indent=2)}
```

เขียน Markdown ภาษาไทยตามโครงสร้างที่กำหนด (ภาพรวม, ข้อสังเกต, Action)
ห้ามใช้ section headers ภาษาอังกฤษ
ตอบเป็น markdown เท่านั้น ไม่ต้องอธิบายเพิ่ม
"""

    response = client.chat(
        model=OLLAMA_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.3},
    )
    return response["message"]["content"]


def render_live_profile(profile: SkuProfile, narrative: str) -> str:
    trend = trend_emoji(profile.trend_pct)
    return f"""---
type: sku
sku_id: {profile.sku_id}
slug: {profile.slug}
series: {profile.series}
pack_size: {profile.packs_per_box}
boxes_per_cotton: {profile.boxes_per_cotton}
sell_price: {profile.sell_price}
cost_price: {profile.cost_price}
sales_qty_30d: {profile.sales_qty_30d}
sales_revenue_30d: {profile.sales_revenue_30d:.2f}
gross_margin_pct: {profile.gross_margin_pct:.1f}
velocity_per_day: {profile.velocity_per_day:.2f}
trend_pct: {profile.trend_pct:.1f}
current_stock_total: {profile.total_current_stock}
mode: ollama
model: {OLLAMA_MODEL}
last_updated: {datetime.now().isoformat()}
---

# {profile.slug}

**Name:** {profile.name} · **Series:** {profile.series}

{narrative}

---

## 📊 ข้อมูลดิบ (30 วันล่าสุด)

| Metric | ค่า |
|--------|----|
| ยอดขาย | **{profile.sales_qty_30d} ซอง** |
| รายได้ | **{profile.sales_revenue_30d:,.0f} บาท** |
| กำไรขั้นต้น | {profile.gross_profit_30d:,.0f} บาท ({profile.gross_margin_pct:.1f}%) |
| Velocity | {profile.velocity_per_day:.1f} ซอง/วัน |
| Trend (7d vs prev 7d) | {trend} **{profile.trend_pct:+.0f}%** ({profile.sales_qty_prev_7d} → {profile.sales_qty_7d}) |
| คงเหลือรวมทุกตู้ | {profile.total_current_stock} ซอง |

## 🏪 Breakdown per ตู้

{render_machine_table(profile)}

## ⚠️ Linked Discrepancies

{chr(10).join(f"- [[{d}]]" for d in profile.linked_discrepancies) if profile.linked_discrepancies else "_ไม่มี_"}

---
_Generated by `sku_profile_agent.py` · model: {OLLAMA_MODEL}_
"""


# ── Main ──────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="DivisionX SKU Profile Agent (POC)")
    p.add_argument("--end-date", type=str, default=None,
                   help="วันสิ้นสุดช่วง 30d (YYYY-MM-DD) default = เมื่อวาน")
    p.add_argument("--skus", type=str, default=None,
                   help="ระบุ SKU เฉพาะ (comma-separated) เช่น 'OP 15,PRB 02'")
    p.add_argument("--limit", type=int, default=None,
                   help="จำกัดจำนวน SKU (จัด priority ตามยอดขาย 30 วันก่อน)")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def main():
    args = parse_args()

    end_date = date.fromisoformat(args.end_date) if args.end_date else date.today() - timedelta(days=1)
    SKU_DIR.mkdir(parents=True, exist_ok=True)

    print(f"🤖 SKU Profile Agent")
    print(f"   ช่วง: {end_date - timedelta(days=30)} → {end_date}")
    print(f"   Mode: {'DRY-RUN' if args.dry_run else f'LIVE (Ollama · {OLLAMA_MODEL})'}")
    print()

    sb = get_supabase()

    # โหลด SKU list
    all_skus = fetch_active_skus(sb)
    print(f"📦 พบ active SKU: {len(all_skus)} ตัว")

    # Filter
    if args.skus:
        wanted = set(s.strip() for s in args.skus.split(","))
        skus = [s for s in all_skus if s["sku_id"] in wanted]
        if len(skus) < len(wanted):
            missing = wanted - set(s["sku_id"] for s in skus)
            print(f"   ⚠️  ไม่พบ SKU: {', '.join(missing)}")
    else:
        skus = all_skus

    # Limit (รัน profile ก่อน sort ตาม sales_qty_30d desc)
    if args.limit and len(skus) > args.limit:
        print(f"   🔍 Sort by ยอดขาย 30 วัน → เลือก top {args.limit}")
        # ดึง sales aggregate เร็วๆ
        d30_start = end_date - timedelta(days=30)
        d30_end = f"{(end_date + timedelta(days=1)).isoformat()}T00:00:00+07:00"
        sales = sb.table("sales").select("sku_id, quantity_sold").gte(
            "sold_at", f"{d30_start.isoformat()}T00:00:00+07:00"
        ).lt("sold_at", d30_end).execute().data
        sales_by_sku = defaultdict(int)
        for r in sales:
            sales_by_sku[r["sku_id"]] += r["quantity_sold"]
        skus = sorted(skus, key=lambda s: sales_by_sku.get(s["sku_id"], 0), reverse=True)
        skus = skus[: args.limit]
        print(f"   📊 จะรัน: {', '.join(s['sku_id'] for s in skus)}")

    print(f"   🎯 จะ process: {len(skus)} SKU")
    print()

    for i, sku_row in enumerate(skus, 1):
        sku_id = sku_row["sku_id"]
        print(f"[{i}/{len(skus)}] 🎴 {sku_id}...")

        profile = build_profile(sb, sku_row, end_date)

        print(f"   📊 ขาย 30 วัน: {profile.sales_qty_30d} ซอง · "
              f"รายได้ {profile.sales_revenue_30d:,.0f} · "
              f"Trend {profile.trend_pct:+.0f}%")

        if profile.sales_qty_30d == 0:
            print(f"   ⏭️  ไม่มียอดขาย — ใช้ dry-run template")
            content = render_dry_run_profile(profile)
        elif args.dry_run:
            content = render_dry_run_profile(profile)
        else:
            print(f"   🧠 เรียก Ollama ({OLLAMA_MODEL})...")
            narrative = call_ollama(profile)
            content = render_live_profile(profile, narrative)

        out = SKU_DIR / f"{profile.slug}.md"
        out.write_text(content, encoding="utf-8")
        print(f"   ✅ {out.relative_to(PROJECT_ROOT)}")

    print()
    print(f"🎉 เสร็จเรียบร้อย — เปิด wiki/skus/ ใน Obsidian")


if __name__ == "__main__":
    main()
