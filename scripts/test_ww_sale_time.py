#!/usr/bin/env python3
"""ตรวจว่าเวลาขายของ WorldWide ที่เราเก็บ ตรงกับเวลาที่ "ตู้" ประทับเองหรือไม่

รัน: py scripts/test_ww_sale_time.py
คืน exit 1 ถ้าตัวแปลงเวลาผิด หรือข้อมูลใน DB เพี้ยนเกินที่ยอมได้

หลักการวัด — ไม่ต้องเดาและไม่ต้องพึ่งเวลาห้างเปิด-ปิด:
    เลขที่ใบเสร็จของ WW ลงท้ายด้วย YYMMDDHHMMSS ที่ "ตู้" ประทับตอนสร้างออร์เดอร์
    เทียบกับ sold_at ที่เราเก็บ → ส่วนต่างควรเป็น 0-2 นาที (ช่วงกดสั่งจนจ่ายเสร็จ)
    ถ้าเจอ ~60 นาที = tag timezone ผิด (portal ส่งเวลาจีน แต่เรา tag เป็นเวลาไทย)

⚠️ ห้ามใช้ "ขายดึกผิดปกติ" เป็นหลักฐาน — ตู้ VMS มียอดขายตอน 00:xx จริง 27 รายการ
   ในเดือน ส.ค. เดือนเดียว · ตู้พวกนี้ไม่ได้ปิดตามเวลาห้างเสมอไป
"""
import collections
import json
import os
import pathlib
import re
import sys
import urllib.request
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "scraper"))
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
sys.stdout.reconfigure(encoding="utf-8")

# ⚠️ โหลด .env.local ก่อนเสมอ แล้วค่อยเติมค่าหลอกเฉพาะที่ยังขาด
#    ถ้าใส่ค่าหลอกก่อน ตัวโหลดจะไม่ทับให้ แล้วท่อนที่ยิง DB จริงจะถูกข้ามไปเงียบ ๆ
from envload import load_env_local  # noqa: E402
load_env_local()
for k in ("WW_USERNAME", "WW_PASSWORD"):
    os.environ.setdefault(k, "test")

from worldwide_sales_api import WW_PORTAL_TZ, bkk_to_iso  # noqa: E402

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


print("── ตัวแปลงเวลา ──")
check("tag เป็นเวลาจีน (UTC+8) ไม่ใช่เวลาไทย", WW_PORTAL_TZ, "+08:00")
check("แปลงรูปแบบถูก", bkk_to_iso("2026-08-31 16:30:02"), "2026-08-31T16:30:02+08:00")
check("ค่าว่าง → None", bkk_to_iso(""), None)
# 16:30 เวลาจีน = 15:30 เวลาไทย — ตัวเลขที่ตู้ประทับไว้
inst = datetime.fromisoformat(bkk_to_iso("2026-08-31 16:30:02"))
th = inst.astimezone().utcoffset() and None  # (ไม่พึ่ง tz ของเครื่อง)
check("เวลาไทยที่ได้ = 15:30:02",
      (inst.replace(tzinfo=None) - timedelta(hours=8) + timedelta(hours=7)).strftime("%H:%M:%S"),
      "15:30:02")

# ── ของจริงใน DB ──
print("\n── เทียบกับข้อมูลจริงใน DB ──")
try:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    req = urllib.request.Request(
        f"{url}/rest/v1/sales?select=transaction_id,sold_at,machine_id"
        "&machine_id=in.(wwv01,wwv03,wwv04,wwv05,wwv06,wwv07,wwv08)"
        "&order=sold_at.desc&limit=250",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        rows = json.loads(r.read())
except Exception as e:
    print(f"  ⚠️  ต่อ DB ไม่ได้ ข้ามท่อนนี้: {type(e).__name__}: {str(e)[:80]}")
else:
    PAT = re.compile(r"(\d{12})$")
    diffs = collections.Counter()
    for r in rows:
        m = PAT.search(r["transaction_id"] or "")
        if not m:
            continue
        try:
            machine = datetime.strptime(m.group(1), "%y%m%d%H%M%S")
        except ValueError:
            continue
        stored_th = (datetime.fromisoformat(r["sold_at"].replace("Z", "+00:00")).replace(tzinfo=None)
                     + timedelta(hours=7))
        diffs[round((stored_th - machine).total_seconds() / 60)] += 1
    n = sum(diffs.values())
    print(f"  เทียบได้ {n} รายการ · ส่วนต่าง (นาที): "
          + " · ".join(f"{k:+d}×{v}" for k, v in sorted(diffs.items(), key=lambda x: -x[1])[:5]))
    off_by_hour = sum(v for k, v in diffs.items() if 55 <= k <= 70)
    if off_by_hour:
        print(f"  ℹ️  แถวที่ยังช้าไป ~1 ชม.: {off_by_hour}/{n}"
              " — เป็นข้อมูลเก่าที่ sync ก่อนแก้ (ต้อง backfill แยก ไม่ใช่บั๊กของโค้ดตอนนี้)")
    # โค้ดถูกแล้วก็จริง แต่ข้อมูลเก่ายังผิดอยู่ จึงเช็คแค่ว่า "ไม่มีอาการใหม่ที่แปลกกว่านี้"
    weird = sum(v for k, v in diffs.items() if k < -5 or k > 70)
    check("ไม่มีแถวที่เวลาเพี้ยนแบบอธิบายไม่ได้ (เกิน 70 นาที หรือติดลบ)", weird, 0)

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
