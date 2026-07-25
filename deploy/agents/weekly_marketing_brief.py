"""
Weekly Marketing Brief (Loop 1) — สังเคราะห์ AI Insights → คำแนะนำการตลาดรายสัปดาห์ → Telegram

อ่าน insight ต่อ SKU จาก wiki/skus/*.md (ที่ sku_profile_agent สร้าง) → จัดเป็น
winners/losers/low-margin → ให้ Ollama (local ฟรี) เขียน brief actionable:
  📣 ดันอะไร · 🔧 แก้อะไร · 💸 งบโฆษณา · 📦 เติมด่วน

⚠️ ใช้ Ollama local → รันในเครื่องที่มี Ollama เท่านั้น (cloud cron รันไม่ได้)
   ตั้ง Windows Task Scheduler รายสัปดาห์ หรือรันมือทุกจันทร์
   แนะนำ: รัน sku_profile_agent.py ก่อน (รีเฟรช insight) แล้วค่อยรันตัวนี้

Env:
  SUPABASE_URL + SUPABASE_SERVICE_KEY               (ดึงยอดต่อตู้ WoW — optional เสริม)
  TELEGRAM_MKT_BOT_TOKEN + TELEGRAM_MKT_CHAT_ID     (bot การตลาด · ตัวเดียวกับ digest)
  OLLAMA_HOST (default http://localhost:11434) · OLLAMA_MODEL (default qwen2.5:7b)

รัน:
  python deploy/agents/weekly_marketing_brief.py
  python deploy/agents/weekly_marketing_brief.py --dry-run          # ไม่ส่ง · print
  python deploy/agents/weekly_marketing_brief.py --model qwen2.5:14b
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
from datetime import datetime, timedelta, timezone

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKU_DIR = PROJECT_ROOT / "wiki" / "skus"

# โหลด deploy/.env.local ถ้ามี (รันในเครื่อง) — ให้เพิ่ม TELEGRAM_MKT_* + SUPABASE_* ได้ที่นั่น
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / "deploy" / ".env.local")
except ImportError:
    pass

SB_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
TG_TOKEN = os.environ.get("TELEGRAM_MKT_BOT_TOKEN")
TG_CHAT = os.environ.get("TELEGRAM_MKT_CHAT_ID")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")

LOW_MARGIN_THRESHOLD = 20.0   # net_margin_pct ต่ำกว่านี้ = margin ต่ำ (ตรงกับ /api/wiki-insights)


# ── อ่าน frontmatter จาก wiki/skus/*.md (mirror logic /api/wiki-insights) ──
def parse_frontmatter(text):
    text = text.replace("\r\n", "\n")
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    meta = {}
    for line in text[4:end].strip().split("\n"):
        m = re.match(r"^([a-z_][a-z0-9_]*)\s*:\s*(.*)$", line, re.I)
        if not m:
            continue
        key, val = m.group(1).strip(), m.group(2).strip()
        if val in ("", "null"):
            val = None
        elif val == "true":
            val = True
        elif val == "false":
            val = False
        elif re.match(r"^-?\d+(\.\d+)?$", val):
            val = float(val) if "." in val else int(val)
        meta[key] = val
    return meta


def load_insights(limit):
    skus = []
    for f in SKU_DIR.glob("*.md"):
        if f.name.startswith("_"):
            continue
        meta = parse_frontmatter(f.read_text(encoding="utf-8"))
        if meta.get("sku_id") and (meta.get("sales_qty_30d") or 0) > 0:
            skus.append(meta)

    def num(x, k):
        v = x.get(k)
        return v if isinstance(v, (int, float)) else None

    with_trend = [s for s in skus if num(s, "trend_pct") is not None]
    winners = sorted([s for s in with_trend if s["trend_pct"] > 0],
                     key=lambda s: -s["trend_pct"])[:limit]
    losers = sorted(with_trend, key=lambda s: s["trend_pct"])[:limit]
    low_margin = sorted([s for s in skus if num(s, "net_margin_pct") is not None
                         and s["net_margin_pct"] < LOW_MARGIN_THRESHOLD],
                        key=lambda s: s["net_margin_pct"])[:limit]

    def pick(s):
        return {"sku_id": s.get("sku_id"), "trend_pct": s.get("trend_pct"),
                "net_margin_pct": s.get("net_margin_pct"),
                "sales_qty_30d": s.get("sales_qty_30d"),
                "net_revenue_30d": s.get("net_revenue_30d")}

    summary = {
        "total_skus": len(skus),
        "total_net_revenue_30d": round(sum((s.get("net_revenue_30d") or 0) for s in skus)),
        "last_updated": max((s.get("last_updated") for s in skus if s.get("last_updated")), default=None),
    }
    return {
        "summary": summary,
        "winners": [pick(s) for s in winners],
        "losers": [pick(s) for s in losers],
        "low_margin": [pick(s) for s in low_margin],
    }


# ── ยอดต่อตู้ WoW (เสริม · ถ้ามี DB) ──
def sb_get(path):
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{path}",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                     "Range": f"{offset}-{offset + page - 1}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.loads(r.read().decode("utf-8"))
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def machine_wow():
    if not SB_URL or not SB_KEY:
        return []
    try:
        now = datetime.now(timezone.utc)
        d14 = (now - timedelta(days=14)).strftime("%Y-%m-%d")
        cut = now - timedelta(days=7)
        sales = sb_get(f"sales?select=machine_id,grand_total,sold_at&sold_at=gte.{d14}")
        machines = sb_get("machines?select=machine_id,name,location")
        mname = {m["machine_id"]: (m.get("name") or m.get("location") or m["machine_id"]) for m in machines}
        this_w, last_w = {}, {}
        for s in sales:
            dt = datetime.fromisoformat(s["sold_at"][:19])
            bucket = this_w if dt >= cut.replace(tzinfo=None) else last_w
            bucket[s["machine_id"]] = bucket.get(s["machine_id"], 0) + float(s.get("grand_total") or 0)
        out = []
        for mid, v in sorted(this_w.items(), key=lambda x: -x[1]):
            prev = last_w.get(mid, 0)
            wow = round((v - prev) / prev * 100) if prev > 0 else None
            out.append({"machine": mname.get(mid, mid), "this_week": round(v), "wow_pct": wow})
        return out
    except Exception as e:
        print(f"[brief] machine_wow ข้าม: {e}")
        return []


# ── Ollama สังเคราะห์ brief ──
SYSTEM_PROMPT = """คุณเป็นหัวหน้าฝ่ายการตลาดของ DivisionX Card (ตู้กดการ์ดสะสม One Piece/Pokemon/Yu-Gi-Oh ในห้าง)

