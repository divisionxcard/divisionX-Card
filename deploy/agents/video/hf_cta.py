"""ฉากปิดหลายแบบ — ข้อมูลจริง + คลังข้อความ (เสียงกับจอระเบียนเดียวกัน) + ประกอบฉาก · ผู้กำกับเรียกหลังได้แผนรูปแบบแล้ว

ทำไมมีไฟล์นี้ (16 ต.ค. 2026):
    เจ้าของ: "ฉากปิดมันซ้ำกันทุกๆคลิป อยากให้เปลี่ยนแนวเปลี่ยนรูปแบบข้อความให้แตกต่างออกไป ตามลักษณะคอนเทนต์
    และชวนให้ผู้ชมสนใจ รวมถึงให้ประโยชน์กับผู้ชมได้มากกว่านี้"
    เดิม: scene-cta ใบเดียวทุกคลิป — รูปตู้กลาง (สติกเกอร์ยังเป็นเบอร์เก่า) + "เช็กหน้าตู้ก่อนไป" ตายตัว
    · เสียงพูดอีกอย่าง จอขึ้นอีกอย่าง ("ทีมไหนกันบ้าง?" กับ "เช็กหน้าตู้ก่อนไป") · โชว์แค่ ~1.5 วิ
    ตอนนี้ 6 แบบ ออกแบบจาก 3 มุม (ชวนคอมเมนต์ · ให้ประโยชน์ · งานภาพ) แล้วกรรมการรวม — ดู worklog 2026-10-16-cta-layouts
      team  เลือกทีม/อันดับ พิมพ์เลขในคอมเมนต์ (versus · rank) · spot  เฉลยจุดซูม รู้ตั้งแต่เลขไหน (quiz)
      board ล่าสุดซองนี้มีที่สาขาไหน / สาขาอื่นใกล้คุณ · shelf ตู้สาขานี้ล่าสุดมีอะไร · steps กดตู้ 4 ขั้น
      line  ติดปัญหาที่ตู้/มีคำถาม ทักไลน์
    17 ต.ค. เจ้าของตอบ: "ตอนนี้ในไลน์ไม่ได้ใช้บรอดแคสต์ ส่วนใหญ่ในไลน์เป็นการรับแจ้งปัญหาจากลูกค้า"
      → แบบ line เดิม ("ข่าวเติมของหน้าตู้ เราแจ้งทางไลน์") อ้างสิ่งที่ไม่ได้ทำ เปลี่ยนเป็นช่องทางแจ้งปัญหา (ตรงกับหน้า /how-to)
      · ป้ายท้ายบอร์ดชี้หน้า /stock (ของในตู้รายสาขา + ปุ่มนำทาง + หาสาขาใกล้ฉัน) แทน /branches — เจ้าของให้ใส่

กติกาเหล็ก
    · หัวเรื่อง/คำถาม/คำชวน/คำโปรยบนจอ ต้องเป็นส่วนหนึ่งของบรรทัดที่พูด (cta_check — ป้ายหมวด/วันที่/ชื่อ/ไทล์/ลิงก์ไม่นับ)
    · ข้อเท็จจริงเท่านั้น — สาขา/ชั้น/จุดสังเกตจาก machines.config.branch · ของในตู้จาก machine_stock เฉพาะซอง (unit=pack)
      ซิงค์ ≤ 30 ชม. พร้อม "สต็อก ณ <วันที่ซิงค์เก่าสุด>" และคำว่า "ล่าสุด" เสมอ · ขั้นตอนซื้อตรงตัวจากหน้า /how-to · LINE @divisionxcard
    · ห้าม: ตัวเลขยอดขาย/% ราคา จำนวนในตู้ หมด/เหลือน้อย/หายาก สัญญาตอนต่อไป เบอร์โทร (รูปตู้กลางมีเบอร์เก่า — ไม่ใช้)
    · ฉากไลน์ห้ามอ้างข่าว/ของใหม่/แจ้งเตือน/โปรสมาชิก ห้ามสัญญาเวลาตอบ (ทันที/ไว/ภายใน…/ทุกวัน/24 ชม.) และไม่มีตัวเลข (LINE_BANNED)
    · ทุกบรรทัดปิด ≤ 90 ตัวอักษรหลัง sanitize — ยาวกว่านั้น split_script ซอยบรรทัดแล้ว span ของฉากเพี้ยน
"""
import datetime as dt
import re
import unicodedata

from . import hf_formats as F
from .hf_render import TEMPLATE, fit_px, versus_sides
from .segments import sanitize

TH_MONTHS_FULL = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
                  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
LINE_ID = "@divisionxcard"                 # สะกดตาม brand-brief (โพสต์เก่า 31 โพสต์ตกตัว i — "@Divisonxcard")
LINE_QR = "assets/brand/line-qr.svg"       # = wiki/marketing/qr-assets/line-qr.svg (ป้ายหน้าตู้) · ถอดได้ https://lin.ee/9cMKVRm
HOWTO_URL = "division-x-card.vercel.app/how-to"
# ป้ายท้ายบอร์ด (ทั้งสองโหมด) → หน้าเช็กของในตู้: ของเหลือรายสาขา + ชั้น/จุดสังเกต + ปุ่มนำทาง + หาสาขาใกล้ฉัน
# (เจ้าของให้ใช้ 17 ต.ค.) · F.BRANCHES_URL ไม่แตะ — คลิปพิกัดกับคิวโพสต์ตั้งใจใช้ /branches
STOCK_URL = "division-x-card.vercel.app/stock"
BOARD_FOOT = "เช็กของในตู้ + นำทาง · " + STOCK_URL
# ชั้นวางไม่มีแถบลิงก์ของตัวเอง — ป้ายท้ายเป็นลิงก์แทน (32 px nowrap กว้าง 860 · ข้อความนี้ ~760 px)
SHELF_FOOT = "เช็กของในตู้ · " + STOCK_URL
# ลอกตรงตัวจาก deploy/app/how-to/page.jsx STEPS (เจ้าของตรวจหน้านั้นแล้ว) — cta_check เทียบกับไฟล์จริงทุกครั้ง
HOWTO_STEPS = [("เลือกการ์ด", "แตะหน้าจอ เลื่อนเลือกชุด/การ์ดที่ต้องการ"),
               ("ยืนยันรายการ", "ตรวจสอบรายการให้ครบก่อนชำระเงิน"),
               ("สแกน QR พร้อมเพย์", "หรือชำระตามวิธีที่หน้าจอแสดง"),
               ("รับสินค้า", "รอสินค้าหล่นที่ช่องรับด้านล่าง")]
