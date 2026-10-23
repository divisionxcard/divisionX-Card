"""ผู้กำกับภาพพื้นหลังวิดีโอ — ออกแบบฉากตามเนื้อหาของแต่ละคลิป (23 ต.ค. 2026)

เจ้าของ: "อยากให้สร้างออกมาตามแนวคอนเทนต์ ไม่ยึดอยู่กับแบบใดแบบหนึ่ง"
(ดูต้นแบบ 3 แนวแล้วชอบ B ภาพวาดแบบหนัง — ทะเลพายุบนหัวเรือ ที่ตรงกับ One Piece อันดับหนึ่ง)

ลำดับ:
    1. signals(plan)   อ่านเนื้อหาจริงของคลิป — รูปแบบ · ค่ายของพระเอก (อันดับหนึ่ง/ซองที่ทาย/ซองส่วนใหญ่) · สาขา
    2. คลังคลิป Flow  (tasks/video_broll.json) ถ้ามีคลิปที่ตรงค่าย → ใช้คลิปจริงที่เจ้าของทำจาก Google Flow ก่อน
    3. ไม่มี → Gemini (คีย์ฟรี) เขียนฉากอังกฤษจาก "โลกของค่าย" (tasks/franchise_style.json) + อารมณ์ของรูปแบบ
       + "สื่อ" (ภาพวาดหนัง/ภาพถ่าย/3D/…) ที่หมุนไม่ซ้ำคลิปล่าสุด · Gemini ล้ม = ใช้ฉากสำรองของค่าย
    4. gpt-image-2.5-flare วาด 1024×1536 (~20 วิ · ~$0.04) → marketing/video-bg/<project>.png
       → plan["bg_image"] = URL · เรนเดอร์ซ้ำใช้ภาพเดิม ไม่วาดใหม่
    3b. "สื่อ" = footage → ฟุตเทจวิดีโอจริงฟรีจาก Pixabay (23 ต.ค. 2026 · เจ้าของสมัครคีย์ให้ · Pexels ปิดออกคีย์ใหม่)
       Gemini คิดคำค้นอังกฤษจากโลกของค่าย → เลือกคลิปยาว ≥ 8 วิ สูง ≥ 1080 → ตัดเสียง · ครอปแนวตั้ง 1080×1920
       → marketing/video-bg/<project>-pxb-<id>.mp4 → plan["bg_video"] · หาไม่เจอ = ตกไปวาดภาพแทน
       (ใบอนุญาต Pixabay: ใช้เชิงพาณิชย์ได้ ไม่ต้องให้เครดิต · ต้องดาวน์โหลดเก็บเอง ห้ามลิงก์ตรง — เราอัปขึ้น Storage ของเรา)

ไม่มีคีย์/ล้มตรงไหน = คืนแผนเดิม คลิปใช้ลายกราฟิกเดิม — พื้นหลังไม่ใช่เหตุให้งานล้ม

กฎเหล็ก (ชุดเดียวกับพื้นหลังโปสเตอร์ lib/aiBackground.js): ไม่มีตัวหนังสือ · คน · ตัวละคร · การ์ด/ซอง/สินค้า/ตู้
— ซองจริงวางทับเองในฉาก · ตัวละครมีลิขสิทธิ์ · ตัวหนังสือไทยให้ Chromium วาด
"""
import base64
import hashlib
import json
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from . import config

STYLE_FILE = config.TASKS / "franchise_style.json"
BROLL_FILE = config.TASKS / "video_broll.json"
IMAGE_MODEL = "gpt-image-2.5-flare"
GEMINI_CHAIN = ["gemini-flash-lite-latest", "gemini-flash-latest"]
STORAGE_DIR = "video-bg"

