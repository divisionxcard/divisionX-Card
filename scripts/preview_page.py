#!/usr/bin/env python3
"""พรีวิวหน้าเว็บ — เปิดใน Chromium แบบไม่มีหน้าต่าง ถ่ายภาพ แล้วตรวจของที่มักพัง

ทำไมต้องมี (10 ต.ค. 2026):
    หน้า Artifact ที่ Claude ทำให้ (เช่นหน้าสรุปคอนเทนต์) ถูกเผยแพร่โดยที่ไม่มีใคร
    เห็นหน้าจริงก่อนเลย session ของ Claude Code ไม่มีเครื่องมือพรีวิว ตัวนี้ปิดรูนั้น:
    ได้ภาพทั้งจอคอม/มือถือ × ธีมมืด/สว่าง ที่ Claude เปิดดูเองได้ (Read อ่านรูปได้)
    พร้อมรายการปัญหาที่ตรวจด้วยเครื่องได้ ไม่ต้องเดาจากการอ่านโค้ด

ใช้กับ:
    - ไฟล์ HTML ของ Artifact (ไม่มี <html>/<head> เอง) → ห่อด้วยโครงหน้าแบบเดียวกับ
      ตอนเผยแพร่ + จำลอง CSP ของ Artifact ให้ของที่จะโดนบล็อกตอนขึ้นจริงพังให้เห็นตั้งแต่ตอนนี้
    - ไฟล์ HTML เต็มหน้า หรือ URL เช่น http://localhost:3000/branches (หน้าที่ต้องล็อกอินจะได้หน้าล็อกอิน)

รัน:
    .venv-image\\Scripts\\python.exe scripts\\preview_page.py <ไฟล์.html | URL>
    ... --views phone                 เฉพาะมือถือ (desktop,phone)
    ... --themes dark                 เฉพาะธีมมืด (light,dark)
    ... --explicit-theme              ทดสอบปุ่มสลับธีมด้วย (ตั้ง data-theme สวนกับธีมเครื่อง)
    ... --out <โฟลเดอร์>               ค่าตั้งต้นอยู่ในโฟลเดอร์ชั่วคราว ไม่เลอะรีโป
    ... --json                        พิมพ์รายงานเป็น JSON

ผลลัพธ์: ภาพเต็มหน้า + ภาพหั่นเป็นชิ้น (<view>-<theme>-01.png …) และ report.json
exit code: 0 = ไม่เจอปัญหา · 1 = เจอปัญหา · 2 = ตัวพรีวิวเองพัง

⚠️ สิ่งที่ตัวนี้ตรวจไม่ได้ — ต้องเปิดดูภาพเอง: ข้อความทับกัน สีกลืนพื้น ตัวไทยขาด
   เลย์เอาต์ที่ "ไม่ล้นแต่ดูผิด" · การจำลอง CSP เป็นค่าประมาณจากคำอธิบายของ Artifact
   ไม่ใช่ตัวจริงของ claude.ai
"""
import argparse
import json
import os
import pathlib
import re
import sys
import tempfile
import time

# ⚠️ เครื่องนี้ ACP = cp1252 พิมพ์ไทยไม่ได้ ถ้าถูกเรียกแบบไม่มีคอนโซลจะตายตั้งแต่ print แรก
#    (ดู CLAUDE.md · memory project_thai_stdout_encoding_trap)
for _s in (sys.stdout, sys.stderr):
    if _s is not None:
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

VIEWS = {
    "desktop": {"viewport": {"width": 1280, "height": 900}, "device_scale_factor": 1},
    # 390 = iPhone รุ่นกลาง ๆ · dsf 2 ให้ตัวไทยคมพอจะเห็นสระ/วรรณยุกต์ขาด
    "phone": {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2,
              "is_mobile": True, "has_touch": True},
}

