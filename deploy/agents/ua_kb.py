"""สร้างคลังความรู้ UNION ARENA จากเว็บทางการ Bandai (unionarena-tcg.com)

ครอบคลุม SKU ที่เราขาย: SLL UA 51 = ชุด Solo Leveling (UA51BT)

⚠️ ข้อมูลเป็น **ภาษาญี่ปุ่น** เพราะซองที่เราขายเป็นฉบับญี่ปุ่น (ขายเฉพาะในญี่ปุ่น)
   ไม่มีเวอร์ชันไทย/เอเชียของชุดนี้ — ห้ามยกชื่อการ์ดญี่ปุ่นไปเขียนแคปชั่นตรง ๆ

ผลลัพธ์ใน deploy/tasks/ :
  ua_cards.json  การ์ดในชุด + Q&A ทางการรายชุด + กฎทั่วไปของเกม

    py -3 deploy/agents/ua_kb.py
    py -3 deploy/agents/ua_kb.py --set UA51BT

หมายเหตุ: ค่าหลายช่องเป็น **รูปภาพ** ไม่ใช่ข้อความ (สีเอเนอร์จี · ไอคอนเงื่อนไขทักษะ)
ต้องอ่านจาก alt ของ img ไม่งั้นข้อมูลจะหายเงียบ ๆ เช่น ทักษะที่ขึ้นต้นด้วย
[自分のターン中] จะเหลือแค่ท่อนหลังโดยไม่มีใครรู้ว่าเงื่อนไขคืออะไร
"""
import argparse
import datetime as dt
import html as H
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://www.unionarena-tcg.com/jp"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
DELAY = 0.8

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "deploy" / "tasks"
CACHE_DIR = ROOT / "deploy" / "agents" / ".cache" / "ua"

# ชุดที่เราขาย — set_code ในระบบเราคือ UA51 แต่รหัสทางการคือ UA51BT
OUR_SETS = {"UA51BT": "UA51"}

LICENSE_NOTE = ("เนื้อหาลิขสิทธิ์ Bandai และ ©Solo Leveling Animation Partners "
                "ใช้อ้างอิงข้อมูลการ์ดเท่านั้น ห้ามใช้รูปการ์ดจากเว็บทางการเป็นภาพโพสต์ของเรา")

TAG_RE = re.compile(r"</?[A-Za-z!][^<>]*>")


def log(msg):
    print(msg, flush=True)


def txt(s):
    """ลอกแท็ก — แต่เก็บ alt ของ img ไว้ก่อน เพราะหลายค่าเป็นรูปล้วน"""
    s = re.sub(r'<img[^>]*\balt="([^"]*)"[^>]*>', r"[\1]", s, flags=re.I)
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = TAG_RE.sub("", s)
    s = re.sub(r"<[A-Za-z!/][^<>]*$", "", s)
    return re.sub(r"[ \t　]+", " ", H.unescape(s)).strip()


