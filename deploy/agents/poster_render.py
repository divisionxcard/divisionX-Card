"""สร้างโปสเตอร์คอนเทนต์จากข้อมูลจริง แล้วอัปขึ้น Supabase Storage

ทำไมต้องใช้เบราว์เซอร์จริง (ไม่ใช่ next/og / Satori):
  ทดสอบแล้ว Satori ทิ้งวรรณยุกต์เมื่อต้องซ้อนบนสระบน — "ที่" กลายเป็น "ที"
  ซึ่งเป็นคำที่อยู่ในแคปชั่นแทบทุกชิ้น · Chromium ทำ text shaping ถูกทุกเคส
  (ดู wiki/worklog/2026-08-08-thai-text-rendering.md)

หลักการ: **ตัวหนังสือและตัวเลขทุกตัวมาจากฐานข้อมูล ไม่ให้ AI เติมเอง**
  จำนวนสาขา = นับจากตาราง machines ที่ status=active จริง
  แคปชั่น = ที่คนอนุมัติแล้ว · รูปสินค้า = รูปจริงของ SKU
  AI มีหน้าที่แค่ทำพื้นหลัง (ถ้ามี) ไม่ได้เขียนอะไรลงในภาพ

รัน:
  python deploy/agents/poster_render.py --id 15
  python deploy/agents/poster_render.py --id 15 --dry-run   # เซฟลงเครื่อง ไม่อัป ไม่แก้ DB
  python deploy/agents/poster_render.py --id 15 --out x.png
"""
import argparse
import base64
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent                      # deploy/
TEMPLATE = ROOT / "tasks" / "poster_template.html"
FONT_DIR = ROOT / "public" / "fonts"

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
SB_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

BUCKET = "marketing"
SIZE = 1080


def load_env_file():
    """อ่าน deploy/.env.local ตอนรันบนเครื่อง — บน GitHub Actions ใช้ env จริง"""
    global SB_URL, SB_KEY
    if SB_URL and SB_KEY:
        return
    f = ROOT / ".env.local"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") and not SB_URL:
            SB_URL = v.strip()
        if k in ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY") and not SB_KEY:
            SB_KEY = v.strip()


def sb(method, path, body=None, raw=None, ctype=None, base="rest/v1"):
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
        data = json.dumps(body).encode()
    elif raw is not None:
        headers["Content-Type"] = ctype or "application/octet-stream"
        headers["x-upsert"] = "true"
        data = raw
    req = urllib.request.Request(f"{SB_URL}/{base}/{path}", method=method, headers=headers, data=data)
    with urllib.request.urlopen(req, timeout=60) as r:
        out = r.read()
    if not out:
        return []
    try:
        return json.loads(out)
    except Exception:
        return out


def data_uri(raw: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


def fetch_image(url):
    """ดึงรูปมาฝังเป็น data URI — ต้องฝังเพราะ set_content() ไม่ได้เสิร์ฟผ่านเว็บ
    รูปโหลดไม่ได้ก็ไม่ควรทำให้ทั้งงานล้ม แค่ไม่มีรูป"""
    if not url:
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
            mime = r.headers.get_content_type()
        if not raw or not mime.startswith("image/"):
            return None
        return data_uri(raw, mime)
    except Exception as e:
        print(f"[poster] โหลดรูปไม่ได้ ({str(e)[:60]}) — ข้ามไป")
        return None


# อีโมจิทำให้เกิดสี่เหลี่ยมบน ubuntu ของ GitHub Actions (ไม่มีฟอนต์อีโมจิสี)
# ตัดทิ้งตั้งแต่ต้นทาง ดีกว่าไปเจอตอนโพสต์แล้ว
EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF←-⇿⬀-⯿️‍]+"
)


def clean(s):
    return EMOJI.sub("", s or "").strip()


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# จุดจบประโยค — ใช้เป็นที่ตัดพาดหัว/บรรทัดรอง
SENT_END = re.compile(r"(?<=[!?！？])\s+|(?<=[!?！？])(?=\S)")


