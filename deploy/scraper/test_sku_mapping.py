"""ตรวจว่าตัวแปลงชื่อสินค้า → sku_id ยังทำงานถูกทุกไฟล์

ทำไมต้องมี
──────────
ชื่อสินค้าจากหลังบ้านตู้ถูกแปลงเป็น sku_id ด้วย map ที่เขียนแยกกัน **7 ไฟล์**
เวลาพังมันพังแบบไม่มีเสียง 2 แบบ:
    map ไม่ติด     → sku_id = null → สินค้าหายจากรายงาน (ยังพอเห็นได้)
    map ติดผิดตัว  → ยอดขายไปรวมกับ SKU อื่น (มองไม่เห็นเลย)
และฝั่ง sales **ทิ้งรายการขายทั้งแถว** ถ้า map ไม่ติด → เงินหายถาวร

เคสจริงที่ทำให้ต้องเขียนไฟล์นี้ (25 ส.ค. 2026):
    vms_scraper.py เป็นทางสำรองตอน VMS Sales API ล่ม จึงแทบไม่เคยถูกเรียก
    ลิสต์ในนั้นตกรุ่นมาตั้งแต่ มิ.ย. ขาดไป 11 รายการ (YGH ทั้งหมด · MLP ·
    TF · PKM Ghost · MLBB) โดยไม่มีใครรู้ — ถ้า API ล่มวันที่ลูกค้าซื้อของ
    กลุ่มนั้น ยอดจะหายเงียบ ๆ

วิธีรัน
───────
    py -3 deploy/scraper/test_sku_mapping.py

ไม่ต้องต่อฐานข้อมูล ไม่ต้องมี env var — ดึงเฉพาะตัวฟังก์ชันออกมา exec
เพื่อไม่ให้ import ไปเปิด network หรืออ่าน os.environ

ชุดทดสอบ
────────
ชื่อสินค้าจริง 179 แบบที่เคยเจอใน machine_stock + sales (ณ 25 ส.ค. 2026)
ไม่ได้แต่งขึ้นเอง — เพราะบั๊กที่เกิดจริงคือ "หลังบ้านเปลี่ยนชื่อแล้วโค้ดตามไม่ทัน"

⚠️ แต่ละเคสผูกกับ **แบรนด์ที่ส่งชื่อนั้นมาจริง** เพราะสามแบรนด์ตั้งชื่อคนละแบบ:
       vms        "One Piece OP - 16 Pack"
       worldwide  "OP 15 BOX" · "EB 01 ซอง"
       payif      "Naturo Serie 1" (สะกดผิด — ห้ามแก้ regex ให้พึ่งการสะกดถูก)
   ถ้าไม่ผูกแบรนด์ เทสต์จะบังคับให้ mapper ของ VMS รู้จักชื่อของ payif
   ซึ่งไม่ใช่หน้าที่มัน แล้วจะเตือนหลอกจนคนเลิกเชื่อเทสต์
"""
import contextlib
import io
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = pathlib.Path(__file__).resolve().parents[2]

# (path, ชื่อฟังก์ชัน, คำอธิบาย, แบรนด์ที่ไฟล์นี้ต้องรองรับ)
MAPPERS = [
    ("deploy/agents/shared.py",                "map_product_to_sku", "ตัวช่วยของ agent",         {"vms"}),
    ("deploy/scraper/vms_stock_sync.py",       "map_product_to_sku", "VMS สต็อก",                {"vms"}),
    ("deploy/scraper/vms_sales_api.py",        "map_product_to_sku", "VMS ยอดขาย (API)",         {"vms"}),
    ("deploy/scraper/vms_scraper.py",          "map_sku",            "VMS ยอดขาย (ทางสำรอง)",    {"vms"}),
    ("deploy/scraper/worldwide_stock_sync.py", "map_goods_to_sku",   "WorldWide สต็อก",          {"worldwide"}),
    ("deploy/scraper/worldwide_sales_api.py",  "map_goods_to_sku",   "WorldWide ยอดขาย",         {"worldwide"}),
    ("deploy/scraper/payif_stock_sync.py",     "map_name_to_sku",    "Payif (สต็อก+ยอดขาย)",     {"payif"}),
]

