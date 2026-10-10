"""เลนเทรนด์ของตัวเก็บไอเดีย (สถานี 1) — เพิ่ม 10 ต.ค. 2026

เจ้าของขอให้ระบบ "ออกไปหาข่าว/คอนเทนต์ที่กำลังมาแรงตามช่องทางต่าง ๆ ให้ทันและอัปเดตเสมอ"
ก่อนเขียนโค้ดได้ยิงทดสอบจริงทุกแหล่ง (10 ต.ค. 2026 · ดู wiki/worklog/2026-10-10-trend-radar.md)
เลนที่อยู่ในไฟล์นี้คือแหล่งที่ **ดึงได้จริง ฟรี ไม่ต้องมีคีย์ และไม่ผิดกติกาแพลตฟอร์ม**:

  official  เว็บทางการของค่าย — ต้นน้ำของทุกกระแส (วันวางขาย · แบนลิสต์ · อีเวนต์ในไทย)
            One Piece TH/JP (JSON API ที่หน้า news ใช้เอง) · Dragon Ball FW TH · Pokémon TH/JP
            · Bandai TCG+ (ทัวร์นาเมนต์ในไทย 800+ งาน/เดือน พร้อมร้านและจังหวัด)
  global    ชุมชน/สื่อต่างประเทศที่ **นำหน้าข่าวไทย 2-6 สัปดาห์** (วัดจริงกับ EB-05: ลีก 23 ส.ค.
            → ข่าว EN 29 ก.ย. → ข่าวไทยชิ้นแรก 9 ต.ค.) — Reddit (Atom) · Google News EN · TCGplayer/PokeBeach
  price     ราคาตลาดพุ่ง/การ์ดมาแรงจาก card2price.com (/market ฝังลิสต์ daily surge ของ SNKRDUNK)
  youtube   ช่อง YouTube ไทย+ทางการ 24 ช่อง (ฟีดสาธารณะ มียอดวิว) — เดิมรายการช่องว่างเปล่า

แหล่งที่ทดสอบแล้ว **ไม่เอา** (อย่าเสียเวลาลองซ้ำ · รายละเอียดใน worklog):
  TikTok ทุกช่องทางสาธารณะ (Creative Center 40101 · หน้า tag/search ว่างเปล่า · oEmbed โดน 429 ยาว)
  Facebook (400 ทันทีถ้าไม่ล็อกอิน) · Pantip (กระทู้การ์ด ~1/เดือน) · Google Trends (ลิสต์เทรนด์ไทย
  221 รายการ/7 วัน ไม่มีการ์ดเลย) · Reddit JSON (403 ต้อง OAuth — ใช้ Atom แทน)

กติกาของไฟล์นี้:
  - ทุก parser เป็นฟังก์ชันล้วน รับ text คืน list — ทดสอบกับหน้าที่เซฟไว้ได้โดยไม่ยิงเว็บ
  - ยิงทีละ host ห่าง ≥1 วินาที · Reddit ห่าง ≥65 วินาที (ลิมิต 1 ครั้ง/นาทีถ้าไม่ล็อกอิน)
  - คืน dict รูปเดียวกับ idea_collector (FIELDS) + event_date สำหรับของที่มีวันในอนาคต
"""
import json
import math
import re
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")
TH = timezone(timedelta(hours=7))
_LAST_HIT = {}


def _polite(host, gap=1.1):
    t = _LAST_HIT.get(host)
    if t is not None and time.time() - t < gap:
        time.sleep(gap - (time.time() - t))
    _LAST_HIT[host] = time.time()


def fetch(url, timeout=30, headers=None, gap=1.1):
    host = urllib.parse.urlsplit(url).netloc
    _polite(host, gap)
    h = {"User-Agent": UA, "Accept-Language": "th,en;q=0.9,ja;q=0.8"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return raw.decode("utf-8", "ignore")


def _clean(s):
    s = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", s or "", flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    import html as _h
    return re.sub(r"\s+", " ", _h.unescape(s)).strip()


# ── วันที่หลายรูปแบบที่เว็บค่ายใช้ ─────────────────────────────────────────
_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}
_MON_RE = r"(January|February|March|April|May|June|July|August|September|October|November|December)"


def parse_long_date(s):
    """'November 28, 2026' / 'October 07, 2026' → date"""
    m = re.search(_MON_RE + r"\s+(\d{1,2}),\s*(\d{4})", s or "")
    if not m:
        return None
    return date(int(m.group(3)), _MONTHS[m.group(1).lower()], int(m.group(2)))


def parse_period(s):
    """ช่วงอีเวนต์ของเว็บ One Piece → (เริ่ม, จบ)

    รูปที่เจอจริง: 'November 1 - November 30, 2026' · 'October 1 - 31, 2026'
    · 'November 21-22, 2026' · 'October 12, 2026'
    """
    s = (s or "").replace("\xa0", " ")
    m = re.search(_MON_RE + r"\s+(\d{1,2})\s*(?:-\s*(?:" + _MON_RE + r"\s+)?(\d{1,2}))?,\s*(\d{4})", s)
    if not m:
        return None, None
    y = int(m.group(5))
    start = date(y, _MONTHS[m.group(1).lower()], int(m.group(2)))
    if m.group(4):
        em = m.group(3) or m.group(1)
        end = date(y, _MONTHS[em.lower()], int(m.group(4)))
    else:
        end = start
    return start, end


