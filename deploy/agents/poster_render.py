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
import random
import re
import sys
import urllib.parse
import urllib.request
import _console  # noqa: F401 — บังคับ stdout เป็น UTF-8 ต้องมาก่อน print แรก

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent                      # deploy/
TEMPLATE = ROOT / "tasks" / "poster_template.html"
CONCEPTS_FILE = ROOT / "tasks" / "poster_concepts.json"
CONCEPT_CSS_DIR = ROOT / "tasks" / "concept_css"
FONT_DIR = ROOT / "public" / "fonts"

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
SB_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

BUCKET = "marketing"
SIZE = 1080

# โฟลเดอร์เดียวที่ยอมให้เอามาเป็น "พื้นหลังฉาก" ได้ — ดู resolve_bg()
AI_BG_DIR = "/marketing/aibg/"


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

# ── ตัดพาดหัวไทยให้เป็น 2 บรรทัด ─────────────────────────────
# ภาษาไทยไม่เว้นวรรคระหว่างคำ จึงตัดตามจำนวนตัวอักษรไม่ได้
# แต่ **ใช้ช่องว่างที่ขอบเขตวลี** → ช่องว่างที่มีอักษรไทยประกบสองข้าง
# คือขอบเขตวลีจริง ตัดได้ปลอดภัย ส่วนช่องว่างที่ติดอักษรละตินอาจอยู่กลางชื่อ
# ('One Piece' → 'One' / 'Piece' เกิดจริงกับคอนเทนต์ #16) จึงห้ามแตะ
THAI_CH = r"฀-๿"

# คำที่ขึ้นต้นอนุประโยคใหม่ — ตัด "ก่อน" คำพวกนี้
# ⚠️ ต้องมีช่องว่างนำหน้าเสมอ (บังคับใน BREAKS) เพราะไทยไม่มีขอบเขตคำ
#    ถ้าไม่บังคับ 'แต่' จะไปโผล่กลาง 'ตั้งแต่' แล้วตัดเป็น
#    'แฟ้มในมือสั่นตั้ง' / 'แต่ดึงซอง...' — เกิดจริงตอนทดสอบกับคอนเทนต์ #36
# ⚠️ ห้ามใส่คำที่เป็น "หาง" ของวลี เช่น 'เลยว่า' (หางของ 'บอกเลยว่า')
CONJ = ("แต่", "เพราะ", "จนกว่า", "จนถึง", "จน", "แล้ว", "ถ้า", "หาก",
        "ซึ่ง", "จึง", "พอ", "ก่อนที่", "หลังจาก")

HEAD_SPLIT_AT = 42        # สั้นกว่านี้ไม่ต้องตัด
HEAD_MIN, HEAD_MAX = 14, 56


def _break_points(s):
    """จุดตัดที่เป็นไปได้ → [(ตำแหน่ง, ลำดับความสำคัญ)] เลขน้อย = เป็นขอบเขตที่ชัดกว่า"""
    out = []
    for m in re.finditer(r"[!?。！？]\s*", s):                       # จบประโยคจริง
        out.append((m.end(), 1))
    for m in re.finditer(r"\s*[—–·:：…]\s*", s):                    # เครื่องหมายคั่นความคิด
        out.append((m.end(), 2))
    for m in re.finditer(rf"(?<=[{THAI_CH}])\s+(?=[{THAI_CH}])", s):  # ขอบเขตวลีไทย
        out.append((m.end(), 3))
    for c in CONJ:
        for m in re.finditer(rf"(?<=\s){re.escape(c)}", s):        # คำเชื่อม (ต้องมีช่องว่างนำ)
            if m.start() > 0:
                out.append((m.start(), 4))
    return out


def split_head(head):
    """แยกพาดหัวยาวเป็น (พาดหัว, บรรทัดรอง) — ตัดไม่ได้ก็คืน (head, '')

    เลือกจุดตัดที่ (1) เป็นขอบเขตชัดที่สุด (2) ไม่ทำให้พาดหัวเกิน HEAD_MAX
    (3) ได้พาดหัวยาวใกล้ 40 ตัวที่สุด
    """
    head = (head or "").strip()
    if len(head) <= HEAD_SPLIT_AT:
        return head, ""
    cands = []
    for pos, pri in _break_points(head):
        a, b = head[:pos].strip(), head[pos:].strip()
        if len(a) < HEAD_MIN or len(b) < 6:
            continue
        cands.append((pri, max(0, len(a) - HEAD_MAX), abs(len(a) - 40), pos, a, b))
    if not cands:
        return head, ""
    cands.sort()
    return cands[0][4], cands[0][5]

