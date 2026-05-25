"""
generate_daily_template.py
สร้างไฟล์ Excel template สำหรับลงข้อมูลรายวัน
ใช้เป็น backup/manual log ถ้าระบบหลักล่ม · เทียบกลับ DB ภายหลังได้

Usage:
    # ตั้ง env vars ก่อน (หรือใส่ใน .env)
    export SUPABASE_URL=...
    export SUPABASE_SERVICE_KEY=...

    cd backend/tools
    python generate_daily_template.py

Output: DivisionX_Daily_Log_YYYY-MM-DD.xlsx (ในโฟลเดอร์เดียวกับ script)

Requirements: openpyxl, supabase, python-dotenv (มีใน deploy/scraper/requirements.txt)
"""

import os
import sys
import io
from datetime import datetime
from pathlib import Path

# กัน UnicodeEncodeError บน Windows console (cp1252) เวลา print emoji/ไทย
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

try:
    from dotenv import load_dotenv
    # โหลด .env จาก deploy/scraper/.env ถ้ามี (สำหรับ local dev)
    for env_path in [
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent.parent / "deploy" / "scraper" / ".env",
        Path(__file__).parent.parent.parent / "deploy" / ".env.local",
    ]:
        if env_path.exists():
            load_dotenv(env_path)
            break
except ImportError:
    pass  # dotenv optional

from supabase import create_client
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


# ── Config ─────────────────────────────────────────────────────────
ROWS_PER_SHEET = 200
REF_SHEET = "Reference"  # ไม่ใส่ emoji เพื่อให้ใช้ใน formula ได้ปลอดภัย


# ── Styles ─────────────────────────────────────────────────────────
HEADER_FONT = Font(name="Tahoma", size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="Tahoma", size=14, bold=True)
DEFAULT_FONT = Font(name="Tahoma", size=10)

COLOR = {
    "sales":     "0EA5E9",  # blue
    "stock":     "F59E0B",  # orange
    "refill":    "10B981",  # green
    "slot":      "8B5CF6",  # purple
    "claims":    "EF4444",  # red
    "snapshot":  "06B6D4",  # cyan
    "reference": "6366F1",  # indigo
    "cover":     "1E293B",  # slate
}

THIN_BORDER = Border(
    left=Side(border_style="thin", color="DDDDDD"),
    right=Side(border_style="thin", color="DDDDDD"),
    top=Side(border_style="thin", color="DDDDDD"),
    bottom=Side(border_style="thin", color="DDDDDD"),
)


def header_fill(hex_color):
    return PatternFill(start_color=hex_color, end_color=hex_color, fill_type="solid")


def style_header_row(ws, headers, fill_color, row=1):
    for i, h in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=i, value=h)
        cell.font = HEADER_FONT
        cell.fill = header_fill(fill_color)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = THIN_BORDER
    ws.row_dimensions[row].height = 30