def parse_dotted(s):
    """'2026.10.9' (Pokémon JP) / '2026/10/02 18:00' (One Piece API) → date"""
    m = re.search(r"(\d{4})[./](\d{1,2})[./](\d{1,2})", s or "")
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def age_days(d, today):
    return None if d is None else (today - d).days


def _fresh_bonus(age):
    if age is None:
        return 0.0
    if age < 1:
        return 2.0
    if age < 3:
        return 1.5
    if age < 7:
        return 0.8
    return 0.0


def _idea(**kw):
    """รูปแถวมาตรฐาน — คีย์ที่ไม่ได้ให้จะเป็น None (save() คัดเฉพาะ FIELDS)"""
    base = {"source": None, "source_label": None, "subtype": None, "title": None,
            "summary": None, "url": None, "score": 0.0, "angle": None, "relevance": None,
            "related_sku": None, "external_key": None, "event_date": None}
    base.update(kw)
    base["title"] = (base["title"] or "")[:300]
    if base["summary"]:
        base["summary"] = base["summary"][:600]
    return base


def sku_for_set(set_code, skus):
    """'OP13' → 'OP 13' ถ้าเป็นสินค้าที่ขายจริง (รหัส SKU ของเราเว้นวรรคระหว่างตัวอักษรกับเลข)"""
    if not set_code:
        return None
    m = re.match(r"([A-Za-z]+)-?0*(\d+)$", set_code)
    if not m:
        return None
    want = {f"{m.group(1).upper()} {m.group(2)}", f"{m.group(1).upper()} {int(m.group(2)):02d}"}
    for s in skus or []:
        if s.get("sku_id") in want:
            return s["sku_id"]
    return None


# ════════════════════════════════════════════════════════════════════════
# เลน official — เว็บทางการ
# ════════════════════════════════════════════════════════════════════════
OP_SITES = {
    "th": ("https://asia-th.onepiece-cardgame.com", "One Piece TH (ทางการ)"),
    "jp": ("https://www.onepiece-cardgame.com", "One Piece JP (ทางการ · ญี่ปุ่นประกาศก่อน)"),
}
# หมวดในประกาศ → (คะแนนตั้งต้น, มุมสำรอง) · แบนลิสต์/กฎให้สูงสุดเพราะกระทบคนเล่นทั้งวงการทันที
OP_CAT = {
    "news":     (5.0, "ประกาศทางการ — สรุปให้คนไทยอ่านง่ายใน 1 โพสต์ แล้วโยงว่าชุดไหนในตู้เกี่ยว"),
    "rules":    (4.8, "กฎ/แบนลิสต์ใหม่ — อธิบายว่ากระทบเด็คไหน การ์ดใบไหนในซองที่ตู้มี"),
    "products": (4.6, "สินค้าใหม่ — นับถอยหลังวันวางขาย โชว์การ์ดเด่นที่ประกาศแล้ว"),
    "events":   (4.0, "อีเวนต์ทางการ — ชวนคนไปแข่ง/ไปงาน แล้วแวะตู้ใกล้สถานที่"),
}


def op_article_url(site, limit=10):
    data = urllib.parse.quote(json.dumps(
        {"category": "INFORMATION", "subcategory": [""], "is_history": True}, separators=(",", ":")))
    return f"{OP_SITES[site][0]}/common/templates/api/article_list.php?start=0&limit={limit}&data={data}"


def parse_op_articles(text, site, today, max_age):
    """JSON ที่หน้า /news/ ของเว็บ One Piece โหลดเอง (เจอจาก renewal/js/news_async.js)"""
    base, label = OP_SITES[site]
    try:
        rows = json.loads(text)["data"]["article_list"]
    except Exception:
        return []
    out = []
    for a in rows:
        d = parse_dotted(a.get("dspdate") or "")
        age = age_days(d, today)
        if age is None or age > max_age:
            continue
        code = ((a.get("categories") or {}).get("subcategory") or [{}])[0].get("code") or "news"
        score, angle = OP_CAT.get(code, OP_CAT["news"])
        rel = ((a.get("onepiece") or {}).get("related_item") or {}).get(site) or []
        deep = (rel[0].get("url") if rel else None) or ""
        url = f"{base}/information/{a.get('path')}.html"
        title = a.get("title") or ""
        out.append(_idea(
            source="official", source_label=label, subtype=f"op_{code}",
            title=title, url=url, score=round(score + _fresh_bonus(age), 2),
            summary=(f"ประกาศเมื่อ {a.get('dspdate')} · หมวด {code}"
                     + (f" · หน้าที่เกี่ยว {base}{deep}" if deep else "")
                     + (" · ภาษาญี่ปุ่น — ของไทยมักตามมาในไม่กี่วัน" if site == "jp" else "")),
            angle=angle,
            relevance=("ต้นน้ำของทุกกระแส One Piece" + (" · JP ประกาศก่อน TH" if site == "jp" else "")),
            external_key=f"op:{site}:{a.get('_id')}",
        ))
    return out


