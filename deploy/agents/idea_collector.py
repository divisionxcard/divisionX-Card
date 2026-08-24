"""
Idea Collector — สถานี 1 ของระบบการตลาด: "ทีมรีเสิร์ช" ที่หาไอเดียมาวางบนโต๊ะทุกเช้า

เก็บไอเดียคอนเทนต์จาก 4 แหล่ง แล้วเขียนลงตาราง marketing_ideas
ให้หน้า /marketing โซนไอเดียเอาไปแสดง (คนเป็นคนกดเลือกเอง)

  news     Google News RSS ภาษาไทย        — ข่าว/เทรนด์วงการการ์ด
  tiktok   Google News (คำค้นเน้นไวรัล)   — กระแส TikTok (ทางอ้อม · ดูหมายเหตุล่าง)
  youtube  YouTube channel RSS            — คลิปใหม่ของช่องที่เราตาม
  internal ข้อมูลขายของเราเอง             — SKU มาแรง/ตก · ของใกล้หมด · ตู้ยอดตก

ทั้งสี่แหล่ง **ไม่ต้องมี API key** จึงรันบน GitHub Actions ได้

⚠ TikTok: ไม่มี RSS สาธารณะ · Creative Center API ตอบ "no permission" (40101)
  · RSSHub public ตอบ 403 · official API ต้องสมัคร+รออนุมัติ
  ตัวเก็บจึงดักได้แค่ "ข่าวที่พูดถึงกระแส TikTok" ส่วนคลิปที่เห็นเองให้วางลิงก์
  บนหน้า /marketing (ระบบดึงชื่อ/ผู้โพสต์ผ่าน oEmbed ซึ่งเป็นช่องทางสาธารณะของแพลตฟอร์ม)

(เสียงลูกค้าจากคอมเมนต์ FB/YT เป็นเฟส 3 — ต้องขอ permission Meta ก่อน)

การให้คะแนน: นับคำที่ตรงกับแฟรนไชส์/ชื่อ SKU ที่เราขายจริง (ดึงจากตาราง skus)
ไม่ใช้ LLM — เพื่อให้รันฟรีและได้ผลเหมือนเดิมทุกครั้ง

รัน:
  py deploy/agents/idea_collector.py --dry-run
  py deploy/agents/idea_collector.py
  py deploy/agents/idea_collector.py --only news
"""
import os
import re
import sys
import json
import html
import argparse
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timedelta, timezone

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dvx_data as data  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SOURCES_FILE = ROOT / "deploy" / "tasks" / "idea_sources.json"
UA = "Mozilla/5.0 (compatible; DivisionX-IdeaCollector/1.0)"

# คำที่บอกว่าข่าวนี้ "น่าเอามาทำคอนเทนต์" ไม่ใช่แค่เอ่ยชื่อผ่าน ๆ
INTENT_WORDS = {
    "เปิดตัว": 1.5, "วางจำหน่าย": 1.5, "ออกใหม่": 1.5, "เปิดแล้ว": 1.2,
    "อีเวนต์": 1.2, "งาน": 0.5, "แข่ง": 1.0, "ทัวร์นาเมนต์": 1.5,
    "ราคา": 0.8, "หายาก": 1.2, "ชุดใหม่": 1.5, "pop-up": 1.5,
}


def log(msg):
    print(msg, flush=True)


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def clean(s):
    """ถอด CDATA / tag / entity ออกจากข้อความใน RSS"""
    s = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", s or "", flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def rss_items(xml):
    """ดึง <item> (RSS) และ <entry> (Atom/YouTube) ออกมาเป็น dict"""
    out = []
    for block in re.findall(r"<(?:item|entry)\b.*?</(?:item|entry)>", xml, re.S):
        def pick(tag):
            m = re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", block, re.S)
            return clean(m.group(1)) if m else None
        link = pick("link")
        if not link:  # Atom เก็บ link ไว้ใน attribute
            m = re.search(r'<link[^>]*href="([^"]+)"', block)
            link = m.group(1) if m else None
        out.append({
            "title": pick("title"),
            "url": link,
            "summary": pick("description") or pick("media:description") or "",
            "published": pick("pubDate") or pick("published") or "",
            "author": pick("source") or pick("name") or "",
        })
    return [i for i in out if i.get("title") and i.get("url")]


