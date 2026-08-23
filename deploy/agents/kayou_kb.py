"""สร้างคลังความรู้การ์ดสะสม KAYOU (卡游) จากเว็บทางการ kayouofficial.com

ครอบคลุมของที่เราขาย: Naruto (4 SKU) · My Little Pony (2 SKU)

⚠️ นี่คือ "การ์ดสะสม" ไม่ใช่เกมการ์ด — ไม่มีกฎการเล่น ไม่มีค่าพลัง
   สิ่งที่ลูกค้าถามคือ "ระดับความหายากมีอะไรบ้าง" กับ "โอกาสออกเท่าไหร่"
   ซึ่งเว็บทางการมีให้ครบ (rarityTiers + probabilities)

⚠️ KAYOU เป็นผู้ผลิตที่ถือไลเซนส์ **ไม่ใช่เจ้าของลิขสิทธิ์ตัวการ์ตูน**
   Naruto เป็นของ Pierrot · My Little Pony เป็นของ Hasbro
   ห้ามให้ระบบตอบว่า "การ์ด Naruto ของ Bandai" หรือ "ของ KAYOU" ลอย ๆ

ผลลัพธ์: deploy/tasks/kayou_cards.json

    py -3 deploy/agents/kayou_kb.py
    py -3 deploy/agents/kayou_kb.py --ip Naruto

หมายเหตุ: เว็บเป็น Next.js App Router — ข้อมูลฝังมาใน HTML ผ่าน self.__next_f.push()
ให้แกะ JSON ก้อนเดียวจบ **อย่าไปไล่ parse DOM** เพราะ class name เปลี่ยนทุก build
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

BASE = "https://www.kayouofficial.com/en-US"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
DELAY = 1.2

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "deploy" / "tasks"

# IP ที่เราขาย — ตัวอื่นบนเว็บ (KPop Demon Hunters, tokidoki) ไม่เกี่ยวกับตู้เรา
WANTED = {"Naruto", "My Little Pony"}

# ของที่เราขายแต่ยังไม่มีบนเว็บทางการ — ให้เตือนทุกครั้งที่รัน
# วันไหน KAYOU ขึ้นหน้าให้ เราจะรู้ทันทีโดยไม่ต้องมานั่งเช็คเอง
WATCH_FOR = {"transformers", "mobile legends", "mlbb"}

LICENSE_NOTE = ("เนื้อหาลิขสิทธิ์ KAYOU และเจ้าของตัวการ์ตูน (Naruto→Pierrot · MLP→Hasbro) "
                "ใช้อ้างอิงข้อมูลสินค้าเท่านั้น ห้ามใช้รูปการ์ดจากเว็บทางการเป็นภาพโพสต์ของเรา")


def log(msg):
    print(msg, flush=True)


def fetch(path, tries=3):
    url = path if path.startswith("http") else BASE + path
    last = None
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 + n * 3)
    raise RuntimeError(f"ดึง {url} ไม่สำเร็จ: {last}")


def _balanced(s, start):
    """ก้อน {...} ที่วงเล็บปิดครบ เริ่มจากตำแหน่ง start"""
    depth = 0
    for i in range(start, len(s)):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    raise ValueError("หาปีกกาปิดไม่เจอ")


def list_ips():
    """{ชื่อ IP: ipId} จากหน้ารวม — ทำแบบนี้แล้ว IP ใหม่จะเข้ามาเองไม่ต้องแก้โค้ด"""
    s = fetch("/ip-collections").replace('\\"', '"')
    return {name: ip for ip, name in re.findall(r'"id":"(ip-[a-z0-9]+)","name":"([^"]+)"', s)}


def list_series(ip_id):
    html = fetch(f"/ip-collections?ipId={ip_id}")
    return sorted(set(re.findall(r"/en-US/series/(series-[a-z0-9]+)", html)))


def _js_unescape(s):
    """ถอด escape ของสตริงแบบ JavaScript ให้เป็นข้อความจริง

    ห้ามใช้วิธีแทนที่ทีละตัว (replace('\\\\"','"')) — เคยลองแล้วพังทุกหน้าของ Naruto
    เพราะเจอ  Who\\'s Top Dog  ซึ่ง \\' ถูกกฎของ JS แต่ผิดกฎ JSON
    วิธีที่ทน: แปลง \\' เป็น ' ก่อน แล้วปล่อยให้ json ถอดที่เหลือ (\\\\n \\\\uXXXX \\\\\\\\) เอง
    """
    return json.loads('"' + re.sub(r"\\'", "'", s) + '"')


def parse_series(html):
    """แกะก้อน JSON ของซีรีส์ออกจาก flight payload ของ Next.js

    ทำงานบน HTML ดิบที่ยัง escape อยู่ — นับปีกกาได้เพราะปีกกาไม่ถูก escape
    แล้วค่อยถอด escape ทีเดียวตอนท้าย
    """
    i = html.find('\\"detail\\":{')
    if i < 0:
        raise ValueError("ไม่เจอก้อน detail ในหน้า")
    raw = _balanced(html, html.index("{", i))
    return json.loads(_js_unescape(raw))


def clean_cards(detail):
    """การ์ดหนึ่งใบ — ชื่อบางใบมี \\n ต่อท้ายเป็นเลขใบย่อยในชุดภาพ ต้องแยกออก

    เช่น "Akamaru Unleashed! Who's Top Dog Now?\\n5/5" = ใบที่ 5 จาก 5 ใบของภาพชุดเดียวกัน
    ถ้าไม่แยก ชื่อการ์ดในคลังจะมีเลขปนจนค้นไม่เจอ
    """
    tiers = {t.get("id"): t for t in (detail.get("rarityTiers") or [])}
    out = []
    for c in detail.get("cards") or []:
        name = (c.get("name") or "").strip()
        sub = None
        if "\n" in name:
            name, sub = [x.strip() for x in name.split("\n", 1)]
        tier = tiers.get(c.get("rarityId")) or {}
        out.append({k: v for k, v in {
            "code": c.get("idCode"),
            "name": name,
            "sheet_no": sub,
            "rarity": c.get("rarity"),
            "rarity_full": tier.get("subtitle"),
            "art_theme": tier.get("intro"),
            "image": c.get("image"),
            "back_image": c.get("backImage"),
            "sort": c.get("sortOrder"),
        }.items() if v not in (None, "")})
    return out


def build(only_ip=None):
    log("▸ ดูว่า KAYOU มี IP อะไรบ้างบนเว็บทางการ")
    ips = list_ips()
    log(f"   เจอ {len(ips)} IP: {', '.join(sorted(ips))}")

    # เฝ้าดูของที่เราขายแต่ยังไม่มีหน้าเว็บ
    found_watch = [n for n in ips if any(w in n.lower() for w in WATCH_FOR)]
    if found_watch:
        log(f"   ★ KAYOU เพิ่งขึ้นหน้าให้แล้ว: {', '.join(found_watch)} — เพิ่มเข้า WANTED ได้เลย")

    targets = {n: i for n, i in ips.items() if n in (only_ip or WANTED)}
    if not targets:
        log(f"   ⚠ ไม่เจอ IP ที่ต้องการ ({only_ip or WANTED})")
        return None

    series_out, total = [], 0
    for name, ip_id in sorted(targets.items()):
        sids = list_series(ip_id)
        log(f"▸ {name} — {len(sids)} ซีรีส์")
        time.sleep(DELAY)
        for sid in sids:
            try:
                d = parse_series(fetch(f"/series/{sid}"))
            except Exception as e:
                log(f"   {sid} ✗ {str(e)[:60]}")
                continue
            cards = clean_cards(d)
            total += len(cards)
            # editions เป็น list หลายเวอร์ชัน (กล่องสะสม/กล่องปกติ/ฉบับภูมิภาค)
            # อัตราออกการ์ดของแต่ละ edition ไม่เท่ากัน ห้ามหยิบตัวแรกมาใช้แทนทั้งหมด
            eds = [{
                "label": e.get("label"),
                "specs": {s.get("label"): s.get("value")
                          for s in (e.get("productSpecs") or []) if s.get("label")},
                "pull_rates": [{"per_pack": p.get("type"), "detail": p.get("detail")}
                               for p in (e.get("probabilities") or [])],
            } for e in (d.get("editions") or [])]
            series_out.append({
                "series_id": sid,
                "ip_name": d.get("ipName"),
                "line": d.get("seriesTypeName"),
                "title": d.get("title"),
                "label": d.get("seriesLabel"),
                "product_type": d.get("seriesTypeDescription"),
                "code_prefix": (cards[0]["code"].split("-")[0] if cards and cards[0].get("code") else None),
                "card_count": len(cards),
                "rarity_tiers": [{"name": t.get("name"), "full": t.get("subtitle"),
                                  "art_theme": t.get("intro"), "count": t.get("count")}
                                 for t in (d.get("rarityTiers") or [])],
                "editions": eds,
                "cards": cards,
            })
            log(f"   {d.get('seriesTypeName')} · {d.get('title')} "
                f"[{series_out[-1]['code_prefix']}] {len(cards):>4} ใบ · "
                f"{len(d.get('rarityTiers') or [])} ระดับความหายาก · {len(eds)} เวอร์ชันกล่อง")
            time.sleep(DELAY)

    doc = {
        "_source": {
            "name": "KAYOU — การ์ดสะสมทางการ (ฉบับส่งออกภาษาอังกฤษ)",
            "url": BASE + "/ip-collections",
            "fetched_at": dt.date.today().isoformat(),
            "lang": "en",
        },
        "_license": LICENSE_NOTE,
        "_important": (
            "การ์ดสะสม ไม่ใช่เกมการ์ด — ไม่มีกฎการเล่น ห้ามตอบลูกค้าว่าเอาไปเล่นแข่งได้ · "
            "KAYOU เป็นผู้ผลิตที่ถือไลเซนส์ ไม่ใช่เจ้าของตัวการ์ตูน "
            "(Naruto→Pierrot · My Little Pony→Hasbro) · "
            "specs กับอัตราออกการ์ดบนเว็บเป็นของฉบับอเมริกา "
            "ซึ่งอาจไม่ตรงกับกล่องฝั่งเอเชียที่เราขาย — อย่าเอาไปแก้ตัวเลขใน DB "
            "ต้องดูใบสอดในกล่องจริงก่อน"
        ),
        "_fields": {
            "code": "รหัสการ์ดทางการ เช่น NRSA02-R-050L1 — ใช้เป็นตัวอ้างอิงหลัก",
            "sheet_no": "เลขใบย่อยของภาพชุดเดียวกัน เช่น 5/5 (ไม่ใช่เลขในชุด)",
            "rarity_full": "ชื่อเต็มของระดับความหายาก เช่น SP = Special",
            "art_theme": "ชื่อธีมอาร์ตของระดับนั้น เช่น Interlude Theater",
            "editions": "กล่องแต่ละเวอร์ชัน — อัตราออกการ์ดไม่เท่ากัน ต้องระบุว่าพูดถึงเวอร์ชันไหน",
            "pull_rates": "อัตราออกการ์ดต่อซองจากเว็บทางการ (ฉบับอเมริกา)",
        },
        "_todo_mapping": (
            "ยังไม่ได้ผูกกับ sku_id ของเรา — รหัสของ KAYOU (NRSA01/NRI01) "
            "ไม่ตรงกับ set_code ที่เราตั้งเอง (JIN01/SERIES01) "
            "ต้องให้คนเทียบกล่องจริงก่อน อย่าเดา"
        ),
        "_stats": {"series": len(series_out), "cards": total,
                   "ips_on_site": sorted(ips), "not_on_site_yet": sorted(WATCH_FOR)},
        "series": series_out,
    }
    p = OUT_DIR / "kayou_cards.json"
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"   → {p.relative_to(ROOT)} ({p.stat().st_size/1024/1024:.1f} MB) · "
        f"{len(series_out)} ซีรีส์ {total:,} ใบ")
    return doc


def main():
    ap = argparse.ArgumentParser(description="สร้างคลังความรู้การ์ดสะสม KAYOU")
    ap.add_argument("--ip", help="เจาะเฉพาะ IP เดียว เช่น Naruto")
    a = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build({a.ip} if a.ip else None)
    log("เสร็จ")


if __name__ == "__main__":
    main()