def parse_op_products(html, today, horizon_days=45):
    """หน้า /products/ ของ One Piece TH — ปฏิทินวันวางขาย (ซอง/เด็คที่กำลังจะออกเท่านั้น)

    ตัดหมวด others (เพลย์แมต/ซองใส่การ์ด) ทิ้ง — ไม่ใช่สินค้าที่ตู้ขาย และรอบแรกมันดันซองจริงตกจากโควตาคิว
    """
    out = []
    for m in re.finditer(r'<li class="linkListColBox"(.*?)</li>', html, re.S):
        blk = m.group(1)
        if 'data-cat="others"' in blk:
            continue
        href = re.search(r'href="([^"]+)"', blk)
        title = re.search(r'<h4 class="linkListColTitle">(.*?)</h4>', blk, re.S)
        when = re.search(r'datetime="(\d{4}-\d{2}-\d{2})"', blk)
        cat = re.search(r'<span class="linkListColCat">(.*?)</span>', blk, re.S)
        if not (href and title and when):
            continue
        d = date.fromisoformat(when.group(1))
        left = (d - today).days
        if left < -2 or left > horizon_days:
            continue                      # ออกไปนานแล้ว หรือไกลเกินกว่าจะทำคอนเทนต์ตอนนี้
        name = _clean(title.group(1))
        code = re.search(r"\[([A-Z]{2,4}-?\d{2})\]", name)
        out.append(_idea(
            source="official", source_label="One Piece TH (ทางการ)", subtype="release",
            title=(f"{name} วางขาย {d.strftime('%d/%m/%Y')}" if left >= 0 else f"{name} วางขายแล้ว ({d.strftime('%d/%m/%Y')})"),
            url=href.group(1), event_date=d.isoformat(),
            score=round(5.0 if 0 <= left <= 21 else 4.2, 2),
            summary=f"หมวด {_clean(cat.group(1)) if cat else '-'} · อีก {left} วัน" if left >= 0 else "เพิ่งวางขาย",
            angle="นับถอยหลังวันวางขาย — โชว์การ์ดเด่นที่ประกาศแล้ว แล้วบอกว่าเช็กหน้าตู้ได้วันไหน",
            relevance="ปฏิทินวางขายทางการ · วันที่แน่นอน",
            external_key=f"release:op:{code.group(1) if code else href.group(1)[-40:]}",
        ))
    return out


def parse_op_events(html, today, horizon_days=60):
    """หน้า /events/ ของ One Piece TH — อีเวนต์ที่ยังไม่จบ พร้อมช่วงวัน"""
    out = []
    for m in re.finditer(r'<li class="eventsColBox">(.*?)</li>', html, re.S):
        blk = m.group(1)
        href = re.search(r'href="([^"]+)"', blk)
        title = re.search(r'<div class="linkCardTitle">\s*<h4>(.*?)</h4>', blk, re.S)
        tag = re.search(r'<span class="type tag">(.*?)</span>', blk, re.S)
        period = re.search(r'Event Period:(.*?)</p>', blk, re.S)
        if not (href and title and period):
            continue
        start, end = parse_period(_clean(period.group(1)))
        if not start or end < today or (start - today).days > horizon_days:
            continue
        kind = _clean(tag.group(1)) if tag else ""
        official = "OFFICIAL" in kind.upper()
        out.append(_idea(
            source="official", source_label="One Piece TH (ทางการ)",
            subtype="official_event" if official else "shop_event",
            title=f"{_clean(title.group(1))} ({start.strftime('%d/%m')}–{end.strftime('%d/%m/%Y')})",
            url=href.group(1), event_date=start.isoformat(),
            score=round((4.8 if official else 3.6) + (0.5 if (start - today).days <= 14 else 0), 2),
            summary=f"{kind} · ช่วงงาน {start.isoformat()} ถึง {end.isoformat()}",
            angle=("งานใหญ่ในกรุงเทพ — วางแคมเปญล่วงหน้า ชวนคนแวะตู้ใกล้สถานที่จัดงาน" if official
                   else "อีเวนต์ประจำเดือนของร้าน — ชวนคนเตรียมซองไปร่วม ซื้อซองได้ที่ตู้"),
            relevance="อีเวนต์ทางการในไทย · รู้ล่วงหน้าหลายสัปดาห์",
            external_key=f"opevent:{urllib.parse.urlsplit(href.group(1)).path[-80:]}",
        ))
    return out


def parse_dbs_home(html, today, max_age):
    """หน้าแรก Dragon Ball FW asia-th — บล็อก NEWS 10 รายการมีวันที่"""
    out = []
    for m in re.finditer(r'<li class="newsItem">(.*?)</li>', html, re.S):
        blk = m.group(1)
        href = re.search(r'href="([^"]+)" class="newsLink"', blk)
        when = re.search(r'datetime="(\d{4}-\d{2}-\d{2})"', blk)
        cat = re.search(r'<div class="newsCategory[^"]*"><p>(.*?)</p>', blk, re.S)
        title = re.search(r'<h3 class="newsText">(.*?)</h3>', blk, re.S)
        if not (href and when and title):
            continue
        d = date.fromisoformat(when.group(1))
        age = age_days(d, today)
        if age > max_age:
            continue
        kind = (_clean(cat.group(1)) if cat else "NEWS").lower()
        out.append(_idea(
            source="official", source_label="Dragon Ball FW TH (ทางการ)", subtype=f"dbs_{kind}",
            title=_clean(title.group(1)), url=href.group(1),
            score=round(4.0 + _fresh_bonus(age), 2),
            summary=f"{kind.upper()} · {d.isoformat()}",
            angle="ข่าว Dragon Ball Fusion World — โยงเข้าซอง FB ที่มีในตู้",
            relevance="เว็บทางการ Dragon Ball Fusion World (ไทย)",
            external_key=f"dbs:{urllib.parse.urlsplit(href.group(1)).path[-60:]}",
        ))
    return out


