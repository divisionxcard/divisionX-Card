"""ให้ AI คิด "มุมเล่า" 3 มุมต่อ 1 ไอเดีย แทนประโยค template ตายตัว

ทำไมต้องมี — วัดจากข้อมูลจริง:
    ไอเดียสถานะ new 86 ชิ้น → มุมต่างกันจริงแค่ 24 แบบ
    หนักสุด 22 ชิ้นใช้ประโยคเดียวกันเป๊ะ ("คอนเทนต์เจาะสาขานี้ — โพสต์บอกทำเล...")

เพราะ idea_collector.angle_for() คืนข้อความจาก template ตายตัวแค่ 7 แบบตาม franchise
→ ข่าว One Piece กี่ชิ้นก็ได้โจทย์เดียวกันหมด

นี่คือ **รากจริง** ของปัญหาคอนเทนต์ซ้ำ · เคยแก้ที่ปลายทางไปแล้ว (สุ่มรูปแบบการเขียน
8 แบบ + ให้ AI เห็นแคปชั่นเก่าเพื่อเลี่ยง) แต่ถ้าต้นทางยังป้อนโจทย์เดิม 22 ครั้ง
ต่อให้เขียนดีแค่ไหนก็ออกมาแนวเดียวกัน

รัน:
    python deploy/agents/idea_angles.py                # เติมมุมให้ไอเดียที่ยังไม่มี
    python deploy/agents/idea_angles.py --limit 5      # ทดสอบทีละน้อย
    python deploy/agents/idea_angles.py --dry-run      # ดูผลอย่างเดียว ไม่เขียน DB
    python deploy/agents/idea_angles.py --id 51        # เจาะไอเดียเดียว

โมเดล: Gemini free tier → ไล่โมเดลถัดไปเมื่อโควตารายวันหมด → ถอยไป Ollama บนเครื่อง
⚠️ gemini-flash-latest ให้ฟรีแค่ **วันละ 20 ครั้ง** (อ่านจาก quotaId ในตัว error เอง)
แต่โควตานับแยกตามโมเดล เปลี่ยนโมเดลจึงได้ก้อนใหม่จริง — ดูคอมเมนต์เหนือ MODEL_CHAIN
"""
import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import _console  # noqa: F401 — บังคับ stdout เป็น UTF-8 ต้องมาก่อน print แรก

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
VOICE = ROOT / "tasks" / "content_voice.json"

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
SB_KEY = (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
GEMINI_KEY = (os.environ.get("GEMINI_API_KEY") or "").strip()

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
N_ANGLES = 3


def load_env_file():
    global SB_URL, SB_KEY, GEMINI_KEY
    f = ROOT / ".env.local"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if k in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") and not SB_URL:
            SB_URL = v
        if k in ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY") and not SB_KEY:
            SB_KEY = v
        if k == "GEMINI_API_KEY" and not GEMINI_KEY:
            GEMINI_KEY = v


def sb(method, path, body=None):
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
        data = json.dumps(body).encode()
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", method=method, headers=headers, data=data)
    with urllib.request.urlopen(req, timeout=60) as r:
        out = r.read()
    return json.loads(out) if out.strip() else []


# summary ของข่าวจาก Google News RSS เป็น <a href> ล้วน ไม่มีเนื้อข่าว (เช็กแล้ว 28/28)
# ล้าง tag ทิ้งแล้วเหลืออะไรอ่านได้จริงค่อยส่งเข้า prompt — เดียวกับที่ทำใน generate route
def clean_summary(s):
    if not s:
        return ""
    if s.startswith("ปก:"):
        return ""
    t = re.sub(r"<[^>]*>", " ", s)
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"&[a-z]+;|&#\d+;", " ", t, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) >= 25 else ""


