#!/usr/bin/env python3
"""ย้ายไฟล์ bucket marketing (Supabase Storage) → Cloudflare R2 dvx-media · key เดิมทุกตัว (23 ต.ค. 2026)

ทำไม: แพ็กเกจฟรีของ Supabase มี Storage 1 GB + ดาวน์โหลด 5 GB/เดือน ใช้ร่วมกับฐานข้อมูลทั้งองค์กร
      ไฟล์วิดีโอ/รูปกินเกิน → โปรเจกต์โดนจำกัด → ซิงค์ยอดขาย/สต็อกรายวันตาย (ดู wiki/worklog/2026-10-23-r2-media-storage.md)

ขั้นตอน (รันซ้ำได้ทุกขั้น):
  python scripts/r2_migrate_marketing.py --copy       คัดลอกทุกไฟล์ (ข้ามไฟล์ที่ R2 มีขนาดเท่ากันแล้ว) + ตรวจขนาด
  python scripts/r2_migrate_marketing.py --rewrite    เปลี่ยนลิงก์ใน DB (marketing_content.media_url · video_jobs.video_url/plan)
                                                      + tasks/video_broll.json จากลิงก์ Supabase → /media/ ของเว็บ
                                                      ⚠️ รันหลัง deploy เว็บที่มีหน้า /media แล้วเท่านั้น
  python scripts/r2_migrate_marketing.py --purge      ลบต้นฉบับใน Supabase (เฉพาะไฟล์ที่ R2 มีขนาดตรงกัน) — รอเจ้าของอนุมัติก่อน
  เพิ่ม --dry ดูก่อนได้ทุกขั้น
"""
import argparse
import json
import pathlib
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
import r2  # noqa: E402

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import os  # noqa: E402
SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SK = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SK, "Authorization": f"Bearer {SK}", "User-Agent": "dvx-cli/1.0"}
BUCKET = "marketing"
LEGACY = f"{SB}/storage/v1/object/public/{BUCKET}/"
SKIP = ("video-edits/", "video-probe/")          # ร่างงาน (ย้ายแยก) · ไฟล์ทดสอบ


def sb(method, path, body=None, base="storage/v1", extra=None):
    req = urllib.request.Request(f"{SB}/{base}/{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={**H, "Content-Type": "application/json", **(extra or {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def walk(prefix=""):
    out, offset = [], 0
    while True:
        rows = sb("POST", f"object/list/{BUCKET}", {"prefix": prefix, "limit": 1000, "offset": offset,
                                                    "sortBy": {"column": "name", "order": "asc"}}) or []
        for f in rows:
            path = f"{prefix}/{f['name']}" if prefix else f["name"]
            if not f.get("id"):
                out += walk(path)
            elif not path.startswith(SKIP):
                md = f.get("metadata") or {}
                out.append((path, int(md.get("size") or 0), md.get("mimetype") or "application/octet-stream"))
        if len(rows) < 1000:
            return out
        offset += 1000


def copy(dry):
    files = walk()
    total = sum(s for _, s, _ in files)
    print(f"Supabase {BUCKET}: {len(files)} ไฟล์ · {total / 1048576:.1f} MB")
    have = {k: s for k, s, _ in r2.list_keys("", 100000)}
    todo = [f for f in files if have.get(f[0]) != f[1]]
    print(f"R2 มีครบแล้ว {len(files) - len(todo)} · ต้องคัดลอก {len(todo)}")
    for i, (key, size, mime) in enumerate(todo, 1):
        print(f"  [{i}/{len(todo)}] {key} ({size / 1048576:.1f} MB · {mime})")
        if dry:
            continue
        url = LEGACY + "/".join(urllib.parse.quote(p) for p in key.split("/"))
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "dvx-cli/1.0"}), timeout=600) as r:
            body = r.read()
        r2.put_bytes(body, key, mime)
    have = {k: s for k, s, _ in r2.list_keys("", 100000)}
    bad = [k for k, s, _ in files if have.get(k) != s]
    print(f"ตรวจขนาด: ตรง {len(files) - len(bad)}/{len(files)}" + (f" · ไม่ตรง {bad[:10]}" if bad else " ✓"))
    return not bad


def _swap(v):
    return v.replace(LEGACY, r2.MEDIA_BASE) if isinstance(v, str) else v


def rewrite(dry):
    rest = lambda p, **kw: sb(kw.pop("method", "GET"), p, kw.pop("body", None), base="rest/v1",
                              extra={"Prefer": "return=minimal"} if kw.pop("write", False) else None)
    n = 0
    for table, col in (("marketing_content", "media_url"), ("video_jobs", "video_url")):
        rows = rest(f"{table}?select=id,{col}&{col}=like.{urllib.parse.quote(LEGACY)}*&limit=1000") or []
        print(f"{table}.{col}: {len(rows)} แถว")
        for row in rows:
            new = _swap(row[col])
            if not dry:
                rest(f"{table}?id=eq.{row['id']}", method="PATCH", body={col: new}, write=True)
            n += 1
    for row in rest("video_jobs?select=id,plan&limit=1000") or []:
        txt = json.dumps(row["plan"], ensure_ascii=False)
        if LEGACY in txt:
            print(f"video_jobs.plan: {row['id']}")
            if not dry:
                rest(f"video_jobs?id=eq.{row['id']}", method="PATCH", body={"plan": json.loads(txt.replace(LEGACY, r2.MEDIA_BASE))}, write=True)
            n += 1
    for f in (ROOT / "deploy" / "tasks" / "video_broll.json",):
        txt = f.read_text(encoding="utf-8")
        if LEGACY in txt:
            print(f"ไฟล์ {f.relative_to(ROOT)}: {txt.count(LEGACY)} ลิงก์")
            if not dry:
                f.write_text(txt.replace(LEGACY, r2.MEDIA_BASE), encoding="utf-8")
            n += 1
    print(f"{'(dry) ' if dry else ''}เปลี่ยนลิงก์ {n} จุด")


def purge(dry):
    files = walk()
    have = {k: s for k, s, _ in r2.list_keys("", 100000)}
    ok = [k for k, s, _ in files if have.get(k) == s]
    print(f"ลบจาก Supabase ได้ {len(ok)}/{len(files)} ไฟล์ (R2 มีขนาดตรงกัน)")
    for i in range(0, len(ok), 100):
        if not dry:
            sb("DELETE", f"object/{BUCKET}", {"prefixes": ok[i:i + 100]})
    print("(dry) ไม่ได้ลบจริง" if dry else "ลบแล้ว")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--copy", action="store_true")
    ap.add_argument("--rewrite", action="store_true")
    ap.add_argument("--purge", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if a.copy:
        copy(a.dry)
    if a.rewrite:
        rewrite(a.dry)
    if a.purge:
        purge(a.dry)
    if not (a.copy or a.rewrite or a.purge):
        print(__doc__)