def parse_dbs_products(html, today, horizon_days=45):
    out = []
    for m in re.finditer(r'<li class="prpductListItem[^"]*">(.*?)</li>', html, re.S):
        blk = m.group(1)
        href = re.search(r'href="([^"]+)"', blk)
        title = re.search(r'<h3 class="cardText">(.*?)</h3>', blk, re.S)
        rel = re.search(r'<dt class="cardInfoTit">RELEASE</dt>\s*<dd class="cardInfoTxt">(.*?)</dd>', blk, re.S)
        if not (href and title and rel):
            continue
        d = parse_long_date(_clean(rel.group(1))) or parse_dotted(_clean(rel.group(1)))
        if not d:
            continue
        left = (d - today).days
        if left < -2 or left > horizon_days:
            continue
        name = _clean(title.group(1))
        code = re.search(r"\[([A-Z]{2,4}\d{2})\]", name)
        out.append(_idea(
            source="official", source_label="Dragon Ball FW TH (ทางการ)", subtype="release",
            title=f"{name} วางขาย {d.strftime('%d/%m/%Y')}", url=href.group(1),
            event_date=d.isoformat(), score=round(4.6 if 0 <= left <= 21 else 3.8, 2),
            summary=f"อีก {left} วัน" if left >= 0 else "เพิ่งวางขาย",
            angle="นับถอยหลังวันวางขาย Dragon Ball — บอกว่าชุดนี้จะเข้าตู้ไหม เช็กหน้าตู้",
            relevance="ปฏิทินวางขายทางการ",
            external_key=f"release:dbs:{code.group(1) if code else href.group(1)[-40:]}",
        ))
    return out


def parse_pkm_th(html, limit=5):
    """หน้าแรก Pokémon TCG ไทย — ข่าวการ์ดเกม (ไม่มีวันที่ในลิสต์ จึงเอาแค่ลำดับต้น ๆ แล้วให้ external_key กันซ้ำ)"""
    out = []
    for m in re.finditer(r'<a class="info-column-item\s*" href="([^"]+)">(.*?)</a>', html, re.S):
        href, blk = m.group(1), m.group(2)
        title = re.search(r'info-column-item-title[^"]*">(.*?)</div>', blk, re.S)
        cat = re.search(r'<span class="category[^"]*">(.*?)</span>', blk, re.S)
        if not title:
            continue
        kind = (_clean(cat.group(1)) if cat else "news").lower()
        out.append(_idea(
            source="official", source_label="Pokémon TCG TH (ทางการ)", subtype=f"pkm_{kind}",
            title=_clean(title.group(1)), url=href, score=4.2,
            summary=f"หมวด {kind} · จากหน้าข่าวทางการ (ลิสต์ไม่ระบุวัน — ถือว่าใหม่เมื่อเพิ่งโผล่)",
            angle="ข่าว Pokémon TCG ทางการ — โยงเข้าซอง PKM ที่มีในตู้ (ห้ามแต่งรายละเอียดนอกประกาศ)",
            relevance="เว็บทางการ Pokémon TCG ประเทศไทย",
            external_key=f"pkmth:{href[-60:]}",
        ))
        if len(out) >= limit:
            break
    return out


def parse_pkm_jp(html, today, max_age):
    """รายการ /info/ ของ Pokémon JP — ประกาศวันเดียวกัน ไทยตามมาทีหลังหลายเดือน"""
    out = []
    for m in re.finditer(r'<li class="List_item">(.*?)</li>', html, re.S):
        blk = m.group(1)
        href = re.search(r'href="\s*([^"]+?)\s*"', blk)
        when = re.search(r'<span class="Date[^"]*">(.*?)</span>', blk, re.S)
        label = re.search(r'<div class="Calendar_Label[^"]*">(.*?)</div>', blk, re.S)
        body = re.search(r'</div>\s*(.*?)<span class="Date', blk, re.S)
        if not (href and when and body):
            continue
        d = parse_dotted(_clean(when.group(1)))
        age = age_days(d, today)
        if age is None or age > max_age:
            continue
        url = href.group(1)
        if url.startswith("/"):
            url = "https://www.pokemon-card.com" + url
        out.append(_idea(
            source="official", source_label="Pokémon JP (ทางการ · ญี่ปุ่นประกาศก่อน)",
            subtype="pkm_jp", title=_clean(body.group(1)), url=url,
            score=round(3.0 + _fresh_bonus(age), 2),       # ต่ำกว่าของไทย — ข่าวงานที่ญี่ปุ่นมีค่าน้อยกว่าวันวางขายในไทย
            summary=f"{_clean(label.group(1)) if label else ''} · {d.isoformat()} · ภาษาญี่ปุ่น",
            angle="ข่าวญี่ปุ่นที่ไทยยังไม่มี — เล่าให้คนไทยรู้ก่อน ระบุว่าเป็นข่าวฝั่งญี่ปุ่น",
            relevance="JP ประกาศก่อน TH หลายเดือน",
            external_key=f"pkmjp:{url[-60:]}",
        ))
    return out