MAX_LINE = 90
MAX_CLIP = 34.0                            # วินาที — ยาวกว่านี้เลือกแบบประโยคสั้นแทน (H5 · V2)
CHARS_PER_S = 13.0                         # Gemini TTS ไทยราว 13 ตัวอักษร/วิ (วัดจากคลิปจริง)
FR_ORDER = ["OP", "PKM", "DB", "YGH", "NRT"]

# เวลาบนจอ: hold = ค้างต่อหลังเสียงจบ · min_on = อยู่บนจอรวมอย่างน้อย (hf_render คิด hold จริง)
TIMING = {"team": (0.3, 2.8), "spot": (0.5, 3.0), "board": (1.0, 3.6), "board:branch": (0.8, 3.6),
          "shelf": (1.0, 3.6), "steps": (0.5, 4.0), "line": (1.2, 3.4)}
# น้ำหนักตามความเหมาะกับรูปแบบ (ลำดับแรก = เหมาะสุด) · เพดาน (ครั้ง, ในกี่คลิปล่าสุด)
WEIGHTS = {"rank": [("team", 3), ("board", 2), ("shelf", 2), ("steps", 1), ("line", 1)],
           "versus": [("team", 3), ("board", 2), ("line", 1), ("steps", 1)],
           "quiz": [("spot", 3), ("board", 2), ("steps", 2), ("line", 1)],
           "map": [("shelf", 3), ("board", 2), ("steps", 2), ("line", 1)]}
CAPS = {"steps": (1, 4), "line": (1, 5), "board:pack": (1, 3)}
TIMING_LAYOUTS = ("team", "spot", "board", "shelf", "steps", "line")
# ตำแหน่งพระเอกบนเฟรมสุดท้ายของแต่ละรูปแบบ "cx,cy,w,h,rot" — ฉากปิดเริ่มจากตรงนี้ (match cut)
SRC = {"rank": "270,719,100,100,0", "quiz": "540,878,660,660,-3", "map": "540,956,554,720,0"}
# ค่าที่ฉากปิดรับต่อจากฉากรูปแบบก่อนหน้า (hf_render ก๊อปจาก vals ของฉากนั้น)
INHERIT = {"versus": ["rounds"] + [f"{k}{i}" for i in range(1, 5) for k in ("img", "name", "tag", "fs")]
           + [f"win{k}" for k in range(1, 4)],
           "rank": [f"{k}{i}" for i in range(1, 6) for k in ("img", "name", "tag")],
           "quiz": ["img", "name", "tag", "zx", "zy", "z0"],
           "map": ["photo"]}

