"""เตรียมรูปตู้รายสาขาสำหรับคลิป — ครอปให้เห็นตัวตู้ + ปรับแสงเล็กน้อย + ย่อไฟล์

ทำไมมีไฟล์นี้ (16 ต.ค. 2026):
    ตู้แต่ละสาขาหน้าตาไม่เหมือนกัน (คนละยี่ห้อ/ขนาด/จอ/ลาย) — ใช้รูปตู้ทั่วไปรูปเดียวในคลิปของทุกสาขา = ชวนเข้าใจผิด
    เจ้าของส่งรูปมาที่ image/รูปตู้แต่ละสาขา/ (โฟลเดอร์ image/ ไม่ขึ้น git) แล้วบอกว่า "บางมุมยังไม่ค่อยสวย"
    → ครอปให้ตู้เต็มกรอบ (ตัดพื้น/เพดาน/คนเดินผ่าน) · ปรับคอนทราสต์/สีนิดเดียว — ไม่แต่งของในตู้ ไม่ลบอะไรออกจากตัวตู้
    ในคลิปวางเป็น "การ์ดรูป" ขอบเรืองแสง บนพื้นหลังเบลอจากรูปเดียวกัน (fmt-map) มุมรก ๆ รอบตู้จึงไม่เด่น

    ข้อยกเว้นเดียว — เบอร์โทรเก่าบนสติกเกอร์ตู้ (086-386-3219 ผิด · เบอร์จริง 093-073-7930 ตั้งแต่ 16 ต.ค. 2026)
    ฉากปิดใช้รูปนี้เต็มจอ เบอร์เก่าอ่านออกชัด (เจอในคลิปทดสอบบน Actions) → ลบเฉพาะไอคอนโทรศัพท์+เบอร์ (OLD_PHONE)
    ไม่เขียนเบอร์ใหม่ทับ — สติกเกอร์ตู้จริงยังเป็นเบอร์เก่า รูปจะไม่ตรงกับตู้

ผลลัพธ์: hyperframes/templates/dvx-promo/assets/branches/<machine_id>.jpg (สัดส่วน ~3:4 สูง 1440) + branches.json (คุณภาพ/หมายเหตุ)
    quality "weak" = ใช้ได้แต่ควรถ่ายใหม่ — hf_formats ยังใช้ได้ (ดีกว่ารูปตู้ผิดสาขา) แต่รายงานให้เจ้าของรู้

รัน (จาก deploy/):  ../.venv-image/Scripts/python.exe -m agents.video.branch_photos
"""
import json
import math
import pathlib
import sys

from . import config

SRC = config.REPO / "image" / "รูปตู้แต่ละสาขา"
OUT = config.REPO / "hyperframes" / "templates" / "dvx-promo" / "assets" / "branches"

# ชื่อไฟล์ที่เจ้าของตั้ง → machine_id · crop = (ซ้าย, บน, ขวา, ล่าง) เป็น % ของรูป (กำหนดจากการดูรูปทีละรูปบนกริด 10%)
PHOTOS = {
    "chukes03": ("สาขาเซนทรัลพระราม9.jpg", (0, 0, 100, 96), "good", ""),
    "chukes02": ("สาขาเซนทรัลพระราม2_.png", (0, 6, 100, 92), "good", "รูปต้นฉบับเล็ก (499px) — คมน้อยกว่าสาขาอื่น"),
    "wwv06": ("สาขาเซนทรัลพระราม2 ชั้นG.jpg", (3, 24, 85, 84), "good", "ครอปคนบนบันไดเลื่อนออก"),
    "wwv01": ("สาขาเซนทรัลรามอินทรา.jpg", (0, 24, 96, 92), "good", ""),
    "chukes04": ("สาขาเซนทรัลชลบุรี.png", (2, 4, 98, 88), "good", "รูปต้นฉบับเล็ก (463px)"),
    "wwv07": ("สาขาเซนทรัลเวสต์วิล_.png", (2, 14, 98, 94), "good", "รูปต้นฉบับเล็ก (504px)"),
    "chukes01": ("สาขาเดอะมอลล์บางแค.jpg", (4, 25, 95, 93), "good", ""),
    "wwv05": ("สาขาซีคอนบางแค.jpg", (5, 27, 92, 88), "good", ""),
    "pf01": ("สาขาไอคอนสยาม.jpg", (5, 26, 82, 82), "ok", "ตู้เล็กในเฟรม — ครอปเข้าแล้ว ภาพนุ่มกว่าสาขาอื่น"),
    "wwv03": ("สาขาเซนทรัลศาลายา.png", (18, 16, 100, 92), "weak", "กระจกสะท้อนแสงจนดูเหมือนตู้ว่าง — ควรถ่ายใหม่หน้าตรง"),
    "wwv04": ("สาขาเซนทรัลเวสต์เกส.png", (0, 5, 100, 95), "weak", "ถ่ายชิดและเอียงมาก กระจกสะท้อนแสงจนเห็นของน้อย — ควรถ่ายใหม่"),
    # wwv08 เดอะมอลล์บางกะปิ — ยังไม่มีรูป
}
H_OUT = 1440

