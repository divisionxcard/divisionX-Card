"""
DivisionX Card — Reconciliation Agent (POC)

เปรียบเทียบ VMS sales vs stock_out vs claims ของแต่ละตู้/วัน
หากพบ discrepancy → เรียก Claude API ให้เขียน report เป็น .md
บันทึกใน wiki/discrepancies/

Usage:
    # Dry-run (ไม่เรียก Claude API — print summary เท่านั้น)
    python reconcile_agent.py --dry-run

    # Run จริง (ต้องมี ANTHROPIC_API_KEY)
    python reconcile_agent.py --date 2026-05-21

    # ระบุตู้เฉพาะ
    python reconcile_agent.py --machines chukes01,chukes02 --date 2026-05-21
"""

import os
import sys
import json
import argparse

# Force UTF-8 stdout บน Windows (default cp1252 พิมพ์ emoji ไม่ได้)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
from datetime import datetime, timedelta, date
from pathlib import Path
from dataclasses import dataclass, field, asdict
from collections import defaultdict

from dotenv import load_dotenv
from supabase import create_client, Client

from shared import get_active_machines

# ── Config ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WIKI_DIR = PROJECT_ROOT / "wiki"
DISCREPANCY_DIR = WIKI_DIR / "discrepancies"

# ACTIVE_MACHINES: ใช้ get_active_machines(sb) ใน main() — ไม่ hardcode อีกต่อไป

# Ollama config (override ผ่าน env)
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")

# ── Data classes ──────────────────────────────────────────────────────

@dataclass
class SkuActivity:
    """กิจกรรมของ SKU ใน 1 ตู้/วัน"""
    sku_id: str
    sales_qty: int = 0           # ขายไป (จาก VMS sales)
    sales_revenue: float = 0.0   # รายได้
    stock_in_qty: int = 0        # เบิกเข้า (จาก stock_out)
    claims_qty: int = 0          # เคลม
    claims_damaged: int = 0      # เคลม-ชำรุด (หักสต็อก)
    current_stock: int = 0       # คงเหลือในตู้ตอนนี้

    @property
    def net_change(self) -> int:
        """net change ของสต็อกในตู้ = +refill - sales - damaged"""
        return self.stock_in_qty - self.sales_qty - self.claims_damaged


@dataclass
class MachineReport:
    """รายงาน reconciliation ของ 1 ตู้/วัน"""
    machine_id: str
    report_date: date
    skus: dict[str, SkuActivity] = field(default_factory=dict)

    @property
    def total_sales_qty(self) -> int:
        return sum(s.sales_qty for s in self.skus.values())

    @property
    def total_revenue(self) -> float:
        return sum(s.sales_revenue for s in self.skus.values())

    @property
    def total_claims(self) -> int:
        return sum(s.claims_qty for s in self.skus.values())

    @property
    def total_refill(self) -> int:
        return sum(s.stock_in_qty for s in self.skus.values())

    @property
    def has_activity(self) -> bool:
        return bool(self.skus)


# ── Supabase client ───────────────────────────────────────────────────

def get_supabase() -> Client:
    """สร้าง Supabase client จาก env"""
    load_dotenv(PROJECT_ROOT / "deploy" / ".env.local")

    # รองรับชื่อ env หลายแบบ (จาก Next.js หรือ scraper)
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    )
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )

    if not url or not key:
        sys.exit("❌ ไม่พบ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน .env.local")

    return create_client(url, key)


# ── Data fetching ─────────────────────────────────────────────────────

def fetch_machine_data(sb: Client, machine_id: str, target_date: date) -> MachineReport:
    """ดึงข้อมูล sales + stock_out + claims + machine_stock ของตู้/วัน"""

    report = MachineReport(machine_id=machine_id, report_date=target_date)
    skus: dict[str, SkuActivity] = defaultdict(lambda: SkuActivity(sku_id=""))

    # ช่วงเวลา (timestamp UTC — sold_at เป็น timestamptz)
    day_start = f"{target_date.isoformat()}T00:00:00+07:00"
    day_end = f"{(target_date + timedelta(days=1)).isoformat()}T00:00:00+07:00"

    # 1. Sales
    sales = sb.table("sales").select(
        "sku_id, quantity_sold, grand_total"
    ).eq("machine_id", machine_id).gte(
        "sold_at", day_start
    ).lt("sold_at", day_end).execute().data

    for row in sales:
        sku = row["sku_id"]
        if not skus[sku].sku_id:
            skus[sku].sku_id = sku
        skus[sku].sales_qty += row["quantity_sold"]
        skus[sku].sales_revenue += float(row["grand_total"])

    # 2. Stock out (refill)
    stock_outs = sb.table("stock_out").select(
        "sku_id, quantity_packs"
    ).eq("machine_id", machine_id).gte(
        "withdrawn_at", day_start
    ).lt("withdrawn_at", day_end).execute().data

    for row in stock_outs:
        sku = row["sku_id"]
        if not skus[sku].sku_id:
            skus[sku].sku_id = sku
        skus[sku].stock_in_qty += row["quantity_packs"]

    # 3. Claims (claimed_at เป็น DATE — เทียบตรงๆ ได้)
    claims = sb.table("claims").select(
        "sku_id, quantity, product_status"
    ).eq("machine_id", machine_id).eq(
        "claimed_at", target_date.isoformat()
    ).execute().data

    for row in claims:
        sku = row["sku_id"]
        if not skus[sku].sku_id:
            skus[sku].sku_id = sku
        skus[sku].claims_qty += row["quantity"]
        if row["product_status"] == "damaged":
            skus[sku].claims_damaged += row["quantity"]

    # 4. Current machine_stock (สต็อกตอนนี้)
    ms_rows = sb.table("machine_stock").select(
        "slot_number, product_name, remain"
    ).eq("machine_id", machine_id).execute().data

    # หมายเหตุ: machine_stock เก็บ product_name (จาก VMS) ไม่ใช่ sku_id ตรงๆ
    # ต้องใช้ map_product_to_sku() จาก vms_stock_sync.py — ข้ามไว้สำหรับ POC

    return MachineReport(
        machine_id=machine_id,
        report_date=target_date,
        skus={k: v for k, v in skus.items() if v.sku_id},
    )


