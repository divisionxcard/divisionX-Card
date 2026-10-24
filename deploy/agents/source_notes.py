"""อ่านต้นฉบับของไอเดียก่อนคิดมุม/เขียนโพสต์ — ถอดคำบรรยายคลิป YouTube แล้วสรุปเป็นข้อเท็จจริงพร้อมเวลา (23 ต.ค. 2026)

ทำไมต้องมี (เจ้าของ 23 ต.ค.): คอนเทนต์ #69 มาจากคลิป "Scammer ในโลกโปเกมอน ภาค 1" แต่ AI เขียนเรื่องกติกาสลับเบนช์
    "เมื่อเอไอของเราเขียนคอนเทนต์ออกมาไม่ได้อ้างอิงจากข้อมูลแหล่งต้นฉบับ … ระบบรวบรวมข้อมูลจากโซเชียลไม่มีประโยชน์"
ไล่แล้วเจอ 3 ชั้น:
    1. ไอเดียจาก YouTube มีแค่ชื่อคลิป + คำอธิบายใต้คลิป (ลิงก์สมัครสมาชิก/อีเมล/เพจ) — ไม่มีเนื้อหาคลิปเลย
    2. ตัวคิดมุมเดาจากชื่อคลิป → "3 จุดเช็กการ์ดแท้-ปลอม" · ถอดคำบรรยายจริงแล้ว คลิปเป็นมุกล้อโฆษณาขายของหลอก
       ในเกมภาค 5 (เชือกหลบหนี/โพชั่น/สเปรย์ ราคา 3 ล้านโปเกดอลลาร์) — ไม่เกี่ยวกับการ์ดแท้/ปลอมเลย
    3. ตัวเขียนไม่ได้รับมุมที่เลือก + ได้ความรู้กติกาแนบไป เลยเขียนเรื่องกติกา (แก้ฝั่ง generate route)

ทำอะไร:
    yt-dlp โหลดคำบรรยาย (ไทยอัตโนมัติ → อังกฤษ) → Gemini สรุป "คลิปนี้พูดเรื่องอะไรจริง ๆ" + ประเด็นพร้อมเวลา
    + มุมเขียน 3 มุมที่อิงประเด็นจริง → เขียนลง marketing_ideas.summary (ขึ้นต้น 📌) + angles
    ดึงคำบรรยายไม่ได้ → summary ขึ้นต้น ⚠️ บอกตัวเขียนว่า "ยังไม่รู้เนื้อหาจริง ห้ามเดาจากชื่อ"
    ไม่แตะ chosen_angle (คนเลือก) — generate route ใช้มุมที่เลือกเฉพาะเมื่อยังอยู่ในรายการมุมที่อิงต้นฉบับ

รัน (จาก repo · ต้องมี yt-dlp: ~/.agent-reach-venv หรือใน PATH):
    python deploy/agents/source_notes.py --id 871            ทำชิ้นเดียว
    python deploy/agents/source_notes.py --pending --limit 15 ไอเดีย YouTube ที่ยังไม่ได้อ่าน (บอทเรียกก่อนคิดมุม)
    python deploy/agents/source_notes.py --id 871 --dry      ดูผล ไม่เขียน DB
"""
import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

for _s in (sys.stdout, sys.stderr):                 # ACP เครื่องนี้ cp1252 — พิมพ์ไทยต้องตั้งเอง (CLAUDE.md)
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import idea_angles as IA                            # noqa: E402 — ใช้ตัวอ่านคีย์ · sb · Gemini (รอ/สลับรุ่นในตัว)

MARK_OK = "📌 จากต้นฉบับ"
MARK_NONE = "⚠️ ยังไม่รู้เนื้อหาจริงของต้นฉบับ"
MAX_CHARS = 14000                                    # คำบรรยายยาวกว่านี้ตัด (คลิปยาว ~30 นาที) — ประเด็นหลักมักอยู่ต้น/กลาง


def _ytdlp():
    for c in (pathlib.Path.home() / ".agent-reach-venv" / "Scripts" / "yt-dlp.exe",
              pathlib.Path.home() / ".agent-reach-venv" / "bin" / "yt-dlp"):
        if c.exists():
            return str(c)
    return shutil.which("yt-dlp")


def _vtt_to_lines(text):
    """VTT อัตโนมัติของ YouTube ซ้ำบรรทัดแบบเลื่อน — เก็บ (เวลาเริ่ม, ข้อความ) ไม่ซ้ำ"""
    out, seen, t = [], set(), "00:00"
    for raw in text.splitlines():
        m = re.match(r"(\d{2}):(\d{2}):(\d{2})\.\d{3}\s+-->", raw)
        if m:
            h, mi, s = map(int, m.groups())
            t = f"{h * 60 + mi:02d}:{s:02d}"
            continue
        line = re.sub(r"<[^>]+>", "", raw).replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&").strip()
        if not line or line.startswith(("WEBVTT", "Kind:", "Language:")) or "align:" in line:
            continue
        if line in seen:
            continue
        seen.add(line)
        out.append((t, line))
    return out


