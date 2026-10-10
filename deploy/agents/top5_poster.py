#!/usr/bin/env python3
"""โปสเตอร์ซีรีส์ "ส่อง 5 ใบเด็ด" — วางรูปการ์ดจริง 5 ใบด้วย Chromium · AI ทำแค่พื้นหลัง

ทำไม (10 ต.ค. 2026): เจ้าของเลือก "เทมเพลตวางการ์ดจริง + AI วาดพื้นหลัง" สำหรับซีรีส์นี้
  - รูปการ์ดต้องเป็นของจริงเป๊ะ (โมเดลวาดซ้ำแล้วได้คนละใบ — #46)
  - ตัวอักษรไทยถูก 100% เพราะเบราว์เซอร์เป็นคนวาง ไม่ใช่โมเดล
  - ราคาไม่ขึ้นภาพ (ภาพอยู่นานกว่าราคา) — อยู่ในแคปชั่นเท่านั้น

ข้อมูล 5 ใบอ่านจาก Storage: marketing/series/top5-<id>.json ที่ตัวเขียนเก็บไว้ตอนเขียนแคปชั่น
(ดู deploy/lib/top5.js → top5Path) — ไม่คำนวณใหม่ เพราะราคาขยับได้ระหว่างเขียนกับทำภาพ
แล้วอันดับบนภาพจะไม่ตรงกับแคปชั่น

รัน:
  python deploy/agents/top5_poster.py --id 52                     # บน GitHub Actions (poster-render.yml)
  python deploy/agents/top5_poster.py --id 52 --bg <url aibg/…>   # พื้นหลังจาก AI
  python deploy/agents/top5_poster.py --id 0 --top5-json x.json --dry-run --out x.png   # ลองดีไซน์ในเครื่อง

⚠️ ต้องรันได้บน Python 3.11 (workflow ตั้งไว้ 3.11) — ห้ามใช้ quote ชนิดเดียวกันซ้อนใน f-string
"""
import argparse
import json
import pathlib
import re
import sys
import time
import urllib.parse

# ⚠️ เครื่องนี้ ACP = cp1252 — พิมพ์ไทยแล้วตายถ้าถูกเรียกแบบไม่มีคอนโซล (ดู CLAUDE.md)
for _s in (sys.stdout, sys.stderr):
    if _s is not None:
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

import poster_render as pr   # ใช้ของที่มีแล้ว: ต่อ DB/Storage · ดึงรูป · ฟอนต์ · ลบโปสเตอร์เก่า

TEMPLATE = pr.ROOT / "tasks" / "poster_tpl_top5.html"
SIZE = 1080

# ฟอนต์พาดหัว — Kanit หนา 800 จาก Google Fonts (Sarabun ในรีโปหนาสุดแค่ 700 ดูแบนเกินไปสำหรับพาดหัวใหญ่)
# โหลดไม่ขึ้น (เน็ตบน runner มีปัญหา) ก็ตกไปใช้ Sarabun ที่ฝังไว้ — ภาษาไทยยังถูก แค่บางลง
# ⚠️ ต้องเป็นแท็ก <link> ไม่ใช่ @import ในบล็อก <style> — @import ที่อยู่หลังกฎอื่นถูกเบราว์เซอร์ทิ้งเงียบ ๆ
DISPLAY_FONT_LINK = ('<link rel="stylesheet" '
                     'href="https://fonts.googleapis.com/css2?family=Kanit:wght@700;800&display=block">')


TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


def variant_tag(it):
    """ป้ายเวอร์ชันใต้ชื่อ — ภาษาเดียวกับแคปชั่น (ห้ามโชว์รหัส p1/p2 เหมือนในแคปชั่น)

    ⚠️ ต้องสั้น — การ์ดอันดับ 2–5 กว้างแค่ 220px · "พาราเรล · ghost rare" ถูกตัดเป็น "ghos…" (ลองจริงแล้ว)
       ghost rare เป็นพาราเรลแบบหนึ่งอยู่แล้ว ไม่ต้องเขียนซ้ำ
    """
    rarity = it.get("rarity") or ""
    ver = "ใบปกติ" if not it.get("variant") else ("ghost rare" if it.get("ghost") else "พาราเรล")
    return " · ".join(x for x in (rarity, ver) if x)