# ── คลังข้อความ — {ตัวเติม} มาจากข้อมูลจริงของคลิป · จอ = ส่วนหนึ่งของเสียงเสมอ ─────────────────────────
CTA_COPY = {
    "team": {
        "versus": [
            {"id": "V1", "voice": ["แชมป์คือ {w_say} แล้วคุณล่ะ ทีมไหน? พิมพ์เลขทีมในคอมเมนต์เลย"],
             "title": "แล้วคุณล่ะ ทีมไหน?", "ask": "พิมพ์เลขทีมในคอมเมนต์"},
            {"id": "V2", "voice": ["ศึกนี้จบแล้ว คุณอยู่ทีมไหน? พิมพ์เลขทีมในคอมเมนต์เลย"],
             "title": "คุณอยู่ทีมไหน?", "ask": "พิมพ์เลขทีมในคอมเมนต์"},
            {"id": "V3", "voice": ["ลูกค้าตู้เราซื้อ {w_say} มากกว่า คุณเชียร์ซองไหน? พิมพ์เลขทีมในคอมเมนต์เลย"],
             "title": "เชียร์ซองไหน?", "ask": "พิมพ์เลขทีมในคอมเมนต์"},
        ],
        "rank": [
            {"id": "R1", "voice": ["{top_say} ได้ที่หนึ่ง แล้วคุณชอบอันดับไหนสุด? พิมพ์เลขอันดับในคอมเมนต์เลย"],
             "title": "ชอบอันดับไหนสุด?", "ask": "พิมพ์เลขอันดับในคอมเมนต์"},
            {"id": "R2", "voice": ["ห้าซองนี้ คุณเปิดมาแล้วกี่ซอง? คอมเมนต์บอกหน่อย"],
             "title": "เปิดมาแล้วกี่ซอง?", "ask": "คอมเมนต์บอกหน่อย"},
            {"id": "R3", "voice": ["ห้าซองนี้ ถ้าเลือกได้ซองเดียว เอาอันดับไหน? พิมพ์เลขอันดับในคอมเมนต์เลย"],
             "kicker": "ถ้าเลือกได้ซองเดียว", "title": "เอาอันดับไหน?", "ask": "พิมพ์เลขอันดับในคอมเมนต์"},
        ],
    },
    "spot": {
        "quiz": [
            {"id": "V1", "voice": ["ลายที่ซูมให้ดู อยู่ตรงนี้เอง! คุณรู้ตั้งแต่เลขไหน? คอมเมนต์มาเลย"],
             "title": "รู้ตั้งแต่เลขไหน?", "callout": "ลายที่ซูมให้ดู อยู่ตรงนี้เอง!", "chips": "3|2|1|ยังไม่รู้เลย",
             "ask": "คอมเมนต์มาเลย"},
            {"id": "V2", "voice": ["ดูแค่ลายตรงนี้ ทายถูกไหม? ถูกหรือผิด คอมเมนต์มาเลย"],
             "title": "ทายถูกไหม?", "callout": "ดูแค่ลายตรงนี้", "chips": "ถูก|ผิด", "ask": "คอมเมนต์มาเลย"},
            {"id": "V3", "voice": ["ย้อนดูอีกรอบ! ลายที่ซูมอยู่ตรงนี้ เห็นตั้งแต่แรกไหม? คอมเมนต์มาเลย"],
             "title": "ย้อนดูอีกรอบ!", "callout": "ลายที่ซูมอยู่ตรงนี้", "q3": "เห็นตั้งแต่แรกไหม?", "ask": "คอมเมนต์มาเลย"},
        ],
    },
    "board": {
        "pack": [
            # 23 ต.ค. 2026 เจ้าของ: "เช็กหน้าตู้ก่อนไป" ไม่สมเหตุสมผล ลูกค้ายังไม่ถึงตู้ → เช็กหน้าเว็บ + ชี้ลิงก์ด้านล่าง
            # (ป้ายท้ายกระดานคือ STOCK_URL อยู่แล้ว = "ลิงก์ด้านล่าง" ที่เห็นบนจอจริง)
            {"id": "P1", "voice_all": ["{lead}{say} ล่าสุดมีครบทุกสาขา เช็กหน้าเว็บก่อนไป ตามลิงก์ด้านล่างได้เลย"],
             "voice_some": ["{lead}{say} ล่าสุดมีที่สาขาเหล่านี้ เช็กหน้าเว็บก่อนไป ตามลิงก์ด้านล่างได้เลย"]},
            {"id": "P2", "voice_all": ["อยากได้ {say} ใช่ไหม? ล่าสุดมีครบทุกสาขา ดูพิกัดบนจอได้เลย"],
             "voice_some": ["ตามหา {say} อยู่ใช่ไหม? ล่าสุดมีที่สาขาเหล่านี้ ดูบนจอเลย"]},
        ],
        "branch": [
            {"id": "B1", "voice": ["นอกจากสาขานี้ ใกล้คุณสาขาไหน? คอมเมนต์ชื่อห้างมาเลย"],
             "q1": "นอกจากสาขานี้", "q2": "ใกล้คุณสาขาไหน?", "ask": "คอมเมนต์ชื่อห้างมาเลย"},
            {"id": "B2", "voice": ["นอกจากตู้นี้ ยังมีอีก {k_other} ตู้ ดูพิกัดครบได้ที่เว็บเรา"],
             "q1": "นอกจากตู้นี้", "q2": "ยังมีอีก {k_other} ตู้"},
            {"id": "B3", "voice": ["ไม่สะดวกสาขานี้? ยังมีอีก {k_out} ตู้ ใน {m_out} ห้าง เลือกสาขาใกล้บ้านได้เลย"],
             "q1": "ไม่สะดวกสาขานี้?", "q2": "ยังมีอีก {k_out} ตู้", "sub": "ใน {m_out} ห้าง · เลือกสาขาใกล้บ้าน"},
        ],
        # สำรองเมื่อแบบอื่นใช้ไม่ได้ (ทุกรูปแบบ — ไม่อ้าง "ตู้นี้" เพราะคลิปรวมทุกสาขาไม่มีตู้เดียว)
        "fallback": [
            {"id": "B0", "voice": ["ตู้ DivisionX มี {n} ตู้ ใน {m} ห้าง ดูพิกัดครบได้ที่เว็บเรา"],
             "q1": "ตู้ DivisionX", "q2": "มี {n} ตู้ ใน {m} ห้าง"},
        ],
    },
    "shelf": {
        "any": [
            {"id": "S1", "voice": ["ล่าสุดตู้นี้มีทั้ง {fr_say} เช็กหน้าเว็บก่อนไป ตามลิงก์ด้านล่างได้เลย"], "head": "ล่าสุดตู้นี้มี",
             "foot": SHELF_FOOT},
            {"id": "S2", "voice": ["ไปถึงแล้วเจออะไร? ล่าสุดตู้นี้มีชุดพวกนี้ และยังมีชุดอื่นอีก"],
             "kicker": "ไปถึงแล้วเจออะไร?", "head": "ล่าสุดตู้นี้มี", "foot": "และยังมีชุดอื่นอีก"},
            {"id": "S3", "voice": ["ทั้ง 5 ชุดในอันดับ ล่าสุดตู้นี้มีครบ เช็กหน้าเว็บก่อนไป ตามลิงก์ด้านล่างได้เลย"], "formats": ["rank"],
             "kicker": "ทั้ง 5 ชุดในอันดับ", "head": "ล่าสุดตู้นี้มีครบ", "foot": SHELF_FOOT},
        ],
    },
    "steps": {
        "any": [
            {"id": "H1", "voice": ["กดตู้ง่าย ๆ แค่ 4 ขั้นตอน", "{steps_line}"], "q1": "กดตู้ง่าย ๆ", "q2": "แค่ 4 ขั้นตอน"},
            {"id": "H2", "voice": ["ถึงตู้แล้วกดยังไง?", "{steps_line}"], "q1": "ถึงตู้แล้ว", "q2": "กดยังไง?",
             "formats": ["map"]},
            {"id": "H3", "voice": ["เพิ่งเคยกดตู้การ์ด? ทำตามนี้เลย", "{steps_line}"], "q1": "เพิ่งเคยกดตู้การ์ด?",
             "q2": "ทำตามนี้เลย", "formats": ["map", "quiz"]},
            {"id": "H4", "voice": ["อยากได้ซองนี้? กดแค่ 4 ขั้นตอน", "{steps_line}"], "q1": "อยากได้ซองนี้?",
             "q2": "กดแค่ 4 ขั้นตอน", "formats": ["rank", "versus", "quiz"]},
            {"id": "H5", "voice": ["กดตู้ 4 ขั้น {steps_line}"], "q1": "กดตู้ 4 ขั้น", "q2": "",
             "formats": ["rank", "versus", "quiz", "map"], "short": True},
        ],
    },
    # ไลน์ = ช่องทางแจ้งปัญหา/ถาม (เจ้าของ 17 ต.ค. — ไม่ได้บรอดแคสต์) · ไม่สัญญาเวลาตอบ · รหัส L1–L3 เดิม (ประวัติหมุนใช้ต่อได้)
    "line": {
        "any": [
            {"id": "L1", "voice": ["กดตู้แล้วติดปัญหา? แจ้งเราทางไลน์ @divisionxcard ได้เลย"],
             "q1": "กดตู้แล้วติดปัญหา?", "q2": "แจ้งเราทางไลน์", "hint": "แคปหน้าจอ แล้วสแกนในแอป LINE"},
            {"id": "L2", "voice": ["มีคำถาม หรือติดปัญหา? ทักไลน์มาได้เลย แคปหน้าจอ แล้วสแกนในแอป LINE"],
             "q1": "มีคำถาม หรือติดปัญหา?", "q2": "ทักไลน์มาได้เลย", "hint": "แคปหน้าจอ แล้วสแกนในแอป LINE"},
            {"id": "L3", "voice": ["แอดไลน์ไว้ก่อนเลย เผื่อติดปัญหาที่ตู้ จะได้ทักมาบอกเรา"],
             "q1": "แอดไลน์ไว้ก่อนเลย", "q2": "เผื่อติดปัญหาที่ตู้", "hint": "แคปหน้าจอ แล้วสแกนในแอป LINE"},
        ],
    },
}
STEPS_LINE = "เลือกการ์ด ยืนยันรายการ สแกน QR พร้อมเพย์ แล้วรับสินค้า"
# ข้อความบนจอที่ต้องได้ยินในเสียงด้วย · kicker นับเฉพาะที่มาจากคลังข้อความ (ป้ายระบบอย่าง "เฉลยจุดซูม" ไม่นับ)
# ไม่นับ: วันที่ (stamp_*) · ชื่อ · ไทล์ · ตัวเลือกคำตอบ (chips) · ป้ายท้าย (foot) · คำแนะนำ (hint) · ลิงก์ · ID
SPOKEN_KEYS = ("title", "ask", "callout", "q3", "head", "q1", "q2", "sub", "s1", "s2", "s3", "s4")
# บรรทัดข้อมูลที่ใช้ชื่อคีย์ซ้ำกับข้อความพูด: ชั้นวาง sub = "ห้าง ชั้น · สต็อก ณ …" (เหมือนวันที่ ไม่ต้องพูด)
SPOKEN_EXEMPT = {"shelf": ("sub",)}
# ฉากไลน์ (เจ้าของ 17 ต.ค.: ไลน์ไม่ได้บรอดแคสต์ ส่วนใหญ่รับแจ้งปัญหาจากลูกค้า) — ห้ามอ้างข่าว/ของใหม่/แจ้งเตือน/โปรสมาชิก
# และห้ามสัญญาเวลาตอบ (ไม่มีใครรับปากไว้) · ไม่มีตัวเลขเลย (ตรวจแยกใน cta_check) · "เติม" เฉย ๆ ไม่ห้าม ("สอบถามเพิ่มเติม" ได้)
# ทุกตัวเป็น regex (ส่วนใหญ่คือคำตรงตัว) · "ไว" = เร็ว แต่ "ไว้" (แอดไลน์ไว้) ต้องผ่าน → ไว(?!้)
# selfcheck ใส่ทุกตัวลงในประโยคไลน์ปกติแล้วต้องถูกปัดตกจริง · ตัวที่ไม่ใช่คำตรงตัวต้องมีตัวอย่างใน LINE_BANNED_EXAMPLE
LINE_BANNED = ("ข่าว", "เติมของ", "รอบเติม", "ของเข้า", "ของใหม่", "ชุดใหม่", "เซ็ตใหม่", "มาใหม่", "อัปเดต", "อัพเดท",
               "ประกาศ", "แจ้งเตือน", "บรอดแคส", "รู้ก่อน",                      # ข่าว/ของใหม่ (ไลน์ไม่ได้ส่งประกาศ)
               "โปร", "สมาชิก", "สิทธิ์", "คูปอง",                                 # โปร/สิทธิ์สมาชิก (ไม่มีจริง)
               "ทันที", "ตลอด", "ชั่วโมง", "เร็ว", "ด่วน", "ภายใน", "ทุกวัน", "ไว(?!้)")   # สัญญาเวลาตอบ
