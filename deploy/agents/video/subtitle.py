"""เรนเดอร์ซับไทยเป็น PNG โปร่งใสด้วย Chromium — วิธีเดียวที่จัดสระ/วรรณยุกต์ถูก

เปิดเบราว์เซอร์ครั้งเดียวแล้วยิงหลายภาพรวดเดียว (เปิด-ปิดทุกชิ้นช้ากว่ามาก)
"""
import base64
import html as _html
import pathlib
import re

from . import config

TEMPLATE = config.TASKS / "subtitle_template.html"

# สีตาม brand identity: ฟ้านีออนไฟฟ้าบนกรมท่า (ไม่ใช่ดำ-ทอง)
STYLES = {
    "brand":  {"fill": "#ffffff", "stroke": "#0a1a3a", "accent": "#3ddcff"},
    "plain":  {"fill": "#ffffff", "stroke": "#000000", "accent": "#ffffff"},
    "punch":  {"fill": "#ffe14d", "stroke": "#101010", "accent": "#3ddcff"},
}

_EM = re.compile(r"\*(.+?)\*")          # *คำ* → เน้นด้วยสีแบรนด์


def _font_uri():
    b = (config.FONT_DIR / "Sarabun-Bold.ttf").read_bytes()
    return "data:font/ttf;base64," + base64.b64encode(b).decode()


def _markup(text):
    """escape ก่อน แล้วค่อยเปิดทางให้ *เน้นคำ* — สลับลำดับแล้วจะโดน escape ทับ"""
    safe = _html.escape(text)
    return _EM.sub(r"<em>\1</em>", safe)


def _karaoke_markup(text, upto):
    """ข้อความเดียวกัน แต่แบ่งเป็นส่วนที่พูดไปแล้วกับส่วนที่ยังไม่ถึง

    ⚠️ ตัดที่ "จำนวนอักขระ" ของข้อความที่ตัดช่องว่างออกแล้ว (ตรงกับที่ align นับ)
       แต่ต้องแมปกลับไปยังตำแหน่งจริงในข้อความที่มีช่องว่าง ไม่งั้นจุดตัดจะเลื่อน
       ทุกครั้งที่ประโยคมีช่องว่าง
    """
    raw = str(text or "").replace("*", "")
    seen = 0
    cut = len(raw)
    for i, ch in enumerate(raw):
        if seen >= upto:
            cut = i
            break
        if not ch.isspace():
            seen += 1
    else:
        cut = len(raw)
    said, rest = raw[:cut], raw[cut:]
    out = ""
    if said:
        out += f'<span class="said">{_html.escape(said)}</span>'
    if rest:
        out += f'<span class="rest">{_html.escape(rest)}</span>'
    return out or _html.escape(raw)


def render_many(chunks, out_dir, style="brand", size=64, bottom=430, karaoke=False):
    """chunks: [{'text','start','end'}] → เติมคีย์ 'png' ให้ทุกชิ้น

    karaoke=True และชิ้นนั้นมีคีย์ 'steps' → เรนเดอร์หลายใบต่อหนึ่งซับ
    แล้วเติมคีย์ 'frames' = [{'png','start','end'}, ...] ให้แทน
    (ยังเติม 'png' ของใบแรกไว้ด้วย เผื่อโค้ดเก่าที่อ่านคีย์นั้น)
    """
    out_dir = pathlib.Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pal = STYLES.get(style, STYLES["brand"])
    tpl = TEMPLATE.read_text(encoding="utf-8")
    font = _font_uri()

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = browser.new_page(
            viewport={"width": config.W, "height": config.H},
            device_scale_factor=1,
        )

        def shoot(markup, path):
            body = (tpl
                    .replace("{{FONT_BOLD}}", font)
                    .replace("{{TEXT}}", markup)
                    .replace("{{SIZE}}", str(size))
                    .replace("{{BOTTOM}}", str(bottom))
                    .replace("{{FILL}}", pal["fill"])
                    .replace("{{STROKE}}", pal["stroke"])
                    .replace("{{ACCENT}}", pal["accent"])
                    .replace("{{W}}", str(config.W))
                    .replace("{{H}}", str(config.H)))
            page.set_content(body, wait_until="load")
            page.wait_for_timeout(30)              # ให้ @font-face โหลดจบก่อนถ่าย
            page.screenshot(path=str(path), type="png", omit_background=True)

        for i, c in enumerate(chunks):
            steps = c.get("steps") if karaoke else None
            if steps:
                frames = []
                for k, st in enumerate(steps):
                    f = out_dir / f"sub_{i:03d}_{k:02d}.png"
                    shoot(_karaoke_markup(c["text"], st["upto"]), f)
                    frames.append({"png": str(f), "start": st["start"], "end": st["end"]})
                c["frames"] = frames
                c["png"] = frames[0]["png"]
            else:
                f = out_dir / f"sub_{i:03d}.png"
                shoot(_markup(c["text"]), f)
                c["png"] = str(f)
        browser.close()
    return chunks


def render_headline(text, out_png, style="brand", size=86, bottom=None):
    """พาดหัวเปิดคลิป — ตัวใหญ่กลางจอ ค้างไว้ช่วงต้นให้คนอ่านทันก่อนตัดสินใจเลื่อน"""
    bottom = bottom if bottom is not None else int(config.H * 0.52)
    c = [{"text": text}]
    render_many(c, pathlib.Path(out_png).parent, style=style, size=size, bottom=bottom)
    src = pathlib.Path(c[0]["png"])
    dst = pathlib.Path(out_png)
    if src != dst:
        dst.write_bytes(src.read_bytes())
        src.unlink(missing_ok=True)
    return dst
