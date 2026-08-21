"""สร้างคลังความรู้ One Piece Card Game จากเว็บทางการ (asia-th.onepiece-cardgame.com)

ผลลัพธ์ 2 ไฟล์ใน deploy/tasks/ :
  opcg_rules.json  กฎทางการฉบับสมบูรณ์ (ไทย) แยกเป็นข้อ ๆ อ้างเลขข้อได้
  opcg_cards.json  การ์ดทุกใบทุกชุด ผูกกับ set_code ของ SKU เรา

ใช้เป็น snapshot — รันเดือนละครั้งพอ ไม่ต้องดึงตอน generate คอนเทนต์
    py -3 deploy/agents/opcg_kb.py            # ทำทั้งสองไฟล์
    py -3 deploy/agents/opcg_kb.py --rules    # เฉพาะกฎ
    py -3 deploy/agents/opcg_kb.py --cards    # เฉพาะการ์ด

⚠️ เนื้อหาและรูปการ์ดเป็นลิขสิทธิ์ Bandai — ใช้อ้างอิงกฎเพื่อสอนเล่นได้
   แต่ห้ามลอกยกท่อนลงโพสต์ และห้ามใช้รูปการ์ดจากเว็บเขาเป็นภาพโพสต์ของเรา
"""
import argparse
import datetime as dt
import difflib
import html as H
import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://asia-th.onepiece-cardgame.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
DELAY = 1.5          # หน่วงระหว่างคำขอ — เว็บคนอื่น อย่ายิงรัว
RULES_PDF = "/pdf/rule_comprehensive.pdf"
FOOTER_TOP = 775     # เนื้อหาจบที่ top≈766 · เลขหน้าอยู่ที่ top≈782 — อะไรที่ต่ำกว่านี้คือ footer

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "deploy" / "tasks"

LICENSE_NOTE = ("เนื้อหาลิขสิทธิ์ Bandai — ใช้อ้างอิงกฎเพื่อสอนเล่นเท่านั้น "
                "ห้ามลอกยกท่อนลงโพสต์ และห้ามใช้รูปการ์ดจากเว็บทางการเป็นภาพโพสต์ของเรา")

# สระ/วรรณยุกต์ที่ลอยอยู่เหนือ-ใต้ตัวอักษร ไม่กินความกว้าง
THAI_MARKS = set("ัิีึืฺุู"
                 "็่้๊๋์ํ๎")
THAI_CH = re.compile(r"[฀-๿]")


def log(msg):
    print(msg, flush=True)


def fetch(path, data=None, tries=3):
    """ดึงหน้าเว็บ — retry เผื่อเน็ตสะดุด"""
    body = urllib.parse.urlencode(data).encode() if data else None
    headers = {"User-Agent": UA, "Accept-Language": "th-TH,th;q=0.9"}
    if data:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(BASE + path, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 + n * 3)
    raise RuntimeError(f"ดึง {path} ไม่สำเร็จ: {last}")


# ─────────────────────────────────────────────────────────────────────────
# กฎการเล่น
# ─────────────────────────────────────────────────────────────────────────
def _base_seq(chars):
    """ตัดช่องว่างกับสระลอยออก เหลือแต่ตัวอักษรฐาน — ใช้เทียบสองแหล่ง"""
    return [c for c in chars if c != " " and c not in THAI_MARKS]


def _protected(ch):
    """ช่องว่างที่ติดกับตัวเลขหรืออักษรโรมัน ห้ามลบ — เลขข้อกฎกับคำอังกฤษต้องมีช่องว่างคั่น"""
    return ch.isdigit() or ("a" <= ch.lower() <= "z")


