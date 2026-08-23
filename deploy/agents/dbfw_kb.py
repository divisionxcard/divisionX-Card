"""สร้างคลังความรู้ Dragon Ball Super Card Game "Fusion World" จากเว็บทางการ

เว็บ Bandai มีเวอร์ชันไทยจริง (www.dbs-cardgame.com/fw/asia-th) — ข้อความทักษะ
เป็นภาษาไทยเต็ม ไม่ต้องแปลเอง เป็นค่ายเดียวนอกจาก One Piece ที่มีของไทยทางการ

ผลลัพธ์ใน deploy/tasks/ :
  dbfw_cards.json  การ์ดทุกใบทุกชุด ผูกกับ set_code ของ SKU เรา (FB01-FB09)
  dbfw_faq.json    Q&A ทางการรายชุด ภาษาไทย

    py -3 deploy/agents/dbfw_kb.py           # ทำทั้งสองไฟล์
    py -3 deploy/agents/dbfw_kb.py --cards   # เฉพาะการ์ด
    py -3 deploy/agents/dbfw_kb.py --faq     # เฉพาะ Q&A
    py -3 deploy/agents/dbfw_kb.py --sets FB01,FB09   # เจาะเฉพาะบางชุด

⚠️ เนื้อหาและรูปการ์ดเป็นลิขสิทธิ์ Bandai — ใช้อ้างอิงกฎเพื่อสอนเล่นได้
   แต่ห้ามลอกยกท่อนลงโพสต์ และห้ามใช้รูปการ์ดจากเว็บเขาเป็นภาพโพสต์ของเรา

หมายเหตุโครงสร้างเว็บ — ต่างจาก One Piece แม้เป็น Bandai เหมือนกัน
  รายชื่อชุด : <li><a data-val="597001">  (One Piece ใช้ <option value=>)
  ขอการ์ด    : GET ?search=true&category[]=  (One Piece ใช้ POST series=)
  ข้อมูลการ์ด: ต้องยิง detail.php แยกรายใบ  (One Piece มาพร้อมหน้ารายการเลย)
"""
import argparse
import datetime as dt
import html as H
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://www.dbs-cardgame.com/fw/asia-th"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
DELAY = 0.9          # หน่วงระหว่างคำขอ — เว็บคนอื่น อย่ายิงรัว

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "deploy" / "tasks"
# แคชหน้ารายละเอียดรายใบ — มี ~2,300 ใบ ถ้าไม่แคชแล้วรันซ้ำจะเสียเวลา 40 นาทีทุกรอบ
CACHE_DIR = ROOT / "deploy" / "agents" / ".cache" / "dbfw"

LICENSE_NOTE = ("เนื้อหาลิขสิทธิ์ Bandai — ใช้อ้างอิงกฎเพื่อสอนเล่นเท่านั้น "
                "ห้ามลอกยกท่อนลงโพสต์ และห้ามใช้รูปการ์ดจากเว็บทางการเป็นภาพโพสต์ของเรา")


def log(msg):
    print(msg, flush=True)


def fetch(path, tries=3):
    """ดึงหน้าเว็บ — retry เผื่อเน็ตสะดุด"""
    headers = {"User-Agent": UA, "Accept-Language": "th-TH,th;q=0.9"}
    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers=headers)
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 + n * 3)
    raise RuntimeError(f"ดึง {path} ไม่สำเร็จ: {last}")


TAG_RE = re.compile(r"</?[A-Za-z!][^<>]*>")


def txt(s):
    """ลอกแท็กแล้วค่อย unescape — ลำดับนี้สำคัญ

    ต้องลอกแท็กก่อน ไม่งั้น &lt;Universe 7&gt; จะกลายเป็น <Universe 7>
    แล้วโดนตัวลอกแท็กกินหายไปทั้งก้อน (ชื่อคุณสมบัติหลายตัวใช้วงเล็บแหลม)
    """
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = TAG_RE.sub("", s)
    s = re.sub(r"<[A-Za-z!/][^<>]*$", "", s)   # แท็กที่ถูกตัดกลางคัน ตอนหั่น HTML เป็นก้อน
    return re.sub(r"[ \t]+", " ", H.unescape(s)).strip()


