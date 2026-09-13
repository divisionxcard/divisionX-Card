#!/usr/bin/env python3
"""deploy ขึ้น Vercel ผ่าน REST API โดยไม่ผ่าน GitHub และไม่ผ่าน Vercel CLI

ทำไมต้องมี (12-13 ก.ย. 2026):
    บัญชี GitHub ถูกแฟล็ก → Vercel มองไม่เห็น repo → เว็บจริงค้างโค้ดวันที่ 9 ก.ย.
    ทางปกติคือใช้ Vercel CLI แต่ CLI เรียก /v2/user ก่อนเสมอ ซึ่ง token ของทีมนี้
    (ขึ้นต้น vcp_) ไม่มีสิทธิ์ ตอบ 404 "User not found" — ลองทุกท่ารวมถึง --scope แล้วไม่ผ่าน

    แต่ token ตัวเดียวกันนี้ **สร้าง deployment ผ่าน REST API ได้** (ทดสอบแล้ว
    POST /v13/deployments ตอบ 400 missing name ไม่ใช่ 403) จึงเขียนตัวนี้ขึ้นมาแทน

วิธีทำงาน — เหมือนที่ CLI ทำ:
    1. ไล่เก็บไฟล์ที่ต้องอัป (ตาม SKIP ด้านล่าง)
    2. อัปทีละไฟล์ไป /v2/files พร้อม header x-vercel-digest = sha1 ของเนื้อไฟล์
       (ไฟล์ที่ Vercel เคยเห็น sha นี้แล้วจะข้ามเองอัตโนมัติ รอบถัดไปจึงเร็วขึ้นมาก)
    3. POST /v13/deployments พร้อมรายการไฟล์ → Vercel build ฝั่งเขา

⚠️ path ของไฟล์ต้องเป็น path เทียบจากรากรีโป (มี deploy/ นำหน้า)
   เพราะโปรเจกต์ตั้ง rootDirectory = "deploy" ไว้ ซึ่ง Vercel จะไปตัดเอง
   ถ้าส่ง path ที่ตัด deploy/ ออกแล้ว มันจะหา package.json ไม่เจอ

⚠️ ค่าปริยายคือ deploy เป็น **preview** ไม่ใช่ production — ต้องใส่ --prod เอง
   ให้ตรวจ preview ก่อนแล้วค่อยดันขึ้น production จะปลอดภัยกว่า

รัน:
    .venv-image\\Scripts\\python.exe scripts/vercel_deploy.py            # preview
    .venv-image\\Scripts\\python.exe scripts/vercel_deploy.py --prod     # production
"""
import concurrent.futures
import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "deploy" / ".env.local"
API = "https://api.vercel.com"

PROJECT_NAME = "division-x-card"
TEAM_ID = "team_gPcDcu7b0U7jXj9cDPGVa5XT"

# อัปเฉพาะสิ่งที่เว็บต้องใช้ · รากรีโปมีของหนักกว่า 7 GB ที่เว็บไม่ได้ใช้เลย
SRC_DIR = "deploy"

# โฟลเดอร์ระดับบนสุดของ deploy/ ที่ไม่ต้องอัป
#
# ⚠️ **ห้ามใส่ tasks ที่นี่** — API route อ่าน process.cwd()/tasks/*.json ตอนทำงานจริง
#    (content_voice · content_craft · art_direction · card_care · คลังการ์ดทุกค่าย)
#    build จะผ่านเหมือนไม่มีอะไรผิด แล้วไปพังเอาตอนกดเขียนคอนเทนต์ — พลาดมาแล้วรอบแรก
#
# agents/scraper/mcp เป็นโค้ด Python ที่รันบน GitHub Actions หรือในเครื่อง
# ตรวจแล้วว่าโค้ดเว็บอ้างถึงแค่ในคอมเมนต์ ไม่มีการ import หรืออ่านไฟล์จริง
SKIP_TOP = {"node_modules", ".next", "agents", "scraper", "mcp", "supabase",
            "docs", "scripts", ".github", ".scenes", ".vercel",
            ".claude-design-output"}

# ชื่อโฟลเดอร์ที่ข้ามไม่ว่าอยู่ชั้นไหน
SKIP_ANY = {"node_modules", "__pycache__", ".next"}

SKIP_FILES = {".env.local", ".env.staging", "dev.log"}
SKIP_SUFFIX = {".pyc", ".log"}


def load_token():
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        s = line.strip()
        if s.startswith("VERCEL_TOKEN="):
            v = s.split("=", 1)[1].strip()
            if v:
                return v
    sys.exit("ไม่พบ VERCEL_TOKEN ใน deploy/.env.local")


TOKEN = load_token()
HEAD = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "dvx-deploy"}


def api(path, method="GET", body=None, raw=None, extra=None, timeout=120):
    h = dict(HEAD)
    if extra:
        h.update(extra)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if body is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt.strip() else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt[:300]