LINE_BANNED_EXAMPLE = {"ไว(?!้)": "แอดมินตอบไว"}


def th_day(d):
    """date → ('16 ต.ค.', '16 ตุลาคม')"""
    return f"{d.day} {F.TH_MONTHS[d.month]}", f"{d.day} {TH_MONTHS_FULL[d.month]}"


# ── ข้อมูลจริง ─────────────────────────────────────────────────────────────────────────────────────

def stock_snapshot(max_age_h=30):
    """ของในตู้ ณ ซิงค์ล่าสุด → {rows, fresh{machine: เวลา}, packs{machine: {sku}}, all_fresh}

    เฉพาะตู้ที่เปิด+public (branches()) · เฉพาะซอง (unit=pack — แถวกล่องเป็นคนละสินค้า) · ตู้ที่ซิงค์เก่ากว่า max_age_h ตัดทิ้ง
    (wwv02 เลิกใช้แล้วยังมีแถวค้างจาก 17 ส.ค. — ตรวจ 16 ต.ค.)"""
    rows = F.branches()
    pub = {r["machine_id"] for r in rows}
    latest, packs = {}, {}
    q = "machine_stock?select=machine_id,sku_id,remain,unit,synced_at&remain=gt.0&unit=eq.pack&sku_id=not.is.null"
    for r in F._rest(q):
        mid, ts = r["machine_id"], r.get("synced_at")
        if mid not in pub or not ts:
            continue
        t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        latest[mid] = max(latest.get(mid, t), t)
        packs.setdefault(mid, set()).add(r["sku_id"])
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=max_age_h)
    fresh = {m: t for m, t in latest.items() if t >= cutoff}
    return {"rows": rows, "fresh": fresh, "packs": {m: packs[m] for m in fresh},
            "all_fresh": bool(rows) and set(fresh) == pub}


def _asof(snap, mids):
    """วันที่ของคำอ้าง = วันซิงค์เก่าสุดของตู้ที่คำอ้างนั้นครอบคลุม (เวลาไทย)"""
    return min(snap["fresh"][m] for m in mids).astimezone(F.TH).date()


def pack_where(sku, snap):
    """ซองนี้ล่าสุดมีที่ไหน → (mode 'all'|'some'|None, แถวสาขาที่มี (ลำดับ branches()), วันที่)
    'all' เฉพาะตอนทุกตู้ public ซิงค์สดและมีซองนี้ — ตู้ไหนไม่มีก็ไม่แสดง (ไม่ทำจาง — จางอ่านว่า "ที่นี่ไม่มี")"""
    lit = [r for r in snap["rows"] if sku in snap["packs"].get(r["machine_id"], ())]
    if not lit:
        return None, [], None
    mode = "all" if snap["all_fresh"] and len(lit) == len(snap["rows"]) else "some"
    return mode, lit, _asof(snap, [r["machine_id"] for r in lit])


def _skus_with_art():
    return {s["sku_id"]: s for s in F._rest("skus?select=sku_id,name,franchise,image_url") if s.get("image_url")}


