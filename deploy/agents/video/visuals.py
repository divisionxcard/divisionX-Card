"""เลือกและเตรียมภาพให้แต่ละฉาก

ลำดับความน่าเชื่อถือของภาพ — เรียงจากดีที่สุดลงมา:

    1. รูปถ่ายจริงของตู้และซองเรา   ← ของที่ไม่มีใครมีนอกจากเรา
    2. ฉากที่ FLUX วาดบนเครื่อง      ← บรรยากาศ แสง พื้นผิว
    3. ภาพสต็อก                      ← ทางเลือกสุดท้าย

บทเรียนที่แลกมาด้วยของจริง (9 ก.ย. 2026): ลอง Hero AI Studio แล้วมันไปหยิบ
ภาพสต็อก `modern hospital lobby` `patient receiving prescription hand` มาให้
ทั้งคลิป เพราะตัวแปลงคำค้นตีความคำว่า "ซอง" เป็นซองยา และ "ตู้" เป็นเครื่องจ่ายยา
ส่วนภาพที่ AI วาดเองก็ได้ตู้น้ำอัดลมกับผู้ชายใส่สูท

    → คลังสต็อกและโมเดลทั่วไป **ไม่รู้จักสินค้าเรา** ไม่ว่าจะจ่ายแพงแค่ไหน
      ความสมจริงมาจากรูปถ่ายของจริง ไม่ได้มาจากการ์ดจอที่ใหญ่ขึ้น

รูปแบบที่ระบุแหล่งภาพได้:
    machine:hero | machine:scene    รูปตู้จริงที่ถ่ายไว้
    sku:OP 17                       รูปซอง/กล่องจริงของสินค้านั้นจาก Supabase
    file:C:\\path\\to\\clip.jpg      ภาพหรือเฟรมที่ถ่ายเอง (ดีที่สุด)
    flux:คำสั่งวาดฉาก                ให้ FLUX วาดบนเครื่อง
"""
import io
import json
import pathlib
import urllib.parse
import urllib.request

from . import config

BRAND_BG = (10, 26, 58)          # กรมท่า — พื้นหลังเวลาไม่มีอะไรดีกว่านี้


# ── หาไฟล์ต้นทางตามที่ระบุ ──────────────────────────────────────────────
def resolve(spec, cache_dir):
    """แปลง spec เป็น path ของไฟล์ภาพต้นทาง (ยังไม่ได้ปรับขนาด)"""
    cache_dir = pathlib.Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    if spec.startswith("file:"):
        p = pathlib.Path(spec[5:])
        if not p.exists():
            raise FileNotFoundError(f"ไม่พบไฟล์ภาพ: {p}")
        return p

    if spec.startswith("machine:"):
        which = spec.split(":", 1)[1]
        for ext in (".jpg", ".png"):
            p = config.MACHINE_DIR / f"machine-{which}{ext}"
            if p.exists():
                return p
        raise FileNotFoundError(
            f"ไม่มีรูปตู้ machine-{which} ใน {config.MACHINE_DIR}")

    if spec.startswith("sku:"):
        return _sku_image(spec.split(":", 1)[1], cache_dir)

    if spec.startswith("flux:"):
        return _flux(spec.split(":", 1)[1], cache_dir)

    p = pathlib.Path(spec)
    if p.exists():
        return p
    raise ValueError(f"ไม่รู้จักแหล่งภาพ: {spec}")


def _sku_image(sku_id, cache_dir):
    """ดึงรูปซอง/กล่องจริงของสินค้าจาก Supabase (รูปพวกนี้ได้สิทธิ์ใช้แล้ว)"""
    url = config.env("NEXT_PUBLIC_SUPABASE_URL")
    key = config.env("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise RuntimeError("ไม่มีคีย์ Supabase ใน deploy/.env.local")
    q = urllib.parse.quote(sku_id)
    req = urllib.request.Request(
        f"{url}/rest/v1/skus?sku_id=eq.{q}&select=image_url,image_url_box",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))
    if not rows:
        raise ValueError(f"ไม่มี SKU ชื่อ {sku_id}")
    img = rows[0].get("image_url") or rows[0].get("image_url_box")
    if not img:
        raise ValueError(f"SKU {sku_id} ยังไม่มีรูป")
    out = cache_dir / f"sku_{sku_id.replace(' ', '_')}.png"
    if not out.exists():
        with urllib.request.urlopen(img, timeout=60) as r:
            out.write_bytes(r.read())
    return out


