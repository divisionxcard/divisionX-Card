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


# ── คลังสำนวน (เจ้าของ 16 ต.ค.: "อยากให้ระบบออกแบบได้อิสระ ไม่จำเจ") ─────────────────────────────
# ทุกบรรทัดมีหลายแบบ · hf_director เลือกแบบเลี่ยงสำนวนที่คลิปล่าสุดเพิ่งใช้ (บันทึกใน plan["copy"])
# กติกาเดียวกันทุกแบบ: พูดแค่ข้อเท็จจริงที่มีในข้อมูล · ไม่อ้างของหายาก/เหลือน้อย/มีของที่ตู้ · ไม่มีตัวเลขยอดขาย
# q1/q2 (หัวเรื่องบนจอ) ยาวได้ — hf_render ย่อขนาดตัวอักษรให้พอดีจอเอง (qs1/qs2)
COPY = {
    "rank": {
        # ⚠️ 23 ต.ค. 2026 — ประโยคเปิดต้องจบใน ~2.5 วิ · เดิมยัด "ที่ไหน + เมื่อไหร่" ไว้ในเสียงพูด
        #    ("ทายก่อนดู! ซองไหนขายดีสุดในตู้ DivisionX สัปดาห์ที่ผ่านมา?" = 5.3 วิ) อันดับแรกเลยโผล่วินาทีที่ 8
        #    ข้อมูลที่ไหน/เมื่อไหร่อยู่บนจออยู่แล้ว (บรรทัด sub: "ยอดขายจริงจากตู้ … · 10–16 ต.ค.") ไม่ต้องพูดซ้ำ
        "hook": [("ซองไหนขายดีสุดใน{where}?", "ซองไหน", "ขายดีที่สุด?"),
                 ("5 ซองที่คนเลือกมากสุด!", "5 ซองที่", "คนเลือกมากสุด!"),
                 ("ทายก่อนดู! ซองไหนขายดีสุด?", "ทายก่อนดู!", "ซองไหนขายดีสุด?"),
                 ("อยากรู้ไหม ซองไหนมาแรงสุด?", "อยากรู้ไหม", "ซองไหนมาแรง?")],
        "line": ["อันดับ{n} {say}", "ที่{n} {say}", "อันดับ{n} ได้แก่ {say}"],
        "final": ["และอันดับหนึ่ง… {say}!", "ส่วนอันดับหนึ่งของ{when_s}คือ… {say}!", "อันดับหนึ่งตกเป็นของ… {say}!"],
        "kicker": ["TOP 5 · ยอดขายจริง", "อันดับขายดี · ข้อมูลจริง", "TOP 5 {when_k}"],
        "cta": ["อยากได้ชุดไหน เช็กหน้าตู้ใกล้บ้านก่อนไปนะ", "ชุดที่คุณชอบติดอันดับไหม? คอมเมนต์บอกกันหน่อย",
                "เช็กหน้าตู้ใกล้บ้านก่อนไปนะ แล้วมาลุ้นกัน"],
        "voice_style": ["อ่านแบบพิธีกรนับอันดับ ตื่นเต้นขึ้นเรื่อย ๆ จังหวะเร็ว เน้นชื่อชุด",
                        "อ่านแบบผู้ประกาศข่าวกีฬา มั่นใจ จังหวะกระชับ เน้นอันดับกับชื่อชุด",
                        "อ่านแบบยูทูบเบอร์สายการ์ด เป็นกันเอง สนุก ชวนลุ้น เว้นจังหวะก่อนอันดับหนึ่ง"],
    },
    "versus": {
        "hook": [("ถ้าให้เลือกหนึ่งซอง คุณเลือกอันไหน?", "คุณเลือก", "ซองไหน?"),
                 ("เลือกได้ซองเดียว คุณเอาซองไหน?", "เลือกได้", "ซองเดียว!"),
                 ("ทายซิ ลูกค้าตู้เราซื้อซองไหนมากกว่า?", "ทายซิ!", "ใครขายดีกว่า?"),
                 ("ศึกซองการ์ด! ซองไหนจะชนะ?", "ศึกซองการ์ด!", "ซองไหนชนะ?")],
        "first": ["{a} หรือ {b}?", "{a} ปะทะ {b}!", "ยกแรก {a} กับ {b}"],
        "win": ["ลูกค้าตู้เราซื้อ {w} มากกว่า!", "{w} ขายดีกว่า!", "คำตอบคือ {w}!"],
        "next": ["แล้ว {a} เจอ {b} ล่ะ?", "ต่อไป {b} ขอท้าชิง!", "{a} ปะทะ {b} ต่อเลย!"],
        "keep": ["{w} ยังขายดีกว่า!", "{w} ชนะอีกแล้ว!", "{w} ยังครองแชมป์!"],
        "upset": ["รอบนี้ลูกค้าซื้อ {w} มากกว่า!", "พลิกล็อก! {w} ขายดีกว่า!", "คราวนี้ {w} ชนะ!"],
        "kicker": ["เลือกข้าง!", "ศึกซองการ์ด", "ใครขายดีกว่า?"],
        "final": ["แชมป์ตู้เรา!", "แชมป์{when_k}!", "ผู้ชนะ!"],
        "cta": ["คุณเดาถูกไหม? เช็กหน้าตู้ใกล้บ้านก่อนไปนะ", "คอมเมนต์บอกหน่อย คุณเลือกซองไหน",
                "ทีมไหนกันบ้าง? คอมเมนต์มาเลย"],
        "voice_style": ["อ่านแบบพิธีกรเกมโชว์ ชวนลุ้น เว้นจังหวะก่อนบอกผู้ชนะ จังหวะเร็ว",
                        "อ่านแบบนักพากย์กีฬา ตื่นเต้น เร้าใจ ยิ่งรอบหลังยิ่งเร้า",
                        "อ่านแบบเพื่อนชวนเล่นเกม สนุก เป็นกันเอง ขำนิด ๆ"],
    },
    "quiz": {
        "hook": [("ทายซิ! ซองนี้ชุดอะไร?", "ทายซิ!", "ซองนี้ชุดอะไร?"),
                 ("ดูแค่ลาย รู้ไหมว่าซองไหน?", "ดูแค่ลาย", "รู้ไหมซองไหน?"),
                 ("สายการ์ดตัวจริง ต้องทายถูก!", "สายการ์ดตัวจริง", "ต้องทายถูก!"),
                 ("ซูมขนาดนี้ ยังทายถูกไหม?", "ซูมขนาดนี้", "ทายถูกไหม?")],
        # บรรทัดนับต้องจบด้วย "สาม… สอง… หนึ่ง…" เสมอ (hf_render จับเวลาเลขจากช่วงเงียบหลังคำไทยคำสุดท้าย)
        "count": ["รู้แล้วพิมพ์ในคอมเมนต์เลย… สาม… สอง… หนึ่ง…", "คิดออกยัง? สาม… สอง… หนึ่ง…",
                  "พร้อมไหม? สาม… สอง… หนึ่ง…"],
        "reveal": ["เฉลย! {say}", "คำตอบคือ… {say}!", "ใช่แล้ว! {say}"],
        "prompt": ["พิมพ์คำตอบในคอมเมนต์!", "ตอบในคอมเมนต์!", "ทายในคอมเมนต์เลย!"],
        "kicker": ["QUIZ · ทายชุด", "ทายซองจากลาย", "เกมทายซอง"],
        "cta": ["ทายถูกไหม? เช็กหน้าตู้ใกล้บ้านก่อนไปนะ", "ทายถูกกี่คน? คอมเมนต์บอกกันหน่อย",
                "อยากให้ทายชุดไหนต่อ? คอมเมนต์มาเลย"],
        "voice_style": ["อ่านแบบพิธีกรเกมทายปัญหา สนุก ชวนลุ้น นับถอยหลังช้า ๆ ชัด ๆ แล้วเฉลยเสียงดัง",
                        "อ่านแบบเพื่อนท้าเล่นเกม กวน ๆ ขี้เล่น นับถอยหลังชัด ๆ",
                        "อ่านแบบพิธีกรรายการโทรทัศน์ ตื่นเต้น เร้าใจ นับถอยหลังช้า ๆ"],
    },
    "map": {
        "q": [("ตู้การ์ด", "อยู่ตรงไหน?"), ("ตู้ DivisionX", "อยู่ไหนบ้าง?"), ("ตามหา", "ตู้การ์ด!")],
        "intro": ["ตู้การ์ด DivisionX มี {n} ตู้ ใน {m} ห้าง", "รู้ไหม? ตู้การ์ด DivisionX มีถึง {n} ตู้แล้ว",
                  "ตามหาตู้การ์ดอยู่ใช่ไหม? เรามี {n} ตู้ ใน {m} ห้าง"],
        "go": ["วันนี้พาไปที่ {mall}", "สาขานี้คือ {mall}", "ไปกันที่ {mall}"],
        # บรรทัดชั้นห้ามขึ้นต้น "ตู้อยู่" — บรรทัดถัดไป (จุดสังเกต) ขึ้นต้นแบบนั้นอยู่แล้ว ฟังซ้ำ
        "up": ["ขึ้นไปชั้น {f}", "ไปที่ชั้น {f}", "ขึ้นมาที่ชั้น {f}"],
        "ground": ["อยู่ที่ชั้น {f}", "ไปที่ชั้น {f}"],
        "lm": ["ตู้อยู่{lm}", "ตู้ตั้งอยู่{lm}"],
        "photo": ["หน้าตาตู้สาขานี้ เป็นแบบนี้เลย", "ตู้ของสาขานี้ หน้าตาแบบนี้", "เห็นตู้นี้แล้ว แวะได้เลย"],
        "kicker": ["พิกัดตู้ DivisionX", "ตามหาตู้การ์ด", "สาขาใกล้คุณ"],
        "cta": ["ดูพิกัดครบทุกสาขา ได้ที่เว็บเราเลย", "สาขาอื่นดูได้ที่เว็บเรา", "ดูทุกสาขาได้ที่ลิงก์บนจอเลย"],
        "voice_style": ["อ่านแบบไกด์พาเที่ยว สดใส เป็นกันเอง จังหวะเร็ว เน้นชื่อห้างกับเลขชั้น",
                        "อ่านแบบเพื่อนพาไปเดินห้าง สบาย ๆ ยิ้มแย้ม",
                        "อ่านแบบผู้ประกาศ ชัดเจน กระชับ เน้นชื่อห้าง ชั้น และจุดสังเกต"],
    },
}