# โครงหน้าที่ Artifact ห่อให้ตอนเผยแพร่ (ตามคำอธิบายของเครื่องมือ Artifact):
# charset + viewport (viewport-fit=cover) · color-scheme light · :root เว้นขอบตาม safe-area
# · body ไม่มี margin ตัวอักษร 14px พื้นออฟไวท์ · img ไม่เกินกรอบ · [hidden] ซ่อนจริง
SKELETON_HEAD = """<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{csp}<style>
:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
body{{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#faf9f7}}
img{{max-width:100%}}
[hidden]{{display:none!important}}
</style>
</head>
<body>
"""

# CSP โดยประมาณของ Artifact: สคริปต์จาก 5 โฮสต์ · สไตล์จาก Google Fonts · ฟอนต์จาก gstatic
# รูป/สื่อเป็น data:/blob: หรือไฟล์ของ artifact เอง · fetch ออกนอกไม่ได้
ARTIFACT_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/npm/ "
    "https://unpkg.com https://cdn.tailwindcss.com https://code.jquery.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'"
)

# ── ตรวจในหน้า ── (ฟังก์ชัน JS ส่งให้ page.evaluate)
PROBE_JS = r"""
() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const out = { vw, scrollWidth: de.scrollWidth, height: de.scrollHeight,
                overflow: [], brokenImages: [], fontErrors: [], bodyBg: null, title: document.title };

  // ล้นแนวนอน — หาตัวการ "ชั้นนอกสุด" ที่ไม่ได้อยู่ในกล่องที่เลื่อน/ตัดขอบเองอยู่แล้ว
  if (de.scrollWidth > vw + 1) {
    const listed = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      let p = el.parentElement, inScroller = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible') { inScroller = true; break; }
        p = p.parentElement;
      }
      if (inScroller || listed.some(a => a.contains(el))) continue;
      listed.push(el);
      const cls = [...el.classList].slice(0, 2).map(c => '.' + c).join('');
      out.overflow.push({ el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls,
                          left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
      if (out.overflow.length >= 8) break;
    }
  }

  for (const img of document.images) {
    if (img.complete && img.naturalWidth === 0) out.brokenImages.push((img.currentSrc || img.src || '').slice(0, 140));
  }
  for (const f of document.fonts) {
    if (f.status === 'error') out.fontErrors.push(f.family + ' ' + f.weight);
  }
  const bg = getComputedStyle(document.body).backgroundColor;
  out.bodyBg = bg;
  return out;
}
"""


def is_url(s):
    return bool(re.match(r"^https?://", s, re.I))


def needs_wrap(html):
    head = html[:4000].lower()
    return "<html" not in head and "<!doctype" not in head


def build_source(target, wrap_mode, csp_on):
    """คืน (url ที่จะเปิด, คำอธิบายโหมด, ไฟล์ชั่วคราวที่ต้องลบทิ้งหลังใช้ หรือ None)"""
    if is_url(target):
        return target, "URL", None
    path = pathlib.Path(target).resolve()
    if not path.is_file():
        raise SystemExit(f"ไม่เจอไฟล์: {path}")
    html = path.read_text(encoding="utf-8")
    wrap = needs_wrap(html) if wrap_mode == "auto" else wrap_mode == "yes"
    if not wrap:
        return path.as_uri(), "ไฟล์ HTML เต็มหน้า (ไม่ได้ห่อ)", None
    csp = f'<meta http-equiv="Content-Security-Policy" content="{ARTIFACT_CSP}">\n' if csp_on else ""
    wrapped = SKELETON_HEAD.format(csp=csp) + html + "\n</body>\n</html>\n"
    # ⚠️ ต้องวางไว้ข้างไฟล์ต้นทาง ไม่ใช่ในโฟลเดอร์ผลลัพธ์ — ไม่งั้นลิงก์แบบ relative
    #    (ไฟล์ประกอบของ artifact หลายไฟล์) จะชี้ผิดที่แล้วขึ้นว่าโหลดไม่ขึ้นทั้งที่ของจริงปกติ
    #    ผู้เรียกต้องลบทิ้งเสมอ ไม่งั้นพรีวิวไฟล์ในรีโปทีไรก็ทิ้งขยะไว้ข้างไฟล์ทุกครั้ง
    tmp = path.with_name(f".{path.stem}.preview-wrapped.html")
    tmp.write_text(wrapped, encoding="utf-8")
    mode = "Artifact (ห่อด้วยโครงหน้าแบบตอนเผยแพร่" + (" + จำลอง CSP)" if csp_on else ")")
    return tmp.as_uri(), mode, tmp


