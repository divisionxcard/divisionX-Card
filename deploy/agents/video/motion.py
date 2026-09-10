"""ฉากกราฟิกเคลื่อนไหว — ออกแบบฉากเป็น HTML/CSS แล้วถ่ายทีละเฟรมด้วย Chromium

ทำไมต้องมี: ภาพนิ่ง + กล้องขยับ ยังไงก็ดูเป็นสไลด์นำเสนองาน ฉากที่ "ถูกออกแบบ"
จริง ๆ ต้องมีของเคลื่อนไหวหลายชั้น (สินค้าลอย แสงหายใจ อนุภาค ป้ายวิ่งเข้า)
ซึ่งคือสิ่งที่ CSS animation ทำเก่งที่สุด — และเรามี Chromium ในไปป์ไลน์อยู่แล้ว
(subtitle.py ใช้เรนเดอร์ซับไทย) เลยใช้ตัวเดียวกันเรนเดอร์ทั้งฉาก

หลักการสำคัญ: **เฟรมต้อง deterministic** — เราไม่ปล่อยให้อนิเมชันวิ่งเรียลไทม์
แล้วรัวชัตเตอร์ (จะได้เฟรมไม่ตรงเวลา เฟรมหลุด) แต่สั่งหยุดทุกอนิเมชันแล้ว
"หมุนเข็มนาฬิกา" ไปทีละเฟรมด้วย Web Animations API (currentTime) ก่อนถ่าย
→ เฟรมที่ 47 คือเวลา 47/30 วินาทีเป๊ะ ทุกครั้งที่เรนเดอร์ได้ภาพเดิมเสมอ

spec ในระบบ: `tpl:<ชื่อเทมเพลต>?img=sku:OP 17&title=...&tag=...`
    img ใช้รูปแบบเดียวกับ plan.visuals (sku:/machine:/file:) — เวทีคือกราฟิก
    แต่**สินค้ายังเป็นรูปถ่ายจริงเสมอ** ตามหลักของ visuals.py

เทมเพลตอยู่ใน motion_templates/*.html — อนิเมชันทั้งหมดต้องเป็น CSS animation
(ห้าม requestAnimationFrame/SMIL เพราะเข็มนาฬิกาหมุนไม่ถึง) และห้าม Math.random
ตอนวางองค์ประกอบ (ใช้ PRNG seed คงที่ — เรนเดอร์ซ้ำต้องได้ภาพเดิม)
"""
import base64
import hashlib
import html as _html
import pathlib
import shutil
import subprocess
import urllib.parse

from . import config

TPL_DIR = pathlib.Path(__file__).parent / "motion_templates"

# หมุนนาฬิกาของทุกอนิเมชันบนหน้าไปที่ ms ที่กำหนด (รวม transition/animation ทุกชั้น)
_SEEK_JS = """(ms) => {
  document.getAnimations({ subtree: true }).forEach(a => {
    a.pause();
    a.currentTime = ms;
  });
}"""


def is_tpl(spec):
    return isinstance(spec, str) and spec.startswith("tpl:")


def parse(spec):
    """`tpl:showcase?img=sku:OP 17&title=...` → (ชื่อเทมเพลต, {พารามิเตอร์})"""
    body = spec[4:]
    name, _, qs = body.partition("?")
    params = {k: v[0] for k, v in urllib.parse.parse_qs(qs).items()}
    return name.strip(), params


def template_path(name):
    p = TPL_DIR / f"{name}.html"
    if not p.exists():
        known = ", ".join(sorted(x.stem for x in TPL_DIR.glob("*.html")))
        raise ValueError(f"ไม่มีเทมเพลตฉากชื่อ '{name}' — ที่มี: {known}")
    return p


def _data_uri(path):
    b = pathlib.Path(path).read_bytes()
    mime = "image/png" if b[:8].startswith(b"\x89PNG") else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(b).decode()


def _font_uri():
    b = (config.FONT_DIR / "Sarabun-Bold.ttf").read_bytes()
    return "data:font/ttf;base64," + base64.b64encode(b).decode()


