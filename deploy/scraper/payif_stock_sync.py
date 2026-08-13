"""
DivisionX Card — Payif Machine Stock Sync
ยี่ห้อตู้ = Payif · จัดการผ่าน Vendos control center API (JSON REST + Bearer token)

Flow:
  1. POST /auth/user/token {username,password} → access_token
  2. For each payif machine ใน DB (brand='payif', config.machine_id_vendor = shop_id):
       GET /cc_api/shop/stock/{shop_id}  → list[{slot, product_id, sell_price, qty, capacity, warn_threshold}]
       GET /cc_api/shop/sales/{shop_id}  → dict{slot: {product_name, ...}}   (stock endpoint ไม่มีชื่อสินค้า)
       join ด้วย slot → ได้ชื่อสินค้า + คงเหลือ + ความจุ
  3. Upsert machine_stock (on_conflict machine_id+slot_number)

Schema machine_stock: machine_id, kiosk_record_id, slot_number, product_id, product_name,
                      product_img, sku_id, remain, max_capacity, is_occupied, status, synced_at

หมายเหตุ: envelope ทุก endpoint = {"code":1000,"desc":"success","data":...}
"""
import os, re, argparse, requests
from datetime import datetime, timedelta
from supabase import create_client

# ── Config ────────────────────────────────────────────────────
BASE         = "https://vendos.one"
VENDOS_USER  = os.environ.get("VENDOS_USERNAME", "")
VENDOS_PASS  = os.environ.get("VENDOS_PASSWORD", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")


def map_name_to_sku(name: str) -> str | None:
    """ชื่อสินค้า Vendos → sku_id ในระบบเรา
      - One Piece / Extra Booster / Premium Booster / Dragon Ball → OP/EB/PRB/FB + เลข 2 หลัก
        (regex รองรับ 'OP - 11', 'FB - 01', เพิกเฉย Box/Pack — SKU เดียวกัน)
      - ตัวที่ไม่มีรหัส (Pokemon/Naruto/Solo/Yu-Gi-Oh) → substring map แบบ tolerant
        (เผื่อ Vendos พิมพ์ 'Serie' ไม่มี s, typo 'Natoru', เว้นวรรคเกิน)
    """
    if not name:
        return None
    upper = name.upper().strip()
    m = re.search(r'\b(OP|EB|PRB|FB)\s*-?\s*(\d+)', upper)
    if m:
        return f"{m.group(1)} {m.group(2).zfill(2)}"
    lower = re.sub(r'\s+', ' ', name.lower().strip())

    # ── ตัวที่มีเลขชุด ต้องจับด้วย regex "ก่อน" substring map ข้างล่าง ──
    # ไม่งั้น "Naruto Jin - 2" จะไปโดน ("jin", "NRT Jin - 1") กลืนเป็น Jin-1 เงียบ ๆ
    # (ชุดใหม่ที่เพิ่มมาทีหลังจะได้ไม่ถูกนับรวมกับชุดเก่า)
    m = re.search(r'jin\s*[-–]?\s*(\d+)', lower)
    if m:
        return f"NRT Jin - {int(m.group(1))}"
    m = re.search(r'hand\s*of\s*destiny\s*[-–]?\s*(\d+)', lower)
    if m:
        return f"MLBB HOD - {m.group(1).zfill(2)}"
    # Naruto Series — รับได้ทั้งชื่อเดิมหลังบ้าน payif ('Naturo Serie 1' — สะกดผิดด้วย)
    # และชื่อ canonical ('Naruto Series - 01') เผื่อวันหน้าแก้ชื่อในหลังบ้านให้ตรง contract
    m = re.search(r'series?\s*[-–]?\s*(\d+)', lower)
    if m:
        return f"NRT Series - {m.group(1).zfill(2)}"

    for sub, sku in (
        ("jin",           "NRT Jin - 1"),   # ไม่มีเลข = ชุดแรก (ของเดิม)
        ("serie 2",       "NRT Series - 02"),
        ("serie2",        "NRT Series - 02"),
        ("serie 1",       "NRT Series - 01"),
        ("serie1",        "NRT Series - 01"),
        ("dream",         "PKM Dream EX"),
        ("ninja",         "PKM Ninja"),
        ("ghost",         "PKM Ghost"),
        # 2026-08-13 หลังบ้าน WW เปลี่ยนชื่อชุดนี้เป็น "Pokemon M5 Abyss Eye"
        ("abyss",         "PKM Ghost"),
        ("solo leveling", "SLL UA 51"),
        ("chaos",         "YGH Chaos Origins"),
        ("revals",        "YGH The Revals"),
        # 2026-08-13 หลังบ้าน WW แก้คำสะกดเป็น "Rivals" · ใส่ที่ payif ด้วยเผื่อแก้ตามทีหลัง
        ("rivals",        "YGH The Revals"),
        ("heroes",        "YGH The Heroes"),
        # ── สินค้าใหม่ 2026-08-13 · ตอนนี้อยู่แค่ตู้ chukes ใส่ไว้เผื่อมาลง pf ──
        ("pony sea02",    "MLP SEA02"),
        ("pony bp-01",    "MLP BP-01"),
        ("overdrive",     "TF Overdrive 01"),
        ("ut01",          "YGH UT01"),
    ):
        if sub in lower:
            return sku
    return None


def login() -> requests.Session:
    print("🔐 Login Vendos control center...")
    if not VENDOS_USER or not VENDOS_PASS:
        raise SystemExit("❌ ต้องตั้ง VENDOS_USERNAME / VENDOS_PASSWORD")
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Content-Type": "application/json"})
    r = s.post(f"{BASE}/auth/user/token",
               json={"username": VENDOS_USER, "password": VENDOS_PASS}, timeout=30)
    if r.status_code != 200:
        raise SystemExit(f"❌ Login failed: HTTP {r.status_code} · {r.text[:200]}")
    j = r.json() or {}
    # envelope ห่อ token ใน data: {"code":1000,"data":{"access_token":...}}
    tok = (j.get("data") or {}).get("access_token") or j.get("access_token")
    if not tok:
        raise SystemExit(f"❌ Login OK แต่ไม่พบ access_token: {r.text[:200]}")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    print("  ✅ Login สำเร็จ")
    return s


def api_get(s: requests.Session, path: str):
    """GET + ตรวจ envelope {code:1000} → คืน data"""
    r = s.get(f"{BASE}{path}", timeout=60)
    r.raise_for_status()
    j = r.json()
    if j.get("code") != 1000:
        raise RuntimeError(f"API {path} code={j.get('code')} desc={j.get('desc')!r}")
    return j.get("data")


def fetch_payif_machines(supabase) -> list[dict]:
    """[{machine_id, shop_id}] จาก machines brand='payif'"""
    res = supabase.table("machines").select("machine_id, config").eq("brand", "payif").execute()
    out = []
    for row in (res.data or []):
        cfg = row.get("config") or {}
        sid = cfg.get("machine_id_vendor")
        if sid:
            out.append({"machine_id": row["machine_id"], "shop_id": str(sid)})
    return out


def fetch_slots(s: requests.Session, shop_id: str) -> list[dict]:
    """join stock (qty/capacity) + sales (product_name) ด้วย slot"""
    stock = api_get(s, f"/cc_api/shop/stock/{shop_id}") or []
    sales = api_get(s, f"/cc_api/shop/sales/{shop_id}") or {}
    # sales = dict keyed by slot → product_name
    names = {slot: (info or {}).get("product_name") for slot, info in sales.items()}

    slots = []
    for row in stock:
        slot = row.get("slot")
        if not slot:
            continue
        name = (names.get(slot) or "").strip()
        qty  = int(row.get("qty") or 0)
        cap  = int(row.get("capacity") or 0)
        warn = int(row.get("warn_threshold") or 0)
        status = "out" if qty <= 0 else ("low" if qty <= warn else "normal")
        slots.append({
            "slot_number":  slot,
            "product_name": name or None,
            "sku_id":       map_name_to_sku(name),
            "remain":       qty,
            "max_capacity": cap,
            "is_occupied":  bool(name),
            "status":       status,
        })
    return slots


def null_unknown_skus(supabase, records: list[dict]):
    """set sku_id=None ถ้าไม่มีใน skus (กัน FK violation) · เก็บ product_name ไว้"""
    res = supabase.table("skus").select("sku_id").execute()
    valid = {r["sku_id"] for r in (res.data or [])}
    unknown = {}
    for rec in records:
        sid = rec.get("sku_id")
        if sid and sid not in valid:
            unknown[sid] = unknown.get(sid, 0) + 1
            rec["sku_id"] = None
    if unknown:
        print("⚠️ sku ไม่รู้จัก (set NULL · เก็บ product_name): "
              + ", ".join(f"{k}×{v}" for k, v in sorted(unknown.items())))


def save_to_supabase(supabase, records: list[dict]):
    if not records:
        print("⚠️ ไม่มีข้อมูลที่จะบันทึก")
        return
    print(f"💾 บันทึก {len(records)} slots ลง Supabase...")
    saved = 0
    for i in range(0, len(records), 100):
        batch = records[i:i + 100]
        supabase.table("machine_stock").upsert(batch, on_conflict="machine_id,slot_number").execute()
        saved += len(batch)
    print(f"🎉 บันทึกสำเร็จ {saved} slots")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="login+fetch+parse แต่ไม่แตะ Supabase")
    ap.add_argument("--shop-id", help="(dry-run) ระบุ shop id ตรง ๆ โดยไม่ต้องอ่าน DB")
    args = ap.parse_args()

    now_bkk = datetime.utcnow() + timedelta(hours=7)
    print(f"\n{'=' * 50}\nDivisionX Card — Payif Stock Sync\nเวลาไทย: {now_bkk:%Y-%m-%d %H:%M}\n{'=' * 50}\n")

    if args.dry_run and args.shop_id:
        supabase = None
        machines = [{"machine_id": "TEST", "shop_id": args.shop_id}]
    else:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        machines = fetch_payif_machines(supabase)
        if not machines:
            raise SystemExit("❌ ไม่พบ machine brand=payif ใน DB — INSERT machines ก่อน sync")
    print(f"ตู้ทั้งหมด: {len(machines)} ตู้")

    s = login()
    synced_at = datetime.utcnow().isoformat()
    all_records, machines_with_data, failed = [], 0, []

    for m in machines:
        mid, sid = m["machine_id"], m["shop_id"]
        print(f"\n📦 ดึง {mid} (shop={sid})...")
        try:
            slots = fetch_slots(s, sid)
        except Exception as e:
            print(f"  ⚠️ ดึง {mid} ไม่ได้ (ข้ามตู้นี้): {e}")
            failed.append(mid)
            continue
        print(f"  ✅ พบ {len(slots)} slots")
        if slots:
            machines_with_data += 1
        for slot in slots:
            all_records.append({
                "machine_id":      mid,
                "kiosk_record_id": 0,           # ไม่ใช้กับ vendos (column NOT NULL)
                "slot_number":     slot["slot_number"],
                "product_id":      None,
                "product_name":    slot["product_name"],
                "product_img":     None,
                "sku_id":          slot["sku_id"],
                "remain":          slot["remain"],
                "max_capacity":    slot["max_capacity"],
                "is_occupied":     slot["is_occupied"],
                "status":          slot["status"][:20],
                "synced_at":       synced_at,
            })

    ok = len(machines) - len(failed)
    print(f"\n📊 รวม {len(all_records)} slots จาก {ok}/{len(machines)} ตู้")
    if failed:
        print(f"⚠️ ตู้ที่ดึงไม่ได้: {', '.join(failed)}")
    if machines_with_data == 0:
        raise SystemExit(f"ERROR: ทุกตู้ดึงข้อมูลไม่ได้ ({len(machines)} ตู้) · login fail หรือ API เปลี่ยน")

    if args.dry_run:
        mapped = sum(1 for r in all_records if r["sku_id"])
        print(f"\n🧪 DRY-RUN: ไม่ save · map SKU ได้ {mapped}/{len(all_records)} ช่อง")
        for r in all_records:
            flag = "" if r["sku_id"] else "  ⚠️ NO SKU"
            print(f"  slot={r['slot_number']} sku={str(r['sku_id']):<16} "
                  f"remain={r['remain']}/{r['max_capacity']} · {r['product_name']}{flag}")
    else:
        null_unknown_skus(supabase, all_records)
        try:
            from slot_tracking import track_refill_events
            track_refill_events(supabase, "vendos", all_records, synced_at, "vendos_stock_sync")
        except Exception as e:
            print(f"⚠️  slot_refill_events tracking failed: {e}")
        save_to_supabase(supabase, all_records)


if __name__ == "__main__":
    main()
