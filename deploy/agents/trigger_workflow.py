"""
Trigger Workflow — สั่งรัน GitHub Actions (workflow_dispatch) ด้วยชื่อสั้น ๆ

เขียนไว้ให้ OpenClaw skill เรียก (เวอร์ชัน Python ข้ามแพลตฟอร์มของ
scripts/trigger-ww-backfill.ps1 · ครอบทุก brand ไม่ใช่แค่ WorldWide)

ต้องมี GH_PAT (PAT ที่มี scope "workflow") ใน deploy/.env.local

คำสั่ง:
  py deploy/agents/trigger_workflow.py --list
  py deploy/agents/trigger_workflow.py stock                 # sync สต็อกหน้าตู้ทุกยี่ห้อ
  py deploy/agents/trigger_workflow.py vms-stock
  py deploy/agents/trigger_workflow.py sales --days 1        # ยอดขายเมื่อวาน ทุกยี่ห้อ
  py deploy/agents/trigger_workflow.py ww-sales --from 2026-08-01 --to 2026-08-03
  py deploy/agents/trigger_workflow.py --status vms-stock

⚠️ backfill ยอดขายห้ามเกิน 5 วัน/ครั้ง (XLSX/portal อาจตัดข้อมูล — ดู CLAUDE.md)
"""
import os
import sys
import json
import argparse
import urllib.request
import urllib.error
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from envload import load_env_local  # noqa: E402

load_env_local()

GH_PAT = os.environ.get("GH_PAT")
REPO = os.environ.get("GH_REPO", "divisionxcard/divisionX-Card")
REF = "main"
MAX_BACKFILL_DAYS = 5

# ชื่อสั้น → ไฟล์ workflow · accepts_dates = รับ days/from_date/to_date ไหม
JOBS = {
    "vms-stock":     ("vms-stock-sync.yml",       False, "สต็อกหน้าตู้ VMS (ตู้ 1-4)"),
    "ww-stock":      ("worldwide-stock-sync.yml", False, "สต็อกหน้าตู้ WorldWide"),
    "payif-stock":   ("payif-stock-sync.yml",     False, "สต็อกหน้าตู้ Payif (ไอคอนสยาม)"),
    "vms-sales":     ("vms-sync.yml",             True,  "ยอดขาย VMS"),
    "ww-sales":      ("worldwide-sync.yml",       True,  "ยอดขาย WorldWide"),
    "payif-sales":   ("payif-sync.yml",           True,  "ยอดขาย Payif"),
    "restock-guard": ("restock-guard.yml",        False, "เตือนเติมสต็อก → Telegram"),
}
GROUPS = {
    "stock": ["vms-stock", "ww-stock", "payif-stock"],
    "sales": ["vms-sales", "ww-sales", "payif-sales"],
}