# "สื่อ" ของภาพ — น้ำหนักมาก = ออกบ่อย · ภาพวาดแบบหนังหนักสุดเพราะเจ้าของชอบที่สุด (23 ต.ค.)
MEDIA = [
    ("matte", 4, "Epic cinematic matte painting, like a key frame from a big-budget adventure film"),
    ("photo", 2, "Photorealistic cinematic photograph, full-frame camera, shallow depth of field, rich colour grade"),
    ("render", 2, "High-end 3D render, Unreal Engine 5 style, volumetric lighting, physically based materials"),
    ("anime", 2, "Japanese anime feature-film background painting, luminous skies, detailed hand-painted scenery"),
    ("concept", 1, "Painterly concept art with confident visible brush strokes and dramatic atmosphere"),
    ("diorama", 1, "Tilt-shift macro photograph of a handcrafted miniature diorama, tiny detailed world, soft studio light"),
    # ฟุตเทจจริง (Pixabay) — ใช้เมื่อมีคีย์ และไม่ใช่คลิปพิกัดตู้ (ฟุตเทจห้างต่างประเทศจะดูเหมือน "ห้างนี้" ทั้งที่ไม่ใช่)
    ("footage", 3, "Real cinematic stock footage"),
]

FOOTAGE_SKIP = {"PKM", "MLP"}

# คำค้นสำรองเมื่อ Gemini ใช้ไม่ได้ — บรรยากาศล้วน ไม่มีคน/ป้าย
FOOTAGE_FALLBACK = {
    "OP": "stormy ocean waves sunset", "DB": "storm clouds lightning", "PKM": "lightning storm meadow",
    "YGH": "candles temple dark", "NRT": "misty mountain forest", "SL": "dark cave mist",
    "MLBB": "stage lights smoke", "TF": "sparks metal industrial", "MLP": "pastel clouds sky", None: "neon lights bokeh",
}

# อารมณ์ของแต่ละรูปแบบ — บอก "ความรู้สึก" ไม่บอก "ของที่ต้องมี" (ของที่สั่งจะถูกวาดตรงตัว · dvx-image กฎข้อห้า)
MOOD = {
    "rank": "a countdown building to a triumphant number one — rising light, a sense of arrival and victory",
    "versus": "two opposing forces about to clash — contrasting light and colour from the left and the right",
    "quiz": "mystery and anticipation — something hidden, curiosity, a single dramatic light in the haze",
    "map": "a bright, inviting modern Thai shopping-mall interior, a journey to discover something",
}

# ฉากสำรองเมื่อ Gemini ใช้ไม่ได้ — โลกเต็มฉาก (ต่างจาก decor ของโปสเตอร์ที่เป็นลายขอบภาพ)
FALLBACK = {
    "OP": "the bow of an old wooden sailing ship on a vast ocean, dramatic clouds parting, distant islands",
    "DB": "a vast rocky wasteland under a stormy sky crackling with golden energy, floating boulders",
    "PKM": "rolling green hills under a bright sky, a distant storm of crackling electric clouds, wildflowers",
    "YGH": "an ancient temple hall of carved stone, glowing violet glyph tablets, drifting incense haze",
    "NRT": "a misty Japanese mountain village at dusk, wooden rooftops, swirling green leaves",
    "SL": "a dark dungeon gate deep underground, a violet rift portal, cold blue mist",
    "MLBB": "a fantasy esports arena at night, giant stage lights, magenta and gold beams through haze",
    "TF": "a vast industrial hangar of giant steel machinery, sparks, hard orange rim light",
    "MLP": "a pastel kingdom of clouds and rainbows, glittering light, gentle sky castles in the distance",
    None: "a futuristic arena at night, glossy reflective floor, electric-cyan light beams through haze",
}

SKU_PREFIX = {"OP": "OP", "EB": "OP", "PRB": "OP", "ST": "OP", "PKM": "PKM", "FB": "DB", "DB": "DB",
              "YGH": "YGH", "YGO": "YGH", "NRT": "NRT", "SL": "SL", "MLBB": "MLBB", "TF": "TF", "MLP": "MLP"}

HARD = ("HARD RULES — never break: no text, letters, numbers, signs, logos or watermarks anywhere · "
        "no people, faces, hands, characters, creatures or mascots · no trading cards, booster packs, boxes, "
        "products, vending machines or screens · no frame or border.")
