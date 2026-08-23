"""สร้างคลังความรู้ Yu-Gi-Oh OCG จากฐานข้อมูลทางการ Konami (db.yugioh-card.com)

ครอบคลุม 4 SKU ที่เราขาย — ทั้งหมดเป็นซองพิมพ์ญี่ปุ่น (OCG) ไม่ใช่ TCG อังกฤษ

⚠️ ข้อมูลในไฟล์นี้เป็น **ภาษาญี่ปุ่นล้วน** เพราะสินค้าที่เราขายเป็นฉบับญี่ปุ่น
   และฐานข้อมูล Konami ไม่มีชื่อการ์ดภาษาอังกฤษ/ไทยสำหรับชุดพวกนี้ (ทดสอบแล้ว
   request_locale=en กับ ko คืน 0 ใบ) — เอาไว้ตอบว่า "ชุดนี้มีการ์ดอะไรบ้าง"
   แต่อย่าเอาชื่อญี่ปุ่นไปเขียนแคปชั่นตรง ๆ ลูกค้าไทยอ่านไม่ออก

ผลลัพธ์: deploy/tasks/ygo_cards.json

    py -3 deploy/agents/ygo_kb.py
    py -3 deploy/agents/ygo_kb.py --set UT01

⚠️ กับดักการแบ่งหน้า — ทดสอบแล้วจริง
   rp=100  → ได้แค่ 53/28/28/30 ใบ (ตัดข้อมูลเงียบ ๆ)
   rp=99999 → ได้ 80/80/80/60 ใบ ตรงกับจำนวนทางการ
   สคริปต์นี้จึงเทียบจำนวนที่ได้กับ expected ทุกครั้ง ไม่ตรงคือเตือนทันที
   (เคสเดียวกับที่ PostgREST เคยทำยอดขายหาย 82,000 บาท — ดู skill dvx-db)
"""
import argparse
import datetime as dt
import html as H
import json
import pathlib
import re
import time
import urllib.error
import urllib.request

BASE = "https://www.db.yugioh-card.com/yugiohdb"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
DELAY = 1.5

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "deploy" / "tasks"

# (รหัสทางการ, pid, ชื่อทางการ, จำนวนแบบที่ประกาศไว้, set_code ในระบบเรา)
#
# ⚠️ set_code ในตาราง skus ของเราตั้งกันเอง ไม่ตรงกับรหัสทางการของ Konami
#    ต้องแมปมือ ห้ามให้ scraper เดา — ผูกไว้ตรงนี้ที่เดียว
PACKS = [
    ("CORI", "1000009580000", "CHAOS ORIGINS", 80, "CHAOS"),
    ("LOCH", "1000009563000", "LIMIT OVER COLLECTION -THE HEROES-", 80, "HEROES"),
    ("LOCR", "1000009564000", "LIMIT OVER COLLECTION -THE RIVALS-", 80, "REVALS"),
    ("UT01", "1000009608000", "UTILITY SELECTION", 60, "UT01"),
]

LICENSE_NOTE = ("เนื้อหาลิขสิทธิ์ KONAMI และ ©スタジオ・ダイス／集英社・テレビ東京・KONAMI "
                "ใช้อ้างอิงข้อมูลการ์ดเท่านั้น ห้ามใช้รูปการ์ดจากเว็บทางการเป็นภาพโพสต์ของเรา")

TAG_RE = re.compile(r"</?[A-Za-z!][^<>]*>")


def log(msg):
    print(msg, flush=True)