def build_prompt(voice, idea, formats):
    fmt_list = "\n".join(f"- {f['label']}: {f['brief']}" for f in formats)
    parts = [
        f"คุณเป็นนักวางแผนคอนเทนต์ให้ {voice.get('brand', 'ตู้กดการ์ดสะสม')}",
        f"กลุ่มเป้าหมาย: {voice.get('audience', '')}",
        "",
        "จากข่าว/ข้อมูลชิ้นนี้ ให้คิด **มุมเล่า 3 มุม** ที่จะเอาไปทำโพสต์",
        "",
        f"หัวข้อ: {idea.get('title') or '-'}",
    ]
    s = clean_summary(idea.get("summary"))
    if s:
        parts.append(f"รายละเอียด: {s}")
    if idea.get("related_sku"):
        parts.append(f"สินค้าที่โยงถึง: {idea['related_sku']}")
    if idea.get("source"):
        parts.append(f"แหล่งที่มา: {idea['source']}")

    parts += [
        "",
        "**กฎเหล็ก — 3 มุมต้องต่างกันที่ 'ชนิดของคอนเทนต์' ไม่ใช่ต่างแค่คำพูด**",
        "ห้ามให้ทั้ง 3 มุมเป็นแนว 'เกาะกระแสแล้วชวนมากดตู้' เหมือนกันหมด",
        "เลือกชนิดที่ต่างกันจากรายการนี้ อย่างน้อย 3 ชนิดที่ไม่ซ้ำกัน:",
        fmt_list,
        "",
        "แต่ละมุมต้อง:",
        "- อ่านแล้วรู้ทันทีว่าจะโพสต์อะไร ไม่ใช่คำกว้าง ๆ",
        "- ยึดกับข้อมูลในข่าวจริง ห้ามแต่งตัวเลขหรือข้อเท็จจริงขึ้นเอง",
        "- เขียนเป็นภาษาไทย",
        "",
        "ตอบเป็น JSON เท่านั้น ห้ามมีคำอธิบายอื่น:",
        '[{"label":"ชื่อมุมสั้นไม่เกิน 22 ตัวอักษร","brief":"อธิบายว่าจะเล่าอะไรยังไง 1-2 ประโยค"}]',
    ]
    return "\n".join(parts)


# ⚠️ 429 ของ Gemini มี 2 ชนิด และแก้คนละทาง — เคยวินิจฉัยผิดมาแล้ว 2 รอบ
#   ครั้งที่ 1 เขียนว่า "ไอเดียวันละไม่กี่สิบชิ้น ไม่มีทางเกิน 1,500/วัน"
#   ครั้งที่ 2 สรุปว่า "ตัวที่บีบคือลิมิตต่อนาที" — ก็ยังไม่ครบ
#
# ของจริงอ่านได้จาก quotaId ในตัว error (2026-08-10 ยิงเช็กเอง):
#   GenerateRequestsPerDayPerProjectPerModel-FreeTier · quotaValue: 20 · gemini-3.6-flash
#   → gemini-flash-latest ให้ฟรี **วันละ 20 ครั้ง** เท่านั้น ไอเดีย 86 ชิ้นไม่มีทางพอ
#
# แต่โควตานับ "แยกตามโมเดล" (ดูชื่อ quota: ...PerProjectPerModel) — ไล่โมเดลถัดไป
# จึงได้โควตาก้อนใหม่จริง ไม่ใช่แค่รอเฉย ๆ · หมดทุกโมเดลค่อยถอยไป Ollama บนเครื่อง
PACE_SEC = 5
BACKOFF = [20, 45, 90]

# ไล่จากคุณภาพดีสุดลงไป · flash-lite ยังเหลือโควตาตอน flash หมดแล้ว (เช็กแล้ว)
# 2026-08-17 ยิงจริงทีละตัวแล้วตัด gemini-2.0-flash-lite ออก — ตายไปแล้ว (404 no longer available)
# ตัวที่ตายเหมือนกัน: gemini-2.5-flash, gemini-2.5-flash-lite · gemini-pro-latest มีอยู่แต่ 429 ตั้งแต่ครั้งแรก
# เหลือสองตัวนี้ที่ใช้ได้จริง — ก่อนเติมชื่อใหม่ให้ยิงทดสอบก่อนเสมอ อย่าเชื่อ ListModels
MODEL_CHAIN = ["gemini-flash-latest", "gemini-flash-lite-latest"]


class QuotaOut(Exception):
    def __init__(self, model, daily):
        super().__init__(f"โควตา {model} หมด" + (" (รายวัน)" if daily else " (ต่อนาที)"))
        self.model = model
        self.daily = daily


def is_daily_quota(detail):
    """แยก 429 รายวัน (รอไปก็ไม่หาย ต้องเปลี่ยนโมเดล) ออกจาก 429 ต่อนาที (รอแล้วหาย)"""
    return "PerDay" in detail