def extract_rules_text(pdf_bytes):
    """ดึงข้อความไทยจาก PDF ให้ถูกทั้งตัวอักษรและช่องว่าง

    pypdf  เรียงสระ/วรรณยุกต์ถูก แต่แทรกช่องว่างกลางคำมั่ว ("ลี ด เด อร์")
    pdfplumber ให้ตำแหน่งช่องว่างจริงจากไฟล์ แต่สลับสระเพี้ยน ("ลดี เดอรจ์")

    → เอาตัวอักษรจาก pypdf แล้วซ้อนตำแหน่งช่องว่างจริงจาก pdfplumber กลับเข้าไป
      ช่องว่างที่ไม่มีในไฟล์ต้นทางคือของปลอมที่ pypdf ใส่เอง ตัดทิ้ง
    """
    from pypdf import PdfReader
    import pdfplumber

    # เลขหน้าอยู่ท้าย text ของทุกหน้า ถ้าไม่ตัดออกมันจะไปเกาะกลางประโยคตอน join
    # เคยหลุดเข้าเนื้อกฎ 8 ข้อ 4 ข้อโดนกลางประโยคจนกลายเป็นจำนวนปลอม ("โจมตี 4 ครั้ง")
    # ต้องตัดทั้งสองฝั่งให้ตรงกัน ไม่งั้นลำดับตัวอักษรฐานเพี้ยนแล้วการจับคู่พัง
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as doc:
        page_chars, footers = [], []
        for page in doc.pages:
            body = [c for c in page.chars if c["top"] <= FOOTER_TOP]
            foot = "".join(c["text"] for c in page.chars if c["top"] > FOOTER_TOP).strip()
            page_chars.append(body)
            footers.append(foot)

    pages = []
    for t, foot in zip((p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages),
                       footers):
        # ตัดเฉพาะเมื่อท้ายหน้าตรงกับเลขหน้าที่ pdfplumber ชี้ว่าเป็น footer จริง ๆ
        if foot:
            t = re.sub(r"\s*" + re.escape(foot) + r"\s*$", "", t)
        pages.append(t)
    y = "\n".join(pages)
    # ยุบ newline เป็นช่องว่างตั้งแต่ต้น ไม่งั้นตัวคั่นที่ซ่อนอยู่จะกลับมาเป็นช่องว่างทีหลัง
    y = re.sub(r"\s+", " ", y).strip()

    # ฝั่ง pypdf: ตัวอักษรฐาน + จำไว้ว่าช่องว่างที่น่าสงสัยอยู่หลังตัวฐานที่เท่าไหร่
    yb, yb_at = [], {}
    for i, c in enumerate(y):
        if c == " ":
            prv = y[i - 1] if i else ""
            nxt = y[i + 1] if i + 1 < len(y) else ""
            if not _protected(prv) and not _protected(nxt):
                yb_at.setdefault(len(yb), []).append(i)
        elif c not in THAI_MARKS:
            yb.append(c)

    # ฝั่ง pdfplumber: ตัวอักษรฐาน + ตำแหน่งช่องว่างที่มี glyph จริงในไฟล์ (ตัด footer ไปแล้ว)
    pb, p_space_at = [], set()
    for chars in page_chars:
        for c in chars:
            t = c["text"]
            if t == " ":
                p_space_at.add(len(pb))
            elif not t.isspace() and t not in THAI_MARKS:
                pb.append(t)

    # จับคู่ลำดับตัวอักษรฐานของสองแหล่ง แล้วย้ายตำแหน่งช่องว่างข้ามมา
    sm = difflib.SequenceMatcher(None, yb, pb, autojunk=False)
    keep, matched = set(), 0
    for a, b, size in sm.get_matching_blocks():
        matched += size
        for k in range(size):
            if (b + k) in p_space_at:
                keep.update(yb_at.get(a + k, []))
    ratio = matched / max(len(yb), 1)

    cand = {i for pos in yb_at.values() for i in pos}
    drop = cand - keep
    text = "".join(c for i, c in enumerate(y) if i not in drop)
    text = re.sub(r" {2,}", " ", text)

    # PDF เก็บสระอำเป็นนิคหิต+สระอา (ํ + า) ไม่ใช่ ำ ตัวเดียว แต่ HTML ฝั่งการ์ดใช้ ำ ปกติ
    # ถ้าไม่แปลง คำเดียวกันในสองไฟล์จะเทียบกันไม่ติดแบบเงียบ ๆ ("ทําการ" ≠ "ทำการ")
    # ต้องทำ**ท้ายสุด** เพราะ ํ อยู่ใน THAI_MARKS ถ้าแปลงก่อนจับคู่ ลำดับตัวอักษรฐานจะเพี้ยน
    before_am = text.count("ํ")
    text = re.sub("ํ([่-๋])า", r"\1ำ", text)   # ควํ่า → คว่ำ
    text = text.replace("ํา", "ำ")                        # ทํา → ทำ

    stats = {"pypdf_chars": len(y), "base_chars": len(yb), "align_ratio": round(ratio, 4),
             "pdf_space_glyphs": len(p_space_at), "spaces_checked": len(cand),
             "spaces_kept": len(keep), "spaces_removed": len(drop),
             "page_footers_removed": sum(1 for f in footers if f),
             "sara_am_normalized": before_am - text.count("ํ"),
             "out_chars": len(text)}
    return text, stats