TCGPLUS_API = "https://api.bandai-tcg-plus.com/api/user/event/list"
TCGPLUS_HDR = {"Accept": "application/json, text/plain, */*",
               "Origin": "https://www.bandai-tcg-plus.com", "Referer": "https://www.bandai-tcg-plus.com/"}
TCGPLUS_GAMES = {"8": "One Piece", "11": "Dragon Ball FW", "9": "Union Arena (Solo Leveling)"}


def tcgplus_url(game_id, start, end, limit=100):
    q = urllib.parse.urlencode({
        "game_title_id": game_id, "country_code[]": "TH", "start_date": start.isoformat(),
        "end_date": end.isoformat(), "limit": limit, "offset": 0, "order": 1, "favorite": 0,
        "application_open_flg": 0})
    return f"{TCGPLUS_API}?{q}"


def parse_tcgplus(text, game_id, today):
    """สรุปทัวร์นาเมนต์ 7 วันข้างหน้าเป็นไอเดีย 1 ชิ้นต่อเกมต่อสัปดาห์ — ไม่ใช่ชิ้นละงาน

    847 งาน/เดือนทั่วไทย ถ้าปล่อยเป็นชิ้น ๆ คิวจะจม · ของมีค่าคือ "สุดสัปดาห์นี้แข่งที่ไหนบ้าง"
    """
    try:
        rows = json.loads(text)["success"]["event_list"]
    except Exception:
        return []
    if not rows:
        return []
    by_place = {}
    for e in rows:
        if str(e.get("is_canceled") or "0") not in ("0", "False", "false"):
            continue
        key = (e.get("organizer_name") or "?", e.get("city_code") or e.get("pref_code") or "")
        by_place.setdefault(key, []).append(e)
    top = sorted(by_place.items(), key=lambda kv: -len(kv[1]))[:8]
    y, w, _ = today.isocalendar()
    game = TCGPLUS_GAMES.get(str(game_id), str(game_id))
    lines = [f"{org} ({city}) {len(evs)} งาน · เริ่ม {evs[0].get('start_datetime', '')[:16].replace('T', ' ')}"
             for (org, city), evs in top]
    return [_idea(
        source="official", source_label="Bandai TCG+ (ทัวร์นาเมนต์ในไทย)", subtype="tournaments",
        title=f"สัปดาห์นี้มีทัวร์นาเมนต์ {game} ในไทย {len(rows)} งาน ({len(by_place)} ร้าน/สถานที่)",
        url="https://www.bandai-tcg-plus.com/event/", score=3.8,
        summary=" · ".join(lines), event_date=today.isoformat(),
        angle="โพสต์ 'สุดสัปดาห์นี้แข่งที่ไหน' — แนะนำร้านที่จัด แล้วบอกว่าซื้อซองเตรียมตัวได้ที่ตู้ใกล้ ๆ",
        relevance="ข้อมูลอีเวนต์ทางการ ร้านที่จัดจริง · อัปเดตทุกวัน",
        external_key=f"tcgplus:{game_id}:{y}W{w:02d}",
    )]


def collect_official(ctx):
    cfg = ctx["cfg"].get("official_sites") or {}
    today = ctx["today"]
    log = ctx["log"]
    max_age = int(cfg.get("max_age_days", 10))
    out = []

    def run(name, fn):
        try:
            got = fn()
            out.extend(got)
            log(f"  ✓ ทางการ {name}: {len(got)}")
        except Exception as e:
            log(f"  ⚠️  ทางการ {name} ล้ม: {type(e).__name__}: {str(e)[:80]}")

    if cfg.get("onepiece_th", True):
        run("One Piece TH ประกาศ", lambda: parse_op_articles(fetch(op_article_url("th")), "th", today, max_age))
        run("One Piece TH วางขาย", lambda: parse_op_products(fetch(f"{OP_SITES['th'][0]}/products/"), today))
        run("One Piece TH อีเวนต์", lambda: parse_op_events(fetch(f"{OP_SITES['th'][0]}/events/"), today))
    if cfg.get("onepiece_jp", True):
        run("One Piece JP ประกาศ", lambda: parse_op_articles(fetch(op_article_url("jp")), "jp", today, 7))
    if cfg.get("dragonball_th", True):
        run("Dragon Ball TH", lambda: parse_dbs_home(fetch("https://www.dbs-cardgame.com/fw/asia-th/"), today, max_age))
        run("Dragon Ball TH วางขาย", lambda: parse_dbs_products(fetch("https://www.dbs-cardgame.com/fw/asia-th/products/"), today))
    if cfg.get("pokemon_th", True):
        run("Pokémon TH", lambda: parse_pkm_th(fetch("https://asia.pokemon-card.com/th/")))
    if cfg.get("pokemon_jp", True):
        run("Pokémon JP", lambda: parse_pkm_jp(fetch("https://www.pokemon-card.com/info/"), today, 7))
    if cfg.get("tcgplus_events", True):
        for gid in cfg.get("tcgplus_games", ["8", "11"]):
            run(f"TCG+ game {gid}", lambda gid=gid: parse_tcgplus(
                fetch(tcgplus_url(gid, today, today + timedelta(days=7)), headers=TCGPLUS_HDR, gap=2.0), gid, today))
    return out