CASES = [
    ("EB 01 ซอง", "EB 01", "worldwide"),
    ("One Piece EB - 01", "EB 01", "vms,worldwide"),
    ("One Piece EB - 01 Pack", "EB 01", "vms"),
    ("EB 02 ซอง", "EB 02", "worldwide"),
    ("One Piece EB - 02", "EB 02", "vms,worldwide"),
    ("One Piece EB - 02 Pack", "EB 02", "vms"),
    ("EB 03 ซอง", "EB 03", "worldwide"),
    ("One Piece EB - 03", "EB 03", "vms,worldwide"),
    ("One Piece EB - 03 Pack", "EB 03", "vms"),
    ("EB 04 ซอง", "EB 04", "worldwide"),
    ("ONE PIECE EB - 04 Pack", "EB 04", "payif"),
    ("One Piece EB - 04", "EB 04", "vms,worldwide"),
    ("One Piece EB - 04 Pack", "EB 04", "vms"),
    ("Dragon Ball FB - 01", "FB 01", "payif"),
    ("Dragonball FB - 01", "FB 01", "vms,worldwide"),
    ("Dragonball FB-01", "FB 01", "vms"),
    ("Dragonball FB-01 Box", "FB 01", "vms"),
    ("FB 01", "FB 01", "vms"),
    ("Dragon Ball FB - 02", "FB 02", "payif"),
    ("Dragon Ball FB 02", "FB 02", "vms"),
    ("Dragonball FB - 02", "FB 02", "vms,worldwide"),
    ("Dragonball FB - 02 Box", "FB 02", "vms"),
    ("FB 02", "FB 02", "vms"),
    ("Dragon Ball FB - 03", "FB 03", "payif"),
    ("Dragonball FB - 03", "FB 03", "vms,worldwide"),
    ("FB 03", "FB 03", "vms"),
    ("Dragon Ball FB - 04", "FB 04", "payif"),
    ("Dragonball FB - 04", "FB 04", "vms,worldwide"),
    ("FB 04", "FB 04", "vms"),
    ("Dragon Ball FB - 05", "FB 05", "payif"),
    ("Dragonball FB - 05", "FB 05", "vms,worldwide"),
    ("FB 05", "FB 05", "vms"),
    ("Dragon Ball FB - 06", "FB 06", "payif"),
    ("Dragonball FB - 06", "FB 06", "vms,worldwide"),
    ("Dragon Ball FB - 08", "FB 08", "payif"),
    ("Dragonball FB - 08", "FB 08", "vms,worldwide"),
    ("FB 08", "FB 08", "vms"),
    ("Dragon Ball FB - 09", "FB 09", "payif"),
    ("Dragonball FB - 09", "FB 09", "vms,worldwide"),
    ("MLBB Hand of Destiny 02", "MLBB HOD - 02", "vms,worldwide"),
    ("My Little Pony BP-01", "MLP BP-01", "vms,worldwide"),
    ("My Little Pony SEA02", "MLP SEA02", "vms,worldwide"),
    ("Naruto Jin", "NRT Jin - 1", "payif"),
    ("Naruto Jin - 1", "NRT Jin - 1", "vms,worldwide"),
    ("Naruto Jin1", "NRT Jin - 1", "vms"),
    ("Naruto Jin - 2", "NRT Jin - 2", "vms,worldwide"),
    ("Naruto Series - 01", "NRT Series - 01", "vms,worldwide"),
    ("Naruto Series1", "NRT Series - 01", "vms"),
    ("Naturo Serie 1", "NRT Series - 01", "payif"),
    ("Naruto Serie 2", "NRT Series - 02", "payif"),
    ("Naruto Series - 02", "NRT Series - 02", "vms,worldwide"),
    ("Naruto Series2", "NRT Series - 02", "vms"),
    ("ONE PIECE OP - 01", "OP 01", "vms"),
    ("OP 01 ซอง", "OP 01", "worldwide"),
    ("One Piece OP - 01", "OP 01", "worldwide"),
    ("One Piece OP - 01 Pack", "OP 01", "vms"),
    ("ONE PIECE OP - 02", "OP 02", "vms"),
    ("OP 02 ซอง", "OP 02", "worldwide"),
    ("One Piece OP - 02", "OP 02", "worldwide"),
    ("One Piece OP - 02 Pack", "OP 02", "vms"),
    ("ONE PIECE OP - 03", "OP 03", "vms"),
    ("ONE PIECE OP - 03 Pack", "OP 03", "payif"),
    ("OP 03 ซอง", "OP 03", "worldwide"),
    ("One Piece OP - 03", "OP 03", "worldwide"),
    ("One Piece OP - 03 Pack", "OP 03", "vms"),
    ("ONE PIECE OP - 04", "OP 04", "vms"),
    ("ONE PIECE OP - 04 Pack", "OP 04", "payif"),
    ("OP 04 ซอง", "OP 04", "worldwide"),
    ("One Piece OP - 04", "OP 04", "worldwide"),
    ("One Piece OP - 04 Pack", "OP 04", "vms"),
    ("ONE PIECE OP - 05", "OP 05", "vms"),
    ("OP 05 ซอง", "OP 05", "worldwide"),
    ("One Piece OP - 05", "OP 05", "worldwide"),
    ("One Piece OP - 05 Pack", "OP 05", "vms"),
    ("ONE PIECE OP - 06", "OP 06", "vms"),
    ("OP 06 ซอง", "OP 06", "worldwide"),
    ("One Piece OP - 06", "OP 06", "worldwide"),
    ("One Piece OP - 06 Pack", "OP 06", "vms"),
    ("ONE PIECE OP - 07", "OP 07", "vms"),
    ("ONE PIECE OP - 07 Pack", "OP 07", "payif"),
    ("OP 07 ซอง", "OP 07", "worldwide"),
    ("One Piece OP - 07", "OP 07", "worldwide"),
    ("One Piece OP - 07 Pack", "OP 07", "vms"),
    ("ONE PIECE OP - 08", "OP 08", "vms"),
    ("ONE PIECE OP - 08 Pack", "OP 08", "payif"),
    ("OP 08 BOX", "OP 08", "worldwide"),
    ("OP 08 ซอง", "OP 08", "worldwide"),
    ("One Piece OP - 08", "OP 08", "worldwide"),
    ("One Piece OP - 08 (Box)", "OP 08", "vms"),
    ("One Piece OP - 08 Box", "OP 08", "vms,worldwide"),
    ("One Piece OP - 08 Pack", "OP 08", "vms"),
    ("ONE PIECE OP - 09", "OP 09", "vms"),
    ("ONE PIECE OP - 09 Pack", "OP 09", "payif"),
    ("OP 09 BOX", "OP 09", "worldwide"),
    ("OP 09 ซอง", "OP 09", "worldwide"),
    ("One Piece OP - 09", "OP 09", "worldwide"),
    ("One Piece OP - 09 (Box)", "OP 09", "vms"),
    ("One Piece OP - 09 Box", "OP 09", "vms,worldwide"),
    ("One Piece OP - 09 Pack", "OP 09", "vms"),
    ("OP 10 BOX", "OP 10", "worldwide"),
    ("OP 10 ซอง", "OP 10", "worldwide"),
    ("One Piece OP - 10", "OP 10", "vms,worldwide"),
    ("One Piece OP - 10 Box", "OP 10", "vms,worldwide"),
    ("One Piece OP - 10 Pack", "OP 10", "vms"),
    ("ONE PIECE OP - 11 Box", "OP 11", "payif"),
    ("ONE PIECE OP - 11 Pack", "OP 11", "payif"),
    ("OP 11 BOX", "OP 11", "worldwide"),
    ("OP 11 ซอง", "OP 11", "worldwide"),
    ("One Piece OP - 11", "OP 11", "vms,worldwide"),
    ("One Piece OP - 11 Box", "OP 11", "vms,worldwide"),
    ("One Piece OP - 11 Pack", "OP 11", "vms"),
    ("ONE PIECE OP - 12 Pack", "OP 12", "payif"),
    ("OP 12 ซอง", "OP 12", "worldwide"),
    ("One Piece OP - 12", "OP 12", "vms,worldwide"),
    ("One Piece OP - 12 Pack", "OP 12", "vms"),
    ("One Piece OP-12", "OP 12", "worldwide"),
    ("ONE PIECE OP - 13 Pack", "OP 13", "payif"),
    ("OP 13 BOX", "OP 13", "worldwide"),
    ("OP 13 ซอง", "OP 13", "worldwide"),
    ("One Piece OP - 13", "OP 13", "vms,worldwide"),
    ("One Piece OP - 13 (Box)", "OP 13", "vms"),
    ("One Piece OP - 13 Box", "OP 13", "vms,worldwide"),
    ("One Piece OP - 13 Box PRO", "OP 13", "vms"),
    ("One Piece OP - 13 PRO", "OP 13", "vms"),
    ("One Piece OP - 13 Pack", "OP 13", "vms"),
    ("PRO One Piece OP-13 Box", "OP 13", "vms"),
    ("PRO One Piece OP-13 Pack", "OP 13", "vms"),
    ("ONE PIECE OP - 14 Pack", "OP 14", "payif"),
    ("OP 14 ซอง", "OP 14", "worldwide"),
    ("One Piece OP - 14", "OP 14", "vms,worldwide"),
    ("One Piece OP - 14 Pack", "OP 14", "vms"),
    ("One Piece OP-14", "OP 14", "worldwide"),
    ("ONE PIECE OP - 15 Pack", "OP 15", "payif"),
    ("OP 15 BOX", "OP 15", "worldwide"),
    ("OP 15 ซอง", "OP 15", "worldwide"),
    ("One Piece OP - 15", "OP 15", "vms,worldwide"),
    ("One Piece OP - 15 (Box)", "OP 15", "vms"),
    ("One Piece OP - 15 Box", "OP 15", "vms,worldwide"),
    ("One Piece OP - 15 Pack", "OP 15", "vms"),
    ("ONE PIECE OP - 16 Box", "OP 16", "payif"),
    ("ONE PIECE OP - 16 Pack", "OP 16", "payif"),
    ("One Piece OP - 16", "OP 16", "vms,worldwide"),
    ("One Piece OP - 16 Box", "OP 16", "vms,worldwide"),
    ("One Piece OP - 17", "OP 17", "vms,worldwide"),
    ("One Piece OP - 17 Box", "OP 17", "vms,worldwide"),
    ("POKEMON Dream EX", "PKM Dream EX", "vms"),
    ("POKEMON MAGA EX", "PKM Dream EX", "vms"),
    ("Pokemon  Dream EX", "PKM Dream EX", "payif"),
    ("Pokemon Dream EX", "PKM Dream EX", "worldwide"),
    ("Pokemon Ghost", "PKM Ghost", "vms,worldwide"),
    ("Pokemon M5 Abyss Eye", "PKM Ghost", "worldwide"),
    ("POKEMON NINJA", "PKM Ninja", "vms"),
    ("Pokemon Ninja", "PKM Ninja", "payif,worldwide"),
    ("ONE PIECE PRB - 01 Box", "PRB 01", "payif"),
    ("ONE PIECE PRB - 01 Pack", "PRB 01", "payif"),
    ("One Piece PRB - 01", "PRB 01", "vms,worldwide"),
    ("One Piece PRB - 01 Box", "PRB 01", "vms,worldwide"),
    ("PRB - 01 (Box)", "PRB 01", "vms"),
    ("PRB - 01 (Pack)", "PRB 01", "vms"),
    ("PRB 01 BOX", "PRB 01", "worldwide"),
    ("PRB 01 ซอง", "PRB 01", "worldwide"),
    ("One Piece PRB - 02", "PRB 02", "vms,worldwide"),
    ("One Piece PRB - 02 Box", "PRB 02", "vms,worldwide"),
    ("One Piece PRB-02", "PRB 02", "worldwide"),
    ("PRB - 02 (Pack)", "PRB 02", "vms"),
    ("PRB - 02 (ฺBox)", "PRB 02", "vms"),
    ("PRB 02 BOX", "PRB 02", "worldwide"),
    ("PRB 02 ซอง", "PRB 02", "worldwide"),
    ("SOLO Leveling", "SLL UA 51", "vms"),
    ("Solo Leveling UA 51", "SLL UA 51", "payif,worldwide"),
    ("Solo Leveling UA51", "SLL UA 51", "vms"),
    ("TF OVERDRIVE 01", "TF Overdrive 01", "vms,worldwide"),
    ("YU-GI-OH! Chaos Origins", "YGH Chaos Origins", "vms,worldwide"),
    ("Yuki Oh Chaos Origins", "YGH Chaos Origins", "worldwide"),
    ("YU-GI-OH! The Revals", "YGH The Revals", "vms,worldwide"),
    ("YU-GI-OH! The Rivals", "YGH The Revals", "worldwide"),
    ("Yu-Gi-Oh The Revals", "YGH The Revals", "payif"),
    ("Yuki oh Limited Over Collection", "YGH The Revals", "worldwide"),
    ("YU-GI-OH! UT01", "YGH UT01", "vms,worldwide"),
]


