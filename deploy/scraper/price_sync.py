"""ดึงราคาขายจากหลังบ้านตู้ทั้ง 3 แบรนด์ แล้วเทียบ/อัปเดตเข้าระบบ

ที่มา
─────
เจ้าของอยากให้ราคาในระบบตรงกับหลังบ้านเสมอ ไม่ใช่เดาจากยอดขาย
(ตรวจแล้วยอดขายให้ราคาผิดจริง เช่น YGH The Revals ขึ้น 200→310 แต่ค่าที่พบบ่อย
ตลอดกาลยังเป็น 200)

ราคาอยู่ตรงไหนของแต่ละแบรนด์ — สำรวจแล้ว 25 ส.ค. 2026
─────────────────────────────────────────────────────
  VMS      GET /slots/{tab}?kiosk_record_id={id}
           pay_price     ราคาที่ลูกค้าจ่ายจริง   ← ใช้ตัวนี้
           normal_price  ราคาก่อนลด
           👉 แยกตามช่อง **และแยกตามตู้** ตู้เดียวกันคนละช่องตั้งคนละราคาได้

  WW       GET /com/async/commodity_list/{หน้า}/{จำนวน}.do   (JSON)
           retailPrice
           👉 **ราคากลางต่อสินค้า ไม่แยกตู้** — WW ตั้งราคาที่ตัวสินค้า

  Vendos   GET /cc_api/shop/stock/{shop_id}    sell_price   (แยกตามช่อง)
           GET /cc_api/product                 list_price + cost  (ราคากลาง)
           👉 ตัวเลขเป็น {"_dec_":N,"_exp_":E} = N × 10^E

⚠️ ราคาที่ได้เป็น "ราคาต่อช่อง" ช่องกล่องจะเป็นราคาทั้งกล่อง
   ต้องหาร packs_per_box ก่อนเทียบกับ skus.sell_price ซึ่งเป็นราคาต่อซอง

วิธีรัน
───────
    py -3 deploy/scraper/price_sync.py              # ดูอย่างเดียว ไม่เขียน
    py -3 deploy/scraper/price_sync.py --apply      # เขียน skus.sell_price จริง

ต้องมี deploy/scraper/.env (gitignore แล้ว) หรือ env vars ของ CI
"""
import argparse
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def load_env():
    """⚠️ ต้องเรียก **ก่อน** import ไฟล์ scraper อื่น

    ไฟล์พวกนั้นอ่าน os.environ["VMS_USERNAME"] ตั้งแต่ตอน import
    ถ้าโหลดทีหลังจะ KeyError ทันที
    """
    for name, src in ((".env", HERE / ".env"), (".env.local", HERE.parent / ".env.local")):
        if not src.exists():
            continue
        for line in src.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    # ชื่อคีย์ของ scraper ต่างจากของเว็บ — เชื่อมให้
    for a, b in (("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
                 ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY")):
        if not os.environ.get(a) and os.environ.get(b):
            os.environ[a] = os.environ[b]


load_env()

from sales_unit import unit_of                                   # noqa: E402
from vms_stock_sync import map_product_to_sku                    # noqa: E402  (ชื่อแบบ VMS)
from worldwide_stock_sync import map_goods_to_sku                # noqa: E402
from payif_stock_sync import map_name_to_sku                     # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")


def dec(m):
    """{"_dec_":N,"_exp_":E} → N × 10^E   (รูปแบบตัวเลขของ Vendos)"""
    if isinstance(m, (int, float)):
        return float(m)
    if not isinstance(m, dict):
        return 0.0
    return float(m.get("_dec_", 0)) * (10 ** float(m.get("_exp_", 0)))


# ── Supabase ──────────────────────────────────────────────────
def sb():
    env = {}
    for ln in (HERE.parent / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in ln and not ln.strip().startswith("#"):
            k, v = ln.split("=", 1)
            env[k.strip()] = v.strip()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ["SUPABASE_URL"]
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_SERVICE_KEY"]
    return url, {"apikey": key, "Authorization": f"Bearer {key}"}


def sb_get(path):
    url, h = sb()
    out, frm = [], 0
    while True:
        req = urllib.request.Request(f"{url}/rest/v1/{path}",
                                     headers={**h, "Range": f"{frm}-{frm + 999}"})
        b = json.load(urllib.request.urlopen(req, timeout=60))
        out += b
        if len(b) < 1000:
            return out
        frm += 1000


def sb_patch(sku_id, body):
    url, h = sb()
    req = urllib.request.Request(
        f"{url}/rest/v1/skus?sku_id=eq.{urllib.parse.quote(sku_id)}", method="PATCH",
        headers={**h, "Content-Type": "application/json", "Prefer": "return=representation"},
        data=json.dumps(body).encode())
    return json.load(urllib.request.urlopen(req, timeout=60))


# ── ดึงราคาแต่ละแบรนด์ → [{machine_id, sku_id, name, unit, price_per_slot}] ──
def from_vms():
    base = "https://api.inboxcorp.co.th/internal/v1"
    u, p = os.environ.get("VMS_USERNAME"), os.environ.get("VMS_PASSWORD")
    if not (u and p):
        return []
    r = requests.post(f"{base}/auth/", json={"username": u, "password": p}, timeout=30)
    r.raise_for_status()
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    ks = (requests.get(f"{base}/kiosks/", headers=h, timeout=30).json() or {}).get("data") or []
    out = []
    for k in ks:
        mid = k.get("kiosk_id")
        rid = k.get("record_id")
        d = requests.get(f"{base}/slots/1", params={"kiosk_record_id": rid},
                         headers=h, timeout=45).json() or {}
        for s in (d.get("data") or []):
            name = s.get("product_name")
            price = s.get("pay_price")
            if not name or not price:
                continue
            out.append({"brand": "vms", "machine_id": mid, "name": name,
                        "sku_id": map_product_to_sku(name), "unit": unit_of(name),
                        "price": float(price)})
    return out


def from_ww():
    base = "https://www.worldwidevending-vms.com"
    u, p = os.environ.get("WW_USERNAME"), os.environ.get("WW_PASSWORD")
    if not (u and p):
        return []
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "X-Requested-With": "XMLHttpRequest"})
    r = s.post(f"{base}/sys/login.do", data={"loginname": u, "loginpwd": p},
               allow_redirects=False, timeout=30)
    if r.status_code != 302:
        return []
    out = []
    for page in range(1, 12):                       # กันวนไม่จบ ถ้าเกิน 1100 ตัวค่อยขยาย
        d = s.get(f"{base}/com/async/commodity_list/{page}/100.do", timeout=60).json() or {}
        rows = d.get("data") or []
        for g in rows:
            name = g.get("goodsName")
            price = g.get("retailPrice")
            if not name or not price:
                continue
            out.append({"brand": "worldwide", "machine_id": None, "name": name,
                        "sku_id": map_goods_to_sku(name), "unit": unit_of(name),
                        "price": float(price)})
        if len(rows) < 100:
            break
    return out


def from_vendos():
    base = "https://vendos.one"
    u, p = os.environ.get("VENDOS_USERNAME"), os.environ.get("VENDOS_PASSWORD")
    if not (u and p):
        return []
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Content-Type": "application/json"})
    r = s.post(f"{base}/auth/user/token", json={"username": u, "password": p}, timeout=30)
    tok = ((r.json() or {}).get("data") or {}).get("access_token")
    if not tok:
        return []
    s.headers.update({"Authorization": f"Bearer {tok}"})
    d = (s.get(f"{base}/cc_api/product", timeout=60).json() or {}).get("data") or []
    out = []
    for g in d:
        name = g.get("name")
        if not name:
            continue
        out.append({"brand": "payif", "machine_id": None, "name": name,
                    "sku_id": map_name_to_sku(name), "unit": unit_of(name),
                    "price": dec(g.get("list_price")), "cost": dec(g.get("cost"))})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="เขียนราคาให้ SKU ที่ยังไม่มีราคา (sell_price = 0) เท่านั้น")
    ap.add_argument("--apply-all", action="store_true",
                    help="เขียนทับของเดิมด้วย ⚠️ ดูรายการก่อนเสมอ")
    a = ap.parse_args()
    load_env()

    skus = {s["sku_id"]: s for s in sb_get("skus?select=sku_id,name,packs_per_box,sell_price,cost_price,is_active")}

    # ⚠️ คลังสินค้าของ WW/Vendos มี "รายการชื่อเก่า" ค้างอยู่พร้อมราคาที่เลิกใช้แล้ว
    #    เช่น WW มีทั้ง 'One Piece OP - 13' (310 · barcode 2057…) ที่ใช้จริง
    #    และ 'One Piece OP-13' (100 · barcode 4556…) ที่เป็นของเก่า
    #    ถ้าไม่กรอง ราคาเก่าจะมาถ่วงจนดูเหมือน "หลังบ้านตั้งไม่เท่ากัน"
    #    → เชื่อเฉพาะสินค้าที่มีอยู่ในตู้จริงตอนนี้
    live = {(r["product_name"] or "").strip()
            for r in sb_get("machine_stock?select=product_name&product_name=not.is.null")}
    print(f"  ชื่อสินค้าที่อยู่ในตู้จริงตอนนี้ {len(live)} ชื่อ\n")

    rows, dropped = [], []
    for label, fn in (("VMS", from_vms), ("WorldWide", from_ww), ("Vendos", from_vendos)):
        try:
            got = fn()
            # VMS ดึงจากช่องสด อยู่ในตู้อยู่แล้ว · อีกสองแบรนด์เป็นคลังรวมต้องกรอง
            if label != "VMS":
                keep = [g for g in got if g["name"].strip() in live]
                dropped += [g for g in got if g["name"].strip() not in live]
                got = keep
            print(f"  {label:11} ใช้ได้ {len(got)} รายการ")
            rows += got
        except Exception as e:                                   # noqa: BLE001
            print(f"  {label:11} ❌ {type(e).__name__}: {str(e)[:110]}")

    if dropped:
        print(f"\n  ตัดรายการที่ไม่มีในตู้แล้ว {len(dropped)} รายการ (ชื่อเก่า/ของเลิกขาย):")
        for g in sorted(dropped, key=lambda x: x["name"])[:14]:
            print(f"    {g['brand']:10} {g['name'][:40]:42} {g['price']:>9,.2f}")
        if len(dropped) > 14:
            print(f"    … อีก {len(dropped) - 14} รายการ")

    unmapped = sorted({r["name"] for r in rows if not r["sku_id"]})
    print(f"\nรวม {len(rows)} รายการ · จับคู่ SKU ไม่ได้ {len(unmapped)} ชื่อ")
    if unmapped:
        for n in unmapped[:12]:
            print(f"   ⚠️  {n}")

    # ⚠️ ห้ามเอาราคากล่องหารจำนวนซองมาเทียบกับราคาซอง
    #    หลังบ้านตั้ง "ส่วนลดยกกล่อง" ไว้จริง เช่น FB 01 ซองละ 90 แต่ยกกล่อง 2,000
    #    (= 83.33/ซอง) ต่างกันโดยตั้งใจ ไม่ใช่ความผิดพลาด
    #    skus.sell_price คือราคาต่อซอง → ใช้เฉพาะแถวที่ unit='pack' เท่านั้น
    per_pack, per_box = defaultdict(list), defaultdict(list)
    for r in rows:
        sid = r["sku_id"]
        if not sid or sid not in skus:
            continue
        tgt = per_box if r["unit"] == "box" else per_pack
        tgt[sid].append((round(r["price"], 2), r["brand"], r["machine_id"], r["name"]))

    print("\n" + "=" * 92)
    print(f"{'SKU':<20}{'ในระบบ':>9}{'หลังบ้าน':>26}  สถานะ")
    print("=" * 92)
    updates, conflicts = {}, []
    for sid in sorted(per_pack):
        vals = per_pack[sid]
        prices = sorted({v[0] for v in vals})
        cur = skus[sid].get("sell_price") or 0
        shown = " / ".join(f"{p:,.2f}" for p in prices[:4])
        if len(prices) == 1:
            new = prices[0]
            if abs(new - cur) < 0.01:
                state = "✅ ตรงกัน"
            else:
                state = f"🔄 ต่าง {new - cur:+,.2f}" if cur else "🆕 ยังไม่เคยมีราคา"
                updates[sid] = new
        else:
            state = "⚠️  หลังบ้านตั้งไม่เท่ากัน — ต้องเลือก"
            conflicts.append((sid, vals))
        print(f"{sid:<20}{cur:>9,.0f}{shown:>26}  {state}")

    if conflicts:
        print("\n" + "=" * 92)
        print("ราคาซองที่หลังบ้านตั้งไม่เท่ากัน — ต้องให้เจ้าของตัดสิน")
        print("=" * 92)
        for sid, vals in conflicts:
            print(f"\n  {sid}")
            g = defaultdict(list)
            for pp, brand, mid, name in vals:
                g[pp].append(f"{brand}:{mid or 'ทุกตู้'}")
            for pp in sorted(g, reverse=True):
                src = sorted(set(g[pp]))
                print(f"    {pp:>9,.2f} บาท/ซอง  ({len(g[pp])} ช่อง)  ←  {', '.join(src)[:64]}")

    # ราคายกกล่อง — ระบบไม่มีที่เก็บ แต่เจ้าของควรเห็นว่าส่วนลดเท่าไหร่
    print("\n" + "=" * 92)
    print("ราคายกกล่อง (ระบบยังไม่มีคอลัมน์เก็บ — แสดงให้ดูเฉย ๆ)")
    print("=" * 92)
    print(f"{'SKU':<20}{'ราคากล่อง':>26}{'ต่อซอง':>10}{'ราคาซอง':>10}  ส่วนลดยกกล่อง")
    for sid in sorted(per_box):
        if sid not in per_pack:
            continue
        bx = sorted({v[0] for v in per_box[sid]})
        pk = sorted({v[0] for v in per_pack[sid]})
        ppb = skus[sid].get("packs_per_box") or 24
        per = bx[0] / ppb
        base = pk[0]
        gap = (per - base) / base * 100 if base else 0
        note = "เท่ากัน" if abs(gap) < 1 else f"{'ถูกกว่า' if gap < 0 else 'แพงกว่า'} {abs(gap):.0f}%"
        shown = " / ".join(f"{b:,.0f}" for b in bx[:3])
        print(f"{sid:<20}{shown:>26}{per:>10,.2f}{base:>10,.0f}  {note}")

    # แยกเป็น 2 กอง — "ยังไม่มีราคา" ปลอดภัยกว่ามาก เพราะไม่ได้ทับของที่ใช้งานอยู่
    fresh = {k: v for k, v in updates.items() if not (skus[k].get("sell_price") or 0)}
    changed = {k: v for k, v in updates.items() if k not in fresh}

    print("\n" + "=" * 92)
    print(f"ยังไม่เคยมีราคา (เติมได้เลย)      {len(fresh):>2} SKU")
    print(f"มีราคาอยู่แล้วแต่ไม่ตรงหลังบ้าน   {len(changed):>2} SKU  ← ต้องให้เจ้าของยืนยันก่อนทับ")
    print(f"หลังบ้านตั้งไม่เท่ากัน            {len(conflicts):>2} SKU  ← ต้องเลือกว่าจะเอาของตู้ไหน")
    if changed:
        print("\n  รายการที่จะถูกทับถ้าใช้ --apply-all:")
        for sid, v in sorted(changed.items()):
            print(f"    {sid:<20}{skus[sid].get('sell_price') or 0:>8,.0f} → {v:>8,.2f}")

    if not (a.apply or a.apply_all):
        print("\n(ยังไม่ได้เขียนอะไร — ใส่ --apply เพื่อเติมเฉพาะตัวที่ยังไม่มีราคา)")
        return

    todo = dict(fresh)
    if a.apply_all:
        todo.update(changed)
    print()
    for sid, v in sorted(todo.items()):
        sb_patch(sid, {"sell_price": v})
        print(f"  ✅ {sid:<20} → {v:,.2f}")
    print(f"\nเขียนแล้ว {len(todo)} SKU")


if __name__ == "__main__":
    main()