def _chooser(pick):
    """pick(คีย์, จำนวนแบบ) → เลขแบบ · ไม่ส่งมา = แบบแรกเสมอ (สำนวนเดิมก่อนมีคลัง)
    คืน (choose, used) — choose(รูปแบบ, คีย์, **ค่าเติม) คืนข้อความที่เติมแล้ว · used = {คีย์: เลขแบบ} ลงแผน"""
    used = {}

    def choose(fmt, key, **fill):
        opts = COPY[fmt][key]
        i = pick(f"{fmt}.{key}", len(opts)) if pick else 0
        i = i if isinstance(i, int) and 0 <= i < len(opts) else 0
        used[key] = i
        v = opts[i]
        return tuple(x.format(**fill) for x in v) if isinstance(v, tuple) else v.format(**fill)

    return choose, used


def _when(days):
    """คำบอกช่วงเวลา · "สัปดาห์" แทน "7 วัน" — ตัวเลขในประโยคโดนตัดแยกท่อนซับ ("…DivisionX 7" / "วันที่ผ่านมา?")"""
    if days == 7:
        return {"when": "สัปดาห์ที่ผ่านมา", "when_s": "สัปดาห์", "when_k": "ประจำสัปดาห์"}
    return {"when": f"{days} วันที่ผ่านมา", "when_s": f" {days} วันนี้", "when_k": f" {days} วัน"}   # "ของ 14 วันนี้" ไม่ใช่ "ของ14"