# ── คำสำคัญจากสินค้าที่เราขายจริง ─────────────────────────────────────────
FRANCHISE_WORDS = {
    "OP":  ["one piece", "วันพีซ", "วันพีช", "onepiece"],
    "DB":  ["dragon ball", "dragonball", "ดราก้อนบอล", "fusion world"],
    "PKM": ["pokemon", "pokémon", "โปเกมอน", "โปเกม่อน"],
    "YGH": ["yu-gi-oh", "yugioh", "ยูกิ", "ยูกิโอ"],
    "NRT": ["naruto", "นารูโตะ", "นารุโตะ"],
    "SL":  ["solo leveling", "โซโล เลเวลลิ่ง"],
}
GENERIC_WORDS = ["การ์ดสะสม", "การ์ดเกม", "tcg", "เปิดซอง", "booster", "ตู้กดการ์ด"]


def build_keywords():
    """แฟรนไชส์ที่เราขายจริง → คำค้น (data-driven จากตาราง skus)"""
    skus = data.sb_get("skus?select=sku_id,name,franchise&is_active=eq.true")
    have = {s.get("franchise") for s in skus if s.get("franchise")}
    kw = {}
    for f in have:
        for w in FRANCHISE_WORDS.get(f, []):
            kw[w] = f
    for w in GENERIC_WORDS:
        kw.setdefault(w, None)
    return kw, skus


def score_item(text, keywords):
    """คืน (คะแนน, แฟรนไชส์ที่ตรง) — คะแนนสูง = เกี่ยวกับเรามาก"""
    low = (text or "").lower()
    score, hit_franchise = 0.0, None
    for w, fr in keywords.items():
        if w in low:
            score += 2.0 if fr else 0.7
            hit_franchise = hit_franchise or fr
    for w, weight in INTENT_WORDS.items():
        if w in low:
            score += weight
    return round(score, 2), hit_franchise


def angle_for(franchise, title):
    """มุมสำรองแบบ template — ใช้ระหว่างรอ AI คิดมุมจริง

    ⚠️ อย่าใช้ตัวนี้เป็นมุมสุดท้าย · มันมีแค่ 7 แบบตาม franchise แปลว่าข่าว One Piece
    กี่ชิ้นก็ได้โจทย์เดียวกันหมด (วัดจริง: ไอเดีย 86 ชิ้น เหลือมุมต่างกันแค่ 24 แบบ
    หนักสุด 22 ชิ้นใช้ประโยคเดียวกันเป๊ะ) — เป็นรากของปัญหาคอนเทนต์ซ้ำ

    ตัวคิดมุมจริงคือ deploy/agents/idea_angles.py ที่รันต่อทันทีใน workflow เดียวกัน
    เขียนลงคอลัมน์ `angles` (3 มุมให้เลือก) · หน้าเว็บจะใช้ `angles` ก่อนเสมอ
    แล้วค่อยตกมาที่ `angle` ตัวนี้ถ้าไม่มี (เช่นวันที่โควตา Gemini หมด)
    """
    name = {"OP": "One Piece", "DB": "Dragon Ball", "PKM": "Pokémon",
            "YGH": "Yu-Gi-Oh!", "NRT": "Naruto", "SL": "Solo Leveling"}.get(franchise)
    if name:
        return f"เกาะกระแส {name} — โยงเข้าซอง {name} ที่มีในตู้ ชวนมาเปิดที่สาขาใกล้บ้าน"
    return "เกาะกระแสวงการการ์ด — โยงเข้าตู้ DivisionX ว่ามีอะไรให้เปิดบ้าง"


