#!/usr/bin/env python3
"""คลังการ์ด Pokémon ฉบับญี่ปุ่น — เลขการ์ด · ระดับความหายาก · รูปทางการ ของชุดที่ขายในตู้

ทำไม (22 ต.ค. 2026): ซีรีส์ "ส่อง 5 ใบเด็ด" ขยายไปทุกค่าย
  - ซองโปเกมอนในตู้เป็นฉบับญี่ปุ่น (M2a · M4 · M5) แต่ pkm_cards.json เป็นฉบับไทยที่รวมชุด
    (MA5 = M4 + M5) และ**ไม่มีระดับความหายากเลย** → จัด 5 อันดับไม่ได้
  - เจ้าของเลือกใช้รูปการ์ดจริงจากเว็บทางการ (ยอมรับความเสี่ยงเอง) และราคาจาก TCGCSV
    ซึ่งระบุการ์ดด้วยเลข "118/081" → ต้องมีตารางเลขการ์ด → รูปทางการ

ที่มา: www.pokemon-card.com (เว็บทางการญี่ปุ่น)
  รายการ: /card-search/resultAPI.php?pg=<ชุด>&page=N → cardID + cardThumbFile (รูปใหญ่ 868×1212)
  เลข/ความหายาก: /card-search/details.php/card/<cardID>/regu/all → "114&nbsp;/&nbsp;081" + ic_rare_<x>.gif

⚠️ ลำดับ cardID ไม่ใช่ลำดับเลขการ์ด (ทดสอบแล้ว M5 ตำแหน่งที่ 118 ไม่ใช่ใบ 118/081) — ต้องเปิดหน้ารายละเอียดทุกใบ
⚠️ ชื่อไฟล์รูปมีชื่อการ์ดแบบโรมาจิ เดาจาก ID ไม่ได้ ต้องอ่านจาก cardThumbFile
⚠️ เว็บทางการเขียนห้ามนำรูปไปเผยแพร่ซ้ำโดยไม่ได้รับอนุญาต — เจ้าของรับความเสี่ยงเอง 22 ต.ค. 2026
   (ใช้เฉพาะการ์ดในชุดที่โพสต์พูดถึง · ดู memory project_pack_image_rights)

รัน: python deploy/agents/pkm_jp_kb.py            (~500 หน้า · เว้น 0.6 วิ · ราว 5-6 นาที)
     python deploy/agents/pkm_jp_kb.py --sets M5   (เฉพาะชุดเดียว)
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

# ⚠️ เครื่องนี้ ACP = cp1252 — พิมพ์ไทย/ญี่ปุ่นแล้วตายถ้าถูกเรียกแบบไม่มีคอนโซล (ดู CLAUDE.md)
for _s in (sys.stdout, sys.stderr):
    if _s is not None:
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

BASE = "https://www.pokemon-card.com"
UA = "DivisionXCard/1.0 (+https://division-x-card.vercel.app)"
DELAY = 0.6

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "deploy" / "tasks" / "pkm_jp_cards.json"

# ชุดที่อยู่ในตู้ — คีย์ = skus.set_code (ยืนยันจากรูปซองจริง 24 ส.ค. 2026 · ดู pkm_cards.json → _pack_confirmed)
SETS = {
    "M2a": {"our_sku_id": "PKM Dream EX", "name_ja": "ハイクラスパック MEGAドリームex"},
    "M4": {"our_sku_id": "PKM Ninja", "name_ja": "拡張パック ニンジャスピナー"},
    "M5": {"our_sku_id": "PKM Ghost", "name_ja": "拡張パック アビスアイ"},
}

# ไอคอนความหายากบนเว็บ → ชื่อเต็ม (ยืนยันจากหน้ารายละเอียด · MA = Mega Attack Rare มีเฉพาะ M2a)
RARITY_FULL = {
    "mur": "MUR (Mega Ultra Rare)", "sar": "SAR (Special Art Rare)", "ma": "MA (Mega Attack Rare)",
    "sr": "SR (Super Rare)", "ar": "AR (Art Rare)", "ur": "UR (Ultra Rare)", "rr": "RR (Double Rare)",
    "r": "R (Rare)", "u": "U (Uncommon)", "c": "C (Common)",
}


def log(msg):
    print(msg, flush=True)


def fetch(url, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if k == tries - 1:
                raise
            log(f"   ลองใหม่ ({str(e)[:50]})")
            time.sleep(2 + k * 3)


def list_set(code):
    cards, page, maxp = [], 1, 1
    while page <= maxp:
        q = urllib.parse.urlencode({
            "keyword": "", "se_ta": "", "regulation_sidebar_form": "all", "pg": code,
            "illust": "", "sm_and_keyword": "true", "page": page,
        })
        d = json.loads(fetch(f"{BASE}/card-search/resultAPI.php?{q}"))
        maxp = int(d.get("maxPage") or 1)
        cards += d.get("cardList") or []
        page += 1
        time.sleep(DELAY)
    return cards


NUM_RE = re.compile(r"(\d{3})&nbsp;/&nbsp;(\d{3})")
# ไอคอนมีหลายรูปแบบ: ic_rare_sar.gif · ic_rare_sr_c.gif · ic_rare_u_c.gif · ic_rare_MUR.gif (ตรวจ 22 ต.ค. 2026)
RAR_RE = re.compile(r"ic_rare_([A-Za-z0-9_]+)\.gif")
CACHE = ROOT / "deploy" / "agents" / ".cache" / "pkmjp"


def detail(card_id):
    """→ ((เลข, จำนวนชุด), รหัสความหายาก, มาจากแคชไหม) · แคชหน้า HTML ไว้ รันซ้ำไม่ต้องเปิดใหม่ทั้ง ~500 หน้า"""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"d{card_id}.html"
    hit = f.exists()
    html = f.read_text(encoding="utf-8") if hit else fetch(f"{BASE}/card-search/details.php/card/{card_id}/regu/all")
    if not hit:
        f.write_text(html, encoding="utf-8")
    m = NUM_RE.search(html)
    r = RAR_RE.search(html)
    rar = re.sub(r"_c$", "", r.group(1)).lower() if r else None
    return ((int(m.group(1)), int(m.group(2))) if m else (None, None)), rar, hit


def build(only=None):
    out_sets = []
    for code, meta in SETS.items():
        if only and code not in only:
            continue
        log(f"▸ {code} — ดึงรายการ")
        lst = list_set(code)
        log(f"   {len(lst)} ใบ · เปิดหน้ารายละเอียดทีละใบ")
        cards = []
        for i, c in enumerate(lst, 1):
            (num, total), rar, hit = detail(c["cardID"])
            cards.append({
                "jp_id": c["cardID"],
                "number": f"{num:03d}/{total:03d}" if num else None,
                "num": num,
                "rarity": rar.upper() if rar else None,
                "rarity_full": RARITY_FULL.get(rar or "", None),
                "name_ja": c.get("cardNameViewText") or c.get("cardNameAltText"),
                "image": BASE + c["cardThumbFile"] if c.get("cardThumbFile") else None,
            })
            if i % 40 == 0:
                log(f"   {i}/{len(lst)}")
            if not hit:
                time.sleep(DELAY)
        cards.sort(key=lambda x: x["num"] or 9999)
        out_sets.append({"code": code, **meta, "card_count": len(cards), "cards": cards})
        log(f"   ✓ {code} {len(cards)} ใบ · ไม่มีเลข {sum(1 for x in cards if not x['number'])} · "
            f"ไม่มีความหายาก {sum(1 for x in cards if not x['rarity'])}")

    prev = {}
    if only and OUT.exists():
        prev = {s["code"]: s for s in json.loads(OUT.read_text(encoding="utf-8")).get("sets", [])}
    for s in out_sets:
        prev[s["code"]] = s
    doc = {
        "_source": {"name": "ポケモンカードゲーム公式 カード検索", "url": BASE + "/card-search/",
                    "fetched_at": dt.date.today().isoformat(), "lang": "ja"},
        "_why": "ซองโปเกมอนในตู้เป็นฉบับญี่ปุ่น · ใช้จับคู่ราคา TCGCSV (เลข 118/081) กับรูปทางการ — ดู docstring ของ pkm_jp_kb.py",
        "_license": ("เนื้อหาลิขสิทธิ์ The Pokémon Company / Nintendo / Creatures / GAME FREAK · "
                     "รูปการ์ดใช้ในโปสเตอร์ 'ส่อง 5 ใบเด็ด' ตามที่เจ้าของเลือก 22 ต.ค. 2026 (ยอมรับความเสี่ยงเอง)"),
        "_fields": {"number": "เลขบนการ์ด เช่น 118/081 (เลขหลังเกินจำนวนชุด = การ์ดลับ)",
                    "rarity": "จากไอคอนบนเว็บ (M2a ใบ 001–193 ไม่มีไอคอน = ใบปกติของแพ็กไฮคลาส)",
                    "name_ja": "ชื่อญี่ปุ่น — ห้ามยกลงแคปชั่นตรง ๆ (ใช้ชื่ออังกฤษจาก TCGCSV)"},
        "sets": [prev[k] for k in SETS if k in prev],
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"→ {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets", nargs="*", help="เฉพาะบางชุด เช่น M5")
    a = ap.parse_args()
    build(set(a.sets) if a.sets else None)


if __name__ == "__main__":
    main()