def gh(path, method="GET", body=None):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        data=json.dumps(body).encode("utf-8") if body else None,
        headers={
            "Authorization": f"Bearer {GH_PAT}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else {}


def cmd_list():
    print("🔧 งานที่สั่งได้")
    for key, (wf, dates, desc) in JOBS.items():
        tag = " (รับช่วงวันที่)" if dates else ""
        print(f"  {key:<15} {desc}{tag}")
    print("\n  กลุ่ม (สั่งทีเดียวหลายตัว)")
    for g, members in GROUPS.items():
        print(f"  {g:<15} = {', '.join(members)}")


def cmd_status(job):
    wf = JOBS[job][0]
    data = gh(f"/repos/{REPO}/actions/workflows/{wf}/runs?per_page=5")
    runs = data.get("workflow_runs", [])
    if not runs:
        print(f"ยังไม่เคยรัน {job}")
        return
    print(f"🕒 5 รอบล่าสุดของ {job} ({wf})")
    ICON = {"success": "✅", "failure": "❌", "cancelled": "⚪", None: "⏳"}
    for r in runs:
        started = r.get("run_started_at") or r.get("created_at") or ""
        when = started.replace("T", " ").replace("Z", "") + " UTC" if started else "?"
        state = r.get("conclusion") if r.get("status") == "completed" else r.get("status")
        icon = ICON.get(r.get("conclusion"), "⏳")
        print(f"  {icon} {when}  {state}  ({r.get('event')})")
    print(f"\n  ดูรายละเอียด: https://github.com/{REPO}/actions/workflows/{wf}")


def build_inputs(job, args):
    """สร้าง inputs ให้ workflow_dispatch — เฉพาะ workflow ที่รับช่วงวันที่"""
    if not JOBS[job][1]:
        return {}
    if args.from_date or args.to:
        if not (args.from_date and args.to):
            sys.exit("❌ ต้องใส่ทั้ง --from และ --to")
        try:
            d1 = datetime.strptime(args.from_date, "%Y-%m-%d")
            d2 = datetime.strptime(args.to, "%Y-%m-%d")
        except ValueError:
            sys.exit("❌ วันที่ผิดรูปแบบ (ต้อง YYYY-MM-DD)")
        if d2 < d1:
            sys.exit(f"❌ --to ({args.to}) ต้องไม่ก่อน --from ({args.from_date})")
        span = (d2 - d1).days + 1
        if span > MAX_BACKFILL_DAYS:
            sys.exit(f"❌ ช่วง {span} วัน เกินลิมิต {MAX_BACKFILL_DAYS} วัน/ครั้ง "
                     "— แบ่งรันทีละไม่เกิน 5 วัน (ดู CLAUDE.md)")
        return {"from_date": args.from_date, "to_date": args.to}
    return {"days": str(args.days)}


def dispatch(job, inputs):
    wf = JOBS[job][0]
    body = {"ref": REF}
    if inputs:
        body["inputs"] = inputs
    gh(f"/repos/{REPO}/actions/workflows/{wf}/dispatches", method="POST", body=body)
    detail = f" · {inputs}" if inputs else ""
    print(f"  ✅ สั่ง {job} แล้ว ({wf}){detail}")


def main():
    ap = argparse.ArgumentParser(description="สั่งรัน GitHub Actions ของ DivisionX")
    ap.add_argument("job", nargs="?", help="ชื่องานหรือกลุ่ม (ดู --list)")
    ap.add_argument("--days", type=int, default=1, help="ย้อนหลังกี่วัน (default 1 = เมื่อวาน)")
    ap.add_argument("--from", dest="from_date", type=str, help="backfill วันเริ่ม YYYY-MM-DD")
    ap.add_argument("--to", type=str, help="backfill วันจบ YYYY-MM-DD")
    ap.add_argument("--list", action="store_true", help="ดูรายการงานที่สั่งได้")
    ap.add_argument("--status", type=str, metavar="JOB", help="ดูผลรันล่าสุดของงานนั้น")
    args = ap.parse_args()

    if args.list:
        cmd_list()
        return
    if not GH_PAT:
        sys.exit("❌ ไม่มี GH_PAT — ใส่ใน deploy/.env.local (PAT ต้องมี scope 'workflow')")
    if args.status:
        if args.status not in JOBS:
            sys.exit(f"❌ ไม่รู้จักงาน '{args.status}' — ดู --list")
        cmd_status(args.status)
        return
    if not args.job:
        cmd_list()
        return

    jobs = GROUPS.get(args.job, [args.job] if args.job in JOBS else None)
    if jobs is None:
        sys.exit(f"❌ ไม่รู้จักงาน '{args.job}' — ดู --list")

    # ตรวจ input ให้ครบก่อน แล้วค่อยยิง — กันกรณีสั่งเป็นกลุ่มแล้วพังกลางทาง
    plan = [(job, build_inputs(job, args)) for job in jobs]

    print(f"🚀 สั่งรัน {len(plan)} workflow บน {REPO}")
    try:
        for job, inputs in plan:
            dispatch(job, inputs)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        if e.code in (401, 403):
            sys.exit(f"❌ GitHub {e.code} — GH_PAT หมดอายุหรือไม่มี scope 'workflow'\n{detail}")
        sys.exit(f"❌ GitHub HTTP {e.code}: {detail}")
    print("\n⏳ workflow ใช้เวลา ~1-3 นาที · เช็คผลด้วย --status <job>")


if __name__ == "__main__":
    main()
