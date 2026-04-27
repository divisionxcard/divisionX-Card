"""
สร้าง Excel template สำหรับให้แอดมินกรอกข้อมูลตั้งต้นวัน Go-Live 1 พ.ค. 2026

3 sheets:
  1. Main_Stock     — สต็อกในคลังหลัก (21 SKU pre-filled · ใส่กล่อง+ซอง+ราคา)
  2. User_Stock     — สต็อกที่แอดมินแต่ละคนถือ (กรอกอิสระ)
  3. Machine_Stock  — สต็อกในตู้ (กรอกอิสระ · optional ถ้า VMS จะ sync ทีหลัง)

Output: golive_template.xlsx (overwrite ถ้ามีอยู่แล้ว)
Run:    py make_template.py
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


# ── ข้อมูลจาก prod (ณ 27 เม.ย. 2026) ─────────────────────────
SKUS = [
    # (sku_id, series, packs_per_box)
    ("OP 01", "OP", 12),
    ("OP 02", "OP", 12),
    ("OP 03", "OP", 12),
    ("OP 04", "OP", 12),
    ("OP 05", "OP", 12),
    ("OP 06", "OP", 12),
    ("OP 07", "OP", 12),
    ("OP 08", "OP", 12),
    ("OP 09", "OP", 12),
    ("OP 10", "OP", 12),
    ("OP 11", "OP", 12),
    ("OP 12", "OP", 12),
    ("OP 13", "OP", 12),
    ("OP 14", "OP", 12),
    ("OP 15", "OP", 12),
    ("EB 01", "EB", 12),
    ("EB 02", "EB", 12),
    ("EB 03", "EB", 12),
    ("EB 04", "EB", 12),
    ("PRB 01", "PRB", 10),
    ("PRB 02", "PRB", 10),
]

USERS = [
    # (username, display_name, role)
    ("divisionxcard",   "DivisionX Card",  "admin"),
    ("pornthep_sm1991", "T",               "admin"),
    ("aofwara66",       "AOFSEN",          "user"),
    ("power23n",        "พี่ M",          "user"),
    ("mzadiz1989",      "M-zadiz",         "user"),
]

MACHINES = [
    # (machine_id, name)
    ("chukes01", "ตู้ 1"),
    ("chukes02", "ตู้ 2"),
    ("chukes03", "ตู้ 3"),
    ("chukes04", "ตู้ 4"),
]


# ── สีและสไตล์ ───────────────────────────────────────────────
HEADER_FILL = PatternFill("solid", fgColor="2C5282")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
INFO_FILL   = PatternFill("solid", fgColor="EDF2F7")  # column readonly
INPUT_FILL  = PatternFill("solid", fgColor="FFFAF0")  # column ที่ต้องกรอก
FORMULA_FILL= PatternFill("solid", fgColor="E6FFFA")  # auto-compute
NOTE_FONT   = Font(italic=True, color="718096", size=9)
THIN        = Side(style="thin", color="CBD5E0")
BORDER      = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER      = Alignment(horizontal="center", vertical="center")
LEFT        = Alignment(horizontal="left", vertical="center")


def style_header(cell):
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = CENTER
    cell.border = BORDER


def make_main_stock(wb):
    ws = wb.create_sheet("Main_Stock")
    headers = [
        ("A", "sku_id",            INFO_FILL,    18),
        ("B", "series",            INFO_FILL,    10),
        ("C", "packs_per_box",     INFO_FILL,    14),
        ("D", "full_boxes",        INPUT_FILL,   13),
        ("E", "loose_packs",       INPUT_FILL,   13),
        ("F", "total_packs (auto)", FORMULA_FILL, 17),
        ("G", "unit_cost_per_pack",INPUT_FILL,   18),
        ("H", "note",              INPUT_FILL,   30),
    ]

    # Row 1: instructions
    ws.merge_cells("A1:H1")
    ws["A1"] = "📦 สต็อกใน Main (คลังหลัก) ณ เช้าวันที่ 1 พ.ค. 2026"
    ws["A1"].font = Font(bold=True, size=12, color="2C5282")
    ws["A1"].alignment = LEFT

    ws.merge_cells("A2:H2")
    ws["A2"] = ("กรอกเฉพาะ column สีครีม: full_boxes (กล่อง) · loose_packs (ซองที่ไม่ครบกล่อง) · "
                "unit_cost_per_pack (ราคาทุน/ซอง · ใบเสร็จล่าสุด) · note (ถ้ามี)")
    ws["A2"].font = NOTE_FONT
    ws["A2"].alignment = LEFT

    # Row 3: column headers
    HEADER_ROW = 3
    for col, label, fill, width in headers:
        c = ws[f"{col}{HEADER_ROW}"]
        c.value = label
        style_header(c)
        ws.column_dimensions[col].width = width

    # Data rows: pre-filled SKU info + formula for total_packs
    for i, (sku_id, series, ppb) in enumerate(SKUS):
        r = HEADER_ROW + 1 + i
        ws.cell(r, 1, sku_id).fill = INFO_FILL
        ws.cell(r, 2, series).fill = INFO_FILL
        ws.cell(r, 3, ppb).fill = INFO_FILL
        ws.cell(r, 4, 0).fill = INPUT_FILL
        ws.cell(r, 5, 0).fill = INPUT_FILL
        ws.cell(r, 6, f"=D{r}*C{r}+E{r}").fill = FORMULA_FILL
        ws.cell(r, 7, 0).fill = INPUT_FILL
        ws.cell(r, 8, "").fill = INPUT_FILL
        for col_idx in range(1, 9):
            ws.cell(r, col_idx).border = BORDER
            ws.cell(r, col_idx).alignment = CENTER if col_idx <= 7 else LEFT

    ws.freeze_panes = f"A{HEADER_ROW + 1}"


def make_user_stock(wb):
    ws = wb.create_sheet("User_Stock")
    headers = [
        ("A", "username",     INFO_FILL,    20),
        ("B", "display_name", INFO_FILL,    20),
        ("C", "sku_id",       INPUT_FILL,   12),
        ("D", "total_packs",  INPUT_FILL,   13),
        ("E", "note",         INPUT_FILL,   30),
    ]

    ws.merge_cells("A1:E1")
    ws["A1"] = "👤 สต็อกที่แอดมินแต่ละคนถือไว้ส่วนตัว · ณ เช้า 1 พ.ค. 2026"
    ws["A1"].font = Font(bold=True, size=12, color="2C5282")

    ws.merge_cells("A2:E2")
    ws["A2"] = ("เพิ่ม 1 row ต่อ (ผู้ใช้, SKU) · ใส่ username ตามตาราง User Reference ด้านล่าง · "
                "total_packs = ซอง · ไม่ต้องใส่ราคา (ราคาดึงจาก Main)")
    ws["A2"].font = NOTE_FONT

    HEADER_ROW = 4
    for col, label, fill, width in headers:
        c = ws[f"{col}{HEADER_ROW}"]
        c.value = label
        style_header(c)
        ws.column_dimensions[col].width = width

    # 50 empty input rows
    for r in range(HEADER_ROW + 1, HEADER_ROW + 51):
        for col_idx in range(1, 6):
            ws.cell(r, col_idx).fill = INPUT_FILL
            ws.cell(r, col_idx).border = BORDER

    # User reference table (ด้านล่าง)
    ref_start = HEADER_ROW + 53
    ws.cell(ref_start, 1, "👥 User Reference (อ้างอิง · อย่าแก้)").font = Font(bold=True, color="2C5282")
    ws.cell(ref_start + 1, 1, "username").fill = INFO_FILL
    ws.cell(ref_start + 1, 2, "display_name").fill = INFO_FILL
    ws.cell(ref_start + 1, 3, "role").fill = INFO_FILL
    for c in (1, 2, 3):
        ws.cell(ref_start + 1, c).font = Font(bold=True)
    for i, (u, dn, role) in enumerate(USERS):
        r = ref_start + 2 + i
        ws.cell(r, 1, u).fill = INFO_FILL
        ws.cell(r, 2, dn).fill = INFO_FILL
        ws.cell(r, 3, role).fill = INFO_FILL

    ws.freeze_panes = f"A{HEADER_ROW + 1}"


def make_machine_stock(wb):
    ws = wb.create_sheet("Machine_Stock")
    headers = [
        ("A", "machine_id",   INFO_FILL,  14),
        ("B", "machine_name", INFO_FILL,  14),
        ("C", "slot_number",  INPUT_FILL, 12),
        ("D", "sku_id",       INPUT_FILL, 12),
        ("E", "remain",       INPUT_FILL, 11),
        ("F", "max_capacity", INPUT_FILL, 14),
        ("G", "note",         INPUT_FILL, 30),
    ]

    ws.merge_cells("A1:G1")
    ws["A1"] = "🎰 สต็อกในตู้แต่ละช่อง · ณ เช้า 1 พ.ค. 2026"
    ws["A1"].font = Font(bold=True, size=12, color="2C5282")

    ws.merge_cells("A2:G2")
    ws["A2"] = ("optional sheet · ถ้าตู้ติด VMS sync ปกติแล้ว ไม่ต้องกรอกก็ได้ · "
                "ถ้ากรอก ระบบจะใช้บันทึกการเบิก Main → ตู้ตอนเริ่มใช้")
    ws["A2"].font = NOTE_FONT

    HEADER_ROW = 4
    for col, label, fill, width in headers:
        c = ws[f"{col}{HEADER_ROW}"]
        c.value = label
        style_header(c)
        ws.column_dimensions[col].width = width

    # 100 empty input rows (4 machines × ~25 slots)
    for r in range(HEADER_ROW + 1, HEADER_ROW + 101):
        for col_idx in range(1, 8):
            ws.cell(r, col_idx).fill = INPUT_FILL
            ws.cell(r, col_idx).border = BORDER

    # Machine reference (ด้านล่าง)
    ref_start = HEADER_ROW + 103
    ws.cell(ref_start, 1, "🎰 Machine Reference (อ้างอิง)").font = Font(bold=True, color="2C5282")
    ws.cell(ref_start + 1, 1, "machine_id").fill = INFO_FILL
    ws.cell(ref_start + 1, 2, "machine_name").fill = INFO_FILL
    for c in (1, 2):
        ws.cell(ref_start + 1, c).font = Font(bold=True)
    for i, (mid, name) in enumerate(MACHINES):
        r = ref_start + 2 + i
        ws.cell(r, 1, mid).fill = INFO_FILL
        ws.cell(r, 2, name).fill = INFO_FILL

    ws.freeze_panes = f"A{HEADER_ROW + 1}"


def make_readme(wb):
    ws = wb.create_sheet("README", 0)  # first tab
    ws.column_dimensions["A"].width = 110

    lines = [
        ("📋 DivisionX Card · Go-Live Template (1 พ.ค. 2026)", "title"),
        ("", None),
        ("วิธีใช้งานสั้น ๆ", "h2"),
        ("1) เปิด tab 'Main_Stock'  →  กรอก full_boxes / loose_packs / unit_cost_per_pack ครบทุก SKU", None),
        ("    (ถ้า SKU ไหนไม่มีของเลย ใส่ 0 ทั้ง full_boxes และ loose_packs)", "note"),
        ("2) เปิด tab 'User_Stock'  →  กรอก 1 row ต่อ (ผู้ใช้, SKU) ที่ผู้ใช้ถือไว้ส่วนตัว", None),
        ("    (ถ้าผู้ใช้คนไหนไม่ถือของ ข้ามได้)", "note"),
        ("3) เปิด tab 'Machine_Stock' → กรอกของในตู้ (optional · ข้ามได้ถ้า VMS sync ปกติ)", None),
        ("4) Save ไฟล์ → ส่งให้ทีมเทคโนแลก่อนเช้า 1 พ.ค.", None),
        ("", None),
        ("เงื่อนไขสำคัญ", "h2"),
        ("• full_boxes = กล่องที่ครบเต็ม · loose_packs = ซองที่ไม่ครบกล่อง", None),
        ("• packs_per_box: OP/EB = 12 · PRB = 10 (ระบบมีให้ดู column C)", None),
        ("• total_packs ระบบคำนวณให้อัตโนมัติ = full_boxes × packs_per_box + loose_packs", None),
        ("• unit_cost_per_pack: ใช้ราคาใบเสร็จล่าสุด (option B ที่ตกลงกัน)", None),
        ("• username ใน Sheet User_Stock ต้องตรงกับใน User Reference ทุกตัวอักษร", None),
        ("", None),
        ("ห้ามแก้", "h2"),
        ("• Sheet README นี้", None),
        ("• Column A, B, C ใน Main_Stock (sku_id / series / packs_per_box)", None),
        ("• User Reference ด้านล่าง User_Stock", None),
        ("• Machine Reference ด้านล่าง Machine_Stock", None),
        ("", None),
        ("ติดต่อ", "h2"),
        ("ถ้ามีคำถามหรือเจอช่องที่ไม่แน่ใจ → ทักเจ้าของระบบทันที (อย่าเดา)", None),
    ]

    for r, (text, kind) in enumerate(lines, start=1):
        c = ws.cell(r, 1, text)
        if kind == "title":
            c.font = Font(bold=True, size=16, color="1A365D")
        elif kind == "h2":
            c.font = Font(bold=True, size=12, color="2C5282")
        elif kind == "note":
            c.font = NOTE_FONT
        else:
            c.font = Font(size=11)
        c.alignment = LEFT


def main():
    wb = Workbook()
    wb.remove(wb.active)  # ลบ sheet default
    make_readme(wb)
    make_main_stock(wb)
    make_user_stock(wb)
    make_machine_stock(wb)

    out = "golive_template.xlsx"
    wb.save(out)
    print(f"OK wrote {out}")


if __name__ == "__main__":
    main()
