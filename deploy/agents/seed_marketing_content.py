"""
Seed marketing_content — ย้ายคอนเทนต์จากไฟล์ JSON เดิมลงตารางใน Supabase

ไฟล์ต้นทาง:
  deploy/tasks/content_suggestions.json  → status='pending'  (ร่าง AI รออนุมัติ)
  deploy/tasks/content_queue.json        → status='approved' (คิวที่คนคัดแล้ว)

รันครั้งเดียวหลัง apply migration 059 · idempotent — รันซ้ำไม่เกิดรายการซ้ำ
(เช็คจาก caption ที่มีอยู่แล้วในตาราง)

รัน:
  py deploy/agents/seed_marketing_content.py --dry-run
  py deploy/agents/seed_marketing_content.py
"""
import os
import sys
import json
import argparse
import urllib.request
import urllib.error
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envload import load_env_local  # noqa: E402

load_env_local()

SB_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

ROOT = Path(__file__).resolve().parents[2]
TASKS = ROOT / "deploy" / "tasks"

PLATFORM_MAP = {
    "fb เพจ": "fb", "fb": "fb", "facebook": "fb",
    "line": "line", "line oa": "line",
    "ig": "ig", "instagram": "ig",
    "tiktok": "tiktok",
}


def sb(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{path}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else []


def norm_platform(p):
    return PLATFORM_MAP.get((p or "").strip().lower(), "fb")


def read_json(name):
    p = TASKS / name
    if not p.exists():
        print(f"  ⚠️  ไม่พบ {name} — ข้าม")
        return {}
    return json.loads(p.read_text(encoding="utf-8-sig"))


# PostgREST batch insert บังคับให้ทุก object ในอาร์เรย์มี key ชุดเดียวกัน
# (ไม่งั้น 400 "All object keys must match") — จึงต้อง normalize ก่อนส่ง
FIELDS = ("status", "platform", "caption", "slot", "source_reason", "source_sku", "created_by")


def collect():
    """คืน list ของ record ที่จะ insert (ทุกตัวมี key ครบชุดเดียวกัน)"""
    out = []

    # ── ร่าง AI (รออนุมัติ) ──
    sug = read_json("content_suggestions.json")
    winners = ", ".join(sug.get("based_on_winners") or [])
    for p in sug.get("posts") or []:
        cap = (p.get("caption") or "").strip()
        if not cap:
            continue
        reason = p.get("reason") or p.get("why") or (f"SKU มาแรง: {winners}" if winners else None)
        out.append({
            "status": "pending",
            "platform": norm_platform(p.get("platform")),
            "caption": cap,
            "slot": p.get("slot") if p.get("slot") in ("morning", "evening") else None,
            "source_reason": reason,
            "source_sku": p.get("sku_id") or p.get("sku"),
            "created_by": "ai",
        })

    # ── คิวที่คนคัดแล้ว ──
    q = read_json("content_queue.json")
    for p in q.get("posts") or []:
        cap = (p.get("caption") or "").strip()
        if not cap:
            continue
        days = p.get("days")
        days_txt = "ทุกวัน" if days == "daily" else (", ".join(days) if isinstance(days, list) else "")
        out.append({
            "status": "approved",
            "platform": norm_platform(p.get("platform")),
            "caption": cap,
            "slot": p.get("slot") if p.get("slot") in ("morning", "evening") else None,
            "source_reason": f"คิวเดิมจาก content_queue.json ({days_txt})" if days_txt else "คิวเดิมจาก content_queue.json",
            "created_by": "human",
        })

    return [{k: r.get(k) for k in FIELDS} for r in out]


def main():
    ap = argparse.ArgumentParser(description="ย้ายคอนเทนต์จาก JSON ลง marketing_content")
    ap.add_argument("--dry-run", action="store_true", help="ดูอย่างเดียว ไม่เขียน")
    args = ap.parse_args()

    if not SB_URL or not SB_KEY:
        sys.exit("❌ ไม่มี SUPABASE_URL / SERVICE KEY — ตรวจ deploy/.env.local")

    try:
        existing = sb("marketing_content?select=caption")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            sys.exit("❌ ยังไม่มีตาราง marketing_content — รัน migration 059 ใน Supabase SQL Editor ก่อน")
        sys.exit(f"❌ Supabase HTTP {e.code}: {e.read().decode('utf-8','ignore')[:200]}")

    have = {r["caption"].strip() for r in existing}
    records = collect()
    new = [r for r in records if r["caption"] not in have]
    dup = len(records) - len(new)

    print(f"[seed] เจอในไฟล์ {len(records)} ชิ้น · มีในตารางแล้ว {dup} · จะเพิ่ม {len(new)}")
    for r in new:
        print(f"   [{r['status']:<8}] {r['platform']:<6} {r['caption'][:58].replace(chr(10),' ')}…")

    if not new:
        print("[seed] ✅ ไม่มีอะไรต้องเพิ่ม")
        return
    if args.dry_run:
        print("\n── DRY RUN — ไม่ได้เขียน ──")
        return

    created = sb("marketing_content", method="POST", body=new)
    print(f"\n[seed] ✅ เพิ่มแล้ว {len(created)} รายการ")


if __name__ == "__main__":
    main()