def as_of_th(day):
    """'2026-10-05' → 'ต.ค. 2026' — บอกแค่เดือน พอให้รู้ว่าอันดับนี้ของช่วงไหน โดยไม่ใส่ราคาบนภาพ"""
    m = re.match(r"(\d{4})-(\d{2})", day or "")
    return f"{TH_MONTH[int(m.group(2)) - 1]} {m.group(1)}" if m else ""


def set_names(label):
    """"BOOSTER PACK -Carrying on His Will- [OP-13]" → ("OP-13", "Carrying on His Will")"""
    code = re.search(r"\[([A-Z]+-?\d+)\]", label or "")
    name = re.search(r"-([^-\[\]]+)-", label or "")
    return (code.group(1) if code else ""), (name.group(1).strip() if name else (label or ""))


def card_html(it, img):
    r = int(it.get("rank") or 0)
    name = pr.esc(it.get("name") or it.get("code") or "")
    return (
        f'<div class="card r{r}">'
        f'<img src="{img}" alt="{name}">'
        f'<div class="lab"><span class="rank">#{r}</span>'
        f'<span class="who"><span class="name">{name}</span>'
        f'<span class="tag">{pr.esc(variant_tag(it))}</span></span></div>'
        f"</div>"
    )


def build_html(top5, bg_uri):
    tpl = TEMPLATE.read_text(encoding="utf-8")
    reg = pr.data_uri((pr.FONT_DIR / "Sarabun-Regular.ttf").read_bytes(), "font/ttf")
    bold = pr.data_uri((pr.FONT_DIR / "Sarabun-Bold.ttf").read_bytes(), "font/ttf")

    logo_path = pr.ROOT / "public" / "logo-white.png"
    logo = ""
    if logo_path.exists():
        logo = f'<img class="logo" src="{pr.data_uri(logo_path.read_bytes(), "image/png")}" alt="DivisionX Card">'

    code, name = set_names((top5.get("set") or {}).get("label"))
    head = f'ส่อง 5 ใบเด็ด <span class="code">{pr.esc(code)}</span>' if code else "ส่อง 5 ใบเด็ด"
    # เกณฑ์จัดอันดับ + เดือน — ถ้ามีราคาครบทุกใบเท่านั้น (ใบที่เติมเข้ามาไม่ได้จัดตามราคา)
    items = top5.get("items") or []
    when = as_of_th(top5.get("priceAsOf"))
    ranked_by_price = items and all(it.get("priced") for it in items[:5])
    sub = " · ".join(x for x in (name, f"จัดอันดับตามราคาตลาด {when}" if ranked_by_price and when else "") if x)

    cards, missing = [], []
    for it in (top5.get("items") or [])[:5]:
        img = pr.fetch_image(it.get("image"))
        if not img:
            missing.append(it.get("code"))
            continue
        cards.append(card_html(it, img))
    if missing:
        # รูปการ์ดหายแม้ใบเดียว = โปสเตอร์เล่าไม่ครบ 5 อันดับ ไม่ควรออกไปแบบมีช่องโหว่
        raise SystemExit(f"[top5] โหลดรูปการ์ดไม่ได้: {', '.join(missing)} — ไม่สร้างโปสเตอร์")

    return (tpl
            .replace("{{FONT_REGULAR}}", reg)
            .replace("{{FONT_BOLD}}", bold)
            .replace("{{DISPLAY_FONT_LINK}}", DISPLAY_FONT_LINK)
            .replace("{{BG_IMG}}", f'<img class="bgimg" src="{bg_uri}" alt="">' if bg_uri else "")
            .replace("{{HEAD}}", head)
            .replace("{{SUB}}", pr.esc(sub))
            .replace("{{CARDS}}", "\n  ".join(cards))
            .replace("{{LOGO}}", logo))


