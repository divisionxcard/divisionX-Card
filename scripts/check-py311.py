"""ตรวจว่าสคริปต์ที่รันบน GitHub Actions ใช้ไวยากรณ์ที่ Python 3.11 อ่านได้

ทำไมต้องมี — เจอมาแล้วจริง (2026-08-10):
    เครื่องเจ้าของเป็น Python 3.12.9 · แต่ทุก workflow ตั้ง python-version: "3.11"
    โค้ดที่ใช้ไวยากรณ์ใหม่ของ 3.12 จึงรันบนเครื่องผ่าน แต่พังบน CI

    ตัวที่เกิดจริง: f-string ที่ใช้ quote ชนิดเดียวกันซ้อนข้างใน
        f"... {ckey or "-"} ..."      ← 3.12 ได้ (PEP 701) · 3.11 = SyntaxError
    ผลคือปุ่มสร้างโปสเตอร์ล้มเงียบ ๆ ติดกัน 4 ครั้ง ไม่มีใครรู้จนเจ้าของทักว่ากดแล้วไม่มีอะไรเกิดขึ้น

    บทเรียน: "รันบนเครื่องผ่าน" ไม่ได้แปลว่า "รันบน CI ผ่าน" ถ้าเวอร์ชันไม่ตรงกัน
    ตัวนี้ใช้ ast.parse(feature_version=(3,11)) ซึ่งตรวจได้โดยไม่ต้องลง Python 3.11 จริง

รัน:  python scripts/check-py311.py
"""
import ast
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github" / "workflows"

# โฟลเดอร์ที่มีสคริปต์ซึ่ง workflow เรียกใช้
SCAN = [ROOT / "deploy" / "agents", ROOT / "deploy" / "scraper", ROOT / "backend" / "tools"]


def ci_python_versions():
    """อ่านเวอร์ชันที่ workflow ตั้งไว้จริง — ไม่ฮาร์ดโค้ด เผื่อวันหลังมีคนอัป"""
    out = set()
    if WORKFLOWS.exists():
        for f in WORKFLOWS.glob("*.yml"):
            for m in re.finditer(r'python-version:\s*"?([\d.]+)"?', f.read_text(encoding="utf-8")):
                out.add(m.group(1))
    return sorted(out)


def main():
    versions = ci_python_versions()
    if not versions:
        print("[check] ไม่เจอ python-version ใน workflow — ข้าม")
        return 0

    lowest = min(versions, key=lambda v: tuple(int(x) for x in v.split(".")))
    major, minor = (int(x) for x in lowest.split(".")[:2])
    print(f"[check] เวอร์ชันที่ CI ใช้: {', '.join(versions)} → ตรวจกับตัวต่ำสุด {lowest}")

    files = [f for d in SCAN if d.exists() for f in sorted(d.rglob("*.py"))]
    bad = []
    for f in files:
        try:
            ast.parse(f.read_text(encoding="utf-8"), feature_version=(major, minor))
        except SyntaxError as e:
            bad.append((f, e))

    for f, e in bad:
        print(f"  ✗ {f.relative_to(ROOT)}  บรรทัด {e.lineno}: {e.msg}")

    if bad:
        print(f"\n[check] ❌ มี {len(bad)} ไฟล์ที่ Python {lowest} อ่านไม่ได้ — จะพังบน GitHub Actions")
        print("        (บนเครื่องอาจรันผ่านเพราะใช้ Python ใหม่กว่า)")
        return 1

    print(f"[check] ✅ ตรวจ {len(files)} ไฟล์ ผ่านทั้งหมด")
    return 0


if __name__ == "__main__":
    sys.exit(main())