def machine_shelf(machine, snap, n=6, days=14, skus=None):
    """ตู้นี้ล่าสุดมีชุดอะไร → {items[{sku,name,tag}], franchises[ชื่อค่าย], more, asof} หรือ None
    เลือก: ตัวขายดีของแต่ละค่าย (OP → PKM → DB → YGH → NRT → อื่น ๆ) แล้วเติม OP · ยอดขายใช้จัดลำดับเท่านั้น ไม่โชว์"""
    have = snap["packs"].get(machine)
    if not have:
        return None
    skus = skus if skus is not None else _skus_with_art()
    have = [s for s in have if s in skus]
    count, _, _ = F.sales_counts(days, machine)
    have.sort(key=lambda s: (-count.get(s, 0), s))
    frs = list(dict.fromkeys(skus[s].get("franchise") for s in have))
    order = [fr for fr in FR_ORDER if fr in frs] + [fr for fr in frs if fr not in FR_ORDER]
    pick = []
    for fr in order:
        sid = next((s for s in have if skus[s].get("franchise") == fr), None)
        if sid and len(pick) < n:
            pick.append(sid)
    for s in have:
        if len(pick) >= n:
            break
        if s not in pick and skus[s].get("franchise") == "OP":
            pick.append(s)
    for s in have:                                     # ค่ายน้อย OP ไม่พอ → เติมชุดขายดีที่เหลือ
        if len(pick) >= n:
            break
        if s not in pick:
            pick.append(s)
    items = []
    for s in pick:
        name, brand, _say = F.display(skus[s])
        items.append({"sku": s, "name": name, "tag": brand})
    return {"items": items, "franchises": [F.BRAND.get(fr, fr) for fr in order], "more": len(have) > len(pick),
            "asof": _asof(snap, [machine])}


def branch_tiles(rows, focus=None):
    """ไทล์สาขา → ('ห้าง|ชั้น|flag|จุดสังเกต;…', ขนาดตัวอักษร, จำนวนคอลัมน์) — หนึ่งไทล์ต่อหนึ่งตู้ ตามลำดับ config.branch"""
    tpx = min(fit_px(r["mall"], 800, 244, 30, 24) for r in rows) if rows else 30
    cols = 3 if len(rows) >= 10 else (2 if len(rows) >= 5 else 1)
    parts = []
    for r in rows:
        floor = re.sub(r"^ชั้น\s*", "", r.get("floor") or "")
        parts.append("|".join([r["mall"], floor, "1" if r["machine_id"] == focus else "0",
                               (r.get("landmark") or "") if cols == 1 else ""]).replace(";", ","))
    return ";".join(parts), tpx, cols


def hero_of(fmt, plan):
    """พระเอกของคลิป (ซองที่คนดูเพิ่งเห็น) → {sku, name, tag, say, key, src} | None"""
    sc = (plan.get("scenes") or [{}])[0]
    if fmt == "rank" and sc.get("items"):
        it = sc["items"][0]
        return {**it, "key": "img1", "src": SRC["rank"]}
    if fmt == "versus" and sc.get("items") and sc.get("rounds"):
        wins = [int(r["win"]) for r in sc["rounds"]]
        champ = wins[-1]
        it = sc["items"][champ - 1]
        side, _ = versus_sides(len(wins), wins)
        # กล่องรูปจริงบนเฟรมสุดท้ายของ fmt-versus: รูป 400×380 อยู่ในขอบ 4px ของการ์ด (left 30 top 18) แล้วการ์ดผู้ชนะขยาย 1.07
        # รอบจุดกลางช่อง (230, 260) → กลาง (294.3 | 794.3, 888.6) ขนาด 428×406.6 · ค่าเดิม 290,884,428² ซองกระโดด ~4px โตขึ้น 5%
        return {**it, "key": f"img{champ}", "src": f"{294 if side[champ] == 'L' else 794},889,428,407,0"}
    if fmt == "quiz" and sc.get("sku"):
        return {"sku": sc["sku"], "name": sc.get("name") or sc["sku"], "tag": sc.get("tag") or "",
                "say": sc.get("say") or sc.get("name") or sc["sku"], "key": "img", "src": SRC["quiz"]}
    return None


# ── ตรวจกติกา ────────────────────────────────────────────────────────────────────────────────────

def _norm(s):
    s = unicodedata.normalize("NFC", s or "")
    return re.sub(r"[\s·•,!?…]+", "", s)


def cta_check(lines, scene, rec=None):
    """ข้อความบนจอที่ต้องได้ยิน ต้องอยู่ในเสียงทุกคำ · ทุกบรรทัด ≤ 90 ตัวหลัง sanitize → รายการปัญหา (ว่าง = ผ่าน)"""
    errs = []
    voice = _norm(" ".join(lines))
    keys = [k for k in SPOKEN_KEYS + (("kicker",) if rec and rec.get("kicker") else ())
            if k not in SPOKEN_EXEMPT.get(scene.get("layout"), ())]
    for k in keys:
        v = scene.get(k)
        if isinstance(v, str) and v.strip() and _norm(v) not in voice:
            errs.append(f"{k} '{v}' ไม่อยู่ในเสียง")
    for ln in lines:
        s = sanitize(ln)
        if len(s) > MAX_LINE:
            errs.append(f"บรรทัดยาว {len(s)} > {MAX_LINE}: {s}")
        if s != ln.strip():
            errs.append(f"sanitize เปลี่ยนข้อความ (มี URL/วงเล็บ/แฮชแท็ก?): {ln}")
    banned = ("หมด", "เหลือน้อย", "ใกล้หมด", "หายาก", "ของแถม", "ลุ้นรางวัล", "ตอนหน้า", "กดติดตาม", "รู้ก่อนใคร", "ทุกครั้ง")
    shown = " ".join(str(v) for v in scene.values() if isinstance(v, str)) + " " + " ".join(lines)
    for w in banned:
        if w in shown:
            errs.append(f"มีคำต้องห้าม '{w}'")
    if scene.get("layout") == "line":                 # ข้อความที่คนดูได้ยิน/เห็น (ไม่รวมชื่อไฟล์ QR)
        said = " ".join(lines) + " " + " ".join(str(scene.get(k) or "") for k in ("q1", "q2", "hint", "lineid"))
        for pat in LINE_BANNED:
            m = re.search(pat, said)
            if m:
                errs.append(f"ฉากไลน์มีคำต้องห้าม '{m.group(0)}' (ไลน์รับแจ้งปัญหา ไม่ได้ประกาศข่าว/โปร · ไม่สัญญาเวลาตอบ)")
        if re.search(r"\d", said):
            errs.append("ฉากไลน์ห้ามมีตัวเลข (เวลาตอบ/ราคา/จำนวน)")
    return errs