COMPOSE = ("Vertical 2:3 full-bleed background plate for a short-form video. A ranking board, product photos and "
           "Thai captions will be composited on top later, so keep the central area calmer and a little darker "
           "than the edges, with strong depth: a clear foreground, middle ground and far background.")


def _log(msg):
    print(f"[bg] {msg}", flush=True)


def _norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


def _styles():
    try:
        return json.loads(STYLE_FILE.read_text(encoding="utf-8")).get("franchises", {})
    except Exception:
        return {}


def _franchise_of(item, styles):
    """ค่ายของรายการในฉาก — จากชื่อค่ายบนป้าย (tag) ก่อน แล้วค่อยเดาจากรหัส SKU"""
    tag = _norm(item.get("tag"))
    for key, st in styles.items():
        name = _norm(st.get("name"))
        if name and tag and (name in tag or tag in name):
            return key
    pre = re.match(r"[A-Za-z]+", str(item.get("sku") or ""))
    return SKU_PREFIX.get(pre.group(0).upper()) if pre else None


def signals(plan):
    """เนื้อหาของคลิปที่ภาพพื้นหลังต้องสื่อ — รูปแบบ · ค่ายพระเอก · ค่ายอื่นในคลิป · หัวข้อ"""
    styles = _styles()
    fmt = plan.get("format") or next((sc["type"] for sc in plan.get("scenes") or []
                                      if sc.get("type") in MOOD), None)
    items = []
    for sc in plan.get("scenes") or []:
        if sc.get("items"):
            items += sc["items"]
        elif sc.get("sku"):
            items.append(sc)
    frs = [f for f in (_franchise_of(it, styles) for it in items) if f]
    # พระเอก: อันดับหนึ่ง (รายการแรกของฉากจัดอันดับ) · ซองที่ทาย · ไม่งั้นค่ายที่โผล่บ่อยสุด
    hero = frs[0] if frs else None
    if fmt == "versus" and frs:
        hero = max(set(frs), key=frs.count)
    head = next((f"{sc.get('q1', '')} {sc.get('q2', '')}".strip() for sc in plan.get("scenes") or [] if sc.get("q1")), "")
    mall = next((sc.get("mall") for sc in plan.get("scenes") or [] if sc.get("mall")), None)
    return {"format": fmt, "hero": hero, "others": sorted(set(frs) - {hero}), "headline": head, "mall": mall,
            "world": styles.get(hero) or {}}


def _recent(hist, n=8):
    out = [(p.get("bg") or {}) for p in (hist or [])[:n] if isinstance(p, dict)]
    return [b for b in out if b]


def choose_medium(rng, hist, footage=False):
    """สื่อแบบสุ่มถ่วงน้ำหนัก เลี่ยง 2 คลิปล่าสุด · footage=False = ตัดฟุตเทจออก (ไม่มีคีย์/คลิปพิกัดตู้/หาแล้วไม่เจอ)"""
    used = [b.get("medium") for b in _recent(hist, 2)]
    base = [m for m in MEDIA if footage or m[0] != "footage"]
    pool = [(k, w, d) for k, w, d in base if k not in used] or base
    total = sum(w for _, w, _ in pool)
    r = rng.uniform(0, total)
    for k, w, d in pool:
        r -= w
        if r <= 0:
            return k, d
    return pool[-1][0], pool[-1][2]


def _gemini(prompt):
    key = config.env("GEMINI_API_KEY")
    if not key:
        return None
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 1.0, "maxOutputTokens": 2048}}
    for model in GEMINI_CHAIN:
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            text = "".join(p.get("text", "") for p in d["candidates"][0]["content"]["parts"]).strip()
            if text:
                return text
        except Exception as e:
            _log(f"Gemini {model} ใช้ไม่ได้ ({str(e)[:70]}) — ลองตัวถัดไป")
    return None