# ─────────────────────────────────────────────────────────────────────────
# รายชื่อชุด
# ─────────────────────────────────────────────────────────────────────────
def list_series():
    """[{category_id, label, code}] — code คือรหัสในวงเล็บเหลี่ยมท้ายชื่อ เช่น [FB01]"""
    html = fetch("/cardlist/")
    out, seen = [], set()
    for cid, raw in re.findall(r'data-val="(\d+)"[^>]*>(.*?)</a>', html, re.S):
        if cid in seen:
            continue
        seen.add(cid)
        label = txt(raw)
        if not label:
            continue
        m = re.search(r"\[([A-Z]{2,})[-\s]?(\d+)\]", label)
        code = f"{m.group(1)}{m.group(2)}" if m else None
        if not code and "promo" in label.lower():
            code = "PROMO"
        out.append({"category_id": cid, "label": label, "code": code})
    return out


# ─────────────────────────────────────────────────────────────────────────
# การ์ดในชุด
# ─────────────────────────────────────────────────────────────────────────
def set_card_numbers(category_id):
    """เลขการ์ดไม่ซ้ำในชุด + จำนวนภาพอาร์ตของแต่ละใบ

    หน้ารายการแสดงอาร์ตพาราเรลเป็นรายการแยก (card_no=FB01-001&p=_p1)
    ซึ่งไม่ใช่การ์ดใบใหม่ ต้องยุบเข้าใบเดิมแล้วนับเป็น art_variants
    """
    html = fetch(f"/cardlist/?search=true&category%5B%5D={category_id}")
    arts = {}
    for raw in re.findall(r"card_no=([^\"'&]+(?:&amp;p=_p\d+)?)", html):
        no = H.unescape(raw).split("&p=")[0].strip()
        if not re.fullmatch(r"[A-Z0-9]+-\d+", no):
            continue
        arts.setdefault(no, 0)
        arts[no] += 1
    return {no: n for no, n in sorted(arts.items())}


DIV_RE = re.compile(r"<(/?)div\b[^>]*>", re.I)


def _inner(part):
    """เนื้อในของ div ที่เพิ่งถูกหั่นหัวออก — ตัดที่แท็กปิดของตัวมันเอง

    ต้องนับความลึกเอา ใช้ regex ตัดที่ </div> ตัวแรกไม่ได้ เพราะหลายช่องมี div ซ้อน
    (สีมี div.colValue ซ้อน · คุณสมบัติมี is-front/is-back ซ้อน)
    ถ้าไม่ตัด เนื้อหาจะล้ำไปช่องถัดไปจนจบหน้า — "หาได้ที่ไหน" เคยลากมาถึงเมนูท้ายเว็บ
    """
    i = part.find(">")
    if i < 0:
        return part
    s = part[i + 1:]
    depth = 1
    for m in DIV_RE.finditer(s):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return s[:m.start()]
    return s


def _cells(html):
    """คู่ (ป้ายไทย, HTML ของค่า) จากทุก div.cardDataCell"""
    chunk = html.split('class="cardDataCol"', 1)[-1]
    out = []
    for p in chunk.split('class="cardDataCell"')[1:]:
        body = _inner(p)
        m = re.search(r"<h6>(.*?)</h6>", body, re.S)
        if not m:
            continue
        out.append((txt(m.group(1)), body.split("</h6>", 1)[1]))
    return out


def _side(body, side):
    """ค่าฝั่งหน้า/หลังของการ์ดผู้นำ — ผู้นำมีสองหน้า ค่าพาวเวอร์กับทักษะไม่เท่ากัน"""
    m = re.search(rf'class="[^"]*\bis-{side}\b[^"]*"[^>]*>(.*?)</div>', body, re.S)
    return txt(m.group(1)) if m else None


