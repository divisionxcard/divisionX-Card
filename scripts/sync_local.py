#!/usr/bin/env python3
"""รันซิงค์ข้อมูลตู้จากเครื่องตัวเอง — ทางสำรองตอน GitHub Actions ใช้ไม่ได้

ทำไมต้องมี (9 ก.ย. 2026):
    GitHub ปิด Actions ให้บัญชี divisionxcard ทั้งบัญชี (dispatch ได้ 422
    "Actions has been disabled for this user" · ประวัติการรัน 2,644 รอบหายเป็น 0)
    ซึ่งแปลว่า **ทุกอย่างที่รันอัตโนมัติหยุดหมด** ทั้งซิงค์ยอดขาย ซิงค์สต็อก
    รายงานเติมของ และปุ่มบนเว็บ (เพราะปุ่มก็ยิง workflow เหมือนกัน)

    ข้อมูลยอดขายที่ไม่ได้ดึงวันนี้ ไม่ได้หายไปจากตู้ — แต่ถ้าปล่อยไว้หลายวัน
    การไล่เก็บย้อนหลังจะยุ่งขึ้นเรื่อย ๆ (และ backfill ปกติก็ต้องใช้ Actions อีก)
    ตัวนี้จึงรัน "สคริปต์ตัวเดียวกับที่ workflow รัน" จากเครื่องแทน

⚠️ สคริปต์ใน deploy/scraper/ **ไม่ได้อ่าน .env.local เอง** มันอ่าน os.environ ตรง ๆ
   เพราะออกแบบมาให้รันบน Actions ที่ยัด secret เข้า env ให้อยู่แล้ว
   ตัวนี้จึงเป็นคนอ่านไฟล์แล้วแปลงชื่อให้ — และชื่อไม่ตรงกันด้วย:

       .env.local (ฝั่งเว็บ)              scraper ต้องการ
       NEXT_PUBLIC_SUPABASE_URL     →     SUPABASE_URL
       SUPABASE_SERVICE_ROLE_KEY    →     SUPABASE_SERVICE_KEY

รัน:
    py scripts/sync_local.py                  # ยอดขาย + สต็อก ทุกยี่ห้อ (เมื่อวาน→วันนี้)
    py scripts/sync_local.py --sales           # เฉพาะยอดขาย
    py scripts/sync_local.py --stock            # เฉพาะสต็อกหน้าตู้
    py scripts/sync_local.py --brand vms        # เฉพาะยี่ห้อเดียว (vms|ww|payif)
    py scripts/sync_local.py --from 2026-09-05 --to 2026-09-09   # backfill
"""
import argparse
import os
import pathlib
import subprocess
import sys
from datetime import date, timedelta

# ⚠️ ข้อความในสคริปต์นี้เป็นภาษาไทยล้วน แต่ Python บน Windows เลือก encoding ของ
#    stdout จาก ACP ของเครื่อง (เครื่องนี้ = cp1252 เพราะเป็นวินโดวส์อังกฤษ) ซึ่ง
#    **เข้ารหัสไทยไม่ได้** → print บรรทัดแรกของ main() ก็ตายแล้วด้วย UnicodeEncodeError
#    เห็นชัดเฉพาะตอนถูกเรียกแบบดักเอาต์พุต (บอท Telegram) หรือรันจาก cmd
#    ที่ผ่านมารอดมาได้เพราะบังเอิญมี PYTHONIOENCODING ติดมาจาก shell ที่สตาร์ต — ไม่ใช่
#    ของที่ตั้งค้างไว้ในเครื่อง พอบอทขึ้นเองจาก Startup หลังรีบูตก็จะพังทันที (13 ก.ย. 2026)
for _s in (sys.stdout, sys.stderr):
    if _s is not None:
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

