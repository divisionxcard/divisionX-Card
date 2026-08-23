"""แยกว่ารายการหนึ่ง ๆ ขายเป็น "ซองเดี่ยว" หรือ "ยกกล่อง"

ข้อมูลนี้มีอยู่ในชื่อสินค้าดิบมาตลอด แต่ไม่เคยถูกดึงออกมาเป็นคอลัมน์
sku_id เดียวกันใช้ทั้งสองแบบ ("One Piece OP - 16" กับ "One Piece OP - 16 Box"
ต่างเป็น sku_id = 'OP 16') รายงานทุกตัวจึงเอากล่องกับซองมาบวกกันตรง ๆ

⚠️ quantity_sold ของรายการกล่องคือ **จำนวนซองในกล่อง** (24 หรือ 10) ไม่ใช่จำนวนกล่อง
   ตรวจแล้วสม่ำเสมอทุกแบรนด์ — ยอดซองรวมและยอดเงินรวมเดิมถูกต้องอยู่แล้ว
   คอลัมน์ unit มีไว้ให้ "แยกดู" ไม่ได้มาแก้ตัวเลขที่ผิด

รูปแบบชื่อที่เจอจริงในฐานข้อมูล (จาก 185 ชื่อ):
    One Piece OP - 16 Box · One Piece OP - 08 (Box) · OP 15 BOX
    One Piece OP - 13 Box PRO · PRO One Piece OP-13 Box
    PRB - 02 (ฺBox)   ← มีอักขระ U+0E3A หลงมาก่อนคำว่า Box (ต้นทางพิมพ์ผิด)
ทั้งหมดจับได้ด้วยการหาคำว่า "box" แบบไม่สนตัวพิมพ์ — อย่าใช้ endswith
"""
import re

_BOX = re.compile(r"box", re.I)


def unit_of(product_name):
    """คืน 'box' ถ้าชื่อสินค้าบอกว่าเป็นกล่อง ไม่งั้น 'pack'"""
    return "box" if product_name and _BOX.search(str(product_name)) else "pack"


def add_unit(rows, name_key):
    """เติมคีย์ unit ให้ทุกแถวก่อน insert

    rows: list ของ dict ที่จะส่งเข้า Supabase
    name_key: ชื่อคีย์ที่เก็บชื่อสินค้าดิบ ('product_name_raw' หรือ 'product_name')

    ⚠️ batch insert ของ PostgREST ต้องมีคีย์ครบเท่ากันทุก object
       จึงต้องเติมให้ **ทุกแถว** ไม่ใช่เฉพาะแถวที่เป็นกล่อง
    """
    for r in rows:
        r["unit"] = unit_of(r.get(name_key))
    return rows


def strip_unit(rows):
    """ถอดคีย์ unit ออก — ใช้ตอน fallback ถ้าฐานข้อมูลยังไม่มีคอลัมน์นี้"""
    for r in rows:
        r.pop("unit", None)
    return rows


def missing_unit_column(err):
    """ดูว่า error จาก Supabase เกิดจากยังไม่ได้รัน migration 068 หรือเปล่า

    ต้องเช็กให้แคบ — ถ้าจับกว้างไป error อื่นจะถูกกลืนแล้วเดินต่อเงียบ ๆ
    (บทเรียนจาก dvx-image กฎข้อ 1: fallback ที่กลืน error ทำให้ไล่บั๊กไม่เจอเป็นเดือน)
    """
    s = str(err).lower()
    return "unit" in s and any(k in s for k in ("column", "schema cache", "pgrst204", "42703"))


_warned = False


def upsert_sales(supabase, batch, table="sales", on_conflict="sale_key",
                 ignore_duplicates=True):
    """upsert — ถ้าฐานข้อมูลยังไม่มีคอลัมน์ unit ให้ถอยไปบันทึกแบบเดิม

    ทำแบบนี้เพื่อให้ลำดับ deploy ไม่สำคัญ: push โค้ดก่อนรัน migration ก็ไม่พัง
    ซิงค์กลางคืนรันจาก origin/main ถ้าพังคือข้อมูลวันนั้นหายทั้งวัน

    ⚠️⚠️ ignore_duplicates ต่างกันตามตาราง — ห้ามใช้ค่าเดียวกันทั้งสองที่

      sales          = True  ตั้งใจ · กันเขียนทับ product_name/sku_id ของประวัติเก่า
                             หลังแอดมินเปลี่ยนสินค้าในช่อง (แถวเก่าต้องคงชื่อ ณ ตอนขาย)
      machine_stock  = False ต้องอัปเดต · แถวคือ "สภาพช่องตอนนี้" ไม่ใช่ประวัติ

    เคสจริง 24 ส.ค. 2026: ตัวช่วยนี้เคยฮาร์ดโค้ด True แล้วเอาไปใช้กับ machine_stock ด้วย
    ทุกช่องมีอยู่แล้ว upsert จึงถูกข้ามทั้งหมด — ไม่มี error, workflow ขึ้นเขียว,
    log พิมพ์ว่า "บันทึกสำเร็จ 240 slots" แต่ข้อมูลค้างอยู่ที่เดิม 3 วัน
    จนแอดมินไปนับของหน้าตู้เองแล้วเทียบกับรายงานถึงรู้
    """
    global _warned
    try:
        return supabase.table(table).upsert(
            batch, on_conflict=on_conflict, ignore_duplicates=ignore_duplicates).execute()
    except Exception as e:
        if not missing_unit_column(e):
            raise
        if not _warned:
            print("⚠️ ฐานข้อมูลยังไม่มีคอลัมน์ unit — ยังไม่ได้รัน migration 068")
            print("   บันทึกแบบไม่มี unit ไปก่อน · รัน migration แล้วค่อยเติมย้อนหลังจากชื่อสินค้าได้")
            _warned = True
        return supabase.table(table).upsert(
            strip_unit(batch), on_conflict=on_conflict,
            ignore_duplicates=ignore_duplicates).execute()
