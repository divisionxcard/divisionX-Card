#!/usr/bin/env python3
"""จับคู่เวอร์ชันพาราเรลของ One Piece บน TCGplayer (TCGCSV) กับรูปทางการ asia-th — เทียบด้วยภาพ

ทำไม (22 ต.ค. 2026): เจ้าของเลือกให้ "ส่อง 5 ใบเด็ด" One Piece ใช้ card2price ก่อน ถ้าราคาเก่าเกิน 14 วัน
  ให้สลับไป TCGCSV เอง (card2price หยุดอัปเดตตั้งแต่ 5 ต.ค.) · ปัญหา: TCGplayer เรียกเวอร์ชันเป็นคำ
  (Parallel · Super Alternate Art · Red Super Alternate Art · Wanted Poster …) ส่วนรูปทางการใช้เลข _p1 … _pN
  และไม่มีข้อมูลบอกว่าเลขไหนคือแบบไหน · เดาแล้วได้รูปผิดใบ = แย่กว่าไม่มีใบนั้น (กติกาเดียวกับ lib/top5.js)
  → เทียบรูปของ TCGplayer กับรูปทางการทุกเวอร์ชันของเลขการ์ดเดียวกัน ใบที่ไม่ชัดไม่จับคู่

ผลลัพธ์: deploy/tasks/opcg_tcg_variants.json  { map: { "<productId>": {code, dist, margin, set, tag} }, unmatched: [...] }
  ตัวเลือก 5 ใบ (lib/top5.js) อ่านไฟล์นี้ตอนสลับไป TCGCSV · ใบที่ไม่มีในไฟล์และจับคู่แบบตรงตัวไม่ได้ = ไม่ใช้

วิธีเทียบ: ครอปเฉพาะส่วนภาพ (ตัดกรอบข้อความล่างที่ภาษาต่างกัน) → ขาวดำ → dHash 16×16 (256 บิต) → ระยะ Hamming
  รับเมื่อใกล้สุด ≤ MAX_DIST และห่างจากอันดับสองอย่างน้อย MIN_MARGIN · สองสินค้าชี้รูปเดียวกัน = เก็บตัวที่ใกล้กว่า

รัน: python deploy/agents/opcg_tcg_variants.py              (ทุกชุดในตู้ · ราว 10-15 นาที · แคชรูปไว้)
     python deploy/agents/opcg_tcg_variants.py --sets OP13 PRB01
ต้องมี Pillow (เครื่องเจ้าของมี · GitHub Actions ไม่มี — รันบนเครื่องแล้ว commit ผล)
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

for _s in (sys.stdout, sys.stderr):
    if _s is not None:
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
TASKS = ROOT / "deploy" / "tasks"
OUT = TASKS / "opcg_tcg_variants.json"
CACHE = ROOT / "deploy" / "agents" / ".cache" / "opimg"
UA = "DivisionXCard/1.0 (+https://division-x-card.vercel.app)"
TCG = "https://tcgcsv.com/tcgplayer/68"
OFFICIAL = "https://asia-th.onepiece-cardgame.com/images/cardlist/card/"
GAP = 0.25
MAX_DIST = 72          # จาก 256 บิต
MIN_MARGIN = 14
MAX_PARALLEL = 10
# จับคู่เฉพาะเวอร์ชันที่ราคาถึงเกณฑ์ — ใบราคาไม่กี่ดอลลาร์ไม่มีทางติด 5 อันดับ (รอบแรกไล่ทุกใบ ชุดเดียวกินหลายนาที)
MIN_PRICE = 5.0

# set_code ของเรา → ตัวย่อกลุ่มบน TCGplayer · OP14/OP15 ชื่อกลุ่ม "OP14-EB04"/"OP15-EB04" (ไม่มี "OP14" ตรง ๆ)
# · EB04 เองไม่ใส่ — ฉบับเอเชียเป็นซองแยก ราคาคนละตลาด (ต้องตรงกับ lib/tcgcsv.js → TCGCSV_SETS.OP)
GROUPS = {f"OP{i:02d}": f"OP{i:02d}" for i in range(1, 18)}
GROUPS.update({"OP14": "OP14-EB04", "OP15": "OP15-EB04"})
GROUPS.update({"EB01": "EB01", "EB02": "EB02", "EB03": "EB03", "PRB01": "PRB-01", "PRB02": "PRB-02"})


def log(m):
    print(m, flush=True)


def fetch(url, binary=False, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if k == tries - 1:
                raise
        except Exception:
            if k == tries - 1:
                raise
        time.sleep(1 + k * 2)


def cached_image(url):
    """ดึงรูป (แคชไว้ในเครื่อง) · ไม่มี = None"""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".bin")
    miss = CACHE / (f.name + ".404")
    if f.exists():
        return f.read_bytes()
    if miss.exists():
        return None
    data = fetch(url, binary=True)
    time.sleep(GAP)
    if not data:
        miss.write_text("")
        return None
    f.write_bytes(data)
    return data


def dhash(raw):
    im = Image.open(io.BytesIO(raw)).convert("L")
    w, h = im.size
    # ส่วนภาพ: ตัดขอบนอก 7% และกรอบข้อความล่าง (ราว 40% ล่าง ภาษาต่างกันระหว่างฉบับ)
    im = im.crop((int(w * .07), int(h * .07), int(w * .93), int(h * .60))).resize((17, 16), Image.LANCZOS)
    px = list(im.getdata())
    bits = 0
    for y in range(16):
        for x in range(16):
            bits = (bits << 1) | (1 if px[y * 17 + x] > px[y * 17 + x + 1] else 0)
    return bits


def dist(a, b):
    return bin(a ^ b).count("1")


def tags_of(name):
    """แท็กเวอร์ชันในวงเล็บ — ตัดวงเล็บที่เป็นเลขการ์ดทิ้ง: "(118)" และ "(OP01-016)" ของชุด PRB
    (ต้องตรงกับ opTags ใน lib/top5.js)"""
    return [t.strip() for t in re.findall(r"\(([^)]+)\)", name)
            if not re.fullmatch(r"\d{3}", t.strip()) and not re.fullmatch(r"[A-Z]{2,4}\d{2}-\d{3}", t.strip())]


def official_variants(code):
    """รูปทางการของเลขการ์ดนี้: ใบปกติ + _p1.._pN ที่มีจริง (หยุดเมื่อหายติดกัน 2 เลข)"""
    out = {}
    raw = cached_image(f"{OFFICIAL}{code}.png")
    if raw:
        out[code] = raw
    misses = 0
    for n in range(1, MAX_PARALLEL + 1):
        c = f"{code}_p{n}"
        raw = cached_image(f"{OFFICIAL}{c}.png")
        if raw:
            out[c] = raw
            misses = 0
        else:
            misses += 1
            if misses >= 2:
                break
    return out


def build(only=None):
    groups = json.loads(fetch(f"{TCG}/groups"))["results"]
    by_abbr = {re.sub(r"[^A-Z0-9]", "", (g.get("abbreviation") or "").upper()): g for g in groups}
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    mapping = dict(prev.get("map") or {})
    unmatched = [u for u in (prev.get("unmatched") or []) if only and u.get("set") not in only]

    for our, abbr in GROUPS.items():
        if only and our not in only:
            continue
        g = by_abbr.get(re.sub(r"[^A-Z0-9]", "", abbr.upper()))
        if not g:
            log(f"▸ {our}: ไม่เจอกลุ่ม {abbr} บน TCGCSV — ข้าม")
            continue
        products = json.loads(fetch(f"{TCG}/{g['groupId']}/products"))["results"]
        time.sleep(GAP)
        price = {}
        for r in json.loads(fetch(f"{TCG}/{g['groupId']}/prices"))["results"]:
            price[r["productId"]] = max(price.get(r["productId"], 0), r.get("marketPrice") or 0)
        time.sleep(GAP)
        # ลบผลเก่าของชุดนี้ แล้วทำใหม่ทั้งชุด
        mapping = {k: v for k, v in mapping.items() if v.get("set") != our}
        variants = [p for p in products
                    if any(e["name"] == "Number" for e in p.get("extendedData", [])) and tags_of(p["name"])
                    and price.get(p["productId"], 0) >= MIN_PRICE]
        log(f"▸ {our} ({abbr} · group {g['groupId']}) — เวอร์ชันพิเศษราคา ≥ ${MIN_PRICE:g}: {len(variants)} รายการ")
        by_num = {}
        for p in variants:
            num = next(e["value"] for e in p["extendedData"] if e["name"] == "Number")
            by_num.setdefault(num, []).append(p)

        hit = miss = 0
        for num, plist in sorted(by_num.items()):
            if not re.fullmatch(r"[A-Z]{2,4}\d{2}-\d{3}", num):
                continue
            offi = official_variants(num)
            offi_h = {c: dhash(r) for c, r in offi.items()}
            claims = {}
            for p in plist:
                img_url = (p.get("imageUrl") or "").replace("_200w", "_400w")
                raw = cached_image(img_url) or cached_image(p.get("imageUrl") or "")
                rec = {"productId": p["productId"], "name": p["name"], "set": our, "number": num}
                if not raw or not offi_h:
                    unmatched.append({**rec, "why": "ไม่มีรูป"})
                    miss += 1
                    continue
                h = dhash(raw)
                ranked = sorted((dist(h, oh), c) for c, oh in offi_h.items())
                best_d, best_c = ranked[0]
                margin = (ranked[1][0] - best_d) if len(ranked) > 1 else 256
                if best_c == num or best_d > MAX_DIST or margin < MIN_MARGIN:
                    why = ("ตรงกับใบปกติ" if best_c == num else "ไม่ใกล้พอ" if best_d > MAX_DIST else "ก้ำกึ่งสองรูป")
                    unmatched.append({**rec, "why": why, "best": best_c, "dist": best_d, "margin": margin})
                    miss += 1
                    continue
                prior = claims.get(best_c)
                if prior and prior["dist"] <= best_d:
                    unmatched.append({**rec, "why": f"รูปเดียวกับ {prior['productId']}", "best": best_c, "dist": best_d})
                    miss += 1
                    continue
                if prior:
                    unmatched.append({"productId": prior["productId"], "set": our, "number": num,
                                      "why": f"รูปเดียวกับ {p['productId']}", "best": best_c, "dist": prior["dist"]})
                    mapping.pop(str(prior["productId"]), None)
                    miss += 1
                    hit -= 1
                claims[best_c] = {"productId": p["productId"], "dist": best_d}
                mapping[str(p["productId"])] = {"code": best_c, "dist": best_d, "margin": margin, "set": our,
                                                "number": num, "tag": " · ".join(tags_of(p["name"]))}
                hit += 1
        log(f"   จับคู่ได้ {hit} · ไม่จับคู่ {miss}")

    doc = {
        "_source": {"tcgcsv": TCG, "official": OFFICIAL, "built_at": dt.date.today().isoformat()},
        "_method": f"dHash 256 บิตของส่วนภาพ · รับเมื่อระยะ ≤ {MAX_DIST} และห่างอันดับสอง ≥ {MIN_MARGIN} · ดู docstring ของ opcg_tcg_variants.py",
        "_why": "แปลงเวอร์ชันของ TCGplayer (ชื่อเป็นคำ) เป็นรหัสรูปทางการ (_pN) สำหรับ 5 ใบเด็ด One Piece ตอนสลับไป TCGCSV",
        "map": mapping,
        "unmatched": unmatched,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"→ {OUT.relative_to(ROOT)} · จับคู่รวม {len(mapping)} · ไม่จับคู่ {len(unmatched)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets", nargs="*")
    a = ap.parse_args()
    build(set(a.sets) if a.sets else None)


if __name__ == "__main__":
    main()