def _build_html(name, params, work):
    """เติมพารามิเตอร์ลงเทมเพลต — รูปสินค้า resolve ผ่าน visuals (รูปจริงเท่านั้น)"""
    tpl = template_path(name).read_text(encoding="utf-8")
    img_uri = ""
    if params.get("img"):
        from . import visuals                     # lazy — เลี่ยง import วน
        src = visuals.resolve(params["img"], pathlib.Path(work) / "src")
        img_uri = _data_uri(src)
    return (tpl
            .replace("{{FONT_BOLD}}", _font_uri())
            .replace("{{IMG}}", img_uri)
            .replace("{{TITLE}}", _html.escape(params.get("title", "")))
            .replace("{{TAG}}", _html.escape(params.get("tag", "")))
            .replace("{{W}}", str(config.W))
            .replace("{{H}}", str(config.H)))


def _cache_key(name, params, seconds, fps):
    tpl_bytes = template_path(name).read_bytes()
    raw = tpl_bytes + repr(sorted(params.items())).encode() + f"{seconds:.3f}/{fps}".encode()
    return hashlib.sha1(raw).hexdigest()[:16]


def snapshot(spec, work, out_png, at=1.2):
    """เฟรมนิ่งหนึ่งใบของฉาก (ไว้ให้ timeline/พรีวิวของห้องตัดต่อ) — ถ่ายที่วินาที `at`
    ตอนที่ป้าย/ของเข้าที่แล้ว ไม่ใช่เฟรมแรกที่ยังว่างเปล่า"""
    name, params = parse(spec)
    html = _build_html(name, params, work)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = browser.new_page(viewport={"width": config.W, "height": config.H},
                                device_scale_factor=1)
        page.set_content(html, wait_until="load")
        page.wait_for_timeout(60)                 # ให้ฟอนต์/เลย์เอาต์นิ่งก่อน
        page.evaluate(_SEEK_JS, at * 1000)
        page.screenshot(path=str(out_png), type="png")
        browser.close()
    return pathlib.Path(out_png)


def render_clip(spec, seconds, out_mp4, work, fps=None):
    """เรนเดอร์ฉากเคลื่อนไหวเป็นคลิป — แคชด้วย hash ของ (เทมเพลต+พารามิเตอร์+ความยาว)

    ฉากที่ไม่ได้แก้จะไม่เสียเวลาเรนเดอร์ซ้ำ (ถ่ายเฟรมคือส่วนช้าสุดของฉากแบบนี้
    ~10-20 วิต่อฉาก 3 วิ) — วนแก้ซับ/เสียงกี่รอบก็เจอแคชตลอด
    """
    fps = fps or config.FPS
    name, params = parse(spec)
    work = pathlib.Path(work)
    cache_dir = work / "motion"
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = _cache_key(name, params, seconds, fps)
    cached = cache_dir / f"{key}.mp4"
    out_mp4 = pathlib.Path(out_mp4)
    if cached.exists():
        shutil.copyfile(cached, out_mp4)
        return out_mp4

    html = _build_html(name, params, work)
    n = max(2, int(round(seconds * fps)))
    frames_dir = cache_dir / f"{key}_frames"
    frames_dir.mkdir(exist_ok=True)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = browser.new_page(viewport={"width": config.W, "height": config.H},
                                device_scale_factor=1)
        page.set_content(html, wait_until="load")
        page.wait_for_timeout(60)
        for i in range(n):
            page.evaluate(_SEEK_JS, (i / fps) * 1000)
            page.screenshot(path=str(frames_dir / f"f_{i:04d}.png"), type="png")
        browser.close()

    args = [config.ffmpeg_bin(), "-y", "-loglevel", "error",
            "-framerate", str(fps), "-i", str(frames_dir / "f_%04d.png"),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", str(fps), str(cached)]
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                       errors="replace")
    if r.returncode != 0:
        tail = "\n".join((r.stderr or "").strip().splitlines()[-10:])
        raise RuntimeError(f"ffmpeg ประกอบฉากเคลื่อนไหวล้ม:\n{tail}")
    shutil.rmtree(frames_dir, ignore_errors=True)  # เฟรมดิบหนัก — เก็บแค่ mp4 แคช
    shutil.copyfile(cached, out_mp4)
    return out_mp4
