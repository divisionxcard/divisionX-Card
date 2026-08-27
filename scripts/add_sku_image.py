"""เพิ่มรูปซอง/กล่องให้ SKU — แปลงเป็นรูปแบบเดียวกับที่มีอยู่แล้ว 45 ตัว แล้วอัปโหลด

รัน:
    py -3 scripts/add_sku_image.py --sku "OP 17" --pack ซอง.png --box กล่อง.png
    py -3 scripts/add_sku_image.py --sku "OP 17" --pack ซอง.png --box กล่อง.png --apply

ไม่ใส่ --apply = แปลงให้ดูอย่างเดียว ไม่แตะฐานข้อมูล (ไฟล์ผลลัพธ์วางไว้ข้าง ๆ ต้นฉบับ)

รูปแบบเป้าหมาย (วัดจาก OP16-pack.webp / OP16-box.webp ที่ใช้งานจริง):
    1024x1024 · WebP · พื้นหลังโปร่งใส · สินค้าไดคัทสูงราว 90% ของเฟรม

⚠️ ทำไมต้องโปร่งใส: รูปพวกนี้ถูกส่งให้โมเดลภาพเป็น "ภาพอ้างอิงที่ต้องลอกตรง ๆ"
   ถ้าติดพื้นขาวมาด้วย โมเดลจะลอกกรอบขาวไปวางบนโปสเตอร์พื้นกรมท่าด้วย

⚠️ ห้ามใช้กับรูปหน้าการ์ด — สิทธิ์ครอบคลุมแค่รูปซอง/กล่อง
"""
import argparse
import io
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUCKET = "sku-images"
CANVAS = 1024
FILL = 0.90          # สินค้าสูงกี่ส่วนของเฟรม — 0.90 ตรงกับ OP16 ที่ใช้อยู่
WHITE_CUT = 236      # สว่างเกินนี้และจืด = ถือเป็นพื้นหลัง
SAT_CUT = 26         # ต่างระหว่างช่องสีสูงสุด-ต่ำสุด ต่ำกว่านี้ = สีจืด (ขาว/เทา)