# ความยาวสูงสุดของบรรทัดเนื้อหาที่ยอมให้ขึ้นภาพ — ยาวกว่านี้อ่านไม่ออกบนฟีดมือถือ
BODY_MAX = 80


def split_caption(caption):
    """แยกแคปชั่นเป็น พาดหัว / รอง / เนื้อ / แฮชแท็ก

    บรรทัดแรกของแคปชั่นถูกเขียนมาให้เป็นตะขออยู่แล้ว (กฎในหลักการเขียน)
    ถ้ายาวเกินให้ห้อยท้ายเป็นบรรทัดรอง

    ⚠️ ห้ามตัดตามจำนวนตัวอักษรแล้วหาช่องว่างที่ใกล้ที่สุด — ภาษาไทยไม่เว้นวรรค
    ระหว่างคำ ช่องว่างที่เจอมักเป็นช่องว่าง "ในชื่อภาษาอังกฤษ" ผลคือตัดกลาง
    "One Piece" เป็น "...การ์ด One" / "Piece ไม่ใช่..." (เกิดจริงกับคอนเทนต์ #16)

    ตัดที่ขอบเขตความหมายจริงเท่านั้น ถ้าหาไม่เจอก็ปล่อยทั้งท่อนแล้วย่อฟอนต์เอา

    ⚠️ เดิมตัดได้แค่ที่ ! ? ซึ่งไม่พอ — วัดจากคอนเทนต์จริง 34 ชิ้นพบว่า
    **พาดหัวยาวเกิน 42 ตัวถึงครึ่งหนึ่งไม่มี ! ? เลย** จึงตัดไม่ได้
    กลายเป็นพาดหัวไทย 5-6 บรรทัดในคอลัมน์แคบ ซึ่งคือหน้าตา "ล้าสมัย" ที่เจ้าของทัก
    ตอนนี้เหลือตัดไม่ได้ 4 จาก 34 และทั้ง 4 เป็นประโยคเดียวยาวจริง ๆ
    """
    lines = [clean(l) for l in (caption or "").split("\n")]
    lines = [l for l in lines if l]
    tags = [l for l in lines if l.startswith("#")]
    body_lines = [l for l in lines if not l.startswith("#")]

    head, sub = split_head(body_lines[0] if body_lines else "")
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


# คำทับศัพท์ที่พจนานุกรมไทยของ Chromium ตัดผิด
#
# ไทยไม่มีช่องว่างระหว่างคำ เบราว์เซอร์จึงตัดบรรทัดด้วยพจนานุกรม ICU
# คำที่ยืมมาจากอังกฤษไม่มีในพจนานุกรม มันเลยเดาเอง แล้วเดาผิด:
#   "พาวเวอร์" → "พา / วเวอร์"    (เจอจริงบนโปสเตอร์ #25)
#   "ลีดเดอร์" → "ลี / ดเดอร์"
#
# CSS แก้ไม่ได้ — เทมเพลตจดไว้แล้วว่า text-wrap:pretty กับ word-break:keep-all
# ไม่ได้ผล (ดูคอมเมนต์ใน poster_tpl_stage.html) ทางที่ได้ผลคือห้ามตัดเป็นคำ ๆ ไป
#
# เติมคำใหม่ได้เรื่อย ๆ — ถ้าเห็นคำไหนถูกตัดกลางคำบนโปสเตอร์ ใส่เพิ่มตรงนี้
NO_BREAK_WORDS = [
    # ศัพท์เกมการ์ดที่ใช้บ่อยสุด
    "พาวเวอร์", "ลีดเดอร์", "คาแรกเตอร์", "บล็อกเกอร์", "ทริกเกอร์", "เคาน์เตอร์",
    "ดาเมจ", "เบนช์", "เทรนเนอร์", "อีเวนต์", "สเตจ", "แบทเทิล", "เอฟเฟกต์",
    "รีเฟรช", "เอนด์เฟส", "เมนเฟส", "โปเกมอน", "โปเกเด็กซ์", "วิวัฒนาการ",
    # คำที่ใช้ในโพสต์ขายบ่อย
    "บูสเตอร์", "พาราเรล", "ซีเคร็ต", "โปรโมชั่น", "คอลเลกชัน", "ดิสเพลย์",
]
# ยาวก่อนสั้น กันคำสั้นไปตัดกลางคำยาว (เช่น "สเตจ" อยู่ใน "เอนด์เฟส"? ไม่ แต่กันไว้)
NO_BREAK_WORDS.sort(key=len, reverse=True)


