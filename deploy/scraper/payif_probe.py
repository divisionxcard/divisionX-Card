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
    j = r.json() or {}
    # envelope ห่อ token ใน data: {"code":1000,"data":{"access_token":...}}
    tok = (j.get("data") or {}).get("access_token") or j.get("access_token")
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
    ap.add_argument("--shop-id", default=None, help="ระบุ shop id ตรง ๆ (ข้าม discovery) เช่น 208")
    ap.add_argument("--orders-only", action="store_true", help="เจาะเฉพาะ order endpoints")
    a = ap.parse_args()
    if not a.user or not a.pw:
        raise SystemExit("❌ ต้องมี VENDOS_USERNAME/PASSWORD (env) หรือ --user/--pass")

    print("=" * 55)
    print("Vendos API probe — ดูรูปแบบ JSON จริง")
    print("=" * 55 + "\n")

    tok = login(a.user, a.pw)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}"})

    sid = a.shop_id
    if not a.orders_only:
        # ── endpoints ที่ไม่ต้องระบุ id ──
        print("── รายการตู้/สาขา/สินค้า ──")
        shops = show(s, "/cc_api/shop")
        show(s, "/cc_api/vdm")
        show(s, "/cc_api/vdm/undeployed")
        show(s, "/cc_api/product")

        # ── หา shop id เพื่อลอง stock/sales ──
        if sid is None:
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

    if sid is None:
        raise SystemExit("❌ --orders-only ต้องระบุ --shop-id ด้วย")

    # ── ORDER deep probe — หา transaction จริง (timestamp + สินค้า + ยอดเงิน) ──
    # จาก static /static/js/api.js (ยืนยัน):
    #   get_order:        GET /cc_api/shop/order          (ไม่มี param — list ทั้งบัญชี)
    #   get_order_detail: GET /cc_api/shop/order/{order_id}
    #   sum_sales:        GET /cc_api/summary/sales-summary?<qs>
    #   order report:     GET /cc_api/reports/order-detail-report?<qs> (download file)
    print("── ORDER list (bare — จาก api.js get_order) ──")
    order_data = show(s, "/cc_api/shop/order")
    # เผื่อ list ยาว — ดู 3 รายการแรกเต็ม ๆ (show ตัดเหลือ item เดียว)
    lst = order_data if isinstance(order_data, list) else (order_data or {}).get("data")
    if isinstance(lst, list) and lst:
        print(f"  (ทั้งหมด {len(lst)} orders · sample 3 รายการแรก)")
        print(json.dumps(lst[:3], ensure_ascii=False, indent=2)[:4000], "\n")

    # เจาะ detail ด้วย order id ตัวแรก
    oid = first_id(order_data)
    if oid is not None:
        print(f"── ORDER detail (order id={oid}) ──")
        show(s, f"/cc_api/shop/order/{oid}")

    # bare order crash "NoneType tzinfo" = endpoint ต้องการ date param → brute-force ชื่อ param
    print("── ORDER param brute-force (หาว่า date param ชื่ออะไร) ──")
    D1, D2 = "2026-07-01", "2026-07-17"
    D1T, D2T = "2026-07-01 00:00:00", "2026-07-17 23:59:59"
    param_candidates = [
        {"start": D1, "end": D2},
        {"begin": D1, "end": D2},
        {"from": D1, "to": D2},
        {"date_from": D1, "date_to": D2},
        {"start_date": D1, "end_date": D2},
        {"startDate": D1, "endDate": D2},
        {"start_time": D1T, "end_time": D2T},
        {"startTime": D1T, "endTime": D2T},
        {"st": D1, "et": D2},
        {"start": D1T, "end": D2T},
        {"start": D1, "end": D2, "shop_id": sid},
        {"start": D1, "end": D2, "shop": sid},
        {"start": D1, "end": D2, "page": 1, "page_size": 50},
    ]
    for qs in param_candidates:
        try:
            r = s.get(f"{BASE}/cc_api/shop/order", params=qs, timeout=30)
            j = r.json()
            code = j.get("code")
            data = j.get("data")
            n = len(data) if isinstance(data, list) else ("null" if data is None else "dict")
            tag = "✅ WORKS" if code == 1000 else ""
            print(f"  ?{qs} → code={code} desc={str(j.get('desc'))[:60]!r} data={n} {tag}")
            if code == 1000 and isinstance(data, list) and data:
                print("    sample:", json.dumps(data[0], ensure_ascii=False)[:800])
        except Exception as e:
            print(f"  ?{qs} → ERROR {e}")
    print()

    print("── SUMMARY / REPORT (ลอง qs หลายแบบ) ──")
    show(s, "/cc_api/summary/sales-summary")
    show(s, "/cc_api/summary/sales-summary",
         params={"start": "2026-07-01", "end": "2026-07-17"})
    show(s, "/cc_api/summary/sales-summary",
         params={"date_from": "2026-07-01", "date_to": "2026-07-17", "shop_id": sid})
    # report = download file → ดูแค่ HTTP status + content-type
    for qs in ({"start": "2026-07-01", "end": "2026-07-17"},
               {"date_from": "2026-07-01", "date_to": "2026-07-17"},
               {"start": "2026-07-01", "end": "2026-07-17", "shop_id": sid}):
        try:
            r = s.get(f"{BASE}/cc_api/reports/order-detail-report", params=qs, timeout=30)
            ct = r.headers.get("Content-Type", "")
            body = r.text[:300] if "json" in ct or "text" in ct else f"({len(r.content)} bytes)"
            print(f"GET /cc_api/reports/order-detail-report ?{qs} → HTTP {r.status_code} · {ct} · {body}\n")
        except Exception as e:
            print(f"GET /cc_api/reports/order-detail-report ?{qs} → ERROR {e}\n")


if __name__ == "__main__":
    main()
