"""สร้าง "คลังฉาก" ด้วย FLUX รวดเดียว แล้วให้คนคัดก่อนเอาไปใช้จริง

ทำไมต้องทำเป็นคลัง ไม่สร้างสดตอนกดปุ่ม:
    วัดจริงบน RTX 3050 6GB → **586 วินาที/ภาพ** (9.8 นาที) แม้โมเดลอยู่ในแคชแล้ว
    การ์ด 6 GB ต้องสลับโมเดล 6.5 GB เข้า-ออก GPU ทุกสเต็ป (~145 วิ × 4 สเต็ป)
    กดปุ่มแล้วรอ 10 นาที = UX ที่ใช้ไม่ได้

    แต่เราไม่ได้ต้องการพื้นหลัง "ไม่ซ้ำกันทุกโพสต์" — ต้องการพื้นหลัง "สวยและตรงแบรนด์"
    สร้างไว้ล่วงหน้า 15-20 ใบ แล้วให้เทมเพลตหยิบ → รอ 2 วินาที ต้นทุนเท่าเดิม (ศูนย์)

ข้อดีที่สำคัญกว่าความเร็ว:
    **คนได้ตรวจทุกใบก่อนเข้าคลัง** ใบไหนไม่สวยก็ทิ้ง
    ต่างจากสร้างสดที่ต้องลุ้นว่าจะออกมาใช้ได้ไหมตอนกำลังจะโพสต์

รัน:
    python deploy/agents/scene_batch.py --n 6          # สร้างลงเครื่อง ให้คนดูก่อน
    python deploy/agents/scene_batch.py --upload a1 b2 # อัปเฉพาะใบที่ผ่านเข้าคลัง
    python deploy/agents/scene_batch.py --list         # ดูว่าในคลังมีอะไรบ้าง
"""
import argparse
import json
import os
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT_DIR = ROOT / ".scenes"          # ที่พักก่อนคัด — อยู่ใน .gitignore
BUCKET = "marketing"
AIBG_PREFIX = "aibg/"               # โฟลเดอร์ที่ poster_render.resolve_bg ยอมรับ

sys.path.insert(0, str(HERE))
from local_image import SCENES, generate, load_env   # noqa: E402


def sb_request(method, path, data=None, ctype=None, base="rest/v1"):
    url = f"{os.environ['SUPABASE_URL'].rstrip('/')}/{base}/{path}"
    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_KEY']}",
    }
    if ctype:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def env_supabase():
    """สคริปต์อื่นใช้ชื่อตัวแปรไม่ตรงกัน — รับได้ทั้งสองแบบ"""
    if not os.environ.get("SUPABASE_URL"):
        os.environ["SUPABASE_URL"] = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    if not os.environ.get("SUPABASE_SERVICE_KEY"):
        os.environ["SUPABASE_SERVICE_KEY"] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"))


def do_batch(n, size):
    """สร้าง n ใบ วนไปตามสไตล์ที่มี แล้วเปลี่ยน seed ทุกใบ

    วนสไตล์แทนการสุ่ม — จะได้คลังที่กระจายครบทุกแนว ไม่ใช่ได้แนวเดียว 6 ใบเพราะสุ่มซ้ำ
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    keys = sorted(SCENES)
    w, h = (int(x) for x in size.lower().split("x"))
    made = []
    for i in range(n):
        k = keys[i % len(keys)]
        seed = 1000 + i
        name = f"{k}-{seed}.png"
        out = OUT_DIR / name
        if out.exists():
            print(f"[{i+1}/{n}] ข้าม {name} (มีอยู่แล้ว)")
            made.append(out)
            continue
        print(f"[{i+1}/{n}] {k} seed={seed} …")
        generate(SCENES[k], str(out), w, h, seed)
        made.append(out)
    print(f"\nเสร็จ {len(made)} ใบ → {OUT_DIR}")
    print("ดูแล้วเลือกใบที่ผ่าน แล้วสั่ง:")
    print(f"  python {pathlib.Path(__file__).relative_to(ROOT.parent)} --upload {keys[0]}-1000 ...")
    return made


def do_upload(names):
    if not env_supabase():
        sys.exit("[scene] ไม่มี SUPABASE_URL / SERVICE KEY")
    ok = 0
    for n in names:
        f = OUT_DIR / (n if n.endswith(".png") else f"{n}.png")
        if not f.exists():
            print(f"  ✗ ไม่เจอไฟล์ {f.name}")
            continue
        key = f"{AIBG_PREFIX}{f.name}"
        sb_request("POST", f"{BUCKET}/{key}", data=f.read_bytes(),
                   ctype="image/png", base="storage/v1/object")
        print(f"  ✓ {f.name} → {BUCKET}/{key}")
        ok += 1
    print(f"[scene] เข้าคลังแล้ว {ok} ใบ — เทมเพลตจะเริ่มหยิบไปใช้ทันที")


def do_list():
    if not env_supabase():
        sys.exit("[scene] ไม่มี SUPABASE_URL / SERVICE KEY")
    body = json.dumps({"prefix": AIBG_PREFIX, "limit": 200}).encode()
    raw = sb_request("POST", f"list/{BUCKET}", data=body,
                     ctype="application/json", base="storage/v1/object")
    items = [x for x in json.loads(raw) if x.get("name", "").endswith(".png")]
    print(f"[scene] ในคลังมี {len(items)} ใบ")
    for x in items:
        mb = (x.get("metadata") or {}).get("size", 0) / 1024 / 1024
        print(f"   {x['name']}  ({mb:.1f} MB)")


def main():
    ap = argparse.ArgumentParser(description="สร้าง/จัดการคลังฉากพื้นหลัง")
    ap.add_argument("--n", type=int, default=6, help="สร้างกี่ใบ")
    ap.add_argument("--size", default="1024x1024")
    ap.add_argument("--upload", nargs="*", help="ชื่อไฟล์ที่ผ่านการคัดแล้ว (ไม่ต้องใส่ .png)")
    ap.add_argument("--list", action="store_true", help="ดูว่าในคลังมีอะไร")
    args = ap.parse_args()

    load_env()
    if args.list:
        return do_list()
    if args.upload is not None:
        return do_upload(args.upload)
    do_batch(args.n, args.size)


if __name__ == "__main__":
    main()
