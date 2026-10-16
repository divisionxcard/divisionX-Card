"""แผนคลิป "รูปแบบ" สำหรับ HyperFrames — สคริปต์ + ฉากสร้างจากข้อมูลจริงในฐานข้อมูล

ทำไมมีไฟล์นี้ (16 ต.ค. 2026):
    เจ้าของบอก HyperFrames "ดีกว่าเดิมมาก แต่ยังขาดอนิเมชันรูปแบบใหม่ ๆ ที่ต่างจากรูปซองกับตู้"
    สำรวจคลิปสั้นวงการการ์ด ไทย + ญี่ปุ่น + ต่างประเทศ (~75 คลิป · ยอดวิวจริง) แล้วพบว่า
      - คลิปแบบที่เราทำอยู่ (ซองพุ่ง → หมุน → ตู้ → โลโก้) แทบเหมือน "PRODUCT REVEAL" ของ Bandai เอง
        ซึ่งได้ 83–3.3K วิวต่อคลิป → ความสวยไม่ใช่ตัวแยกคลิปติด
      - คลิปหลักล้านมีร่วมกัน: คำถาม/ให้เลือก · ของค้างบนจอที่ค่อย ๆ เติม · สถานที่/ตู้จริง · เฉลยท้ายคลิป
      - ช่องว่างที่ร้านการ์ดไทยยังไม่มีใครทำ: อันดับจากยอดขายจริง · พิกัดตู้ · ทาย/เลือกชุด
    รายงานเต็ม: wiki/worklog/2026-10-16-video-formats-research.md

กติกาที่ทุกรูปแบบต้องถือ (กฎ overclaim ของแบรนด์):
    - ข้อความบนจอ/เสียงพากย์มาจากข้อมูลจริงเท่านั้น ไม่แต่งตัวเลข ไม่อ้างของหายาก/เหลือน้อย
    - ยอดขายแสดงเป็น "อันดับ" ไม่โชว์จำนวน จนกว่าเจ้าของจะอนุญาต
    - ไม่บอกว่าชุดไหน "มีที่ตู้" ถ้าไม่ได้เช็กสต็อก → ปิดท้ายด้วย "เช็กหน้าตู้ก่อนไป"

รัน (จาก deploy/):
    ../.venv-image/Scripts/python.exe -m agents.video.hf_formats rank --days 7 --out แผน.json
    เพิ่ม --render เพื่อเรนเดอร์ต่อทันที (ผ่าน hf_render.build_video)
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

from . import config

TH = dt.timezone(dt.timedelta(hours=7))
TH_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
TH_RANK = {1: "หนึ่ง", 2: "สอง", 3: "สาม", 4: "สี่", 5: "ห้า"}
BRAND = {"OP": "One Piece", "DB": "Dragon Ball Super", "PKM": "Pokémon", "YGH": "Yu-Gi-Oh!",
         "NRT": "Naruto", "MLP": "My Little Pony", "MLBB": "MLBB", "SL": "Solo Leveling", "TF": "Transformers"}
CTA = {"type": "cta", "img": "machine:scene"}          # ฉากปิดเดิม: "เช็กหน้าตู้ก่อนไป" + #DivisionXCard


def _rest(path):
    url, key = config.env("NEXT_PUBLIC_SUPABASE_URL"), config.env("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise RuntimeError("ไม่มีคีย์ Supabase ใน deploy/.env.local")
    out, page = [], 1000
    while True:
        req = urllib.request.Request(f"{url}/rest/v1/{path}", headers={
            "apikey": key, "Authorization": f"Bearer {key}", "Range": f"{len(out)}-{len(out) + page - 1}"})
        rows = json.load(urllib.request.urlopen(req, timeout=60))
        out += rows
        if len(rows) < page:
            return out


def thai_range(d0, d1):
    """9–15 ต.ค. 69 · ข้ามเดือน: 28 ก.ย.–4 ต.ค. 69 (ปี พ.ศ. 2 หลัก)"""
    yy = str(d1.year + 543)[-2:]
    if d0.month == d1.month:
        return f"{d0.day}–{d1.day} {TH_MONTHS[d1.month]} {yy}"
    return f"{d0.day} {TH_MONTHS[d0.month]}–{d1.day} {TH_MONTHS[d1.month]} {yy}"


def display(sku):
    """แถวจาก skus → (ชื่อบนจอ, ค่าย, คำอ่าน)
    One Piece / Dragon Ball ใช้รหัสบนซอง (OP-13 · FB-01) · ค่ายอื่นใช้ชื่อชุดโดยตัดชื่อค่าย/รหัสออก"""
    fr = sku.get("franchise") or ""
    brand = BRAND.get(fr, fr)
    sid = sku["sku_id"]
    if fr in ("OP", "DB"):
        name = re.sub(r"\s+", "-", sid.strip())
        return name, brand, name
    raw = sku.get("name") or sid
    name = re.sub(r"^(Pokemon|Yu-Gi-Oh|Naruto|My Little Pony|MLBB|SOLO Leveling|TF)\s+", "", raw, flags=re.I)
    name = re.sub(r"^M\d+[a-z]?\s+", "", name)          # Pokemon M5 Abyss Eye → Abyss Eye
    return name, brand, f"{brand} {name}"


def sales_counts(days=7, machine=None):
    """ยอดขาย (นับเป็นซอง) ต่อ SKU ของ N วันเต็มล่าสุด (ถึงเมื่อวาน) → (count, skus, (วันแรก, วันสุดท้าย))
    แถว unit=box เก็บ quantity_sold เป็นจำนวนซองอยู่แล้ว (กล่อง OP = 24) — ห้ามคูณ packs_per_box ซ้ำ
    (ลองคูณแล้ว OP-16 กระโดดจากอันดับ 6 ไปอันดับ 2 ด้วยยอด 593 — ตรวจ 16 ต.ค.)"""
    today = dt.datetime.now(TH).date()
    d1, d0 = today - dt.timedelta(days=1), today - dt.timedelta(days=days)
    lo = dt.datetime.combine(d0, dt.time(0), TH).isoformat()
    hi = dt.datetime.combine(today, dt.time(0), TH).isoformat()
    q = f"sales?select=sku_id,quantity_sold,unit&sold_at=gte.{urllib.parse.quote(lo)}&sold_at=lt.{urllib.parse.quote(hi)}"
    if machine:
        q += f"&machine_id=eq.{urllib.parse.quote(machine)}"
    skus = {s["sku_id"]: s for s in _rest("skus?select=sku_id,name,franchise,image_url,image_url_box")}
    count = {}
    for r in _rest(q):
        if r["sku_id"] in skus:
            count[r["sku_id"]] = count.get(r["sku_id"], 0) + int(r.get("quantity_sold") or 0)
    return count, skus, (d0, d1)


def top_sellers(days=7, n=5, machine=None):
    count, skus, (d0, d1) = sales_counts(days, machine)
    ranked = sorted(count.items(), key=lambda kv: (-kv[1], kv[0]))
    ranked = [(sid, c) for sid, c in ranked if skus[sid].get("image_url") or skus[sid].get("image_url_box")][:n]
    return [(skus[sid], c) for sid, c in ranked], (d0, d1)


def rank_plan(days=7, machine=None, voice="Puck"):
    """กระดานอันดับขายดี 5 ช่อง · 7 บรรทัด (คำถาม · อันดับ 5→1 · ปิด)"""
    top, (d0, d1) = top_sellers(days, 5, machine)
    if len(top) < 5:
        raise ValueError(f"ยอดขาย {days} วันมีแค่ {len(top)} ชุด — ต้องครบ 5")
    where = "ตู้นี้" if machine else "ตู้ DivisionX"
    # "สัปดาห์" แทน "7 วัน" — ตัวเลขในประโยคโดนตัดแยกท่อนซับ ("…DivisionX 7" / "วันที่ผ่านมา?")
    when = "สัปดาห์ที่ผ่านมา" if days == 7 else f"{days} วันที่ผ่านมา"
    items, lines = [], [f"ซองไหนขายดีที่สุด ใน{where} {when}?"]
    for r, (sku, _count) in enumerate(top, 1):
        name, brand, say = display(sku)
        items.append({"sku": sku["sku_id"], "name": name, "tag": brand, "say": say})
    for r in range(5, 0, -1):
        say = items[r - 1]["say"]
        lines.append(f"และอันดับหนึ่ง… {say}!" if r == 1 else f"อันดับ{TH_RANK[r]} {say}")
    lines.append("อยากได้ชุดไหน เช็กหน้าตู้ใกล้บ้านก่อนไปนะ")
    scene = {"type": "rank", "span": 6, "kicker": "TOP 5 · ยอดขายจริง", "q1": "ซองไหน", "q2": "ขายดีที่สุด?",
             "sub": f"ยอดขายจริงจาก{where}{'' if machine else ' ทุกสาขา'} · {thai_range(d0, d1)}",
             "items": [{k: it[k] for k in ("sku", "name", "tag")} for it in items]}
    return {"project": f"rank-{d1:%Y%m%d}", "engine": "hyperframes", "voice": voice,
            "voice_style": "อ่านแบบพิธีกรนับอันดับ ตื่นเต้นขึ้นเรื่อย ๆ จังหวะเร็ว เน้นชื่อชุด",
            "script": "\n".join(lines), "scenes": [scene, dict(CTA)]}


def _op_number(sku_id):
    m = re.fullmatch(r"OP (\d+)", sku_id)
    return int(m.group(1)) if m else -1


def versus_plan(days=7, machine=None, voice="Puck", picks=None):
    """เลือกข้าง 3 รอบ ผู้ชนะอยู่ต่อ · เฉลยจากยอดขายจริง
    ผู้เข้าแข่งปริยาย: OP ชุดใหม่สุด · OP ชุดก่อนหน้า · Pokémon ขายดีสุด · Dragon Ball ขายดีสุด (ต้องมียอดขาย)"""
    count, skus, (d0, d1) = sales_counts(days, machine)
    sold = {sid: c for sid, c in count.items() if c > 0 and (skus[sid].get("image_url") or skus[sid].get("image_url_box"))}
    if picks:
        ids = [p for p in picks if p in sold]
    else:
        ops = sorted((s for s in sold if _op_number(s) > 0), key=_op_number, reverse=True)
        best = lambda fr: max((s for s in sold if skus[s].get("franchise") == fr), key=lambda s: sold[s], default=None)
        ids = [x for x in ops[:2] + [best("PKM"), best("DB")] if x]
    ids = list(dict.fromkeys(ids))[:4]
    if len(ids) < 2:
        raise ValueError("ผู้เข้าแข่งที่มียอดขายไม่พอ (ต้องอย่างน้อย 2)")
    items = []
    for sid in ids:
        name, brand, say = display(skus[sid])
        items.append({"sku": sid, "name": name, "tag": brand, "say": say})
    R = len(items) - 1
    from .hf_render import versus_sides
    wins, champ = [], None
    for k in range(1, R + 1):
        a, b = (1, 2) if k == 1 else (champ, k + 1)
        champ = a if sold[ids[a - 1]] >= sold[ids[b - 1]] else b
        wins.append(champ)
    side, pairs = versus_sides(R, wins)
    rounds, lines = [], ["ถ้าให้เลือกหนึ่งซอง คุณเลือกอันไหน?"]
    for k, (a, b) in enumerate(pairs, 1):
        w = wins[k - 1]
        left = a if side[a] == "L" else b
        right = b if left == a else a
        shL = sold[ids[left - 1]] / (sold[ids[left - 1]] + sold[ids[right - 1]])
        rounds.append({"win": w, "shL": round(shL, 3)})
        sa, sb, sw = items[a - 1]["say"], items[b - 1]["say"], items[w - 1]["say"]
        if k == 1:
            lines += [f"{sa} หรือ {sb}?", f"ลูกค้าตู้เราซื้อ {sw} มากกว่า!"]
        elif w == a:
            lines += [f"แล้ว {sa} เจอ {sb} ล่ะ?", f"{sw} ยังขายดีกว่า!"]
        else:
            lines += [f"แล้ว {sa} กับ {sb} ล่ะ?", f"รอบนี้ลูกค้าซื้อ {sw} มากกว่า!"]
    lines.append("คุณเดาถูกไหม? เช็กหน้าตู้ใกล้บ้านก่อนไปนะ")
    scene = {"type": "versus", "span": 1 + 2 * R, "kicker": "เลือกข้าง!", "q1": "คุณเลือก", "q2": "ซองไหน?",
             "sub": f"เฉลยจากยอดขายจริงตู้ DivisionX · {thai_range(d0, d1)}", "final": "แชมป์ตู้เรา!",
             "items": [{k: it[k] for k in ("sku", "name", "tag")} for it in items], "rounds": rounds}
    return {"project": f"versus-{d1:%Y%m%d}", "engine": "hyperframes", "voice": voice,
            "voice_style": "อ่านแบบพิธีกรเกมโชว์ ชวนลุ้น เว้นจังหวะก่อนบอกผู้ชนะ จังหวะเร็ว",
            "script": "\n".join(lines), "scenes": [scene, dict(CTA)]}


def quiz_plan(sku=None, voice="Puck", days=7, machine=None):
    """ทายชุดจากลายซอง · ปริยาย = One Piece ที่ขายดีสุดในช่วงนั้น (คนดูส่วนใหญ่เล่น OP)"""
    count, skus, _ = sales_counts(days, machine)
    if not sku:
        ops = [s for s in count if skus[s].get("franchise") == "OP" and skus[s].get("image_url")]
        sku = max(ops, key=lambda s: count[s]) if ops else "OP 17"
    row = skus.get(sku)
    if not row or not row.get("image_url"):
        raise ValueError(f"SKU {sku} ไม่มีรูปซอง")
    name, brand, say = display(row)
    lines = ["ทายซิ! ซองนี้ชุดอะไร?",
             "รู้แล้วพิมพ์ในคอมเมนต์เลย… สาม… สอง… หนึ่ง…",
             f"เฉลย! {say}",
             "ทายถูกไหม? เช็กหน้าตู้ใกล้บ้านก่อนไปนะ"]
    scene = {"type": "quiz", "span": 3, "sku": sku, "kicker": "QUIZ · ทายชุด", "q1": "ทายซิ!", "q2": "ซองนี้ชุดอะไร?",
             "sub": f"ใบ้ให้: ซอง {brand}", "prompt": "พิมพ์คำตอบในคอมเมนต์!", "name": name,
             "tag": f"{brand} Card Game" if brand in ("One Piece", "Pokémon") else brand}
    return {"project": f"quiz-{re.sub(r'[^a-z0-9]+', '-', sku.lower()).strip('-')}", "engine": "hyperframes",
            "voice": voice, "voice_style": "อ่านแบบพิธีกรเกมทายปัญหา สนุก ชวนลุ้น นับถอยหลังช้า ๆ ชัด ๆ แล้วเฉลยเสียงดัง",
            "script": "\n".join(lines), "scenes": [scene, dict(CTA)]}


# พิกัดห้าง "โดยประมาณ" (ละติจูด, ลองจิจูด) — ใช้วางหมุดบนแผนที่กราฟิกเท่านั้น ไม่ใช่การนำทาง
# ห้างใหม่ที่ไม่อยู่ในตารางจะไม่มีหมุด (แต่ยังนับจำนวนตู้) — เพิ่มที่นี่เมื่อเปิดสาขาใหม่
# ไอคอนสยามเลื่อนไปฝั่งตะวันตกของเส้นแม่น้ำเล็กน้อย (ห้างอยู่ฝั่งธนฯ แต่เส้นแม่น้ำในแผนที่เป็นเส้นหยาบ)
MALLS = {"ไอคอนสยาม": (13.7267, 100.5055), "เซ็นทรัลพระราม 9": (13.7588, 100.5654), "ซีคอนบางแค": (13.7060, 100.3960),
         "เดอะมอลล์บางแค": (13.7120, 100.4090), "เซ็นทรัลรามอินทรา": (13.8705, 100.6005),
         "เซ็นทรัลเวสต์วิลล์": (13.8210, 100.4566), "เซ็นทรัลเวสต์เกต": (13.8773, 100.4110),
         "เซ็นทรัลพระราม 2": (13.6635, 100.4378), "เดอะมอลล์บางกะปิ": (13.7666, 100.6431),
         "เซ็นทรัลศาลายา": (13.7905, 100.2790), "เซ็นทรัลชลบุรี": (13.3380, 100.9710)}
MAP_W, MAP_H, LON0, LON1, LAT1 = 960, 700, 100.25, 100.70, 13.93       # ต้องตรงกับ fmt-map.html
LATSPAN = (LON1 - LON0) * 0.97106 / (MAP_W / MAP_H)                       # cos(13.8°)


def _map_xy(lat, lon):
    x, y = (lon - LON0) / (LON1 - LON0) * MAP_W, (LAT1 - lat) / LATSPAN * MAP_H
    return (round(x, 1), round(y, 1)) if 20 <= x <= MAP_W - 20 and 20 <= y <= MAP_H - 20 else None


def branches():
    """ตู้ที่เปิดอยู่และ public → [{machine_id, mall, floor, landmark, order}]"""
    out = []
    for m in _rest("machines?select=machine_id,status,config&status=eq.active"):
        b = (m.get("config") or {}).get("branch") or {}
        if b.get("public") is False or not b.get("display_name"):
            continue
        out.append({"machine_id": m["machine_id"], "mall": b["display_name"], "floor": b.get("floor") or "",
                    "landmark": b.get("landmark") or "", "order": b.get("order") or 99})
    return sorted(out, key=lambda r: (r["order"], r["machine_id"]))


def map_plan(machine=None, voice="Puck", **_):
    """พิกัดตู้: หมุดทุกสาขา → ซูมห้างของตู้ที่เลือก → ชั้น → จุดสังเกต (ข้อมูลจาก machines.config.branch)"""
    rows = branches()
    if not rows:
        raise ValueError("ไม่มีตู้ที่เปิดอยู่")
    focus = next((r for r in rows if r["machine_id"] == machine), None) if machine else \
        next((r for r in rows if r["mall"] == "ไอคอนสยาม"), rows[0])
    if not focus:
        raise ValueError(f"ไม่พบตู้ {machine} (หรือไม่ได้ตั้ง public)")
    by_mall = {}
    for r in rows:
        by_mall.setdefault(r["mall"], []).append(r)
    pins, off = [], []
    for mall, rs in by_mall.items():
        xy = _map_xy(*MALLS[mall]) if mall in MALLS else None
        if xy:
            pins.append(f"{xy[0]},{xy[1]},{len(rs)}")
        elif mall in MALLS:
            off.append(re.sub(r"^เซ็นทรัล", "", mall))         # นอกกรอบแผนที่ (เช่น ชลบุรี)
    fxy = _map_xy(*MALLS[focus["mall"]]) if focus["mall"] in MALLS else None
    if not fxy:
        raise ValueError(f"ห้าง {focus['mall']} ไม่มีพิกัดในแผนที่ (เพิ่มใน MALLS)")
    floor = re.sub(r"^ชั้น\s*", "", focus["floor"]).strip()
    n_mach, n_mall = len(rows), len(by_mall)
    go = "อยู่ที่" if floor.upper() in ("G", "1", "") else "ขึ้นไป"
    lines = [f"ตู้การ์ด DivisionX มี {n_mach} ตู้ ใน {n_mall} ห้าง",
             f"วันนี้พาไปที่ {focus['mall']}",
             f"{go}ชั้น {floor}" if floor else "ตามมาเลย",
             f"ตู้อยู่{focus['landmark']}" if focus["landmark"] else f"ตู้อยู่ที่{focus['mall']}",
             "แวะมาได้เลย เช็กหน้าตู้ก่อนไปนะ"]
    scene = {"type": "map", "span": 4, "kicker": "พิกัดตู้ DivisionX", "q1": "ตู้การ์ด", "q2": "อยู่ตรงไหน?",
             "sub": f"{n_mach} ตู้ ใน {n_mall} ห้าง", "count": n_mach, "pins": ";".join(pins),
             "offmap": " · ".join(off), "fx": fxy[0], "fy": fxy[1], "mall": focus["mall"], "floor": floor,
             "landmark": focus["landmark"]}
    return {"project": f"map-{focus['machine_id']}", "engine": "hyperframes", "voice": voice,
            "voice_style": "อ่านแบบไกด์พาเที่ยว สดใส เป็นกันเอง จังหวะเร็ว เน้นชื่อห้างกับเลขชั้น",
            "script": "\n".join(lines), "scenes": [scene, dict(CTA)]}


FORMATS = {"rank": rank_plan, "versus": versus_plan, "quiz": quiz_plan, "map": map_plan}


def main(argv=None):
    for s in (sys.stdout, sys.stderr):                 # ACP เครื่องนี้ cp1252 — พิมพ์ไทยต้องตั้งเอง
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="สร้างแผนคลิปรูปแบบจากข้อมูลจริง")
    ap.add_argument("format", choices=sorted(FORMATS))
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--machine", help="จำกัดเฉพาะตู้ (machine_id)")
    ap.add_argument("--voice", default="Puck")
    ap.add_argument("--sku", help="quiz: ชุดที่ให้ทาย (sku_id เช่น 'OP 15')")
    ap.add_argument("--out", help="เขียนแผนลงไฟล์ JSON")
    ap.add_argument("--render", action="store_true", help="เรนเดอร์ต่อทันที")
    a = ap.parse_args(argv)
    kw = {"days": a.days, "machine": a.machine, "voice": a.voice}
    if a.format == "quiz":
        kw["sku"] = a.sku
    plan = FORMATS[a.format](**kw)
    text = json.dumps(plan, ensure_ascii=False, indent=2)
    if a.out:
        pathlib.Path(a.out).write_text(text, encoding="utf-8")
    print(text)
    if a.render:
        from . import hf_render
        out, dur = hf_render.build_video(plan)
        print(f"[formats] เสร็จ {out} · {dur:.1f} วิ")


if __name__ == "__main__":
    main()