def write_scene(sig, medium_desc, hist):
    """ฉากอังกฤษ 1 ย่อหน้า · Gemini ล้ม = ฉากสำรองของค่าย"""
    world = sig["world"]
    seen = [b.get("scene", "")[:140] for b in _recent(hist, 6) if b.get("scene")]
    others = ", ".join(_styles().get(f, {}).get("name", f) for f in sig["others"])
    ask = "\n".join([
        "You are the art director of a Thai trading-card brand's short vertical videos.",
        "Design ONE background scene for the next video. Reply with a single English paragraph (60-90 words) that",
        "describes only the place, light, weather, atmosphere and camera viewpoint. Be specific and cinematic.",
        f"Rendering medium (use it): {medium_desc}.",
        f"Video type and feeling to evoke: {MOOD.get(sig['format'], 'energetic and exciting')}.",
        (f"The star of this video is a {world.get('name')} booster pack. Build a world that a {world.get('name')} fan "
         f"would instantly feel — mood reference: {world.get('look', '')} Motif ideas you may borrow: {world.get('decor', '')}"
         if world else "No single franchise leads this video — make an exciting collector's world."),
        (f"Other franchises also appear in the video ({others}); you may hint at them with colour accents only." if others else ""),
        (f"The video is set at {sig['mall']}, a real shopping mall in Thailand — show a bright modern mall interior "
         "(generic, no shop signs, no brand names)." if sig.get("mall") else ""),
        "Never mention or include: text, letters, signs, logos, people, faces, hands, characters, creatures, mascots,",
        "trading cards, booster packs, boxes, products, vending machines or screens. Never name a franchise, a",
        "character or a copyrighted place — describe only original scenery.",
        "Keep the centre of the frame calmer and slightly darker (graphics go there); put the drama at the edges and in the sky.",
        ("Recent videos already used these scenes — make something clearly different:\n- " + "\n- ".join(seen)) if seen else "",
    ])
    text = _gemini("\n".join(x for x in ask.splitlines() if x.strip()))
    if text:
        text = re.sub(r"\s+", " ", text.strip().strip('"').strip())
        if 25 <= len(text.split()) <= 160:
            return text, "gemini"
    return f"{medium_desc}: {FALLBACK.get(sig['hero'], FALLBACK[None])}. {MOOD.get(sig['format'], '')}.", "fallback"


def paint(prompt):
    """วาดภาพ 1024×1536 · คืน bytes PNG · ไม่มีคีย์ = None"""
    key = config.env("OPENAI_API_KEY")
    if not key:
        return None
    body = {"model": IMAGE_MODEL, "prompt": prompt, "size": "1024x1536", "quality": "high", "n": 1}
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    last = None
    for attempt in range(2):                     # ตัวกรองเนื้อหาบล็อกแบบสุ่มได้ — ยิงซ้ำรุ่นเดิม (กติกาเดียวกับ aiBackground.js)
        try:
            with urllib.request.urlopen(req, timeout=280) as r:
                d = json.load(r)
            return base64.b64decode(d["data"][0]["b64_json"])
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} {e.read().decode('utf-8', 'replace')[:200]}"
            if e.code not in (400, 429, 500, 503):
                break
            time.sleep(2)
    raise RuntimeError(f"วาดภาพไม่สำเร็จ: {last}")


def footage_query(sig):
    """คำค้นอังกฤษ 2-4 คำสำหรับฟุตเทจบรรยากาศ — Gemini ล้ม = คำค้นสำรองของค่าย"""
    world = sig["world"]
    ask = ("Give ONE English stock-footage search query (2-4 words) for a real cinematic background video that matches "
           f"this mood: {MOOD.get(sig['format'], 'exciting')}. "
           + (f"World reference: {world.get('look', '')} " if world else "")
           + "Only nature, weather, light, sky, water, fire, space or empty architecture — no people, no brands, "
             "no franchise names. Reply with the query only.")
    q = _gemini(ask)
    q = re.sub(r"[^A-Za-z ]", " ", q or "").strip()
    q = " ".join(q.split()[:4])
    return q if len(q) >= 4 else FOOTAGE_FALLBACK.get(sig["hero"], FOOTAGE_FALLBACK[None])