def rank_plan(days=7, machine=None, voice="Puck", pick=None):
    """กระดานอันดับขายดี 5 ช่อง · 7 บรรทัด (คำถาม · อันดับ 5→1 · ปิด)"""
    top, (d0, d1) = top_sellers(days, 5, machine)
    if len(top) < 5:
        raise ValueError(f"ยอดขาย {days} วันมีแค่ {len(top)} ชุด — ต้องครบ 5")
    mall = next((b["mall"] for b in branches() if b["machine_id"] == machine), None) if machine else None
    where = f"ตู้สาขา{mall}" if mall else ("ตู้นี้" if machine else "ตู้ DivisionX")
    fill = dict(_when(days), where=where)
    choose, used = _chooser(pick)
    hook, q1, q2 = choose("rank", "hook", **fill)
    items = []
    for sku, _count in top:
        name, brand, say = display(sku)
        items.append({"sku": sku["sku_id"], "name": name, "tag": brand, "say": say})
    choose("rank", "line", n="", say="")                 # เลือกรูปประโยคครั้งเดียว ทุกอันดับพูดแบบเดียวกัน
    line = COPY["rank"]["line"][used["line"]]
    lines = [hook]
    for r in range(5, 0, -1):
        say = items[r - 1]["say"]
        lines.append(choose("rank", "final", say=say, **fill) if r == 1 else line.format(n=TH_RANK[r], say=say))
    lines.append(choose("rank", "cta"))
    scene = {"type": "rank", "span": 6, "kicker": choose("rank", "kicker", **fill), "q1": q1, "q2": q2,
             "sub": f"ยอดขายจริงจาก{where}{'' if machine else ' ทุกสาขา'} · {thai_range(d0, d1)}",
             "items": [{k: it[k] for k in ("sku", "name", "tag", "say")} for it in items]}   # say = ฉากปิดพูดชื่อเต็ม
    style = choose("rank", "voice_style")
    return {"project": f"rank-{d1:%Y%m%d}" + (f"-{machine}" if machine else ""), "engine": "hyperframes",
            "format": "rank", "voice": voice, "voice_style": style, "copy": used,
            "script": "\n".join(lines), "scenes": [scene, cta_for(machine)]}


