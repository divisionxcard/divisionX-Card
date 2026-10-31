"""
DivisionX MCP Server — เปิดข้อมูลตู้กดการ์ดให้ AI agent ถาม-ตอบได้อิสระ

ใช้ได้กับทั้ง OpenClaw และ Claude Code (stdio transport)
ชั้นข้อมูลอยู่ที่ deploy/agents/dvx_data.py — ตัวนี้เป็นแค่เปลือก MCP

tools ที่เปิด:
  อ่านอย่างเดียว  list_machines · get_sales (มีกำไร) · compare_sales · get_unsold_skus ·
                  get_stock · get_restock_alerts · get_sync_status
  เปลี่ยนข้อมูล    sync_data (สั่ง GitHub Actions ดึงข้อมูลใหม่)

รัน:
  py deploy/mcp/dvx_mcp_server.py          # stdio · ให้ MCP client เรียก
ตั้งค่า:
  ดู deploy/mcp/README.md
"""
import os
import sys
from datetime import datetime

# ให้ import โมดูลใน deploy/agents/ ได้ (ชั้นข้อมูล + ตัวสั่ง workflow)
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(_ROOT, "deploy", "agents"))

import dvx_data as data                                     # noqa: E402
import trigger_workflow as tw                               # noqa: E402
from mcp.server import MCPServer                            # noqa: E402
from mcp.types import ToolAnnotations                        # noqa: E402

READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False)
WRITES = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=True)

server = MCPServer(
    name="divisionx",
    version="1.0.0",
    instructions=(
        "ข้อมูลตู้กดการ์ดสะสม DivisionX (One Piece / Pokemon / Dragon Ball ฯลฯ) "
        "ในห้างทั่วกรุงเทพและปริมณฑล\n\n"
        "ใช้ get_restock_alerts เมื่อผู้ใช้ถามเชิงตัดสินใจว่า 'ต้องเติมอะไร' — "
        "มันคิดความเร็วขายให้แล้ว ส่วน get_stock คือข้อมูลดิบรายช่อง\n"
        "ตัวเลขเชิงวิเคราะห์ให้ tool คิดให้เสร็จ อย่าคิดเลขเอง: กำไร = get_sales (profit) · "
        "เทียบช่วงเวลา = compare_sales · ขายไม่ออก = get_unsold_skus\n"
        "บอทในเครื่องเจ้าของดึงยอดขาย 00:10 (ของเมื่อวานครบวัน) + 10:00 — ยอดวันนี้ยังไม่ครบวัน "
        "ถ้าถามยอดวันนี้แล้วได้น้อย/0 อย่าสรุปว่าขายไม่ได้ · อ่าน data_status / notes ที่ tool ส่งมาเสมอ\n"
        "ทุกวันที่เป็นเวลาไทย (UTC+7) อยู่แล้ว ไม่ต้องแปลง timezone เอง"
    ),
)


def _fail(e):
    """แปลง exception เป็นข้อความที่ agent เอาไปบอกผู้ใช้ต่อได้"""
    return {"error": str(e)}


# ── อ่านอย่างเดียว ───────────────────────────────────────────────────────
@server.tool(
    description="รายชื่อตู้ทั้งหมด พร้อม machine_id, สาขา และยี่ห้อตู้ "
                "(vms / worldwide / payif) — เรียกก่อนเมื่อไม่แน่ใจว่ามีตู้อะไรบ้าง",
    annotations=READ_ONLY,
)
def list_machines(active_only: bool = True) -> dict:
    """
    Args:
        active_only: เอาเฉพาะตู้ที่เปิดใช้งานอยู่ (default True)
    """
    try:
        ms = data.load_machines(active_only=active_only)
        return {"count": len(ms), "machines": [{
            "machine_id": m["machine_id"], "name": data.machine_label(m),
            "location": m.get("location"), "brand": m.get("brand"),
            "status": m.get("status"),
        } for m in ms]}
    except Exception as e:
        return _fail(e)


