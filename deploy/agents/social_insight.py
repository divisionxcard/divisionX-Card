#!/usr/bin/env python3
"""
รายงานบทเรียนรายสัปดาห์จากเพจที่ติดตามไว้ — ขั้นที่ 2 ของวงจรความรู้ (21 ต.ค. 2026)

  เก็บทุกวัน (social_watch.py) → **สรุปบทเรียนรายสัปดาห์ (ไฟล์นี้)** → เจ้าของอนุมัติ → ทดลอง → เก็บ/ทิ้ง

  python deploy/agents/social_insight.py              # สัปดาห์ใหม่ยังไม่มีรายงาน = ทำ + ส่งเข้าห้อง (ไม่งั้นเงียบ)
  python deploy/agents/social_insight.py --force      # ทำใหม่แม้สัปดาห์นี้ส่งไปแล้ว
  python deploy/agents/social_insight.py --dry-run    # พิมพ์รายงานอย่างเดียว ไม่ส่ง ไม่บันทึก
  python deploy/agents/social_insight.py --no-ai      # ตัวเลขล้วน ไม่ให้ AI สรุปบทเรียน

บอทเรียกทุกเช้าหลังรอบเก็บไอเดีย — ตัวไฟล์นี้ตัดสินเองว่า "สัปดาห์นี้ทำแล้วหรือยัง" (เก็บใน state.json ของคลัง)
จะได้มีที่ตัดสินที่เดียว ไม่ใช่บอทจำอย่าง สคริปต์จำอีกอย่าง

⚠️ ตัวเลขทุกตัวในรายงานคำนวณที่นี่ (ฟังก์ชันล้วน) — AI ได้แค่ตารางสรุป + แคปชั่นสั้น ๆ ไปเขียนบทเรียน
   และถูกสั่งให้อ้างเฉพาะตัวเลขที่ให้ไป · ข้อมูลน้อย = ต้องบอกว่าเป็นสมมติฐาน ห้ามสรุปเกินข้อมูล
⚠️ เทียบ "แรงกว่าปกติของเพจตัวเองกี่เท่า" ไม่เทียบตัวเลขดิบข้ามเพจ (เพจ 500K กับ 1K คนละโลก)
⚠️ รายงานอยู่ใน research/social/reports/ (gitignored · repo เป็น public) — ส่งเข้าห้อง DVX_Owner ทาง Telegram
⚠️ บทเรียนเป็นแค่ข้อเสนอ — ไม่มีโค้ดไหนเอาไปใช้เองจนกว่าเจ้าของอนุมัติ (research/social/lessons.json)
"""
import argparse
import json
import os
import re
import statistics
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import social_watch as sw  # noqa: E402

ROOT = sw.ROOT
STORE = sw.STORE
REPORTS = STORE / "reports"
BOT_STATE = ROOT / "scripts" / ".sync_bot_state.json"
VOICE = ROOT / "deploy" / "tasks" / "content_voice.json"
WINDOW_DAYS = 14                 # โพสต์ที่ "เห็น" ภายในกี่วัน (ยอดอัปเดตทุกครั้งที่กลับไปเปิดเพจ)

GROUP_TH = {"competitor": "คู่แข่งตู้การ์ด", "shop": "ร้านการ์ด", "media": "สื่อ/ตลาดของสะสม",
            "official": "เพจทางการ", "community": "ชุมชนต่างประเทศ"}

