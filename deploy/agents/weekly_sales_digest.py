"""
สรุปยอดขายรายสัปดาห์ + คำแนะนำ → ส่งเข้า Telegram (งานการตลาด)

ออกแบบให้รันบน GitHub Actions cron ได้จริง:
- Core = คำนวณจาก DB ตรงๆ (ไม่ต้องพึ่ง LLM · ฟรี · เสถียร)
- ชั้น AI (Claude) = optional — เปิดเมื่อมี ANTHROPIC_API_KEY เท่านั้น
  (reconcile_agent เดิมใช้ Ollama local ซึ่งรันบน cloud cron ไม่ได้ → ใช้ Claude แทนสำหรับงาน cron)

Env:
  SUPABASE_URL + SUPABASE_SERVICE_KEY (หรือ NEXT_PUBLIC_* / SERVICE_ROLE)
  TELEGRAM_MKT_BOT_TOKEN + TELEGRAM_MKT_CHAT_ID   (bot การตลาด · แยกจาก scraper)
  ANTHROPIC_API_KEY (optional) → เพิ่มส่วน AI วิเคราะห์+คำแนะนำ

รัน:  python deploy/agents/weekly_sales_digest.py
"""
import os
import json
import html
import urllib.request
import urllib.error
from datetime import datetime, timedelta

SB_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
TG_TOKEN = os.environ.get("TELEGRAM_MKT_BOT_TOKEN")
TG_CHAT = os.environ.get("TELEGRAM_MKT_CHAT_ID")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


def thai_date(dt):
    t = dt + timedelta(hours=7)
    return f"{t.day} {MONTH_TH[t.month]}"