def fetch(path, tries=3):
    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(
                BASE + path, headers={"User-Agent": UA, "Accept-Language": "ja"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 + n * 3)
    raise RuntimeError(f"ดึง {path} ไม่สำเร็จ: {last}")


def find_series(code):
    """หา series id จาก label ที่มีรหัสชุดในวงเล็บเหลี่ยม 【UA51BT】

    ไม่ hardcode id เพราะ Bandai เปลี่ยนเลขได้ — ยึดรหัสชุดบนซองเป็นหลัก
    """
    html = fetch("/cardlist/?search=true")
    for sid, label in re.findall(r'<option value="(\d+)"[^>]*>([^<]*)</option>', html):
        if code in label:
            return sid, txt(label)
    return None, None


def card_numbers(series_id):
    """เลขการ์ดไม่ซ้ำ + จำนวนอาร์ตพาราเรลของแต่ละใบ

    หน้ารายการนับพาราเรล (_p1/_p2) เป็นรายการแยก ซึ่งไม่ใช่การ์ดใบใหม่
    ต้องยุบเข้าใบเดิม ไม่งั้นจะรายงานว่าชุดนี้มี 118 ใบ ทั้งที่จริง 92 แบบ
    """
    html = fetch(f"/cardlist/?search=true&series={series_id}")
    total = re.search(r'searchCount">(\d+)', html)
    arts = {}
    for no in re.findall(r"detail_iframe\.php\?card_no=([A-Za-z0-9/_-]+)", html):
        base = no.split("_p")[0]
        arts[base] = arts.get(base, 0) + 1
    return arts, int(total.group(1)) if total else len(arts)


def parse_detail(html, card_no):
    def one(pat):
        m = re.search(pat, html, re.S)
        return txt(m.group(1)) if m else None

    # ชื่อการ์ดมีคำอ่านซ้อนอยู่ใน span ต้องดึงคำอ่านออกก่อนแล้วค่อยเอาชื่อ
    ruby = one(r'<span class="rubyData">(.*?)</span>')
    name_raw = one(r'<h2 class="cardNameCol">(.*?)</h2>') or ""
    name = name_raw.replace(ruby or "", "").strip() if ruby else name_raw

    # ค่าอื่นอยู่ใน <dl class="cardDataCol XXXData"> → <dd class="cardDataContents">
    KEY = {
        "needEnergy": "need_energy",
        "ap": "ap_cost",
        "category": "card_type",
        "bp": "bp",
        "attribute": "features",
        "generatedEnergy": "generated_energy",
        "effect": "effect",
        "trigger": "trigger",
    }
    card = {
        "code": one(r'<span class="cardNumData">(.*?)</span>') or card_no,
        "name": name or None,
        "reading": ruby,
        "rarity": one(r'<span class="rareData">(.*?)</span>'),
    }
    for raw, key in KEY.items():
        m = re.search(rf'class="cardDataCol {raw}Data".*?<dd class="cardDataContents">(.*?)</dd>',
                      html, re.S)
        v = txt(m.group(1)) if m else None
        card[key] = None if v in ("-", "") else v
    return {k: v for k, v in card.items() if v}


def card_detail(card_no):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / (card_no.replace("/", "_") + ".json")
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8")), True
    html = fetch(f"/cardlist/detail_iframe.php?card_no={urllib.parse.quote(card_no, safe='/')}")
    card = parse_detail(html, card_no)
    cached.write_text(json.dumps(card, ensure_ascii=False), encoding="utf-8")
    return card, False


def parse_faq(html):
    """<section class="faqUnit"> → คำถาม/คำตอบหนึ่งข้อ"""
    out = []
    for block in html.split('class="faqUnit"')[1:]:
        def pick(pat):
            m = re.search(pat, block, re.S)
            return txt(m.group(1)) if m else None
        # ⚠️ ต้องเป็น class="question[^"]*" ไม่ใช่ class="question"
        #    ของจริงคือ class="question moreOpenBtn" — ถ้าล็อกปีกกาปิดเป๊ะจะได้ 0 ข้อแบบเงียบ ๆ
        q = pick(r'class="question[^"]*".*?<p[^>]*>(.*?)</p>')
        a = pick(r'class="answer[^"]*".*?<p[^>]*>(.*?)</p>')
        if not (q and a):
            continue
        # <h2 class="tit">Q2025<span>2026.04.17更新</span></h2>
        # เลข Q กับวันที่อยู่ใน h2 เดียวกัน ถ้าลอกแท็กเฉย ๆ จะติดกันเป็น "Q20252026.04.17更新"
        tit = pick(r'class="tit"[^>]*>(.*?)</h2>') or ""
        m_date = re.search(r"(\d{4}\.\d{2}\.\d{2})", tit)
        out.append({k: v for k, v in {
            "no": (tit.split(m_date.group(1))[0] if m_date else tit).strip() or None,
            "updated": m_date.group(1) if m_date else None,
            "card_code": pick(r'class="cardID"[^>]*>(.*?)</'),
            "card_name": pick(r'class="cardName"[^>]*>(.*?)</'),
            "question": q,
            "answer": a,
        }.items() if v})
    return out


def build(only=None):
    codes = [c for c in OUR_SETS if not only or c in only]
    log(f"▸ ดึงการ์ด UNION ARENA {len(codes)} ชุด")
    sets, warn = [], []
    for code in codes:
        sid, label = find_series(code)
        if not sid:
            warn.append(f"{code}: หา series id ไม่เจอ — Bandai อาจเปลี่ยนชื่อชุด")
            log(f"   {code} ✗ หา series id ไม่เจอ")
            continue
        time.sleep(DELAY)
        arts, listed = card_numbers(sid)
        log(f"   {code} (series {sid}) · {label}")
        log(f"      หน้ารายการแสดง {listed} รายการ → การ์ดไม่ซ้ำ {len(arts)} แบบ")
        time.sleep(DELAY)

        cards, hits = [], 0
        for no, n in sorted(arts.items()):
            try:
                c, cached = card_detail(no)
            except Exception as e:
                warn.append(f"{no}: {str(e)[:70]}")
                continue
            c["art_variants"] = n
            cards.append(c)
            if cached:
                hits += 1
            else:
                time.sleep(DELAY)

        faq = []
        try:
            faq = parse_faq(fetch(f"/faq/list.php?series={code}"))
        except Exception as e:
            warn.append(f"{code} FAQ: {str(e)[:70]}")
        time.sleep(DELAY)

        sets.append({
            "code": code,
            "our_set_code": OUR_SETS[code],
            "series_id": sid,
            "label": label,
            "listed_entries": listed,
            "card_count": len(cards),
            "faq_count": len(faq),
            "cards": cards,
            "faq": faq,
        })
        log(f"      การ์ด {len(cards)} แบบ (จากแคช {hits}) · Q&A เฉพาะชุด {len(faq)} ข้อ")

    general = []
    try:
        general = parse_faq(fetch("/faq/list.php?type=0"))
        log(f"   กฎทั่วไปของเกม {len(general)} ข้อ")
    except Exception as e:
        warn.append(f"กฎทั่วไป: {str(e)[:70]}")

    doc = {
        "_source": {
            "name": "UNION ARENA — รายการการ์ดและ Q&A ทางการ (ญี่ปุ่น)",
            "url": BASE + "/cardlist/",
            "fetched_at": dt.date.today().isoformat(),
            "lang": "ja",
        },
        "_license": LICENSE_NOTE,
        "_important": (
            "ชุดนี้ขายเฉพาะในญี่ปุ่น ไม่มีเวอร์ชันไทยหรือเอเชีย — "
            "ข้อมูลทั้งหมดเป็นภาษาญี่ปุ่น ห้ามยกชื่อการ์ดไปเขียนแคปชั่นตรง ๆ "
            "ให้เล่าเป็นชื่อตัวละครที่คนไทยรู้จักจากอนิเมะแทน · "
            "UNION ARENA เป็นเกมการ์ดที่เล่นแข่งได้จริง (ต่างจากการ์ดสะสม KAYOU)"
        ),
        "_fields": {
            "need_energy": "เอเนอร์จีที่ต้องใช้ลงการ์ด — ค่าเป็นสีจาก alt ของรูป เช่น [紫1]",
            "generated_energy": "เอเนอร์จีที่การ์ดใบนี้ผลิตให้",
            "ap_cost": "แต้ม AP ที่ต้องจ่าย",
            "bp": "พลังต่อสู้",
            "effect": "ข้อความทักษะ · ไอคอนเงื่อนไขถูกแปลงเป็น [ข้อความ] จาก alt ของรูป",
            "art_variants": "จำนวนอาร์ตของการ์ดใบเดียวกัน (พาราเรล) ไม่ใช่การ์ดใบใหม่",
            "listed_entries": "จำนวนรายการที่หน้าเว็บแสดง (นับพาราเรลแยก) — ไม่เท่ากับจำนวนแบบ",
        },
        "_stats": {"sets": len(sets), "general_faq": len(general), "warnings": warn},
        "sets": sets,
        "general_faq": general,
    }
    p = OUT_DIR / "ua_cards.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"   → {p.relative_to(ROOT)} ({p.stat().st_size/1024:.0f} KB)")
    for w in warn:
        log(f"   ⚠ {w}")
    return doc


def main():
    ap = argparse.ArgumentParser(description="สร้างคลังความรู้ UNION ARENA")
    ap.add_argument("--set", help="เจาะเฉพาะชุดเดียว เช่น UA51BT")
    a = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build({a.set.upper()} if a.set else None)
    log("เสร็จ")


if __name__ == "__main__":
    main()