# หัวข้อที่สนใจ — regex บนแคปชั่น (ตัวพิมพ์เล็ก) · ภาษาไทยไม่มีช่องว่างคั่นคำ จึงใช้คำตรง ๆ
TOPICS = {
    "งานแข่ง/อีเวนต์": r"แข่ง|ทัวร์นาเมนต์|tournament|\bevent\b|อีเวนต์|pre-?release|\bbattle\b|championship|\bleague\b|regional",
    "ของเข้า/เติมของ": r"เติมของ|restock|มาแล้ว|new arrival|ของเข้า|พร้อมส่ง|เข้าแล้ว|สินค้าใหม่|in stock|อั[พป]บอร์ด",
    # คู่แข่งตู้ขายด้วยคำนี้ (Take a Hit: "ไม่คัดซอง ตรงเรทคาตั้น 100%" — โพสต์แรงสุดของรอบแรก 70 เท่า)
    "ความเชื่อใจ (ไม่คัดซอง/ของแท้)": r"คัดซอง|เรทคา|คาตั้น|คาร์ตั้น|carton|ของแท้|แท้ ?100|ซีล|sealed|ไม่แกะ",
    "พรีออเดอร์/วันวางขาย": r"พรีออเดอร์|pre-?order|วางจำหน่าย|วันวางขาย|(?<!pre-)(?<!pre )\brelease\b|จองได้|เปิดจอง",
    "เปิดซอง/การ์ดแตก": r"เปิดซอง|แกะซอง|แตก|\bpulls?\b|ได้การ์ด|opening|เปิดกล่อง|unbox",
    "ราคา/มูลค่า": r"ราคา|\bprice|บาท|฿|มูลค่า|แพง",
    "แจก/ลุ้นรางวัล": r"แจก|giveaway|ลุ้น|รางวัล|ผู้โชคดี|\blucky\b|\bwinner",
    "สอน/ความรู้": r"วิธี|สอน|how to|\btips?\b|กติกา|\brules?\b|judge|เทคนิค|รู้หรือไม่",
    "จัดอันดับ/ลิสต์": r"อันดับ|\btop ?\d+|\d+ การ์ด|ที่น่าเก็บ|\bep\.? ?\d+",
}
FRANCHISES = {
    "One Piece": r"one ?piece|\bop-?\d{2}\b|\beb-?\d{2}\b|วันพีซ",
    "Pokémon": r"pok[eé]mon|โปเกม่อน|โปเกมอน|\bptcg\b",
    "Lorcana": r"lorcana",
    "Yu-Gi-Oh!": r"yu-?gi-?oh|ยูกิ",
    "Dragon Ball": r"dragon ?ball|\bdbs\b|fusion world|ดราก้อนบอล",
    "Naruto": r"naruto|นารูโตะ|นารุโตะ",
    "Solo Leveling/Union Arena": r"solo ?level|โซโล ?เลเวล|union ?arena|ยูเนียน ?อารีน่า",
    "My Little Pony": r"my ?little ?pony|โพนี่",
    "Mobile Legends": r"mobile ?legends|\bmlbb\b",
    "Transformers": r"transformers|ทรานส์ฟอร์เมอร์",
    "Magic": r"\bmtg\b|magic the gathering",
    "Gundam": r"gundam|กันดั้ม",
}
# ค่ายที่ตู้เรามีขาย (รหัสในตาราง skus.franchise → ชื่อเดียวกับ FRANCHISES) · ไว้บอก AI ว่าอะไรเราขายจริง
OUR_FRANCHISE = {"OP": "One Piece", "DB": "Dragon Ball", "PKM": "Pokémon", "YGH": "Yu-Gi-Oh!", "NRT": "Naruto",
                 "SL": "Solo Leveling/Union Arena", "MLP": "My Little Pony", "MLBB": "Mobile Legends",
                 "TF": "Transformers"}
CONF_ORDER = ["low", "medium", "high"]


def log(msg=""):
    print(msg, flush=True)


def iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_range_th(d):
    start = d - timedelta(days=d.weekday())
    end = start + timedelta(days=6)
    return f"{start.day} {sw.MONTH_TH[start.month]} – {end.day} {sw.MONTH_TH[end.month]} {end.year}"


def tags_for(caption, table):
    c = (caption or "").lower()
    return [k for k, rx in table.items() if re.search(rx, c)]


def load_stores():
    """→ [(platform, target_dict, store)] สำหรับทุกเพจที่มีในไฟล์ตั้งค่าและมีคลังแล้ว"""
    cfg = json.loads(sw.CFG_FILE.read_text(encoding="utf-8-sig"))
    out = []
    for platform in sw.READERS:
        for t in cfg.get(platform) or []:
            path = STORE / platform / f"{sw.target_id(platform, t)}.json"
            store = sw.load_json(path, None)
            if store and store.get("posts"):
                out.append((platform, t, store))
    return cfg, out


