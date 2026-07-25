"""
Content Suggester (Loop 2) — winners จาก AI Insights → Ollama ร่าง caption original → staging + Telegram

flow: winner (trend สูง) → Ollama เขียน caption โทนแบรนด์ "เปิดซอง เปิดดวง"
      → เขียน deploy/tasks/content_suggestions.json (status: pending_review)
      → ส่ง Telegram MKT ให้คนรีวิว/อนุมัติ (ก๊อป object เข้า content_queue.json ได้เลย)

⚠️ human-in-the-loop: ไม่แตะ content_queue.json (curated) · แค่เสนอร่าง · คนอนุมัติเอง
⚠️ Ollama local → รันในเครื่องเท่านั้น (ต่อจาก weekly_marketing_brief · run_weekly_brief.ps1)

Env:
  TELEGRAM_MKT_BOT_TOKEN + TELEGRAM_MKT_CHAT_ID   (bot การตลาด)
  OLLAMA_HOST (default http://localhost:11434) · OLLAMA_MODEL (default qwen2.5:7b)

รัน:
  python deploy/agents/content_suggester.py                # ร่าง + ส่ง Telegram
  python deploy/agents/content_suggester.py --dry-run      # ไม่ส่ง/ไม่เขียนไฟล์
  python deploy/agents/content_suggester.py --count 4
"""
import os
import re
import sys
import json
import html
import argparse
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKU_DIR = PROJECT_ROOT / "wiki" / "skus"
OUT_FILE = PROJECT_ROOT / "deploy" / "tasks" / "content_suggestions.json"

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / "deploy" / ".env.local")
except ImportError:
    pass

TG_TOKEN = os.environ.get("TELEGRAM_MKT_BOT_TOKEN")
TG_CHAT = os.environ.get("TELEGRAM_MKT_CHAT_ID")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")

PRODUCTS_LINK = "division-x-card.vercel.app/products"
BRANCHES_LINK = "division-x-card.vercel.app/branches"


def parse_frontmatter(text):
    text = text.replace("\r\n", "\n")
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    meta = {}
    for line in text[4:end].strip().split("\n"):
        m = re.match(r"^([a-z_][a-z0-9_]*)\s*:\s*(.*)$", line, re.I)
        if not m:
            continue
        key, val = m.group(1).strip(), m.group(2).strip()
        if re.match(r"^-?\d+(\.\d+)?$", val):
            val = float(val) if "." in val else int(val)
        meta[key] = val
    return meta, text[end + 4:]


def load_winners(count):
    """top SKU ตาม trend_pct (ต้องมียอดขาย + trend เป็นบวก)"""
    rows = []
    for f in SKU_DIR.glob("*.md"):
        if f.name.startswith("_"):
            continue
        meta, body = parse_frontmatter(f.read_text(encoding="utf-8"))
        if not meta.get("sku_id") or (meta.get("sales_qty_30d") or 0) <= 0:
            continue
        trend = meta.get("trend_pct")
        if not isinstance(trend, (int, float)) or trend <= 0:
            continue
        nm = re.search(r"\*\*Name:\*\*\s*(.+?)(?:\s*·|\n)", body)
        rows.append({
            "sku_id": meta["sku_id"],
            "name": (nm.group(1).strip() if nm else meta["sku_id"]),
            "series": meta.get("series"),
            "trend_pct": round(trend),
            "sales_qty_30d": meta.get("sales_qty_30d"),
        })
    rows.sort(key=lambda r: -r["trend_pct"])
    return rows[:count]


SYSTEM_PROMPT = """คุณเป็น content creator ของ DivisionX Card (ตู้กดการ์ดสะสม One Piece/Pokemon/Yu-Gi-Oh ในห้าง)

หน้าที่: เขียนแคปชั่นโพสต์ Facebook แบบ original จากรายการ SKU ที่กำลังมาแรง

แบรนด์เสียง: สนุก ลุ้น · สโลแกน "เปิดซอง เปิดดวง" · กลุ่มเป้าหมาย = นักสะสมการ์ด TCG

กฎเข้ม:
1. ภาษาไทย · original 100% ห้ามลอกใคร
2. แต่ละแคปชั่นชู SKU ที่มาแรงจริง (ใช้ชื่อที่ให้มา) · โยงว่า"หมดไว รีบมากด"
3. ใส่แฮชแท็กที่เกี่ยวข้อง 2-3 อัน (#OnePieceTCG #ตู้กดการ์ด #DivisionXCard ฯลฯ ตามซีรีส์)
4. ห้ามใส่ลิงก์ในแคปชั่น (ระบบใส่ในคอมเมนต์เอง)
5. กระชับ 3-5 บรรทัด · มี emoji พอเหมาะ
6. ห้ามสัญญาราคา/โปรที่ไม่มีจริง

ตอบเป็น JSON array เท่านั้น (ไม่มีข้อความอื่น):
[{"platform":"FB เพจ","slot":"morning","days":["Mon"],"caption":"...","theme":"SKU มาแรง"}]
- platform: "FB เพจ" | "FB Reels" | "กลุ่ม FB"
- slot: "morning" | "evening"  ·  days: list ของ ["Mon".."Sun"]
- ให้แต่ละอันต่างแพลตฟอร์ม/มุมมองกัน"""


