"""
Shared helpers สำหรับ DivisionX agents
- map_product_to_sku: แปลงชื่อสินค้า VMS → SKU ID (canonical version จาก vms_stock_sync.py)
- is_box_slot: ตรวจว่า slot นี้เก็บเป็นกล่องไหม
- get_active_machines: ดึงรายชื่อตู้ active จาก database
"""
import re
from supabase import Client


def map_product_to_sku(product_name: str) -> str | None:
    """แปลงชื่อสินค้า VMS → SKU ID เช่น 'One Piece OP - 01 Pack' → 'OP 01'

    คัดลอกจาก deploy/scraper/vms_stock_sync.py — ต้อง sync กันถ้ามีการเพิ่ม SKU ใหม่
    """
    if not product_name:
        return None
    name = product_name.lower().strip()

    # B29 standalone (Dragonball special, ไม่มี prefix) — check ก่อน
    if re.search(r'\bb29\b', name):
        return "B29"
    # OP series: "one piece op - 01 pack" / "one piece op - 01 (box)"
    m = re.search(r'\bop\s*[-–]?\s*(\d+)', name)
    if m:
        return f"OP {m.group(1).zfill(2)}"
    # PRB series: "prb - 01 (pack)"
    m = re.search(r'prb\s*[-–]\s*(\d+)', name)
    if m:
        return f"PRB {m.group(1).zfill(2)}"
    # EB series: "one piece eb - 01 pack"
    m = re.search(r'eb\s*[-–]\s*(\d+)', name)
    if m:
        return f"EB {m.group(1).zfill(2)}"
    # FB (Dragonball Fusion World) — "fb - 01"
    m = re.search(r'fb\s*[-–]?\s*(\d+)', name)
    if m:
        return f"FB {m.group(1).zfill(2)}"
    # Naruto Jin — "naruto jin - 1" / "naruto jin2" (เลขเดี่ยว ไม่ zero-pad ตาม sku เดิม)
    m = re.search(r'naruto\s*jin\s*[-–]?\s*(\d+)', name)
    if m:
        return f"NRT Jin - {int(m.group(1))}"
    # MLBB Hand of Destiny — "mlbb hand of destiny 02"
    m = re.search(r'hand\s*of\s*destiny\s*[-–]?\s*(\d+)', name)
    if m:
        return f"MLBB HOD - {m.group(1).zfill(2)}"
    # Fallback: direct map สำหรับ Naruto/Pokemon/SOLO
    for key, sku in (
        ("naruto series - 02", "NRT Series - 02"),
        ("naruto series - 01", "NRT Series - 01"),
        ("naruto jin - 1",     "NRT Jin - 1"),
        ("pokemon dream ex",   "PKM Dream EX"),
        ("pokemon ninja",      "PKM Ninja"),
        ("solo leveling ua 51","SLL UA 51"),
        ("naruto series2",  "NRT Series - 02"),
        ("naruto series1",  "NRT Series - 01"),
        ("naruto jin1",     "NRT Jin - 1"),
        ("pokemon maga ex", "PKM Dream EX"),
        ("solo leveling",   "SLL UA 51"),
        # ── mirror vms_stock_sync.py ──
        ("pokemon ghost",   "PKM Ghost"),
        ("abyss",           "PKM Ghost"),   # 2026-08-13 เปลี่ยนชื่อเป็น M5 Abyss Eye
        ("chaos origins",   "YGH Chaos Origins"),
        ("limited over",    "YGH The Revals"),
        ("the revals",      "YGH The Revals"),
        ("the rivals",      "YGH The Revals"),  # WW แก้คำสะกด · chukes ยังใช้ Revals
        ("the heroes",      "YGH The Heroes"),
        # ── สินค้าใหม่ 2026-08-13 · MLP มี 2 ไลน์ (SEA/BP) ดูคำเตือนใน vms_stock_sync.py ──
        ("pony sea02",      "MLP SEA02"),
        ("pony bp-01",      "MLP BP-01"),
        ("overdrive",       "TF Overdrive 01"),
        ("ut01",            "YGH UT01"),
    ):
        if key in name:
            return sku
    return None


def is_box_slot(product_name: str) -> bool:
    """ตรวจว่า slot นี้เก็บเป็นกล่อง (1 unit = N packs) ไหม

    VMS ใส่คำว่า "Box" ในชื่อสินค้าถ้าเป็นกล่อง เช่น "One Piece OP - 13 Box"
    """
    if not product_name:
        return False
    return "box" in product_name.lower()


def get_active_machines(sb: Client) -> list[str]:
    """ดึง machine_id ของตู้ active ทั้งหมด"""
    rows = sb.table("machines").select("machine_id").eq("status", "active").execute().data
    return [r["machine_id"] for r in rows]


# ── Ksher Payment Gateway Fees ────────────────────────────────────────
# DivisionX ใช้ Ksher เป็น payment gateway สำหรับทั้ง 2 brand
# ค่าธรรมเนียมต่างกันเพราะสัญญาแยกกัน
KSHER_FEE_BY_BRAND: dict[str, float] = {
    "vms":       0.015,  # 1.5% สำหรับตู้ chukes (Inboxcorp VMS)
    "worldwide": 0.005,  # 0.5% สำหรับตู้ wwv (Worldwide Vending)
}
DEFAULT_KSHER_FEE = 0.015  # default conservative ถ้าไม่รู้ brand


def get_machine_brands(sb: Client) -> dict[str, str]:
    """ดึง mapping machine_id → brand เช่น {'chukes01': 'vms', 'wwv01': 'worldwide'}"""
    rows = sb.table("machines").select("machine_id, brand").execute().data
    return {r["machine_id"]: (r.get("brand") or "vms") for r in rows}


def ksher_fee_pct(brand: str) -> float:
    """คืนค่าธรรมเนียม Ksher ตาม brand (เป็นสัดส่วน เช่น 0.015 = 1.5%)"""
    return KSHER_FEE_BY_BRAND.get(brand, DEFAULT_KSHER_FEE)


def calc_ksher_fee(gross_amount: float, brand: str) -> float:
    """คำนวณค่าธรรมเนียม Ksher จากยอด gross"""
    return gross_amount * ksher_fee_pct(brand)