# ════════════════════════════════════════════════════════════════════════
# เลน global — ชุมชน/สื่อต่างประเทศที่นำหน้าไทย
# ════════════════════════════════════════════════════════════════════════
def feed_entries(xml):
    """<item> (RSS) และ <entry> (Atom) → dict · รองรับ Reddit/Google News/WordPress"""
    out = []
    for block in re.findall(r"<(?:item|entry)\b.*?</(?:item|entry)>", xml, re.S):
        def pick(tag):
            m = re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", block, re.S)
            return _clean(m.group(1)) if m else None
        link = pick("link")
        if not link:
            m = re.search(r'<link[^>]*href="([^"]+)"', block)
            link = m.group(1) if m else None
        out.append({
            "title": pick("title"), "url": link,
            "summary": pick("description") or pick("content") or "",
            "published": pick("pubDate") or pick("published") or pick("updated") or "",
        })
    return [i for i in out if i.get("title") and i.get("url")]


def _age_from(published):
    s = (published or "").strip()
    if not s:
        return None
    try:
        from email.utils import parsedate_to_datetime
        d = parsedate_to_datetime(s)
    except Exception:
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - d).total_seconds() / 86400


def collect_global(ctx):
    """อ่านฟีดตามรายการใน idea_sources.json → global_feeds

    แต่ละฟีด: key · label · url · cadence (daily|weekly) · max_age_days · keep (regex หัวข้อที่เอา)
    · drop (regex หัวข้อที่ทิ้ง) · gap (วินาทีห่างระหว่างยิง host เดิม) · base (คะแนนตั้งต้น)
    """
    cfg, today, log = ctx["cfg"], ctx["today"], ctx["log"]
    score_item, keywords = ctx["score"], ctx["keywords"]
    out = []
    weekly_ok = today.weekday() == int(cfg.get("weekly_weekday", 0))
    for f in cfg.get("global_feeds") or []:
        if f.get("cadence") == "weekly" and not weekly_ok:
            continue
        try:
            items = feed_entries(fetch(f["url"], gap=float(f.get("gap", 1.1)),
                                       headers={"Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"}))
        except Exception as e:
            log(f"  ⚠️  ต่างประเทศ '{f['key']}' ดึงไม่ได้: {type(e).__name__}: {str(e)[:60]}")
            continue
        keep = re.compile(f["keep"], re.I) if f.get("keep") else None
        drop = re.compile(f["drop"], re.I) if f.get("drop") else None
        max_age = f.get("max_age_days", 7)
        n = 0
        for rank, it in enumerate(items[: int(f.get("limit", 15))], 1):
            title = it["title"]
            if keep and not keep.search(title):
                continue
            if drop and drop.search(title):
                continue
            age = _age_from(it.get("published"))
            if max_age and age is not None and age > max_age:
                continue
            sc, fr, hits = score_item(f"{title} {it.get('summary', '')[:300]}", keywords)
            if f.get("require_topic", True) and not hits:
                continue
            # ฟีด "ท็อปของสัปดาห์" เรียงตามความนิยม — อันดับต้นควรได้คะแนนมากกว่า
            rank_bonus = max(0.0, 1.0 - (rank - 1) * 0.1) if f.get("ranked") else 0.0
            out.append(_idea(
                source="global", source_label=f"{f['label']}", subtype=f["key"],
                title=title, url=it["url"], summary=(it.get("summary") or "")[:400] or None,
                score=round(float(f.get("base", 3.0)) + min(sc, 4.0) * 0.5 + _fresh_bonus(age) + rank_bonus, 2),
                angle=f.get("angle") or "เรื่องที่ต่างประเทศคุยกันก่อน — เล่าให้คนไทยรู้เป็นเจ้าแรก ๆ แล้วโยงเข้าซองในตู้",
                relevance=f"{f.get('lead', 'นำหน้าข่าวไทย')} · {('อายุ %d วัน' % age) if age is not None else 'ไม่รู้วันที่'}"
                          + (f" · แฟรนไชส์ {fr}" if fr else ""),
                external_key=f"gl:{f['key']}:{it['url'][:160]}",
            ))
            n += 1
        log(f"  ✓ ต่างประเทศ {f['key']}: {n}/{len(items)}")
    return out


# ════════════════════════════════════════════════════════════════════════
# เลน price — card2price.com /market (daily surge + การ์ดมาแรงจาก SNKRDUNK)
# ════════════════════════════════════════════════════════════════════════
C2P = "https://card2price.com"