def keep_words_whole(html):
    """ครอบคำทับศัพท์ด้วย <span class="nb"> เพื่อห้ามเบราว์เซอร์ตัดกลางคำ

    ทำ *หลัง* esc() แล้ว และก่อนแทนลงเทมเพลต — ตัวคำเป็นอักษรไทยล้วน
    ไม่มีอักขระที่ต้อง escape จึงไม่ชนกับ &amp; ที่ esc() สร้างไว้
    """
    for w in NO_BREAK_WORDS:
        if w in html:
            html = html.replace(w, f'<span class="nb">{w}</span>')
    return html


def highlight(text):
    parts = HILITE.split(esc(text))
    out = ""
    for i, p in enumerate(parts):
        out += f"<em>{p}</em>" if i % 2 == 1 else p
    return keep_words_whole(out)


def resolve_bg(content):
    """หาภาพพื้นหลังฉาก — ปกติคืน None แล้วให้ build_html ใช้รูปห้างจริงแทน

    ⚠️ media_url **ไม่ใช่** ช่องพื้นหลัง — มันคือ "ผลลัพธ์" ที่ตอนท้ายไฟล์นี้เขียนทับ
    ด้วยโปสเตอร์ที่เพิ่งอัปโหลด · โค้ดเดิมเช็กแค่ `"/marketing/" in media_url`
    ผลคือคอนเทนต์ที่เคยสร้างโปสเตอร์ไปแล้ว รอบถัดไปจะเอา "โปสเตอร์รอบก่อน" มาเบลอ
    เป็นพื้นหลังของตัวเอง (ซ้อนทับกันไปเรื่อย ๆ ทุกรอบ) — ไม่ใช่รูปห้างอย่างที่ตั้งใจ

    จึงแยก slot ให้ชัด: พื้นหลังฉากมาได้จาก 3 ทางเท่านั้น เรียงตามลำดับที่ใช้
      1. ไฟล์ใน marketing/aibg/ — คลังฉากที่ FLUX สร้างไว้ล่วงหน้า (ใช้ก่อนถ้ามี)
      2. media_url ที่ชี้เข้า /marketing/aibg/ — กรณีเจาะจงฉากให้คอนเทนต์นั้น
      3. deploy/public/machine/machine-scene.jpg — รูปบรรยากาศห้างจริง (ตกมาที่นี่)
    /marketing/poster/ (โปสเตอร์เก่า) และ /marketing/upload/ (รูปที่คนอัปเอง) ต้องไม่หลุดเข้ามา

    ⚠️ ทำไมสุ่มจากคลังแทนสร้างสด — วัดจริงบน RTX 3050 6GB ได้ 9.8 นาที/ภาพ
    รอขนาดนั้นตอนกดปุ่มไม่ไหว · สร้างไว้ก่อนแล้วหยิบใช้ ได้ผลเหมือนกันแต่รอ 2 วินาที
    """
    mu = content.get("media_url") or ""
    if AI_BG_DIR in mu:
        return fetch_image(mu)

    # หยิบจากคลัง — คลังว่างก็คืน None แล้วตกไปใช้รูปห้างจริง ไม่พัง
    #
    # ⚠️ เลือกฉากที่ "คิดมาเพื่อคอนเทนต์นี้" ก่อนเสมอ (ชื่อขึ้นต้น {id}-)
    # เจ้าของขอว่าอย่าให้ฉากตายตัว ต้องเข้ากับหัวข้อแต่ละชิ้น
    # ถ้าสุ่มจากทั้งคลัง ฉากที่ scene_for_content คิดมาให้เรื่องนี้จะถูกกลบด้วยของชิ้นอื่น
    # = เสียประโยชน์ทั้งหมดของการคิดฉากตามเนื้อหา
    try:
        raw = sb("POST", f"list/{BUCKET}", {"prefix": "aibg/", "limit": 200},
                 base="storage/v1/object")
        pool = [x["name"] for x in (raw or []) if str(x.get("name", "")).endswith((".png", ".jpg"))]
        if not pool:
            return None
        mine = [n for n in pool if n.startswith(f"{content.get('id')}-")]
        pick = max(mine) if mine else random.choice(pool)   # ของตัวเอง เอาใบล่าสุด
        why = "คิดมาเพื่อคอนเทนต์นี้" if mine else f"สุ่มจากคลัง {len(pool)} ใบ"
        print(f"[poster] ฉาก AI: {pick} ({why})")
        return fetch_image(f"{SB_URL}/storage/v1/object/public/{BUCKET}/aibg/{pick}")
    except Exception as e:
        print(f"[poster] อ่านคลังฉากไม่ได้ ใช้รูปห้างจริงแทน: {str(e)[:80]}")
        return None