def observations(stores, today, window=WINDOW_DAYS, baseline_days=60):
    """แตกเป็นแถวโพสต์พร้อม lift (เท่าของมัธยฐานเพจตัวเอง) — ฟังก์ชันล้วน ทดสอบได้

    lift คิดจากเอ็นเกจถ่วงน้ำหนัก (ใช้ได้ทุกชนิดโพสต์) · view_lift เฉพาะคลิปเทียบคลิป
    เพจที่มีโพสต์ในคลังไม่ถึง 4 ชิ้น = ยังไม่มีฐานเทียบ → ไม่เอามาคิด (บอกจำนวนไว้ในรายงาน)
    """
    rows, thin = [], []
    for platform, t, store in stores:
        posts = list(store["posts"].values())
        base_pool = [p for p in posts if sw.days_between(p.get("posted") or p["first_seen"], today) <= baseline_days]
        engs = [sw.eng(p["m"]) for p in base_pool]
        views = [p["m"]["views"] for p in base_pool if p["m"].get("views")]
        if len(engs) < 4:
            thin.append(t["name"])
            continue
        base_e = max(statistics.median(engs), 1)
        base_v = statistics.median(views) if len(views) >= 3 else None
        for p in posts:
            if sw.days_between(p.get("last_seen", p["first_seen"]), today) > window:
                continue
            # ฐานเทียบใช้ทุกโพสต์ของเพจ แต่ตารางนับเฉพาะเรื่องการ์ด (Hi-Top โพสต์เครื่องสแกนนิ้วปนมา)
            if platform != "reddit" and not sw.card_related(p.get("caption")):
                continue
            e = sw.eng(p["m"])
            v = p["m"].get("views")
            rows.append({
                "platform": platform, "page": t["name"], "group": t.get("group", "shop"),
                "format": p.get("format") or "?", "lift": round(e / base_e, 2),
                "view_lift": round(v / base_v, 2) if (v and base_v) else None,
                "eng": e, "views": v, "m": p["m"], "caption": p.get("caption") or "",
                "topics": tags_for(p.get("caption"), TOPICS), "franchise": tags_for(p.get("caption"), FRANCHISES),
                "link": p.get("link") or "", "first_seen": p["first_seen"], "posted": p.get("posted"),
            })
    return rows, thin


def _agg(rows, key_fn, min_n=1):
    groups = {}
    for r in rows:
        for k in key_fn(r):
            groups.setdefault(k, []).append(r)
    out = []
    for k, rs in groups.items():
        if len(rs) < min_n:
            continue
        lifts = [r["lift"] for r in rs]
        out.append({"key": k, "n": len(rs), "median_lift": round(statistics.median(lifts), 2),
                    "hit_rate": round(sum(x >= 2 for x in lifts) / len(rs), 2)})
    out.sort(key=lambda x: (-x["median_lift"], -x["n"]))
    return out


def summarize(rows, ratio=2.0):
    """ตารางที่ AI กับคนอ่านเห็นตรงกัน (ฟังก์ชันล้วน)"""
    by_format = _agg(rows, lambda r: [f"{GROUP_TH.get(r['group'], r['group'])} · {sw.FMT_TH.get(r['format'], r['format'])}"])
    by_topic = _agg(rows, lambda r: r["topics"] or ["(ไม่เข้าหัวข้อไหน)"])
    by_franchise = _agg(rows, lambda r: r["franchise"] or ["(ไม่ระบุค่าย)"])
    vids = [r for r in rows if r["view_lift"] is not None]
    by_video_topic = []
    for k in TOPICS:
        rs = [r for r in vids if k in r["topics"]]
        if rs:
            by_video_topic.append({"key": k, "n": len(rs),
                                   "median_view_lift": round(statistics.median(r["view_lift"] for r in rs), 2)})
    by_video_topic.sort(key=lambda x: -x["median_view_lift"])
    top = sorted(rows, key=lambda r: -max(r["lift"], r["view_lift"] or 0))[:8]
    cadence = {}
    for r in rows:
        cadence[r["page"]] = cadence.get(r["page"], 0) + 1
    return {"posts": len(rows), "pages": len({r["page"] for r in rows}),
            "outliers": sum(max(r["lift"], r["view_lift"] or 0) >= ratio for r in rows),
            "by_format": by_format, "by_topic": by_topic, "by_franchise": by_franchise,
            "by_video_topic": by_video_topic, "top": top, "cadence": cadence}


def confidence_cap(summary):
    """เพดานความมั่นใจจากปริมาณข้อมูล — โค้ดตัดสิน ไม่ใช่ AI (รอบแรก AI ให้ 'หลักฐานชัด' จาก 5 โพสต์)"""
    if summary["posts"] < 60 or summary["pages"] < 8:
        return "low"
    return "medium" if summary["posts"] < 200 else "high"


def cap_confidence(value, cap):
    v = str(value or "").lower()
    v = v if v in CONF_ORDER else "low"
    return CONF_ORDER[min(CONF_ORDER.index(v), CONF_ORDER.index(cap))]