def sb_get(path):
    """ดึงทุกหน้าจาก PostgREST"""
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/{path}",
            headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                     "Range": f"{offset}-{offset + page - 1}"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.loads(r.read().decode("utf-8"))
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        print("[digest] TELEGRAM_MKT_* ยังไม่ตั้ง — skip send")
        print(text)
        return
    body = json.dumps({"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode("utf-8")
    req = urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                                 data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        print("[digest] ส่ง Telegram สำเร็จ")
    except urllib.error.HTTPError as e:
        print(f"[digest] Telegram HTTPError {e.code}: {e.read().decode('utf-8','ignore')}")


def pct(cur, prev):
    if prev <= 0:
        return None
    return (cur - prev) / prev * 100


def arrow(p):
    if p is None:
        return "🆕"
    if p >= 5:
        return f"▲{p:.0f}%"
    if p <= -5:
        return f"▼{abs(p):.0f}%"
    return "≈"


def ai_insight(stats):
    """ชั้น optional: ให้ Claude เขียน insight + คำแนะนำสั้นๆ (ถ้ามี key)"""
    if not ANTHROPIC_KEY:
        return None
    try:
        from anthropic import Anthropic
    except ImportError:
        print("[digest] ไม่มี anthropic package — ข้ามชั้น AI")
        return None
    client = Anthropic()
    system = (
        "คุณเป็นนักวิเคราะห์การตลาดของ DivisionX Card (ตู้กดการ์ดสะสม One Piece/Pokemon ในห้าง). "
        "อ่านสรุปยอดขายรายสัปดาห์แล้วเขียน insight สั้นๆ + คำแนะนำที่ลงมือได้ทันที. "
        "เน้น actionable ไม่ใช่ท่องตัวเลขซ้ำ. ตอบเฉพาะข้อความสั้น ภาษาไทย ไม่ต้องมี markdown heading."
    )
    prompt = (
        "สรุปยอดขายรายสัปดาห์ (JSON):\n"
        f"```json\n{json.dumps(stats, ensure_ascii=False)}\n```\n\n"
        "เขียน:\n1) ข้อสังเกตเด่น 2-3 บรรทัด\n2) คำแนะนำ 3 ข้อ (ลงมือได้)\n"
        "กระชับ รวมไม่เกิน ~12 บรรทัด ตอบเฉพาะเนื้อหา"
    )
    try:
        resp = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=1200,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return next((b.text for b in resp.content if b.type == "text"), None)
    except Exception as e:
        print(f"[digest] Claude error: {e}")
        return None


def main():
    if not SB_URL or not SB_KEY:
        print("[digest] ไม่มี SUPABASE_URL/KEY — หยุด")
        return

    now = datetime.utcnow()
    d14 = (now - timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    cut = now - timedelta(days=7)

    sales = sb_get(f"sales?select=machine_id,sku_id,quantity_sold,grand_total,sold_at&sold_at=gte.{d14}")
    machines = sb_get("machines?select=machine_id,location,name")
    mname = {m["machine_id"]: (m.get("location") or m.get("name") or m["machine_id"]) for m in machines}

    # แยกสัปดาห์นี้ / สัปดาห์ก่อน
    m_this, m_last = {}, {}
    sku_this = {}
    rev_this = rev_last = 0.0
    for s in sales:
        rev = float(s.get("grand_total") or 0)
        dt = datetime.fromisoformat(s["sold_at"].replace("+00:00", "")) if "+00:00" in s["sold_at"] else datetime.fromisoformat(s["sold_at"][:19])
        this_week = dt >= cut
        mid = s["machine_id"]
        if this_week:
            m_this[mid] = m_this.get(mid, 0) + rev
            rev_this += rev
            sku_this[s.get("sku_id") or "?"] = sku_this.get(s.get("sku_id") or "?", 0) + rev
        else:
            m_last[mid] = m_last.get(mid, 0) + rev
            rev_last += rev

    # เรียงตู้ตามยอดสัปดาห์นี้
    machines_sorted = sorted(m_this.items(), key=lambda x: x[1], reverse=True)
    top_sku = sorted(sku_this.items(), key=lambda x: x[1], reverse=True)[:5]
    drops = [(mid, pct(v, m_last.get(mid, 0))) for mid, v in machines_sorted]
    drops = [(mid, p) for mid, p in drops if p is not None and p <= -25]

    # ── สร้างข้อความ Telegram ──
    period = f"{thai_date(cut)}–{thai_date(now)}"
    lines = [
        f"📊 <b>สรุปยอดขายรายสัปดาห์ · DivisionX Card</b>",
        f"<i>{period}</i>",
        "━━━━━━━━━━━━━",
        f"💰 รวม: <b>{rev_this:,.0f}</b> บาท ({arrow(pct(rev_this, rev_last))} จากสัปดาห์ก่อน {rev_last:,.0f})",
        f"📅 เฉลี่ย/วัน: <b>{rev_this/7:,.0f}</b> บาท",
        "",
        "📈 <b>ยอดต่อตู้</b>",
    ]
    for mid, v in machines_sorted:
        lines.append(f"• {html.escape(mname.get(mid, mid))}: {v:,.0f} ({arrow(pct(v, m_last.get(mid, 0)))})")
    lines.append("")
    lines.append("🔥 <b>Top SKU</b>: " + " · ".join(f"{html.escape(k)} ({v:,.0f})" for k, v in top_sku))
    if drops:
        lines.append("")
        lines.append("⚠️ <b>ตู้ที่ยอดตก ≥25%</b>: " + " · ".join(f"{html.escape(mname.get(m, m))} {arrow(p)}" for m, p in drops))

    # ── ชั้น AI (optional) ──
    stats = {
        "period": period,
        "revenue_this_week": round(rev_this), "revenue_last_week": round(rev_last),
        "per_machine": [{"machine": mname.get(m, m), "this": round(v), "last": round(m_last.get(m, 0))} for m, v in machines_sorted],
        "top_sku": [{"sku": k, "revenue": round(v)} for k, v in top_sku],
    }
    insight = ai_insight(stats)
    if insight:
        lines.append("━━━━━━━━━━━━━")
        lines.append("🤖 <b>AI วิเคราะห์ + คำแนะนำ</b>")
        lines.append(html.escape(insight.strip()))

    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3950] + "\n…(ตัดเพราะยาวเกิน)"
    tg_send(text)


if __name__ == "__main__":
    main()
