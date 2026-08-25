"""สำรวจว่าหลังบ้านของแต่ละแบรนด์ส่ง "ราคาขาย" มาให้เราตรงไหนบ้าง

ทำไมต้องสำรวจก่อนเขียนตัวดึงจริง
────────────────────────────────
ตอนนี้เรารู้แน่แค่แบรนด์เดียว:
    Vendos     `/cc_api/shop/stock/{id}` ส่ง `sell_price` มาอยู่แล้ว — เราทิ้งทุกวัน
    VMS        `/slots/{tab}` เป็น JSON แต่ไม่เคยมีใครดูว่ามีฟิลด์ราคาไหม
    WorldWide  หน้า view_inventory มีแค่ ช่อง/ชื่อ/ความจุ/คงเหลือ/สถานะ — ไม่มีราคา
               ต้องหาหน้าอื่น สคริปต์นี้จะไล่ลิงก์ในเมนูมาให้ดู

สคริปต์นี้ **อ่านอย่างเดียว** ไม่เขียนอะไรลงฐานข้อมูลและไม่แตะหลังบ้าน

วิธีรัน
───────
    1. กรอกรหัสใน deploy/scraper/.env  (ไฟล์นั้นถูก gitignore แล้ว)
    2. py -3 deploy/scraper/price_probe.py            # ทุกแบรนด์
       py -3 deploy/scraper/price_probe.py --brand vms

⚠️ สคริปต์นี้ไม่พิมพ์ username/password ออกหน้าจอไม่ว่ากรณีใด
   และตัดค่าที่ดูเหมือน token/cookie ออกจาก output
"""
import argparse
import json
import os
import pathlib
import re
import sys

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = pathlib.Path(__file__).resolve().parent
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")

# คำที่บอกว่าฟิลด์นั้นน่าจะเป็นราคา
PRICE_HINT = re.compile(r"price|amount|cost|money|fee|baht|จำนวนเงิน|ราคา", re.I)


def load_env():
    """อ่าน .env ข้าง ๆ ไฟล์นี้ ถ้าไม่มีก็ใช้ตัวแปรระบบ (เผื่อรันใน CI)"""
    f = HERE / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
    return f.exists()


def show(label, obj, indent="    "):
    """โชว์คีย์ทั้งหมดของ record หนึ่งตัว พร้อมชี้ว่าตัวไหนน่าจะเป็นราคา"""
    if not isinstance(obj, dict):
        print(f"{indent}(ไม่ใช่ dict: {type(obj).__name__})")
        return
    print(f"{indent}{label} — {len(obj)} ฟิลด์")
    for k, v in obj.items():
        if re.search(r"token|passw|cookie|secret|auth", k, re.I):
            v = "<ซ่อนไว้>"
        s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
        mark = "  ← 💰 น่าจะเป็นราคา" if PRICE_HINT.search(k) else ""
        print(f"{indent}  {k:24} = {str(s)[:56]}{mark}")


# ── VMS ───────────────────────────────────────────────────────
def probe_vms():
    base = "https://api.inboxcorp.co.th/internal/v1"
    u, p = os.environ.get("VMS_USERNAME"), os.environ.get("VMS_PASSWORD")
    if not (u and p):
        print("  ⏭  ข้าม — ยังไม่ได้กรอก VMS_USERNAME / VMS_PASSWORD")
        return
    r = requests.post(f"{base}/auth/", json={"username": u, "password": p}, timeout=30)
    r.raise_for_status()
    d = r.json()
    if d.get("status") != "success":
        print(f"  ❌ ล็อกอินไม่ผ่าน: {str(d)[:120]}")
        return
    print("  ✅ ล็อกอินผ่าน")
    tok = d["token"]
    h = {"Authorization": f"Bearer {tok}"}

    r = requests.get(f"{base}/kiosks/", headers=h, timeout=30)
    ks = (r.json() or {}).get("data") or []
    print(f"  ตู้ที่เห็น {len(ks)} ตู้")
    if ks:
        show("ฟิลด์ของ 'ตู้'", ks[0])

    rid = (ks[0] or {}).get("record_id") or 40
    r = requests.get(f"{base}/slots/1", params={"kiosk_record_id": rid}, headers=h, timeout=30)
    slots = (r.json() or {}).get("data") or []
    print(f"\n  ช่องของตู้ record_id={rid}: {len(slots)} ช่อง")
    if slots:
        occupied = next((s for s in slots if s.get("product_name")), slots[0])
        show("ฟิลด์ของ 'ช่อง'", occupied)