def our_franchises():
    """ค่ายที่มีของอยู่ในตู้ตอนนี้ (ตาราง machine_stock) · ดึงไม่ได้ = ใช้รายชื่อค่ายที่เคยขายทั้งหมด"""
    try:
        live = {r["sku_id"] for r in sw.data.sb_get(
            "machine_stock?select=sku_id&is_occupied=eq.true&sku_id=not.is.null")}
        codes = {r["franchise"] for r in sw.data.sb_get("skus?select=sku_id,franchise&is_active=eq.true")
                 if r["sku_id"] in live and r.get("franchise")}
        names = [OUR_FRANCHISE[c] for c in OUR_FRANCHISE if c in codes]
        return names or list(OUR_FRANCHISE.values())
    except Exception:                            # noqa: BLE001 — ข้อมูลเสริม
        return list(OUR_FRANCHISE.values())


def our_performance():
    """ผลโพสต์ของเพจเราเอง 30 วัน (ตาราง post_metrics) · ล้มก็ไม่เป็นไร รายงานยังออกได้"""
    try:
        perf = sw.data.query_post_performance(days=30)
    except Exception as e:                       # noqa: BLE001 — ข้อมูลเสริม ไม่ใช่หัวใจ
        return {"error": f"{type(e).__name__}: {str(e)[:160]}"}
    return {k: perf.get(k) for k in ("posts", "from_system", "avg_reactions", "avg_reactions_24h",
                                     "by_format", "note")}