# reconfigure ข้างบนแก้ให้ตัวเองเท่านั้น ไม่ตกทอดถึงลูก — สคริปต์ scraper ที่เราไปเรียก
# ก็พิมพ์ไทยเหมือนกันและเขียนลง pipe เดียวกัน จึงต้องยัดผ่าน env ให้ทั้งสายด้วย
os.environ.setdefault("PYTHONIOENCODING", "utf-8:replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "deploy" / ".env.local"

# ชื่อใน .env.local → ชื่อที่ scraper อ่าน (ที่ไม่ตรงกันตามหมายเหตุข้างบน)
ALIASES = {
    "SUPABASE_URL": "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_KEY": "SUPABASE_SERVICE_ROLE_KEY",
}

# งานทั้งหมด เรียงตามลำดับเดียวกับที่ workflow ทำ
# ⚠️ สต็อกต้องรันหลังยอดขายเสมอ — slot_refill_events ใช้ยอดที่ขายไประหว่างสองรอบ
#    มาคำนวณว่าเติมเข้าไปเท่าไหร่ ถ้ายอดขายยังไม่เข้า ตัวเลขการเติมจะต่ำกว่าจริง
JOBS = {
    "vms": {
        "sales": ["deploy/scraper/vms_sales_api.py"],
        "stock": ["deploy/scraper/vms_stock_sync.py"],
        "needs": ["VMS_USERNAME", "VMS_PASSWORD"],
    },
    "ww": {
        "sales": ["deploy/scraper/worldwide_sales_api.py"],
        "stock": ["deploy/scraper/worldwide_stock_sync.py"],
        "needs": ["WW_USERNAME", "WW_PASSWORD"],
    },
    "payif": {
        "sales": ["deploy/scraper/payif_sales_sync.py"],
        "stock": ["deploy/scraper/payif_stock_sync.py"],
        # ตู้ pf01 (ไอคอนสยาม) เป็นฮาร์ดแวร์ Vendos — ล็อกอินเข้า control center ของ Vendos
        # ไม่ใช่ของ Payif ชื่อตัวแปรจึงไม่ตรงกับชื่อยี่ห้อ (เคยเข้าใจผิดตอนเขียนตัวนี้ครั้งแรก)
        "needs": ["VENDOS_USERNAME", "VENDOS_PASSWORD"],
    },
}


def load_env():
    """อ่าน .env.local เข้า os.environ แล้วเติมชื่อที่ scraper คาดหวัง"""
    if not ENV_FILE.exists():
        sys.exit(f"ไม่พบ {ENV_FILE}")
    # utf-8-sig: เผื่อไฟล์ถูกเซฟแบบมี BOM — ไม่งั้นคีย์บรรทัดแรกเพี้ยนแบบเงียบ ๆ
    # (เจอจริง 11 ก.ย. 2026: BOM ทำ NEXT_PUBLIC_SUPABASE_URL หายทั้งที่อยู่ในไฟล์)
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
    for want, have in ALIASES.items():
        if not os.environ.get(want) and os.environ.get(have):
            os.environ[want] = os.environ[have]


def check(brands):
    """บอกให้ครบทีเดียวว่าขาดอะไรบ้าง ดีกว่าให้ไปตายทีละตัว"""
    missing = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    missing = [k for k in missing if not os.environ.get(k)]
    for b in brands:
        missing += [k for k in JOBS[b]["needs"] if not os.environ.get(k)]
    if missing:
        print("ยังขาดค่าเหล่านี้ใน deploy/.env.local:\n")
        for k in dict.fromkeys(missing):
            print(f"    {k}=")
        print("\n(ค่าพวกนี้อยู่ใน GitHub Secrets — Settings → Secrets and variables → Actions"
              "\n ดูค่าเดิมไม่ได้ ต้องเอามาจากที่จดไว้ หรือตั้งใหม่ที่หลังบ้านของตู้)")
        sys.exit(1)


def run(script, args, label):
    print(f"\n{'─' * 62}\n▶ {label}\n{'─' * 62}", flush=True)
    p = subprocess.run([sys.executable, str(ROOT / script), *args], cwd=ROOT)
    ok = p.returncode == 0
    print(("✅ " if ok else "❌ ") + f"{label} — {'สำเร็จ' if ok else f'ล้ม (exit {p.returncode})'}",
          flush=True)
    return ok


def main():
    ap = argparse.ArgumentParser(description="ซิงค์ข้อมูลตู้จากเครื่องตัวเอง")
    ap.add_argument("--brand", choices=list(JOBS), action="append",
                    help="ระบุยี่ห้อ ใส่ซ้ำได้ (ไม่ระบุ = ทุกยี่ห้อ)")
    ap.add_argument("--sales", action="store_true", help="เฉพาะยอดขาย")
    ap.add_argument("--stock", action="store_true", help="เฉพาะสต็อกหน้าตู้")
    ap.add_argument("--from", dest="frm", help="วันเริ่ม YYYY-MM-DD (backfill)")
    ap.add_argument("--to", dest="to", help="วันจบ YYYY-MM-DD")
    a = ap.parse_args()

    load_env()
    brands = a.brand or list(JOBS)
    check(brands)

    # ไม่ระบุอะไรเลย = ทำทั้งสองอย่าง (ยอดขายก่อนเสมอ ดูเหตุผลที่ JOBS)
    do_sales = a.sales or not (a.sales or a.stock)
    do_stock = a.stock or not (a.sales or a.stock)

    today = date.today()
    frm = a.frm or (today - timedelta(days=1)).isoformat()
    to = a.to or today.isoformat()
    if a.frm and (date.fromisoformat(to) - date.fromisoformat(frm)).days > 5:
        sys.exit("ช่วง backfill เกิน 5 วัน — VMS ตัดข้อมูลถ้าดึงทีเดียวเยอะเกิน แบ่งรันทีละช่วง")

    print(f"ช่วงวันที่: {frm} → {to} · ยี่ห้อ: {', '.join(brands)}")
    results = []
    if do_sales:
        for b in brands:
            results.append((f"ยอดขาย {b}",
                            run(JOBS[b]["sales"][0], ["--from-date", frm, "--to-date", to],
                                f"ยอดขาย {b} ({frm} → {to})")))
    if do_stock:
        for b in brands:
            results.append((f"สต็อก {b}",
                            run(JOBS[b]["stock"][0], [], f"สต็อกหน้าตู้ {b}")))

    print(f"\n{'═' * 62}\nสรุป")
    for name, ok in results:
        print(f"  {'✅' if ok else '❌'} {name}")
    bad = [n for n, ok in results if not ok]
    if bad:
        print(f"\nที่ล้ม: {', '.join(bad)} — เลื่อนขึ้นไปดู log ของตัวนั้น")
        sys.exit(1)
    print("\nครบทุกงาน")


if __name__ == "__main__":
    main()
