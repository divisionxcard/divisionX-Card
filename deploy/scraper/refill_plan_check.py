"""เทียบ "ใบจัดของสั่งไปเท่าไหร่" กับ "เติมเข้าจริงเท่าไหร่" แล้วสรุปเข้า Telegram

ที่มา
─────
เจ้าของแจ้งว่าจัดของเกินบ่อยที่ตู้ WW และรู้ผลจากที่แอดมินขนของกลับมาคืนเท่านั้น
ไล่ข้อมูลแล้วพบจุดบอด: ระบบบันทึกแค่ "เติมเข้าจริงเท่าไหร่" (slot_refill_events)
**ไม่เคยบันทึกว่าใบสั่งไปเท่าไหร่** → SKU ที่สั่งแล้วเติมไม่ได้เลยไม่มีแถวสักแถว
ของที่ขนกลับจึงหายไปจากข้อมูลทั้งก้อน วิเคราะห์ย้อนหลังชี้ตัวไม่ได้

ตัวนี้ปิดวงจร: refill_plans (ตอนกดพิมพ์) → slot_refill_events (ตอน sync) → สรุป

วิธีเทียบ
────────
  planned_qty  จาก refill_plans (1 แถวต่อ ใบ+ตู้+SKU+หน่วย)
  actual_added จาก slot_refill_events.qty_added ของ (ตู้, SKU, หน่วย) เดียวกัน
               ที่ synced_at อยู่หลังเวลาออกใบ
  เกิน = planned − actual   (ขนไปแล้วใส่ไม่หมด = ของที่ขนกลับ)
  ขาด = actual − planned    (ใบสั่งน้อยกว่าที่ต้องใช้จริง)

⚠️ ต้องรอให้ sync ผ่านไปอย่างน้อย 1 รอบหลังออกใบ ไม่งั้นจะเห็น actual=0 แล้วสรุปผิด
   ว่า "เกินทั้งใบ" — ค่าเริ่มต้นรอ 12 ชม. และข้ามใบที่ยังไม่มี sync ตามมาเลย

⚠️ ใบที่ค้างเกิน 5 วันปิดเป็น 'expired' ไม่ใช่ 'checked' — นานขนาดนั้นมีรอบเติมอื่น
   คั่นกลางแน่นอน เอามาเทียบก็ได้เลขที่เชื่อไม่ได้ ปล่อยให้รู้ว่าเทียบไม่ได้ดีกว่าเดา

รัน
───
    py deploy/scraper/refill_plan_check.py                # เทียบ + ส่ง Telegram
    py deploy/scraper/refill_plan_check.py --dry-run      # ดูอย่างเดียว
    py deploy/scraper/refill_plan_check.py --min-age 0    # ไม่ต้องรอ (ใช้ตอนทดสอบ)
"""
import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase import create_client  # noqa: E402

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

MIN_AGE_HOURS = 12      # ต้องผ่านไปกี่ชั่วโมงหลังออกใบถึงจะเทียบได้
EXPIRE_DAYS = 5         # ค้างนานกว่านี้ = เทียบไม่ได้แล้ว
MIN_REPORT = 3          # ต่างกันน้อยกว่านี้ไม่ต้องรายงาน (เศษปกติของการเติม)