def transcript(url):
    """คืน (ภาษา, [(mm:ss, ข้อความ)]) หรือ (None, []) ถ้าไม่มีคำบรรยาย"""
    exe = _ytdlp()
    if not exe:
        raise RuntimeError("ไม่พบ yt-dlp (ติดตั้งใน ~/.agent-reach-venv หรือ PATH)")
    with tempfile.TemporaryDirectory() as td:
        for langs in ("th.*,th", "en.*,en"):
            subprocess.run([exe, "--js-runtimes", "node", "--skip-download", "--write-auto-subs", "--write-subs",
                            "--sub-langs", langs, "--sub-format", "vtt", "-o", f"{td}/%(id)s.%(ext)s", url],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
            files = sorted(pathlib.Path(td).glob("*.vtt"))
            if files:
                return langs.split(".")[0], _vtt_to_lines(files[0].read_text(encoding="utf-8", errors="replace"))
    return None, []


def _ask(prompt):
    for model in IA.MODEL_CHAIN[::-1]:              # lite ก่อน (โควตาฟรีเยอะกว่า) · ตกไป flash
        try:
            return IA.ask_gemini(prompt, model, temperature=0.4, max_tokens=4096)
        except (IA.SwitchModel, IA.QuotaOut) as e:
            print(f"   ({model} ใช้ไม่ได้: {e}) — ลองตัวถัดไป")
    return None


def summarize(idea, lang, lines):
    body = "\n".join(f"[{t}] {s}" for t, s in lines)[:MAX_CHARS]
    prompt = f"""คุณเป็นบรรณาธิการคอนเทนต์ของร้านตู้กดการ์ดสะสมในห้าง (One Piece / Pokémon / Dragon Ball ฯลฯ)
อ่านคำบรรยายอัตโนมัติของคลิปด้านล่าง (ถอดเสียงด้วยเครื่อง สะกดผิดได้ — ตีความตามบริบท) แล้วตอบเป็น JSON ล้วน:

{{"about": "1-2 ประโยค: คลิปนี้พูดเรื่องอะไรจริง ๆ (อย่าเดาจากชื่อคลิป)",
  "kind": "ประเภท เช่น ตลก/ล้อเลียน · สอน · ข่าว · รีวิว · เปิดซอง · เล่าเรื่อง",
  "about_cards": true/false (เนื้อหาเกี่ยวกับการ์ดเกม TCG ไหม หรือเป็นเรื่องเกม/อนิเมะ),
  "points": [{{"t": "mm:ss", "text": "ประเด็น/ข้อเท็จจริงในคลิป 1 ข้อ"}}  … 4-7 ข้อ เรียงตามเวลา],
  "angles": [{{"label": "ชื่อมุมสั้น ≤ 22 ตัวอักษร", "brief": "มุมโพสต์ของร้านเรา 1-2 ประโยค ที่อิงประเด็นข้างบน (บอกว่าใช้ข้อไหน)"}} × 3]}}

กติกา: ห้ามใส่ข้อเท็จจริงที่ไม่มีในคำบรรยาย · มุมโพสต์ต้องเล่าใหม่ด้วยภาษาเรา ไม่ลอกประโยคเขา
· มุมโพสต์ = คอนเทนต์ของร้านเราเอง (โพสต์เป็นรูป คนอ่านไม่ได้ดูคลิป) — ห้ามพูดถึงคลิป ช่อง ผู้สร้าง หรือที่มา
  เล่าเรื่องตรง ๆ เช่น "ในเกมโปเกมอนยุค Gen 5 มี…" ไม่ใช่ "ดูคลิปของช่อง X แล้ว…" (เจ้าของสั่ง 24 ต.ค. 2026)
· "about" เขียนว่าเรื่องนี้เกี่ยวกับอะไร ไม่ต้องขึ้นต้นด้วยชื่อช่อง
· ถ้าคลิปไม่เกี่ยวกับการ์ด ให้มุมโยงแบบตรงไปตรงมา (เช่น ชวนคุยเรื่องเดียวกัน) ห้ามบิดให้กลายเป็นเรื่องการ์ด
  ไม่ต้องโยงเข้าซอง และห้ามเปรียบว่าซอง/การ์ดเหมือนเรื่องในคลิป (เจ้าของเลือก "ไม่ต้องฝืนโยง" 24 ต.ค. 2026)
· ตัวเลข ราคา สรรพคุณ: คงคำขยายตามคำบรรยาย (แค่ · เพียง · ถึง · เท่าเดิม · กว่า) ห้ามเปลี่ยน "แค่" เป็น "ได้"
  ประโยคที่อ่านได้สองแบบ ให้เขียนขยายให้ชัด เช่น "ฮีลแค่ 20 หน่วย เท่าโพชั่นธรรมดา" ไม่ใช่ "ฮีลได้ 20 เท่าเดิม"
  (#69: คลิปพูด "ฮีลแค่ 20 เท่าเดิม" สรุปออกมา "ฮีลได้ 20 เท่าเดิม" → โพสต์ถูกอ่านเป็นแรงขึ้น 20 เท่า มุกกลับด้าน)

ชื่อคลิป: {idea.get('title')}
ช่อง: {idea.get('source_label')}
ภาษาคำบรรยาย: {lang}

คำบรรยาย:
{body}"""
    raw = _ask(prompt)
    if not raw:
        return None
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        return json.loads(m.group(0)) if m else None
    except Exception:
        return None


def notes_text(info, idea, lang):
    pts = "\n".join(f"• [{p.get('t', '')}] {p.get('text', '').strip()}" for p in info.get("points") or [] if p.get("text"))
    kind = info.get("kind") or "-"
    cards = "เกี่ยวกับการ์ด" if info.get("about_cards") else "ไม่ได้พูดเรื่องการ์ดโดยตรง"
    return (f"{MARK_OK} (ถอดคำบรรยายคลิป {lang} · {kind} · {cards})\n"
            f"เรื่องจริงของคลิป: {info.get('about', '').strip()}\n{pts}\n"
            f"เครดิต: {idea.get('source_label') or 'ต้นฉบับ'}")[:3500]


def process(idea, dry=False):
    url = idea.get("url") or ""
    print(f"#{idea['id']} {idea.get('title', '')[:60]}")
    try:
        lang, lines = transcript(url)
    except Exception as e:
        print(f"   ⚠️ {e}")
        return False
    if not lines:
        summary = f"{MARK_NONE} — ดึงคำบรรยายคลิปไม่ได้ ห้ามเดาเนื้อหาจากชื่อคลิป"
        print("   ไม่มีคำบรรยาย")
        patch = {"summary": summary}
    else:
        info = summarize(idea, lang, lines)
        if not info or not info.get("about"):
            print("   ⚠️ สรุปไม่สำเร็จ — ข้าม (รอบหน้าลองใหม่)")
            return False
        patch = {"summary": notes_text(info, idea, lang)}
        angles = [{"label": a["label"][:40], "brief": a["brief"]} for a in info.get("angles") or []
                  if a.get("label") and a.get("brief")]
        if angles:
            patch["angles"] = angles
        print("   " + patch["summary"].replace("\n", "\n   "))
        for a in angles:
            print(f"   ➜ มุม: {a['label']} — {a['brief']}")
    if not dry:
        IA.sb("PATCH", f"marketing_ideas?id=eq.{idea['id']}", patch)
    return True


def main():
    ap = argparse.ArgumentParser(description="อ่านต้นฉบับ (คำบรรยาย YouTube) ก่อนคิดมุม/เขียนโพสต์")
    ap.add_argument("--id", type=int)
    ap.add_argument("--pending", action="store_true", help="ไอเดีย YouTube สถานะ new/picked ที่ยังไม่ได้อ่าน")
    ap.add_argument("--limit", type=int, default=15)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    IA.load_env_file()
    if not (IA.SB_URL and IA.SB_KEY and IA.GEMINI_KEY):
        print("ไม่มีคีย์ Supabase/Gemini ใน deploy/.env.local")
        sys.exit(1)
    sel = "id,title,url,source,source_label,summary,status"
    if a.id:
        rows = IA.sb("GET", f"marketing_ideas?id=eq.{a.id}&select={sel}")
    elif a.pending:
        rows = IA.sb("GET", f"marketing_ideas?source=eq.youtube&status=in.(new,picked)&select={sel}"
                            f"&order=score.desc&limit={a.limit * 3}")
        rows = [r for r in rows if not str(r.get("summary") or "").startswith((MARK_OK, MARK_NONE))][:a.limit]
    else:
        ap.error("ต้องระบุ --id หรือ --pending")
    done = sum(1 for r in rows if r.get("url") and process(r, a.dry))
    print(f"อ่านต้นฉบับแล้ว {done}/{len(rows)} ชิ้น")


if __name__ == "__main__":
    main()