def load_env():
    env = {}
    for line in (ROOT / "deploy" / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def cut_background(im):
    """ตัดพื้นขาวออกให้โปร่งใส — เฉพาะส่วนที่ต่อกับขอบภาพ

    ⚠️ ต้องเช็ก "ต่อกับขอบ" ไม่ใช่ตัดขาวทั้งภาพ ไม่งั้นตัวหนังสือขาวบนซอง
       (ONE PIECE / CARD GAME) กับกรอบเงินของซองจะโดนเจาะเป็นรูไปด้วย
    """
    im = im.convert("RGBA")
    a = np.asarray(im).astype(np.int16)
    rgb = a[:, :, :3]
    light = rgb.min(axis=2) >= WHITE_CUT
    flat = (rgb.max(axis=2) - rgb.min(axis=2)) <= SAT_CUT
    bg_like = light & flat

    # ลามจากขอบเข้ามา — เอาเฉพาะพื้นขาวที่เชื่อมถึงขอบภาพ
    h, w = bg_like.shape
    seen = np.zeros_like(bg_like)
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if bg_like[y, x]:
                stack.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg_like[y, x]:
                stack.append((y, x))
    while stack:
        y, x = stack.pop()
        if seen[y, x] or not bg_like[y, x]:
            continue
        seen[y, x] = True
        if y > 0:     stack.append((y - 1, x))
        if y < h - 1: stack.append((y + 1, x))
        if x > 0:     stack.append((y, x - 1))
        if x < w - 1: stack.append((y, x + 1))

    out = np.asarray(im).copy()
    out[:, :, 3] = np.where(seen, 0, out[:, :, 3])
    return Image.fromarray(out, "RGBA")


def to_canvas(im):
    """วางสินค้ากลางผืน 1024x1024 โปร่งใส สูงราว 90% ของเฟรม"""
    bb = im.split()[3].getbbox()
    if not bb:
        raise SystemExit("ตัดพื้นหลังแล้วไม่เหลืออะไรเลย — รูปต้นฉบับอาจไม่ใช่พื้นขาว")
    crop = im.crop(bb)
    target_h = int(CANVAS * FILL)
    scale = target_h / crop.height
    if crop.width * scale > CANVAS * FILL:      # ของแนวนอนอย่างกล่องต้องคุมความกว้างด้วย
        scale = CANVAS * FILL / crop.width
    new = crop.resize((max(1, round(crop.width * scale)),
                       max(1, round(crop.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(new, ((CANVAS - new.width) // 2, (CANVAS - new.height) // 2), new)
    return canvas


def process(path):
    src = Image.open(path)
    cut = cut_background(src)
    out = to_canvas(cut)
    bb = out.split()[3].getbbox()
    pct = (bb[2] - bb[0]) * (bb[3] - bb[1]) / (CANVAS * CANVAS) * 100
    buf = io.BytesIO()
    out.save(buf, "WEBP", quality=92, method=6)
    return out, buf.getvalue(), f"{bb[2]-bb[0]}x{bb[3]-bb[1]} px ({pct:.0f}% ของเฟรม)"


def upload(env, name, blob):
    req = urllib.request.Request(
        f"{env['NEXT_PUBLIC_SUPABASE_URL']}/storage/v1/object/{BUCKET}/{name}",
        data=blob, method="POST",
        headers={"Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
                 "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
                 "Content-Type": "image/webp", "x-upsert": "true"})
    urllib.request.urlopen(req, timeout=120).read()
    return f"{env['NEXT_PUBLIC_SUPABASE_URL']}/storage/v1/object/public/{BUCKET}/{name}"


def patch_sku(env, sku_id, fields):
    q = "skus?sku_id=eq." + urllib.parse.quote(sku_id)
    req = urllib.request.Request(
        f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{q}",
        data=json.dumps(fields).encode(), method="PATCH",
        headers={"Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
                 "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
                 "Content-Type": "application/json",
                 "Prefer": "return=representation"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sku", required=True, help='เช่น "OP 17"')
    ap.add_argument("--pack", help="ไฟล์รูปซอง (พื้นขาว)")
    ap.add_argument("--box", help="ไฟล์รูปกล่อง (พื้นขาว)")
    ap.add_argument("--slug", help="ชื่อไฟล์บน storage เช่น OP17 (ไม่ใส่จะเดาจาก sku)")
    ap.add_argument("--apply", action="store_true", help="อัปโหลดจริงและอัปเดตฐานข้อมูล")
    args = ap.parse_args()

    if not args.pack and not args.box:
        raise SystemExit("ต้องระบุอย่างน้อย --pack หรือ --box")

    slug = args.slug or args.sku.replace(" ", "").replace("-", "").upper()
    env = load_env()
    jobs = [(k, v) for k, v in (("pack", args.pack), ("box", args.box)) if v]

    fields, previews = {}, []
    for kind, path in jobs:
        p = pathlib.Path(path)
        if not p.exists():
            raise SystemExit(f"ไม่พบไฟล์: {p}")
        img, blob, dims = process(p)
        name = f"{slug}-{kind}.webp"
        prev = p.with_name(f"{p.stem}.pre-{kind}.webp")
        prev.write_bytes(blob)
        previews.append(prev)
        print(f"  {kind:<5} {p.name}")
        print(f"        → {name}  {len(blob)//1024} KB · สินค้า {dims}")
        print(f"        ดูผลก่อนอัปโหลดได้ที่ {prev}")
        if args.apply:
            url = upload(env, name, blob)
            fields["image_url" if kind == "pack" else "image_url_box"] = url

    if not args.apply:
        print("\n(ยังไม่อัปโหลด — เปิดไฟล์ .pre-*.webp ดูก่อน ถ้าโอเคค่อยใส่ --apply)")
        return

    row = patch_sku(env, args.sku, fields)
    if not row:
        raise SystemExit(f"อัปโหลดแล้วแต่ไม่พบ SKU '{args.sku}' ในฐานข้อมูล — ตรวจชื่อ")
    print(f"\n✅ {args.sku} อัปเดตแล้ว")
    for k in ("image_url", "image_url_box"):
        if row[0].get(k):
            print(f"   {k}: ...{row[0][k][-34:]}")
    for prev in previews:
        prev.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
