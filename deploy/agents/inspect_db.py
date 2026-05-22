"""ตรวจสอบข้อมูลใน Supabase สำหรับ debug agent (ไม่ใช่ใน production)"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv(Path(__file__).resolve().parents[2] / "deploy" / ".env.local")
sb = create_client(
    os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"],
    os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

print("=" * 60)
print("📍 MACHINES table")
print("=" * 60)
machines = sb.table("machines").select("*").execute().data
for m in machines:
    print(f"  {m}")

print()
print("=" * 60)
print("📦 machine_stock — sample 10 rows ของ chukes01")
print("=" * 60)
ms = sb.table("machine_stock").select(
    "machine_id, slot_number, product_name, remain, max_capacity"
).eq("machine_id", "chukes01").limit(10).execute().data
for r in ms:
    print(f"  slot {r['slot_number']:>3} | remain {r['remain']:>3}/{r['max_capacity']:>3} | {r['product_name']}")

print()
print("=" * 60)
print("📦 machine_stock — แต่ละ machine_id มีกี่ row")
print("=" * 60)
all_ms = sb.table("machine_stock").select("machine_id").execute().data
from collections import Counter
counts = Counter(r["machine_id"] for r in all_ms)
for mid, cnt in counts.most_common():
    print(f"  {mid}: {cnt} rows")