def _op_number(sku_id):
    m = re.fullmatch(r"OP (\d+)", sku_id)
    return int(m.group(1)) if m else -1


VERSUS_THEMES = ("newest", "top", "brands", "op")


def versus_plan(days=7, machine=None, voice="Puck", picks=None, pick=None, theme=None):
    """เลือกข้าง 3 รอบ ผู้ชนะอยู่ต่อ · เฉลยจากยอดขายจริง (บอกแค่ใครขายดีกว่า ไม่มีตัวเลข)
    theme = ชุดผู้เข้าแข่ง (สลับกันไม่ให้คู่ซ้ำทุกสัปดาห์):
      newest  OP ชุดใหม่สุด · OP ชุดก่อนหน้า · Pokémon ขายดีสุด · Dragon Ball ขายดีสุด (ค่าปกติ)
      top     4 ชุดขายดีสุด สลับลำดับเข้าสนามแบบมี seed (ผลแพ้ชนะยังมาจากยอดจริง)
      brands  ตัวท็อปของแต่ละค่าย
      op      One Piece ล้วน 4 ชุดที่ขายดี"""
    count, skus, (d0, d1) = sales_counts(days, machine)
    sold = {sid: c for sid, c in count.items()
            if c > 0 and (skus[sid].get("image_url") or skus[sid].get("image_url_box"))}

    def best(fr):
        return max((s for s in sold if skus[s].get("franchise") == fr), key=lambda s: sold[s], default=None)

    by_sales = sorted(sold, key=lambda s: (-sold[s], s))
    theme = theme if theme in VERSUS_THEMES else "newest"
    if picks:
        ids = [p for p in picks if p in sold]
    elif theme == "top":
        pool, ids = by_sales[:4], []
        for k in range(len(pool)):
            i = pick(f"versus.order.{k}", len(pool)) if pick else 0
            ids.append(pool.pop(min(max(i, 0), len(pool) - 1)))
    elif theme == "brands":
        frs = sorted({skus[s].get("franchise") for s in sold}, key=lambda fr: -sold[best(fr)])
        ids = [best(fr) for fr in frs][:4]
    elif theme == "op":
        ids = [s for s in by_sales if skus[s].get("franchise") == "OP"][:4]
    else:
        ops = sorted((s for s in sold if _op_number(s) > 0), key=_op_number, reverse=True)
        ids = ops[:2] + [best("PKM"), best("DB")]
    ids = list(dict.fromkeys(x for x in ids if x))[:4]
    # ยอดเท่ากันพอดี = บอกผู้ชนะไม่ได้ (เดิม >= ให้ซองแรกชนะเงียบ ๆ แล้วพูดว่า "ขายดีกว่า" — ไม่จริง · ตรวจ 16 ต.ค.)
    # รอบแรกเสมอ → สลับผู้ท้าชิงเป็นซองสำรองที่ไม่เสมอ · รอบหลังเสมอแชมป์ → จบศึกที่รอบก่อนหน้า
    if len(ids) >= 2 and sold[ids[0]] == sold[ids[1]]:
        spare = next((s for s in by_sales if s not in ids and sold[s] != sold[ids[0]]), None)
        ids = [ids[0], spare] + ids[2:] if spare else ids[:1]
    if len(ids) >= 2:
        champ, keep = (ids[0] if sold[ids[0]] > sold[ids[1]] else ids[1]), 2
        for c in ids[2:]:
            if sold[c] == sold[champ]:
                break
            champ, keep = (champ if sold[champ] > sold[c] else c), keep + 1
        ids = ids[:keep]
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
    _side, pairs = versus_sides(R, wins)
    fill = _when(days)
    choose, used = _chooser(pick)
    hook, q1, q2 = choose("versus", "hook")
    for key in ("first", "win", "next", "keep", "upset"):
        choose("versus", key, a="", b="", w="")          # เลือกรูปประโยคครั้งเดียว ทุกรอบพูดสไตล์เดียวกัน
    # รอบ 2-3 หมุนแบบไปทีละช่อง — รอบแรกใช้ "ยังขายดีกว่า!" ซ้ำสองรอบติดกันในคลิปเดียว ฟังเป็นเทป
    def tpl(key, k):
        opts = COPY["versus"][key]
        return opts[(used[key] + max(0, k - 2)) % len(opts)]
    rounds, lines = [], [hook]
    for k, (a, b) in enumerate(pairs, 1):
        w = wins[k - 1]
        rounds.append({"win": w})        # ไม่เก็บสัดส่วน/ตัวเลขยอดขายลงแผน (เจ้าของเลือกไม่โชว์ · 16 ต.ค.)
        sa, sb, sw = items[a - 1]["say"], items[b - 1]["say"], items[w - 1]["say"]
        if k == 1:
            lines += [tpl("first", k).format(a=sa, b=sb), tpl("win", k).format(w=sw)]
        else:
            lines += [tpl("next", k).format(a=sa, b=sb), tpl("keep" if w == a else "upset", k).format(w=sw)]
    lines.append(choose("versus", "cta"))
    scene = {"type": "versus", "span": 1 + 2 * R, "kicker": choose("versus", "kicker"), "q1": q1, "q2": q2,
             "sub": f"เฉลยจากยอดขายจริงตู้ DivisionX · {thai_range(d0, d1)}",
             "final": choose("versus", "final", **fill),
             "items": [{k: it[k] for k in ("sku", "name", "tag", "say")} for it in items], "rounds": rounds}
    style = choose("versus", "voice_style")
    return {"project": f"versus-{d1:%Y%m%d}" + (f"-{theme}" if theme != "newest" else ""), "engine": "hyperframes",
            "format": "versus", "theme": theme, "voice": voice, "voice_style": style, "copy": used,
            "script": "\n".join(lines), "scenes": [scene, cta_for(machine)]}