def slice_png(png_path, slice_h, dsf):
    """หั่นภาพยาวเป็นชิ้น ๆ — ภาพสูงหลายหมื่นพิกเซลถูกย่อจนอ่านไม่ออกตอนเปิดดู"""
    from PIL import Image
    im = Image.open(png_path)
    step = int(slice_h * dsf)
    paths = []
    for i, top in enumerate(range(0, im.height, step), 1):
        part = im.crop((0, top, im.width, min(top + step, im.height)))
        p = png_path.with_name(f"{png_path.stem}-{i:02d}.png")
        part.save(p)
        paths.append(str(p))
    return paths


def render(browser, url, view, theme, explicit, out_dir, wait_ms, slice_h):
    cfg = VIEWS[view]
    ctx = browser.new_context(color_scheme=theme, **cfg)
    page = ctx.new_page()
    console, errors, failed = [], [], []
    page.on("console", lambda m: console.append(f"{m.type}: {m.text.strip()}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda r: failed.append(f"{r.url[:140]} ({r.failure})"))
    page.on("response", lambda r: failed.append(f"{r.url[:140]} (HTTP {r.status})") if r.status >= 400 else None)

    page.goto(url, wait_until="load", timeout=60000)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass  # หน้าที่ยิงคำขอไม่หยุด (polling) — ถ่ายตามที่มีได้เลย
    page.evaluate("document.fonts.ready.then(() => true)")

    label = theme
    if explicit:
        # ธีมเครื่องหนึ่งแบบ แต่คนกดสลับเป็นอีกแบบ — จุดที่หน้าเว็บพังบ่อยที่สุดเรื่องธีม
        flip = "dark" if theme == "light" else "light"
        page.evaluate(f"document.documentElement.setAttribute('data-theme', '{flip}')")
        label = f"{theme}-os-{flip}-toggle"
    page.wait_for_timeout(wait_ms)

    probe = page.evaluate(PROBE_JS)
    name = f"{view}-{label}"
    full = out_dir / f"{name}.png"
    page.screenshot(path=str(full), full_page=True)
    ctx.close()
    slices = slice_png(full, slice_h, cfg["device_scale_factor"])
    return {"name": name, "view": view, "theme": label, "full": str(full), "slices": slices,
            "console": console, "pageErrors": errors, "failed": failed, **probe}


def issues_of(r):
    out = []
    if r["overflow"] or r["scrollWidth"] > r["vw"] + 1:
        who = ", ".join(f'{o["el"]} ({o["width"]}px)' for o in r["overflow"][:4]) or "หาตัวการไม่เจอ"
        out.append(f'ล้นแนวนอน: หน้ากว้าง {r["scrollWidth"]}px เกินจอ {r["vw"]}px — ตัวการ: {who}')
    out += [f"โหลดไม่ขึ้น: {f}" for f in r["failed"]]
    out += [f"JS พัง: {e}" for e in r["pageErrors"]]
    out += [f"คอนโซล {c}" for c in r["console"]]
    out += [f"รูปเสีย: {s}" for s in r["brokenImages"]]
    out += [f"ฟอนต์โหลดไม่ขึ้น: {f}" for f in r["fontErrors"]]
    if r["bodyBg"] in ("rgba(0, 0, 0, 0)", "transparent"):
        out.append("body ไม่มีพื้นหลัง — บน Artifact จะโปร่งเห็นพื้นของตัวเว็บที่ห่ออยู่")
    return out


def main():
    ap = argparse.ArgumentParser(description="พรีวิวหน้าเว็บ: ถ่ายภาพจอคอม/มือถือ × ธีมมืด/สว่าง แล้วตรวจปัญหา")
    ap.add_argument("target", help="ไฟล์ .html หรือ URL")
    ap.add_argument("--out", help="โฟลเดอร์เก็บภาพ (ค่าตั้งต้นอยู่ในโฟลเดอร์ชั่วคราวของเครื่อง)")
    ap.add_argument("--views", default="desktop,phone")
    ap.add_argument("--themes", default="light,dark")
    ap.add_argument("--explicit-theme", action="store_true", help="ทดสอบปุ่มสลับธีม (data-theme สวนกับธีมเครื่อง)")
    ap.add_argument("--wrap", choices=["auto", "yes", "no"], default="auto")
    ap.add_argument("--no-csp", action="store_true", help="ไม่จำลอง CSP ของ Artifact")
    ap.add_argument("--wait", type=int, default=400, help="รอหลังโหลดเสร็จ (มิลลิวินาที)")
    ap.add_argument("--slice", type=int, default=1100, help="ความสูงต่อชิ้นของภาพหั่น (CSS px)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    stem = "url" if is_url(a.target) else pathlib.Path(a.target).stem
    out_dir = pathlib.Path(a.out) if a.out else pathlib.Path(tempfile.gettempdir()) / "dvx-preview" / stem
    out_dir.mkdir(parents=True, exist_ok=True)
    # ล้างผลรอบก่อน — ภาพหั่นค้างจากหน้าที่ยาวกว่าจะปนกับของใหม่แล้วชวนเข้าใจผิด
    for old in list(out_dir.glob("desktop-*.png")) + list(out_dir.glob("phone-*.png")):
        old.unlink()

    views = [v for v in a.views.split(",") if v in VIEWS]
    themes = [t for t in a.themes.split(",") if t in ("light", "dark")]
    if not views or not themes:
        raise SystemExit("--views ต้องเป็น desktop/phone และ --themes ต้องเป็น light/dark")

    url, mode, tmp = build_source(a.target, a.wrap, not a.no_csp)
    t0 = time.time()
    from playwright.sync_api import sync_playwright
    results = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for v in views:
                for t in themes:
                    results.append(render(browser, url, v, t, False, out_dir, a.wait, a.slice))
                    if a.explicit_theme:
                        results.append(render(browser, url, v, t, True, out_dir, a.wait, a.slice))
            browser.close()
    finally:
        if tmp:
            tmp.unlink(missing_ok=True)

    # รวมปัญหาที่ซ้ำกันทุกโหมดให้เหลือบรรทัดเดียว จะได้อ่านจบในสายตาเดียว
    found = {}
    for r in results:
        for i in issues_of(r):
            found.setdefault(i, []).append(r["name"])
    report = {"target": a.target, "mode": mode, "out": str(out_dir), "seconds": round(time.time() - t0, 1),
              "renders": [{k: r[k] for k in ("name", "full", "slices", "height", "vw", "title")} for r in results],
              "issues": [{"issue": i, "in": w} for i, w in found.items()]}
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    if a.json:
        print(json.dumps(report, ensure_ascii=False, indent=1))
    else:
        print(f"พรีวิว: {a.target}")
        print(f"โหมด: {mode} · {report['seconds']} วิ")
        print(f"ภาพอยู่ที่: {out_dir}")
        for r in results:
            print(f"  {r['name']:<28} กว้าง {r['vw']}px สูง {r['height']:,}px → {len(r['slices'])} ชิ้น")
        if found:
            print(f"\nเจอปัญหา {len(found)} ข้อ:")
            for i, w in found.items():
                where = "ทุกโหมด" if len(w) == len(results) else ", ".join(w)
                print(f"  [{where}] {i}")
        else:
            print("\nไม่เจอปัญหาที่ตรวจด้วยเครื่องได้ (ล้นจอ · โหลดไม่ขึ้น · JS/คอนโซล · รูปเสีย · ฟอนต์ · พื้นหลัง)")
            print("ยังต้องเปิดดูภาพเอง: ข้อความทับกัน สีกลืนพื้น ตัวไทยขาด")
    return 1 if found else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:
        print(f"ตัวพรีวิวพัง: {e}", file=sys.stderr)
        sys.exit(2)