def _pixabay(query, rng, used):
    key = config.env("PIXABAY_API_KEY")
    if not key:
        return None
    url = ("https://pixabay.com/api/videos/?" + urllib.parse.urlencode(
        {"key": key, "q": query, "safesearch": "true", "per_page": 30, "order": "popular"}))
    try:
        # ⚠️ ต้องมี User-Agent — urllib ส่ง "Python-urllib/3.x" แล้ว Pixabay ตอบ 403 (curl ผ่าน · ทดสอบ 23 ต.ค.)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 divisionx-video"})
        with urllib.request.urlopen(req, timeout=30) as r:
            hits = json.load(r).get("hits", [])
    except Exception as e:
        _log(f"Pixabay ค้นไม่ได้ ({str(e)[:80]})")
        return None
    ok = []
    for h in hits:
        v = (h.get("videos") or {})
        best = next((v[k] for k in ("large", "medium") if (v.get(k) or {}).get("url") and v[k].get("height", 0) >= 1080), None)
        if best and h.get("duration", 0) >= 8 and str(h.get("id")) not in used:
            ok.append((h, best))
    if not ok:
        return None
    # ให้คะแนน: แท็กตรงคำค้น (สำคัญสุด) · แนวตั้งอยู่แล้ว (ไม่ต้องครอป) · คม (4K ย่อลง ดีกว่า 1080p ขยาย 1.78 เท่า)
    # ⚠️ เรียงตามความนิยมอย่างเดียวได้ของไม่ตรง — ค้น "Golden ocean sunrise" ได้ทะเลทรายมีซากเรือ (ทดสอบ 23 ต.ค.)
    words = {w for w in query.lower().split() if len(w) >= 4 and w not in ("cinematic", "golden", "dark", "light")}

    def score(x):
        h, v = x
        tags = (h.get("tags") or "").lower()
        hit = sum(1 for w in words if w in tags or w.rstrip("s") in tags)
        return hit * 3 + (1 if v.get("height", 0) > v.get("width", 0) else 0) + (1 if v.get("height", 0) >= 2160 else 0)

    ranked = sorted(ok, key=score, reverse=True)
    top = score(ranked[0])
    if words and top < 3:                               # ไม่มีคลิปไหนแท็กตรงสักคำ = อย่าฝืนใช้ ไปวาดภาพแทน
        return None
    pool = [x for x in ranked if score(x) >= top - 1][:6]
    h, best = rng.choice(pool)
    if words and score((h, best)) < 3:
        h, best = ranked[0]
    return {"id": str(h["id"]), "url": best["url"], "w": best.get("width"), "h": best.get("height"),
            "seconds": h.get("duration"), "page": h.get("pageURL"), "by": h.get("user"), "query": query}