def load_concept(key, avoid=None):
    """แนวคิดโปสเตอร์ — คุมสี ของประดับ และการจัดวาง

    ทำเป็น CSS แยกไฟล์ต่อแนวคิด แล้วฉีดต่อท้าย CSS หลัก แทนที่จะทำเทมเพลตแยก 10 ชุด
    เพราะ 10 แนวใช้โครงร่วมกันแค่ 7 แบบ ส่วนใหญ่ต่างกันที่สีกับของประดับ
    ถ้าแยกเทมเพลตจะต้องไล่แก้บั๊กเดียวกัน 10 ที่

    คืน (key, css) · แนวที่ available=false จะถูกปฏิเสธตั้งแต่ตรงนี้
    ไม่ปล่อยให้สร้างของครึ่ง ๆ กลาง ๆ ออกไป
    """
    if not CONCEPTS_FILE.exists():
        return "", ""
    cfg = json.loads(CONCEPTS_FILE.read_text(encoding="utf-8"))
    by_key = {c["key"]: c for c in cfg.get("concepts", [])}

    # ── ไม่ระบุแนวคิด → สุ่มจากที่ใช้ได้ ไม่ใช่ตกมาที่ default ตลอด ──
    # เดิม `key or cfg["default"]` แปลว่าทุกโปสเตอร์ได้ "treasure" เหมือนกันหมด
    # ทำแนวคิดไว้ 8 แบบแต่ใช้จริงแบบเดียว — เจ้าของทักเองว่า
    # "หน้าตาคล้ายกันทุกรูป เปลี่ยนแค่รูปที่เอามาเป็น Ref."
    #
    # ที่แย่กว่านั้นคือกด "สร้างโปสเตอร์ใหม่" แล้วได้ของหน้าตาเดิมเป๊ะ
    # = ปุ่มที่กดแล้วเหมือนไม่มีอะไรเกิดขึ้น ทั้งที่ระบบทำงานถูก
    #
    # สุ่มโดยเลี่ยงแนวคิดที่คอนเทนต์นี้เพิ่งใช้ไป (ส่งมาทาง --avoid)
    # จะได้ "กดใหม่แล้วเปลี่ยนจริง" ไม่ใช่สุ่มแล้วบังเอิญได้ตัวเดิม
    if not key:
        pool = [k for k, v in by_key.items() if v.get("available", True)]
        if avoid and len(pool) > 1:
            pool = [k for k in pool if k != avoid] or pool
        key = random.choice(pool) if pool else (cfg.get("default") or "")

    c = by_key.get(key)
    if not c:
        avail = ", ".join(k for k, v in by_key.items() if v.get("available"))
        raise SystemExit(f"[poster] ไม่รู้จักแนวคิด {key!r} — ที่ใช้ได้: {avail}")
    if not c.get("available", True):
        need = " · ".join(c.get("needs") or [])
        raise SystemExit("\n".join([
            f"[poster] แนวคิด {key!r} ({c['label']}) ยังใช้ไม่ได้",
            f"         เพราะ: {c.get('blocked_why', '-')}",
            f"         ต้องมี: {need}",
        ]))
    f = CONCEPT_CSS_DIR / f"{key}.css"
    return key, (f.read_text(encoding="utf-8") if f.exists() else "")