# ── ให้ AI สรุปเป็นบทเรียน ────────────────────────────────────────────────
def ai_prompt(summary, ours, thin, gates_note, voice, our_fr, cap):
    fmt_list = ", ".join(f.get("label", "") for f in (voice.get("content_formats") or []) if f.get("label"))

    def tbl(rows, cols):
        return "\n".join(" | ".join(str(r.get(c)) for c in cols) for r in rows) or "(ไม่มี)"

    top = "\n".join(
        f"- [{GROUP_TH.get(r['group'], r['group'])}] {sw.FMT_TH.get(r['format'], r['format'])} · "
        f"แรงกว่าปกติของเพจ {max(r['lift'], r['view_lift'] or 0):.1f} เท่า · หัวข้อ {', '.join(r['topics']) or '-'}"
        f" · ค่าย {', '.join(r['franchise']) or '-'} · แคปชั่น: “{re.sub(r'\s+', ' ', r['caption'])[:160]}”"
        for r in summary["top"])
    return "\n".join([
        "คุณเป็นนักวิเคราะห์คอนเทนต์ให้ DivisionX Card — ตู้กดการ์ดสะสม (One Piece / Pokémon / Dragon Ball ฯลฯ) "
        "แบบกดเองได้ในห้างทั่วกรุงเทพและปริมณฑล",
        "ข้อมูลข้างล่างคือโพสต์ของเพจที่เราติดตาม (คู่แข่งตู้การ์ด · ร้านการ์ด · เพจทางการ) ที่ระบบเก็บมา "
        "ตัวเลข 'เท่า' = แรงกว่าโพสต์ปกติของเพจตัวเองกี่เท่า (ไม่ใช่ตัวเลขดิบ)",
        "",
        f"ภาพรวม: {summary['pages']} เพจ · {summary['posts']} โพสต์ · แรงผิดปกติ (≥2 เท่า) {summary['outliers']} โพสต์",
        f"เพจที่ข้อมูลยังน้อยเกินเทียบ: {', '.join(thin) or '-'} · {gates_note}",
        "",
        "ตาราง: กลุ่มเพจ · ชนิดโพสต์ | จำนวน | มัธยฐานกี่เท่า | สัดส่วนที่แรงผิดปกติ",
        tbl(summary["by_format"], ("key", "n", "median_lift", "hit_rate")),
        "",
        "ตาราง: หัวข้อ | จำนวน | มัธยฐานกี่เท่า | สัดส่วนที่แรงผิดปกติ",
        tbl(summary["by_topic"], ("key", "n", "median_lift", "hit_rate")),
        "",
        "ตาราง: คลิป — หัวข้อ | จำนวน | ยอดวิวมัธยฐานกี่เท่าของคลิปปกติของเพจ",
        tbl(summary["by_video_topic"], ("key", "n", "median_view_lift")),
        "",
        "ตาราง: ค่ายการ์ด | จำนวน | มัธยฐานกี่เท่า",
        tbl(summary["by_franchise"], ("key", "n", "median_lift")),
        "",
        "โพสต์ที่แรงที่สุด:",
        top or "(ไม่มี)",
        "",
        "ผลโพสต์ของเพจเราเอง 30 วัน (ตาราง post_metrics):",
        json.dumps(ours, ensure_ascii=False)[:1500],
        "⚠️ โพสต์ที่ระบบโพสต์ให้ คนนอกยังมองไม่เห็นจนกว่าแอป Meta จะเปิด Live — ตัวเลขของเราต่ำกว่าความจริง อย่าสรุปจากมัน",
        "",
        f"รูปแบบโพสต์ที่ระบบเราเขียนได้อยู่แล้ว: {fmt_list or '-'}",
        f"ค่ายการ์ดที่ตู้เรามีขายตอนนี้: {', '.join(our_fr)} — ค่ายอื่นนอกจากนี้เราไม่มีขาย",
        "",
        "งาน: สรุปบทเรียน 3-5 ข้อ ที่เราเอาไปทดลองกับโพสต์ ภาพ หรือคลิปของเราได้จริง",
        "กติกา:",
        "- อ้างเฉพาะตัวเลขที่อยู่ในตารางข้างบน ห้ามแต่งตัวเลขหรือข้อเท็จจริงเพิ่ม",
        f"- ข้อมูลรอบนี้มีน้อย ความมั่นใจสูงสุดที่ใช้ได้คือ '{cap}' · กลุ่มไหนมีโพสต์ไม่ถึง 5 ชิ้น = 'low' และเขียนว่าเป็นสมมติฐาน",
        "- ค่ายที่เราไม่มีขายแต่มาแรง: ห้ามเสนอให้ทำคอนเทนต์ขายค่ายนั้น ให้ถอดเป็น 'รูปแบบ' "
        "(เช่น งานแข่ง/วันวางขาย/เปิดซอง) แล้วใช้กับค่ายที่เรามี หรือใส่ไว้ใน watch",
        "- ข้อความเชิงข้อเท็จจริงเกี่ยวกับร้านเรา (เช่น ไม่คัดซอง ราคาเท่านี้ ของเข้าวันไหน) ห้ามเดา "
        "ถ้าบทเรียนต้องใช้ ให้เขียนใน try ว่า 'ให้เจ้าของยืนยันก่อนว่าจริง'",
        "- ห้ามแนะนำให้ลอกข้อความ/ภาพ/มุกของเพจอื่น ห้ามเอ่ยชื่อเพจอื่นในโพสต์ของเรา",
        "- ห้ามแนะนำให้ใส่ยอดขาย/ตัวเลขยอดขาย/เปอร์เซ็นต์ในโพสต์ · ห้ามสัญญาว่าจะได้การ์ดใบไหน",
        "- LINE OA ของเราใช้รับแจ้งปัญหาเท่านั้น ห้ามแนะนำให้ชวนแอดไลน์รับข่าว",
        "- ข้อ 'try' ต้องเป็นการทดลองที่ทำได้ภายในสัปดาห์เดียว และบอกวิธีวัดผล",
        "",
        "ตอบเป็น JSON อย่างเดียว ไม่มีคำอธิบายอื่น รูปแบบ:",
        '{"headline": "สรุปหนึ่งประโยค", "lessons": [{"title": "ชื่อบทเรียนสั้น ๆ", '
        '"evidence": "ตัวเลขจากตารางที่รองรับ", "try": "ทดลองอะไรกับเพจเรา", "measure": "วัดผลยังไง", '
        '"area": "แคปชั่น|ภาพ|คลิป|เวลาโพสต์|หัวข้อ", "confidence": "low|medium|high"}], '
        '"watch": ["เรื่องที่ควรจับตาแต่ยังไม่ต้องทำอะไร"]}',
    ])