def _is_successor(prev, cand):
    """เลขข้อถัดไปที่เป็นไปได้จริง — ใช้กรองเลขข้อในวงเล็บอ้างอิง ('ดู 8-1-3-4-3.') ทิ้ง

    เอกสารเดินเลขแบบต้นไม้: ลูกตัวแรก, พี่น้องถัดไปที่ระดับใดก็ได้, หรือขึ้นหมวดใหม่
    ยอมให้ข้ามได้ไม่เกิน 3 เผื่อต้นฉบับเว้นเลข
    """
    if prev is None:
        return len(cand) <= 2 and cand[0] == 1
    if len(cand) == len(prev) + 1 and cand[:-1] == prev and cand[-1] == 1:
        return True
    for k in range(len(cand)):
        if k < len(prev) and cand[:k] == prev[:k] and len(cand) == k + 1 \
                and 1 <= cand[k] - prev[k] <= 3:
            return True
    return False


def parse_rules(text):
    """แยกข้อความกฎเป็นข้อ ๆ ตามเลขข้อ (1., 1-1., 5-1-2-3. ...)"""
    version = (re.search(r"COMPREHENSIVE RULES\s*Ver\.\s*([\d.]+)", text) or [None, None])[1]
    updated = (re.search(r"อัปเดต\s*ล่าสุด\s*[:：]\s*([\d/]+)", text) or [None, None])[1]

    # สารบัญอยู่ต้นเล่ม ตัดทิ้ง — เนื้อหาจริงเริ่มที่ "1." ตัวที่มี "1-1." ตามมาติด ๆ
    heads = list(re.finditer(r"(?:^|(?<=\s))1\.(?=\s.{0,60}?1-1\.)", text, re.S))
    body_at = heads[-1].start() if heads else max(text.find("1-1."), 0)
    body = text[body_at:]

    cands = []
    for m in re.finditer(r"(?:(?<=^)|(?<=[\s(\[]))(\d{1,2}(?:-\d{1,3}){0,5})\.(?=\s)", body):
        # อ้างอิงไขว้เขียนว่า "(ดู X-X-X.)" — "ดู" ต้องเป็นคำเดี่ยว ไม่ใช่หางคำอย่าง "อีกฝ่ายดู"
        before = body[max(0, m.start() - 14):m.start()]
        if re.search(r"(?:^|[\s(])ดู\s*$", before) or before.rstrip().endswith("("):
            continue
        cands.append((m, tuple(int(x) for x in m.group(1).split("-"))))

    # เอกสารอ้างถึงเลขข้ออื่นกลางประโยคด้วย ("ให้ดูเพิ่มเติมในหัวข้อ 7-1-4-1-1. หรือ 7-1-4-1-2.")
    # เลือก "สายเลขที่ยาวที่สุดที่เดินถูกลำดับ" แทนการไล่รับทีละตัว ตัวอ้างอิงจะหลุดออกไปเอง
    n = len(cands)
    best = [1] * n
    back = [-1] * n
    for i in range(n):
        for j in range(i):
            # >= เพื่อให้ตัวที่อยู่หลังชนะเมื่อสายยาวเท่ากัน — เลขข้อจริงมักอยู่หลังตัวที่ถูกอ้างถึง
            if best[j] + 1 >= best[i] and _is_successor(cands[j][1], cands[i][1]):
                best[i], back[i] = best[j] + 1, j
    end = max(range(n), key=lambda i: (best[i], i)) if n else -1
    chain = []
    while end >= 0:
        chain.append(end)
        end = back[end]
    accepted = [cands[i] for i in reversed(chain)]

    rules = []
    for i, (m, no) in enumerate(accepted):
        end = accepted[i + 1][0].start() if i + 1 < len(accepted) else len(body)
        raw = re.sub(r"\s{2,}", " ", body[m.end():end]).strip()
        # ต้นฉบับพิมพ์เลขข้อซ้ำสองครั้งอยู่บ้าง (เช่น 7-1-4-1-1-3.) ตัวแรกจะค้างเป็นหางของข้อก่อนหน้า
        # ตัดออก ยกเว้นที่เป็นอ้างอิงไขว้จริง ("(ดู 10-1-5.)")
        tail = re.search(r"\s(\d{1,2}(?:-\d{1,3}){1,5})\.\s*$", raw)
        if tail and not re.search(r"(?:ดู|\()\s*$", raw[:tail.start(1)]):
            raw = raw[:tail.start()].strip()
        if not raw:
            continue
        rules.append({"no": m.group(1), "section": str(no[0]),
                      "depth": len(no), "text": raw})

    # ข้อสั้น ๆ ที่มีข้อย่อยตามมา คือหัวข้อ ไม่ใช่ตัวกฎ
    nos = {r["no"] for r in rules}
    for r in rules:
        has_child = any(n.startswith(r["no"] + "-") for n in nos)
        r["kind"] = "heading" if (has_child and len(r["text"]) <= 40) else "rule"

    sections = []
    for r in rules:
        if r["depth"] == 1:
            sections.append({"no": r["no"], "title": r["text"][:60].strip(), "rule_count": 0})
    by_sec = {}
    for r in rules:
        by_sec[r["section"]] = by_sec.get(r["section"], 0) + 1
    for s in sections:
        s["rule_count"] = by_sec.get(s["no"], 0)

    return {"version": version, "official_updated": updated,
            "sections": sections, "rules": rules}


