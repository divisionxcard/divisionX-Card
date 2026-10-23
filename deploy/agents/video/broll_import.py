"""นำคลิปจาก Google Flow เข้าคลังพื้นหลังวิดีโอ (tasks/video_broll.json) — 23 ต.ค. 2026

เจ้าของอยากลองใช้ Flow ก่อน (ไม่มี API · ทำด้วยมือในเว็บ) → ดาวน์โหลดคลิปมาวางที่ research/flow-clips/
ตั้งชื่อไฟล์ขึ้นต้นด้วยรหัสค่าย แล้วตามด้วยคำบรรยายอะไรก็ได้:

    OP-ทะเลพายุ-01.mp4        → ใช้กับคลิปที่ One Piece เป็นพระเอก
    PKM-ทุ่งหญ้าฟ้าผ่า.mp4     → Pokémon
    ALL-เวทีแสงฟ้า.mp4         → ใช้ได้ทุกค่าย
    (ค่าย: OP PKM DB YGH NRT SL MLBB TF MLP ALL)

ถ้ามีไฟล์ .txt ชื่อเดียวกัน (คำสั่งที่ใช้ใน Flow) จะเก็บไว้ในคลังด้วย ไว้ทำซ้ำ/แก้ทีหลัง

รัน:  python -m agents.video.broll_import            (จาก deploy/)
      python -m agents.video.broll_import --dry      ดูว่าจะนำเข้าอะไร ไม่อัปจริง

ทำอะไร: ตัดเสียงทิ้ง (เสียงพากย์ไทยคือเสียงหลัก) · ย่อเป็น H.264 แนวตั้ง 1080×1920 · อัปขึ้น marketing/video-broll/
· เพิ่มรายการในคลัง · ไฟล์ที่นำเข้าแล้ว (เทียบ hash) ข้าม
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import urllib.parse

from . import config

SRC = config.REPO / "research" / "flow-clips"
LIB = config.TASKS / "video_broll.json"
CODES = {"OP", "PKM", "DB", "YGH", "NRT", "SL", "MLBB", "TF", "MLP"}
STORAGE_DIR = "video-broll"


def _transcode(src, dst):
    """แนวตั้ง 1080×1920 · ไม่มีเสียง · H.264 yuv420p (Chrome/HyperFrames อ่านได้แน่นอน)"""
    subprocess.run([config.ffmpeg_bin(), "-v", "error", "-y", "-i", str(src), "-an",
                    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", str(dst)], check=True)


def _seconds(path):
    out = subprocess.run([config.ffmpeg_bin("ffprobe"), "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout.strip()
    return round(float(out or 0), 2)


def main(argv=None):
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="นำคลิป Google Flow เข้าคลังพื้นหลังวิดีโอ")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    lib = json.loads(LIB.read_text(encoding="utf-8"))
    have = {c.get("sha1") for c in lib.get("clips", [])}
    files = sorted(p for p in SRC.glob("*") if p.suffix.lower() in (".mp4", ".mov", ".webm", ".m4v"))
    if not files:
        print(f"ไม่มีคลิปใน {SRC}")
        return
    added = 0
    for f in files:
        sha = hashlib.sha1(f.read_bytes()).hexdigest()
        if sha in have:
            continue
        code = re.split(r"[-_ ]", f.stem, 1)[0].upper()
        franchise = [] if code == "ALL" else ([code] if code in CODES else [])
        note = f.with_suffix(".txt")
        prompt = note.read_text(encoding="utf-8").strip() if note.exists() else ""
        cid = re.sub(r"[^a-z0-9]+", "-", f"{code}-{sha[:8]}".lower())
        print(f"+ {f.name} → {cid} · ค่าย {franchise or 'ทุกค่าย'}")
        if a.dry:
            continue
        from .publish import BUCKET, _creds, sb
        with tempfile.TemporaryDirectory() as td:
            out = pathlib.Path(td) / f"{cid}.mp4"
            _transcode(f, out)
            key = f"{STORAGE_DIR}/{cid}.mp4"
            sb("POST", f"{BUCKET}/{urllib.parse.quote(key)}", raw=out.read_bytes(), ctype="video/mp4",
               base="storage/v1/object", timeout=600)
            secs = _seconds(out)
        url, _ = _creds()
        lib.setdefault("clips", []).append({
            "id": cid, "url": f"{url}/storage/v1/object/public/{BUCKET}/{key}", "franchise": franchise,
            "formats": [], "seconds": secs, "file": f.name, "prompt": prompt, "sha1": sha,
            "added": dt.date.today().isoformat()})
        added += 1
    if added:
        LIB.write_text(json.dumps(lib, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"นำเข้า {added} คลิป · คลังมีทั้งหมด {len(lib.get('clips', []))} คลิป"
          + (" — อย่าลืม commit tasks/video_broll.json (Actions อ่านจาก repo)" if added else ""))


if __name__ == "__main__":
    main()