@server.tool(
    description="ยอดขาย + กำไรสุทธิ — รายรับ จำนวนซอง บิล ราคาเฉลี่ยต่อซอง และกำไร "
                "(สูตรเดียวกับสรุปยอดบอท DVX Job ทุกเช้า: หักค่าธรรมเนียม Ksher · ต้นทุนต่อซองตามวันที่ขาย · "
                "เงินคืนเคลม) แยกได้ตามตู้ สาขา สินค้า ค่าย รายวัน วันในสัปดาห์ หรือรายชั่วโมง\n"
                "ถามเรื่องกำไรให้ใช้ profit.net_profit จาก tool นี้เท่านั้น — ห้ามประมาณเป็น % ของยอดขายเอง\n"
                "ถามเป็นสาขา ให้ส่งชื่อสาขาตรง ๆ (machine='บางกะปิ') อย่าแปลงเป็นรหัสตู้เอง — "
                "tool รวมทุกตู้ของสาขาที่เปิดอยู่ในช่วงนั้นให้ (รวมตู้ที่ปิดไปแล้ว) · "
                "เทียบหลายตู้ในช่วงเดียวกัน: machine='wwv05,wwv08' group_by=machine · "
                "เทียบสองช่วงเวลาให้ใช้ compare_sales\n"
                "days = จำนวนวันที่ครบวันล่าสุด จบที่เมื่อวาน (วันนี้ยังขายอยู่ ยอดไม่ครบ) · "
                "อ่าน data_status.notes กับ machine_notes ทุกครั้งก่อนตอบ",
    annotations=READ_ONLY,
)
def get_sales(days: int = 1, date: str = "", from_date: str = "", to_date: str = "",
              machine: str = "", group_by: str = "machine", top: int = 10,
              unit: str = "", sku: str = "", include_today: bool = False) -> dict:
    """
    Args:
        days: กี่วันที่ครบวันล่าสุด จบที่เมื่อวาน (ใช้เมื่อไม่ระบุ date/from_date) · 7 = "7 วันล่าสุด"
        date: วันเดียว YYYY-MM-DD (ถามยอดวันนี้ = ใส่วันนี้ · ยอดยังไม่ครบวัน)
        from_date: วันเริ่ม YYYY-MM-DD (ต้องคู่กับ to_date)
        to_date: วันจบ YYYY-MM-DD
        machine: machine_id หรือชื่อสาขา เช่น "ชลบุรี" · หลายตู้คั่นด้วย , · ชื่อห้างที่มีหลายตู้
                 (พระราม 2) = ทั้งสาขา · ว่าง = ทุกตู้
        group_by: machine (ตู้) | branch (สาขา — รวมตู้ห้างเดียวกัน) | sku (อันดับสินค้า) |
                  franchise (ค่าย One Piece/Dragon Ball/…) | day (ไล่รายวัน รวมวันที่ยอด 0) |
                  weekday (วันในสัปดาห์ มียอดเฉลี่ยต่อวัน) | hour (ช่วงเวลาที่ขายดี)
        top: จำนวนอันดับเมื่อ group_by=sku (สูงสุดที่ใช้ได้จริง ~60)
        unit: box (เฉพาะที่ซื้อยกกล่อง) | pack (เฉพาะซองเดี่ยว) | ว่าง = รวมทั้งสอง
              ⚠️ packs ของรายการ box คือ "จำนวนซองในกล่อง" ไม่ใช่จำนวนกล่อง
                 เอาไปบวกกับ pack ได้ตรง ๆ ไม่ต้องคูณ
                 อยากรู้ "กี่กล่อง" ให้ดู by_unit.box.orders
        sku: กรองสินค้า — sku_id เช่น "OP 12" · ขึ้นต้น เช่น "FB" · ชื่อค่าย เช่น "Dragon Ball" ·
             คั่นด้วย , ได้ (ว่าง = ทุกสินค้า)
        include_today: True = นับวันนี้ (ที่ยังไม่จบวัน) รวมใน days ด้วย
    """
    try:
        return data.query_sales(days=days, date=date or None,
                                from_date=from_date or None, to_date=to_date or None,
                                machine=machine or None, group_by=group_by, top=top,
                                unit=unit or None, sku=sku or None,
                                with_profit=True, include_today=include_today)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="เทียบยอดขาย + กำไร สองช่วงเวลา — คำนวณ % เปลี่ยน แยกตามตู้/สาขา/สินค้า/ค่าย "
                "และบอกสินค้าที่ขายเพิ่ม/ขายลดมากสุด (เรียงตามบาท) ให้เสร็จ\n"
                "ใช้ตอบ 'เทียบเดือนที่แล้ว' 'สัปดาห์นี้ดีขึ้นไหม' 'ยอดตกเพราะสินค้าไหน' — "
                "ห้ามดึง get_sales สองรอบแล้วลบเลขเอง\n"
                "อ่าน notes ก่อนสรุปทุกครั้ง: ช่วงยาวไม่เท่ากัน · จำนวนเสาร์-อาทิตย์ต่างกัน · "
                "ฐานเล็ก % แกว่ง · วันนี้ยังไม่ครบวัน",
    annotations=READ_ONLY,
)
def compare_sales(from_date: str = "", to_date: str = "", days: int = 7, include_today: bool = False,
                  vs: str = "previous", vs_from: str = "", vs_to: str = "",
                  machine: str = "", sku: str = "", group_by: str = "machine", top: int = 5) -> dict:
    """
    Args:
        from_date: ช่วงที่ถาม วันเริ่ม YYYY-MM-DD (คู่กับ to_date) · ไม่ใส่ = ใช้ days
        to_date: ช่วงที่ถาม วันจบ YYYY-MM-DD
        days: ไม่ใส่วันที่ = กี่วันที่ครบวันล่าสุด จบที่เมื่อวาน
        include_today: True = นับวันนี้ที่ยังไม่จบวันด้วย (ปกติไม่ต้อง)
        vs: previous (ช่วงยาวเท่ากันก่อนหน้า) | last_week (สัปดาห์ก่อน วันในสัปดาห์ตรงกัน) |
            last_month (วันที่เดียวกันของเดือนก่อน) | last_year | custom (ใส่ vs_from + vs_to)
        vs_from: ช่วงเทียบ วันเริ่ม (เฉพาะ vs=custom)
        vs_to: ช่วงเทียบ วันจบ (เฉพาะ vs=custom)
        machine: เหมือน get_sales — machine_id / ชื่อสาขา / หลายตู้คั่น , (ว่าง = ทุกตู้)
        sku: เหมือน get_sales — กรองสินค้าหรือค่าย
        group_by: machine | branch | sku | franchise
        top: จำนวนสินค้าขายเพิ่ม/ขายลดที่ส่งกลับ
    """
    try:
        return data.query_compare(from_date=from_date or None, to_date=to_date or None, days=days,
                                  include_today=include_today, vs=vs, vs_from=vs_from or None,
                                  vs_to=vs_to or None, machine=machine or None, sku=sku or None,
                                  group_by=group_by, top=top)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="สินค้าขายไม่ออก — สินค้าที่อยู่ในตู้ช่วงที่ถาม แต่ขายได้ไม่เกิน max_packs ซอง "
                "พร้อมจำนวนวันที่มีของให้ขายจริง (days_with_stock จาก period_days) ของคงเหลือตอนนี้ ช่อง "
                "วันที่ลงตู้ และวันที่ขายได้ครั้งล่าสุด — เทียบให้เสร็จแล้ว ถามย้อนหลังเป็นเดือนได้\n"
                "ใช้ตอบ 'ตัวไหนขายไม่ออก' 'ของค้างตู้' 'ควรเปลี่ยนสินค้าตัวไหน' — "
                "ห้ามเอา get_sales มาเทียบกับ get_stock เอง (เคยนับสินค้าที่ขายได้เป็นขายไม่ออก)\n"
                "status: unsold = มีของให้ขายพอแล้ว (≥14 วัน) ไม่มีใครกดเลย · slow = ขายได้บ้าง (เมื่อ max_packs > 0) · "
                "short = มีของให้ขายไม่ถึง 14 วัน (เพิ่งลงตู้/เพิ่งเติม) ยังตัดสินไม่ได้ · "
                "empty = อยู่ในตู้แต่ช่องว่างทั้งช่วง (ปัญหาการเติม) — รายงานแยกแต่ละแบบเสมอ อ่าน note ของแต่ละตัว\n"
                "ถาม 'ขายไม่ออก' ใช้ max_packs=0 · ถาม 'ขายช้า' ใช้ 1–3 · "
                "ถามทุกตู้จะได้เฉพาะ unsold/slow ตู้ละ 10 ตัว ถามทีละตู้ได้ครบ · in_several_machines นับเป็นตู้",
    annotations=READ_ONLY,
)
def get_unsold_skus(machine: str = "", days: int = 30, from_date: str = "", to_date: str = "",
                    max_packs: int = 0) -> dict:
    """
    Args:
        machine: machine_id / ชื่อสาขา / หลายตู้คั่นด้วย , (ว่าง = ทุกตู้ที่ใช้งาน)
        days: ไม่ใส่วันที่ = ย้อนหลังกี่วัน (นับวันนี้ด้วย — ยิ่งมีข้อมูลมากยิ่งไม่ตัดสินผิด)
        from_date: วันเริ่ม YYYY-MM-DD (คู่กับ to_date) เช่น ทั้งเดือน ต.ค. = 2026-10-01
        to_date: วันจบ YYYY-MM-DD
        max_packs: 0 = ขายไม่ได้เลย · 2 = ขายได้ไม่เกิน 2 ซอง (หาของขายช้า)
    """
    try:
        return data.query_unsold(machine=machine or None, days=days, from_date=from_date or None,
                                 to_date=to_date or None, include_today=True, max_packs=max_packs)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="ต้นทุนต่อซอง/ต่อกล่องรายสินค้า ณ วันที่ (ค่าเริ่ม = วันนี้) — ตัวเดียวกับที่ใช้คิดกำไร "
                "พร้อมวันที่ทุนนี้มีผลและทุนก่อนหน้า · เจ้าของอนุญาตให้แอดมินในทีมรู้ (31 ต.ค. 2026)\n"
                "ใช้ตอบ 'ทุนต่อซองของ OP 17 เท่าไหร่' 'กล่องละกี่บาท' · ห้ามคำนวณทุนเองจากกำไร\n"
                "⚠️ ข้อมูลภายในทีม — ห้ามใส่ในโพสต์ แคปชั่น หรือข้อความถึงลูกค้าเด็ดขาด",
    annotations=READ_ONLY,
)
def get_sku_costs(sku: str = "", date: str = "") -> dict:
    """
    Args:
        sku: sku_id / รหัสสั้น / ชื่อค่าย เหมือน get_sales (ว่าง = ทุกสินค้าที่ยังขายอยู่)
        date: ทุน ณ วันที่ YYYY-MM-DD (ว่าง = วันนี้ · ยอดก่อน 1 ส.ค. 2026 ใช้ทุนเดิม)
    """
    try:
        return data.query_sku_costs(sku=sku or None, date=date or None)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="สต็อกหน้าตู้รายช่อง — ของเหลือแต่ละช่อง ช่องไหนว่าง "
                "เป็นข้อมูล ณ รอบ sync ล่าสุด ไม่ใช่ real-time "
                "ถ้าผู้ใช้ถามเชิงตัดสินใจว่าควรเติมอะไร ให้ใช้ get_restock_alerts แทน",
    annotations=READ_ONLY,
)
def get_stock(machine: str = "", low_only: bool = False, low_threshold: int = 2) -> dict:
    """
    Args:
        machine: machine_id หรือคำค้นจากชื่อสาขา · หลายตู้คั่นด้วย , · ชื่อห้างที่มีหลายตู้ = ทั้งสาขา
                 (ว่าง = ทุกตู้)
        low_only: เอาเฉพาะช่องที่ใกล้หมด — แนะนำ True เมื่อดูทุกตู้ (ตู้ละ ~58 ช่อง)
        low_threshold: เกณฑ์ "ใกล้หมด" นับเป็นจำนวนชิ้นในช่อง
    """
    try:
        return data.query_stock(machine=machine or None, low_only=low_only,
                                low_threshold=low_threshold)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="เตือนเติมสต็อก — SKU ที่ขายดีและกำลังจะหมด คิดจากของเหลือหารด้วย "
                "ความเร็วขาย 14 วัน ใช้ตอบคำถามแนว 'ต้องเติมอะไรบ้าง' "
                "'ตู้ไหนของหมด' 'พรุ่งนี้เอาอะไรไปเติม'",
    annotations=READ_ONLY,
)
def get_restock_alerts(threshold_days: float = 1.0, min_velocity: float = 2.0) -> dict:
    """
    Args:
        threshold_days: เตือนเมื่อของเหลือไม่ถึงกี่วัน (default 1 เพราะเติมได้วันละรอบตอนห้างปิด)
        min_velocity: ตัดของขายช้าออก หน่วยซอง/วัน
    """
    try:
        return data.query_restock_alerts(threshold_days=threshold_days,
                                         min_velocity=min_velocity)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="ไอเดียคอนเทนต์ในคิว — ที่ตัวเก็บไอเดียหามาจากข่าว/YouTube/ข้อมูลขายของเราเอง "
                "ใช้ตอบว่า 'มีอะไรให้ทำบ้าง' 'ไอเดียไหนควรหยิบก่อน' "
                "ถ้าจะจัดลำดับความสำคัญ ให้เรียก get_sales ดูของที่ขายดีจริงประกอบด้วย",
    annotations=READ_ONLY,
)
def get_marketing_ideas(status: str = "new", limit: int = 20,
                        source: str = "", sku: str = "") -> dict:
    """
    Args:
        status: new (ยังไม่ได้ใช้) · picked (เลือกไปเขียนแล้ว) · all
        limit: จำนวนไอเดียที่ส่งกลับ (สรุปยอดรวมนับจากทั้งหมดเสมอ)
        source: กรองแหล่ง — news · tiktok · youtube · internal
        sku: กรองเฉพาะไอเดียที่ผูกกับ SKU นี้
    """
    try:
        return data.query_marketing_ideas(status=status, limit=limit,
                                          source=source or None, sku=sku or None)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="เสนอไอเดียคอนเทนต์เข้าคิวเอง — ใช้เมื่อคิดมุมใหม่ได้จากการวิเคราะห์คู่แข่ง "
                "ข่าว หรือช่องว่างที่เรายังไม่มีคอนเทนต์ ไอเดียจะไปอยู่ในคิวเดียวกับที่ระบบ "
                "เก็บอัตโนมัติ แล้วตัวเขียนคอนเทนต์หยิบไปใช้ได้เลย เจ้าของไม่ต้องพิมพ์เอง\n"
                "⚠️ ก่อนเพิ่ม ให้เรียก get_marketing_ideas ดูก่อนว่ามุมนี้มีอยู่แล้วไหม — "
                "ตอนนี้คิวกระจุกตัวหนัก 5 มุมแรกกินไป 58% ของคิว การเติมมุมที่ซ้ำไม่ช่วยอะไร\n"
                "⚠️ ถ้า tool ตอบกลับมาว่าคิวยาว ให้บอกผู้ใช้ตรง ๆ ว่าคอขวดอยู่ที่การอนุมัติ "
                "คอนเทนต์ ไม่ใช่จำนวนไอเดีย",
    annotations=WRITES,
)
def add_marketing_idea(title: str, angle: str, summary: str = "", url: str = "",
                       related_sku: str = "", score: float = 2.0,
                       source_label: str = "") -> dict:
    """
    Args:
        title: หัวข้อไอเดีย เห็นภาพว่าโพสต์นี้เล่าอะไร (อย่างน้อย 12 ตัวอักษร)
        angle: จะเล่ามุมไหน ให้ชัดพอที่คนเขียนหยิบไปเขียนต่อได้ทันที (อย่างน้อย 15 ตัวอักษร)
               เช่น "สอนใส่ sleeve ให้ถูกวิธี — โยงเข้าซองที่กดได้จากตู้"
        summary: บริบทเพิ่ม เช่น มาจากไหน ทำไมถึงคิดว่าเวิร์ก
        url: ลิงก์อ้างอิง ถ้ามี
        related_sku: sku_id ที่เกี่ยวข้อง ถ้าไอเดียผูกกับสินค้าตัวใดตัวหนึ่ง
        score: ความน่าสนใจ 0-5 (ค่าเริ่ม 2.0) ใส่สูงเมื่อมั่นใจว่าเกาะกระแสได้จริง
        source_label: ที่มาแบบสั้น เช่น "วิเคราะห์คู่แข่ง TDPK"
    """
    try:
        return data.add_marketing_idea(
            title=title, angle=angle, summary=summary, url=url,
            related_sku=related_sku, score=score, source_label=source_label)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="ฝากข้อเสนอ 'เชิงระบบ' ไว้ให้คนเขียนโค้ดอ่านรอบหน้า — ใช้เมื่อสิ่งที่อยากให้เกิด "
                "ต้องแก้โค้ด/กฎของระบบ ไม่ใช่แค่เพิ่มคอนเทนต์ เช่น 'ตัวเก็บไอเดียสร้างมุมซ้ำ "
                "เกินไป ควรจำกัดมุมละไม่เกิน N ชิ้น'\n"
                "⚠️ ถ้าเป็น **ไอเดียคอนเทนต์** ให้ใช้ add_marketing_idea แทน — อันนั้นเข้าคิว "
                "แล้วทำงานต่อได้เลย ไม่ต้องรอใครมาอ่าน\n"
                "⚠️ บอกผู้ใช้ด้วยว่าข้อความนี้ไม่ได้ส่งถึงทันที — Claude Code ไม่ได้รันค้างไว้ "
                "จะถูกอ่านตอนเจ้าของเปิดใช้ครั้งถัดไป",
    annotations=WRITES,
)
def note_for_dev(topic: str, detail: str, why: str = "") -> dict:
    """
    Args:
        topic: หัวข้อสั้น ๆ ว่าเรื่องอะไร (อย่างน้อย 8 ตัวอักษร)
        detail: อยากให้แก้อะไรเป็นอะไร ให้ชัดพอที่คนอ่านลงมือทำต่อได้
                (อย่างน้อย 30 ตัวอักษร) ข้อเสนอกว้าง ๆ อย่าง "ปรับปรุงระบบ" เอาไปทำต่อไม่ได้
        why: เหตุผล/หลักฐานที่ทำให้คิดแบบนี้ — ใส่ตัวเลขหรือสิ่งที่สังเกตเห็นจริงถ้ามี
    """
    try:
        return data.note_for_dev(topic=topic, detail=detail, why=why)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="คิวคอนเทนต์ — แคปชั่นที่เขียนแล้วแยกตามสถานะ (ร่าง/รออนุมัติ/ถูกตีตก/โพสต์แล้ว) "
                "พร้อมเหตุผลที่ถูกตีตก ใช้ตอบว่า 'ค้างอะไรอยู่' 'ทำไมงานไม่ออก' "
                "'ที่ถูกปฏิเสธมีอะไรเหมือนกัน' — ยังไม่มีข้อมูลยอดวิว/เอนเกจ",
    annotations=READ_ONLY,
)
def get_content_queue(status: str = "", limit: int = 20) -> dict:
    """
    Args:
        status: draft · pending · approved · rejected · posted (ว่าง = ทุกสถานะ)
        limit: จำนวนชิ้นที่ส่งกลับ (สรุปยอดรวมนับจากทั้งหมดเสมอ)
    """
    try:
        return data.query_content_queue(status=status or None, limit=limit)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="คอนเทนต์ที่รอตรวจ พร้อมกฎแบรนด์ตัวจริงและแคปชั่นที่เผยแพร่ไปแล้วไว้เทียบความซ้ำ "
                "ใช้เป็นด่านแรกก่อนเจ้าของอ่านเอง — ตรวจแล้วบันทึกผลด้วย review_content",
    annotations=READ_ONLY,
)
def get_content_for_review(limit: int = 10, include_reviewed: bool = False) -> dict:
    """
    Args:
        limit: ตรวจทีละกี่ชิ้น (แนะนำไม่เกิน 10 ต่อรอบ จะได้อ่านละเอียดจริง)
        include_reviewed: True = เอาชิ้นที่เคยตรวจแล้วมาด้วย (ปกติไม่ต้อง)
    """
    try:
        return data.query_content_for_review(limit=limit, include_reviewed=include_reviewed)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="บันทึกผลตรวจคอนเทนต์ 1 ชิ้น — pass (โพสต์ได้เลย) · fix (ควรแก้ก่อน) · "
                "drop (ไม่ควรใช้ชิ้นนี้) ไม่เปลี่ยนสถานะคอนเทนต์ เจ้าของยังเป็นคนตัดสินขั้นสุดท้าย "
                "verdict fix/drop ต้องเขียนให้ชัดว่าติดตรงไหนและควรแก้เป็นอะไร",
    annotations=WRITES,
)
def review_content(content_id: int, verdict: str, notes: str) -> dict:
    """
    Args:
        content_id: id ของคอนเทนต์ที่ตรวจ
        verdict: pass · fix · drop
        notes: เหตุผลภาษาไทย — ชี้จุดที่แก้ได้จริง เช่น "บรรทัดแรกไม่สะดุด ลองขึ้นด้วยตัวเลข"
    """
    try:
        return data.save_content_review(content_id, verdict, notes)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="ผลลัพธ์ของโพสต์บนเพจ — ไลก์/รีแอ็กชัน คอมเมนต์ แชร์ ต่อโพสต์ "
                "พร้อมสรุปตามรูปแบบคอนเทนต์และชั่วโมงที่โพสต์ "
                "ใช้ตอบว่า 'คอนเทนต์แบบไหนเวิร์ก' 'ควรโพสต์เวลาไหน' — "
                "อ่าน note ก่อนสรุปทุกครั้ง ถ้าจำนวนโพสต์ยังน้อยห้ามฟันธง",
    annotations=READ_ONLY,
)
def get_post_performance(days: int = 30) -> dict:
    """
    Args:
        days: ดูย้อนหลังกี่วัน
    """
    try:
        return data.query_post_performance(days=days)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="แผนการโพสต์ข้างหน้า + คอนเทนต์ที่อนุมัติแล้วแต่ยังไม่มีวัน "
                "ใช้ก่อนวางแผนทุกครั้ง เพื่อไม่ให้ตั้งเวลาทับของเดิมหรือลืมของที่รออยู่",
    annotations=READ_ONLY,
)
def get_post_plan(days: int = 14, include_unscheduled: bool = True) -> dict:
    """
    Args:
        days: มองไปข้างหน้ากี่วัน
        include_unscheduled: เอาของที่อนุมัติแล้วแต่ยังไม่มีวันมาด้วย (default True)
    """
    try:
        return data.query_post_plan(days=days, include_unscheduled=include_unscheduled)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="กำหนดเวลาโพสต์ให้คอนเทนต์ 1 ชิ้น (เวลาไทย) — ถึงเวลาแล้วระบบจะโพสต์ขึ้นเพจเอง "
                "ถ้าเจ้าของอนุมัติชิ้นนั้นแล้ว · กันตั้งเวลาย้อนหลังและกันตั้งชนกันให้อยู่แล้ว "
                "เรียก get_post_plan ดูแผนก่อนเสมอ",
    annotations=WRITES,
)
def schedule_content(content_id: int, when: str, force: bool = False) -> dict:
    """
    Args:
        content_id: id ของคอนเทนต์
        when: เวลาไทยรูปแบบ 'YYYY-MM-DD HH:MM' เช่น '2026-08-18 19:30'
        force: ข้ามการกันตั้งชนกัน/ข้ามคำค้านของผู้ตรวจ — ใช้เมื่อเจ้าของสั่งเองเท่านั้น
    """
    try:
        return data.schedule_content(content_id, when, force=force)
    except Exception as e:
        return _fail(e)