# ── Report rendering ──────────────────────────────────────────────────

def render_summary_table(report: MachineReport) -> str:
    """สร้างตาราง markdown สรุปข้อมูลของตู้"""
    if not report.skus:
        return "_ไม่มีกิจกรรมในวันนี้_"

    lines = [
        "| SKU | ขาย (ซอง) | รายได้ (บาท) | เบิกเข้า | เคลม | เคลม-ชำรุด |",
        "|-----|----------|-------------|----------|-------|------------|",
    ]
    for sku_id in sorted(report.skus.keys()):
        s = report.skus[sku_id]
        lines.append(
            f"| [[{sku_id.replace(' ', '')}]] | {s.sales_qty} | "
            f"{s.sales_revenue:,.0f} | {s.stock_in_qty} | "
            f"{s.claims_qty} | {s.claims_damaged} |"
        )
    return "\n".join(lines)


def render_dry_run_report(report: MachineReport) -> str:
    """สร้างรายงานแบบ template (ไม่ใช้ LLM)"""
    machine_link = f"[[{report.machine_id}]]"
    date_str = report.report_date.isoformat()

    return f"""---
type: reconciliation
date: {date_str}
machine: {report.machine_id}
mode: dry-run
total_sales_qty: {report.total_sales_qty}
total_revenue: {report.total_revenue:.2f}
total_refill: {report.total_refill}
total_claims: {report.total_claims}
last_updated: {datetime.now().isoformat()}
---

# Reconciliation: {machine_link} / {date_str}

> 🤖 **Dry-run mode** — สรุปข้อมูลจาก database ยังไม่ได้เรียก Claude API

## 📊 สรุปรายตู้

| Metric | จำนวน |
|--------|-------|
| ยอดขายรวม | **{report.total_sales_qty} ซอง** |
| รายได้รวม | **{report.total_revenue:,.0f} บาท** |
| เบิกเข้าตู้ | {report.total_refill} ซอง |
| เคลม | {report.total_claims} ครั้ง |

## 📋 รายละเอียดแยก SKU

{render_summary_table(report)}

## 🔗 เชื่อมโยง

- ตู้: {machine_link}
- วันที่: {date_str}

---

_Generated by `reconcile_agent.py --dry-run`_
"""


# ── LLM (Ollama) ──────────────────────────────────────────────────────

SYSTEM_PROMPT = """คุณเป็น AI analyst ของระบบ DivisionX Card (ตู้ขายการ์ดอัตโนมัติ)

หน้าที่ของคุณ: วิเคราะห์ข้อมูลการขาย/เบิก/เคลม ของตู้ในแต่ละวัน แล้วเขียนรายงานเป็น Markdown ภาษาไทย

หลักการสำคัญ:
1. เน้น insight ที่ผู้บริหารใช้ตัดสินใจได้ — ไม่ใช่แค่ list ตัวเลข
2. หา pattern ที่น่าสนใจ (SKU ไหนเด่น, แนวโน้มอะไร)
3. ถ้าตัวเลขผิดปกติ (refill เยอะแต่ขายน้อย, เคลมเยอะ) → ตั้งสมมติฐานสาเหตุ
4. ใช้ [[backlinks]] ของ Obsidian เชื่อมโยง SKU/ตู้/วันที่
5. เขียนให้กระชับ — เลือกเฉพาะที่ actionable

Format ของรายงาน:
- ใช้ markdown headers (##, ###)
- ใส่ตารางสรุป
- มีหัวข้อ "🔍 ข้อสังเกต" และ "✅ Action ที่แนะนำ"
"""


