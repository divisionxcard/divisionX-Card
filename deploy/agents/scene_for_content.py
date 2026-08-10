"""คิดฉากพื้นหลังให้ตรงกับคอนเทนต์แต่ละชิ้น แล้วให้ FLUX วาด

ต่างจากคลังฉากตายตัวยังไง:
    เจ้าของขอเอง — *"เอาแบบไม่ตายตัวได้ไหม ขอให้คิดเข้ากับคอนเทนต์แต่ละหัวข้อ"*
    ข่าว One Piece กับข่าว Solo Leveling ควรได้บรรยากาศคนละแบบ
    ถ้าใช้ฉากกลาง ๆ ชุดเดียววนไป ก็กลับไปเป็นปัญหาเดิมที่ว่า "หน้าตาคล้ายกันทุกรูป"

ทำงาน 3 ต่อ:
    1. LLM อ่านแคปชั่น + SKU แล้วเขียน "คำสั่งฉาก" เป็นภาษาอังกฤษ
    2. FLUX วาดฉากตามนั้น (บนเครื่อง ไม่มีค่าใช้จ่าย)
    3. อัปเข้า marketing/aibg/{content_id}-{เวลา}.png → poster_render หยิบไปใช้อัตโนมัติ

⚠️ ทำไมต้องให้ LLM เขียนคำสั่ง ไม่ส่งแคปชั่นไทยเข้า FLUX ตรง ๆ:
    · FLUX เข้าใจอังกฤษดีกว่าไทยมาก (ทดสอบแล้วต่างกันจริง)
    · แคปชั่นมีตัวเลข/ชื่อชุด/CTA ซึ่งเป็น "ข้อความ" ไม่ใช่ "ภาพ" — ส่งเข้าไปโมเดลจะพยายาม
      เขียนตัวอักษรลงภาพ แล้วออกมาเป็นตัวหนังสือมั่ว
    · ต้องแปลง "เรื่องที่จะเล่า" → "ฉากที่สื่อเรื่องนั้น" ซึ่งเป็นงานที่ LLM ทำได้ดี

⚠️ FLUX.1-schnell ไม่มี negative prompt (guidance=0) — ทุกคำที่เขียนคือสิ่งที่อยากได้
    เขียน "no text" จะกลายเป็นการป้อนคำว่า text เข้าไป แล้วได้ตัวหนังสือมั่วกลับมา
    (เจอจริงในภาพทดสอบใบแรก: สั่งห้ามแล้วได้ป้ายเขียน "EMANG" กับคนเดินในภาพ)
    → prompt จึงต้องบอกแต่สิ่งที่อยากได้ และห้าม LLM เอ่ยถึงคน/ตัวอักษร/ป้ายเลย

รัน:
    python deploy/agents/scene_for_content.py --id 23
    python deploy/agents/scene_for_content.py --id 23 --dry-run   # ดูคำสั่งฉากอย่างเดียว
"""
import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT_DIR = ROOT / ".scenes"
BUCKET = "marketing"

sys.path.insert(0, str(HERE))
from local_image import generate, load_env   # noqa: E402
import _console  # noqa: F401 — บังคับ stdout เป็น UTF-8 ต้องมาก่อน print แรก

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
# ไล่ตามโควตา — เหมือนที่ทำใน idea_angles.py (โควตาฟรีนับแยกตามโมเดล)
GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.0-flash-lite"]

