"""ผู้กำกับอัตโนมัติ — เลือกรูปแบบคลิป · สาขา/ชุดการ์ด · ชุดหน้าตา · เสียงพากย์ · สำนวน แบบไม่ซ้ำคลิปล่าสุด

ทำไมมีไฟล์นี้ (16 ต.ค. 2026):
    เจ้าของดูคลิปรูปแบบใหม่ 4 แบบแล้วบอกว่า "ชอบหลายรูปแบบเลย อยากให้ระบบเราสามารถออกแบบได้อิสระไม่จำเจ"
    ความจำเจมาจาก 3 ชั้น — ชั้นเดียวแก้ไม่พอ:
      1) รูปแบบคลิป  ทำอันดับทุกสัปดาห์ = คนดูเดาได้ก่อนกดดู            → สลับ rank/versus/quiz/map
      2) หน้าตา      พื้นหลัง/ฉากเปลี่ยน/หัวเรื่อง/สีเน้นเหมือนเดิมทุกคลิป → ชุดหน้าตา (hf_render.LOOK_SPACE)
      3) สำนวน/เสียง  "อันดับห้า… อันดับสี่…" เสียงเดียวทุกคลิป          → คลังสำนวน (hf_formats.COPY) + สลับเสียง
    ทุกชั้นเลือกแบบ "เลี่ยงของที่คลิปล่าสุดเพิ่งใช้" จากประวัติใน video_jobs (ไม่ใช่สุ่มล้วน ที่ยังซ้ำติดกันได้)

ขอบเขตอิสระ (ตรงกับกฎของระบบภาพ — memory feedback_ai_design_freedom):
    อิสระ   = รูปแบบ ลำดับ หน้าตา จังหวะ สำนวน เสียง
    ห้ามขยับ = ข้อเท็จจริง (ชื่อชุด/อันดับ/สาขา/ชั้น มาจากฐานข้อมูลเท่านั้น) · โทนแบรนด์ · ไม่โชว์ตัวเลขยอดขาย/%
    seed เดียวกัน + ประวัติเดียวกัน = แผนเดิมทุกครั้ง (งานในคิวเรนเดอร์ซ้ำได้ผลเดิม)

ใช้ที่ไหน:
    publish.py (GitHub Actions) — งานจากหน้าเว็บที่ส่งมาแค่ {"format": "auto"|..., ...} ไม่มีสคริปต์ → ผู้กำกับเขียนแผนให้
    CLI (จาก deploy/):  ../.venv-image/Scripts/python.exe -m agents.video.hf_director --format auto --render
"""
import argparse
import datetime as dt
import json
import random
import sys

from . import hf_formats as F
from .hf_render import LOOK_SPACE

FORMATS = ("rank", "versus", "quiz", "map")
VOICES = ("Aoede", "Kore", "Puck", "Charon")         # ต้องตรงกับ voice.VOICES และ VOICES ใน app/api/video/render
AVOID_LOOK = {"bg": 2, "cut": 2, "ts": 1, "hot": 1}  # เลี่ยงค่าที่ N คลิปล่าสุดเพิ่งใช้ (ตัวเลือก 3-4 แบบ จึงเลี่ยงได้ 1-2)


def history(n=12, exclude_id=None):
    """แผนของงานล่าสุดใน video_jobs (ใหม่ → เก่า) · อ่านไม่ได้ = ประวัติว่าง (ยังเลือกได้ แค่ไม่รู้ว่าเพิ่งใช้อะไร)"""
    try:
        rows = F._rest(f"video_jobs?select=id,plan,status,created_at&order=created_at.desc&limit={int(n)}")
    except Exception as e:
        print(f"[director] อ่านประวัติไม่ได้ ({str(e)[:80]}) — เลือกโดยไม่เลี่ยงของซ้ำ", file=sys.stderr)
        return []
    return [r["plan"] for r in rows
            if isinstance(r.get("plan"), dict) and r.get("id") != exclude_id and r.get("status") != "failed"][:n]


class Director:
    def __init__(self, seed, hist):
        self.rng = random.Random(f"director:{seed}")
        self.hist = hist or []

    def choice(self, options, avoid=()):
        options = list(options)
        cand = [o for o in options if o not in set(avoid)] or options
        return self.rng.choice(cand)

    def recent(self, key, fmt=None, k=3):
        out = [p.get(key) for p in self.hist if (fmt is None or p.get("format") == fmt) and p.get(key) is not None]
        return out[:k]

    def look(self):
        recent = [p["look"] for p in self.hist if isinstance(p.get("look"), dict)]
        return {key: self.choice(opts, [lk.get(key) for lk in recent[:AVOID_LOOK[key]]])
                for key, opts in LOOK_SPACE.items()}

    def pick_fn(self, fmt):
        """ตัวเลือกสำนวนให้ hf_formats — เลี่ยงแบบที่ 2 คลิปล่าสุดของรูปแบบเดียวกันเพิ่งใช้"""
        recent_copy = [p.get("copy") or {} for p in self.hist if p.get("format") == fmt][:2]

        def pick(key, n):
            short = key.split(".", 1)[1] if "." in key else key
            avoid = {c.get(short) for c in recent_copy if isinstance(c.get(short), int)}
            cand = [i for i in range(n) if i not in avoid] or list(range(n))
            return self.rng.choice(cand)
        return pick


