"""เรดาร์คู่แข่ง/ครีเอเตอร์ของ DivisionX — ค้นด้วย Tavily รายสัปดาห์ แล้วส่งเข้าคิวไอเดีย + สรุปเข้า Telegram

รันเป็น cron แบบ --no-agent : พิมพ์อะไรออกมา = ส่งเข้า Telegram · ไม่พิมพ์ = เงียบ
จึงเงียบสนิทสัปดาห์ที่ไม่มีของใหม่ ไม่ใช่รายงาน "ไม่มีอะไร" ให้คนเลิกอ่าน

ทำไมต้องมี:
  เจ้าของเขียนไว้ใน USER.md ตั้งแต่ ส.ค. 2026 ว่า "ต้องการให้ monitor ข่าวคู่แข่งอยู่เสมอ ขอให้ค้นหาและสรุปเป็นระยะ"
  แต่ไม่เคยมีงานไหนทำจริง · 10 ต.ค. 2026 ทดสอบ Tavily แล้วพบว่า **ค้นเจอคู่แข่งที่เราไม่เคยรู้จัก 2 เจ้า**
  (Take a Hit Card @ สยามสแควร์ · BLACKCARDTCG @ Siam Discovery) และเห็นว่าร้าน Nut Card เล่นมุมอะไรบ้าง

สิ่งที่ Tavily ให้ไม่ได้ (อย่าคาดหวัง): เทรนด์สัปดาห์นี้ของ TikTok/FB ไทย — ดัชนีตามหลัง 1-11 เดือน
นี่คือ "ข่าวกรองรายสัปดาห์" ว่าใครขายอะไรด้วยข้อเสนอแบบไหน ไม่ใช่ตัวจับไวรัล

กติกาจากการทดสอบจริง (ทุกข้อมีผลจริงรองรับ ดู wiki/worklog/2026-10-10-trend-radar.md):
  1. ห้ามใส่ time_range กับโดเมนโซเชียล — ได้หน้า /discover/ ขยะ 7/8 หรือ 0 ผล
  2. คำค้นต้องมีชื่อร้าน/ห้าง — "ตู้กดการ์ด" เฉย ๆ ได้ 0 ผล
  3. วันที่ของ TikTok ถอดจาก video id (32 บิตบน = unix time) — Tavily ให้วันที่ crawl ไม่ใช่วันโพสต์
  4. กรอง score ≥ 0.3 และตัด URL ที่ไม่ใช่โพสต์ (โปรไฟล์ · /discover/ · /popular/)
  5. search_depth=basic เสมอ = 1 เครดิต/คอล · ทั้งรอบ ~7 คอล

เป้าหมายแก้ที่ C:\\Projects\\divisionX Card\\deploy\\tasks\\competitor_watch.json (ไม่ต้องแตะไฟล์นี้)
รันมือ: python competitor_radar.py --dry-run   (ค้นจริง แต่ไม่เขียน DB ไม่จำ URL)
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

if sys.stdout is not None:
    # สคริปต์นี้พิมพ์ไทยล้วน — คอนโซล/ไพป์บนเครื่องนี้เป็น cp1252 ไม่ตั้งเองจะตายตั้งแต่บรรทัดแรก
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HOME = pathlib.Path(__file__).resolve().parent.parent          # ~/AppData/Local/hermes
STATE_FILE = HOME / "state" / "competitor_radar.json"
ENV_FILE = HOME / ".env"
REPO = pathlib.Path(r"C:\Projects\divisionX Card")
DVX_ENV = REPO / "deploy" / ".env.local"
CONFIG = REPO / "deploy" / "tasks" / "competitor_watch.json"
WEB = "https://division-x-card.vercel.app/marketing"
TH = timezone(timedelta(hours=7))

# URL ที่เป็น "โพสต์จริง" บนแต่ละแพลตฟอร์ม — ที่เหลือคือหน้ารวม/โปรไฟล์ ไม่ใช่สิ่งที่เขาเพิ่งทำ
POST_PATH = re.compile(r"/(posts|videos|video|reel|reels|p|photo|photos|share|events|story)/|/status/|\?story_fbid=", re.I)
JUNK_PATH = re.compile(r"/discover/|/popular/|/tag/|/explore/|/hashtag/", re.I)


def env_value(path, key):
    """อ่านค่าจากไฟล์ .env — utf-8-sig + split ที่ = ตัวแรก (ไฟล์ฝั่ง repo มี BOM และเป็น CRLF)"""
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return None
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.strip().strip('"').strip("'")
    return None


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"seen": {}}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


def tavily(key, target):
    body = {"query": target["query"], "max_results": 10, "search_depth": "basic",
            "topic": "general", "include_published_date": True}
    if target.get("domains"):
        body["include_domains"] = target["domains"]
    for k in ("country", "language", "time_range"):
        if target.get(k):
            body[k] = target[k]
    req = urllib.request.Request(
        "https://api.tavily.com/search", data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r).get("results", []), None
    except urllib.error.HTTPError as e:
        return [], f"HTTP {e.code} {e.read().decode('utf-8', 'ignore')[:100]}"
    except Exception as e:
        return [], str(e)[:100]


def posted_date(url, tavily_date):
    """วันโพสต์จริง — TikTok ถอดจาก video id ได้แม่นกว่าวันที่ของ Tavily (ซึ่งคือวัน crawl)"""
    m = re.search(r"tiktok\.com/.+?/video/(\d{15,})", url)
    if m:
        try:
            return datetime.fromtimestamp(int(m.group(1)) >> 32, tz=timezone.utc).date()
        except Exception:
            pass
    if tavily_date:
        try:
            return datetime.fromisoformat(str(tavily_date)[:10]).date()
        except Exception:
            return None
    return None


def is_post(url):
    if JUNK_PATH.search(url):
        return False
    if "tiktok.com" in url:
        return "/video/" in url
    if "facebook.com/p/" in url:        # /p/ ของ Facebook คือหน้าเพจ (ของ Instagram คือโพสต์)
        return False
    return bool(POST_PATH.search(url))


def pick(target, results, seen, today, cfg):
    """คัดผลค้นของเป้าหมายเดียว → รายการที่ควรรายงาน (ฟังก์ชันล้วน ยกเว้นอ่าน seen)"""
    out = []
    for item in results:
        url = (item.get("url") or "").strip()
        if not url or url in seen or not is_post(url):
            continue
        if (item.get("score") or 0) < cfg.get("min_score", 0.3):
            continue
        d = posted_date(url, item.get("published_date"))
        if d and (today - d).days > cfg.get("max_age_days", 90):
            continue
        title = " ".join(str(item.get("title") or "").split())[:200]
        if not title:
            continue
        out.append({"target": target["name"], "kind": target.get("kind", "competitor"),
                    "title": title, "url": url, "date": d.isoformat() if d else None,
                    "score": round(float(item.get("score") or 0), 2),
                    "head": " ".join(str(item.get("content") or "").split())[:240]})
    return out


def push_idea(sb_url, sb_key, hit):
    """ใส่เข้าคิวไอเดีย — source 'manual' + subtype แยก competitor/creator/news (ตารางไม่มี source คู่แข่งแยก)"""
    kind = hit["kind"]
    if kind == "creator":
        angle = ("ครีเอเตอร์คนนี้เล่นมุมอะไรที่คนดู — เอา 'คำถาม/ความอยากรู้' นั้นมาตอบในแบบของเราจากข้อมูลตู้จริง "
                 "ห้ามลอกมุก/บท")
        label = f"เรดาร์ครีเอเตอร์ · {hit['target']}"
    elif kind == "news":
        angle = "ข่าวธุรกิจการ์ดในไทย — สรุปให้คนอ่านเข้าใจใน 1 โพสต์ แล้วโยงว่าเกี่ยวกับการกดตู้ยังไง"
        label = f"เรดาร์ข่าวไทย · {hit['target']}"
    else:
        angle = ("ดูว่าคู่แข่งเล่นมุม/ข้อเสนออะไร แล้วทำมุมของเราที่ต่างออกไป (จุดขายเราคือกดเองได้ในห้าง "
                 "ไม่ต้องต่อคิว) — ห้ามพาดพิงชื่อเขาในโพสต์ ห้ามลอก")
        label = f"เรดาร์คู่แข่ง · {hit['target']}"
    row = {"status": "new", "source": "manual", "source_label": label[:120], "subtype": f"radar_{kind}",
           "title": hit["title"][:300],
           "summary": (f"{hit['head']} · โพสต์ {hit['date'] or 'ไม่รู้วัน'} · score {hit['score']}")[:600],
           "url": hit["url"], "score": 3.4 if kind == "competitor" else 3.0,
           "angle": angle, "relevance": "ข่าวกรองรายสัปดาห์จาก Tavily (ดัชนีค้นหา ไม่ใช่ฟีดสด)",
           "external_key": f"cw:{hit['url'][:170]}"}
    req = urllib.request.Request(
        f"{sb_url}/rest/v1/marketing_ideas", data=json.dumps([row], ensure_ascii=False).encode("utf-8"),
        headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}", "Content-Type": "application/json",
                 "Prefer": "resolution=ignore-duplicates,return=minimal"}, method="POST")
    with urllib.request.urlopen(req, timeout=30):
        return True


def main():
    dry = "--dry-run" in sys.argv
    key = env_value(ENV_FILE, "TAVILY_API_KEY")
    if not key:
        return                      # ยังไม่ได้ตั้ง Tavily — ไม่ใช่เรื่องฉุกเฉิน อย่าไปกวน
    try:
        cfg = json.loads(CONFIG.read_text(encoding="utf-8-sig"))
    except Exception as e:
        print(f"⚠️ เรดาร์คู่แข่ง: อ่าน competitor_watch.json ไม่ได้ — {str(e)[:80]}")
        return
    sb_url = env_value(DVX_ENV, "NEXT_PUBLIC_SUPABASE_URL") or "https://xethnqqmpvlpmafvphky.supabase.co"
    sb_key = env_value(DVX_ENV, "SUPABASE_SERVICE_ROLE_KEY") or env_value(DVX_ENV, "SUPABASE_SERVICE_KEY")

    today = datetime.now(TH).date()
    state = load_state()
    seen = state.setdefault("seen", {})
    targets = [dict(c, kind="competitor") for c in cfg.get("competitors", []) if c.get("enabled", True)]
    targets += [s for s in cfg.get("sweeps", []) if s.get("enabled", True)]

    hits, errors, calls = [], [], 0
    per_target = cfg.get("max_per_target", 4)
    for t in targets:
        results, err = tavily(key, t)
        calls += 1
        if err:
            errors.append(f"{t['name']}: {err}")
            continue
        got = pick(t, results, seen, today, cfg)
        # ใหม่สุดก่อน แล้วตัดต่อเป้าหมาย — ไม่งั้นร้านที่มีโพสต์ในดัชนีเยอะ (Nut Card 8) กินโควตาทั้งรอบ
        got.sort(key=lambda h: (h["date"] or "0000"), reverse=True)
        hits += got[:per_target]

    # เรียงใหม่สุดก่อน แล้วตัดตามโควตา — ที่เหลือจะโผล่รอบหน้าถ้ายังอยู่ในดัชนี
    hits.sort(key=lambda h: (h["date"] or "0000"), reverse=True)
    hits = hits[: cfg.get("max_new_per_run", 12)]

    pushed = 0
    for h in hits:
        if dry or not sb_key:
            continue
        try:
            push_idea(sb_url, sb_key, h)
            pushed += 1
        except Exception as e:
            errors.append(f"เข้าคิวไม่ได้ {h['url'][:50]}: {str(e)[:60]}")
        seen[h["url"]] = today.isoformat()
    if not dry:
        # จำ URL ที่ "เห็นแล้วแต่ไม่ผ่านเกณฑ์" ด้วยไหม? ไม่ — เกณฑ์อาจเปลี่ยน ให้มันมีสิทธิ์โผล่ใหม่
        save_state(state)

    if not hits and not errors:
        return                      # สัปดาห์เงียบ = เงียบ
    kinds = {"competitor": "🕵️ คู่แข่ง", "creator": "🎬 ครีเอเตอร์", "news": "📰 ข่าวไทย"}
    lines = [f"🛰️ เรดาร์คู่แข่ง/ครีเอเตอร์ สัปดาห์นี้ — ใหม่ {len(hits)} ชิ้น (Tavily {calls} คอล)"
             + (" · dry-run ไม่ได้เขียน" if dry else f" · เข้าคิวไอเดียแล้ว {pushed}")]
    for k, head in kinds.items():
        group = [h for h in hits if h["kind"] == k]
        if not group:
            continue
        lines.append(f"\n{head}")
        for h in group:
            shown = urllib.parse.unquote(h["url"])          # ลิงก์ FB ไทยเป็น %E0%B8… ยาวเหยียด ถอดให้อ่านออก
            if len(shown) > 110:
                shown = shown[:107] + "…"
            lines.append(f"• [{h['target']}] {h['title'][:80]}" + (f" ({h['date']})" if h["date"] else "") + f"\n  {shown}")
    if errors:
        lines.append("\n⚠️ " + " · ".join(errors[:4]))
    lines.append(f"\nดูทั้งหมดที่ {WEB} (ช่อง 'เพิ่มเอง' ป้ายเรดาร์)")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