def _dt(v):
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def main():
    ap = argparse.ArgumentParser(description="เทียบใบจัดของกับที่เติมจริง")
    ap.add_argument("--dry-run", action="store_true", help="ไม่เขียน DB ไม่ส่ง Telegram")
    ap.add_argument("--min-age", type=float, default=MIN_AGE_HOURS,
                    help=f"รอกี่ชั่วโมงหลังออกใบ (ค่าเริ่มต้น {MIN_AGE_HOURS})")
    args = ap.parse_args()

    if not (SUPABASE_URL and SUPABASE_KEY):
        sys.exit("❌ ไม่มี SUPABASE_URL / SUPABASE_SERVICE_KEY")
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    now = datetime.now(timezone.utc)

    try:
        plans = (db.table("refill_plans").select("*")
                 .eq("status", "open").order("planned_at").execute()).data or []
    except Exception as e:
        # ยังไม่ได้รัน migration 073 → ไม่ใช่ความล้มเหลว แค่ยังไม่มีอะไรให้เทียบ
        print(f"⚠️  อ่าน refill_plans ไม่ได้ (รัน migration 073 หรือยัง?): {str(e)[:140]}")
        return
    if not plans:
        print("[plan-check] ไม่มีใบที่รอเทียบ")
        return
    print(f"[plan-check] ใบที่รอเทียบ {len(plans)} แถว")

    ready, expired = [], []
    for p in plans:
        age = (now - (_dt(p["planned_at"]) or now)).total_seconds() / 3600
        if age >= EXPIRE_DAYS * 24:
            expired.append(p)
        elif age >= args.min_age:
            ready.append(p)
    if expired and not args.dry_run:
        db.table("refill_plans").update({"status": "expired", "checked_at": now.isoformat()}) \
          .in_("id", [p["id"] for p in expired]).execute()
    if expired:
        print(f"[plan-check] ปิดเป็น expired {len(expired)} แถว (ค้างเกิน {EXPIRE_DAYS} วัน)")
    if not ready:
        print(f"[plan-check] ยังไม่มีใบที่ครบ {args.min_age} ชม.")
        return

    # ── ดึงการเติมจริงหลังเวลาออกใบที่เก่าสุด ──
    oldest = min(_dt(p["planned_at"]) for p in ready)
    ev = (db.table("slot_refill_events")
          .select("machine_id, sku_id, is_box, qty_added, synced_at, change_type")
          .gt("synced_at", oldest.isoformat())
          .in_("change_type", ["refill", "swap_in"]).execute()).data or []
    print(f"[plan-check] เหตุการณ์เติมหลังเวลานั้น {len(ev)} แถว")

    # ⚠️ ต้องเช็คว่ามี sync เกิดขึ้นจริงหลังออกใบไหม — ถ้า sync ล่ม actual จะเป็น 0
    #    ทั้งกระดาน แล้วรายงานจะบอกว่า "เกินทุกอย่าง" ซึ่งผิดและทำให้คนเลิกเชื่อ
    last_sync_by_machine = {}
    for r in (db.table("machine_stock").select("machine_id, synced_at").execute()).data or []:
        d = _dt(r.get("synced_at"))
        if d and d > last_sync_by_machine.get(r["machine_id"], datetime.min.replace(tzinfo=timezone.utc)):
            last_sync_by_machine[r["machine_id"]] = d

    by_key = defaultdict(list)
    for e in ev:
        by_key[(e["machine_id"], e.get("sku_id"), bool(e.get("is_box")))].append(e)

    rows, no_sync = [], 0
    for p in ready:
        planned_at = _dt(p["planned_at"])
        last = last_sync_by_machine.get(p["machine_id"])
        if not last or last <= planned_at:
            no_sync += 1           # ยังไม่มี sync ตามหลังใบนี้ → เทียบไม่ได้ ปล่อยค้างไว้
            continue
        actual = sum(e["qty_added"] or 0 for e in by_key.get(
            (p["machine_id"], p.get("sku_id"), bool(p.get("is_box"))), [])
            if (_dt(e["synced_at"]) or now) > planned_at)
        rows.append((p, actual))

    if no_sync:
        print(f"[plan-check] ข้าม {no_sync} แถว — ยังไม่มี sync ตามหลังใบนั้น")
    if not rows:
        print("[plan-check] ไม่มีแถวที่เทียบได้รอบนี้")
        return

    if not args.dry_run:
        for p, actual in rows:
            db.table("refill_plans").update({
                "status": "checked", "actual_added": actual, "checked_at": now.isoformat(),
            }).eq("id", p["id"]).execute()

    over = [(p, a) for p, a in rows if p["planned_qty"] - a >= MIN_REPORT]
    under = [(p, a) for p, a in rows if a - p["planned_qty"] >= MIN_REPORT]
    print(f"[plan-check] เทียบแล้ว {len(rows)} แถว · เกิน {len(over)} · ขาด {len(under)}")
    for p, a in sorted(over, key=lambda x: x[1] - x[0]["planned_qty"])[:15]:
        unit = "กล่อง" if p["is_box"] else "ซอง"
        print(f"    เกิน {p['planned_qty'] - a:>3} {unit}  {p['machine_id']} · "
              f"{p.get('sku_id') or p.get('product_name')}  (สั่ง {p['planned_qty']} · เข้าจริง {a})")

    if args.dry_run:
        print("\n── DRY RUN — ไม่ได้เขียน DB / ไม่ได้ส่ง Telegram ──")
        return
    if over or under:
        try:
            from telegram_alert import alert_refill_plan_diff
            alert_refill_plan_diff(over, under)
        except Exception as e:
            print(f"⚠️  ส่ง Telegram ไม่สำเร็จ: {e}")


if __name__ == "__main__":
    main()