# ── แหล่ง 1: ข่าว ────────────────────────────────────────────────────────
def collect_news(cfg, keywords):
    ideas = []
    for q in cfg.get("news_queries", []):
        url = ("https://news.google.com/rss/search?q="
               + urllib.parse.quote(q) + "&hl=th&gl=TH&ceid=TH:th")
        try:
            items = rss_items(fetch(url))
        except Exception as e:
            log(f"  ⚠️  ข่าว '{q}' ดึงไม่ได้: {type(e).__name__}")
            continue
        for it in items[: cfg.get("max_per_source", 8)]:
            sc, fr = score_item(f"{it['title']} {it['summary']}", keywords)
            if sc < cfg.get("min_score", 1.0):
                continue
            ideas.append({
                "source": "news", "source_label": f"Google News · {q}", "subtype": q,
                "title": it["title"][:300],
                "summary": (it["summary"] or "")[:600] or None,
                "url": it["url"], "score": sc,
                "angle": angle_for(fr, it["title"]),
                "relevance": f"ตรงคำค้น «{q}»" + (f" · แฟรนไชส์ {fr} ที่เราขาย" if fr else ""),
                "external_key": f"news:{it['url'][:180]}",
            })
    return ideas


# ── แหล่ง 1ข: กระแส TikTok (ทางอ้อม) ───────────────────────────────────
# TikTok ไม่มี RSS สาธารณะ · Creative Center API ตอบ "no permission" (40101)
# · RSSHub public instance ตอบ 403 · official API ต้องสมัคร+รออนุมัติ
# สิ่งที่ทำได้โดยไม่ผิด ToS และไม่ต้องรออนุมัติ คือดักจาก "ข่าวที่พูดถึงกระแส TikTok"
# ส่วนคลิปที่เห็นเองให้วางลิงก์บนหน้าเว็บ (ระบบดึงชื่อ/ผู้โพสต์ผ่าน oEmbed ให้)
def collect_tiktok(cfg, keywords):
    ideas = []
    for q in cfg.get("tiktok_queries", []):
        url = ("https://news.google.com/rss/search?q="
               + urllib.parse.quote(q) + "&hl=th&gl=TH&ceid=TH:th")
        try:
            items = rss_items(fetch(url))
        except Exception as e:
            log(f"  ⚠️  TikTok '{q}' ดึงไม่ได้: {type(e).__name__}")
            continue
        for it in items[: cfg.get("max_per_source", 8)]:
            sc, fr = score_item(f"{it['title']} {it['summary']}", keywords)
            if sc < cfg.get("min_score", 1.0):
                continue
            ideas.append({
                "source": "tiktok", "source_label": f"กระแส TikTok · {q}", "subtype": q,
                "title": it["title"][:300],
                "summary": (it["summary"] or "")[:600] or None,
                "url": it["url"], "score": sc + 0.5,   # กระแสไวรัลมีอายุสั้น ดันขึ้นมาหน่อย
                "angle": "ทำคลิปสั้นเกาะกระแสนี้ — เปิดซองที่ตู้ ตัดต่อสไตล์ TikTok",
                "relevance": f"ข่าวที่พูดถึงกระแส TikTok · ตรงคำค้น «{q}»"
                             + (f" · แฟรนไชส์ {fr}" if fr else ""),
                "external_key": f"tt:{it['url'][:180]}",
            })
    return ideas


