"""วัดโปสเตอร์กับกฎใน tasks/art_direction.json ทีละข้อ

ที่มา: เจ้าของบอกว่าคอขวดของระบบคอนเทนต์คือ "รูปยังไม่สวยพอที่จะอนุมัติ"
คำว่าสวยตัดสินแทนกันไม่ได้ แต่กฎที่แบรนด์เขียนไว้เองวัดได้
ถ้าผิดกฎตัวเองอยู่ ก็ไม่แปลกที่จะรู้สึกว่าไม่ผ่าน

รัน:  py -3 deploy/agents/poster_audit.py            # ใช้คอนเทนต์ #33
      py -3 deploy/agents/poster_audit.py --id 40

⚠️ บทเรียนตอนเขียน (อย่าทำซ้ำ):
   1. ห้ามใช้ querySelector กับลิสต์ที่มีจุลภาค — มันคืนตัวแรกใน "ลำดับเอกสาร"
      ที่ตรงกับ selector อันไหนก็ได้ ทำให้ไปโดนรูปตู้ขนาด 0x0 แทนซอง
   2. ห้ามวัด "กล่องของ <img>" แล้วเรียกว่าพื้นที่สินค้า
      ไฟล์ซองไดคัทเป็น PNG จัตุรัส 1024x1024 แต่เนื้อซองทรงสูงแคบกินแค่ ~38%
      ที่เหลือเป็นพื้นโปร่ง → วัดกล่องจะได้ 83% ทั้งที่ตาเห็นราว 31%
      ต้องคูณสัดส่วนพิกเซลทึบจริงของไฟล์ด้วย
"""
PACK_CONTENT_RATIO = 0.38   # เนื้อซองจริง / ขนาดไฟล์ · วัดจากไฟล์ไดคัท 6 ตัว
import os
import pathlib
import sys

ROOT = pathlib.Path(r"c:\Projects\divisionX Card")
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

for ln in (ROOT / "deploy" / ".env.local").read_text(encoding="utf-8").splitlines():
    if "=" in ln and not ln.strip().startswith("#"):
        k, v = ln.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
os.environ.setdefault("SUPABASE_URL", os.environ["NEXT_PUBLIC_SUPABASE_URL"])
os.environ.setdefault("SUPABASE_SERVICE_KEY", os.environ["SUPABASE_SERVICE_ROLE_KEY"])
os.chdir(ROOT / "deploy")

import poster_render as pr  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

MEASURE = """() => {
  const W = window.innerWidth, H = window.innerHeight;
  const h1 = document.querySelector('h1');
  const cs = h1 ? getComputedStyle(h1) : null;
  const lh = cs ? (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.17) : 0;
  const hb = h1 ? h1.getBoundingClientRect() : null;

  // ⚠️ วัด "พื้นที่ที่ตาเห็นจริง" ไม่ใช่กล่องของ <img>
  //    ซองเป็นทรงสูงแคบ + object-fit:contain → กล่อง 985x985 แต่ซองจริงกินแค่ส่วนหนึ่ง
  //    ถ้าวัดกล่องจะได้ 83% ทั้งที่ตาเห็นราว 1 ใน 4
  // ⚠️ ห้ามใช้ querySelector กับลิสต์ที่มีจุลภาค — มันคืนตัวแรกใน "ลำดับเอกสาร"
  //    ที่ตรงกับอันไหนก็ได้ ซึ่งไปโดนรูปตู้ขนาด 0x0 แทนซอง (เจอจริงตอนเขียน)
  let best = null, bestArea = 0;
  document.querySelectorAll('img').forEach(i => {
    if (i.classList.contains('refl')) return;              // เงาสะท้อน ไม่นับ
    if (i.closest('.plate')) return;                       // โลโก้ ไม่นับ
    const r = i.getBoundingClientRect();
    if (!r.width || !r.height || !i.naturalWidth) return;
    const fit = getComputedStyle(i).objectFit;
    let vw = r.width, vh = r.height;
    if (fit === 'contain') {
      const s = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight);
      vw = i.naturalWidth * s; vh = i.naturalHeight * s;
    }
    const a = vw * vh;
    if (a > bestArea) { bestArea = a; best = {vw: Math.round(vw), vh: Math.round(vh),
                                             box: [Math.round(r.width), Math.round(r.height)],
                                             cls: i.className || i.parentElement.className}; }
  });
  return {
    canvas: [W, H],
    head: hb ? {lines: Math.round(hb.height / lh), size: parseFloat(cs.fontSize),
                top: Math.round(hb.top), bottom: Math.round(hb.bottom)} : null,
    hero: best ? Object.assign(best, {area_pct: +(bestArea / (W * H) * 100).toFixed(1)}) : null,
  };
}"""