def rsc_text(html):
    """payload ที่ Next.js ฝังใน self.__next_f.push — แบบเดียวกับ deploy/lib/cardPrice.js"""
    parts = re.findall(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', html)
    if not parts:
        return ""
    try:
        return json.loads('"' + "".join(parts) + '"')
    except Exception:
        return "".join(json.loads('"' + p + '"') for p in parts if _loads_ok(p))


def _loads_ok(p):
    try:
        json.loads('"' + p + '"')
        return True
    except Exception:
        return False


def grab(text, key, opener="["):
    """ตัดค่าที่ตามหลัง "key": แบบนับวงเล็บ — payload ไม่ใช่ JSON ทั้งก้อน"""
    closer = "]" if opener == "[" else "}"
    m = re.search(r'"%s":\s*%s' % (re.escape(key), re.escape(opener)), text)
    if not m:
        return None
    start, depth, in_str = m.end() - 1, 0, False
    k = start
    while k < len(text):
        ch = text[k]
        if in_str:
            if ch == "\\":
                k += 1
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:k + 1])
                except Exception:
                    return None
        k += 1
    return None


def parse_market(html, sets, today, skus):
    """คืน (ไอเดียราคาพุ่ง[], ไอเดียการ์ดมาแรง 1 ชิ้นหรือ []) — เฉพาะชุดที่เราขาย"""
    text = rsc_text(html)
    surge = grab(text, "initialDailySurge", "{") or {}
    hot = grab(text, "initialData", "{") or {}
    want = {s.upper().replace("-", "") for s in sets}

    def in_sets(code):
        return (code or "").split("-")[0].upper() in want

    out = []
    for it in surge.get("items") or []:
        code = it.get("cardCode") or ""
        if not in_sets(code) or (it.get("soldAge") or 0) > 1:
            continue
        pct = it.get("pctDay")
        thb = it.get("soldThb")
        name = it.get("displayName") or it.get("nameEn") or code
        cond = it.get("condLabel") or it.get("condition") or ""
        out.append(_idea(
            source="price", source_label="card2price · SNKRDUNK (ราคาพุ่งวันนี้)", subtype="price_surge",
            title=f"{name} ({code}) ราคาขายล่าสุดพุ่ง {it.get('pctLabel') or pct} → ฿{int(thb or 0):,} ({cond})",
            url=f"{C2P}{it.get('detailPath') or '/market'}",
            summary=(f"ขายจริงล่าสุด ¥{int(it.get('soldJpy') or 0):,} ≈ ฿{int(thb or 0):,} เมื่อ {it.get('soldDate')} "
                     f"· สภาพ {cond} · ความหายาก {it.get('rarity') or '-'} · เทียบวันก่อนหน้า {it.get('pctLabel') or pct} "
                     f"· แหล่ง card2price.com (ข้อมูล SNKRDUNK ญี่ปุ่น)"),
            score=round(4.5 + min(float(pct or 0), 50) / 25, 2),
            angle="ส่องใบที่ราคากำลังขยับ — บอกตัวเลข+วันที่+แหล่งตามที่ให้ แล้วบอกว่าใบนี้อยู่ชุดไหนในตู้ (ห้ามพยากรณ์ว่าจะขึ้นต่อ)",
            relevance="ราคาขายจริงเมื่อวาน/วันนี้ · ชุดที่เราขาย",
            related_sku=sku_for_set(code.split("-")[0], skus),
            external_key=f"surge:{code}:{it.get('condition')}:{it.get('soldDate')}",
        ))

    picks = []
    for it in hot.get("items") or []:
        code = it.get("cardCode") or ""
        if not in_sets(code):
            continue
        picks.append(it)
        if len(picks) >= 5:
            break
    digest = []
    if picks:
        lines = [f"อันดับ {p.get('rank')} {p.get('englishName') or p.get('title')} ({p.get('cardCode')}) "
                 f"¥{int(p.get('salePrice') or 0):,} · ถูกใจ {p.get('favoriteCount')}" for p in picks]
        digest.append(_idea(
            source="price", source_label="card2price · SNKRDUNK (การ์ดมาแรง)", subtype="hot_cards",
            title=f"การ์ดมาแรงวันนี้ในชุดที่ตู้มี: {picks[0].get('englishName') or picks[0].get('cardCode')} และอีก {len(picks) - 1} ใบ",
            url=f"{C2P}/market", summary=" · ".join(lines) + " · อันดับจากรายการ hottest ของ SNKRDUNK ผ่าน card2price.com",
            score=4.0,
            angle="จัดอันดับใบที่คนตามหาในชุดที่ตู้มี — ราคาอ้างได้เฉพาะที่ให้ พร้อมเครดิตแหล่งและวันที่",
            relevance="ความสนใจของตลาดญี่ปุ่นวันนี้ · ชุดที่เราขาย",
            related_sku=sku_for_set(picks[0].get("cardCode", "").split("-")[0], skus),
            external_key=f"c2phot:{today.isoformat()}",
        ))
    return out, digest