# ── แหล่ง 2: YouTube ────────────────────────────────────────────────────
def collect_youtube(cfg, keywords):
    ideas = []
    for ch in cfg.get("youtube_channels", []):
        cid = ch.get("channel_id") if isinstance(ch, dict) else ch
        label = (ch.get("label") if isinstance(ch, dict) else None) or cid
        if not cid:
            continue
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
        try:
            items = rss_items(fetch(url))
        except Exception as e:
            log(f"  ⚠️  ช่อง {label} ดึงไม่ได้: {type(e).__name__}")
            continue
        for it in items[: cfg.get("max_per_source", 8)]:
            sc, fr = score_item(f"{it['title']} {it['summary']}", keywords)
            ideas.append({
                "source": "youtube", "source_label": f"YouTube · {label}", "subtype": label,
                "title": it["title"][:300],
                "summary": (it["summary"] or "")[:600] or None,
                "url": it["url"], "score": max(sc, 0.5),   # คลิปจากช่องที่เราตามเอง = สนใจอยู่แล้ว
                "angle": angle_for(fr, it["title"]),
                "relevance": f"คลิปใหม่จากช่องที่เราตาม ({label})",
                "external_key": f"yt:{it['url'][:180]}",
            })
    return ideas


# ── แหล่ง 3: ข้อมูลขายของเราเอง ─────────────────────────────────────────
def collect_internal(cfg, skus):
    """สัญญาณจากยอดขายจริง — แหล่งที่คู่แข่งลอกไม่ได้ เพราะเป็นข้อมูลของเราเอง"""
    sig = cfg.get("internal_signals", {})
    today = data.th_today().isoformat()
    # กุญแจกันซ้ำของสัญญาณ "แนวโน้ม" ใช้รายสัปดาห์ ไม่ใช่รายวัน
    #
    # เดิมต่อท้ายด้วย {today} ทุกตัว ผลคือตู้ที่ยอดตกติดกัน 9 วัน = ไอเดีย 9 แถว
    # หัวข้อเดียวกันเป๊ะ (เคสจริง: "OP-09 ที่ ตู้ที่ 5 — หมดแล้ว" โผล่ 9 ครั้ง)
    # ยอดตก/มาแรงเป็นเรื่องที่เปลี่ยนช้า บอกซ้ำทุกวันไม่ได้เพิ่มข้อมูลอะไร
    # ส่วน restock ยังใช้รายวันเหมือนเดิม เพราะเป็นงานที่ต้องรีบทำวันนั้น
    y, w, _ = data.th_today().isocalendar()
    week = f"{y}W{w:02d}"
    sku_name = {s["sku_id"]: (s.get("name") or s["sku_id"]) for s in skus}
    ideas = []

    cur = data.query_sales(days=7, group_by="sku", top=30)
    prev = data.query_sales(from_date=str(data.th_today() - timedelta(days=13)),
                            to_date=str(data.th_today() - timedelta(days=7)),
                            group_by="sku", top=30)
    prev_rev = {b["sku_id"]: b["revenue"] for b in prev["breakdown"]}

    # SKU มาแรง — ยอดโตขึ้นชัดเจน
    if sig.get("hot_sku", True):
        for b in cur["breakdown"][:12]:
            before = prev_rev.get(b["sku_id"], 0)
            if before <= 0 or b["revenue"] < 3000:
                continue
            growth = (b["revenue"] - before) / before * 100
            if growth < 25:
                continue
            ideas.append({
                "source": "internal", "source_label": "ยอดขาย 7 วัน", "subtype": "hot_sku",
                "title": f"{b['name']} กำลังมาแรง — ยอดโต {growth:.0f}%",
                "summary": (f"รายรับ 7 วันล่าสุด {b['revenue']:,} บาท ({b['packs']} ซอง) "
                            f"เทียบ 7 วันก่อนหน้า {before:,} บาท"),
                "url": None, "score": round(4 + growth / 50, 2),
                "angle": f"ทำคอนเทนต์ดัน {b['name']} ตอนกระแสกำลังขึ้น — โชว์ของในซอง/การ์ดเด่น",
                "relevance": f"ข้อมูลขายจริงของเรา · โต {growth:.0f}%",
                "related_sku": b["sku_id"],
                "external_key": f"hot:{b['sku_id']}:{week}",
            })

    # SKU ที่ยอดตก — ต้องกระตุ้น
    if sig.get("falling_sku", True):
        for sku, before in sorted(prev_rev.items(), key=lambda kv: -kv[1])[:12]:
            now = next((b["revenue"] for b in cur["breakdown"] if b["sku_id"] == sku), 0)
            if before < 5000:
                continue
            drop = (before - now) / before * 100
            if drop < 40:
                continue
            ideas.append({
                "source": "internal", "source_label": "ยอดขาย 7 วัน", "subtype": "falling_sku",
                "title": f"{sku_name.get(sku, sku)} ยอดตก {drop:.0f}% — ควรกระตุ้น",
                "summary": f"จาก {before:,} บาท เหลือ {now:,} บาท ใน 7 วัน",
                "url": None, "score": round(3 + drop / 50, 2),
                "angle": f"คอนเทนต์กระตุ้น {sku_name.get(sku, sku)} — รีวิวการ์ดเด่น หรือจัดโปรร่วมกับตัวขายดี",
                "relevance": f"ข้อมูลขายจริงของเรา · ตก {drop:.0f}%",
                "related_sku": sku,
                "external_key": f"fall:{sku}:{week}",
            })

    # ของใกล้หมด/หมดแล้วแต่ขายดี — คอนเทนต์ "รีบมาก่อนหมด"
    if sig.get("restock_alert", True):
        alerts = data.query_restock_alerts(threshold_days=1.5, min_velocity=2.0)
        for a in alerts["alerts"][:5]:
            ideas.append({
                "source": "internal", "source_label": "เตือนเติมสต็อก", "subtype": "restock",
                "title": f"{a['sku']} ที่ {a['machine']} — {a['severity']}",
                "summary": (f"เหลือ {a['stock_packs']} ซอง · ขาย {a['velocity_per_day']} ซอง/วัน "
                            f"· พอใช้อีก {a['days_cover']} วัน"),
                "url": None, "score": 3.5,
                "angle": ("คอนเทนต์ความเร่งด่วน «ใกล้หมดแล้ว» — แต่ต้องเติมของก่อนโพสต์ "
                          "ไม่งั้นลูกค้าไปถึงแล้วผิดหวัง"),
                "relevance": "ข้อมูลสต็อกจริงของเรา",
                "related_sku": a["sku_id"],
                "external_key": f"restock:{a['machine_id']}:{a['sku_id']}:{today}",
            })

    # ตู้ที่ยอดตก — คอนเทนต์เจาะสาขา
    if sig.get("machine_drop", True):
        cur_m = {b["machine_id"]: b["revenue"] for b in
                 data.query_sales(days=7, group_by="machine")["breakdown"]}
        prev_m = {b["machine_id"]: b["revenue"] for b in
                  data.query_sales(from_date=str(data.th_today() - timedelta(days=13)),
                                   to_date=str(data.th_today() - timedelta(days=7)),
                                   group_by="machine")["breakdown"]}
        names = {b["machine_id"]: b["name"] for b in
                 data.query_sales(days=7, group_by="machine")["breakdown"]}
        for mid, before in prev_m.items():
            now = cur_m.get(mid, 0)
            if before < 8000:
                continue
            drop = (before - now) / before * 100
            if drop < 35:
                continue
            ideas.append({
                "source": "internal", "source_label": "ยอดขายรายสาขา", "subtype": "machine_drop",
                "title": f"{names.get(mid, mid)} ยอดตก {drop:.0f}%",
                "summary": f"จาก {before:,} บาท เหลือ {now:,} บาท ใน 7 วัน",
                "url": None, "score": round(3 + drop / 50, 2),
                "angle": "คอนเทนต์เจาะสาขานี้ — โพสต์บอกทำเล/ของที่มี หรือยิงแอดรัศมีรอบห้าง",
                "relevance": "ข้อมูลขายจริงของเรา · ระดับสาขา",
                "external_key": f"mdrop:{mid}:{week}",
            })

    return ideas


