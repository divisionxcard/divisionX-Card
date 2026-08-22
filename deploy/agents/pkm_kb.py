"""สร้างคลังความรู้ Pokémon TCG จากเว็บทางการภาษาไทย (asia.pokemon-card.com/th)

ผลลัพธ์ใน deploy/tasks/ :
  pkm_cards.json  การ์ดพร้อมค่าสถานะ/ท่าต่อสู้/ความสามารถ ภาษาไทย แยกตามชุด
  pkm_rules.json  Q&A กฎการเล่นภาษาไทย + เนื้อหาสอนมือใหม่

    py -3 deploy/agents/pkm_kb.py --sets MA5,MA3     # เฉพาะชุดที่เราขาย (แนะนำ)
    py -3 deploy/agents/pkm_kb.py --list-sets        # ดูรหัสชุดทั้งหมด 82 ชุด
    py -3 deploy/agents/pkm_kb.py --rules            # เฉพาะ Q&A กฎ
    py -3 deploy/agents/pkm_kb.py --all-sets         # ทั้งหมด ~10,000 ใบ ใช้เวลา 4-5 ชม.

⚠️⚠️ เรื่องที่ต้องเข้าใจก่อนใช้ข้อมูลนี้ — ต่างจาก One Piece อย่างสำคัญ

  ซองที่เราขายในตู้เป็น **การ์ดภาษาญี่ปุ่น** (ยืนยันจากรูปซองจริง:
  「ポケモンカードゲーム MEGA ハイクラスパック MEGA ドリームex ランダム10枚入り」)
  แต่เว็บนี้เป็น **ไลน์ภาษาไทย** ซึ่งเป็นเกมเดียวกันแต่คนละการพิมพ์

  ผลที่ตามมา 3 ข้อ:
  1. ชื่อการ์ดที่ได้เป็นภาษาไทย — ใช้เล่าให้ลูกค้าไทยเข้าใจได้ (ดี)
     แต่การ์ดในซองจริงพิมพ์ภาษาญี่ปุ่น ห้ามบอกว่าลูกค้าจะเห็นชื่อไทยบนการ์ด
  2. **เลขการ์ดคนละระบบ** ไทยเป็น xxx/164 ญี่ปุ่นเป็น xxx/120 → ห้ามอ้างเลขการ์ด
     ว่าเป็นเลขที่อยู่บนการ์ดในซองที่ลูกค้าเปิด
  3. **ไลน์ไทยรวมชุดญี่ปุ่น 2 ชุดเป็นชุดเดียว** — MA5 "เงามืดคุกคาม" = M4 ニンジャスピナー
     + M5 アビスアイ รวมกัน (83+81=164 ใบ) แต่เราขายเป็น 2 สินค้าแยกกัน
     → ข้อมูลไทยบอกไม่ได้ว่าการ์ดใบไหนอยู่ในซองไหน

  ที่ใช้ได้เต็มที่คือ **ชื่อการ์ด · ค่าสถานะ · ท่าต่อสู้ · ความสามารถ · กฎการเล่น**
  ที่ห้ามใช้คือ **เลขการ์ด · รหัสชุด · การบอกว่าใบไหนอยู่ซองไหน**

⚠️ เนื้อหาและรูปเป็นลิขสิทธิ์ The Pokémon Company / Nintendo / Creatures / GAME FREAK
   อ้างอิงเพื่อสอนเล่นได้ · ห้ามลอกยกท่อน · ห้ามใช้รูปการ์ดของเขาเป็นภาพโพสต์เรา
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

BASE = "https://asia.pokemon-card.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
DELAY = 1.5           # เว็บคนอื่น อย่ายิงรัว
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "deploy" / "tasks"

LICENSE = ("เนื้อหาลิขสิทธิ์ The Pokémon Company / Nintendo / Creatures / GAME FREAK "
           "— อ้างอิงเพื่อสอนเล่นได้ ห้ามลอกยกท่อน ห้ามใช้รูปการ์ดจากเว็บทางการเป็นภาพโพสต์")

# ชุดที่ตรงกับสินค้าในตู้เรา — ดู __doc__ เรื่องไลน์ญี่ปุ่น/ไทยไม่ตรงกัน
OUR_SETS = {
    "MA3": {"our_sku": "PKM Dream EX", "jp": "M2a ハイクラスパック MEGA ドリームex"},
    "MA5": {"our_sku": "PKM Ninja + PKM Ghost",
            "jp": "รวม M4 ニンジャスピナー กับ M5 アビスアイ เข้าด้วยกัน"},
}


def log(m):
    print(m, flush=True)


def fetch(path, tries=3):
    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers={
                "User-Agent": UA, "Accept-Language": "th-TH,th;q=0.9"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 + n * 3)
    raise RuntimeError(f"ดึง {path} ไม่สำเร็จ: {last}")


def txt(s):
    """ลอกแท็กออกให้เหลือข้อความ — ลอกเฉพาะแท็กจริง กัน < > ที่เป็นเนื้อหาหาย"""
    s = re.sub(r"<br\s*[^<>]*>", "\n", s or "", flags=re.I)
    s = re.sub(r"</?[A-Za-z!][^<>]*>", "", s)
    s = H.unescape(s)
    # U+200C (ZWNJ) โผล่ท้ายข้อความเอฟเฟกต์บ่อย ตัดทิ้ง
    s = s.replace("‌", "")
    return re.sub(r"[ \t]+", " ", s).strip()


def energy_names(seg):
    """ชื่อพลังงานจากชื่อไฟล์รูป — /various_images/energy/Psychic.png → Psychic"""
    return [m.group(1) for m in re.finditer(r"/energy/([A-Za-z]+)\.png", seg or "")]


# ─────────────────────────────────────────────────────────────────────────
# รายชื่อชุด
# ─────────────────────────────────────────────────────────────────────────
def list_sets():
    """82 ชุด ฝังมาใน HTML หน้าค้นหาอยู่แล้ว ไม่ต้องหา endpoint"""
    h = fetch("/th/card-search/")
    out = []
    for m in re.finditer(
            r'<input[^>]*class="[^"]*expansionCode[^"]*"[^>]*value="([^"]+)"[^>]*>'
            r'(?:\s*<label[^>]*>(.*?)</label>)?', h, re.S):
        code, label = m.group(1).strip(), txt(m.group(2) or "")
        if code and not any(o["code"] == code for o in out):
            out.append({"code": code, "name_th": label})
    if not out:   # เผื่อ markup เปลี่ยน — หาแบบกว้างขึ้น
        for m in re.finditer(r'value="([A-Z][A-Za-z0-9\-]{1,8})"[^>]*>\s*<label[^>]*>(.*?)</label>', h, re.S):
            out.append({"code": m.group(1), "name_th": txt(m.group(2))})
    return out


# ─────────────────────────────────────────────────────────────────────────
# การ์ด
# ─────────────────────────────────────────────────────────────────────────
def set_card_ids(code):
    """เก็บ id การ์ดของชุดหนึ่ง — วนหน้าจนกว่าจะไม่มีลิงก์รายละเอียด

    ⚠️ ห้ามไล่ id 1→14347 ตรง ๆ · id ไม่ต่อเนื่อง มีช่วงว่างเยอะ
    """
    ids, page = [], 1
    while True:
        h = fetch(f"/th/card-search/list/?expansionCodes={urllib.parse.quote(code)}&pageNo={page}")
        found = re.findall(r"/th/card-search/detail/(\d+)/", h)
        if not found:
            break
        new = [i for i in dict.fromkeys(found) if i not in ids]
        if not new:            # หน้าเดิมซ้ำ = จบแล้ว กันลูปไม่รู้จบ
            break
        ids += new
        page += 1
        time.sleep(DELAY)
    return ids


def parse_card(h, card_id):
    def sec(cls, span=6000):
        m = re.search(rf'class="{cls}"(.{{0,{span}}}?)</section>', h, re.S)
        return m.group(1) if m else ""

    # <h1> มีขั้นวิวัฒนาการซ้อนอยู่ใน <span class="evolveMarker"> ต้องแยกออกจากชื่อ
    # ไม่งั้นได้ชื่อการ์ดเป็น "พื้นฐาน มาชิมาชิระ" ซึ่งเอาไปเขียนโพสต์แล้วผิด
    stage, name = None, ""
    m = re.search(r'<h1[^>]*class="[^"]*pageHeader[^"]*"[^>]*>(.*?)</h1>', h, re.S) \
        or re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
    if m:
        raw = m.group(1)
        mk = re.search(r'<span[^>]*class="evolveMarker"[^>]*>(.*?)</span>', raw, re.S)
        if mk:
            stage = txt(mk.group(1)) or None
            raw = raw.replace(mk.group(0), " ")
        name = re.sub(r"\s+", " ", txt(raw)).strip()

    info = re.search(r'class="mainInfomation"(.{0,1500}?)</p>', h, re.S)
    info = info.group(1) if info else ""
    hp = (re.search(r'class="number"[^>]*>\s*([0-9]+)', info) or [None, None])[1]
    types = energy_names(info)

    skills = []
    for sm in re.finditer(r'<div class="skill">(.*?)</div>\s*(?=<div class="skill">|</div>)', h, re.S):
        s = sm.group(1)
        nm = re.search(r'class="skillName"[^>]*>(.*?)</span>', s, re.S)
        cost = re.search(r'class="skillCost"[^>]*>(.*?)</span>', s, re.S)
        dmg = re.search(r'class="skillDamage"[^>]*>(.*?)</span>', s, re.S)
        eff = re.search(r'class="skillEffect"[^>]*>(.*?)</p>', s, re.S)
        skills.append({
            "name": txt(nm.group(1)) if nm else None,
            "cost": energy_names(cost.group(1) if cost else ""),
            "damage": txt(dmg.group(1)) if dmg else None,
            "effect": txt(eff.group(1)) if eff else None,
        })

    def cell(cls):
        m = re.search(rf'class="{cls}"[^>]*>(.*?)</td>', h, re.S)
        if not m:
            return None
        raw = m.group(1)
        v = txt(raw)
        e = energy_names(raw)
        return {"energy": e, "value": v} if (e or v) else None

    exp = sec("expansionColumn", 1500)
    setmark = re.search(r"/card-img/mark/th_([a-z0-9]+)_", exp)
    collector = re.search(r'class="collectorNumber"[^>]*>(.*?)</span>', exp, re.S)
    alpha = re.search(r'class="alpha"[^>]*>(.*?)</span>', exp, re.S)

    # ส่วนสูง/น้ำหนักอยู่ใน <p class="size">ส่วนสูง<span class="value">1.0m</span>…
    extra = {}
    size = re.search(r'class="size"[^>]*>(.*?)</p>', h, re.S)
    if size:
        vals = [txt(v) for v in re.findall(r'class="value"[^>]*>(.*?)</span>', size.group(1), re.S)]
        if len(vals) > 0:
            extra["height"] = vals[0]
        if len(vals) > 1:
            extra["weight"] = vals[1]
    dexh = re.search(r'class="extraInformation"[^>]*>\s*<h3[^>]*>(.*?)</h3>', h, re.S)
    if dexh:
        extra["pokedex"] = txt(dexh.group(1))          # เช่น "No.1015 โปเกมอนบริวาร"
    flavor = re.search(r'class="discription"[^>]*>(.*?)</p>', h, re.S)
    if flavor:
        extra["flavor"] = re.sub(r"\s*\n\s*", " ", txt(flavor.group(1)))

    illus = re.search(r'class="illustrator"[^>]*>.*?<a[^>]*>(.*?)</a>', h, re.S)
    setname = re.search(r'class="expansionLinkColumn"[^>]*>.*?<a[^>]*>(.*?)</a>', h, re.S)
    evo = [txt(x) for x in re.findall(r'class="step[^"]*"><a[^>]*>(.*?)</a>', h, re.S)]

    # เว็บไม่มีฟิลด์บอกประเภทตรง ๆ — อนุมานจาก HP ซึ่งมีเฉพาะการ์ดโปเกมอน
    # (ตรวจกับของจริง 724 ใบแล้ว: 616 ใบมี HP+ขั้นวิวัฒนาการ · 108 ใบเป็นเทรนเนอร์/ไอเทม)
    category = "โปเกมอน" if hp else "เทรนเนอร์/พลังงาน"

    return {
        "id": card_id,
        "name": name or None,
        "category": category,
        "stage": stage,
        "hp": int(hp) if hp else None,
        "types": types,
        "skills": [s for s in skills if s["name"]],
        "weakness": cell("weakpoint"),
        "resistance": cell("resist"),
        "retreat": cell("escape"),
        "set_mark": setmark.group(1).upper() if setmark else None,
        "regulation": txt(alpha.group(1)) if alpha else None,
        "collector_number": txt(collector.group(1)) if collector else None,
        "evolution": evo,
        "illustrator": txt(illus.group(1)) if illus else None,
        "set_name_th": txt(setname.group(1)) if setname else None,
        **extra,
        "image_url": f"{BASE}/th/card-img/th{int(card_id):08d}.png",
    }


def build_cards(codes):
    all_sets = {s["code"]: s for s in list_sets()}
    log(f"▸ รายชื่อชุดทั้งหมด {len(all_sets)} ชุด")
    time.sleep(DELAY)

    sets_out, total, failed = [], 0, []
    for code in codes:
        meta = all_sets.get(code, {"code": code, "name_th": ""})
        log(f"▸ ชุด {code} · {meta.get('name_th') or '(ไม่มีชื่อ)'}")
        ids = set_card_ids(code)
        log(f"   การ์ด {len(ids)} ใบ · กำลังดึงรายละเอียด (~{len(ids)*DELAY/60:.0f} นาที)")
        cards = []
        for n, cid in enumerate(ids, 1):
            try:
                cards.append(parse_card(fetch(f"/th/card-search/detail/{cid}/"), cid))
            except Exception as e:
                failed.append({"id": cid, "set": code, "error": str(e)[:120]})
            if n % 25 == 0:
                log(f"     {n}/{len(ids)}")
            time.sleep(DELAY)
        total += len(cards)
        sets_out.append({
            "code": code,
            "name_th": meta.get("name_th"),
            "our_product": OUR_SETS.get(code, {}).get("our_sku"),
            "jp_equivalent": OUR_SETS.get(code, {}).get("jp"),
            "card_count": len(cards),
            "cards": cards,
        })
        log(f"   เสร็จ {len(cards)} ใบ")

    doc = {
        "_source": {"name": "Pokémon Trading Card Game — เว็บทางการภาษาไทย",
                    "url": BASE + "/th/card-search/", "lang": "th",
                    "fetched_at": dt.date.today().isoformat()},
        "_license": LICENSE,
        "_language_warning": (
            "⚠️ ซองที่เราขายเป็นการ์ด **ภาษาญี่ปุ่น** แต่ข้อมูลชุดนี้มาจากไลน์ **ภาษาไทย** "
            "ซึ่งเป็นเกมเดียวกันแต่คนละการพิมพ์ — ใช้ชื่อการ์ด ค่าสถานะ ท่าต่อสู้ ความสามารถได้เต็มที่ "
            "แต่ **ห้ามอ้างเลขการ์ดหรือรหัสชุดว่าเป็นเลขที่อยู่บนการ์ดในซองที่ลูกค้าเปิด** "
            "และห้ามบอกว่าลูกค้าจะเห็นชื่อภาษาไทยบนการ์ด"),
        "_set_warning": (
            "ไลน์ไทยรวมชุดญี่ปุ่นสองชุดเป็นชุดเดียว — MA5 'เงามืดคุกคาม' = M4 ニンジャスピナー "
            "บวก M5 アビスアイ (83+81=164 ใบ) แต่เราขายเป็น 2 สินค้าแยกกัน "
            "→ ข้อมูลนี้บอกไม่ได้ว่าการ์ดใบไหนอยู่ในซองไหน"),
        "_all_sets": list(all_sets.values()),
        "_stats": {"sets": len(sets_out), "cards": total, "failed": failed},
        "sets": sets_out,
    }
    p = OUT_DIR / "pkm_cards.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"→ {p.relative_to(ROOT)} ({p.stat().st_size/1024/1024:.1f} MB) · {total:,} ใบ")
    if failed:
        log(f"   ⚠ ดึงไม่สำเร็จ {len(failed)} ใบ")
    return doc


# ─────────────────────────────────────────────────────────────────────────
# กฎ / Q&A
# ─────────────────────────────────────────────────────────────────────────
def build_rules():
    log("▸ ดึงเนื้อหาสอนมือใหม่")
    about = fetch("/th/about/")
    body = re.sub(r"<(script|style).*?</\1>", " ", about, flags=re.S | re.I)
    body = re.sub(r"</?[A-Za-z!][^<>]*>", "\n", body)
    lines = [l.strip() for l in H.unescape(body).split("\n") if len(l.strip()) > 15]
    # เมนู/หัวเรื่องโผล่ซ้ำหลายรอบในหน้าเดียว — ตัดตัวที่ซ้ำและตัวที่เป็นชื่อเมนูล้วน
    seen, basics = set(), []
    for l in lines:
        if not re.search(r"[฀-๿]", l) or l in seen:
            continue
        seen.add(l)
        if re.fullmatch(r"(สำหรับมือใหม่หัดเล่น|การ์ด|กฎการเล่น|ค้นหา\S*)\s*(\|.*)?", l):
            continue
        basics.append(l)
    log(f"   ได้ {len(basics)} ย่อหน้า")
    time.sleep(DELAY)

    log("▸ ดึง Q&A กฎการเล่น")
    qas, page, stopped = [], 1, "จบรายการ"
    while True:
        try:
            h = fetch(f"/th/rules/search/?pageNo={page}")
        except RuntimeError as e:
            # เว็บตอบ 502 ตอนไล่หน้าเยอะ ๆ — เก็บของที่ได้มาแล้วดีกว่าทิ้งทั้งหมด
            stopped = f"เว็บตอบ error ที่หน้า {page} ({str(e)[-40:].strip()})"
            log(f"   ⚠ {stopped} — บันทึกเท่าที่ได้ {len(qas)} ข้อ")
            break
        found = []
        for m in re.finditer(r'<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>', h, re.S):
            q, a = txt(m.group(1)), txt(m.group(2))
            if q and a and re.search(r"[฀-๿]", q):
                found.append({"q": q, "a": a})
        if not found:
            # โครงอาจไม่ใช่ dl/dt/dd — ลองแบบ list item
            for m in re.finditer(r'class="[^"]*question[^"]*"[^>]*>(.*?)</[a-z]+>\s*'
                                 r'<[^>]*class="[^"]*answer[^"]*"[^>]*>(.*?)</', h, re.S):
                q, a = txt(m.group(1)), txt(m.group(2))
                if q and a:
                    found.append({"q": q, "a": a})
        new = [x for x in found if x not in qas]
        if not new:
            break
        qas += new
        page += 1
        if page > 80:
            stopped = "ถึงเพดาน 80 หน้า"
            log(f"   ⚠ {stopped} หยุดไว้ก่อน")
            break
        # ไล่หน้าเยอะกว่าฝั่งการ์ดมาก หน่วงนานขึ้นกันโดน 502
        time.sleep(DELAY * 1.6)
    log(f"   ได้ Q&A {len(qas)} ข้อ จาก {page-1} หน้า · {stopped}")

    doc = {
        "_source": {"name": "Pokémon TCG — กฎและ Q&A ภาษาไทย (เว็บทางการ)",
                    "url": BASE + "/th/rules/", "lang": "th",
                    "fetched_at": dt.date.today().isoformat()},
        "_license": LICENSE,
        "_usage": ("ใช้อ้างอิงกติกาเพื่อเขียนคอนเทนต์สอนเล่น "
                   "ห้ามแต่งกฎหรือตัวเลขที่ไม่มีในไฟล์นี้"),
        "_coverage": f"เก็บได้ {len(qas)} ข้อ · หยุดเพราะ {stopped}",
        "basics": basics,
        "qa": qas,
    }
    p = OUT_DIR / "pkm_rules.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"→ {p.relative_to(ROOT)} ({p.stat().st_size/1024:.0f} KB)")
    return doc


def main():
    ap = argparse.ArgumentParser(description="คลังความรู้ Pokémon TCG (ภาษาไทย)")
    ap.add_argument("--sets", default="", help="รหัสชุดคั่นด้วยจุลภาค เช่น MA5,MA3")
    ap.add_argument("--all-sets", action="store_true", help="ทุกชุด (~10,000 ใบ · 4-5 ชม.)")
    ap.add_argument("--list-sets", action="store_true", help="ดูรหัสชุดทั้งหมดแล้วจบ")
    ap.add_argument("--rules", action="store_true", help="ทำเฉพาะไฟล์กฎ/Q&A")
    a = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if a.list_sets:
        for s in list_sets():
            mark = "  ← ตรงกับสินค้าเรา" if s["code"] in OUR_SETS else ""
            log(f"  {s['code']:<8} {s['name_th'][:56]}{mark}")
        return
    if a.rules:
        build_rules()
        return
    codes = ([s["code"] for s in list_sets()] if a.all_sets
             else [c.strip() for c in (a.sets or ",".join(OUR_SETS)).split(",") if c.strip()])
    build_cards(codes)
    time.sleep(DELAY)
    build_rules()
    log("เสร็จ")


if __name__ == "__main__":
    main()