PROMPT_RULES = """คุณเป็นผู้กำกับภาพ แปลง "เรื่องที่จะโพสต์" ให้เป็น "ฉากพื้นหลัง" สำหรับโปสเตอร์

สิ่งที่ต้องทำ: เขียนคำสั่งภาพเป็น **ภาษาอังกฤษ** 1 ย่อหน้า ไม่เกิน 45 คำ

กฎเหล็ก:
- บรรยายเฉพาะ **ฉาก แสง สี พื้นผิว บรรยากาศ** เท่านั้น
- **ห้ามเอ่ยถึง**: คน ใบหน้า ตัวอักษร ตัวเลข ป้าย โลโก้ ร้านค้า ห้างสรรพสินค้า การ์ด ซองสินค้า ตู้ขายของ
  (เอ่ยถึงเมื่อไหร่โมเดลจะวาดมันขึ้นมา แล้วออกมาเป็นของปลอม/ตัวหนังสือมั่ว)
- ต้องเว้นพื้นที่ว่างไว้ให้วางตัวหนังสือ — ใส่คำว่า "generous empty space" หรือ "clean negative space"
- โทนสีแบรนด์: กรมท่าเข้ม + ฟ้านีออน (deep navy, electric cyan)
- ให้ฉาก **สื่ออารมณ์ของเรื่อง** เช่น เรื่องของหายาก → แสงสปอตไลต์เดี่ยวในความมืด
  เรื่องมาแรง/ยอดพุ่ง → พลังงาน เส้นแสงพุ่ง · เรื่องชวนคุย → นุ่ม โปร่ง มีที่ว่างเยอะ

**ต้องเลือกแนวภาพ 1 แบบจากรายการนี้ แล้วบรรยายตามแนวนั้นให้ชัด**
(สีแบรนด์เหมือนกันได้ แต่ถ้าองค์ประกอบเหมือนกันทุกใบ โปสเตอร์จะดูซ้ำกันหมด):
  1. แท่นวางในสตูดิโอมืด มุมกล้องระดับสายตา สปอตไลต์บนลงล่าง
  2. พื้นผิวใกล้ ๆ เต็มเฟรม (หินขัด/กำมะหยี่/โลหะแปรง) ถ่ายมุมเฉียง ระยะชัดตื้น
  3. โบเก้ดวงไฟหลุดโฟกัสหนัก ๆ ไม่มีวัตถุชัดเลย
  4. เส้นแสง/อนุภาคพุ่งทแยง พื้นหลังโล่ง ให้ความรู้สึกเคลื่อนไหว
  5. หมอกควันในลำแสง มุมกว้าง เพดานสูง โล่งมาก
  6. ผิวน้ำ/กระจกสะท้อน มีระลอก สมมาตรบน-ล่าง

ตอบเป็นคำสั่งภาษาอังกฤษล้วน ๆ ไม่ต้องมีคำนำ ไม่ต้องบอกว่าเลือกแนวไหน"""