def collect():
    """ไฟล์ที่ต้องอัป → [(path เทียบรากรีโป, bytes, sha1)]"""
    base = ROOT / SRC_DIR
    out = []
    for p in base.rglob("*"):
        if not p.is_file():
            continue
        rel_parts = p.relative_to(base).parts
        # แยกสองชั้น: ระดับบนสุดตัดตามชื่อตรง ๆ · ชั้นลึกตัดเฉพาะที่ข้ามได้ทุกที่
        # (ถ้าเช็ครวมกันแบบหลวม โฟลเดอร์ชื่อ scripts ที่ซ้อนอยู่ใน app/ จะถูกตัดไปด้วย)
        if rel_parts[0] in SKIP_TOP and len(rel_parts) > 1:
            continue
        if any(part in SKIP_ANY for part in rel_parts[:-1]):
            continue
        if p.name in SKIP_FILES or p.suffix in SKIP_SUFFIX:
            continue
        data = p.read_bytes()
        out.append((f"{SRC_DIR}/" + "/".join(rel_parts),
                    data, hashlib.sha1(data).hexdigest()))
    return out


def upload(item):
    path, data, sha = item
    for attempt in range(3):
        st, res = api("/v2/files", "POST", raw=data, extra={
            "x-vercel-digest": sha,
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
        })
        if st in (200, 201):
            return True, path, None
        # 429/5xx = ชั่วคราว ลองใหม่ · อย่างอื่นเลิก
        if st in (429, 500, 502, 503) and attempt < 2:
            time.sleep(1.5 * (attempt + 1))
            continue
        return False, path, f"HTTP {st} {str(res)[:120]}"
    return False, path, "ลองครบ 3 รอบแล้วไม่สำเร็จ"


def main():
    prod = "--prod" in sys.argv
    print(f"เก็บรายชื่อไฟล์จาก {SRC_DIR}/ …")
    files = collect()
    total_mb = sum(len(d) for _, d, _ in files) / 1024 / 1024
    print(f"  {len(files)} ไฟล์ · {total_mb:.1f} MB\n")

    print("อัปไฟล์ขึ้น Vercel (ไฟล์ที่เคยอัปแล้วจะถูกข้ามเอง)…")
    failed = []
    done = 0
    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for ok, path, err in ex.map(upload, files):
            done += 1
            if not ok:
                failed.append((path, err))
            if done % 400 == 0:
                print(f"  … {done}/{len(files)}")
    print(f"  เสร็จ {done} ไฟล์ใน {time.time()-t0:.0f} วินาที · ล้มเหลว {len(failed)}")
    if failed:
        for p, e in failed[:5]:
            print(f"    ✗ {p} — {e}")
        sys.exit("อัปไฟล์ไม่ครบ ยกเลิกการ deploy")

    print(f"\nสร้าง deployment ({'production' if prod else 'preview'}) …")
    payload = {
        "name": PROJECT_NAME,
        "project": PROJECT_NAME,
        "files": [{"file": f, "sha": s, "size": len(d)} for f, d, s in files],
        "projectSettings": {"framework": "nextjs"},
    }
    if prod:
        payload["target"] = "production"
    st, res = api(f"/v13/deployments?teamId={TEAM_ID}&skipAutoDetectionConfirmation=1",
                  "POST", body=payload, timeout=300)
    if st not in (200, 201, 202):
        sys.exit(f"สร้าง deployment ไม่สำเร็จ: HTTP {st} · {json.dumps(res, ensure_ascii=False)[:400]}")

    dep_id, url = res.get("id"), res.get("url")
    print(f"  id = {dep_id}\n  url = https://{url}\n")

    print("รอ build …")
    last = None
    while True:
        time.sleep(6)
        st, d = api(f"/v13/deployments/{dep_id}?teamId={TEAM_ID}")
        state = (d or {}).get("readyState") or (d or {}).get("status")
        if state != last:
            print(f"  {state}")
            last = state
        if state in ("READY", "ERROR", "CANCELED"):
            break
        if time.time() - t0 > 1800:
            print("  เกิน 30 นาที — หยุดรอ (build อาจยังทำงานอยู่)")
            break

    if state == "READY":
        print(f"\n✅ เสร็จแล้ว → https://{url}")
        if prod:
            print("   เป็น production แล้ว — เปิด https://division-x-card.vercel.app ได้เลย")
        else:
            print("   นี่คือ preview · ตรวจให้เรียบร้อยแล้วค่อยรันซ้ำด้วย --prod")
    else:
        print(f"\n❌ build ไม่ผ่าน ({state})")
        print("   ดู log: https://vercel.com/ → โปรเจกต์ → Deployments → ใบล่าสุด")
        print("   ⚠️ เว็บจริงยังเป็นตัวเดิม ไม่ได้เสียหาย — Vercel เปลี่ยนให้เฉพาะตอน build ผ่าน")
        sys.exit(1)


if __name__ == "__main__":
    main()