def _flux(prompt, cache_dir):
    """ให้ FLUX บนเครื่องวาดฉาก — เรียกผ่าน local_image.py ที่มีอยู่แล้ว

    ⚠️ ห้ามสั่งให้มันวาดตู้หรือซองของเรา มันจะแต่งสินค้าปลอมขึ้นมา
       ใช้วาดแค่ฉาก/บรรยากาศ/พื้นผิว แล้วเอารูปจริงไปวางทับ
    """
    import hashlib
    import subprocess
    import sys

    h = hashlib.sha1(prompt.encode("utf-8")).hexdigest()[:12]
    out = cache_dir / f"flux_{h}.png"
    if out.exists():
        return out
    script = config.ROOT / "agents" / "local_image.py"
    p = subprocess.run([sys.executable, str(script), "--prompt", prompt,
                        "--out", str(out)],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace")
    if p.returncode != 0 or not out.exists():
        tail = "\n".join((p.stderr or "").strip().splitlines()[-8:])
        raise RuntimeError(f"FLUX วาดภาพไม่สำเร็จ:\n{tail}")
    return out


# ── ปรับให้เป็นเฟรม 9:16 ────────────────────────────────────────────────
def to_frame(src, out_png, blur_fill=True):
    """ภาพขนาดใดก็ได้ → 1080×1920

    ภาพที่สัดส่วนไม่ตรง (เช่นรูปซองที่เป็นแนวตั้งผอม ๆ หรือรูปตู้แนวนอน)
    จะวางตรงกลางแล้วเติมพื้นหลังด้วยตัวมันเองที่เบลอ — ดีกว่าครอปทิ้งจนสินค้าขาด
    และดีกว่าแถบดำที่ทำให้คลิปดูเหมือนงานไม่เสร็จ
    """
    from PIL import Image, ImageFilter

    im = Image.open(src).convert("RGB")
    tw, th = config.W, config.H
    scale = min(tw / im.width, th / im.height)
    cover = max(tw / im.width, th / im.height)

    if cover / scale < 1.35 or not blur_fill:
        # สัดส่วนใกล้เคียงพออยู่แล้ว — ครอปเต็มจอ ได้ภาพคมกว่า
        w, h = int(im.width * cover + 0.5), int(im.height * cover + 0.5)
        big = im.resize((w, h), Image.LANCZOS)
        canvas = big.crop(((w - tw) // 2, (h - th) // 2,
                           (w - tw) // 2 + tw, (h - th) // 2 + th))
    else:
        w, h = int(im.width * cover + 0.5), int(im.height * cover + 0.5)
        bg = im.resize((w, h), Image.LANCZOS)
        bg = bg.crop(((w - tw) // 2, (h - th) // 2,
                      (w - tw) // 2 + tw, (h - th) // 2 + th))
        bg = bg.filter(ImageFilter.GaussianBlur(38))
        dark = Image.new("RGB", (tw, th), BRAND_BG)
        bg = Image.blend(bg, dark, 0.28)          # หรี่พื้นหลังให้ซับอ่านออก
        fw, fh = int(im.width * scale + 0.5), int(im.height * scale + 0.5)
        fg = im.resize((fw, fh), Image.LANCZOS)
        bg.paste(fg, ((tw - fw) // 2, (th - fh) // 2))
        canvas = bg

    out_png = pathlib.Path(out_png)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_png)
    return out_png


def prepare(specs, work):
    """รายการ spec → รายการไฟล์ภาพ 9:16 พร้อมใช้"""
    work = pathlib.Path(work)
    cache = work / "src"
    frames = work / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    out = []
    for i, spec in enumerate(specs):
        src = resolve(spec, cache)
        out.append(to_frame(src, frames / f"frame_{i:03d}.png"))
    return out