def extract_keywords(parsed):
    """หมวด 10 คือคีย์เวิร์ดความสามารถ — ดึงออกมาแยกเพราะคอนเทนต์สอนเล่นใช้บ่อยสุด

    ตัวหัวข้อมีแค่ชื่อคีย์เวิร์ด ("[บล็อกเกอร์]") คำอธิบายอยู่ในข้อย่อย จึงต้องดึงมารวมกัน
    """
    rules = parsed["rules"]
    kws = []
    for r in rules:
        # ทุกหัวข้อระดับ 3 ใต้ 10-1/10-2 คือคีย์เวิร์ด — บางตัวต้นฉบับไม่ได้ครอบวงเล็บไว้
        # (เคยบังคับว่าต้องมี [ ] แล้วตก KO / ทิ้ง / ด้ง!! -X ไป 4 ตัวจาก 22)
        if r["depth"] != 3 or not r["no"].startswith(("10-1-", "10-2-")):
            continue
        kw = re.sub(r"^[\[<]\s*|\s*[\]>]$", "", r["text"]).strip()
        if not kw or len(kw) > 30:
            continue
        kids = [k["text"] for k in rules
                if k["no"].startswith(r["no"] + "-") and k["depth"] == r["depth"] + 1]
        kws.append({"no": r["no"], "keyword": kw,
                    "definition": " ".join(kids).strip() or r["text"],
                    "detail_rules": [k["no"] for k in rules if k["no"].startswith(r["no"] + "-")]})
    return kws


def current_rules_stamp():
    """เว็บทางการต่อท้ายลิงก์ PDF ด้วยวันที่ของกฎฉบับล่าสุด (?20251017)

    ใช้เป็นตัวบอกว่าออกเวอร์ชันใหม่หรือยัง โดยไม่ต้องโหลด PDF ทั้งไฟล์
    """
    html = fetch("/rules/").decode("utf-8", "replace")
    m = re.search(re.escape(RULES_PDF) + r"\?(\d{6,8})", html)
    return m.group(1) if m else None