def set_column_widths(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def add_empty_rows(ws, num_cols, num_rows, start_row=2):
    for r in range(start_row, start_row + num_rows):
        for c in range(1, num_cols + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = DEFAULT_FONT
            cell.border = THIN_BORDER


def add_dropdown(ws, col_range, source_formula):
    dv = DataValidation(type="list", formula1=source_formula, allow_blank=True)
    dv.add(col_range)
    ws.add_data_validation(dv)


# ── Fetch reference data ───────────────────────────────────────────
def fetch_reference_data():
    url = (os.environ.get("SUPABASE_URL")
           or os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
    key = (os.environ.get("SUPABASE_SERVICE_KEY")
           or os.environ.get("SUPABASE_KEY")
           or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"))  # fallback · อ่าน-only ก็ใช้ได้
    if not url or not key:
        sys.exit(
            "❌ ต้องตั้ง env vars:\n"
            "   • SUPABASE_URL (หรือ NEXT_PUBLIC_SUPABASE_URL)\n"
            "   • SUPABASE_SERVICE_KEY (หรือ NEXT_PUBLIC_SUPABASE_ANON_KEY)\n"
            "ใส่ใน deploy/.env.local หรือ export ใน terminal ก่อนรัน"
        )

    sb = create_client(url, key)
    skus = (sb.table("skus")
            .select("sku_id, name, sell_price, cost_price, avg_cost, packs_per_box, boxes_per_cotton, series")
            .eq("is_active", True)
            .order("sku_id")
            .execute().data) or []
    machines = (sb.table("machines")
                .select("machine_id, name, location, brand, status")
                .order("machine_id")
                .execute().data) or []
    return skus, machines


# ── Sheets ─────────────────────────────────────────────────────────
def add_cover_sheet(wb):
    ws = wb.create_sheet("00_คู่มือ", 0)

    ws["A1"] = "DivisionX Card — แบบฟอร์มลงข้อมูลรายวัน"
    ws["A1"].font = Font(name="Tahoma", size=18, bold=True, color="FFFFFF")
    ws["A1"].fill = header_fill(COLOR["cover"])
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells("A1:F1")
    ws.row_dimensions[1].height = 40

    info = [
        ("", ""),
        ("ผู้บันทึก", ""),
        ("วันที่", datetime.now().strftime("%Y-%m-%d")),
        ("กะ/ผลัด", ""),
        ("ตู้ที่รับผิดชอบ", ""),
        ("", ""),
        ("📖 วิธีใช้งาน", ""),
        ("", "1. กรอกข้อมูลในแต่ละ sheet แยกตามประเภทรายการ"),
        ("", "2. คอลัมน์ที่มี dropdown ให้เลือกค่าจาก list (อ้างอิงจาก sheet Reference)"),
        ("", "3. รายรับ / Ksher fee / Net / รวม ต้นทุน คำนวณอัตโนมัติเมื่อกรอก จำนวน + ราคา"),
        ("", "4. Ksher fee · VMS chukes = 1.5% · WW wwv = 0.5% (sheet ยอดขายคำนวณให้)"),
        ("", "5. ถ้าระบบหลักล่ม → ใช้ไฟล์นี้เป็น primary log จนกู้คืน · ตรงกลับเข้า DB เมื่อระบบกลับมา"),
        ("", "6. สำเนาไฟล์ + เปลี่ยนชื่อตามวันที่ก่อนเริ่มใช้ (เช่น DivisionX_Daily_Log_2026-05-26.xlsx)"),
        ("", ""),
        ("📑 รายการ Sheet", ""),
        ("", "01_ยอดขาย          · transaction การขายแต่ละครั้ง"),
        ("", "02_รับสินค้า        · log การรับของเข้าคลัง (stock_in)"),
        ("", "03_เบิกเติมตู้       · withdrawal จากคลังไปตู้ (stock_out)"),
        ("", "04_เปลี่ยนSlot      · เมื่อสลับสินค้าในช่อง"),
        ("", "05_เคลม            · refund / สูญหาย / ชำรุด"),
        ("", "06_สต็อกหน้าตู้      · snapshot ปัจจุบันของแต่ละช่อง"),
        ("", "Reference          · SKU + Machine list (read-only · regenerate เมื่อมี SKU/ตู้ใหม่)"),
        ("", ""),
        ("⚠️ ข้อควรระวัง", ""),
        ("", "• อย่าแก้ค่าใน sheet Reference โดยตรง · ถ้าต้องอัพเดท ให้รัน script ใหม่"),
        ("", "• คอลัมน์สีเทาเป็นค่า auto-calc · อย่ากรอกทับ"),
        ("", "• ตู้ chukes** = แบรนด์ VMS · ตู้ wwv** = แบรนด์ Worldwide"),
    ]
    for idx, (label, val) in enumerate(info, start=2):
        ws.cell(row=idx, column=1, value=label).font = Font(name="Tahoma", size=11, bold=True)
        ws.cell(row=idx, column=2, value=val).font = DEFAULT_FONT
        ws.row_dimensions[idx].height = 18

    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 90
    return ws


def add_reference_sheet(wb, skus, machines):
    ws = wb.create_sheet(REF_SHEET)

    # ── SKU section (columns A-H) ──────────────────────────────────
    sku_headers = ["SKU ID", "ชื่อสินค้า", "Series", "ราคาขาย", "ราคาทุน", "Avg Cost", "Packs/Box", "Boxes/Cotton"]
    style_header_row(ws, sku_headers, COLOR["reference"], row=1)
    for i, sku in enumerate(skus, start=2):
        ws.cell(row=i, column=1, value=sku["sku_id"]).font = DEFAULT_FONT
        ws.cell(row=i, column=2, value=sku.get("name") or "").font = DEFAULT_FONT
        ws.cell(row=i, column=3, value=sku.get("series") or "").font = DEFAULT_FONT
        ws.cell(row=i, column=4, value=sku.get("sell_price")).font = DEFAULT_FONT
        ws.cell(row=i, column=5, value=sku.get("cost_price")).font = DEFAULT_FONT
        ws.cell(row=i, column=6, value=sku.get("avg_cost")).font = DEFAULT_FONT
        ws.cell(row=i, column=7, value=sku.get("packs_per_box")).font = DEFAULT_FONT
        ws.cell(row=i, column=8, value=sku.get("boxes_per_cotton")).font = DEFAULT_FONT

    set_column_widths(ws, [14, 32, 8, 12, 12, 12, 12, 14])

    # ── Machine section (columns J-N) ──────────────────────────────
    mach_start = 10
    machine_headers = ["Machine ID", "ชื่อตู้", "สาขา", "Brand", "Status"]
    for i, h in enumerate(machine_headers, start=mach_start):
        cell = ws.cell(row=1, column=i, value=h)
        cell.font = HEADER_FONT
        cell.fill = header_fill(COLOR["reference"])
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = THIN_BORDER

    for i, m in enumerate(machines, start=2):
        ws.cell(row=i, column=mach_start, value=m["machine_id"]).font = DEFAULT_FONT
        ws.cell(row=i, column=mach_start + 1, value=m.get("name") or "").font = DEFAULT_FONT
        ws.cell(row=i, column=mach_start + 2, value=m.get("location") or "").font = DEFAULT_FONT
        ws.cell(row=i, column=mach_start + 3, value=m.get("brand") or "").font = DEFAULT_FONT
        ws.cell(row=i, column=mach_start + 4, value=m.get("status") or "").font = DEFAULT_FONT

    for col in range(mach_start, mach_start + 5):
        ws.column_dimensions[get_column_letter(col)].width = 20

    ws.freeze_panes = "A2"
    return ws


# Helper · สร้าง formula range สำหรับ dropdown
def sku_range(n_skus):
    return f"={REF_SHEET}!$A$2:$A${n_skus + 1}"

def machine_range(n_machines):
    return f"={REF_SHEET}!$J$2:$J${n_machines + 1}"


# ── 01_ยอดขาย ─────────────────────────────────────────────────────
def add_sales_sheet(wb, n_skus, n_machines):
    ws = wb.create_sheet("01_ยอดขาย")
    headers = ["วันที่/เวลา", "ตู้", "ช่อง", "SKU", "ชื่อสินค้า",
               "จำนวน", "หน่วย", "ราคา/หน่วย", "รายรับ (gross)",
               "Ksher fee", "Net", "Transaction ID", "หมายเหตุ"]
    style_header_row(ws, headers, COLOR["sales"])
    set_column_widths(ws, [18, 14, 8, 14, 30, 10, 10, 12, 14, 12, 14, 22, 25])
    add_empty_rows(ws, len(headers), ROWS_PER_SHEET)

    # Formula: รายรับ = F * H ; Ksher fee % ตาม brand ; Net = gross − fee
    for r in range(2, ROWS_PER_SHEET + 2):
        ws.cell(row=r, column=9).value = f'=IF(AND(F{r}<>"",H{r}<>""),F{r}*H{r},"")'
        ws.cell(row=r, column=10).value = (
            f'=IF(I{r}<>"",I{r}*IF(LEFT(B{r},6)="chukes",0.015,'
            f'IF(LEFT(B{r},3)="wwv",0.005,0.015)),"")'
        )
        ws.cell(row=r, column=11).value = f'=IF(I{r}<>"",I{r}-J{r},"")'
        # สีเทาบนคอลัมน์ auto-calc
        for c in (9, 10, 11):
            ws.cell(row=r, column=c).fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    add_dropdown(ws, f"B2:B{ROWS_PER_SHEET + 1}", machine_range(n_machines))
    add_dropdown(ws, f"D2:D{ROWS_PER_SHEET + 1}", sku_range(n_skus))
    add_dropdown(ws, f"G2:G{ROWS_PER_SHEET + 1}", '"ซอง,กล่อง"')

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ROWS_PER_SHEET + 1}"
    return ws


# ── 02_รับสินค้า ──────────────────────────────────────────────────
def add_stock_in_sheet(wb, n_skus):
    ws = wb.create_sheet("02_รับสินค้า")
    headers = ["วันที่", "Lot Number", "SKU", "ชื่อสินค้า",
               "จำนวน", "หน่วย", "ราคาทุน/หน่วย", "รวมต้นทุน",
               "ผู้รับ", "หมายเหตุ"]
    style_header_row(ws, headers, COLOR["stock"])
    set_column_widths(ws, [14, 24, 14, 30, 10, 10, 14, 14, 18, 25])
    add_empty_rows(ws, len(headers), ROWS_PER_SHEET)

    for r in range(2, ROWS_PER_SHEET + 2):
        ws.cell(row=r, column=8).value = f'=IF(AND(E{r}<>"",G{r}<>""),E{r}*G{r},"")'
        ws.cell(row=r, column=8).fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    add_dropdown(ws, f"C2:C{ROWS_PER_SHEET + 1}", sku_range(n_skus))
    add_dropdown(ws, f"F2:F{ROWS_PER_SHEET + 1}", '"ซอง,กล่อง,Cotton"')

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ROWS_PER_SHEET + 1}"
    return ws


# ── 03_เบิกเติมตู้ ────────────────────────────────────────────────
def add_stock_out_sheet(wb, n_skus, n_machines):
    ws = wb.create_sheet("03_เบิกเติมตู้")
    headers = ["วันที่/เวลา", "From Lot", "ตู้", "ช่อง", "SKU",
               "ชื่อสินค้า", "จำนวน", "หน่วย", "ผู้เบิก", "หมายเหตุ"]
    style_header_row(ws, headers, COLOR["refill"])
    set_column_widths(ws, [18, 24, 14, 8, 14, 30, 10, 10, 18, 25])
    add_empty_rows(ws, len(headers), ROWS_PER_SHEET)

    add_dropdown(ws, f"C2:C{ROWS_PER_SHEET + 1}", machine_range(n_machines))
    add_dropdown(ws, f"E2:E{ROWS_PER_SHEET + 1}", sku_range(n_skus))
    add_dropdown(ws, f"H2:H{ROWS_PER_SHEET + 1}", '"ซอง,กล่อง"')

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ROWS_PER_SHEET + 1}"
    return ws


# ── 04_เปลี่ยนSlot ────────────────────────────────────────────────
def add_slot_change_sheet(wb, n_skus, n_machines):
    ws = wb.create_sheet("04_เปลี่ยนSlot")
    headers = ["วันที่/เวลา", "ตู้", "ช่อง", "SKU เดิม", "ชื่อสินค้าเดิม",
               "จำนวนก่อน", "SKU ใหม่", "ชื่อสินค้าใหม่",
               "จำนวนหลัง", "ความจุ", "ผู้เปลี่ยน", "หมายเหตุ"]
    style_header_row(ws, headers, COLOR["slot"])
    set_column_widths(ws, [18, 14, 8, 14, 26, 12, 14, 26, 12, 10, 18, 25])
    add_empty_rows(ws, len(headers), ROWS_PER_SHEET)

    add_dropdown(ws, f"B2:B{ROWS_PER_SHEET + 1}", machine_range(n_machines))
    add_dropdown(ws, f"D2:D{ROWS_PER_SHEET + 1}", sku_range(n_skus))
    add_dropdown(ws, f"G2:G{ROWS_PER_SHEET + 1}", sku_range(n_skus))

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ROWS_PER_SHEET + 1}"
    return ws