def build_html(content, sku_img, bg_img, branches, concept_key="", concept_css=""):
    tpl = TEMPLATE.read_text(encoding="utf-8")
    # รูปตู้จริง — ของที่ทำให้โปสเตอร์ดู "มีอยู่จริง" ไม่ใช่ซองลอยบนพื้นสี
    # hero = ถ่ายตรงเห็นสินค้าเต็มตู้ · scene = ถ่ายเฉียงเห็นบรรยากาศห้าง (เอาไปทำพื้นหลัง)
    # ไม่มีไฟล์ก็ไม่พัง เทมเพลตต้องดูดีทั้งแบบมีและไม่มี
    def _pub(rel):
        f = ROOT / "public" / rel
        if not f.exists():
            return ""
        mime = "image/png" if f.suffix.lower() == ".png" else "image/jpeg"
        return data_uri(f.read_bytes(), mime)

    machine_hero = _pub("machine/machine-hero.jpg") or _pub("machine/machine-hero.png")
    machine_scene = _pub("machine/machine-scene.jpg") or _pub("machine/machine-scene.png")

    # โลโก้จริงจาก deploy/public — ดีกว่าวาดกล่องตัวอักษร X เอง
    #
    # ⚠️ ใช้ logo-mark-white.png (เฉพาะตรา DC · ขาว · พื้นโปร่งใส) ไม่ใช่ logo.png
    #    logo.png ตัวเก่าไม่โปร่งใสจริง (alpha 255 ทั้งใบ) และมีคำว่า DIVISION X CARD ติดมาด้วย
    #    เทมเพลตจึงต้องครอบหน้าต่างด้วยพิกัดฮาร์ดโค้ดเพื่อตัดคำนั้นออก + ใช้ mix-blend-mode
    #    เพื่อให้กล่องขาวหายไปบนพื้นเข้ม — เป็น workaround ทั้งคู่
    #    เจ้าของส่งไฟล์โปร่งใสจริงมาให้ 21 ส.ค. 2026 จึงเลิกใช้ workaround ได้
    #    ถอยกลับไป logo.png ได้ถ้าจำเป็น แต่ต้องเอาการครอบในเทมเพลตกลับมาด้วย
    logo = ""
    for cand in ("logo-mark-white.png", "logo.png"):
        lp = ROOT / "public" / cand
        if lp.exists():
            logo = data_uri(lp.read_bytes(), "image/png")
            break
    reg = data_uri((FONT_DIR / "Sarabun-Regular.ttf").read_bytes(), "font/ttf")
    bold = data_uri((FONT_DIR / "Sarabun-Bold.ttf").read_bytes(), "font/ttf")

    head, sub, rest, tags = split_caption(content.get("caption"))
    head_html = highlight(head)

    # ── ไม่มีรูปสินค้า → ใช้รูปตู้จริงเป็นตัวเอกแทน ──
    # เดิมซ่อน .hero ไปเฉย ๆ (display:none) ผลคือกลางภาพเหลือรูว่าง ~40%
    # เพราะพาดหัวอยู่บน เนื้อหาอยู่ล่าง แล้วไม่มีอะไรมาแทนที่ตรงกลาง
    # (เจ้าของเห็นแล้วให้ 2/10 · คอนเทนต์ #23 ไม่มี source_sku จึงไม่มีรูปซอง)
    #
    # ซ่อนของแล้วไม่จัดใหม่ = ทิ้งรูไว้ · โปสเตอร์ต้องมีตัวเอกเสมอ
    # ตู้จริงเป็นตัวเอกที่ดีรองลงมา — เป็นของเราจริง ไม่ต้องพึ่ง SKU
    # ── ตัวเอกของภาพ ──
    # มีรูปสินค้า → ใช้สินค้าเสมอ (ดีที่สุด)
    # ไม่มีสินค้า แต่มีฉาก AI → **ไม่ต้องมีตัวเอก** ปล่อยให้ฉากเล่นเต็มที่
    #   เจอจริง: เอาฉาก AI สวย ๆ มาแล้วเอารูปตู้ทับขวา 55% → ฉากแทบมองไม่เห็น
    #   กลายเป็นสองตัวเอกชนกัน และเสียเวลา 10 นาทีที่วาดฉากไปเปล่า ๆ
    # ไม่มีทั้งคู่ → ใช้รูปตู้กันรูว่างกลางภาพ (เหตุผลเดิม)
    hero_src = sku_img or ("" if bg_img else machine_hero)
    hero = (
        f'<div class="stage"><img src="{hero_src}">'
        f'<div class="floor"></div>'
        f'<img class="refl" src="{hero_src}"></div>'
    ) if hero_src else ""

    # ── งบตัวอักษรบนภาพ ──
    # เดิมยัดทุกบรรทัดที่เหลือลงไป — คอนเทนต์ #23 ได้ 359 ตัวอักษร 5 ย่อหน้าบนภาพเดียว
    # นั่นคือ "แคปชั่น" ไม่ใช่ "โปสเตอร์" · โปสเตอร์ขายไอเดียเดียว
    # รายละเอียดอยู่ในข้อความโพสต์ ซึ่งก๊อปได้ ซูมได้ ไม่โดน Facebook บีบ
    #
    # บนฟีดมือถือ ภาพ 1080px ถูกย่อเหลือ ~350px → ตัวอักษร 30px เหลือ ~10px อ่านไม่ออก
    # เหลือไว้ 1 บรรทัดสั้น ๆ เท่านั้น ถ้ามีบรรทัดรองอยู่แล้วก็ไม่ต้องมีอีก
    body = ""
    if not sub:
        short = next((l for l in rest if len(l) <= BODY_MAX), "")
        if short:
            body = f"<p>{keep_words_whole(esc(short))}</p>"

    return (tpl
            .replace("{{LOGO}}", logo)
            .replace("{{FONT_REGULAR}}", reg)
            .replace("{{FONT_BOLD}}", bold)
            .replace("{{HEADLINE}}", head_html)
            .replace("{{SUB}}", keep_words_whole(esc(sub)))
            .replace("{{BODY}}", body)
            .replace("{{HERO}}", hero)
            # ⚠️ ผูกกับ hero_src ไม่ใช่ sku_img — ไม่งั้นตอนตกมาใช้รูปตู้เป็นตัวเอก
            # จะยังโดน .hero.empty{display:none} ซ่อนทิ้ง แล้วได้รูว่างเหมือนเดิม
            .replace("{{HERO_CLASS}}", "" if hero_src else "empty")
            .replace("{{WRAP_CLASS}}", "" if hero_src else "no-hero")
            # ตู้ถูกเลื่อนขึ้นไปเป็นตัวเอกแล้ว ไม่ต้องมีตู้เล็กมุมล่างซ้ายซ้ำอีก
            .replace("{{MACHINE_ONLY}}", "machine-is-hero" if (not sku_img and hero_src) else "")
            # ── ตู้เล็กมุมล่างซ้ายมีไว้ทำไม: เป็น "หลักฐาน" ว่าของขายจากตู้จริงในห้าง ──
            # แต่พอมีทั้งฉาก AI และซองสินค้าแล้ว ในภาพเดียวจะมี 3 ตัวแย่งสายตากัน
            # และตู้เป็นตัวที่แพ้ที่สุด — โดนกรอบตัด สีทึบ อ่านไม่ออกว่าเป็นอะไร
            # กลายเป็นความรกแทนที่จะเป็นหลักฐาน
            #
            # กฎ: ตู้จะโผล่ก็ต่อเมื่อ **ขาดตัวเอกอย่างใดอย่างหนึ่ง**
            #   มีฉาก + มีซอง  → ซ่อนตู้ (ครบแล้ว ไม่ต้องมีอะไรเพิ่ม)
            #   มีฉาก ไม่มีซอง → ฉากเล่นเต็มจอ ตู้ไม่ต้องมาแย่ง
            #   ไม่มีฉาก       → ตู้คือสิ่งที่ทำให้ภาพดู "มีอยู่จริง" ต้องมี
            .replace("{{MACHINE_SIDE}}", "hide-machine" if (bg_img and sku_img) else "")
            # ฉากที่ AI วาดมาเป็น "พื้นหลังสำเร็จรูป" อยู่แล้ว ต่างจากรูปถ่ายห้าง
            # ต้องปิดการเบลอ/ย้อมสี/ของประดับที่เทมเพลตใส่ไว้เพื่อกลบรูปถ่าย
            .replace("{{SCENE_CLASS}}", "has-aiscene" if bg_img else "")
            .replace("{{BG}}", bg_img or machine_scene or "")
            .replace("{{MACHINE}}", machine_hero)
            .replace("{{MACHINE_CLASS}}", "has-machine" if machine_hero else "no-machine")
            .replace("{{HEAD_SIZE}}", str(head_size(head)))
            .replace("{{CONCEPT_CSS}}", concept_css)
            .replace("{{CONCEPT_CLASS}}", f"c-{concept_key}" if concept_key else "")
            .replace("{{BRANCHES}}", str(branches))
            .replace("{{TAGS}}", esc(tags)))