def check_stale():
    """เทียบไฟล์ที่เก็บไว้กับของบนเว็บ — ไม่แก้อะไร แค่บอกว่าต้องรันใหม่ไหม"""
    p = OUT_DIR / "opcg_rules.json"
    if not p.exists():
        log("ยังไม่มี opcg_rules.json — รัน `--rules` ก่อน")
        return 1
    have = json.loads(p.read_text(encoding="utf-8"))
    src = have.get("_source", {})
    stamp = current_rules_stamp()
    log(f"ไฟล์ที่เก็บไว้ : กฎ v{src.get('version')} ({src.get('official_updated')}) · ดึงเมื่อ {src.get('fetched_at')}")
    log(f"บนเว็บตอนนี้   : รหัสไฟล์ PDF {stamp or 'อ่านไม่ได้'}")
    if stamp and stamp != (src.get("pdf_stamp") or ""):
        log("⚠ ทางการอัปเดตกฎแล้ว (หรือยังไม่เคยบันทึกรหัสไว้) — ควรรัน `py -3 deploy/agents/opcg_kb.py` ใหม่")
        return 2
    log("✓ ยังตรงกับของบนเว็บ")
    return 0


def build_rules():
    log("▸ ดึงกฎทางการ (PDF)")
    stamp = current_rules_stamp()
    time.sleep(DELAY)
    pdf = fetch(RULES_PDF + (f"?{stamp}" if stamp else ""))
    log(f"   ได้ {len(pdf)/1e6:.1f} MB · รหัสไฟล์บนเว็บ {stamp or '-'}")

    text, stats = extract_rules_text(pdf)
    log(f"   ข้อความ {stats['out_chars']:,} ตัวอักษร · จับคู่สองแหล่งได้ {stats['align_ratio']*100:.1f}%")
    log(f"   ช่องว่างที่ตรวจ {stats['spaces_checked']:,} จุด · เก็บที่มีในไฟล์จริง {stats['spaces_kept']:,} · "
        f"ตัดของปลอมที่ pypdf ใส่เอง {stats['spaces_removed']:,}")

    parsed = parse_rules(text)
    kws = extract_keywords(parsed)
    log(f"   แยกได้ {len(parsed['rules']):,} ข้อ · {len(parsed['sections'])} หมวด · คีย์เวิร์ด {len(kws)} ตัว")

    doc = {
        "_source": {
            "name": "ONE PIECE CARD GAME COMPREHENSIVE RULES (ฉบับภาษาไทย)",
            "url": BASE + RULES_PDF,
            "site": BASE,
            "version": parsed["version"],
            "official_updated": parsed["official_updated"],
            "pdf_stamp": stamp,          # รหัสท้ายลิงก์บนเว็บ · ใช้เทียบว่าออกฉบับใหม่หรือยัง (--check)
            "fetched_at": dt.date.today().isoformat(),
            "lang": "th",
        },
        "_license": LICENSE_NOTE,
        "_extraction": stats,
        "_usage": ("อ้างเลขข้อได้ตรง ๆ เช่น 'กฎข้อ 5-1-2-3 บอกว่าการ์ดรหัสเดียวกันใส่เด็คได้ไม่เกิน 4 ใบ' "
                   "— ห้ามแต่งเลขข้อหรือตัวเลขที่ไม่มีในไฟล์นี้"),
        "_note_typos": ("ข้อความคัดตามต้นฉบับทุกตัวอักษร รวมที่ต้นฉบับพิมพ์ผิดเอง "
                        "(เช่น 'คีย์เวิร์ด้วย' ขาด ด · 'เเป็น' ซ้ำ เ · 'กฏ' แทน 'กฎ') "
                        "ตรวจยืนยันแล้วด้วยตัวดึง 2 ตัวที่ให้ผลตรงกัน ไม่ใช่ความผิดพลาดของการดึงข้อมูล "
                        "— ถ้าจะยกไปเขียนโพสต์ ให้สะกดให้ถูก อย่าลอกคำผิดตาม"),
        "sections": parsed["sections"],
        "keywords": kws,
        "rules": parsed["rules"],
    }
    p = OUT_DIR / "opcg_rules.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"   → {p.relative_to(ROOT)} ({p.stat().st_size/1024:.0f} KB)")
    return doc