def call_ollama(report: "MachineReport") -> str:
    """เรียก Ollama ให้เขียน narrative report"""
    try:
        from ollama import Client
    except ImportError:
        sys.exit("❌ ต้องติดตั้ง ollama ก่อน: pip install -r requirements.txt")

    client = Client(host=OLLAMA_HOST)

    # ส่งข้อมูลเป็น JSON ให้ LLM ดู
    data = {
        "machine_id": report.machine_id,
        "date": report.report_date.isoformat(),
        "summary": {
            "total_sales_qty": report.total_sales_qty,
            "total_revenue_baht": round(report.total_revenue, 2),
            "total_refill": report.total_refill,
            "total_claims": report.total_claims,
        },
        "skus": [
            {
                "sku_id": s.sku_id,
                "sales_qty": s.sales_qty,
                "sales_revenue": round(s.sales_revenue, 2),
                "refill_qty": s.stock_in_qty,
                "claims_qty": s.claims_qty,
                "claims_damaged": s.claims_damaged,
                "net_change": s.net_change,
            }
            for s in report.skus.values()
        ],
    }

    user_prompt = f"""ข้อมูลของตู้ {report.machine_id} วันที่ {report.report_date.isoformat()}:

```json
{json.dumps(data, ensure_ascii=False, indent=2)}
```

กรุณาเขียนรายงาน Markdown ภาษาไทยที่:
1. มีหัวข้อ "# Reconciliation: [[{report.machine_id}]] / {report.report_date.isoformat()}"
2. สรุปยอดสำคัญในตาราง
3. วิเคราะห์ SKU ที่น่าสนใจ (เด่น/ตก/ผิดปกติ)
4. ถ้ามีสิ่งผิดปกติ → ตั้งสมมติฐาน
5. แนะนำ action

ตอบเป็น markdown เท่านั้น ไม่ต้องอธิบายเพิ่ม"""

    print(f"   🧠 เรียก Ollama ({OLLAMA_MODEL})...")
    response = client.chat(
        model=OLLAMA_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.3},  # ต่ำ = consistent
    )
    return response["message"]["content"]


def render_live_report(report: "MachineReport", narrative: str) -> str:
    """ผสาน frontmatter + narrative จาก LLM"""
    return f"""---
type: reconciliation
date: {report.report_date.isoformat()}
machine: {report.machine_id}
mode: ollama
model: {OLLAMA_MODEL}
total_sales_qty: {report.total_sales_qty}
total_revenue: {report.total_revenue:.2f}
total_refill: {report.total_refill}
total_claims: {report.total_claims}
last_updated: {datetime.now().isoformat()}
---

{narrative}

---

## 📋 ข้อมูลดิบ (สำหรับตรวจสอบ)

{render_summary_table(report)}

_Generated by `reconcile_agent.py` · model: {OLLAMA_MODEL}_
"""


# ── Main ──────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="DivisionX Reconciliation Agent (POC)")
    parser.add_argument(
        "--date", type=str, default=None,
        help="วันที่ต้องการ reconcile (YYYY-MM-DD) ค่า default = เมื่อวาน"
    )
    parser.add_argument(
        "--machines", type=str, default=None,
        help="ตู้ที่ต้องการ (comma-separated) default = ทุกตู้ active จาก database"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="ไม่เรียก Claude API — ใช้ template แทน"
    )
    parser.add_argument(
        "--output-dir", type=str, default=str(DISCREPANCY_DIR),
        help="โฟลเดอร์เก็บ output (default: wiki/discrepancies/)"
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # Determine date
    if args.date:
        target_date = date.fromisoformat(args.date)
    else:
        target_date = date.today() - timedelta(days=1)

    sb = get_supabase()

    if args.machines:
        machines = [m.strip() for m in args.machines.split(",") if m.strip()]
    else:
        machines = get_active_machines(sb)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"🤖 Reconciliation Agent")
    print(f"   วันที่: {target_date}")
    print(f"   ตู้: {', '.join(machines)}")
    print(f"   Mode: {'DRY-RUN' if args.dry_run else f'LIVE (Ollama · {OLLAMA_MODEL})'}")
    print(f"   Output: {output_dir}")
    print()

    for machine_id in machines:
        print(f"📦 {machine_id}...")
        report = fetch_machine_data(sb, machine_id, target_date)

        if not report.has_activity:
            print(f"   ⚠️  ไม่มีกิจกรรม — ข้าม")
            continue

        print(f"   📊 ขาย {report.total_sales_qty} ซอง · "
              f"รายได้ {report.total_revenue:,.0f} บาท · "
              f"เบิกเข้า {report.total_refill} ซอง · "
              f"เคลม {report.total_claims}")

        # Render report
        if args.dry_run:
            content = render_dry_run_report(report)
        else:
            narrative = call_ollama(report)
            content = render_live_report(report, narrative)

        # Save
        filename = f"{target_date.isoformat()}-{machine_id}.md"
        output_path = output_dir / filename
        output_path.write_text(content, encoding="utf-8")
        print(f"   ✅ {output_path.relative_to(PROJECT_ROOT)}")

    print()
    print(f"🎉 เสร็จเรียบร้อย — เปิดไฟล์ใน Obsidian เพื่อดูผลลัพธ์")


if __name__ == "__main__":
    main()