def txt(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    return re.sub(r"[ \t]+", " ", H.unescape(TAG_RE.sub("", s))).strip()


def fetch(url, tries=3):
    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": UA, "Accept-Language": "ja"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 + n * 3)
    raise RuntimeError(f"ดึง {url} ไม่สำเร็จ: {last}")


def parse_row(block):
    """การ์ดหนึ่งใบจาก div.t_row"""
    def one(pat, flags=re.S):
        m = re.search(pat, block, flags)
        return txt(m.group(1)) if m else None

    rarities = re.findall(r'class="lr_icon rid rid_\d+"[^>]*>\s*<p>([^<]+)</p>', block)
    card = {
        "name": one(r'<span class="card_name">\s*(.*?)\s*</span>'),
        "reading": one(r'<span class="card_ruby">\s*(.*?)\s*</span>'),
        "cid": one(r'class="cid" value="(\d+)"'),
        "attribute": one(r'<span class="box_card_attribute">.*?<span>\s*(.*?)\s*</span>'),
        "level": one(r'<span class="box_card_level_rank[^"]*">.*?<span>\s*(.*?)\s*</span>'),
        # ช่องนี้ขึ้นบรรทัดใหม่คั่นในวงเล็บ 【...】 ต้องยุบให้เหลือบรรทัดเดียว
        # ไม่งั้นได้ "【\r\n 魔法使い族／特殊召喚／効果\r\n 】" ซึ่งค้นไม่เจอ
        "species": re.sub(r"\s+", "", one(
            r'<span class="card_info_species_and_other_item">\s*(.*?)\s*</span>') or "") or None,
        "atk": one(r'<span class="atk_power">.*?<span>\s*(.*?)\s*</span>'),
        "def": one(r'<span class="def_power">.*?<span>\s*(.*?)\s*</span>'),
        "text": one(r'<dd class="box_card_text[^"]*">\s*(.*?)\s*</dd>'),
        # ใบเดียวอาจมีหลายระดับความหายากในชุดเดียวกัน (UR + SE + PSE)
        "rarities": sorted(set(rarities)) or None,
    }
    return {k: v for k, v in card.items() if v}


def fetch_set(pid):
    url = f"{BASE}/card_search.action?ope=1&sess=1&request_locale=ja&pid={pid}&rp=99999"
    html = fetch(url)
    body = html.split('id="card_list"', 1)[-1]
    rows = body.split('<div class="t_row')[1:]
    return [c for c in (parse_row(r) for r in rows) if c.get("name")]


def build(only=None):
    packs = [p for p in PACKS if not only or p[0] in only or p[4] in only]
    log(f"▸ ดึงการ์ด Yu-Gi-Oh OCG {len(packs)} ชุด")
    sets, total, warn = [], 0, []
    for code, pid, name, expect, our_code in packs:
        try:
            cards = fetch_set(pid)
        except Exception as e:
            warn.append(f"{code}: ดึงไม่สำเร็จ — {str(e)[:80]}")
            log(f"   {code:6} ✗ {str(e)[:60]}")
            continue
        # ตัวกันข้อมูลขาดแบบเงียบ ๆ — จำนวนต้องตรงกับที่ทางการประกาศ
        flag = ""
        if len(cards) != expect:
            flag = f"  ⚠ ได้ {len(cards)} ควรได้ {expect}"
            warn.append(f"{code}: ได้ {len(cards)} ใบ แต่ทางการบอก {expect} แบบ")
        total += len(cards)
        sets.append({
            "code": code,
            "official_name": name,
            "our_set_code": our_code,
            "pid": pid,
            "expected_count": expect,
            "card_count": len(cards),
            "cards": cards,
        })
        log(f"   {code:6} {name[:44]:<44} {len(cards):>3} ใบ{flag}")
        time.sleep(DELAY)

    doc = {
        "_source": {
            "name": "遊戯王OCG カードデータベース — ฐานข้อมูลการ์ดทางการ Konami",
            "url": BASE + "/card_search.action",
            "fetched_at": dt.date.today().isoformat(),
            "lang": "ja",
        },
        "_license": LICENSE_NOTE,
        "_important": (
            "ข้อมูลเป็นภาษาญี่ปุ่นล้วน เพราะสินค้าที่เราขายเป็นซองพิมพ์ญี่ปุ่น (OCG) "
            "ไม่ใช่ TCG ฉบับอังกฤษ — จำนวนการ์ดในชุดของฉบับ Asian-English ต่างจากฉบับญี่ปุ่น "
            "(เช่น CHAOS ORIGINS ญี่ปุ่น 80 แบบ แต่ AE 120 แบบ) อย่าเอาตัวเลขข้ามฉบับกัน · "
            "ห้ามเอาชื่อการ์ดญี่ปุ่นไปเขียนแคปชั่นตรง ๆ ลูกค้าไทยอ่านไม่ออก "
            "ใช้เล่าเป็นธีมชุดหรือชื่อตัวละครที่คนรู้จักแทน"
        ),
        "_fields": {
            "rarities": "ระดับความหายากทุกแบบที่การ์ดใบนี้มีในชุด (ใบเดียวมีได้หลายแบบ)",
            "cid": "รหัสการ์ดในฐานข้อมูล Konami ใช้เปิดหน้ารายละเอียดได้",
            "our_set_code": "set_code ในตาราง skus ของเรา — ตั้งกันเอง ไม่ตรงกับรหัสทางการ",
            "expected_count": "จำนวนแบบที่ทางการประกาศ ใช้ตรวจว่าดึงมาครบไหม",
        },
        "_todo_db_fixes": [
            "skus.language ของ 4 SKU นี้บันทึกเป็น EN แต่ของจริงเป็นซองญี่ปุ่น ควรเป็น JA",
            "set_code ควรเปลี่ยนเป็นรหัสทางการ: CHAOS→CORI · HEROES→LOCH · REVALS→LOCR",
            "ชื่อ 'The Revals' สะกดผิด ที่ถูกคือ 'The Rivals' (หลังบ้านตู้ก็สะกดผิดตาม)",
        ],
        "_stats": {"sets": len(sets), "cards": total, "warnings": warn},
        "sets": sets,
    }
    p = OUT_DIR / "ygo_cards.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"   → {p.relative_to(ROOT)} ({p.stat().st_size/1024:.0f} KB) · "
        f"{len(sets)} ชุด {total} ใบ")
    for w in warn:
        log(f"   ⚠ {w}")
    return doc


def main():
    ap = argparse.ArgumentParser(description="สร้างคลังความรู้ Yu-Gi-Oh OCG")
    ap.add_argument("--set", help="เจาะเฉพาะชุดเดียว เช่น UT01")
    a = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build({a.set.upper()} if a.set else None)
    log("เสร็จ")


if __name__ == "__main__":
    main()