# ── 05_เคลม ───────────────────────────────────────────────────────
def add_claims_sheet(wb, n_skus, n_machines):
    ws = wb.create_sheet("05_เคลม")
    headers = ["วันที่", "ตู้", "SKU", "ชื่อสินค้า", "จำนวน",
               "หน่วย", "ยอดคืน (บาท)", "สาเหตุ", "สถานะสินค้า",
               "ผู้บันทึก", "หมายเหตุ"]
    style_header_row(ws, headers, COLOR["claims"])
    set_column_widths(ws, [14, 14, 14, 30, 10, 10, 14, 24, 16, 18, 25])
    add_empty_rows(ws, len(headers), ROWS_PER_SHEET)

    add_dropdown(ws, f"B2:B{ROWS_PER_SHEET + 1}", machine_range(n_machines))
    add_dropdown(ws, f"C2:C{ROWS_PER_SHEET + 1}", sku_range(n_skus))
    add_dropdown(ws, f"F2:F{ROWS_PER_SHEET + 1}", '"ซอง,กล่อง"')
    add_dropdown(ws, f"I2:I{ROWS_PER_SHEET + 1}", '"คืนสต็อก,ชำรุด,สูญหาย"')

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ROWS_PER_SHEET + 1}"
    return ws


# ── 06_สต็อกหน้าตู้ ──────────────────────────────────────────────
def add_machine_stock_sheet(wb, n_skus, n_machines):
    ws = wb.create_sheet("06_สต็อกหน้าตู้")
    headers = ["ตู้", "ช่อง", "SKU", "ชื่อสินค้า", "ประเภท",
               "คงเหลือ", "ความจุ", "% เต็ม", "อัพเดทล่าสุด", "หมายเหตุ"]
    style_header_row(ws, headers, COLOR["snapshot"])
    set_column_widths(ws, [14, 8, 14, 30, 12, 10, 10, 10, 18, 25])
    add_empty_rows(ws, len(headers), ROWS_PER_SHEET)

    for r in range(2, ROWS_PER_SHEET + 2):
        ws.cell(row=r, column=8).value = f'=IF(AND(F{r}<>"",G{r}<>"",G{r}>0),F{r}/G{r},"")'
        ws.cell(row=r, column=8).number_format = "0%"
        ws.cell(row=r, column=8).fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    add_dropdown(ws, f"A2:A{ROWS_PER_SHEET + 1}", machine_range(n_machines))
    add_dropdown(ws, f"C2:C{ROWS_PER_SHEET + 1}", sku_range(n_skus))
    add_dropdown(ws, f"E2:E{ROWS_PER_SHEET + 1}", '"pack,box"')

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ROWS_PER_SHEET + 1}"
    return ws


# ── Main ───────────────────────────────────────────────────────────
def main():
    print("📥 Fetching SKUs and Machines from Supabase...")
    skus, machines = fetch_reference_data()
    n_skus, n_machines = len(skus), len(machines)
    print(f"   • {n_skus} SKUs · {n_machines} machines")

    print("📝 Building workbook...")
    wb = Workbook()
    wb.remove(wb.active)  # ลบ default sheet

    # Cover → entry sheets → Reference (ลำดับใน tab)
    add_cover_sheet(wb)
    add_sales_sheet(wb, n_skus, n_machines)
    add_stock_in_sheet(wb, n_skus)
    add_stock_out_sheet(wb, n_skus, n_machines)
    add_slot_change_sheet(wb, n_skus, n_machines)
    add_claims_sheet(wb, n_skus, n_machines)
    add_machine_stock_sheet(wb, n_skus, n_machines)
    add_reference_sheet(wb, skus, machines)

    date_str = datetime.now().strftime("%Y-%m-%d")
    out_path = Path(__file__).parent / f"DivisionX_Daily_Log_{date_str}.xlsx"
    wb.save(out_path)
    print(f"✅ Saved: {out_path}")
    print(f"   ขนาด: {out_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