# ─────────────────────────────────────────────────────────────────────────
# การ์ด
# ─────────────────────────────────────────────────────────────────────────
# ⚠️ ลอกเฉพาะ "แท็ก HTML จริง" คือ < ตามด้วยตัวอักษรโรมันหรือ / ทันที
# เนื้อความการ์ดใช้ < > ครอบชื่อคุณสมบัติจริง ๆ ด้วย ("มีคุณสมบัติ < วาโนะคุนิ >")
# และเว็บทางการเขียนสองแบบปนกัน บางใบ escape มา บางใบเขียนสด
# ถ้าใช้ <[^>]+> แบบหลวม ชื่อคุณสมบัติจะหายทั้งคำ — เคยกินไป 105 ใบใน 18 ชุด
TAG_RE = re.compile(r"</?[A-Za-z!][^<>]*>")


def txt(s):
    s = re.sub(r"<br\s*[^<>]*>", "\n", s or "", flags=re.I)
    s = TAG_RE.sub("", s)
    s = H.unescape(s)
    return re.sub(r"[ \t]+", " ", s).strip()


FIELD_KEYS = "cost|attribute|power|counter|color|block|feature|text|trigger|getInfo"


def list_series():
    html = fetch("/cardlist/").decode("utf-8", "replace")
    out = []
    for v, label in re.findall(r"<option[^>]*value=\"([^\"]+)\"[^>]*>(.*?)</option>", html, re.S):
        # ชื่อชุดถูก escape มาอีกชั้น (&lt;br&gt;) — ต้อง unescape ก่อนถึงจะลอกแท็กออกได้
        # (สลับลำดับกับ txt() ที่ใช้กับเนื้อการ์ด ซึ่งต้องลอกแท็กก่อน ไม่งั้น "< วาโนะคุนิ >" จะหาย)
        name = TAG_RE.sub(" ", H.unescape(label))
        name = re.sub(r"\s+", " ", H.unescape(name)).strip()
        if not v.strip() or not name:
            continue
        m = re.search(r"\[([A-Z]+)-?(\d+)\]", name)
        if m:
            code = f"{m.group(1)}{m.group(2).zfill(2)}"
        else:
            # 3 ชุดที่ไม่มีรหัสในชื่อ — ตั้งรหัสไว้เองจะได้อ้างถึงได้
            low = name.lower()
            code = ("PROMO" if "promotion" in low else
                    "LIMITED" if "limited" in low else
                    "FAMILY" if "family" in low else None)
        out.append({"series_id": v, "label": name, "code": code})
    return out