def sb(method, path, body=None, raw=None, ctype=None, base="rest/v1"):
    url = f"{os.environ['SUPABASE_URL'].rstrip('/')}/{base}/{path}"
    h = {
        "apikey": os.environ["SUPABASE_SERVICE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_KEY']}",
    }
    data = raw
    if body is not None:
        h["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    elif ctype:
        h["Content-Type"] = ctype
    req = urllib.request.Request(url, method=method, headers=h, data=data)
    with urllib.request.urlopen(req, timeout=120) as r:
        out = r.read()
    return json.loads(out) if out.strip() and method == "GET" else out


def env_supabase():
    for a, b in (("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
                 ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY")):
        if not os.environ.get(a):
            os.environ[a] = os.environ.get(b, "")
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"))


def ask_gemini(prompt):
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        return None
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 1.0, "maxOutputTokens": 300}}
    for model in GEMINI_MODELS:
        req = urllib.request.Request(
            f"{GEMINI_BASE}/models/{model}:generateContent", method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
            data=json.dumps(body).encode())
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                j = json.load(r)
            parts = (j.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            txt = "".join(p.get("text", "") for p in parts).strip()
            if txt:
                print(f"[scene] คำสั่งฉากจาก {model}")
                return txt
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"[scene] {model} โควตาหมด → ลองตัวถัดไป")
                continue
            raise
    return None


def ask_ollama(prompt):
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    model = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b")
    body = {"model": model, "stream": False,
            "messages": [{"role": "user", "content": prompt}],
            "options": {"temperature": 0.9}}
    req = urllib.request.Request(f"{host}/api/chat", method="POST",
                                 headers={"Content-Type": "application/json"},
                                 data=json.dumps(body).encode())
    with urllib.request.urlopen(req, timeout=300) as r:
        j = json.load(r)
    print(f"[scene] คำสั่งฉากจาก ollama:{model}")
    return (j.get("message", {}).get("content") or "").strip()


def clean_prompt(txt):
    """ตัดสิ่งที่ LLM ชอบแถมมา และคำที่จะทำให้ FLUX วาดของไม่พึงประสงค์"""
    t = re.sub(r"^```[a-z]*\s*|\s*```$", "", (txt or "").strip(), flags=re.I | re.M)
    t = re.sub(r'^["\']|["\']$', "", t.strip())
    t = re.sub(r"\s+", " ", t)
    # กันคำที่ลากคน/ตัวอักษรเข้ามา แม้จะสั่งห้ามไปแล้ว — LLM หลุดได้
    for w in ("people", "person", "man", "woman", "crowd", "shopper", "text", "sign",
              "signage", "logo", "letters", "words", "shop", "store", "mall"):
        t = re.sub(rf"\b{w}s?\b", "", t, flags=re.I)
    return re.sub(r"\s{2,}", " ", t).strip(" ,.")


def scene_prompt(content):
    cap = (content.get("caption") or "").strip()[:400]
    sku = content.get("source_sku") or ""
    ask = f"{PROMPT_RULES}\n\nเรื่องที่จะโพสต์:\n{cap}"
    if sku:
        ask += f"\n\nสินค้าที่เกี่ยวข้อง: {sku}"

    txt = None
    try:
        txt = ask_gemini(ask)
    except Exception as e:
        print(f"[scene] Gemini ล้ม: {str(e)[:90]}")
    if not txt:
        try:
            txt = ask_ollama(ask)
        except Exception as e:
            print(f"[scene] Ollama ล้ม: {str(e)[:90]}")
    if not txt:
        return None
    return clean_prompt(txt)


def main():
    ap = argparse.ArgumentParser(description="คิดฉากให้ตรงกับคอนเทนต์แล้วให้ FLUX วาด")
    ap.add_argument("--id", type=int, required=True)
    ap.add_argument("--size", default="1024x1024")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--dry-run", action="store_true", help="ดูคำสั่งฉากอย่างเดียว ไม่วาด ไม่อัป")
    args = ap.parse_args()

    load_env()
    if not env_supabase():
        sys.exit("[scene] ไม่มี SUPABASE_URL / SERVICE KEY")

    rows = sb("GET", f"marketing_content?id=eq.{args.id}&select=id,caption,source_sku")
    if not rows:
        sys.exit(f"[scene] ไม่พบคอนเทนต์ id={args.id}")
    content = rows[0]

    prompt = scene_prompt(content)
    if not prompt:
        sys.exit("[scene] คิดคำสั่งฉากไม่สำเร็จ (ทั้ง Gemini และ Ollama ใช้ไม่ได้)")
    print(f"[scene] #{args.id} → {prompt}")

    if args.dry_run:
        print("[scene] dry-run — ไม่วาด ไม่อัป")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = int(time.time())
    out = OUT_DIR / f"c{args.id}-{stamp}.png"
    w, h = (int(x) for x in args.size.lower().split("x"))
    generate(prompt, str(out), w, h, args.seed)

    key = f"aibg/{args.id}-{stamp}.png"
    sb("POST", f"{BUCKET}/{key}", raw=out.read_bytes(), ctype="image/png",
       base="storage/v1/object")
    url = f"{os.environ['SUPABASE_URL']}/storage/v1/object/public/{BUCKET}/{key}"
    print(f"[scene] อัปเข้าคลังแล้ว → {url}")
    print("[scene] สั่งสร้างโปสเตอร์คอนเทนต์นี้ได้เลย ระบบจะหยิบฉากนี้ไปใช้")


if __name__ == "__main__":
    main()