# ── บันทึกลง DB ─────────────────────────────────────────────────────────
FIELDS = ("status", "source", "source_label", "subtype", "title", "summary", "url",
          "angle", "relevance", "score", "related_sku", "external_key")


def purge(cfg, dry_run=False):
    """ลบไอเดียเก่าที่ไม่เคยถูกหยิบไปใช้ — กันตารางบวมและหัวข้อซ้ำสะสม

    ⚠️ ห้ามแตะสองกลุ่มนี้เด็ดขาด:
      1. status != 'new'          — โดยเฉพาะ 'picked' ที่ถูกเลือกไปทำคอนเทนต์แล้ว
      2. แถวที่ marketing_content.idea_id ชี้มา — มี foreign key จริง ลบแล้วพัง
         (เช็กจากตารางคอนเทนต์ตรง ๆ ไม่เชื่อแค่ status เผื่อสถานะไม่ตรงกับความจริง)

    ตั้งค่าจำนวนวันที่ purge_after_days ใน idea_sources.json · ใส่ 0 หรือลบคีย์ทิ้ง = ไม่ลบ
    """
    days = cfg.get("purge_after_days", 0)
    if not isinstance(days, int) or days <= 0:
        return 0

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    try:
        old = data.sb_get(
            f"marketing_ideas?select=id,title,source,created_at"
            f"&status=eq.new&created_at=lt.{urllib.parse.quote(cutoff)}")
        linked = {r["idea_id"] for r in data.sb_get("marketing_content?select=idea_id")
                  if r.get("idea_id")}
    except data.DvxError as e:
        log(f"[purge] ⚠️ อ่านข้อมูลไม่ได้ ข้ามการลบรอบนี้: {e}")
        return 0

    ids = [r["id"] for r in old if r["id"] not in linked]
    skipped = len(old) - len(ids)
    if not ids:
        log(f"[purge] ไม่มีไอเดียเก่าเกิน {days} วันที่ลบได้")
        return 0

    by_src = {}
    for r in old:
        if r["id"] in linked:
            continue
        by_src[r["source"]] = by_src.get(r["source"], 0) + 1
    log(f"[purge] เก่าเกิน {days} วันและยังไม่ถูกใช้ {len(ids)} แถว "
        f"({' · '.join(f'{k} {v}' for k, v in sorted(by_src.items(), key=lambda x: -x[1]))})")
    if skipped:
        log(f"[purge] ข้าม {skipped} แถวที่มีคอนเทนต์อ้างถึงอยู่")
    if dry_run:
        for r in old[:8]:
            if r["id"] in linked:
                continue
            log(f"   จะลบ #{r['id']:<5} [{r['source']:<8}] {r['title'][:60]}")
        log("\n── DRY RUN — ไม่ได้ลบจริง ──")
        return 0

    # ตัดเป็นก้อน — URL ยาวเกินไปถ้าใส่ id ทีเดียวเป็นพัน
    deleted = 0
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        req = urllib.request.Request(
            f"{data.SB_URL}/rest/v1/marketing_ideas?id=in.({','.join(map(str, chunk))})",
            headers={"apikey": data.SB_KEY, "Authorization": f"Bearer {data.SB_KEY}",
                     "Prefer": "return=representation"},
            method="DELETE")
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                deleted += len(json.loads(r.read().decode("utf-8")))
        except urllib.error.HTTPError as e:
            log(f"[purge] ⚠️ ลบก้อนที่ {i // 100 + 1} ไม่สำเร็จ: HTTP {e.code} "
                f"{e.read().decode('utf-8', 'ignore')[:150]}")
    log(f"[purge] 🧹 ลบแล้ว {deleted} ไอเดีย")
    return deleted