@server.tool(
    description="ผลรัน sync ล่าสุด — ใช้เช็คว่างานที่สั่งไปด้วย sync_data เสร็จหรือยัง "
                "และรอบ cron ที่ผ่านมาสำเร็จไหม",
    annotations=READ_ONLY,
)
def get_sync_status(job: str) -> dict:
    """
    Args:
        job: ชื่องาน เช่น vms-stock, ww-stock, payif-stock, vms-sales, ww-sales, payif-sales
    """
    if job not in tw.JOBS:
        return {"error": f"ไม่รู้จักงาน '{job}' — เลือกจาก: {', '.join(tw.JOBS)}"}
    if not tw.GH_PAT:
        return {"error": "ไม่มี GH_PAT ใน deploy/.env.local"}
    try:
        wf = tw.JOBS[job][0]
        runs = tw.gh(f"/repos/{tw.REPO}/actions/workflows/{wf}/runs?per_page=5")
        return {"job": job, "workflow": wf, "runs": [{
            "started_at_utc": r.get("run_started_at"),
            "status": r.get("conclusion") if r.get("status") == "completed" else r.get("status"),
            "trigger": r.get("event"),
        } for r in runs.get("workflow_runs", [])]}
    except Exception as e:
        return _fail(e)


# ── เปลี่ยนข้อมูลจริง ────────────────────────────────────────────────────
@server.tool(
    description="สั่งดึงข้อมูลใหม่จากตู้ (เขียนลงฐานข้อมูลจริง) "
                "ยืนยันกับผู้ใช้ก่อนเรียกครั้งแรกในบทสนทนา "
                "งานทำงานบน GitHub Actions ใช้เวลา 1-3 นาที คำสั่งนี้ส่งแล้วจบทันที ไม่รอผล "
                "เช็คผลทีหลังด้วย get_sync_status",
    annotations=WRITES,
)
def sync_data(job: str = "stock", days: int = 1,
              from_date: str = "", to_date: str = "") -> dict:
    """
    Args:
        job: stock (สต็อกทุกยี่ห้อ) | sales (ยอดขายทุกยี่ห้อ) หรือระบุยี่ห้อ
             เช่น vms-stock, ww-sales, payif-stock
        days: ย้อนหลังกี่วัน สำหรับงานยอดขาย (1 = เมื่อวาน)
        from_date: backfill วันเริ่ม YYYY-MM-DD (ต้องคู่กับ to_date · ห้ามเกิน 5 วัน)
        to_date: backfill วันจบ YYYY-MM-DD
    """
    if not tw.GH_PAT:
        return {"error": "ไม่มี GH_PAT ใน deploy/.env.local (PAT ต้องมี scope 'workflow')"}
    jobs = tw.GROUPS.get(job, [job] if job in tw.JOBS else None)
    if jobs is None:
        return {"error": "ไม่รู้จักงาน '%s' — เลือกจาก: %s หรือกลุ่ม: %s"
                         % (job, ", ".join(tw.JOBS), ", ".join(tw.GROUPS))}

    # กันช่วง backfill เกินลิมิต ก่อนยิงอะไรทั้งนั้น
    inputs_per_job = {}
    for j in jobs:
        if not tw.JOBS[j][1]:
            inputs_per_job[j] = {}
            continue
        if from_date or to_date:
            if not (from_date and to_date):
                return {"error": "ต้องใส่ทั้ง from_date และ to_date"}
            try:
                d1 = datetime.strptime(from_date, "%Y-%m-%d")
                d2 = datetime.strptime(to_date, "%Y-%m-%d")
            except ValueError:
                return {"error": "วันที่ผิดรูปแบบ (ต้อง YYYY-MM-DD)"}
            if d2 < d1:
                return {"error": f"to_date ({to_date}) ต้องไม่ก่อน from_date ({from_date})"}
            span = (d2 - d1).days + 1
            if span > tw.MAX_BACKFILL_DAYS:
                return {"error": "ช่วง %d วัน เกินลิมิต %d วัน/ครั้ง — แบ่งสั่งทีละไม่เกิน 5 วัน"
                                 % (span, tw.MAX_BACKFILL_DAYS)}
            inputs_per_job[j] = {"from_date": from_date, "to_date": to_date}
        else:
            inputs_per_job[j] = {"days": str(days)}

    started = []
    for j in jobs:
        try:
            body = {"ref": tw.REF}
            if inputs_per_job[j]:
                body["inputs"] = inputs_per_job[j]
            tw.gh(f"/repos/{tw.REPO}/actions/workflows/{tw.JOBS[j][0]}/dispatches",
                  method="POST", body=body)
            started.append({"job": j, "inputs": inputs_per_job[j]})
        except Exception as e:
            return {"error": f"สั่ง {j} ไม่สำเร็จ: {e}", "started": started}

    return {"started": started, "count": len(started),
            "note": "workflow ใช้เวลา ~1-3 นาที · เช็คผลด้วย get_sync_status"}


if __name__ == "__main__":
    server.run(transport="stdio")