def collect_price(ctx):
    cfg, today, log = ctx["cfg"], ctx["today"], ctx["log"]
    pc = cfg.get("price") or {}
    if not pc.get("enabled", True):
        return []
    sets = pc.get("sets") or []
    try:
        html = fetch(f"{C2P}/market", timeout=40)
    except Exception as e:
        log(f"  ⚠️  ราคาตลาด card2price ดึงไม่ได้: {type(e).__name__}")
        return []
    surge, digest = parse_market(html, sets, today, ctx.get("skus") or [])
    log(f"  ✓ ราคาตลาด: พุ่ง {len(surge)} · มาแรง {len(digest)}")
    return surge + digest


# ════════════════════════════════════════════════════════════════════════
# เลน youtube — ฟีดช่อง (มียอดวิว) · คะแนนตามความเร็ววิว · กรองช่องผสมด้วยคำการ์ด
# ════════════════════════════════════════════════════════════════════════
def youtube_entries(xml):
    out = []
    for block in re.findall(r"<entry\b.*?</entry>", xml, re.S):
        def pick(tag):
            m = re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", block, re.S)
            return _clean(m.group(1)) if m else None
        vid = pick("yt:videoId")
        views = re.search(r'<media:statistics views="(\d+)"', block)
        if not vid:
            continue
        out.append({
            "id": vid, "title": pick("title"), "url": f"https://www.youtube.com/watch?v={vid}",
            "summary": (pick("media:description") or "")[:300], "published": pick("published") or "",
            "views": int(views.group(1)) if views else 0,
        })
    return out


def collect_youtube(ctx):
    """คลิปใหม่ ≤7 วันจากช่องที่ตาม · คะแนนตามยอดวิว+ความเร็ววิว · เอาเฉพาะคลิปที่พูดถึงการ์ดค่ายเรา

    ⚠️ กรองคำทุกช่อง ไม่ใช่เฉพาะช่องบันเทิง — รอบทดสอบแรก (10 ต.ค. 2026) ช่องสายการ์ดล้วนก็ปล่อย
       "Harry Potter Kakawow" กับ "Digimon Regionals" หลุดมาติดท็อป 15 · และจำกัด 3 คลิป/ช่อง/รอบ
       ไม่งั้นช่องที่ลงวันละหลายคลิป (GM Club 15) กินโควตาคิวหมด
    ⚠️ สเกลคะแนน: คลิปไวรัลสุดได้ ~7 เท่าระดับแบนลิสต์/วันวางขายของทางการ (5-7) ไม่ใช่ 9 —
       รอบแรกคลิปกิน 14 จาก 15 อันดับแรก ทั้งที่เลนทางการ/ราคาคือของที่หาที่อื่นไม่ได้
    """
    cfg, today, log = ctx["cfg"], ctx["today"], ctx["log"]
    score_item, keywords = ctx["score"], ctx["keywords"]
    max_age = float(cfg.get("youtube_max_age_days", 7))
    per_channel = int(cfg.get("youtube_max_per_channel", 3))
    out = []
    for ch in cfg.get("youtube_channels") or []:
        cid = ch.get("channel_id") if isinstance(ch, dict) else ch
        label = (ch.get("label") if isinstance(ch, dict) else None) or cid
        if not cid:
            continue
        try:
            items = youtube_entries(fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"))
        except Exception as e:
            log(f"  ⚠️  ช่อง {label} ดึงไม่ได้: {type(e).__name__}")
            continue
        picked = []
        for it in items:
            age = _age_from(it["published"])
            if age is None or age > max_age:
                continue
            sc, fr, hits = score_item(f"{it['title']} {it['summary']}", keywords)
            # ต้องเจอ "ชื่อค่ายที่เราขาย" ไม่ใช่แค่คำกลาง ๆ — คำอธิบายช่องสายการ์ดมี "TCG/การ์ดสะสม" ติดทุกคลิป
            # ทำให้ Harry Potter Kakawow / Battle of ตลิ่งชัน ผ่านตัวกรองคำทั่วไปได้ (รอบทดสอบ 10 ต.ค.)
            if not fr:
                continue
            hours = max(age * 24, 1.0)
            velocity = it["views"] / hours                      # วิวต่อชั่วโมงตั้งแต่โพสต์
            score = (3.0 + min(math.log10(it["views"] + 1), 6) / 6 * 2.5
                     + min(math.log10(velocity + 1), 4) / 4 * 1.0 + _fresh_bonus(age) * 0.5)
            picked.append(_idea(
                source="youtube", source_label=f"YouTube · {label}", subtype=label,
                title=it["title"], url=it["url"], summary=it["summary"] or None,
                score=round(score, 2),
                angle=("คลิปที่คนดูเยอะ — หยิบ 'คำถาม' ที่คลิปนี้ตอบมาทำโพสต์ของเราเอง "
                       "(ห้ามสรุปเนื้อหาของเขา) แล้วโยงเข้าซองที่ตู้"),
                relevance=f"{it['views']:,} วิวใน {age * 24:.0f} ชม. (≈{velocity:,.0f}/ชม.)" + (f" · แฟรนไชส์ {fr}" if fr else ""),
                external_key=f"yt:{it['url'][:180]}",
            ))
        picked.sort(key=lambda r: -r["score"])
        out.extend(picked[:per_channel])
        if picked:
            log(f"  ✓ YouTube {label}: {min(len(picked), per_channel)}" + (f" (ตัด {len(picked) - per_channel})" if len(picked) > per_channel else ""))
    return out