หน้าที่: อ่านสรุป insight ยอดขาย 30 วัน แล้วเขียน "บรีฟการตลาดประจำสัปดาห์" ที่ทีมเอาไปลงมือได้ทันที

บริบทสำคัญ:
- One Piece (OP) คือเครื่องยนต์ยอดขายหลัก · ปัญหาคือจำนวนบิล ไม่ใช่ราคาต่อบิล
- เติมของได้เฉพาะตอนห้างปิด (วันละรอบ) → ของฮิตหมดกลางวัน = เสียยอด
- "กำไร" ให้ใช้ net margin (หลังหักค่าธรรมเนียม Ksher) เสมอ
- แบรนด์เสียง: สนุก ลุ้น "เปิดซอง เปิดดวง"

กฎ:
1. ภาษาไทยทั้งหมด รวม heading · ห้าม heading อังกฤษ
2. actionable — บอกว่าทำอะไร ไม่ใช่ท่องตัวเลขซ้ำ
3. กระชับ ไม่เกิน ~15 บรรทัด

โครงสร้าง (ใช้ bullet):
📣 ดันอะไรสัปดาห์นี้ — SKU มาแรง (winner) → คอนเทนต์/โปรที่ควรทำ
🔧 แก้อะไร — SKU ตก (loser) → เดาสาเหตุ + วิธีกระตุ้น
💸 งบโฆษณา — SKU margin ต่ำ อย่าทุ่มงบ · โฟกัส margin ดี
📦 เติมด่วน — ถ้ามีตู้ยอดตกหนัก ให้เตือน"""


def call_ollama(payload, model):
    try:
        from ollama import Client
    except ImportError:
        sys.exit("❌ ติดตั้ง ollama ก่อน: pip install ollama")
    client = Client(host=OLLAMA_HOST)
    user = (
        "สรุป insight (JSON):\n```json\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + "\n```\n\nเขียนบรีฟการตลาดตามโครงสร้าง ภาษาไทย actionable ตอบเฉพาะเนื้อหา"
    )
    resp = client.chat(model=model, messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ], options={"temperature": 0.4})
    return resp["message"]["content"].strip()


def md_to_tg_html(raw):
    """escape HTML แล้วแปลง markdown เบาๆ → Telegram HTML (Ollama มักตอบ **bold**)"""
    t = html.escape(raw)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)   # **x** → <b>x</b>
    t = re.sub(r"(?m)^\s*[-*]\s+", "• ", t)          # bullet markdown → •
    return t


def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        print("[brief] TELEGRAM_MKT_* ยังไม่ตั้ง — skip send")
        print(text)
        return
    body = json.dumps({"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                                 data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        print("[brief] ส่ง Telegram สำเร็จ")
    except urllib.error.HTTPError as e:
        print(f"[brief] Telegram HTTPError {e.code}: {e.read().decode('utf-8','ignore')}")


def main():
    ap = argparse.ArgumentParser(description="Weekly Marketing Brief (Loop 1)")
    ap.add_argument("--limit", type=int, default=5, help="จำนวน SKU ต่อหมวด")
    ap.add_argument("--model", type=str, default=OLLAMA_MODEL)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SKU_DIR.exists():
        sys.exit(f"❌ ไม่พบ {SKU_DIR} — รัน sku_profile_agent.py ก่อน")

    insights = load_insights(args.limit)
    if insights["summary"]["total_skus"] == 0:
        sys.exit("❌ ไม่มี SKU ที่มียอดขายใน wiki/skus — รัน sku_profile_agent.py ก่อน")
    insights["machine_wow"] = machine_wow()

    print(f"[brief] insight: {insights['summary']['total_skus']} SKU · "
          f"winners {len(insights['winners'])} · losers {len(insights['losers'])} · "
          f"low-margin {len(insights['low_margin'])} · updated {insights['summary']['last_updated']}")
    print(f"[brief] 🧠 เรียก Ollama ({args.model})...")
    brief = call_ollama(insights, args.model)

    period = datetime.now().strftime("%d/%m/%Y")
    header = [
        "🎯 <b>บรีฟการตลาดประจำสัปดาห์ · DivisionX Card</b>",
        f"<i>{period} · จาก AI Insights {insights['summary']['total_skus']} SKU "
        f"· Net ฿{insights['summary']['total_net_revenue_30d']:,}/30วัน</i>",
        "━━━━━━━━━━━━━",
        md_to_tg_html(brief),
        "━━━━━━━━━━━━━",
        "<i>🤖 สังเคราะห์โดย Ollama · ข้อมูลจาก AI Insights (รีเฟรชล่าสุด "
        f"{(insights['summary']['last_updated'] or '')[:10]})</i>",
    ]
    text = "\n".join(header)
    if len(text) > 4000:
        text = text[:3950] + "\n…(ตัด)"

    if args.dry_run:
        print("── DRY RUN — ไม่ส่ง ──\n" + text)
    else:
        tg_send(text)


if __name__ == "__main__":
    main()