# ── เลือกได้ไหม (data guard) ───────────────────────────────────────────────────────────────────────

def candidates(fmt, plan, snap):
    """แบบที่ใช้ได้กับคลิปนี้ → [(layout, mode, weight, ctx)] ตามน้ำหนักใน WEIGHTS"""
    sc = (plan.get("scenes") or [{}])[0]
    out = []
    for layout, w in WEIGHTS.get(fmt, []):
        if layout == "team":
            n = len(sc.get("items") or [])
            if (fmt == "versus" and 2 <= n <= 4 and sc.get("rounds")) or (fmt == "rank" and n == 5):
                out.append((layout, fmt, w, {}))
        elif layout == "spot":
            if fmt == "quiz" and sc.get("sku"):
                out.append((layout, "quiz", w, {}))
        elif layout == "board":
            if fmt == "map":
                out.append((layout, "branch", w, {}))
            else:
                hero = hero_of(fmt, plan)
                mode, lit, asof = pack_where(hero["sku"], snap) if hero else (None, [], None)
                if mode:
                    out.append((layout, "pack", w, {"hero": hero, "mode": mode, "lit": lit, "asof": asof}))
        elif layout == "shelf":
            mach = plan.get("machine")
            if mach and (fmt == "map" or fmt == "rank"):
                shelf = machine_shelf(mach, snap)
                if shelf and len(shelf["items"]) >= 6:
                    out.append((layout, "shelf", w, {"shelf": shelf, "in_stock": set(snap["packs"].get(mach, ()))}))
        elif layout == "steps":
            out.append((layout, "steps", w, {}))
        elif layout == "line":
            if (TEMPLATE / LINE_QR).exists():
                out.append((layout, "line", w, {}))
    return out


def variants(layout, mode, fmt, plan, ctx):
    """ระเบียนข้อความที่ใช้ได้ (ตามข้อมูล/รูปแบบ) — ผู้กำกับเลือกต่อแบบเลี่ยงของที่เพิ่งใช้"""
    if layout == "team":
        recs = CTA_COPY["team"][fmt]
    elif layout == "spot":
        recs = CTA_COPY["spot"]["quiz"]
        if (plan.get("copy") or {}).get("count") == 0:          # บรรทัดนับขอคอมเมนต์ไปแล้ว → V3 ไม่ขอซ้ำ
            recs = [r for r in recs if r["id"] == "V3"]
    elif layout == "board":
        recs = CTA_COPY["board"]["branch" if mode == "branch" else "pack"]
    elif layout == "shelf":
        recs = [r for r in CTA_COPY["shelf"]["any"] if fmt in r.get("formats", [fmt])]
        ranked = {it["sku"] for it in ((plan.get("scenes") or [{}])[0].get("items") or [])}
        if not (fmt == "rank" and len(ranked) == 5 and ranked <= ctx.get("in_stock", set())):
            recs = [r for r in recs if r["id"] != "S3"]          # S3 อ้าง "มีครบทั้ง 5" — ต้องเช็กกับของทั้งตู้
    elif layout == "steps":
        recs = [r for r in CTA_COPY["steps"]["any"] if fmt in r.get("formats", [fmt])]
        long_script = len((plan.get("script") or "").replace("\n", "")) >= 340
        if fmt in ("rank", "versus") or long_script:            # คลิปยาวอยู่แล้ว → บรรทัดเดียว
            recs = [r for r in recs if r.get("short")]
    else:
        recs = CTA_COPY["line"]["any"]
    return recs


# ── ประกอบฉาก ───────────────────────────────────────────────────────────────────────────────────

def _fill(s, **kw):
    return s.format(**kw) if isinstance(s, str) else s