# ย่อชื่อการ์ดที่ยาวเกินช่องจนพอดี — วัดในเบราว์เซอร์จริง (ความกว้างตัวอักษรเดาไม่ได้)
# ⚠️ โปสเตอร์จริงชุดแรก (#52 · 10 ต.ค. 2026) ขึ้น "Edward.Newga…" เพราะช่องชื่อการ์ดเล็กกว้างราว 165px
#    ห้ามแก้ด้วยการให้ขึ้นบรรทัดใหม่ — ใต้การ์ดแถวบนเหลือที่แค่ ~20px ก่อนถึงการ์ดแถวล่าง ชื่อ 2 บรรทัดจะชน
# ⚠️ ห้ามวัดด้วย scrollWidth > clientWidth — สองค่านี้ถูกปัดเป็นจำนวนเต็ม: "Edward.Newgate" กว้างจริง 167.x
#    ในช่อง 167 → รายงานว่าเท่ากันพอดี แต่ตอนวาดเกินเศษพิกเซลแล้วขึ้น "…" (ลองจริง โปสเตอร์ #52)
#    วัดความกว้างตัวหนังสือด้วย Range (ได้ทศนิยม) แล้วเผื่อขอบ 1px
#    และห้ามวัด "ช่อง" จากกล่องชื่อเอง — กล่องหดตามความยาวชื่อ ย่อเท่าไรก็ไม่พอดี (ลองแล้ว ย่อทุกชื่อจนเล็กสุด)
#    ช่องจริง = ความกว้างแถวป้าย − เลขอันดับ − ช่องว่างระหว่างกัน
FIT_NAMES_JS = """() => {
  const out = [];
  const textW = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
  for (const lab of document.querySelectorAll('.lab')) {
    const el = lab.querySelector('.name'), rank = lab.querySelector('.rank');
    if (!el || !rank) continue;
    const gap = parseFloat(getComputedStyle(lab).columnGap) || 0;
    const room = lab.getBoundingClientRect().width - rank.getBoundingClientRect().width - gap - 1;
    let size = parseFloat(getComputedStyle(el).fontSize);
    const min = Math.max(14, Math.round(size * 0.65));
    while (textW(el) > room && size > min) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
    if (textW(el) > room) out.push(el.textContent);
  }
  return out;
}"""


def render(html, out_path):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--force-color-profile=srgb"])
        pg = b.new_page(viewport={"width": SIZE, "height": SIZE}, device_scale_factor=2)
        pg.set_content(html, wait_until="load")
        # รอฟอนต์จริง ไม่ใช่รอเวลาเดา — ฟอนต์พาดหัวมาจากเน็ต ช้ากว่าที่ฝังไว้
        pg.evaluate("document.fonts.ready.then(() => true)")
        pg.wait_for_timeout(300)
        still_cut = pg.evaluate(FIT_NAMES_JS)   # ต้องหลังฟอนต์โหลดเสร็จ ไม่งั้นวัดผิด
        if still_cut:
            print(f"  ⚠️ ชื่อยังยาวเกินช่องแม้ย่อสุดแล้ว: {', '.join(still_cut)}")
        used = pg.evaluate("[...document.fonts].some(f => f.family.includes('Kanit') && f.status === 'loaded')")
        pg.screenshot(path=out_path, type="png")
        b.close()
    return bool(used)


def load_top5(content_id, local_json=None):
    if local_json:
        return json.loads(pathlib.Path(local_json).read_text(encoding="utf-8"))
    url = f"{pr.SB_URL}/storage/v1/object/public/{pr.BUCKET}/series/top5-{content_id}.json"
    import urllib.request
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "DivisionXCard/1.0"}), timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        raise SystemExit(f"[top5] ไม่มีข้อมูล 5 ใบของโพสต์ #{content_id} ({str(e)[:80]}) — "
                         f"กด 'เขียนใหม่' ให้ระบบเก็บข้อมูลก่อน แล้วค่อยทำโปสเตอร์")