# ── WorldWide ─────────────────────────────────────────────────
def probe_ww():
    base = "https://www.worldwidevending-vms.com"
    u, p = os.environ.get("WW_USERNAME"), os.environ.get("WW_PASSWORD")
    if not (u and p):
        print("  ⏭  ข้าม — ยังไม่ได้กรอก WW_USERNAME / WW_PASSWORD")
        return
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "X-Requested-With": "XMLHttpRequest"})
    r = s.post(f"{base}/sys/login.do", data={"loginname": u, "loginpwd": p},
               allow_redirects=False, timeout=30)
    if r.status_code != 302 or not s.cookies.get("JSESSIONID"):
        print(f"  ❌ ล็อกอินไม่ผ่าน (HTTP {r.status_code})")
        return
    print("  ✅ ล็อกอินผ่าน")

    # หน้า view_inventory ไม่มีราคา → ไล่ลิงก์ในเมนูหาหน้าที่น่าจะมี
    r = s.get(f"{base}/page/index.do", timeout=60)
    links = sorted(set(re.findall(r'href=["\']([^"\']+\.do[^"\']*)["\']', r.text)))
    print(f"  ลิงก์ในเมนู {len(links)} รายการ")
    likely = [l for l in links if re.search(r"goods|product|price|commodity|sku|item", l, re.I)]
    print("  หน้าที่น่าจะเกี่ยวกับสินค้า/ราคา:")
    for l in (likely or links)[:18]:
        print(f"    {l}")
    if not likely:
        print("    (ไม่เจอคำที่เกี่ยวกับสินค้าเลย — อาจต้องให้เจ้าของส่งลิงก์หน้าราคามาให้)")


# ── Vendos ────────────────────────────────────────────────────
def probe_vendos():
    base = "https://vendos.one"
    u, p = os.environ.get("VENDOS_USERNAME"), os.environ.get("VENDOS_PASSWORD")
    if not (u and p):
        print("  ⏭  ข้าม — ยังไม่ได้กรอก VENDOS_USERNAME / VENDOS_PASSWORD")
        return
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Content-Type": "application/json"})
    r = s.post(f"{base}/auth/user/token", json={"username": u, "password": p}, timeout=30)
    if r.status_code != 200:
        print(f"  ❌ ล็อกอินไม่ผ่าน (HTTP {r.status_code})")
        return
    tok = ((r.json() or {}).get("data") or {}).get("access_token")
    if not tok:
        print("  ❌ ล็อกอินผ่านแต่ไม่เจอ access_token")
        return
    print("  ✅ ล็อกอินผ่าน")
    s.headers.update({"Authorization": f"Bearer {tok}"})

    shops = (s.get(f"{base}/cc_api/shop/list", timeout=30).json() or {}).get("data") or []
    print(f"  ร้าน/ตู้ที่เห็น {len(shops) if isinstance(shops, list) else '?'}")
    sid = None
    if isinstance(shops, list) and shops:
        show("ฟิลด์ของ 'ร้าน'", shops[0])
        sid = shops[0].get("id") or shops[0].get("shop_id")
    if sid:
        st = (s.get(f"{base}/cc_api/shop/stock/{sid}", timeout=60).json() or {}).get("data") or []
        print(f"\n  ช่องของร้าน {sid}: {len(st) if isinstance(st, list) else '?'}")
        if isinstance(st, list) and st:
            show("ฟิลด์ของ 'ช่อง'", st[0])


BRANDS = {"vms": ("VMS · ตู้ chukes", probe_vms),
          "ww": ("WorldWide · ตู้ wwv", probe_ww),
          "vendos": ("Vendos · ตู้ pf01", probe_vendos)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brand", choices=list(BRANDS), help="สำรวจแบรนด์เดียว")
    a = ap.parse_args()

    if load_env():
        print(f"อ่านรหัสจาก {HERE / '.env'}\n")
    else:
        print("ไม่เจอ deploy/scraper/.env — ใช้ตัวแปรระบบแทน\n")

    for key, (label, fn) in BRANDS.items():
        if a.brand and a.brand != key:
            continue
        print("=" * 72)
        print(label)
        print("=" * 72)
        try:
            fn()
        except Exception as e:                                  # noqa: BLE001
            print(f"  ❌ พัง: {type(e).__name__}: {str(e)[:160]}")
        print()


if __name__ == "__main__":
    main()