def _prep_footage(src_url, dst):
    """ดาวน์โหลด → ตัดเสียง · ครอปกลางแนวตั้ง 1080×1920 · ยาวไม่เกิน 12 วิ · H.264"""
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        raw = f"{td}/src.mp4"
        req = urllib.request.Request(src_url, headers={"User-Agent": "Mozilla/5.0 divisionx-video"})
        with urllib.request.urlopen(req, timeout=180) as r, open(raw, "wb") as f:
            f.write(r.read())
        subprocess.run([config.ffmpeg_bin(), "-v", "error", "-y", "-i", raw, "-t", "12", "-an",
                        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", str(dst)], check=True)
    return dst


def _upload_file(path, project, tag, ctype):
    from .publish import BUCKET, _creds, _safe_name, sb
    import pathlib
    raw = pathlib.Path(path).read_bytes()
    key = f"{STORAGE_DIR}/{_safe_name(project)}-{tag}{pathlib.Path(path).suffix}"
    sb("POST", f"{BUCKET}/{urllib.parse.quote(key)}", raw=raw, ctype=ctype, base="storage/v1/object", timeout=300)
    url, _ = _creds()
    return f"{url}/storage/v1/object/public/{BUCKET}/{key}"


def footage(sig, rng, hist, plan, upload=True):
    """ฟุตเทจจริงจาก Pixabay → plan["bg_video"] · คืน True ถ้าได้"""
    import pathlib
    import tempfile
    used = {b.get("id") for b in _recent(hist, 8) if b.get("source") == "pixabay"}
    query = footage_query(sig)
    pick = _pixabay(query, rng, used) or _pixabay(FOOTAGE_FALLBACK.get(sig["hero"], FOOTAGE_FALLBACK[None]), rng, used)
    if not pick:
        _log(f"Pixabay ไม่มีฟุตเทจที่ใช้ได้สำหรับ '{query}' — วาดภาพแทน")
        return False
    t0 = time.time()
    tmp = pathlib.Path(tempfile.gettempdir()) / f"pxb-{pick['id']}.mp4"
    try:
        _prep_footage(pick["url"], tmp)
        src = _upload_file(tmp, plan.get("project") or "clip", f"pxb-{pick['id']}", "video/mp4") if upload else f"file:{tmp}"
    except Exception as e:
        _log(f"⚠️ เตรียมฟุตเทจไม่สำเร็จ ({str(e)[:120]}) — วาดภาพแทน")
        return False
    plan["bg_video"] = [src]
    plan["bg"] = {"source": "pixabay", "medium": "footage", "id": pick["id"], "query": pick["query"], "page": pick["page"],
                  "by": pick["by"], "hero": sig["hero"], "format": sig["format"], "videos": [src]}
    _log(f"ใช้ฟุตเทจ Pixabay #{pick['id']} ('{pick['query']}' · {pick['w']}×{pick['h']} · {pick['seconds']} วิ) ({time.time() - t0:.0f} วิ)")
    return True


def _upload(png, project):
    from .publish import BUCKET, _creds, _safe_name, sb
    key = f"{STORAGE_DIR}/{_safe_name(project)}-{hashlib.sha1(png).hexdigest()[:8]}.png"
    sb("POST", f"{BUCKET}/{urllib.parse.quote(key)}", raw=png, ctype="image/png", base="storage/v1/object", timeout=120)
    url, _ = _creds()
    return f"{url}/storage/v1/object/public/{BUCKET}/{key}"


def _broll(sig, rng, hist):
    """คลิปจาก Google Flow ที่เจ้าของทำไว้ (tasks/video_broll.json) — ตรงค่าย/รูปแบบ · เลี่ยงคลิปที่เพิ่งใช้"""
    try:
        clips = json.loads(BROLL_FILE.read_text(encoding="utf-8")).get("clips", [])
    except Exception:
        return None
    used = {u for b in _recent(hist, 4) for u in (b.get("videos") or [])}
    fit = [c for c in clips if c.get("url")
           and (not c.get("franchise") or sig["hero"] in c["franchise"])
           and (not c.get("formats") or sig["format"] in c["formats"])]
    fresh = [c for c in fit if c["url"] not in used] or fit
    if not fresh:
        return None
    # ตรงค่ายก่อนคลิปกลาง ๆ (ไม่ระบุค่าย)
    exact = [c for c in fresh if c.get("franchise")]
    return rng.choice(exact or fresh)


def ensure(plan, seed=None, hist=None, upload=True):
    """เติมพื้นหลังให้แผน (ในที่) · คืน plan · มีแล้ว/ปิดไว้ = ไม่ทำอะไร"""
    if plan.get("bg_image") or plan.get("bg_video") or plan.get("bg_auto") is False:
        return plan
    if (plan.get("engine") or "").lower() != "hyperframes":
        return plan
    rng = random.Random(f"bg:{seed or plan.get('project')}")
    sig = signals(plan)
    clip = _broll(sig, rng, hist)
    if clip:
        plan["bg_video"] = [clip["url"]]
        plan["bg"] = {"source": "flow", "videos": [clip["url"]], "hero": sig["hero"], "id": clip.get("id")}
        _log(f"ใช้คลิป Flow '{clip.get('id')}' (ค่าย {sig['hero']})")
        return plan
    # ฟุตเทจจริงเฉพาะค่ายที่ "โลก" ถ่ายได้จริง (ทะเล/พายุ/ภูเขา/วิหาร/โรงงาน/เวที) · โปเกมอน/โพนี่เป็นแฟนตาซี
    # ค้นจริงได้ผีเสื้อบนดอกไม้มาเป็นฉากเลือกข้างโปเกมอน (23 ต.ค.) → ให้ AI วาดแทน · คลิปพิกัดตู้ไม่ใช้ (ห้างต่างประเทศ ≠ ห้างนี้)
    can_footage = (bool(config.env("PIXABAY_API_KEY")) and sig["format"] != "map"
                   and sig["hero"] not in FOOTAGE_SKIP)
    medium, mdesc = choose_medium(rng, hist, footage=can_footage)
    if plan.get("bg_medium") in [m[0] for m in MEDIA]:          # บังคับสื่อได้ (ทดสอบ / เจ้าของเลือกเอง)
        medium, mdesc = next((k, d) for k, _, d in MEDIA if k == plan["bg_medium"])
    if medium == "footage":
        if footage(sig, rng, hist, plan, upload=upload):
            return plan
        medium, mdesc = choose_medium(rng, hist, footage=False)
    if not config.env("OPENAI_API_KEY"):              # เช็กก่อนเรียก Gemini — ไม่เปลืองโควตาคิดฉากที่ไม่ได้วาด
        _log("ไม่มี OPENAI_API_KEY และไม่มีคลิป Flow/ฟุตเทจที่ใช้ได้ — ใช้ลายกราฟิกเดิม")
        return plan
    scene, by = write_scene(sig, mdesc, hist)
    prompt = f"{scene}\n\n{COMPOSE}\n{HARD}"
    t0 = time.time()
    try:
        png = paint(prompt)
    except Exception as e:
        _log(f"⚠️ {str(e)[:160]} — ใช้ลายกราฟิกเดิม")
        return plan
    if png is None:
        _log("ไม่มี OPENAI_API_KEY — ใช้ลายกราฟิกเดิม")
        return plan
    plan["bg"] = {"source": "ai", "medium": medium, "hero": sig["hero"], "format": sig["format"],
                  "scene": scene, "scene_by": by, "model": IMAGE_MODEL}
    if upload:
        try:
            plan["bg_image"] = _upload(png, plan.get("project") or "clip")
        except Exception as e:
            _log(f"⚠️ อัปภาพพื้นหลังไม่ได้ ({str(e)[:100]}) — ใช้ลายกราฟิกเดิม")
            plan.pop("bg", None)
            return plan
    else:
        plan["_bg_png"] = png
    _log(f"วาดพื้นหลัง {medium} · ค่าย {sig['hero']} · ฉากจาก {by} ({time.time() - t0:.0f} วิ)")
    return plan


def main(argv=None):
    """ทดสอบ: python -m agents.video.hf_bg plan.json [--out bg.png] [--dry]"""
    import argparse
    import pathlib
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("--out")
    ap.add_argument("--dry", action="store_true", help="คิดฉากอย่างเดียว ไม่วาด")
    ap.add_argument("--seed")
    ap.add_argument("--medium", help="บังคับสื่อ: " + " · ".join(m[0] for m in MEDIA))
    a = ap.parse_args(argv)
    plan = json.loads(pathlib.Path(a.plan).read_text(encoding="utf-8"))
    for k in ("bg_image", "bg_video", "bg"):
        plan.pop(k, None)
    if a.medium:
        plan["bg_medium"] = a.medium
    sig = signals(plan)
    print(json.dumps({k: v for k, v in sig.items() if k != "world"}, ensure_ascii=False))
    if a.dry:
        rng = random.Random(f"bg:{a.seed or plan.get('project')}")
        m, d = choose_medium(rng, [])
        print(m, "|", write_scene(sig, d, []))
        return
    ensure(plan, seed=a.seed, upload=False)
    if plan.get("_bg_png") and a.out:
        pathlib.Path(a.out).write_bytes(plan.pop("_bg_png"))
    print(json.dumps(plan.get("bg"), ensure_ascii=False, indent=1))
    if plan.get("bg_video"):
        print("วิดีโอ:", plan["bg_video"][0])


if __name__ == "__main__":
    main()
