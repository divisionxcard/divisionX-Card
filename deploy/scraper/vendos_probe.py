"""
Vendos API discovery probe
--------------------------------------------------------------------
รันครั้งเดียว "เมื่อตู้ Vendos เริ่มมีข้อมูล" เพื่อดูรูปแบบ JSON จริงจากทุก endpoint
แล้วส่งผลลัพธ์ให้ผู้พัฒนา → เอาไปเขียน vendos_stock_sync.py / vendos_sales_api.py
(สคริปต์นี้ไม่แตะ Supabase · แค่ login + GET + print · ไม่ผูก cron)

API ค้นจาก static JS ของพอร์ทัล (ยืนยันแล้ว):
  POST /auth/user/token  {"username","password"} → {"access_token"}
  ทุก call แนบ  Authorization: Bearer <token>

วิธีใช้ (อย่าใส่ creds ในโค้ด — ใช้ env หรือ argument):
  Windows PowerShell:
    $env:VENDOS_USERNAME="xxx"; $env:VENDOS_PASSWORD="yyy"; python deploy/scraper/vendos_probe.py
  หรือ:
    python deploy/scraper/vendos_probe.py --user xxx --pass yyy
"""
import os, json, argparse, requests

BASE = "https://vendos.one"


def login(user: str, pw: str) -> str:
    r = requests.post(f"{BASE}/auth/user/token",
                      json={"username": user, "password": pw}, timeout=30)
    print(f"LOGIN POST /auth/user/token → HTTP {r.status_code}")
    r.raise_for_status()
    tok = (r.json() or {}).get("access_token")
    if not tok:
        raise SystemExit(f"❌ ไม่พบ access_token ใน response: {r.text[:300]}")
    print("  ✅ ได้ access_token แล้ว\n")
    return tok


def show(sess: requests.Session, path: str, **kw) -> object:
    """GET + print JSON ตัวอย่าง (ตัด array ยาวให้เหลือ item แรก)"""
    url = f"{BASE}{path}"
    q = kw.get("params")
    label = path + (f"  ?{q}" if q else "")
    try:
        r = sess.get(url, timeout=30, **kw)
    except Exception as e:
        print(f"GET {label} → ERROR {e}\n")
        return None
    print(f"GET {label} → HTTP {r.status_code}")
    try:
        data = r.json()
    except ValueError:
        print("  (ไม่ใช่ JSON):", r.text[:200], "\n")
        return None

    sample = data
    if isinstance(data, list):
        print(f"  list · len={len(data)} · sample item แรก:")
        sample = data[0] if data else "(list ว่าง)"
    elif isinstance(data, dict):
        inner = data.get("data")
        if isinstance(inner, list):
            print(f"  dict keys={list(data.keys())} · data[] len={len(inner)} · sample แรก:")
            sample = inner[0] if inner else "(data[] ว่าง)"
        else:
            print(f"  dict keys={list(data.keys())}:")
    print(json.dumps(sample, ensure_ascii=False, indent=2)[:2000], "\n")
    return data


def first_id(data) -> object:
    """เดา field ที่เป็น id จาก item แรกของ list/data[]"""
    lst = data if isinstance(data, list) else (data or {}).get("data")
    if not lst:
        return None
    item = lst[0]
    if not isinstance(item, dict):
        return None
    for k in ("id", "shop_id", "_id", "uuid", "code", "shop_code"):
        if item.get(k) is not None:
            print(f"  → เดา id field = '{k}' = {item[k]}")
            return item[k]
    print(f"  ⚠️ หา id field ไม่เจอ · keys={list(item.keys())}")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", default=os.environ.get("VENDOS_USERNAME"))
    ap.add_argument("--pass", dest="pw", default=os.environ.get("VENDOS_PASSWORD"))
    a = ap.parse_args()
    if not a.user or not a.pw:
        raise SystemExit("❌ ต้องมี VENDOS_USERNAME/PASSWORD (env) หรือ --user/--pass")

    print("=" * 55)
    print("Vendos API probe — ดูรูปแบบ JSON จริง")
    print("=" * 55 + "\n")

    tok = login(a.user, a.pw)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}"})

    # ── endpoints ที่ไม่ต้องระบุ id ──
    print("── รายการตู้/สาขา/สินค้า ──")
    shops = show(s, "/cc_api/shop")
    show(s, "/cc_api/vdm")
    show(s, "/cc_api/vdm/undeployed")
    show(s, "/cc_api/product")

    # ── หา shop id เพื่อลอง stock/sales ──
    print("── หา shop id ──")
    sid = first_id(shops)
    print()

    if sid is None:
        print("⚠️ ยังไม่มี shop (ตู้ยังไม่ลงทะเบียน/ยังไม่มีข้อมูล) → ข้าม stock/sales")
        print("   รันสคริปต์นี้อีกครั้งเมื่อตู้เริ่มมีข้อมูล")
        return

    # ลองทั้งแบบ path param และ query param (ยังไม่รู้ว่า Aj.get ต่อ id แบบไหน)
    print("── STOCK (ลองหลายรูปแบบ id) ──")
    show(s, f"/cc_api/shop/stock/{sid}")
    show(s, "/cc_api/shop/stock", params={"id": sid})
    show(s, "/cc_api/shop/stock", params={"shop_id": sid})

    print("── SALES / ORDER ──")
    show(s, f"/cc_api/shop/sales/{sid}")
    show(s, "/cc_api/shop/sales", params={"id": sid})
    show(s, f"/cc_api/shop/order/{sid}")
    show(s, "/cc_api/shop/supply", params={"id": sid})


if __name__ == "__main__":
    main()