def call_ollama(winners, count, model):
    try:
        from ollama import Client
    except ImportError:
        sys.exit("❌ ติดตั้ง ollama ก่อน: pip install ollama")
    client = Client(host=OLLAMA_HOST)
    user = (
        f"SKU มาแรงสัปดาห์นี้ (เรียงตาม trend):\n```json\n"
        + json.dumps(winners, ensure_ascii=False, indent=2)
        + f"\n```\n\nเขียน {count} แคปชั่น original ต่างแพลตฟอร์ม/มุมมอง "
        "ตอบเป็น JSON array ตาม schema เท่านั้น"
    )
    resp = client.chat(model=model, messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ], options={"temperature": 0.6})
    return resp["message"]["content"]


def extract_json_array(txt):
    """ดึง JSON array จาก response (เผื่อมี ```json fences หรือข้อความห่อ)"""
    m = re.search(r"\[\s*\{.*\}\s*\]", txt, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def pick_link(platform):
    return BRANCHES_LINK if "Reels" in platform or "กลุ่ม" in platform else PRODUCTS_LINK


def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        print("[suggester] TELEGRAM_MKT_* ยังไม่ตั้ง — skip send")
        print(text)
        return
    body = json.dumps({"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                                 data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        print("[suggester] ส่ง Telegram สำเร็จ")
    except urllib.error.HTTPError as e:
        print(f"[suggester] Telegram HTTPError {e.code}: {e.read().decode('utf-8','ignore')}")


def main():
    ap = argparse.ArgumentParser(description="Content Suggester (Loop 2)")
    ap.add_argument("--count", type=int, default=3, help="จำนวนแคปชั่นที่ร่าง")
    ap.add_argument("--model", type=str, default=OLLAMA_MODEL)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SKU_DIR.exists():
        sys.exit(f"❌ ไม่พบ {SKU_DIR} — รัน sku_profile_agent.py ก่อน")

    winners = load_winners(args.count)
    if not winners:
        sys.exit("❌ ไม่มี SKU trend เป็นบวก — รัน sku_profile_agent.py ก่อน")
    print(f"[suggester] winners: " + ", ".join(f"{w['sku_id']} (+{w['trend_pct']}%)" for w in winners))
    print(f"[suggester] 🧠 เรียก Ollama ({args.model})...")

    raw = call_ollama(winners, args.count, args.model)
    posts = extract_json_array(raw)
    if not posts:
        print("[suggester] ⚠️ parse JSON ไม่ได้ — ส่ง raw ให้ตรวจเอง")
        tg_send("🆕 <b>ร่างคอนเทนต์ AI (parse ไม่ได้ · ตรวจเอง)</b>\n<code>" + html.escape(raw[:3500]) + "</code>")
        return

    # normalize + เติม link ตาม platform
    clean = []
    for p in posts:
        cap = (p.get("caption") or "").strip()
        if not cap:
            continue
        platform = p.get("platform") or "FB เพจ"
        clean.append({
            "days": p.get("days") or ["Mon"],
            "slot": p.get("slot") or "morning",
            "platform": platform,
            "caption": cap,
            "link": pick_link(platform),
        })
    if not clean:
        sys.exit("❌ ไม่มีแคปชั่นที่ใช้ได้")

    payload = {
        "_comment": "ร่างคอนเทนต์ AI (Loop 2) จาก winners · รออนุมัติ → ก๊อป object ใน posts[] ไปวางใน content_queue.json",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "based_on_winners": [w["sku_id"] for w in winners],
        "status": "pending_review",
        "posts": clean,
    }

    # ── Telegram: ร่างพร้อมก๊อป ──
    lines = [
        "🆕 <b>ร่างคอนเทนต์ AI ประจำสัปดาห์ · รออนุมัติ</b>",
        f"<i>จาก SKU มาแรง: {html.escape(', '.join(w['sku_id'] for w in winners))}</i>",
        "━━━━━━━━━━━━━",
    ]
    for i, p in enumerate(clean, 1):
        lines.append(f"<b>{i}. {html.escape(p['platform'])}</b> · {'/'.join(p['days'])} · {p['slot']}")
        lines.append(f"<code>{html.escape(p['caption'])}</code>")
        lines.append(f"🔗 {html.escape(p['link'])} <i>(ใส่คอมเมนต์)</i>")
        lines.append("")
    lines.append("✅ อนุมัติ = ก๊อปแคปชั่นไปโพสต์ หรือวาง object ใน content_queue.json")
    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3950] + "\n…(ตัด)"

    if args.dry_run:
        print("── DRY RUN — ไม่เขียนไฟล์/ไม่ส่ง ──")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        print("\n--- Telegram preview ---\n" + text)
    else:
        OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[suggester] เขียน {OUT_FILE.relative_to(PROJECT_ROOT)} ({len(clean)} ร่าง)")
        tg_send(text)


if __name__ == "__main__":
    main()