# พาดหัวห้ามเกินกี่บรรทัด — art_direction.json ข้อ 7 บอก "maximum 2 lines"
HEAD_MAX_LINES = 2
HEAD_MIN_SIZE = 52        # เล็กกว่านี้ = ต่ำกว่าเกณฑ์แบรนด์ (≥5% ของด้านกว้าง 1080 = 54)


def fit_headline(pg):
    """ย่อฟอนต์พาดหัวจนพอดี 2 บรรทัด — วัดในเบราว์เซอร์จริง ไม่ใช่เดา

    ⚠️ ทำไมต้องวัดจริง:
      ความกว้างตัวอักษรไทยเดาไม่ได้ สระบน/ล่าง/วรรณยุกต์กว้าง 0 แต่พยัญชนะไม่เท่ากัน
      คำนวณจาก len(text) จึงคลาดเคลื่อนมาก — วัดจากของจริง 26 ส.ค. 2026:
      พาดหัว 27 ตัวที่ head_size() ให้ฟอนต์ 82px ออกมาเป็น **3 บรรทัด** ไม่ใช่ 2
      (คอลัมน์ 520px ได้ ~10 ตัว/บรรทัดที่ฟอนต์นั้น)

      Chromium รู้ความกว้างจริงอยู่แล้ว — ถามมันตรง ๆ แม่นกว่าสูตรใด ๆ
    """
    js_lines = """() => {
      const h = document.querySelector('h1');
      if (!h) return 0;
      const cs = getComputedStyle(h);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.17;
      return Math.round(h.getBoundingClientRect().height / lh);
    }"""
    size = float(pg.evaluate("() => parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)"))
    lines = pg.evaluate(js_lines)
    steps = 0
    while lines > HEAD_MAX_LINES and size > HEAD_MIN_SIZE and steps < 20:
        size = max(HEAD_MIN_SIZE, size - 3)
        pg.evaluate("(s) => document.querySelector('h1').style.fontSize = s + 'px'", size)
        lines = pg.evaluate(js_lines)
        steps += 1
    if lines > HEAD_MAX_LINES:
        # ย่อจนสุดเพดานแล้วยังไม่พอ — ยอมให้เกิน ดีกว่าตัวเล็กจนอ่านไม่ออก
        print(f"  ⚠️ พาดหัวยังเป็น {lines} บรรทัดที่ฟอนต์ {size:.0f}px (เพดานล่าง {HEAD_MIN_SIZE})")
    elif steps:
        print(f"  ปรับพาดหัว → {size:.0f}px · {lines} บรรทัด")
    return size, lines