def main():
    ap = argparse.ArgumentParser(description="โปสเตอร์ซีรีส์ ส่อง 5 ใบเด็ด")
    ap.add_argument("--id", type=int, required=True, help="id ของ marketing_content")
    ap.add_argument("--bg", help="url พื้นหลังจาก AI (ต้องอยู่ใน /marketing/aibg/)")
    ap.add_argument("--bg-file", help="ไฟล์พื้นหลังในเครื่อง (ลองดีไซน์เท่านั้น)")
    ap.add_argument("--top5-json", help="ไฟล์ข้อมูล 5 ใบในเครื่อง (ลองดีไซน์โดยไม่ต้องมีใน Storage)")
    ap.add_argument("--dry-run", action="store_true", help="เซฟลงเครื่องอย่างเดียว ไม่อัป ไม่แก้ DB")
    ap.add_argument("--out", help="ที่เก็บไฟล์")
    args = ap.parse_args()

    pr.load_env_file()
    if not args.top5_json and (not pr.SB_URL or not pr.SB_KEY):
        print("[top5] ไม่มี SUPABASE_URL / SERVICE KEY — ตรวจ deploy/.env.local")
        sys.exit(1)

    top5 = load_top5(args.id, args.top5_json)
    if len(top5.get("items") or []) < 5:
        raise SystemExit(f"[top5] ข้อมูลมีแค่ {len(top5.get('items') or [])} ใบ — ไม่สร้างโปสเตอร์")

    # พื้นหลังรับเฉพาะของที่ระบบเราอัปไว้ในโฟลเดอร์ aibg เท่านั้น (เหมือน poster_render.resolve_bg)
    bg_uri = None
    if args.bg_file:
        bg_uri = pr.data_uri(pathlib.Path(args.bg_file).read_bytes(), "image/png")
    elif args.bg:
        if pr.AI_BG_DIR in args.bg:
            bg_uri = pr.fetch_image(args.bg)
        else:
            print(f"[top5] ไม่รับพื้นหลังนอก {pr.AI_BG_DIR} — ใช้พื้นแบรนด์แทน")

    html = build_html(top5, bg_uri)
    out = args.out or str(pr.HERE / f"poster-{args.id}.png")
    display_ok = render(html, out)
    kb = pathlib.Path(out).stat().st_size / 1024
    font_txt = "Kanit" if display_ok else "Sarabun (Kanit โหลดไม่ขึ้น)"
    bg_txt = "AI" if bg_uri else "พื้นแบรนด์ (CSS)"
    print(f"[top5] เรนเดอร์เสร็จ {out} ({kb:.0f} KB) · พื้นหลัง={bg_txt} · ฟอนต์พาดหัว={font_txt}")

    if args.dry_run:
        print("[top5] dry-run — ไม่อัปโหลด ไม่แก้ DB")
        return

    rows = pr.sb("GET", f"marketing_content?id=eq.{args.id}&select=id,media_url")
    if not rows:
        raise SystemExit(f"[top5] ไม่พบคอนเทนต์ id={args.id}")
    old = rows[0].get("media_url") or ""

    # อัปตัวใหม่ให้สำเร็จก่อน แล้วค่อยลบตัวเก่า (เหตุผลเดียวกับ poster_render.main)
    key = f"poster/{args.id}-top5-{int(time.time())}.png"
    pr.sb("POST", f"{pr.BUCKET}/{key}", raw=pathlib.Path(out).read_bytes(), ctype="image/png",
          base="storage/v1/object")
    url = f"{pr.SB_URL}/storage/v1/object/public/{pr.BUCKET}/{key}"
    pr.sb("PATCH", f"marketing_content?id=eq.{args.id}", {"media_url": url, "media_type": "image"})
    print(f"[top5] อัปโหลดแล้ว → {url}")

    marker = f"/{pr.BUCKET}/poster/{args.id}-"
    if marker in old and old != url:
        try:
            pr.sb("DELETE", f"{pr.BUCKET}/{old.split('/' + pr.BUCKET + '/', 1)[1]}", base="storage/v1/object")
            print("[top5] ลบโปสเตอร์เก่าแล้ว")
        except Exception as e:
            print(f"[top5] ลบของเก่าไม่สำเร็จ (ข้ามไป): {str(e)[:80]}")


if __name__ == "__main__":
    main()