def ask_gemini(prompt, model):
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.95, "maxOutputTokens": 2048},
    }
    for attempt in range(len(BACKOFF) + 1):
        req = urllib.request.Request(
            f"{GEMINI_BASE}/models/{model}:generateContent",
            method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY},
            data=json.dumps(body).encode(),
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                j = json.load(r)
            parts = (j.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts).strip()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            detail = e.read().decode("utf-8", "ignore")
            # โควตารายวันหมด → ถอยรอกี่ทีก็ไม่คืน ส่งต่อให้ ask_ai เปลี่ยนโมเดลทันที
            if is_daily_quota(detail) or attempt >= len(BACKOFF):
                raise QuotaOut(model, daily=is_daily_quota(detail))
            wait = BACKOFF[attempt]
            print(f"      (ชนลิมิตต่อนาที รอ {wait} วิ แล้วลองใหม่)")
            time.sleep(wait)
    return ""


def ask_ollama(prompt, voice):
    """ทางสำรองบนเครื่องตัวเอง — ช้ากว่าแต่ไม่มีโควตา · ใช้ได้เฉพาะรันจากเครื่องที่ลง Ollama"""
    host = os.environ.get("OLLAMA_HOST") or voice.get("ollama_host") or "http://localhost:11434"
    model = os.environ.get("OLLAMA_MODEL") or voice.get("ollama_model") or "qwen2.5:14b"
    body = {
        "model": model, "stream": False, "format": "json",
        "messages": [{"role": "user", "content": prompt}],
        "options": {"temperature": 0.9},
    }
    req = urllib.request.Request(
        f"{host}/api/chat", method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(body).encode(),
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        j = json.load(r)
    return (j.get("message", {}).get("content") or "").strip()


class Router:
    """จำไว้ว่าโมเดลไหนหมดแล้ว จะได้ไม่ยิงซ้ำให้เสียเวลาทั้ง 78 รอบ"""

    def __init__(self, chain, voice):
        self.chain = list(chain)
        self.voice = voice
        self.i = 0
        self.on_ollama = False

    @property
    def label(self):
        return f"ollama:{os.environ.get('OLLAMA_MODEL') or self.voice.get('ollama_model') or 'qwen2.5:14b'}" \
            if self.on_ollama else self.chain[self.i]

    def ask(self, prompt):
        while not self.on_ollama:
            try:
                return ask_gemini(prompt, self.chain[self.i])
            except QuotaOut as e:
                self.i += 1
                if self.i < len(self.chain):
                    print(f"      ({e} → เปลี่ยนไป {self.chain[self.i]})")
                    continue
                print(f"      ({e} → Gemini หมดทุกโมเดล ถอยไปใช้ Ollama บนเครื่อง)")
                self.on_ollama = True
        return ask_ollama(prompt, self.voice)


def parse_angles(text):
    """โมเดลชอบครอบ ``` หรือแถมคำอธิบาย — ดึงเฉพาะก้อน JSON ออกมา"""
    t = re.sub(r"^```[a-z]*\s*|\s*```$", "", (text or "").strip(), flags=re.I | re.M)
    m = re.search(r"\[.*\]", t, re.S)
    if not m:
        return []
    try:
        arr = json.loads(m.group(0))
    except Exception:
        return []
    out = []
    for a in arr if isinstance(arr, list) else []:
        if not isinstance(a, dict):
            continue
        label = str(a.get("label") or "").strip()
        brief = str(a.get("brief") or "").strip()
        if label and brief:
            out.append({"label": label[:60], "brief": brief[:400]})
    return out[:N_ANGLES]


def main():
    ap = argparse.ArgumentParser(description="ให้ AI คิดมุมเล่าหลายมุมต่อ 1 ไอเดีย")
    ap.add_argument("--limit", type=int, default=20, help="ทำสูงสุดกี่ชิ้นต่อรอบ")
    ap.add_argument("--id", type=int, help="เจาะไอเดียเดียว (ทับ --limit)")
    ap.add_argument("--dry-run", action="store_true", help="แสดงผลอย่างเดียว ไม่เขียน DB")
    ap.add_argument("--redo", action="store_true", help="ทำใหม่แม้มี angles อยู่แล้ว")
    args = ap.parse_args()

    load_env_file()
    if not SB_URL or not SB_KEY:
        print("[angles] ไม่มี SUPABASE_URL / SERVICE KEY"); sys.exit(1)
    if not GEMINI_KEY:
        print("[angles] ไม่มี GEMINI_API_KEY — ตัวนี้ใช้ free tier ขอฟรีที่ ai.google.dev"); sys.exit(1)

    voice = json.loads(VOICE.read_text(encoding="utf-8"))
    formats = voice.get("content_formats") or []
    model = os.environ.get("GEMINI_MODEL") or voice.get("gemini_model") or "gemini-flash-latest"

    sel = "id,title,summary,source,related_sku,angle,angles"
    try:
        if args.id:
            rows = sb("GET", f"marketing_ideas?id=eq.{args.id}&select={sel}")
        else:
            q = f"marketing_ideas?status=eq.new&select={sel}&order=score.desc&limit={args.limit}"
            if not args.redo:
                q += "&angles=is.null"
            rows = sb("GET", q)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")
        # 400 ที่นี่มักแปลว่ายังไม่มีคอลัมน์ angles — ไม่ใช่ query ผิด
        # บอกทางแก้ให้ตรง ดีกว่าโยน traceback ให้ไปเดาเอง
        if "angles" in detail or e.code == 400:
            print("[angles] ตาราง marketing_ideas ยังไม่มีคอลัมน์ angles")
            print("         → เอา backend/database/migrations/063_marketing_ideas_angles.sql")
            print("           ไปรันใน Supabase SQL Editor ก่อน แล้วค่อยรันตัวนี้ใหม่")
            sys.exit(1)
        raise

    if not rows:
        print("[angles] ไม่มีไอเดียที่ต้องเติมมุม — จบ")
        return

    router = Router([model] + [m for m in MODEL_CHAIN if m != model], voice)
    print(f"[angles] จะเติมมุมให้ {len(rows)} ไอเดีย · เริ่มที่ {router.label}")
    ok = fail = 0
    for n, it in enumerate(rows):
        if n and not router.on_ollama:
            time.sleep(PACE_SEC)      # เว้นจังหวะให้อยู่ใต้ลิมิตต่อนาที (Ollama ไม่ต้อง)
        title = (it.get("title") or "")[:58]
        try:
            # ลองซ้ำ 1 รอบเมื่อ parse ไม่ออก — บางครั้งโมเดลตอบเป็นร้อยแก้วแทน JSON
            # (เจอจริง 1 ใน 3 ชิ้นตอนทดสอบ) · ยิงใหม่ทีเดียวมักได้ เพราะ temperature สูง
            angles = parse_angles(router.ask(build_prompt(voice, it, formats)))
            if len(angles) < 2:
                angles = parse_angles(router.ask(
                    build_prompt(voice, it, formats)
                    + "\n\nย้ำ: ตอบเป็น JSON array ล้วน ๆ เท่านั้น ห้ามมีข้อความอื่นนำหน้าหรือต่อท้าย"))
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")[:120]
            print(f"  ✗ #{it['id']} {title} — HTTP {e.code} {msg}")
            fail += 1
            continue
        except Exception as e:
            print(f"  ✗ #{it['id']} {title} — {str(e)[:110]}")
            fail += 1
            # Ollama ต่อไม่ติดด้วย = ไม่เหลือทางไหนแล้ว หยุดดีกว่าปล่อยพังรัวทั้ง 78 ชิ้น
            if router.on_ollama:
                print("[angles] Gemini หมดโควตา และต่อ Ollama บนเครื่องไม่ได้ — หยุด")
                break
            continue

        if len(angles) < 2:
            print(f"  ✗ #{it['id']} {title} — ได้มุมไม่ครบ ({len(angles)})")
            fail += 1
            continue

        print(f"  ✓ #{it['id']} {title}  [{router.label}]")
        for a in angles:
            print(f"      · {a['label']} — {a['brief'][:66]}")
        if not args.dry_run:
            sb("PATCH", f"marketing_ideas?id=eq.{it['id']}", {"angles": angles})
        ok += 1

    print(f"\n[angles] สำเร็จ {ok} · ล้มเหลว {fail}" + (" · dry-run ไม่ได้เขียน DB" if args.dry_run else ""))


if __name__ == "__main__":
    main()
