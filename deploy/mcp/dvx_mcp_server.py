"""
DivisionX MCP Server — เปิดข้อมูลตู้กดการ์ดให้ AI agent ถาม-ตอบได้อิสระ

ใช้ได้กับทั้ง OpenClaw และ Claude Code (stdio transport)
ชั้นข้อมูลอยู่ที่ deploy/agents/dvx_data.py — ตัวนี้เป็นแค่เปลือก MCP

tools ที่เปิด:
  อ่านอย่างเดียว  list_machines · get_sales · get_stock · get_restock_alerts · get_sync_status
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
        "ยอดขายจากตู้ sync วันละครั้งตอนเที่ยงคืน (ได้ยอดของเมื่อวาน) "
        "ถ้าถามยอดวันนี้แล้วได้ 0 ให้บอกผู้ใช้ว่ายังไม่ได้ sync อย่าสรุปว่าขายไม่ได้\n"
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
    description="ยอดขาย — สรุปรายรับ/จำนวนซอง แยกตามตู้ ตาม SKU หรือไล่รายวัน "
                "ระบุช่วงด้วย days (ย้อนหลังกี่วัน) หรือ date (วันเดียว) "
                "หรือ from_date+to_date ทุกวันที่เป็นเวลาไทย · "
                "แยก 'ซื้อยกกล่อง' กับ 'ซื้อทีละซอง' ได้ด้วย unit=box|pack "
                "และผลลัพธ์มี by_unit สรุปให้เสมอแม้ไม่ได้กรอง "
                "ใช้ตอบคำถามแนว 'ขายแบบกล่องได้เท่าไหร่' 'ใครซื้อยกกล่องบ้าง'",
    annotations=READ_ONLY,
)
def get_sales(days: int = 1, date: str = "", from_date: str = "", to_date: str = "",
              machine: str = "", group_by: str = "machine", top: int = 10,
              unit: str = "") -> dict:
    """
    Args:
        days: ย้อนหลังกี่วันรวมวันนี้ (ใช้เมื่อไม่ระบุ date/from_date)
        date: วันเดียว YYYY-MM-DD
        from_date: วันเริ่ม YYYY-MM-DD (ต้องคู่กับ to_date)
        to_date: วันจบ YYYY-MM-DD
        machine: machine_id หรือคำค้นจากชื่อสาขา เช่น "ชลบุรี" (ว่าง = ทุกตู้)
        group_by: machine (แยกตามตู้) | sku (อันดับสินค้า) | day (ไล่รายวัน)
        top: จำนวนอันดับเมื่อ group_by=sku
        unit: box (เฉพาะที่ซื้อยกกล่อง) | pack (เฉพาะซองเดี่ยว) | ว่าง = รวมทั้งสอง
              ⚠️ packs ของรายการ box คือ "จำนวนซองในกล่อง" ไม่ใช่จำนวนกล่อง
                 เอาไปบวกกับ pack ได้ตรง ๆ ไม่ต้องคูณ
                 อยากรู้ "กี่กล่อง" ให้ดู by_unit.box.orders
    """
    try:
        return data.query_sales(days=days, date=date or None,
                                from_date=from_date or None, to_date=to_date or None,
                                machine=machine or None, group_by=group_by, top=top,
                                unit=unit or None)
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
        machine: machine_id หรือคำค้นจากชื่อสาขา (ว่าง = ทุกตู้)
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