def ask_ai(prompt):
    """ใช้ตัวเรียก Gemini ชุดเดียวกับตัวคิดมุม (เปลี่ยนรุ่นเองตอนโควตาหมด) · ล้ม = รายงานตัวเลขล้วน"""
    import idea_angles as ia
    ia.load_env_file()
    if not ia.GEMINI_KEY:
        raise RuntimeError("ไม่มี GEMINI_API_KEY")
    voice = json.loads(VOICE.read_text(encoding="utf-8-sig"))
    model = os.environ.get("GEMINI_MODEL") or voice.get("gemini_model") or "gemini-flash-latest"
    router = ia.Router([model] + [m for m in ia.MODEL_CHAIN if m != model], voice)
    last = None
    for _ in range(2):                  # JSON พังบ้างเป็นปกติ ยิงใหม่ทีเดียวมักได้
        text = router.ask(prompt, temperature=0.4, max_tokens=6144)
        t = re.sub(r"^```[a-z]*\s*|\s*```$", "", (text or "").strip(), flags=re.I | re.M)
        m = re.search(r"\{.*\}", t, re.S)
        try:
            out = json.loads(m.group(0)) if m else None
        except ValueError as e:
            last = e
            continue
        if out and isinstance(out.get("lessons"), list):
            return out, router.label
    raise RuntimeError(f"AI ตอบไม่เป็น JSON ที่ใช้ได้ ({last})")


# ── รายงาน ─────────────────────────────────────────────────────────────────
def render(week, today, summary, ours, thin, gates_note, ai, ai_label, lesson_ids):
    pct = lambda x: f"{round(x * 100)}%"   # noqa: E731
    L = [f"# บทเรียนจากเพจที่ติดตาม — สัปดาห์ {week} ({week_range_th(today)})", ""]
    if ai:
        L += [f"> {ai.get('headline', '').strip()}", ""]
    L += ["## ข้อมูลที่ใช้", "",
          f"- {summary['pages']} เพจ · {summary['posts']} โพสต์ที่เห็นใน {WINDOW_DAYS} วันล่าสุด · "
          f"แรงผิดปกติ (≥ 2 เท่าของปกติเพจ) {summary['outliers']} โพสต์",
          f"- {gates_note}"]
    if thin:
        L.append(f"- ยังมีโพสต์ในคลังน้อยเกินเทียบ (ไม่นับ): {', '.join(thin)}")
    if ours.get("error"):
        L.append(f"- ผลโพสต์ของเราเอง: ดึงไม่ได้ ({ours['error']})")
    else:
        L.append(f"- ผลโพสต์ของเราเอง 30 วัน: {ours.get('posts') or 0} โพสต์ · รีแอคชันเฉลี่ย {ours.get('avg_reactions')}"
                 " · ⚠️ โพสต์จากระบบคนนอกยังมองไม่เห็นจนกว่าแอป Meta จะ Live (ตัวเลขเราต่ำกว่าจริง)")
    L.append("- ตัวเลข \"เท่า\" = เทียบกับโพสต์ปกติของเพจตัวเอง ไม่ใช่ตัวเลขดิบข้ามเพจ")
    cap = confidence_cap(summary)
    if cap != "high":
        L.append(f"- ข้อมูลยังน้อย — ระดับความมั่นใจถูกจำกัดไว้ไม่เกิน "
                 f"\"{ {'low': 'สมมติฐาน', 'medium': 'พอเชื่อได้'}[cap] }\" (โค้ดกำหนดจากจำนวนโพสต์/เพจ ไม่ใช่ AI)")
    L.append("")

    if ai and ai.get("lessons"):
        L += ["## บทเรียนที่เสนอ (รออนุมัติ — ยังไม่มีอะไรถูกนำไปใช้)", ""]
        for lid, x in zip(lesson_ids, ai["lessons"]):
            conf = {"low": "สมมติฐาน · ข้อมูลน้อย", "medium": "พอเชื่อได้", "high": "หลักฐานชัด"}.get(
                str(x.get("confidence")).lower(), str(x.get("confidence") or "-"))
            L += [f"### {lid} · {x.get('title', '').strip()}  `{x.get('area', '-')}` · {conf}", "",
                  f"- **หลักฐาน:** {x.get('evidence', '-')}",
                  f"- **ลองแบบนี้:** {x.get('try', '-')}",
                  f"- **วัดผล:** {x.get('measure', '-')}", ""]
        if ai.get("watch"):
            L += ["**จับตาไว้ก่อน:** " + " · ".join(str(w) for w in ai["watch"]), ""]
        L += [f"_สรุปโดย {ai_label} จากตารางข้างล่าง — ตัวเลขทุกตัวคำนวณด้วยโค้ด_", ""]

    def table(title, rows, cols, heads):
        nonlocal L
        if not rows:
            return
        L += [f"## {title}", "", "| " + " | ".join(heads) + " |", "|" + "---|" * len(heads)]
        for r in rows:
            L.append("| " + " | ".join(
                pct(r[c]) if c == "hit_rate" else (f"{r[c]:.1f} เท่า" if "lift" in c else str(r[c])) for c in cols) + " |")
        L.append("")

    table("ชนิดโพสต์ไหนแรงกว่าปกติของเพจ", summary["by_format"], ("key", "n", "median_lift", "hit_rate"),
          ("กลุ่ม · ชนิด", "โพสต์", "มัธยฐาน", "แรงผิดปกติ"))
    table("หัวข้อที่คนตอบรับ", summary["by_topic"], ("key", "n", "median_lift", "hit_rate"),
          ("หัวข้อ", "โพสต์", "มัธยฐาน", "แรงผิดปกติ"))
    table("คลิป — หัวข้อที่ได้วิวเกินปกติ", summary["by_video_topic"], ("key", "n", "median_view_lift"),
          ("หัวข้อ", "คลิป", "ยอดวิวมัธยฐาน"))
    table("ค่ายการ์ด", summary["by_franchise"], ("key", "n", "median_lift", "hit_rate"),
          ("ค่าย", "โพสต์", "มัธยฐาน", "แรงผิดปกติ"))

    if summary["top"]:
        L += ["## โพสต์ที่แรงที่สุด", ""]
        for i, r in enumerate(summary["top"], 1):
            x = max(r["lift"], r["view_lift"] or 0)
            cap = re.sub(r"\s+", " ", r["caption"])[:120]
            L.append(f"{i}. **{x:.1f} เท่า** · {r['page']} ({GROUP_TH.get(r['group'], r['group'])}) · "
                     f"{sw.FMT_TH.get(r['format'], r['format'])} · {sw.metrics_th(r['m'])} — “{cap}” [ลิงก์]({r['link']})")
        L.append("")
    if summary["cadence"]:
        L += ["## ความถี่โพสต์ (ที่เห็นใน 14 วัน)", "",
              " · ".join(f"{k} {v}" for k, v in sorted(summary["cadence"].items(), key=lambda kv: -kv[1])), ""]
    L += ["---", "อยากเอาบทเรียนข้อไหนไปลอง บอก Claude Code (หรือบอก Hermes ให้ฝากต่อ) "
          "เช่น \"เอา " + (lesson_ids[0] if lesson_ids else "W43-1") + "\" — ข้อที่ไม่เอาก็บอกได้ จะได้ไม่เสนอซ้ำ"]
    return "\n".join(L) + "\n"