# เบอร์เก่าบนสติกเกอร์ตู้ → ลบทิ้ง · กรอบ (cx, cy, กว้าง, สูง, องศา) ครอบไอคอนโทรศัพท์+เบอร์
# ⚠️ พิกัดบน "รูปผลลัพธ์" (หลังครอป+ย่อ) — เปลี่ยน crop หรือได้รูปใหม่ ต้องวัดใหม่ทุกครั้ง
# wwv04 ไม่มี — ถ่ายเอียงจนเบอร์หลุดขอบล่างของครอปไปแล้ว
OLD_PHONE = {
    "chukes01": [(603, 1254, 154, 36, 0)],
    "chukes02": [(605, 1253, 150, 36, 0)],
    "chukes03": [(649, 1279, 154, 34, 0)],
    "chukes04": [(377, 1129, 114, 30, 18.9)],
    "pf01": [(617, 1145, 158, 38, 0)],
    "wwv01": [(610, 1266, 182, 42, 0)],
    "wwv03": [(363, 1099, 150, 34, 18.7)],
    "wwv05": [(627, 1219, 188, 42, 0)],
    "wwv06": [(681, 1179, 184, 44, -3.6)],
    "wwv07": [(712, 1102, 130, 32, -18)],
}


def _rect(cx, cy, w, h, ang):
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)
    return [(cx + sx * w / 2 * ux - sy * h / 2 * uy, cy + sx * w / 2 * uy + sy * h / 2 * ux)
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def hide_text(im, boxes):
    """ลบตัวหนังสือในกรอบให้กลืนกับพื้นเดิม — ทั้งแถบขาวและลายคลื่น

    ย่อ 4 เท่าแล้วกรองมัธยฐาน (หน้าต่าง ≈ ความสูงกรอบ) → เส้นตัวอักษรหาย แต่แสง/ลายใหญ่ของพื้นยังอยู่
    แล้วเบลอนิด ผสมกลับด้วยขอบนุ่ม — เบลอเฉย ๆ ยังเห็นเป็นก้อนสีของตัวเลขอยู่ · ทาสีทึบก็เป็นแผ่นแปะบนลายคลื่น
    """
    from PIL import Image, ImageDraw, ImageFilter
    for box in boxes:
        h = box[3]
        pts = _rect(*box)
        pad = round(h * 1.5)
        l = max(0, int(min(x for x, _ in pts)) - pad)
        t = max(0, int(min(y for _, y in pts)) - pad)
        r = min(im.width, int(max(x for x, _ in pts)) + pad)
        b = min(im.height, int(max(y for _, y in pts)) + pad)
        reg = im.crop((l, t, r, b))
        small = reg.resize((max(1, reg.width // 4), max(1, reg.height // 4)), Image.BOX)
        small = small.filter(ImageFilter.MedianFilter(max(3, round(h / 4) | 1)))
        fill = small.resize(reg.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(max(1.0, h * 0.12)))
        mask = Image.new("L", reg.size, 0)
        ImageDraw.Draw(mask).polygon([(x - l, y - t) for x, y in pts], fill=255)
        f = max(2, round(h * 0.15))                    # ขยายแกนทึบก่อนทำขอบนุ่ม — นุ่มเข้าในกรอบแล้วเงาตัวเลขโผล่ที่ขอบ
        mask = mask.filter(ImageFilter.MaxFilter(2 * f + 1)).filter(ImageFilter.GaussianBlur(f))
        im.paste(Image.composite(fill, reg, mask), (l, t))
    return im


def prep(mid, name, crop, quality=86):
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    im = ImageOps.exif_transpose(Image.open(SRC / name)).convert("RGB")
    w, h = im.size
    l, t, r, b = crop
    im = im.crop((round(w * l / 100), round(h * t / 100), round(w * r / 100), round(h * b / 100)))
    scale = H_OUT / im.height
    im = im.resize((round(im.width * scale), H_OUT), Image.LANCZOS)
    if scale > 1.4:                                    # ต้นฉบับเล็ก ขยายแล้วนุ่ม → เพิ่มความคมเบา ๆ
        im = im.filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
    if mid in OLD_PHONE:
        im = hide_text(im, OLD_PHONE[mid])
    im = ImageEnhance.Contrast(im).enhance(1.07)
    im = ImageEnhance.Color(im).enhance(1.08)
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{mid}.jpg"
    im.save(dst, quality=quality, optimize=True, progressive=True)
    return dst, im.size


def main():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    meta = {}
    for mid, (name, crop, quality, note) in PHOTOS.items():
        if not (SRC / name).exists():
            print(f"⚠️ {mid}: ไม่พบ {name}")
            continue
        dst, size = prep(mid, name, crop)
        meta[mid] = {"src": name, "crop": list(crop), "quality": quality, "note": note, "size": list(size)}
        print(f"{mid:9s} {quality:5s} {size[0]}x{size[1]} {dst.stat().st_size // 1024} KB · {name}")
    (OUT / "branches.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