def parse_cards(html):
    cards = []
    for m in re.finditer(r"<dl class=\"modalCol\" id=\"([^\"]+)\">(.*?)</dl>", html, re.S):
        blk = m.group(2)
        info = re.search(r"<div class=\"infoCol\">(.*?)</div>", blk, re.S)
        spans = [txt(s) for s in re.findall(r"<span>(.*?)</span>", info.group(1), re.S)] if info else []
        nm = re.search(r"<div class=\"cardName\">(.*?)</div>", blk, re.S)
        rec = {
            "code": spans[0] if spans else None,
            "rarity": spans[1] if len(spans) > 1 else None,
            "type": spans[2] if len(spans) > 2 else None,
            "name": txt(nm.group(1)) if nm else None,
        }
        back = re.search(r"<div class=\"backCol\">(.*?)</div>\s*</dd>", blk, re.S)
        seg = back.group(1) if back else blk
        fields = {}
        for fm in re.finditer(
                rf"<div class=\"({FIELD_KEYS})\">(.*?)(?=<div class=\"(?:{FIELD_KEYS})\"|</div>\s*<a |\Z)",
                seg, re.S):
            k, v = fm.group(1), fm.group(2)
            lab = re.search(r"<h3>(.*?)</h3>", v, re.S)
            val = txt(re.sub(r"<h3>.*?</h3>", "", v, flags=re.S))
            fields[k] = {"label": txt(lab.group(1)) if lab else None, "value": val}

        def val(k):
            v = (fields.get(k) or {}).get("value")
            return None if v in (None, "", "-") else v

        # ช่อง cost ใช้ร่วมกัน — ลีดเดอร์แสดง "ไลฟ์" การ์ดอื่นแสดง "คอสต์"
        cost_label = (fields.get("cost") or {}).get("label") or ""
        rec.update({
            "life": val("cost") if "ไลฟ์" in cost_label else None,
            "cost": val("cost") if "ไลฟ์" not in cost_label else None,
            "power": val("power"),
            "counter": val("counter"),
            "color": val("color"),
            "attribute": val("attribute"),
            "block": val("block"),      # เลขบล็อกของฟอร์แมต (label ในเว็บเขาติดผิดเป็น "ซ่อนการ์ดพิมพ์ซ้ำ")
            "traits": val("feature"),
            "ability": val("text"),
            "trigger": val("trigger"),  # ความสามารถทริกเกอร์ แยก div ต่างหากในเว็บ
            "set_label": val("getInfo"),
        })
        cards.append(rec)

    # อาร์ตอื่นของใบเดิมใช้ท้าย id หลายแบบ (_p1, _p2 และ _r1..._r3 ในชุด PRB)
    # อย่าดูจากรูปแบบ id — นับตัวแรกของแต่ละรหัสการ์ดเป็นใบหลัก ที่เหลือเป็นแบบภาพ
    # (เคยเช็กแค่ "_p" แล้ว PRB-01 ได้ใบซ้ำ 3 ใบ และ OP01-016 หายไปทั้งใบ)
    main, arts = [], {}
    for c in cards:
        code = c["code"]
        if code in arts:
            arts[code] += 1
        else:
            arts[code] = 0
            main.append(c)
    for c in main:
        c["art_variants"] = arts.get(c["code"], 0)
    return main


def load_our_sets():
    """set_code ของ SKU ที่เราขายจริง — ผูกไว้ให้ระบบรู้ว่าชุดไหนมีในตู้"""
    import os
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    # อ่าน deploy/.env.local · บน CI ไฟล์ไม่มี ฟังก์ชันจะเงียบ ๆ แล้วใช้ secrets จาก environment แทน
    from envload import load_env_local
    load_env_local()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        log("   ⚠ ไม่พบคีย์ Supabase — ข้ามการผูก SKU (ไฟล์การ์ดยังใช้ได้ แค่ไม่รู้ว่าชุดไหนเราขาย)")
        return {}
    req = urllib.request.Request(
        f"{url}/rest/v1/skus?select=sku_id,set_code,franchise,is_active&franchise=eq.OP",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))
    return {r["set_code"]: r["sku_id"] for r in rows if r.get("set_code")}