CONCEPTS = ["machine_luck", "treasure", "battle", "real_machine",
            "unbox", "hidden_card", "viral", "luxury"]
CID = 33

rows = pr.sb("GET", f"marketing_content?id=eq.{CID}&select=*")
content = rows[0]
machines = pr.sb("GET", "machines?status=eq.active&select=machine_id")

# เตรียมรูปแบบเดียวกับที่ main() ทำ — ทำครั้งเดียวใช้ทุกแนวคิด
import urllib.parse as _up
_sid = content.get("source_sku")
SKU_IMG = None
if _sid:
    _s = pr.sb("GET", "skus?sku_id=eq." + _up.quote(_sid) + "&select=image_url,image_url_box")
    if _s:
        SKU_IMG = pr.fetch_image(_s[0].get("image_url") or _s[0].get("image_url_box"))
BG_IMG = pr.resolve_bg(content)

print(f"วัดโปสเตอร์คอนเทนต์ #{CID} ทั้ง {len(CONCEPTS)} แนวคิด\n")
print(f"{'แนวคิด':<15}{'ผืนภาพ':<13}{'พาดหัว':<22}{'สินค้า':<16}ผิดกฎ")
print("─" * 96)

bad = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--force-color-profile=srgb"])
    for c in CONCEPTS:
        ckey, ccss = pr.load_concept(c)
        html = pr.build_html(content, SKU_IMG, BG_IMG, len(machines), ckey, ccss)
        pg = b.new_page(viewport={"width": pr.SIZE, "height": pr.SIZE}, device_scale_factor=1)
        pg.set_content(html, wait_until="load")
        pg.wait_for_timeout(500)
        pr.fit_headline(pg)
        m = pg.evaluate(MEASURE)
        pg.close()

        errs = []
        W, H = m["canvas"]
        if W == H:
            errs.append("ข้อ5 ผืนภาพ 1:1 (ต้องจัดที่ 4:5 ก่อนครอป)")
        hd = m["head"]
        if hd:
            if hd["lines"] > 2:
                errs.append(f"ข้อ8 พาดหัว {hd['lines']} บรรทัด")
            if hd["bottom"] > H / 3:
                errs.append(f"ข้อ8 พาดหัวเลยหนึ่งในสามบน ({hd['bottom']}/{H//3})")
            if hd["size"] < W * 0.05:
                errs.append(f"ข้อ24 พาดหัว {hd['size']:.0f}px < {W*0.05:.0f}px")
        hr = m["hero"]
        if hr:
            # กล่องรูป → พื้นที่ที่ตาเห็นจริง (ไฟล์ไดคัทมีพื้นโปร่งรอบซอง)
            hr["area_pct"] = round(hr["area_pct"] * PACK_CONTENT_RATIO, 1)
        if not hr:
            errs.append("ข้อ6 ไม่มีสินค้าในภาพเลย")
        elif hr["area_pct"] < 60:
            errs.append(f"ข้อ6 สินค้ากิน {hr['area_pct']}% (ต้อง ≥60%)")

        bad[c] = errs
        hs = f"{hd['lines']}บรร {hd['size']:.0f}px" if hd else "—"
        ps = f"{hr['area_pct']}%" if hr else "ไม่มี"
        print(f"{c:<15}{f'{W}x{H}':<13}{hs:<22}{ps:<16}{len(errs)} ข้อ")
    b.close()

print("\n" + "=" * 96)
print("ผิดกฎอะไรบ้าง")
print("=" * 96)
import collections  # noqa: E402
allerr = collections.Counter()
for c, e in bad.items():
    for x in e:
        allerr[x.split(" ", 1)[0] + " " + x.split(" ", 2)[1] if " " in x else x] += 1
seen = collections.Counter()
for c, e in bad.items():
    for x in e:
        seen[x[:x.find("(")] if "(" in x else x] += 1
for x, n in seen.most_common():
    print(f"  {n}/{len(CONCEPTS)} แนวคิด  {x}")