def split_caption(caption):
    """แยกแคปชั่นเป็น พาดหัว / รอง / เนื้อ / แฮชแท็ก

    บรรทัดแรกของแคปชั่นถูกเขียนมาให้เป็นตะขออยู่แล้ว (กฎในหลักการเขียน)
    ถ้ายาวเกินให้ห้อยท้ายเป็นบรรทัดรอง

    ⚠️ ห้ามตัดตามจำนวนตัวอักษรแล้วหาช่องว่างที่ใกล้ที่สุด — ภาษาไทยไม่เว้นวรรค
    ระหว่างคำ ช่องว่างที่เจอมักเป็นช่องว่าง "ในชื่อภาษาอังกฤษ" ผลคือตัดกลาง
    "One Piece" เป็น "...การ์ด One" / "Piece ไม่ใช่..." (เกิดจริงกับคอนเทนต์ #16)

    ตัดที่จุดจบประโยค (! ?) แทน ซึ่งเป็นขอบเขตความหมายจริง
    ถ้าไม่มีก็ปล่อยทั้งท่อนเป็นพาดหัวแล้วย่อฟอนต์เอา ดีกว่าตัดผิดที่
    """
    lines = [clean(l) for l in (caption or "").split("\n")]
    lines = [l for l in lines if l]
    tags = [l for l in lines if l.startswith("#")]
    body_lines = [l for l in lines if not l.startswith("#")]

    head = body_lines[0] if body_lines else ""
    sub = ""
    if len(head) > 42:
        parts = [p for p in SENT_END.split(head) if p and p.strip()]
        if len(parts) > 1 and len(parts[0].strip()) >= 12:
            head, sub = parts[0].strip(), " ".join(p.strip() for p in parts[1:])
    rest = body_lines[1:]
    return head, sub, rest, " ".join(tags)


def head_size(text):
    """ย่อฟอนต์พาดหัวตามความยาว — พาดหัวที่ตัดไม่ได้ต้องยังอยู่ในกรอบ"""
    n = len(text)
    if n <= 28:
        return 82
    if n <= 40:
        return 74
    if n <= 55:
        return 64
    return 56


# เน้นสีที่ "ตัวเลขและรหัสชุด" เท่านั้น — ไม่ใช่เลือกคำท้ายมั่ว ๆ
#
# ลองแบบเน้น 2 คำท้ายแล้วได้ผลแย่: พาดหัว "...ตัวเด็ด OP16 ที่เขาว่าแพง!" กลายเป็นเน้น
# "OP16 ที่" ซึ่งไม่ใช่หน่วยความหมาย แถมคร่อมบรรทัดจนดูเหมือนจัดหน้าพัง
# ตัวเลข/รหัสชุดเป็นสิ่งที่สายตาจับอยู่แล้วโดยธรรมชาติ เน้นตรงนั้นจึงดูตั้งใจ
HILITE = re.compile(
    r"("
    r"\b(?:OP|EB|PRB|FB|NRT|PKM|YGH|SLL|MLBB)[\s\-]?\d+\b"   # รหัสชุด
    r"|\b\d[\d,\.]*%?\b"                                      # ตัวเลข
    r")",
    re.IGNORECASE,
)


def highlight(text):
    parts = HILITE.split(esc(text))
    out = ""
    for i, p in enumerate(parts):
        out += f"<em>{p}</em>" if i % 2 == 1 else p
    return out


def build_html(content, sku_img, bg_img, branches):
    tpl = TEMPLATE.read_text(encoding="utf-8")
    reg = data_uri((FONT_DIR / "Sarabun-Regular.ttf").read_bytes(), "font/ttf")
    bold = data_uri((FONT_DIR / "Sarabun-Bold.ttf").read_bytes(), "font/ttf")

    head, sub, rest, tags = split_caption(content.get("caption"))
    head_html = highlight(head)

    hero = f'<img src="{sku_img}">' if sku_img else ""
    body = "".join(f"<p>{esc(l)}</p>" for l in rest)

    return (tpl
            .replace("{{FONT_REGULAR}}", reg)
            .replace("{{FONT_BOLD}}", bold)
            .replace("{{HEADLINE}}", head_html)
            .replace("{{SUB}}", esc(sub))
            .replace("{{BODY}}", body)
            .replace("{{HERO}}", hero)
            .replace("{{HERO_CLASS}}", "" if sku_img else "empty")
            .replace("{{WRAP_CLASS}}", "" if sku_img else "no-hero")
            .replace("{{BG}}", bg_img or "")
            .replace("{{HEAD_SIZE}}", str(head_size(head)))
            .replace("{{BRANCHES}}", str(branches))
            .replace("{{TAGS}}", esc(tags)))