def build_cards():
    log("▸ ดึงรายการชุดการ์ด")
    series = list_series()
    log(f"   เจอ {len(series)} ชุด")
    our = load_our_sets()
    log(f"   SKU One Piece ที่เราขาย {len(our)} ชุด")

    sets, total, failed = [], 0, []
    for i, s in enumerate(series, 1):
        try:
            html = fetch("/cardlist/", {"series": s["series_id"]}).decode("utf-8", "replace")
            cards = parse_cards(html)
        except Exception as e:
            failed.append({"series_id": s["series_id"], "label": s["label"], "error": str(e)[:120]})
            log(f"   [{i:2}/{len(series)}] {s['label'][:46]:<46} ✗ {str(e)[:50]}")
            continue
        total += len(cards)
        # หน้าชุดแสดงการ์ดพิมพ์ซ้ำจากชุดอื่นที่อยู่ในชุดนี้ด้วย ต้องแยกตัวเลขให้ชัด
        # ไม่งั้นจะเขียนผิดว่า "OP-17 มี 130 ใบ" ทั้งที่การ์ดรหัส OP17-xxx มี 119 ใบ
        # (บางชุดอย่าง PRB / โปรโม เป็นชุดรวมพิมพ์ซ้ำโดยธรรมชาติ ตัวเลขรวมถึงจะถูก)
        own = sum(1 for c in cards
                  if s["code"] and (c["code"] or "").upper().startswith(s["code"] + "-"))
        sets.append({
            "series_id": s["series_id"],
            "code": s["code"],
            "label": s["label"],
            "our_sku_id": our.get(s["code"]),
            "in_our_machines": s["code"] in our,
            "card_count": len(cards),
            "own_set_count": own,
            "reprint_count": len(cards) - own,
            "cards": cards,
        })
        log(f"   [{i:2}/{len(series)}] {s['label'][:46]:<46} {len(cards):>4} ใบ"
            + ("  ← ขายในตู้เรา" if s["code"] in our else ""))
        time.sleep(DELAY)

    unmatched = sorted(set(our) - {s["code"] for s in sets})
    doc = {
        "_source": {
            "name": "ONE PIECE CARD GAME — รายการการ์ดทางการ (ภาษาไทย)",
            "url": BASE + "/cardlist/",
            "site": BASE,
            "fetched_at": dt.date.today().isoformat(),
            "lang": "th",
        },
        "_license": LICENSE_NOTE,
        "_fields": {
            "block": "เลขบล็อกของฟอร์แมต (หน้าเว็บทางการติดป้ายผิดเป็น 'ซ่อนการ์ดพิมพ์ซ้ำ')",
            "life": "มีเฉพาะการ์ดลีดเดอร์",
            "cost": "มีเฉพาะการ์ดที่ไม่ใช่ลีดเดอร์",
            "trigger": "ความสามารถ [ทริกเกอร์] ที่ทำงานตอนเปิดจากไลฟ์ — คนละช่องกับ ability",
            "art_variants": "จำนวนภาพอาร์ตอื่นของการ์ดใบเดียวกัน (พาราเรล) — ไม่ใช่การ์ดใบใหม่",
            "our_sku_id": "sku_id ในระบบเรา ถ้าชุดนี้มีขายในตู้",
            "card_count": "จำนวนการ์ดไม่ซ้ำทั้งหมดที่อยู่ในชุดนี้ (รวมที่พิมพ์ซ้ำจากชุดอื่น)",
            "own_set_count": "เฉพาะการ์ดที่ใช้รหัสของชุดนี้เอง — เลขที่คนมักหมายถึงเวลาพูดว่า 'ชุดนี้มีกี่ใบ'",
            "reprint_count": "การ์ดจากชุดอื่นที่ถูกนำมาใส่ในชุดนี้ (ชุด PRB/โปรโม แทบทั้งชุดเป็นแบบนี้)",
        },
        "_usage": ("ใช้อ้างชื่อการ์ด/ความสามารถให้ตรงตามทางการ ห้ามแต่งชื่อการ์ดหรือเอฟเฟกต์เอง "
                   "ถ้าชุดไหน in_our_machines=false แปลว่าเราไม่ได้ขายชุดนั้น อย่าโฆษณาว่ามีในตู้"),
        "_stats": {"sets": len(sets), "cards": total, "failed": failed,
                   "our_sets_not_on_site": unmatched},
        "sets": sets,
    }
    p = OUT_DIR / "opcg_cards.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"   → {p.relative_to(ROOT)} ({p.stat().st_size/1024/1024:.1f} MB) · "
        f"{len(sets)} ชุด {total:,} ใบ")
    if failed:
        log(f"   ⚠ ดึงไม่สำเร็จ {len(failed)} ชุด")
    if unmatched:
        log(f"   ⚠ set_code ที่เรามีแต่จับกับชุดในเว็บไม่ได้: {', '.join(unmatched)}")
    return doc


def main():
    ap = argparse.ArgumentParser(description="สร้างคลังความรู้ One Piece Card Game")
    ap.add_argument("--rules", action="store_true", help="ทำเฉพาะไฟล์กฎ")
    ap.add_argument("--cards", action="store_true", help="ทำเฉพาะไฟล์การ์ด")
    ap.add_argument("--check", action="store_true",
                    help="เช็กว่าทางการออกกฎฉบับใหม่หรือยัง (ไม่แก้ไฟล์ · ใช้ 1 คำขอ)")
    a = ap.parse_args()
    if a.check:
        sys.exit(check_stale())
    both = not (a.rules or a.cards)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if a.rules or both:
        build_rules()
    if a.cards or both:
        build_cards()
    log("เสร็จ")


if __name__ == "__main__":
    main()