def cta_plan(fmt, plan, layout, mode, rec, ctx, snap):
    """→ (บรรทัดปิด [1–2], ฉากปิด dict, extend ใหม่ของฉากก่อนหน้า | None, ข้อมูลกำกับ plan['cta'])"""
    sc0 = (plan.get("scenes") or [{}])[0]
    hold, min_on = TIMING.get(f"{layout}:{mode}", TIMING[layout])
    scene = {"type": "cta", "layout": layout, "mode": mode, "variant": rec["id"], "hold": hold, "min_on": min_on,
             "fmt": fmt}
    inherit = list(INHERIT.get(fmt, []))
    prev_extend = None
    meta = {"layout": layout, "mode": mode, "variant": rec["id"]}

    if layout == "team":
        sc = sc0
        if fmt == "versus":
            wins = [int(r["win"]) for r in sc["rounds"]]
            champ = sc["items"][wins[-1] - 1]
            kw = {"w_say": champ.get("say") or champ.get("name")}
            scene.update({"stamp": sc.get("sub") or "", "final": sc.get("final") or "",
                          "tie": int(sc["rounds"][-1].get("tie") or 0),
                          "n": len(sc["items"]), "src": hero_of(fmt, plan)["src"]})
        else:
            kw = {"top_say": sc["items"][0].get("say") or sc["items"][0].get("name")}
            scene.update({"stamp": sc.get("sub") or "", "final": "", "tie": 0, "n": len(sc["items"]),
                          "src": SRC["rank"]})
        lines = [_fill(v, **kw) for v in rec["voice"]]
        scene.update({k: rec.get(k, "") for k in ("title", "ask", "kicker")})
        scene["tpx"] = fit_px(scene["title"], 900, 900, 104, 60)
        scene["apx"] = fit_px(scene["ask"], 900, 860, 58, 40)
        scene["mode"] = fmt

    elif layout == "spot":
        lines = list(rec["voice"])
        scene.update({k: rec.get(k, "") for k in ("title", "callout", "chips", "q3", "ask")})
        scene.update({"kicker": "เฉลยจุดซูม", "zf": "0.86|0.72|0.6", "src": SRC["quiz"],
                      "tpx": fit_px(rec["title"], 900, 900, 104, 60),
                      "cpx": fit_px(rec.get("callout", ""), 800, 760, 44, 30),
                      "fs": fit_px(sc0.get("name") or "", 900, 860, 72, 44)})
        prev_extend = 0.6

    elif layout == "board" and mode == "branch":
        rows = snap["rows"] if snap.get("rows") else F.branches()
        focus = plan.get("machine")
        malls = {r["mall"] for r in rows}
        fmall = next((r["mall"] for r in rows if r["machine_id"] == focus), None)
        k_out = sum(1 for r in rows if r["mall"] != fmall)
        kw = {"k_other": len(rows) - 1, "k_out": k_out, "m_out": len(malls) - (1 if fmall else 0),
              "n": len(rows), "m": len(malls)}
        lines = [_fill(v, **kw) for v in rec["voice"]]
        tiles, tpx, cols = branch_tiles(rows, focus)
        scene.update({k: _fill(rec.get(k, ""), **kw) for k in ("q1", "q2", "sub", "ask")})
        scene.update({"kicker": f"{len(rows)} ตู้ ใน {len(malls)} ห้าง", "tiles": tiles, "tpx": tpx, "cols": cols,
                      "url": STOCK_URL, "foot": BOARD_FOOT,
                      "qs1": fit_px(scene["q1"], 900, 900, 104, 60), "qs2": fit_px(scene["q2"], 900, 900, 104, 60),
                      "src": SRC["map"]})
        if fmt == "map":                              # พลิกต่อจากการ์ดรูปตู้ของคลิปพิกัด
            prev_extend = 0.6
        else:                                         # ทางสำรองของรูปแบบอื่น — ไม่มีการ์ดรูปตู้ให้พลิก
            inherit, scene["photo"] = [], ""

    elif layout == "board":
        hero, where, lit, asof = ctx["hero"], ctx["mode"], ctx["lit"], ctx["asof"]
        lead = {"rank": "อันดับหนึ่ง ", "versus": "แชมป์ ", "quiz": "ซองเฉลย "}.get(fmt, "")
        kw = {"lead": lead, "say": hero.get("say") or hero["name"]}
        lines = [_fill(v, **kw) for v in rec["voice_all" if where == "all" else "voice_some"]]
        head = "ล่าสุดมีครบทุกสาขา" if where == "all" else "ล่าสุดมีที่สาขาเหล่านี้"
        tiles, tpx, cols = branch_tiles(lit)
        d_short, _ = th_day(asof)
        hero_name = hero["name"] if re.match(r"^(OP|EB|PRB|FB)-", hero["name"] or "") else (hero.get("say") or hero["name"])
        scene.update({"stamp_l": f"สต็อก ณ {d_short}", "stamp_r": "เช็กหน้าเว็บก่อนไป", "hero_name": hero_name,
                      "hfs": fit_px(hero_name, 900, 600, 44, 28), "head": head,
                      "hpx": fit_px(head, 900, 900, 88, 56), "tiles": tiles, "tpx": tpx, "cols": cols,
                      "url": STOCK_URL, "foot": BOARD_FOOT, "src": hero["src"]})
        scene["inherit_map"] = {"hero": hero["key"]}
        inherit = []
        meta.update({"stock_asof": str(asof), "hero_sku": hero["sku"], "where": where, "lit": len(lit)})

    elif layout == "shelf":
        shelf = ctx["shelf"]
        mach = plan.get("machine")
        row = next((r for r in snap["rows"] if r["machine_id"] == mach), {})
        floor = re.sub(r"^ชั้น\s*", "", row.get("floor") or "")
        frs = shelf["franchises"]
        fr_say = " ".join(frs[:3]) + (" และค่ายอื่น" if len(frs) > 3 else "")
        kw = {"fr_say": fr_say}
        lines = [_fill(v, **kw) for v in rec["voice"]]
        d_short, _ = th_day(shelf["asof"])
        photo = F.branch_photo(mach) or ""
        if rec["id"] == "S3":                       # "ทั้ง 5 ชุดในอันดับ" → ชั้นต้องโชว์ 5 ชุดนั้นจริง (+1 ชุดอื่นในตู้)
            ranked = [it for it in sc0.get("items") or []][:5]
            extra = [it for it in shelf["items"] if it["sku"] not in {r["sku"] for r in ranked}][:1]
            shelf = dict(shelf, items=[{k: it[k] for k in ("sku", "name", "tag")} for it in ranked] + extra)
        scene.update({k: rec.get(k, "") for k in ("kicker", "head", "foot")})
        scene.update({"photo": photo, "floor": floor, "mall": row.get("mall") or "",
                      "sub": f"{row.get('mall') or ''} ชั้น {floor} · สต็อก ณ {d_short}",
                      "hpx": fit_px(scene["head"], 900, 700, 96, 60),
                      "fr": " · ".join(frs[:3]) + (" และค่ายอื่น" if len(frs) > 3 else ""),
                      "more": 1 if shelf["more"] or len(frs) > 3 else 0,
                      "src": SRC["map"] if fmt == "map" else SRC["rank"]})
        for k, it in enumerate(shelf["items"][:6], 1):
            scene[f"p{k}"] = f"sku:{it['sku']}"
            scene[f"n{k}"] = it["name"]
            # ป้าย 2 บรรทัด: ค่ายบน ชื่อชุดล่าง — "SEA02" เฉย ๆ ไม่รู้ว่า MLBB · รหัส OP/FB บอกตัวเองแล้ว (ค่ายว่าง)
            scene[f"t{k}"] = "" if re.match(r"^(OP|EB|PRB|FB)-", it["name"] or "") else (it.get("tag") or "")
        scene["lpx"] = min(fit_px(it["name"], 800, 240, 30, 22) for it in shelf["items"][:6])
        if rec["id"] == "S3":
            ranked = [it["sku"] for it in sc0.get("items") or []]
            for slot, it in enumerate(shelf["items"][:6], 1):
                if it["sku"] in ranked:
                    scene[f"rank{ranked.index(it['sku']) + 1}"] = slot
        inherit = ["photo"] if fmt == "map" else []
        prev_extend = 0.6 if fmt == "map" else None
        meta.update({"stock_asof": str(shelf["asof"]), "machine": mach})

    elif layout == "steps":
        lines = [_fill(v, steps_line=STEPS_LINE) for v in rec["voice"]]
        scene["_line_b"] = lines[-1]                  # hf_render หาเวลาพูดชื่อแต่ละขั้นจากบรรทัดนี้ (ไม่ส่งเข้าฉาก)
        scene.update({"label": "วิธีการซื้อ", "q1": rec["q1"], "q2": rec.get("q2", ""),
                      "qs1": fit_px(rec["q1"], 900, 900, 104, 60),
                      "qs2": fit_px(rec.get("q2") or "", 900, 900, 124, 60) if rec.get("q2") else 0,
                      "url": HOWTO_URL, "foot": "▶ ดูคลิปวิธีกดตู้ · " + HOWTO_URL})
        for k, (big, small) in enumerate(HOWTO_STEPS, 1):
            scene[f"s{k}"], scene[f"d{k}"] = big, small
        hero = hero_of(fmt, plan)
        # คลิปพิกัด: กรอบการ์ดรูปตู้หดลงเป็นช่องขั้น 1 — ต้องส่งรูปตู้ต่อมาด้วย ไม่งั้นเหลือกรอบเปล่าค้าง ~0.4 วิ (ทดสอบ 16 ต.ค.)
        inherit = ["photo"] if fmt == "map" else []
        if hero:
            scene["inherit_map"] = {"icon1": hero["key"]}
            scene["src"] = hero["src"]
        else:
            scene["icon1"] = ""
            scene["src"] = SRC.get(fmt, "540,960,600,600,0")
        # คำแรกของบรรทัดนี้คือหัวเรื่องของฉากปิดเอง (ไม่เกี่ยวกับภาพรูปแบบ) — ฉากก่อนหน้าค้างนานเท่าไหร่ หัวเรื่องถูกพูดก่อนขึ้นจอเท่านั้น
        # (ทดสอบ quiz → steps: ค้างตามปกติ 1.2 วิ เสียงพูด "กดตู้ 4 ขั้น" จบไปแล้วตอนหัวเรื่องเพิ่งโผล่) · เหลือ 0.6 ให้เฉลยยังได้ค้างบ้าง
        prev_extend = 0.3 if rec.get("short") and fmt in ("rank", "versus") else 0.6

    else:  # line
        lines = list(rec["voice"])
        scene.update({k: rec.get(k, "") for k in ("q1", "q2", "hint")})
        scene.update({"qr": LINE_QR, "lineid": LINE_ID, "qs1": fit_px(rec["q1"], 900, 900, 112, 60),
                      "qs2": fit_px(rec["q2"], 900, 900, 92, 60)})
        inherit = []
        prev_extend = 0.6                             # เหตุผลเดียวกับ steps — คำแรกคือหัวเรื่องของฉากนี้

    scene["span"] = len(lines)
    if inherit:
        scene["inherit"] = inherit
    return lines, scene, prev_extend, meta