def load(path, fn):
    """ดึงเฉพาะฟังก์ชัน + ตัวแปรที่มันใช้ ออกมา exec — เลี่ยง side effect ตอน import

    ไฟล์พวกนี้อ่าน os.environ ตอน import ถ้า import ตรง ๆ จะพังทันทีถ้าไม่มี secret
    """
    src = (ROOT / path).read_text(encoding="utf-8")
    ns = {"re": re}
    for name in ("DIRECT_MAP", "SKU_MAP"):
        m = re.search(rf"^{name}\s*=\s*\{{.*?^\}}", src, re.S | re.M)
        if m:
            exec(m.group(0), ns)
    for helper in ("normalize", "collapse_dashes"):   # vms_scraper.map_sku เรียกสองตัวนี้
        m = re.search(rf"^def {helper}\(.*?(?=\n(?:def |class |@|\S))", src, re.S | re.M)
        if m:
            exec(m.group(0), ns)
    m = re.search(rf"^def {fn}\(.*?(?=\n(?:def |class |@|\S))", src, re.S | re.M)
    if not m:
        raise SystemExit(f"หาฟังก์ชัน {fn} ใน {path} ไม่เจอ")
    exec(m.group(0), ns)
    return ns[fn]


def main():
    print(f"ชุดทดสอบ {len(CASES)} ชื่อ · {len({s for _, s, _ in CASES})} SKU\n")
    failed = 0
    for path, fn, label, brands in MAPPERS:
        f = load(path, fn)
        mine = [(n, s) for n, s, b in CASES if brands & set(b.split(","))]
        miss, wrong = [], []
        for name, want in mine:
            try:
                # map_sku ของ vms_scraper print เตือนตอนหาไม่เจอ — กลบไว้ไม่ให้รก
                with contextlib.redirect_stdout(io.StringIO()):
                    got = f(name)
            except Exception as e:                      # noqa: BLE001
                wrong.append((name, f"ระเบิด: {e}", want))
                continue
            if got is None:
                miss.append((name, want))
            elif got != want:
                wrong.append((name, got, want))
        bad = len(miss) + len(wrong)
        failed += bad
        print(f"{'✅' if not bad else '❌'} {pathlib.Path(path).name:26} {label:24} "
              f"ผ่าน {len(mine)-bad}/{len(mine)}")
        # map ติดผิดตัวอันตรายกว่า map ไม่ติด — โชว์ก่อน
        for name, got, want in wrong:
            print(f"     ‼️  ติดผิดตัว {name!r} → {got!r} ควรเป็น {want!r}")
        for name, want in miss:
            print(f"     ⚠️  ไม่ติด    {name!r} ควรเป็น {want!r}")

    print()
    if failed:
        print(f"❌ แปลงชื่อไม่ถูก {failed} เคส — แก้ให้ครบทุกไฟล์ก่อน push")
        print("   (ดู skill dvx-sku · ห้ามแก้ไฟล์เดียวแล้วปล่อยที่เหลือ)")
        return 1
    print("✅ ทุกไฟล์แปลงชื่อถูกหมดในขอบเขตแบรนด์ของตัวเอง")
    return 0


if __name__ == "__main__":
    sys.exit(main())