def parse_detail(html, card_no):
    """แปลงหน้า detail.php เป็น dict เดียว"""
    def one(pat):
        m = re.search(pat, html, re.S)
        return txt(m.group(1)) if m else None

    name = one(r'class="cardName is-front"[^>]*>(.*?)</h1>') \
        or one(r'class="cardName[^"]*"[^>]*>(.*?)</h1>')
    card = {
        "code": one(r'class="cardNo"[^>]*>(.*?)</div>') or card_no,
        "name": name,
        "rarity": one(r'class="rarity"[^>]*>(.*?)</div>'),
    }
    # สีเก็บจาก data-color เพราะข้อความที่แสดงเป็นอังกฤษอยู่แล้วและมีได้หลายสี
    colors = re.findall(r'data-color="([^"]+)"', html)
    if colors:
        card["colors"] = sorted(set(colors))

    # ป้ายไทย → ชื่อฟิลด์ในไฟล์ · ป้ายที่ไม่รู้จักเก็บดิบไว้ใต้ชื่อไทยเดิม
    KEY = {
        "ประเภทของการ์ด": "card_type",
        "ค่าร่าย": "cost",
        "ค่าร่ายระบุสี": "specified_cost",
        "พาวเวอร์": "power",
        "คอมโบ": "combo",
        "คุณสมบัติ": "feature",
        "การใช้ทักษะ": "effect",
        "หาได้ที่ไหน": "obtained_from",
    }
    for label, body in _cells(html):
        if label == "สี":
            continue                       # เก็บจาก data-color ไปแล้ว
        key = KEY.get(label, label)
        front, back = _side(body, "front"), _side(body, "back")
        if front is not None and back is not None and front != back:
            card[key] = front
            card[key + "_back"] = back     # ผู้นำที่พลิกหน้าแล้วค่าเปลี่ยน
        else:
            val = front if front is not None else txt(body)
            card[key] = val
    # "-" คือช่องว่างของเว็บ ไม่ใช่ค่าจริง
    return {k: (None if v == "-" else v) for k, v in card.items()}