def save(ideas, dry_run=False):
    if not ideas:
        log("[ideas] ไม่มีไอเดียใหม่")
        return 0

    # dry-run ต้องพรีวิวได้แม้ยังไม่ได้ apply migration 060
    try:
        have = {r["external_key"] for r in data.sb_get("marketing_ideas?select=external_key")}
    except data.DvxError as e:
        if "404" not in str(e):
            raise
        if not dry_run:
            sys.exit("❌ ยังไม่มีตาราง marketing_ideas — รัน migration 060 ใน Supabase SQL Editor ก่อน")
        log("  ⚠️  ยังไม่มีตาราง marketing_ideas — พรีวิวอย่างเดียว")
        have = set()
    new = [i for i in ideas if i["external_key"] not in have]
    # กันซ้ำในรอบเดียวกันด้วย (คำค้นหลายอันอาจเจอข่าวเดียวกัน)
    seen, uniq = set(), []
    for i in new:
        if i["external_key"] in seen:
            continue
        seen.add(i["external_key"])
        uniq.append({k: i.get(k) for k in FIELDS} | {"status": "new"})

    log(f"[ideas] เก็บได้ {len(ideas)} · มีอยู่แล้ว {len(ideas) - len(new)} · ใหม่ {len(uniq)}")
    for i in sorted(uniq, key=lambda x: -x["score"])[:15]:
        log(f"   {i['score']:>5.2f} [{i['source']:<8}] {i['title'][:62]}")
    if not uniq:
        return 0
    if dry_run:
        log("\n── DRY RUN — ไม่ได้เขียน ──")
        return 0

    req = urllib.request.Request(
        f"{data.SB_URL}/rest/v1/marketing_ideas",
        data=json.dumps(uniq, ensure_ascii=False).encode("utf-8"),
        headers={"apikey": data.SB_KEY, "Authorization": f"Bearer {data.SB_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            created = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        if e.code == 404:
            sys.exit("❌ ยังไม่มีตาราง marketing_ideas — รัน migration 060 ก่อน")
        sys.exit(f"❌ Supabase HTTP {e.code}: {detail}")
    log(f"\n[ideas] ✅ บันทึก {len(created)} ไอเดีย")
    return len(created)


def main():
    ap = argparse.ArgumentParser(description="เก็บไอเดียคอนเทนต์จากข่าว/YouTube/ข้อมูลขาย")
    ap.add_argument("--dry-run", action="store_true", help="ดูอย่างเดียว ไม่เขียน DB")
    ap.add_argument("--only", choices=["news", "tiktok", "youtube", "internal"], help="เก็บเฉพาะแหล่งเดียว")
    ap.add_argument("--purge-only", action="store_true", help="ลบของเก่าอย่างเดียว ไม่เก็บของใหม่")
    args = ap.parse_args()

    cfg = json.loads(SOURCES_FILE.read_text(encoding="utf-8-sig"))

    # ลบของเก่าก่อนเก็บของใหม่ — ถ้าเก็บก่อนแล้วค่อยลบ ของที่เพิ่งเก็บจะโดนนับอายุผิด
    # ในกรณีที่ purge_after_days ถูกตั้งไว้สั้นมาก
    purge(cfg, dry_run=args.dry_run)
    if args.purge_only:
        return

    keywords, skus = build_keywords()
    log(f"[ideas] คำสำคัญจากสินค้าที่ขายจริง {len(keywords)} คำ")

    ideas = []
    if args.only in (None, "news"):
        n = collect_news(cfg, keywords); ideas += n; log(f"[ideas] ข่าว: {len(n)}")
    if args.only in (None, "tiktok"):
        t = collect_tiktok(cfg, keywords); ideas += t; log(f"[ideas] TikTok: {len(t)}")
    if args.only in (None, "youtube"):
        y = collect_youtube(cfg, keywords); ideas += y; log(f"[ideas] YouTube: {len(y)}")
    if args.only in (None, "internal"):
        try:
            i = collect_internal(cfg, skus); ideas += i; log(f"[ideas] ภายใน: {len(i)}")
        except Exception as e:
            log(f"  ⚠️  สัญญาณภายในล้ม: {type(e).__name__}: {e}")

    save(ideas, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