def quiz_plan(sku=None, voice="Puck", days=7, machine=None, pick=None):
    """ทายชุดจากลายซอง · ปริยาย = One Piece ที่ขายดีสุดในช่วงนั้น (คนดูส่วนใหญ่เล่น OP)"""
    count, skus, _ = sales_counts(days, machine)
    if not sku:
        ops = [s for s in count if skus[s].get("franchise") == "OP" and skus[s].get("image_url")]
        sku = max(ops, key=lambda s: count[s]) if ops else "OP 17"
    row = skus.get(sku)
    if not row or not row.get("image_url"):
        raise ValueError(f"SKU {sku} ไม่มีรูปซอง")
    name, brand, say = display(row)
    # เฉลยต้องบอกชื่อเต็ม — ค่ายอื่นนอก OP/DB ชื่อบนจอไม่มีชื่อค่าย ("Series 02" อย่างเดียวไม่รู้ว่าเรื่องอะไร)
    if brand.lower() not in name.lower() and not re.match(r"^(OP|EB|PRB|FB)-", name):
        name = say
    choose, used = _chooser(pick)
    hook, q1, q2 = choose("quiz", "hook")
    lines = [hook, choose("quiz", "count"), choose("quiz", "reveal", say=say), choose("quiz", "cta")]
    scene = {"type": "quiz", "span": 3, "sku": sku, "kicker": choose("quiz", "kicker"), "q1": q1, "q2": q2,
             "sub": f"ใบ้ให้: ซอง {brand}", "prompt": choose("quiz", "prompt"), "name": name, "say": say,
             "tag": f"{brand} Card Game" if brand in ("One Piece", "Pokémon") else brand}
    style = choose("quiz", "voice_style")
    return {"project": f"quiz-{re.sub(r'[^a-z0-9]+', '-', sku.lower()).strip('-')}", "engine": "hyperframes",
            "format": "quiz", "sku": sku, "voice": voice, "voice_style": style, "copy": used,
            "script": "\n".join(lines), "scenes": [scene, cta_for(machine)]}