def tg_message(week, summary, ai, lesson_ids):
    lines = [f"🧠 <b>บทเรียนจากเพจที่ติดตาม · สัปดาห์ {week}</b>",
             f"{summary['pages']} เพจ · {summary['posts']} โพสต์ · แรงผิดปกติ {summary['outliers']}"]
    if ai:
        lines += ["", _esc(ai.get("headline", ""))]
        for lid, x in zip(lesson_ids, ai.get("lessons") or []):
            lines.append(f"• <b>{lid}</b> {_esc(x.get('title', ''))} <i>({_esc(x.get('area', '-'))})</i>")
    else:
        lines += ["", "(รอบนี้ไม่มีสรุปจาก AI — ดูตัวเลขในไฟล์แนบ)"]
    lines += ["", "รายละเอียด + หลักฐานอยู่ในไฟล์แนบ · ยังไม่มีอะไรถูกนำไปใช้จนกว่าจะอนุมัติ"]
    return "\n".join(lines)


def _esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def telegram_target():
    from envload import load_env_local
    load_env_local()
    token = os.environ.get("SYNC_BOT_TOKEN", "").strip()
    state = sw.load_json(BOT_STATE, {})
    return token, state.get("chat_id")


def tg_send(token, chat_id, text, doc_path=None):
    def call(method, body, headers):
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=body,
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))

    call("sendMessage", json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                                    "disable_web_page_preview": True}).encode("utf-8"),
         {"Content-Type": "application/json"})
    if doc_path:
        b = uuid.uuid4().hex
        parts = [f"--{b}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{chat_id}\r\n".encode(),
                 (f"--{b}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"{doc_path.name}\"\r\n"
                  "Content-Type: text/markdown; charset=utf-8\r\n\r\n").encode() + doc_path.read_bytes() + b"\r\n",
                 f"--{b}--\r\n".encode()]
        call("sendDocument", b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={b}"})


def main():
    ap = argparse.ArgumentParser(description="รายงานบทเรียนรายสัปดาห์จากเพจที่ติดตาม")
    ap.add_argument("--force", action="store_true", help="ทำใหม่แม้สัปดาห์นี้ส่งไปแล้ว")
    ap.add_argument("--dry-run", action="store_true", help="พิมพ์รายงานอย่างเดียว ไม่ส่ง ไม่บันทึก")
    ap.add_argument("--no-ai", action="store_true", help="ตัวเลขล้วน ไม่ให้ AI สรุปบทเรียน")
    args = ap.parse_args()

    today = sw.th_today()
    week = iso_week(today)
    state = sw.load_json(STORE / "state.json", {"visits": {}, "blocked": {}})
    if state.get("insight_week") == week and not (args.force or args.dry_run):
        log(f"[insight] สัปดาห์ {week} ส่งรายงานไปแล้ว")
        return 0

    cfg, stores = load_stores()
    rows, thin = observations(stores, today)
    if len(rows) < 8:
        log(f"[insight] ข้อมูลยังน้อย ({len(rows)} โพสต์) — รอเก็บเพิ่มก่อนค่อยทำรายงาน")
        return 0
    summary = summarize(rows, float(cfg.get("outlier_ratio", 2.0)))
    closed = [f"{sw.PLATFORM_LABEL[p]} เปิดเก็บ {sw.thai_day(g)}" for p, g in (cfg.get("gates") or {}).items()
              if p in sw.PLATFORM_LABEL and not sw.gate_open(p, cfg, today)]
    gates_note = ("ตอนนี้มีแค่ Facebook · " + " · ".join(closed)) if closed else "ครบทุกช่องทางที่ตั้งไว้"
    ours = our_performance()

    lessons_file = STORE / "lessons.json"
    lessons = sw.load_json(lessons_file, {"lessons": []})
    ai, ai_label = None, ""
    cap = confidence_cap(summary)
    if not args.no_ai:
        try:
            voice = json.loads(VOICE.read_text(encoding="utf-8-sig"))
            ai, ai_label = ask_ai(ai_prompt(summary, ours, thin, gates_note, voice, our_franchises(), cap))
            ai["lessons"] = ai["lessons"][:5]
            for x in ai["lessons"]:              # AI ชอบให้ความมั่นใจเกินข้อมูล — โค้ดเป็นคนกดเพดาน
                x["confidence"] = cap_confidence(x.get("confidence"), cap)
        except Exception as e:                   # noqa: BLE001 — AI ล้ม = รายงานตัวเลขล้วนยังส่งได้
            log(f"⚠️ [insight] AI สรุปบทเรียนไม่สำเร็จ ({type(e).__name__}: {str(e)[:140]}) — ส่งเป็นตัวเลขล้วน")
    ids = [f"{week.split('-')[1]}-{i}" for i in range(1, len((ai or {}).get("lessons") or []) + 1)]

    report = render(week, today, summary, ours, thin, gates_note, ai, ai_label, ids)
    if args.dry_run:
        log(report)
        log("[insight] DRY RUN — ไม่ได้ส่ง ไม่ได้บันทึก")
        return 0

    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / f"{week}.md"
    path.write_text(report, encoding="utf-8")
    for lid, x in zip(ids, (ai or {}).get("lessons") or []):
        lessons["lessons"] = [l for l in lessons["lessons"] if l.get("id") != lid]
        lessons["lessons"].append({"id": lid, "week": week, "status": "proposed", **x})
    sw.save_json(lessons_file, lessons)

    token, chat_id = telegram_target()
    if token and chat_id:
        try:
            tg_send(token, chat_id, tg_message(week, summary, ai, ids), path)
            log(f"[insight] ✅ ส่งรายงานบทเรียนสัปดาห์ {week} เข้าห้องแล้ว ({len(ids)} บทเรียน)")
        except (urllib.error.URLError, OSError, ValueError) as e:
            log(f"⚠️ [insight] ส่งเข้า Telegram ไม่สำเร็จ ({e}) — รายงานอยู่ที่ {path}")
            return 0
    else:
        log(f"⚠️ [insight] ไม่มี SYNC_BOT_TOKEN/chat_id — รายงานอยู่ที่ {path}")
    state = sw.load_json(STORE / "state.json", {"visits": {}, "blocked": {}})   # อ่านใหม่ เผื่อตัวเก็บเพิ่งเขียน
    state["insight_week"] = week
    sw.save_json(STORE / "state.json", state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