def render(html, out_path):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--force-color-profile=srgb"])
        pg = b.new_page(viewport={"width": SIZE, "height": SIZE}, device_scale_factor=2)
        pg.set_content(html, wait_until="load")
        pg.wait_for_timeout(600)          # เผื่อฟอนต์/รูป data URI วาดเสร็จ
        pg.screenshot(path=out_path, type="png")
        b.close()


def main():
    ap = argparse.ArgumentParser(description="สร้างโปสเตอร์คอนเทนต์จากข้อมูลจริง")
    ap.add_argument("--id", type=int, required=True, help="id ของ marketing_content")
    ap.add_argument("--dry-run", action="store_true", help="เซฟลงเครื่องอย่างเดียว ไม่อัป ไม่แก้ DB")
    ap.add_argument("--out", help="ที่เก็บไฟล์ตอน dry-run")
    ap.add_argument("--sku", help="บังคับ SKU ที่จะเอารูปมาใช้ (สำหรับลองดีไซน์)")
    args = ap.parse_args()

    load_env_file()
    if not SB_URL or not SB_KEY:
        print("[poster] ไม่มี SUPABASE_URL / SERVICE KEY — ตรวจ deploy/.env.local")
        sys.exit(1)

    rows = sb("GET", f"marketing_content?id=eq.{args.id}&select=*")
    if not rows:
        print(f"[poster] ไม่พบคอนเทนต์ id={args.id}")
        sys.exit(1)
    content = rows[0]

    # จำนวนสาขา = นับจากของจริง ไม่ใช่เลขที่ใครพิมพ์ไว้
    machines = sb("GET", "machines?status=eq.active&select=machine_id")
    branches = len(machines)

    sku_id = args.sku or content.get("source_sku")
    sku_img = None
    if sku_id:
        s = sb("GET", "skus?sku_id=eq." + urllib.parse.quote(sku_id) + "&select=image_url,image_url_box")
        if s:
            sku_img = fetch_image(s[0].get("image_url") or s[0].get("image_url_box"))

    # พื้นหลังจาก AI — ใช้ media_url เดิมถ้ามันเป็นภาพที่ AI สร้างไว้ (ไม่ใช่รูปสินค้า)
    bg_img = None
    mu = content.get("media_url") or ""
    if "/marketing/" in mu:
        bg_img = fetch_image(mu)

    html = build_html(content, sku_img, bg_img, branches)
    out = args.out or str(HERE / f"poster-{args.id}.png")
    render(html, out)
    size = pathlib.Path(out).stat().st_size
    print(f"[poster] เรนเดอร์เสร็จ {out} ({size/1024:.0f} KB) · สาขา={branches} · "
          f"รูปสินค้า={'มี' if sku_img else 'ไม่มี'} · พื้นหลัง AI={'มี' if bg_img else 'ไม่มี'}")

    if args.dry_run:
        print("[poster] dry-run — ไม่อัปโหลด ไม่แก้ DB")
        return

    raw = pathlib.Path(out).read_bytes()
    import time
    key = f"poster/{args.id}-{int(time.time())}.png"
    sb("POST", f"{BUCKET}/{key}", raw=raw, ctype="image/png", base="storage/v1/object")
    url = f"{SB_URL}/storage/v1/object/public/{BUCKET}/{key}"
    sb("PATCH", f"marketing_content?id=eq.{args.id}", {"media_url": url, "media_type": "image"})
    print(f"[poster] อัปโหลดแล้ว → {url}")


if __name__ == "__main__":
    main()