# พิกัดห้าง (ละติจูด, ลองจิจูด) จาก OpenStreetMap Nominatim (ค้น 16 ต.ค. 2026 ด้วยชื่อห้าง — ตรงกับปุ่ม "นำทาง"
# ในหน้า /branches ที่ค้น Google Maps ด้วย config.branch.maps) · ใช้วางหมุดบนแผนที่กราฟิกเท่านั้น ไม่ใช่การนำทาง
# รอบแรกใช้พิกัดจากความจำ: ซีคอนบางแคผิดไป ~4 กม. (จริงอยู่ฝั่งตะวันออกของเดอะมอลล์บางแค) · เวสต์วิลล์ผิด ~2 กม.
# ห้างใหม่ที่ไม่อยู่ในตารางจะไม่มีหมุด (แต่ยังนับจำนวนตู้) — เพิ่มที่นี่เมื่อเปิดสาขาใหม่
# ไอคอนสยามเลื่อนไปทางตะวันตก 0.002° (~200 ม.) — ห้างอยู่ริมฝั่งธนฯ พอดี แต่เส้นแม่น้ำในแผนที่เป็นเส้นหยาบ หมุดจะทับเส้น
MALLS = {"ไอคอนสยาม": (13.7268, 100.5083), "เซ็นทรัลพระราม 9": (13.7586, 100.5661), "ซีคอนบางแค": (13.7116, 100.4341),
         "เดอะมอลล์บางแค": (13.7132, 100.4078), "เซ็นทรัลรามอินทรา": (13.8723, 100.6020),
         "เซ็นทรัลเวสต์วิลล์": (13.8046, 100.4480), "เซ็นทรัลเวสต์เกต": (13.8768, 100.4115),
         "เซ็นทรัลพระราม 2": (13.6630, 100.4396), "เดอะมอลล์บางกะปิ": (13.7658, 100.6427),
         "เซ็นทรัลศาลายา": (13.7875, 100.2765), "เซ็นทรัลชลบุรี": (13.3370, 100.9693)}
