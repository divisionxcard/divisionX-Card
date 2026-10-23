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
]

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


def choose_medium(rng, hist):
    """สื่อแบบสุ่มถ่วงน้ำหนัก เลี่ยง 2 คลิปล่าสุด"""
    used = [b.get("medium") for b in _recent(hist, 2)]
    pool = [(k, w, d) for k, w, d in MEDIA if k not in used] or MEDIA
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
    if not config.env("OPENAI_API_KEY"):              # เช็กก่อนเรียก Gemini — ไม่เปลืองโควตาคิดฉากที่ไม่ได้วาด
        _log("ไม่มี OPENAI_API_KEY และไม่มีคลิป Flow ที่ตรง — ใช้ลายกราฟิกเดิม")
        return plan
    medium, mdesc = choose_medium(rng, hist)
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
    a = ap.parse_args(argv)
    plan = json.loads(pathlib.Path(a.plan).read_text(encoding="utf-8"))
    for k in ("bg_image", "bg_video", "bg"):
        plan.pop(k, None)
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


if __name__ == "__main__":
    main()
