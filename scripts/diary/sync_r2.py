#!/usr/bin/env python3
"""ซิงค์ไดอารี่งาน: ไฟล์ในรีโป (scripts/diary/days/*.json) ⇄ หน้าเว็บ /diary (คลัง R2 diary/days/) · 24 ต.ค. 2026

เจ้าของขอเปิดไดอารี่ได้โดยไม่ต้องผ่าน claude.ai → หน้า /diary บนเว็บเรา (app/diary · /api/diary · เฉพาะแอดมิน)
หน้า Artifact เดิมบน claude.ai ยังใช้ได้ (ArtifactData คอลเลกชัน days) — เจ้าของติ๊กได้ทั้งสองที่

กติการวมติ๊ก: "ติ๊กที่ไหนก็นับ" — ข้อค้างเป็นเสร็จ ถ้าที่ใดที่หนึ่งติ๊กไว้ (รีโป · R2 · ไฟล์ที่ export จาก ArtifactData)
ทางที่เลือก (choice ของข้อ "รอคุณเลือก" · 24 ต.ค. 2026): เอาอันที่เลือกล่าสุด (chose_at) · เปลี่ยนทาง = ล้าง acted
ท้ายสคริปต์พิมพ์ "เจ้าของเลือกแล้ว รอลงมือ" — ทำตามนั้น แล้วตั้ง acted: true + ลงตารางการตัดสินใจของวันนั้น
เนื้อหาวัน (เรื่องเล่า/งาน/การตัดสินใจ) ยึดไฟล์ในรีโปเป็นตัวจริง · ข้อค้างที่มีแค่ในเว็บ (ไม่น่ามี) เก็บไว้ไม่ทิ้ง

รัน:
  python scripts/diary/sync_r2.py                         รวมติ๊กรีโป+R2 → เขียนทั้งสองที่
  python scripts/diary/sync_r2.py --artifact-dir <dir>    รวมติ๊กจาก ArtifactData ที่ export ไว้ (<dir>/days/<date>.json) ด้วย
  python scripts/diary/sync_r2.py --dry                   ดูอย่างเดียว
ผลท้ายสคริปต์บอกว่าวันไหนมีติ๊กเพิ่ม → เอาไฟล์ในรีโปไป ArtifactData set ให้หน้า claude.ai ตรงกันด้วย
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DAYS = ROOT / "scripts" / "diary" / "days"
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
import r2  # noqa: E402

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PREFIX = "diary/days/"


def _ticks(doc):
    return {p.get("id"): p for p in (doc or {}).get("pending", []) if p.get("id")}


def merge(local, others):
    """local = เนื้อหาตัวจริง · others = สำเนาอื่น (R2 / ArtifactData) → ติ๊กรวม"""
    out = json.loads(json.dumps(local, ensure_ascii=False))
    seen = {p["id"] for p in out.get("pending", []) if p.get("id")}
    changed = []
    for o in others:
        t = _ticks(o)
        for p in out.get("pending", []):
            q = t.get(p.get("id"))
            if q and q.get("choice") and (q.get("chose_at") or "") > (p.get("chose_at") or ""):
                if q["choice"] != p.get("choice"):
                    p.pop("acted", None)
                for k in ("choice", "choice_note", "chose_at", "done", "done_at"):
                    if k in q:
                        p[k] = q[k]
                changed.append(p["id"])
                continue
            if q and q.get("done") and not p.get("done"):
                p["done"] = True
                if q.get("done_at"):
                    p["done_at"] = q["done_at"]
                changed.append(p["id"])
        for pid, q in t.items():                       # ข้อที่มีแค่อีกที่ — เก็บไว้
            if pid not in seen:
                out.setdefault("pending", []).append(q)
                seen.add(pid)
                changed.append(pid)
    return out, changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact-dir", help="โฟลเดอร์ที่ ArtifactData list/get export ไว้ (มี days/<date>.json)")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    remote = {k[len(PREFIX):-5] for k, *_ in r2.list_keys(PREFIX, 5000) if k.endswith(".json")}
    art_dir = pathlib.Path(a.artifact_dir) / "days" if a.artifact_dir else None
    more = []
    for f in sorted(DAYS.glob("*.json")):
        date = f.stem
        local = json.loads(f.read_text(encoding="utf-8"))
        others = []
        if date in remote:
            others.append(json.loads(r2.get_bytes(f"{PREFIX}{date}.json").decode("utf-8")))
        if art_dir and (art_dir / f"{date}.json").exists():
            raw = json.loads((art_dir / f"{date}.json").read_text(encoding="utf-8"))
            others.append(raw.get("data", raw) if isinstance(raw, dict) else raw)
        merged, changed = merge(local, others)
        if changed:
            more.append((date, changed))
        print(f"{date}: ข้อค้าง {len(merged.get('pending', []))} · ติ๊กแล้ว {sum(1 for p in merged.get('pending', []) if p.get('done'))}"
              + (f" · ติ๊กเพิ่มจากที่อื่น {changed}" if changed else "") + (" · ใหม่บนเว็บ" if date not in remote else ""))
        if a.dry:
            continue
        txt = json.dumps(merged, ensure_ascii=False, indent=2)
        if changed:
            f.write_text(txt, encoding="utf-8")
        r2.put_bytes(txt.encode("utf-8"), f"{PREFIX}{date}.json", "application/json")
    for date in sorted(remote - {f.stem for f in DAYS.glob("*.json")}):
        print(f"{date}: มีบนเว็บแต่ไม่มีในรีโป — ดึงลงมา")
        if not a.dry:
            (DAYS / f"{date}.json").write_bytes(r2.get_bytes(f"{PREFIX}{date}.json"))
    todo = []
    for f in sorted(DAYS.glob("*.json")):
        for p in json.loads(f.read_text(encoding="utf-8")).get("pending", []):
            if p.get("choice") and not p.get("acted"):
                opt = next((o for o in p.get("options", []) if o.get("id") == p["choice"]), None)
                todo.append(f"  {f.stem} · {p['id']}: {opt['label'] if opt else p['choice']}" + (f" — \"{p.get('choice_note')}\"" if p.get("choice_note") else ""))
    if todo:
        print("\n🟨 เจ้าของเลือกแล้ว รอ Claude ลงมือ (ทำแล้วตั้ง acted: true):", *todo, sep="\n")
    if more:
        print("\n⚠️ วันที่มีติ๊กเพิ่ม — set ไฟล์ในรีโปขึ้น ArtifactData ให้หน้า claude.ai ตรงกันด้วย:", [d for d, _ in more])
    print("(dry) ไม่ได้เขียน" if a.dry else "ซิงค์แล้ว")


if __name__ == "__main__":
    main()