BRANCHES_URL = "division-x-card.vercel.app/branches"   # หน้าสาขาที่เจ้าของทำไว้ (คิวโพสต์ใช้ลิงก์นี้อยู่แล้ว)
MAP_W, MAP_H, LON0, LON1, LAT1 = 960, 700, 100.25, 100.70, 13.93       # ต้องตรงกับ fmt-map.html
LATSPAN = (LON1 - LON0) * 0.97106 / (MAP_W / MAP_H)                       # cos(13.8°)


def _map_xy(lat, lon):
    x, y = (lon - LON0) / (LON1 - LON0) * MAP_W, (LAT1 - lat) / LATSPAN * MAP_H
    return (round(x, 1), round(y, 1)) if 20 <= x <= MAP_W - 20 and 20 <= y <= MAP_H - 20 else None


BRANCH_DIR = config.REPO / "hyperframes" / "templates" / "dvx-promo" / "assets" / "branches"


def branch_photo(machine_id):
    """รูปตู้จริงของสาขา (เตรียมด้วย branch_photos.py) → path ในโปรเจกต์ หรือ None
    ตู้มี 3 แบรนด์ (VMS · WorldWide · Vendos) หน้าตาไม่เหมือนกัน — ห้ามใช้รูปตู้สาขาอื่นแทน"""
    return f"assets/branches/{machine_id}.jpg" if machine_id and (BRANCH_DIR / f"{machine_id}.jpg").exists() else None


def cta_for(machine=None):
    """ฉากปิด: คลิปเฉพาะสาขาใช้รูปตู้ของสาขานั้น · คลิปรวมทุกสาขาใช้รูปตู้ทั่วไปเดิม"""
    photo = branch_photo(machine)
    return {"type": "cta", "img": photo} if photo else dict(CTA)


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


def map_plan(machine=None, voice="Puck", pick=None, **_):
    """พิกัดตู้: หมุดทุกสาขา → ซูมห้างของตู้ที่เลือก → ชั้น → จุดสังเกต → รูปตู้จริง (ข้อมูลจาก machines.config.branch)"""
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
    photo = branch_photo(focus["machine_id"])
    choose, used = _chooser(pick)
    q1, q2 = choose("map", "q")
    if floor:
        floor_line = choose("map", "ground" if floor.upper() in ("G", "1") else "up", f=floor)
    else:
        floor_line = "ตามมาเลย"
    lines = [choose("map", "intro", n=n_mach, m=n_mall), choose("map", "go", mall=focus["mall"]), floor_line,
             choose("map", "lm", lm=focus["landmark"]) if focus["landmark"] else f"ตู้อยู่ที่{focus['mall']}"]
    if photo:
        lines.append(choose("map", "photo"))
    lines.append(choose("map", "cta"))
    plabel = ""
    if photo:
        plabel = (f"{focus['mall']} · ชั้น {floor}" if len(by_mall[focus["mall"]]) > 1 and floor
                  else f"ตู้สาขา{focus['mall']}")
    scene = {"type": "map", "span": 5 if photo else 4, "kicker": choose("map", "kicker"), "q1": q1, "q2": q2,
             "sub": f"{n_mach} ตู้ ใน {n_mall} ห้าง", "count": n_mach, "pins": ";".join(pins),
             "offmap": " · ".join(off), "fx": fxy[0], "fy": fxy[1], "mall": focus["mall"], "floor": floor,
             "landmark": focus["landmark"], "photo": photo or "", "plabel": plabel}
    style = choose("map", "voice_style")
    return {"project": f"map-{focus['machine_id']}", "engine": "hyperframes", "format": "map",
            "machine": focus["machine_id"], "voice": voice, "voice_style": style, "copy": used,
            "script": "\n".join(lines),
            "scenes": [scene, dict(cta_for(focus["machine_id"]), linkcap="ดูพิกัดทุกสาขา", link=BRANCHES_URL)]}


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