def card_detail(card_no):
    """ดึง+แคชหน้ารายละเอียดหนึ่งใบ"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"{card_no}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8")), True
    html = fetch(f"/cardlist/detail.php?card_no={urllib.parse.quote(card_no)}")
    card = parse_detail(html, card_no)
    cached.write_text(json.dumps(card, ensure_ascii=False), encoding="utf-8")
    return card, False


def load_our_sets():
    """set_code ของ SKU Dragon Ball ที่เราขายจริง"""
    import os
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from envload import load_env_local
    load_env_local()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        log("   ⚠ ไม่พบคีย์ Supabase — ข้ามการผูก SKU (ไฟล์ยังใช้ได้ แค่ไม่รู้ว่าชุดไหนเราขาย)")
        return {}
    req = urllib.request.Request(
        f"{url}/rest/v1/skus?select=sku_id,set_code,franchise,is_active&franchise=eq.DB",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))
    # เอาเฉพาะที่ยังขายอยู่ — in_our_machines คุมว่าจะโฆษณาว่ามีในตู้ได้ไหม
    # ถ้านับ SKU ที่ปิดไปแล้วด้วย ระบบจะโฆษณาของที่ไม่มีขาย
    return {r["set_code"]: r["sku_id"] for r in rows
            if r.get("set_code") and r.get("is_active")}


def build_cards(only=None):
    log("▸ ดึงรายการชุดการ์ด Fusion World")
    series = list_series()
    if only:
        series = [s for s in series if s["code"] in only]
    log(f"   เจอ {len(series)} ชุด")
    our = load_our_sets()
    log(f"   SKU Dragon Ball ที่เราขาย {len(our)} ชุด")

    sets, total, hits, failed = [], 0, 0, []
    for i, s in enumerate(series, 1):
        try:
            arts = set_card_numbers(s["category_id"])
        except Exception as e:
            failed.append({"code": s["code"], "label": s["label"], "error": str(e)[:120]})
            log(f"   [{i:2}/{len(series)}] {s['label'][:44]:<44} ✗ {str(e)[:44]}")
            continue
        time.sleep(DELAY)

        cards = []
        for no, n_art in arts.items():
            try:
                card, cached = card_detail(no)
            except Exception as e:
                failed.append({"card": no, "error": str(e)[:120]})
                continue
            card["art_variants"] = n_art
            cards.append(card)
            if cached:
                hits += 1
            else:
                time.sleep(DELAY)

        total += len(cards)
        own = sum(1 for c in cards
                  if s["code"] and (c.get("code") or "").upper().startswith(s["code"] + "-"))
        sets.append({
            "category_id": s["category_id"],
            "code": s["code"],
            "label": s["label"],
            "our_sku_id": our.get(s["code"]),
            "in_our_machines": s["code"] in our,
            "card_count": len(cards),
            "own_set_count": own,
            "reprint_count": len(cards) - own,
            "cards": cards,
        })
        log(f"   [{i:2}/{len(series)}] {s['label'][:44]:<44} {len(cards):>4} ใบ"
            + ("  ← ขายในตู้เรา" if s["code"] in our else ""))

    unmatched = sorted(set(our) - {s["code"] for s in sets})
    doc = {
        "_source": {
            "name": "DRAGON BALL SUPER CARD GAME FUSION WORLD — รายการการ์ดทางการ (ภาษาไทย)",
            "url": BASE + "/cardlist/",
            "site": BASE,
            "fetched_at": dt.date.today().isoformat(),
            "lang": "th",
        },
        "_license": LICENSE_NOTE,
        "_fields": {
            "card_type": "ผู้นำ / แบทเทิ้ล / เอ็กซ์ตร้า ฯลฯ",
            "cost": "ค่าร่าย — ผู้นำไม่มี",
            "power": "พาวเวอร์ฝั่งหน้า · ถ้ามี power_back คือผู้นำที่พลิกแล้วค่าเปลี่ยน",
            "effect": "ข้อความทักษะภาษาไทยจากเว็บทางการ · effect_back คือฝั่งหลังของผู้นำ",
            "feature": "คุณสมบัติ เช่น Saiyan/Universe 7",
            "colors": "สีของการ์ด (จาก data-color บนเว็บ ไม่ใช่ข้อความที่แสดง)",
            "art_variants": "จำนวนภาพอาร์ตของการ์ดใบเดียวกัน (พาราเรล) — ไม่ใช่การ์ดใบใหม่",
            "our_sku_id": "sku_id ในระบบเรา ถ้าชุดนี้มีขายในตู้",
            "own_set_count": "เฉพาะการ์ดที่ใช้รหัสของชุดนี้เอง — เลขที่คนหมายถึงเวลาถามว่าชุดนี้มีกี่ใบ",
            "reprint_count": "การ์ดจากชุดอื่นที่ถูกนำมาใส่ในชุดนี้",
        },
        "_usage": ("ใช้อ้างชื่อการ์ด/ทักษะให้ตรงตามทางการ ห้ามแต่งเอง "
                   "ถ้าชุดไหน in_our_machines=false แปลว่าเราไม่ได้ขายชุดนั้น อย่าโฆษณาว่ามีในตู้ · "
                   "สินค้าในตู้เราเป็นซองภาษาญี่ปุ่น แต่ข้อความในไฟล์นี้เป็นไทยจากเว็บทางการ "
                   "ใช้ตอบคำถามได้ แต่อย่าบอกลูกค้าว่าการ์ดในซองเป็นภาษาไทย"),
        "_stats": {"sets": len(sets), "cards": total, "from_cache": hits,
                   "failed": failed, "our_sets_not_on_site": unmatched},
        "sets": sets,
    }
    p = OUT_DIR / "dbfw_cards.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"   → {p.relative_to(ROOT)} ({p.stat().st_size/1024/1024:.1f} MB) · "
        f"{len(sets)} ชุด {total:,} ใบ (จากแคช {hits:,})")
    if failed:
        log(f"   ⚠ ดึงไม่สำเร็จ {len(failed)} รายการ")
    if unmatched:
        log(f"   ⚠ set_code ที่เรามีแต่จับกับชุดในเว็บไม่ได้: {', '.join(unmatched)}")
    return doc


# ─────────────────────────────────────────────────────────────────────────
# Q&A ทางการรายชุด — ภาษาไทยทั้งหมด
# ─────────────────────────────────────────────────────────────────────────
def build_faq(only=None):
    log("▸ ดึง Q&A ทางการรายชุด")
    series = [s for s in list_series() if s["code"]]
    if only:
        series = [s for s in series if s["code"] in only]
    time.sleep(DELAY)

    out, total = [], 0
    for i, s in enumerate(series, 1):
        try:
            html = fetch(f"/rules/faqs/list.php?series={s['code']}")
        except Exception as e:
            log(f"   [{i:2}/{len(series)}] {s['code']:<8} ✗ {str(e)[:44]}")
            continue
        items = []
        for block in html.split("faqResult_listItem")[1:]:
            # ⚠️ คำถามกับคำตอบใช้ class เดียวกัน (faqResult_text) ต่างกันแค่อยู่คนละ div
            #    ถ้าไม่หั่นก่อน จะได้คำถามซ้ำสองครั้งแล้วคำตอบหายหมด (เคยพลาดมาแล้ว)
            head, _, tail = block.partition("faqResult_answer")

            def first_text(s):
                m = re.search(r'class="faqResult_text"[^>]*>(.*?)</p>', s, re.S)
                return txt(m.group(1)) if m else None

            def pick(cls):
                m = re.search(rf'class="faqResult_{cls}"[^>]*>(.*?)</[a-z0-9]+>', head, re.S)
                return txt(m.group(1)) if m else None

            q = first_text(head)
            if not q:
                continue
            related = sorted(set(re.findall(r'faqResult_relatedItem"[^>]*>\s*<img[^>]*alt="([^"]+)"', tail)))
            items.append({k: v for k, v in {
                "no": pick("number"),
                "about": pick("title"),
                "date": pick("date"),
                "question": q,
                "answer": first_text(tail),
                "related_cards": related or None,
            }.items() if v})
        if items:
            out.append({"code": s["code"], "label": s["label"], "count": len(items),
                        "items": items})
            total += len(items)
        log(f"   [{i:2}/{len(series)}] {s['code']:<8} {len(items):>4} ข้อ")
        time.sleep(DELAY)

    doc = {
        "_source": {
            "name": "DRAGON BALL SUPER CARD GAME FUSION WORLD — Q&A ทางการ (ภาษาไทย)",
            "url": BASE + "/rules/faqs/",
            "fetched_at": dt.date.today().isoformat(),
            "lang": "th",
        },
        "_license": LICENSE_NOTE,
        "_usage": ("คำตอบทางการเรื่องกฎ ใช้ตอบคำถามลูกค้าได้ตรง ๆ "
                   "อ้างเลข Q ได้ว่ามาจากเว็บทางการ"),
        "_stats": {"series": len(out), "items": total},
        "series": out,
    }
    p = OUT_DIR / "dbfw_faq.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"   → {p.relative_to(ROOT)} ({p.stat().st_size/1024:.0f} KB) · "
        f"{len(out)} ชุด {total:,} ข้อ")
    return doc


def main():
    ap = argparse.ArgumentParser(description="สร้างคลังความรู้ Dragon Ball Fusion World")
    ap.add_argument("--cards", action="store_true", help="ทำเฉพาะไฟล์การ์ด")
    ap.add_argument("--faq", action="store_true", help="ทำเฉพาะไฟล์ Q&A")
    ap.add_argument("--sets", help="เจาะเฉพาะบางชุด คั่นด้วยจุลภาค เช่น FB01,FB09")
    a = ap.parse_args()
    only = {s.strip().upper() for s in a.sets.split(",")} if a.sets else None
    both = not (a.cards or a.faq)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if a.cards or both:
        build_cards(only)
    if a.faq or both:
        build_faq(only)
    log("เสร็จ")


if __name__ == "__main__":
    main()