def _map_ready(rows):
    """สาขาที่ทำคลิปพิกัดได้สวย: มีรูปตู้จริง + มีพิกัดในกรอบแผนที่"""
    ok = []
    for r in rows:
        ll = F.MALLS.get(r["mall"])
        if ll and F._map_xy(*ll) and F.branch_photo(r["machine_id"]):
            ok.append(r["machine_id"])
    return ok


def direct(req=None, seed=None, project=None, hist=None):
    """คำขอ (อาจมีแค่ {"format": "auto"}) → แผนเต็มที่ hf_render.build_video ใช้ได้ทันที"""
    req = dict(req or {})
    seed = seed if seed is not None else dt.datetime.now().isoformat()
    hist = history() if hist is None else hist
    d = Director(seed, hist)

    fmt = req.get("format") or "auto"
    if fmt not in FORMATS:
        fmt = d.choice(FORMATS, d.recent("format", k=2))
    voice = req.get("voice") if req.get("voice") in VOICES else d.choice(VOICES, d.recent("voice", k=1))
    pick = d.pick_fn(fmt)
    days = int(req.get("days") or 7)
    machine = req.get("machine") or None
    note = {}

    if fmt == "map":
        if not machine:
            rows = F.branches()
            ok = _map_ready(rows) or [r["machine_id"] for r in rows]
            machine = d.choice(ok, d.recent("machine", fmt="map", k=6))
        plan = F.map_plan(machine=machine, voice=voice, pick=pick)
    elif fmt == "quiz":
        sku = req.get("sku")
        if not sku:
            count, skus, _ = F.sales_counts(30, None)
            cands = [s for s, _c in sorted(count.items(), key=lambda kv: (-kv[1], kv[0]))
                     if skus[s].get("image_url")][:14]
            sku = d.choice(cands, d.recent("sku", fmt="quiz", k=8)) if cands else None
        plan = F.quiz_plan(sku=sku, voice=voice, pick=pick)
    elif fmt == "versus":
        theme = req.get("theme")
        if theme not in F.VERSUS_THEMES:
            theme = d.choice(F.VERSUS_THEMES, d.recent("theme", fmt="versus", k=2))
        try:
            plan = F.versus_plan(days=days, machine=machine, voice=voice, pick=pick, theme=theme)
        except ValueError as e:                       # ค่ายไม่พอ/ชุดไม่พอสำหรับธีมนั้น → ธีมปกติ
            note["theme_fallback"] = f"{theme}: {e}"
            plan = F.versus_plan(days=days, machine=machine, voice=voice, pick=pick, theme="newest")
    else:
        # บางครั้งทำอันดับของสาขาเดียว (14 วัน — ยอดสาขาเดียวต่อสัปดาห์น้อยเกินจะครบ 5 ชุด) ให้ไม่ซ้ำทุกสัปดาห์
        if not machine and not req.get("days") and d.rng.random() < 0.3:
            rows = [r["machine_id"] for r in F.branches()]
            for m in sorted(rows, key=lambda _m: d.rng.random()):
                if m in d.recent("machine", fmt="rank", k=4):
                    continue
                top, _ = F.top_sellers(14, 5, m)
                if len(top) == 5:
                    machine, days = m, 14
                    break
        plan = F.rank_plan(days=days, machine=machine, voice=voice, pick=pick)

    plan["look"] = req["look"] if isinstance(req.get("look"), dict) else d.look()
    plan["director"] = {"seed": str(seed), "requested": req.get("format") or "auto", **note}
    if machine and not plan.get("machine"):
        plan["machine"] = machine
    if project:
        plan["project"] = project
    return plan


def main(argv=None):
    for s in (sys.stdout, sys.stderr):                 # ACP เครื่องนี้ cp1252 — พิมพ์ไทยต้องตั้งเอง
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="ผู้กำกับอัตโนมัติ — สร้างแผนคลิปแบบไม่ซ้ำคลิปล่าสุด")
    ap.add_argument("--format", default="auto", choices=("auto",) + FORMATS)
    ap.add_argument("--machine")
    ap.add_argument("--sku")
    ap.add_argument("--seed")
    ap.add_argument("--project")
    ap.add_argument("--no-history", action="store_true", help="ไม่อ่านประวัติจาก video_jobs")
    ap.add_argument("--render", action="store_true")
    a = ap.parse_args(argv)
    plan = direct({"format": a.format, "machine": a.machine, "sku": a.sku}, seed=a.seed, project=a.project,
                  hist=[] if a.no_history else None)
    print(json.dumps({k: plan[k] for k in ("project", "format", "voice", "look", "copy", "director") if k in plan},
                     ensure_ascii=False))
    print(plan["script"])
    if a.render:
        from . import hf_render
        out, dur = hf_render.build_video(plan)
        print(f"[director] เสร็จ {out} · {dur:.1f} วิ")


if __name__ == "__main__":
    main()