def render(html, out_path):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--force-color-profile=srgb"])
        pg = b.new_page(viewport={"width": SIZE, "height": SIZE}, device_scale_factor=2)
        pg.set_content(html, wait_until="load")
        pg.wait_for_timeout(600)          # เผื่อฟอนต์/รูป data URI วาดเสร็จ
        fit_headline(pg)                  # ต้องทำหลังฟอนต์โหลดเสร็จ ไม่งั้นวัดผิด
        pg.screenshot(path=out_path, type="png")
        b.close()


def main():
    ap = argparse.ArgumentParser(description="สร้างโปสเตอร์คอนเทนต์จากข้อมูลจริง")
    ap.add_argument("--id", type=int, required=True, help="id ของ marketing_content")
    ap.add_argument("--dry-run", action="store_true", help="เซฟลงเครื่องอย่างเดียว ไม่อัป ไม่แก้ DB")
    ap.add_argument("--out", help="ที่เก็บไฟล์ตอน dry-run")
    ap.add_argument("--sku", help="บังคับ SKU ที่จะเอารูปมาใช้ (สำหรับลองดีไซน์)")
    ap.add_argument("--template", help="ไฟล์เทมเพลตอื่น (สำหรับลองดีไซน์หลายแบบ)")
    ap.add_argument("--concept", help="แนวคิดโปสเตอร์ (ดู deploy/tasks/poster_concepts.json)")
    args = ap.parse_args()

    if args.template:
        global TEMPLATE
        TEMPLATE = pathlib.Path(args.template)

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

    bg_img = resolve_bg(content)

    # แนวคิดที่ใช้ครั้งก่อนอ่านจากชื่อไฟล์โปสเตอร์เดิม — ไม่ต้องเพิ่มคอลัมน์ใน DB
    # (ชื่อไฟล์รูปแบบ poster/{id}-{แนวคิด}-{เวลา}.png · ไฟล์เก่าที่ไม่มีแนวคิดจะไม่แมตช์ ซึ่งถูกแล้ว)
    prev = re.search(rf"/poster/{args.id}-([a-z_]+)-\d+\.png", content.get("media_url") or "")
    ckey, ccss = load_concept(args.concept, avoid=prev.group(1) if prev else None)
    html = build_html(content, sku_img, bg_img, branches, ckey, ccss)
    out = args.out or str(HERE / f"poster-{args.id}.png")
    render(html, out)
    size = pathlib.Path(out).stat().st_size
    # ⚠️ ห้ามใช้ quote ชนิดเดียวกันซ้อนใน f-string เช่น f"…{ckey or "-"}…"
    # Python 3.12 ขึ้นไปเขียนแบบนั้นได้ (PEP 701) แต่ **3.11 พังทันที** เป็น SyntaxError
    # เครื่องเจ้าของเป็น 3.12.9 จึงรันผ่าน แต่ workflow ตั้งไว้ 3.11 → ปุ่มสร้างโปสเตอร์
    # ล้มเงียบ ๆ ติดกัน 4 ครั้งตั้งแต่ 2026-08-09 โดยไม่มีใครรู้
    # (ผมเคยเห็นบรรทัดนี้ตอนอ่าน diff แล้วสรุปว่า "คงใช้ได้" เพราะเห็นเรนเดอร์บนเครื่องผ่าน — ผิด)
    concept_txt = ckey or "-"
    sku_txt = "มี" if sku_img else "ไม่มี"
    bg_txt = "AI (aibg)" if bg_img else "รูปห้างจริง"
    print(f"[poster] เรนเดอร์เสร็จ {out} ({size/1024:.0f} KB) · แนวคิด={concept_txt} · "
          f"สาขา={branches} · รูปสินค้า={sku_txt} · พื้นหลัง={bg_txt}")

    if args.dry_run:
        print("[poster] dry-run — ไม่อัปโหลด ไม่แก้ DB")
        return

    raw = pathlib.Path(out).read_bytes()
    import time

    # ── ลบโปสเตอร์เก่าของคอนเทนต์นี้ก่อน ──
    # ชื่อไฟล์มี timestamp จึงเป็นไฟล์ใหม่ทุกครั้งที่กด "สร้างโปสเตอร์ใหม่"
    # ถ้าไม่ลบของเก่า กด 10 ครั้งก็ได้ขยะค้าง 10 ไฟล์ (ไฟล์ละ ~4 MB) และไม่มีอะไรชี้ถึงมันอีก
    # ลบ "ก่อน" อัปตัวใหม่ไม่ได้ — ถ้าอัปพลาดจะเหลือคอนเทนต์ที่ไม่มีรูปเลย
    # จึงอัปตัวใหม่ให้สำเร็จก่อน แล้วค่อยลบตัวเก่า
    old = (content.get("media_url") or "")
    # ใส่แนวคิดไว้ในชื่อไฟล์ด้วย — รอบหน้าจะได้อ่านกลับมาเพื่อ "ไม่สุ่มซ้ำตัวเดิม"
    # ทำแบบนี้แทนการเพิ่มคอลัมน์ใน DB เพราะไม่ต้องรัน migration และข้อมูลติดไปกับไฟล์เอง
    key = f"poster/{args.id}-{ckey or 'plain'}-{int(time.time())}.png"
    sb("POST", f"{BUCKET}/{key}", raw=raw, ctype="image/png", base="storage/v1/object")
    url = f"{SB_URL}/storage/v1/object/public/{BUCKET}/{key}"
    sb("PATCH", f"marketing_content?id=eq.{args.id}", {"media_url": url, "media_type": "image"})
    print(f"[poster] อัปโหลดแล้ว → {url}")

    # ลบเฉพาะโปสเตอร์ที่ระบบสร้างเอง · ห้ามแตะรูปที่คนอัปเอง (/upload/) หรือรูปสินค้า
    marker = f"/{BUCKET}/poster/{args.id}-"
    if marker in old and old != url:
        try:
            sb("DELETE", f"{BUCKET}/{old.split(f'/{BUCKET}/', 1)[1]}", base="storage/v1/object")
            print("[poster] ลบโปสเตอร์เก่าแล้ว")
        except Exception as e:
            # ลบไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — โปสเตอร์ใหม่ขึ้นเรียบร้อยแล้ว
            print(f"[poster] ลบของเก่าไม่สำเร็จ (ข้ามไป): {str(e)[:80]}")


if __name__ == "__main__":
    main()