# ── ตรวจตัวเอง: python -m agents.video.hf_cta --check ─────────────────────────────────────────────────

def selfcheck():
    """คลังข้อความทุกระเบียน (เติมค่ายาวสุดที่เป็นไปได้) ผ่าน cta_check · กฎคำต้องห้ามฉากไลน์ปัดตกจริงทุกคำ
    · ขั้นตอนซื้อตรงกับหน้า /how-to ตัวจริง"""
    errs = []
    longest = {"w_say": "Pokémon MEGA Dream ex", "top_say": "Pokémon MEGA Dream ex", "lead": "อันดับหนึ่ง ",
               "say": "Pokémon MEGA Dream ex", "k_other": 11, "k_out": 11, "m_out": 10, "n": 12, "m": 11,
               "fr_say": "One Piece Pokémon Dragon Ball Super และค่ายอื่น", "steps_line": STEPS_LINE}
    for layout, groups in CTA_COPY.items():
        for mode, recs in groups.items():
            for rec in recs:
                for vk in ("voice", "voice_all", "voice_some"):
                    if vk not in rec:
                        continue
                    lines = [v.format(**longest) for v in rec[vk]]
                    scene = {"layout": layout}
                    scene.update({k: (v.format(**longest) if isinstance(v, str) else v) for k, v in rec.items()
                                  if k not in ("voice", "voice_all", "voice_some", "id", "formats", "short")})
                    errs += [f"{layout}/{mode}/{rec['id']}/{vk}: {e}" for e in cta_check(lines, scene, rec)]
    # กฎฉากไลน์: ทุกตัวใน LINE_BANNED ใส่ในประโยคไลน์ปกติแล้วต้องโดนปัดตกจริง · ประโยคปกติ/"ไว้" ต้องผ่าน · ตัวเลขต้องโดน
    for pat in LINE_BANNED:
        ex = LINE_BANNED_EXAMPLE.get(pat, pat)
        hit = re.search(pat, ex)
        got = cta_check([f"ทักไลน์มาได้เลย {ex}"], {"layout": "line"})
        if not hit or not any(e.startswith(f"ฉากไลน์มีคำต้องห้าม '{hit.group(0)}'") for e in got):
            errs.append(f"กฎฉากไลน์หลวม: '{ex}' ไม่ถูกปัดตก")
    for ok in ("ทักไลน์มาได้เลย", "แอดไลน์ไว้ก่อนเลย", "เก็บ QR ไว้ แล้วทักมาบอกเรา"):
        got = cta_check([ok], {"layout": "line"})
        if got:
            errs.append(f"กฎฉากไลน์แรงเกิน: '{ok}' โดน {got}")
    if not any("ตัวเลข" in e for e in cta_check(["ทักไลน์มาได้ 24 ชม."], {"layout": "line"})):
        errs.append("กฎฉากไลน์หลวม: ตัวเลขไม่ถูกปัดตก")
    page = (TEMPLATE.parents[2] / "deploy" / "app" / "how-to" / "page.jsx").read_text(encoding="utf-8")
    for big, small in HOWTO_STEPS:                    # ทั้งชื่อขั้นและคำอธิบายต้องมีอยู่ในหน้าจริงทุกตัวอักษร
        if big not in page or small not in page:
            errs.append(f"ขั้นตอน '{big}' / '{small}' ไม่ตรงกับหน้า /how-to")
    return errs


if __name__ == "__main__":
    import sys
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    problems = selfcheck()
    print("\n".join(problems) if problems else
          f"คลังข้อความฉากปิด: ผ่านทุกระเบียน · กฎฉากไลน์ปัดตกครบ {len(LINE_BANNED)} คำ + ตัวเลข · ขั้นตอนซื้อตรงกับ /how-to")
    sys.exit(1 if problems else 0)
