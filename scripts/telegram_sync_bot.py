#!/usr/bin/env python3
"""บอทปุ่มซิงค์ในห้อง Telegram — รันจากเครื่องนี้ ระหว่าง GitHub Actions ใช้ไม่ได้

ทำไมต้องเป็นบอทตัวใหม่ ไม่ใช้บอทแอดมินเดิม (11 ก.ย. 2026):
    บอทเดิมตั้ง webhook ชี้ Vercel ไว้แล้ว (ปุ่มยืนยัน slot ใช้อยู่) — Telegram
    ให้บอทหนึ่งตัวรับข้อความได้ทางเดียว จะมา getUpdates ซ้อนไม่ได้ (409)
    และระหว่างบัญชี GitHub โดนแฟล็ก เราแก้โค้ดฝั่ง Vercel ไม่ได้ด้วย
    (push ไม่ deploy — Vercel มองไม่เห็น repo)

การทำงาน:
    - long-poll getUpdates ด้วย token ของบอทซิงค์ (SYNC_BOT_TOKEN ใน deploy/.env.local)
    - /start ครั้งแรกในกลุ่มไหน = ผูกบอทกับกลุ่มนั้น (จำใน scripts/.sync_bot_state.json)
      หลังผูกแล้วรับคำสั่งจากกลุ่มนั้นกลุ่มเดียว — กลุ่ม/คนอื่นส่งมาโดนเมิน
    - ปุ่มถาวร (reply keyboard): ซิงค์สต็อก / ซิงค์ทั้งหมด · หรือพิมพ์ /stock /sync /sales
    - แผงปุ่มในตัวข้อความ (inline · /panel): ทุกคนในห้องเห็นและกดได้ ปักหมุดไว้ใช้ได้ตลอด
      ⚠️ reply keyboard แสดงผล **รายคน** — คนที่เข้ากลุ่มทีหลังหรือเคยกดซ่อนคีย์บอร์ดจะไม่เห็นปุ่มเลย
         (เจอจริง 16 ก.ย. 2026: เจ้าของเห็นปุ่ม แต่แอดมินอีกคนในห้องเดียวกันไม่เห็น จึงสั่งซิงค์ไม่ได้)
    - รันจริงผ่าน scripts/sync_local.py (ตัวเดียวกับที่ workflow ใช้) ทีละงาน ห้ามซ้อน
    - **ซิงค์อัตโนมัติเที่ยงคืน** แทน cron ของ GitHub ที่ใช้ไม่ได้ (ดูหัวข้อล่าง)
    - **ซิงค์สต็อกระหว่างวัน** 10:00 ตอนห้างเปิด ตั้งเพิ่มรอบได้ (ดูหัวข้อล่าง)

ซิงค์อัตโนมัติ (13 ก.ย. 2026):
    เดิม GitHub Actions รันให้ 00:00/00:05 แต่บัญชีถูกแฟล็ก cron เลยตายไปด้วย
    บอทตัวนี้รันค้างอยู่แล้ว 24 ชม. จึงให้มันจับเวลาเองเลย ไม่ต้องพึ่ง Task Scheduler

    ⚠️ ต่างจาก cron ตรงที่ **เครื่องต้องเปิดอยู่** — จึงไม่ใช้ "ยิงตอนเที่ยงคืนเป๊ะ ๆ"
    แต่ใช้ "วันนี้ยังไม่ได้ซิงค์หรือยัง" เป็นเงื่อนไขแทน เครื่องปิดข้ามคืนแล้วมาเปิด
    ตอนเช้า บอทจะรันชดเชยให้ทันทีที่ตื่นมา และไล่เก็บย้อนหลังทีละ 5 วันถ้าขาดหลายวัน
    (sync_local ปฏิเสธช่วงเกิน 5 วัน เพราะ VMS ตัดข้อมูล)

    สั่งได้ในห้อง: /auto (ดูสถานะ) · /auto on|off · /auto 00:30 (เปลี่ยนเวลา)

เก็บไอเดียคอนเทนต์ประจำวัน (15 ก.ย. 2026):
    หน้า /marketing โซน "ไอเดียวันนี้" ค้างของวันที่ 9 ก.ย. อยู่ 6 วัน (เจ้าของทัก) เพราะ
    idea-collector.yml ก็เป็น cron ของ GitHub ที่ตายไปพร้อมบัญชี · ย้ายมาไว้ที่นี่ด้วยเงื่อนไข
    แบบเดียวกับซิงค์ — "วันนี้เก็บหรือยัง" ไม่ใช่ "ตี 7 พอดีหรือยัง" เปิดเครื่องสายก็ได้ของครบ
    ขั้นตอนเหมือน workflow: idea_collector.py → idea_angles.py --limit 40
    (ขั้นคิดมุมล้มไม่นับว่าล้ม — ไอเดียยังอยู่ครบ แค่ใช้มุมจาก template ไปก่อน)

    ⚠️ ใช้ล็อกแยกจากซิงค์ — ขั้นคิดมุมเว้นจังหวะ 5 วิต่อชิ้น วัดจริง 18 นาทีกับ 19 ชิ้น
       ถ้าใช้ล็อกเดียวกัน คนกดซิงค์สต็อกก่อนออกไปเติมตู้จะโดนบอกให้รอเฉย ๆ
    ⚠️ ถ้า GitHub กลับมาแล้ว workflow รันซ้ำก็ไม่เป็นไร — ตัวเก็บกันซ้ำด้วย external_key
       และขั้นคิดมุมทำเฉพาะไอเดียที่ยังไม่มีมุม

    สั่งได้ในห้อง: /ideas (เก็บเดี๋ยวนี้) · /ideas on|off

สรุปยอด+กำไร รายวัน/รายสัปดาห์ (30 ต.ค. 2026):
    รายวัน = ของเมื่อวานทุกเช้า · รายสัปดาห์ = จันทร์–อาทิตย์ที่แล้ว ทุกวันจันทร์ (เครื่องปิดวันจันทร์ ชดเชยได้ถึงพุธ)
    07:45 ดึงยอดขายจากตู้อีกรอบ (ถือล็อกเดียวกับซิงค์) → ส่งไม่ก่อน 08:00 ผ่าน deploy/agents/daily_sales_digest.py
    ซึ่งส่งเองด้วยบอท DVX Job (TELEGRAM_MKT_*) เข้าแชตเจ้าของ + กลุ่ม DVX_Admin (TELEGRAM_DVX_ADMIN_CHAT_ID)
    ห้องนี้เห็นเฉพาะตอนล้ม/ตอนกดเอง · เงื่อนไข "วันนี้ส่งหรือยัง" แบบเดียวกับงานอื่น

    สั่งได้ในห้อง: /digest (รายวันเดี๋ยวนี้) · /digest week (รายสัปดาห์เดี๋ยวนี้) · /digest on|off

สำรองข้อมูล + โพสต์อัตโนมัติ (16 ก.ย. 2026):
    GitHub ยังไม่ปลดแฟล็ก (ครบ 6 วันแล้ว) เจ้าของเลือกย้ายสองงานนี้มาก่อน
      · สำรองข้อมูล  — ของเดิมรายสัปดาห์ (weekly-backup.yml) ขาดไปหนึ่งรอบแล้ว
      · โพสต์อัตโนมัติ — เคาะ /api/marketing/content/publish-due ทุก 15 นาที (marketing-autopost.yml)
        ⚠️ ของเดิมรันบนคลาวด์โดยตั้งใจ "โพสต์ต้องขึ้นแม้คอมปิด" — ย้ายมาที่นี่แล้วข้อนี้หายไป
           เครื่องปิด = โพสต์ไม่ออกจนกว่าจะเปิด (ปลายทางยังโพสต์ให้อยู่ แค่ช้ากว่าเวลาที่ตั้ง)
    สั่งได้ในห้อง: /backup (สำรองเดี๋ยวนี้) · /backup on|off · /autopost (เคาะเดี๋ยวนี้) · /autopost on|off

ซิงค์สต็อกระหว่างวัน (17 ต.ค. 2026):
    หน้าเช็กของในตู้สาธารณะบนเว็บ (/stock) อ่านจาก DB ตรง ๆ จึงสดเท่ารอบซิงค์ล่าสุด ซึ่งเดิมมีแค่ 00:10
    เจ้าของเปิดคอมไว้ตลอด ขอรอบ 10:00 ตอนห้างเปิดเป็น "รอบแรก" → เก็บเป็นรายการเวลา ตั้งเพิ่มได้
    แต่ละรอบทำแบบเดียวกับปุ่ม "ซิงค์ทั้งหมด" (ยอดขายไล่จากตัวชี้ → สต็อก) แล้วรายงานผลข้อความเดียว
    ล้มแล้วลองใหม่อีกครั้งหลัง 30 นาที (เวลาลองใหม่เลย/ชิดเที่ยงคืน = ไม่ลอง ปล่อยรอบเที่ยงคืนเก็บ)
    · ค้างหลายรอบรันครั้งเดียวจบ · เลยเวลารอบเกิน 4 ชม. ข้ามของวันนั้น
    · ลองใหม่ที่ไม่ได้เกิดตามนัด (บอทดับ/เครื่องหลับ/ปิดรอบไว้) แล้วเลย 4 ชม. = นับเป็นล้มของวันนั้น ไม่รันย้อนตอนค่ำ
    · ซิงค์ครบยอดขาย→สต็อก (ปุ่ม "ซิงค์ทั้งหมด"/รอบเที่ยงคืน/รอบกลางวันเอง) ที่จบหลังเวลารอบไหน นับแทนรอบนั้นเลย ไม่ซิงค์ซ้ำ
    · รอบเที่ยงคืนของวันนั้นยังค้าง (เครื่องเพิ่งเปิด/รอลองใหม่) รอบกลางวันรอ — รอบนั้นดึงทั้งยอดขายและสต็อกอยู่แล้ว
    · ตั้งรอบใหม่ที่เวลาของวันนี้ผ่านไปแล้ว = เริ่มพรุ่งนี้ ไม่รันชดเชยทันที
    ตั้งได้ไม่เกิน 6 รอบ ห่างกันและห่างจากเวลารอบเที่ยงคืน (/auto) อย่างน้อย 1 ชม. ไม่เกิน 23:00
    — ทุกรอบดึงจากหลังบ้านตู้ทุกยี่ห้อ ถี่เกินเสี่ยงโดนบล็อก (/auto HH:MM ที่ชนรอบกลางวันก็ไม่รับเหมือนกัน)
    /auto off ปิดรอบพวกนี้ไปด้วย — ข้อความของคำสั่งนั้นบอกคนในห้องว่า "ต้องกดปุ่มเอาเอง"

    สั่งได้ในห้อง: /rounds (ดูสถานะ) · /rounds 10:00,15:00 (ตั้งเวลา) · /rounds on|off

รัน:  .venv-image\\Scripts\\python.exe scripts\\telegram_sync_bot.py
"""
import html as _html
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

# ปกติรันด้วย pythonw ที่ไม่มี stdout เลย print จึงหายไปเงียบ ๆ ไม่มีปัญหา
# แต่ถ้าใครรันจาก console หรือ redirect ลงไฟล์ log ค่าปริยายบน Windows คือ cp1252/cp874
# ซึ่งพิมพ์ไทยไม่ออก แล้วโยน UnicodeEncodeError ตาย**ตั้งแต่บรรทัดแรกของ main()**
if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "deploy" / ".env.local"
STATE_FILE = pathlib.Path(__file__).parent / ".sync_bot_state.json"
SYNC_SCRIPT = pathlib.Path(__file__).parent / "sync_local.py"
IDEA_COLLECTOR = ROOT / "deploy" / "agents" / "idea_collector.py"
IDEA_ANGLES = ROOT / "deploy" / "agents" / "idea_angles.py"
# เฝ้าเพจ FB/IG/Reddit ที่ติดตามไว้ (21 ต.ค. 2026) — ต้องใช้ Chrome profile Research บนเครื่องนี้ จึงอยู่ในบอท
# ไม่อยู่ใน idea_collector.py (ตัวนั้นรันบน GitHub Actions ด้วย ซึ่งไม่มี Chrome/บัญชี)
SOCIAL_WATCH = ROOT / "deploy" / "agents" / "social_watch.py"
# รายงานบทเรียนรายสัปดาห์จากคลังของตัวเฝ้าเพจ — เรียกทุกรอบ ตัวสคริปต์เงียบเองถ้าสัปดาห์นี้ส่งไปแล้ว
SOCIAL_INSIGHT = ROOT / "deploy" / "agents" / "social_insight.py"
# อ่านต้นฉบับก่อนคิดมุม (23 ต.ค. 2026) — ถอดคำบรรยายคลิป YouTube → summary 📌 + มุมที่อิงเนื้อหาจริง
# เจ้าของ: AI เขียนโดยไม่อ้างอิงต้นฉบับ (#69 คลิปล้อโฆษณาในเกม → โพสต์กติกาสลับเบนช์) · ต้องมี yt-dlp (~/.agent-reach-venv)
SOURCE_NOTES = ROOT / "deploy" / "agents" / "source_notes.py"
# สรุปยอด+กำไรของเมื่อวานรายวัน (30 ต.ค. 2026) — บอท DVX Job ส่งเข้าแชตเจ้าของ + กลุ่ม DVX_Admin
# อยู่ในบอทนี้ไม่ใช่ GitHub เพราะต้องตรงเวลา 08:00 (cron ที่นั่นเลื่อนได้หลายชั่วโมง) และต้องดึงยอดรอบเช้าก่อน
DAILY_DIGEST = ROOT / "deploy" / "agents" / "daily_sales_digest.py"

BTN_STOCK = "🔄 ซิงค์สต็อกหน้าตู้"
BTN_ALL = "📊 ซิงค์ทั้งหมด (ยอดขาย+สต็อก)"
KEYBOARD = {"keyboard": [[{"text": BTN_STOCK}], [{"text": BTN_ALL}]],
            "resize_keyboard": True, "is_persistent": True}

# ── แผงปุ่มในตัวข้อความ (inline) — เพิ่ม 16 ก.ย. 2026 ──
# ปุ่ม inline ติดอยู่กับ "ข้อความ" ไม่ใช่กับ "ช่องพิมพ์ของแต่ละคน" → ทุกคนในห้องเห็นเหมือนกัน
# และกดได้ทุกคน · ปักหมุดข้อความนี้ = มีปุ่มถาวรอยู่บนสุดของห้อง ไม่ต้องเลื่อนหา
PANEL = {"inline_keyboard": [
    [{"text": BTN_STOCK, "callback_data": "stock"}],
    [{"text": BTN_ALL, "callback_data": "sync"}],
    [{"text": "💡 เก็บไอเดีย", "callback_data": "ideas"},
     {"text": "💾 สำรองข้อมูล", "callback_data": "backup"}],
    [{"text": "📋 สถานะ", "callback_data": "status"}],
]}
PANEL_TEXT = ("🎛 <b>แผงควบคุม DivisionX</b>\n"
              "กดปุ่มได้เลย — ทุกคนในห้องนี้กดได้ ผลจะรายงานกลับมาที่ห้องนี้\n\n"
              "<i>แนะนำให้ปักหมุดข้อความนี้ไว้ (กดค้างที่ข้อความ → ปักหมุด) "
              "จะได้กดจากบนสุดของห้องได้ตลอด ไม่ต้องเลื่อนหา</i>")

# ── ค่าตั้งของรอบอัตโนมัติ ──
# 00:10 ไม่ใช่ 00:00 เป๊ะ — เผื่อให้หลังบ้านตู้ปิดยอดของวันให้เรียบร้อยก่อน
AUTO_AT_DEFAULT = "00:10"
AUTO_TICK = 30          # วินาที · ถี่แค่ไหนก็ได้ ตัวเช็คเป็นแค่การเทียบเวลา
AUTO_RETRY_MIN = 30     # ล้มแล้วรอเท่านี้ค่อยลองใหม่
AUTO_MAX_TRIES = 3      # ลองครบเท่านี้แล้วยอมแพ้ของวันนั้น (กันวนรัวทั้งคืน)
MAX_SPAN = 5            # sync_local ปฏิเสธช่วง backfill เกิน 5 วัน
# ดึงย้อนทับซ้อนกี่วันทุกรอบ — กันวันที่หลุดไปแล้วกู้คืนไม่ได้ (ดูเหตุผลเต็มใน sales_chunks)
# ยอมจ่ายการดึงซ้ำ 2 วันทุกคืน แลกกับการไม่ต้องมานั่งไล่หายอดที่หายไปทีหลัง
SALES_OVERLAP_DAYS = 2

# ── ค่าตั้งของรอบเก็บไอเดีย ──
# 07:00 ตามเวลาเดิมของ workflow และข้อความบนหน้า /marketing ("ตัวเก็บไอเดียรันทุกเช้า 07:00 น.")
IDEAS_AT_DEFAULT = "07:00"

# สรุปยอดรายวัน: ดึงยอดขายจากตู้อีกรอบตอน 07:45 แล้วส่งสรุปไม่ก่อน 08:00 (เจ้าของขอ "ช่วง 08.00 น.")
# เครื่องปิดตอนเช้า = เปิดเมื่อไหร่ดึง+ส่งชดเชยทันที (สรุปของเมื่อวานเสมอ)
DIGEST_AT_DEFAULT = "07:45"
DIGEST_SEND_AT = "08:00"
DIGEST_SYNC_WAIT_SEC = 2400    # งานซิงค์อื่นถือล็อกอยู่ (เช่นรอบเที่ยงคืนชดเชย) รอได้นานเท่านี้
# สรุปรายสัปดาห์ (จันทร์–อาทิตย์ที่แล้ว) ส่งวันจันทร์ · เครื่องปิดวันจันทร์ = ชดเชยได้ถึงวันพุธ (weekday 0–2)
WEEKLY_CATCHUP_DAYS = 2
DIGEST_RESYNC_MIN = 60         # รอบลองใหม่ไม่ดึงยอดซ้ำถ้าเพิ่งดึงสำเร็จภายในเท่านี้
DIGEST_EXIT_GROUP_FAILED = 3   # รหัสออกจาก daily_sales_digest.py: แชตเจ้าของได้แล้ว กลุ่มล้ม
IDEAS_ANGLE_LIMIT = "40"   # เท่ากับ workflow · โควตา Gemini ฟรีมีจำกัด

# ── ค่าตั้งของงานที่ย้ายมาเพิ่ม 16 ก.ย. 2026 ──
AUTOPOST_URL = "https://division-x-card.vercel.app/api/marketing/content/publish-due"
AUTOPOST_EVERY_MIN = 15        # เท่ากับ cron เดิม · ปลายทางเป็นคนตัดสินว่าชิ้นไหนถึงเวลา
AUTOPOST_ALERT_GAP_MIN = 60    # error เดิมซ้ำทุก 15 นาทีจะท่วมห้อง — เตือนซ้ำชั่วโมงละครั้งพอ
BACKUP_SCRIPT = ROOT / "deploy" / "scripts" / "backup-tables.js"
# ⚠️ นอก deploy/ เท่านั้น — scripts/vercel_deploy.py อัปทุกอย่างใน deploy/ ขึ้นเว็บ
#    ไฟล์สำรองมียอดขายทั้งบริษัท หลุดขึ้นเว็บไม่ได้ (รากรีโปมี /backups/ ใน .gitignore ด้วย)
BACKUP_DIR = ROOT / "backups"
BACKUP_EVERY_DAYS = 7
BACKUP_AT_DEFAULT = "00:30"
BACKUP_KEEP = 8                # ~2 เดือน · ของเดิมเก็บเป็น artifact บน GitHub 90 วัน

# ── ค่าตั้งของรอบซิงค์สต็อกระหว่างวัน (17 ต.ค. 2026) ──
# 10:00 = เวลาห้างเปิด · เจ้าของบอกว่าเป็น "รอบแรก" ที่อยากเพิ่ม จึงเก็บเป็นรายการ ตั้งเพิ่มในห้องด้วย /rounds
STOCK_ROUNDS_DEFAULT = ["10:00"]
# รอบกลางวันลองแค่ 2 ครั้ง (รอบเที่ยงคืนลอง 3) — พลาดไปยังมีรอบถัดไปกับรอบเที่ยงคืนเก็บให้
# และกลางวันคนในห้องกดปุ่มเองได้ ไม่ต้องให้บอทวนลองไปจนเย็น
STOCK_ROUND_MAX_TRIES = 2
# เลยเวลารอบมาเกินเท่านี้แล้วยังไม่ได้เริ่ม (เครื่องเพิ่งเปิด/บอทเพิ่งฟื้น) = ข้ามรอบนั้นของวันนี้
# 4 ชม. → รอบ 10:00 ยังรันชดเชยได้ถึง 14:00 ซึ่งยังเป็นช่วงห้างเปิดที่ข้อมูลสดมีประโยชน์
# เกินจากนั้นไม่รันย้อน: เปิดเครื่องตอนค่ำแล้วจู่ ๆ มี "รอบ 10:00" โผล่ในห้อง คนอ่านงง
# และอีกไม่กี่ชั่วโมงก็ถึงรอบเที่ยงคืนอยู่แล้ว
# ⚠️ นับจากเวลาของรอบ ไม่ใช่ตัดที่ห้างปิด 22:00 — วันไหนตั้งรอบหลังห้างปิด (เช่น 22:30)
#    รอบนั้นจะไม่มีวันได้รันเลยแบบเงียบ ๆ
STOCK_ROUND_LATE_MAX_MIN = 240
# เพดานของ /rounds — ทุกรอบดึงยอดขาย 3 วัน + สต็อกจากหลังบ้านตู้ทุกยี่ห้อ (VMS เคยบล็อก API ยอดขายด้วย 403 มาแล้ว)
# ไม่มีเพดาน ใครในห้องพิมพ์ทุก 15 นาที บอทก็ซิงค์รัวทั้งวัน และข้อความตอบ /rounds ยาวเกินที่ Telegram รับ (4096 ตัว)
STOCK_ROUNDS_MAX = 6
STOCK_ROUND_MIN_GAP_MIN = 60
# รอบหลัง 23:00 ล้มแล้ว เวลาลองใหม่ (เวลาที่รันไป + 30 นาที) ข้ามเที่ยงคืน = ไม่มีวันได้ลอง
# ช่วงดึกมีรอบเที่ยงคืนดึงให้อยู่แล้ว · รอบ 23:00 ที่รันนานจนเวลาลองใหม่ข้ามวัน run_stock_round ยอมแพ้ให้เอง
STOCK_ROUND_LAST = "23:00"
# เวลาลองใหม่ที่ตกก่อนเที่ยงคืนนิดเดียวก็ไม่ได้ลองเหมือนกัน — ตัวจับเวลาเช็กทุก 30 วิ และต้องรอล็อกซิงค์ว่างก่อน
# เวลาลองใหม่ + เผื่อเท่านี้ข้ามเที่ยงคืน = ยอมแพ้เลย ไม่บอกห้องว่า "จะลองใหม่" แล้วเงียบหาย (รอบเที่ยงคืนเก็บให้อยู่แล้ว)
STOCK_ROUND_MIDNIGHT_MARGIN_MIN = 5


def env(key):
    if ENV_FILE.exists():
        # utf-8-sig: เผื่อไฟล์ถูกเซฟแบบมี BOM (เครื่องมือบน Windows ชอบแอบใส่)
        # ไม่งั้นคีย์บรรทัดแรกจะมี ﻿ นำหน้าแล้วหาไม่เจอแบบเงียบ ๆ
        for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip()
    return None


TOKEN = env("SYNC_BOT_TOKEN")
if not TOKEN:
    print("ยังไม่มี SYNC_BOT_TOKEN ใน deploy/.env.local — สร้างบอทกับ @BotFather ก่อน")
    sys.exit(1)

API = f"https://api.telegram.org/bot{TOKEN}"


def call(method, **params):
    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(f"{API}/{method}", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as e:
        print(f"[{method}] {e}")
        return None


# log ของ scraper มี < > & ได้ — ส่งดิบ ๆ ใน <pre> แล้ว Telegram จะตีกลับทั้งข้อความ
def _esc(s):
    return _html.escape(str(s))


def send(chat_id, text, keyboard=False, markup=None):
    p = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if markup is not None:
        p["reply_markup"] = markup
    elif keyboard:
        p["reply_markup"] = KEYBOARD
    return call("sendMessage", **p)


def send_panel(chat_id):
    """ส่งแผงปุ่ม inline — ใช้แทน/คู่กับ reply keyboard เวลาห้องมีหลายคน"""
    return send(chat_id, PANEL_TEXT, markup=PANEL)


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


# state ถูกอ่าน/เขียนจากสองเธรด (ลูปรับข้อความ กับ ตัวจับเวลา) จึงเก็บไว้ที่เดียว
# แล้วล็อกตอนเขียน — ไม่งั้นสองฝั่งถือ dict คนละใบ เขียนทับกันเงียบ ๆ
STATE = load_state()
_state_lock = threading.Lock()


def save_state(st=None):
    with _state_lock:
        STATE_FILE.write_text(json.dumps(st if st is not None else STATE),
                              encoding="utf-8")


# ── ตัวรันซิงค์ — ทีละงาน ห้ามซ้อน (ซิงค์คู่ขนานสองตัวเขียน DB ชนกันเอง) ──
_lock = threading.Lock()


def _run_cmd(cmd, timeout, extra_env=None):
    """รันคำสั่งหนึ่งตัวแบบเก็บ output → (CompletedProcess หรือ None, ข้อความตอนรันไม่ขึ้น)"""
    # encoding="utf-8" ข้างล่างบอกแค่ว่า "ฝั่งเราจะ**ถอด**รหัสท่อยังไง" ไม่ได้สั่งลูก
    # ว่าให้**เข้า**รหัสยังไง · ลูกพิมพ์ไทยลง pipe แล้วเลือก ACP ของเครื่องเอง (cp1252)
    # = ตายตั้งแต่บรรทัดแรก ต้องยัด PYTHONIOENCODING ให้ทั้งสายผ่าน env เท่านั้น
    env = {**os.environ, "PYTHONIOENCODING": "utf-8:replace", **(extra_env or {})}
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", cwd=str(ROOT), timeout=timeout, env=env), ""
    except subprocess.TimeoutExpired:
        return None, f"เกิน {timeout // 60} นาที — ถูกตัดจบ"
    except Exception as e:
        return None, f"รันไม่ขึ้น: {e}"


def _run_py(script, args, timeout):
    return _run_cmd([sys.executable, str(script), *args], timeout)


def _run_node(script, args, timeout, extra_env=None):
    return _run_cmd(["node", str(script), *args], timeout, extra_env)


def _run_job(args):
    """เรียก sync_local หนึ่งรอบ → (สำเร็จไหม, ข้อความสรุปที่เอาไปโพสต์ได้)

    ผู้เรียกเป็นคนถือ _lock เอง — ตัวนี้ไม่ยุ่งกับล็อก เพราะรอบอัตโนมัติ
    ต้องรันหลายรอบติดกันโดยถือล็อกยาวตลอด (ไม่งั้นมีคนกดปุ่มแทรกกลางทางได้)
    """
    p, err = _run_py(SYNC_SCRIPT, args, timeout=1800)
    if p is None:
        return False, err
    ok = p.returncode == 0
    # รายงานในห้องต้องอ่านจบในสายตาเดียว — ตอนสำเร็จเอาเฉพาะท่อน "สรุป"
    # จาก stdout (ไม่เอา stderr เลย เพราะ scraper พ่น DeprecationWarning รัว ๆ
    # ซึ่งไม่ใช่ปัญหาแต่กินพื้นที่จนคนอ่านไม่เจอผลจริง) · ตอนล้มค่อยเอา
    # ท้าย stderr มาให้ เพราะนั่นคือที่ที่เหตุผลอยู่
    out = p.stdout or ""
    if ok:
        body = out[out.rfind("สรุป"):].strip() if "สรุป" in out else out[-600:]
    else:
        err = (p.stderr or "").strip()
        head = out[out.rfind("สรุป"):].strip() if "สรุป" in out else ""
        body = (head + "\n\n" + err[-1200:]).strip() if head else err[-1500:] or out[-800:]
    return ok, body


def run_sync(chat_id, args, label):
    if not _lock.acquire(blocking=False):
        send(chat_id, "⏳ มีงานซิงค์กำลังรันอยู่ — รอให้จบก่อนแล้วค่อยกดใหม่")
        return
    try:
        # ยอดขายไล่ช่วงเดียวกับรอบอัตโนมัติ ไม่ใช่ "เมื่อวาน→วันนี้" ของ sync_local — ดู run_sales_catchup
        chunks = None if "--stock" in args else pending_sales_chunks()
        span = f" (ยอดขาย {chunks[0][0]} → {chunks[-1][1]})" if chunks else ""
        send(chat_id, f"🚀 เริ่ม{label}{span} … ใช้เวลาราว 2-5 นาที เสร็จแล้วจะรายงานผลที่นี่")
        t0 = time.time()
        if chunks is None:
            ok, body = _run_job(args)
        else:
            parts, ok = run_sales_catchup(chunks)
            if ok and not args:          # ซิงค์ทั้งหมด → ปิดท้ายด้วยสต็อก (ต้องหลังยอดขายเสมอ)
                ok, stock_body = _run_job(["--stock"])
                parts.append(f"▸ สต็อกหน้าตู้\n{stock_body}")
            body = "\n\n".join(parts)
        mins = (time.time() - t0) / 60
        send(chat_id, f"{'✅' if ok else '❌'} <b>{label}เสร็จ</b> ({mins:.1f} นาที)"
                      f"\n\n<pre>{_esc(body[:3000])}</pre>")
        if ok and not args:
            # กดซิงค์ทั้งหมดผ่าน = งานของวันนี้ครบ รอบอัตโนมัติจะได้ไม่รันซ้ำให้เปลือง
            # กดเฉพาะสต็อกหรือเฉพาะยอดขาย ยังขาดอีกครึ่ง ต้องปล่อยให้รอบเที่ยงคืนตามเก็บ
            mark_day_done()
    except Exception as e:
        send(chat_id, f"❌ {label}ล้ม: {e}")
    finally:
        _lock.release()


# ── รอบอัตโนมัติเที่ยงคืน — แทน cron ของ GitHub ──

def mark_day_done(now=None):
    """ซิงค์ครบทั้งยอดขาย+สต็อกของวันนี้แล้ว — ไม่แตะตัวชี้ยอดขาย (run_sales_catchup เลื่อนให้เอง)

    เรียกเฉพาะตอนยอดขายและสต็อกผ่านทั้งคู่ (run_auto · ปุ่ม "ซิงค์ทั้งหมด") · ปิดรอบกลางวันที่ถึงเวลาแล้วให้ด้วย
    ดูเหตุผลที่ _close_passed_rounds
    """
    now = now or datetime.now()
    STATE["auto_done_date"] = now.date().isoformat()
    STATE.pop("auto_retry_at", None)
    STATE["auto_tries"] = 0
    _close_passed_rounds(now, STATE)
    save_state()


def pending_sales_chunks(today=None):
    """ช่วงยอดขายที่ต้องดึงตอนนี้ นับจากตัวชี้ auto_sales_through"""
    last = STATE.get("auto_sales_through")
    return sales_chunks(date.fromisoformat(last) if last else None, today or date.today())


def run_sales_catchup(chunks):
    """ดึงยอดขายทีละช่วง เลื่อนตัวชี้เฉพาะช่วงที่ดึงสำเร็จจริง → (ข้อความรายช่วง, ผ่านหมดไหม)

    ใช้ทั้งรอบอัตโนมัติและปุ่มกดเอง · ผู้เรียกต้องถือ _lock เอง

    ⚠️ ปุ่มกดเองต้องผ่านตัวนี้ด้วย ห้ามเรียก sync_local เปล่า ๆ (9 ต.ค. 2026)
       sync_local ที่ไม่ระบุช่วงดึงแค่ "เมื่อวาน→วันนี้" แต่เดิมปุ่มเลื่อนตัวชี้ไปวันนี้เสมอ
       ยอดวันที่ 7 ต.ค. ของทุกตู้จึงหายทั้งวัน: ไม่มีแถวไหนถูกซิงค์เข้าเลยตั้งแต่ 7 ต.ค. 00:1x
       จนถึง 9 ต.ค. 21:4x (ดูจาก sales.synced_at) แล้วรอบที่ 21:4x ดึงแค่ 8→9 แบบปุ่มกดเอง
       ตัวชี้จึงกระโดดไป 9 ข้ามวันที่ 7
       ช่วงทับซ้อน 2 วันของ sales_chunks จะอุดรูนี้ได้ในรอบถัดไปก็จริง แต่ถ้าวันที่หลุดเกิน
       ช่วงทับซ้อนก็หายถาวร (เหมือน 23 ก.ย.) · ให้ปุ่มไล่จากตัวชี้เหมือนรอบอัตโนมัติจึงปิดรูได้ตรงกว่า
    """
    parts, all_ok = [], True
    for frm, to in chunks:
        ok, body = _run_job(["--sales", "--from", frm, "--to", to])
        parts.append(f"▸ ยอดขาย {frm} → {to}\n{body}")
        all_ok &= ok
        if not ok:
            break                # ยอดขายพัง อย่าไปต่อ สต็อกจะคำนวณการเติมผิด
        STATE["auto_sales_through"] = to
        save_state()             # เซฟทีละช่วง — ล้มกลางทางจะได้ไม่ต้องเริ่มใหม่หมด
    return parts, all_ok


def parse_hhmm(s):
    try:
        h, m = str(s).split(":")
        h, m = int(h), int(m)
        if 0 <= h < 24 and 0 <= m < 60:
            return f"{h:02d}:{m:02d}"
    except Exception:
        pass
    return None


def sales_chunks(last_through, today, max_span=MAX_SPAN, overlap=SALES_OVERLAP_DAYS):
    """แบ่งช่วงวันที่ต้องดึงยอดขายเป็นท่อนละไม่เกิน max_span วัน

    เริ่มนับจาก "วันที่ดึงสำเร็จล่าสุด" ไม่ใช่วันถัดไป — ทับซ้อนโดยตั้งใจ
    เพราะรอบก่อนดึงตอนวันนั้นยังไม่จบ ยอดจึงยังไม่ครบ · ฝั่ง DB เป็น upsert
    อยู่แล้ว ดึงซ้ำไม่ทำให้ตัวเลขบวกเพิ่ม

    ⚠️ ทับซ้อน 2 วันไม่ใช่ 1 (28 ก.ย. 2026) — เดิมทับวันเดียวแล้ว **วันที่หลุดไปกู้คืนไม่ได้เลย**
       กลไกที่เกิดจริง: mark_synced(sales=True) เขียน auto_sales_through = "วันนี้" เสมอ
       ไม่ว่ารอบนั้นจะดึงช่วงไหนมาจริง ๆ · การกดปุ่ม "ซิงค์ทั้งหมด" ดึงแค่ข้อมูลของวันนี้
       แต่ตัวชี้กระโดดไปวันนี้ด้วย → 23 ก.ย. ไม่เคยถูกดึง และถูกข้ามตลอดไปเพราะตัวชี้เลยมาแล้ว
       ผลคือยอดทั้งวันของ 12 ตู้หายไป 5 วันกว่าจะมีคนสังเกต (฿12,930)
       ทับซ้อนเพิ่มอีกวันทำให้รูแบบนี้ถูกอุดเองในรอบถัดไป โดยจ่ายแค่การดึงซ้ำที่ไม่มีผลข้างเคียง
       (9 ต.ค. 2026 ปิดที่ต้นเหตุแล้ว — ปุ่มกดเองไล่จากตัวชี้เหมือนกัน ดู run_sales_catchup)
    """
    if last_through is None:
        last_through = today - timedelta(days=1)
    frm = min(last_through - timedelta(days=overlap), today)
    out = []
    while frm < today:
        to = min(frm + timedelta(days=max_span), today)
        out.append((frm.isoformat(), to.isoformat()))
        frm = to
    return out or [(today.isoformat(), today.isoformat())]


def _nightly_at(state):
    """เวลารอบอัตโนมัติประจำวัน ("รอบเที่ยงคืน") ที่ตั้งไว้ด้วย /auto HH:MM"""
    return parse_hhmm(state.get("auto_at")) or AUTO_AT_DEFAULT


def auto_due(now, state):
    """ถึงเวลารันรอบอัตโนมัติของวันนี้หรือยัง (ฟังก์ชันล้วน — ทดสอบได้)

    เงื่อนไขคือ "วันนี้ยังไม่ได้ซิงค์" ไม่ใช่ "นาฬิกาตีเที่ยงคืนพอดี" เพราะเครื่อง
    อาจปิดอยู่ตอนนั้น · เปิดมาสายแค่ไหนก็ยังได้ข้อมูลของเมื่อวานครบ
    """
    if not state.get("auto_enabled", True):
        return False
    if now.strftime("%H:%M") < _nightly_at(state):
        return False
    if state.get("auto_done_date") == now.date().isoformat():
        return False
    retry_at = state.get("auto_retry_at")
    if retry_at and now.timestamp() < retry_at:
        return False
    return True


def run_auto():
    """ยอดขายไล่ทีละช่วง แล้วปิดท้ายด้วยสต็อก — ลำดับเดียวกับที่ workflow เคยทำ

    ⚠️ สต็อกต้องรันหลังยอดขายเสมอ (slot_refill_events ใช้ยอดที่ขายไประหว่างสองรอบ
       มาคำนวณว่าเติมเข้าไปเท่าไหร่) — sync_local บังคับลำดับนี้อยู่แล้วเวลารันรวด
       เดียว แต่ตรงนี้เราแยกเรียกเอง จึงต้องคุมลำดับเอง
    """
    chat_id = STATE.get("chat_id")
    if not chat_id:
        return                       # ยังไม่ผูกห้อง — ไม่มีที่ให้รายงาน ข้ามไปก่อน
    if not _lock.acquire(blocking=False):
        return                       # มีคนกดปุ่มอยู่ — ไม่ mark อะไร เดี๋ยวรอบหน้ามาใหม่
    try:
        today = date.today()
        if STATE.get("auto_tries_date") != today.isoformat():
            STATE["auto_tries"] = 0
            STATE["auto_tries_date"] = today.isoformat()

        last = STATE.get("auto_sales_through")
        chunks = pending_sales_chunks(today)
        behind = len(chunks) > 1 or (last and date.fromisoformat(last) < today - timedelta(days=1))
        send(chat_id, "🌙 <b>ซิงค์อัตโนมัติประจำวัน</b> เริ่มแล้ว"
                      + (f"\nดึงย้อนหลัง {len(chunks)} ช่วง (ค้างมาตั้งแต่ {last})" if behind else "")
                      + "\nเสร็จแล้วจะรายงานผลที่นี่")

        t0 = time.time()
        parts, all_ok = run_sales_catchup(chunks)

        if all_ok:
            ok, body = _run_job(["--stock"])
            parts.append(f"▸ สต็อกหน้าตู้\n{body}")
            all_ok &= ok

        mins = (time.time() - t0) / 60
        report = "\n\n".join(parts)
        send(chat_id, f"{'✅' if all_ok else '❌'} <b>ซิงค์อัตโนมัติเสร็จ</b> ({mins:.1f} นาที)"
                      f"\n\n<pre>{_esc(report[:3000])}</pre>")

        if all_ok:
            mark_day_done()
        else:
            tries = STATE.get("auto_tries", 0) + 1
            STATE["auto_tries"] = tries
            if tries >= AUTO_MAX_TRIES:
                STATE["auto_done_date"] = today.isoformat()   # ยอมแพ้ของวันนี้
                STATE.pop("auto_retry_at", None)
                send(chat_id, f"⚠️ ลองแล้ว {tries} รอบยังไม่ผ่าน — หยุดลองของวันนี้\n"
                              f"ข้อมูลไม่หายจากตู้ พรุ่งนี้จะตามเก็บให้เอง "
                              f"หรือกดปุ่มเองได้เลยถ้าอยากได้ตอนนี้")
            else:
                STATE["auto_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
                send(chat_id, f"🔁 จะลองใหม่อีกครั้งในอีก {AUTO_RETRY_MIN} นาที "
                              f"(รอบที่ {tries}/{AUTO_MAX_TRIES})")
            save_state()
    except Exception as e:
        send(chat_id, f"❌ รอบอัตโนมัติล้ม: {e}")
        STATE["auto_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
        save_state()
    finally:
        _lock.release()


# ── รอบซิงค์สต็อกระหว่างวัน (17 ต.ค. 2026) ──
#
# ทำไมต้องมี: เปิดหน้าเช็กของในตู้สาธารณะบนเว็บ (/stock) แล้ว หน้านั้นอ่านจาก DB ตรง ๆ จึงสดเท่ารอบซิงค์
# ล่าสุด ซึ่งเดิมบอทซิงค์แค่ 00:10 · เจ้าของ (เปิดคอมไว้ตลอด) ขอเพิ่มรอบห้างเปิด 10:00
#
# ⚠️ แต่ละรอบทำแบบเดียวกับปุ่ม "ซิงค์ทั้งหมด" — ยอดขายไล่จากตัวชี้ก่อน แล้วค่อยสต็อก ไม่ใช่ --stock เปล่า ๆ
#    slot_tracking คิดของที่เติม = (หลัง − ก่อน) + ยอดที่ขายระหว่างสองรอบ โดยอ่านตาราง sales
#    "ตอนที่ซิงค์สต็อก" · ยอดที่ยังไม่เข้า DB ตอนนั้นหลุดจากหน้าต่างของรอบนี้ไปถาวร เพราะรอบถัดไป
#    เริ่มนับจากรอบนี้ → ตัวเลขการเติมต่ำกว่าจริง (refill-recompute บน GitHub ตามซ่อมได้ แต่เป็นแค่ตาข่าย)
#    รอบ 10:00 ที่รันตรงเวลาแทบไม่มียอดขายในหน้าต่างก็จริง แต่รอบที่รันชดเชยสาย/รอบลองใหม่ หรือรอบบ่าย
#    ที่จะเพิ่มทีหลัง มีของขายออกไปเป็นชั่วโมงแล้ว และช่วงเช้าก็เป็นช่วงที่แอดมินเติมตู้พอดี
# ⚠️ ไม่เรียก mark_day_done — auto_done_date แปลว่า "รอบเที่ยงคืนของวันนี้จบแล้ว" ซึ่งปกติจบไปตั้งแต่
#    00:10 (เรียกไปก็ไม่มีผล) แต่ถ้าวันไหนรอบเที่ยงคืนถูกย้ายไปหลังรอบนี้ (/auto 12:00) การ mark จะทำให้
#    รอบนั้นหายไปเงียบ ๆ · ส่วนตัวชี้ยอดขายเลื่อนได้ตามปกติ (run_sales_catchup เลื่อนเฉพาะช่วงที่ดึงสำเร็จ)
#    — รอบเที่ยงคืนดึงย้อนทับซ้อน 2 วันเสมอ ยอดครึ่งวันที่รอบ 10:00 ดึงไป จะถูกดึงซ้ำให้ครบทั้งวันในคืนนั้นเอง
# ⚠️ รอบเที่ยงคืนของวันนี้ยังค้าง (ถึงเวลาแล้วแต่ยังไม่จบ — เครื่องเพิ่งเปิด/กำลังรัน/รอลองใหม่) = รอบกลางวันรอ
#    (_nightly_pending) — รอบนั้นดึงทั้งยอดขายและสต็อกอยู่แล้ว ปล่อยรอบกลางวันวิ่งด้วยก็ได้ซิงค์ซ้อนสองชุด:
#    เปิดเครื่องตอนเช้าที่เน็ต/หลังบ้านตู้ยังไม่พร้อม รอบเที่ยงคืนล้ม รอบ 10:00 ก็ลองซ้ำทันทีในติ๊กเดียวกัน (ตรวจเจอ 17 ต.ค.
#    2026: ดึงยอดขาย 5 ครั้งใน 63 นาที) หรือรอบ 10:00 ผ่านไปแล้ว รอบเที่ยงคืนที่รอลองใหม่ก็ยังซิงค์ซ้ำทั้งชุดอีก
#    ผ่านเมื่อไหร่ mark_day_done ปิดรอบที่ถึงเวลาให้ · ยอมแพ้เมื่อไหร่ (auto_done_date = วันนี้) รอบกลางวันกลับมาทำงานตามปกติ
# ⚠️ ซิงค์ที่ผ่านทั้งสองขั้น (ยอดขาย → สต็อก) ที่จบหลังเวลารอบไหน นับแทนรอบนั้นเลย ไม่งั้นรอบนั้นซิงค์ซ้ำต่อท้ายทันที
#    ที่ปล่อยล็อก — ปุ่ม "ซิงค์ทั้งหมด"/รอบเที่ยงคืน ปิดผ่าน mark_day_done · รอบกลางวันเองที่รันคร่อมเวลารอบถัดไป
#    (เครื่องเปิด 10:58 มีรอบ 10:00 + 11:00 · ลองใหม่คร่อม · รันช้า) ปิดตอนจบใน run_stock_round
#    จบก่อนเวลารอบ รอบยังรันตามเวลาของมัน · กดแค่ซิงค์สต็อก/ยอดขายอย่างเดียวไม่นับ (ไม่ครบยอดขาย → สต็อก)

# ตั้งระหว่างที่รอบกำลังซิงค์ (หลังเช็กซ้ำในล็อกผ่าน) ล้างใน finally — /rounds กับ /auto จะได้บอกว่า "กำลังซิงค์อยู่"
# ไม่ใช่ "ถึงคิวแล้ว เริ่มในไม่กี่วินาที" ไปตลอด 2-5 นาทีที่รัน
_round_running = threading.Event()
# คีย์ของการลองใหม่ (ตัวนับนับต่อ "ชุดที่รัน" ตามรอบล่าสุดของชุด) — ล้างพร้อมกันทุกครั้งที่รอบปิด
_ROUND_RETRY_KEYS = ("stock_round_retry_at", "stock_round_tries", "stock_round_tries_for")


def stock_rounds(state):
    """เวลารอบระหว่างวันที่ตั้งไว้ → ["10:00", ...] เรียงแล้ว ไม่ซ้ำ (ฟังก์ชันล้วน — ทดสอบได้)

    ไม่มีคีย์ = ค่าปริยาย · ค่าพังในไฟล์ state ข้ามทีละตัว ห้ามโยน error — ตัวจับเวลาเช็กทุก 30 วิ
    ถ้าพังตรงนี้ทุกติ๊ก รอบกลางวันจะหายเงียบไปทั้งวันโดยไม่มีใครรู้
    """
    raw = state.get("stock_rounds", STOCK_ROUNDS_DEFAULT)
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)):
        raw = STOCK_ROUNDS_DEFAULT
    return sorted({t for t in map(parse_hhmm, raw) if t})


def _hhmm_min(hhmm):
    """แปลงเวลา HH:MM เป็นนาทีนับจากเที่ยงคืน"""
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def _late_min(now, hhmm):
    """เลยเวลารอบมาแล้วกี่นาที (ติดลบ = ยังไม่ถึง)"""
    return now.hour * 60 + now.minute - _hhmm_min(hhmm)


def _day_map(state, key):
    m = state.get(key)
    return m if isinstance(m, dict) else {}


def _mark_rounds(state, key, slots, today):
    """บันทึก {รอบ: วันที่} ลงแผนที่ key — สร้าง dict ใหม่แล้วแทนที่ทีเดียว ไม่แก้ตัวเดิมในที่
    (เธรดอื่นอาจกำลังคัดลอก/เซฟตัวเดิมอยู่ — /rounds ตั้งเวลาใหม่ในเธรดรับข้อความ)"""
    state[key] = {**_day_map(state, key), **{t: today for t in slots}}


def _close_passed_rounds(now, state):
    """ปิดรอบกลางวันทุกรอบที่ถึงเวลาแล้วของวันนี้ — เรียกจาก mark_day_done กับตอนรอบกลางวันซิงค์ผ่าน

    now = เวลาที่ซิงค์จบ · "ซิงค์ทั้งหมด" ที่ผ่าน (ยอดขาย → สต็อก) หลังเวลารอบไหน = ข้อมูลสดกว่าที่รอบนั้นจะได้แล้ว
    ไม่ปิด รอบก็ซิงค์ซ้ำต่อท้ายทันที (ตรวจเจอ 17 ต.ค. 2026: เครื่องเปิด 10:30 → รอบเที่ยงคืนรันชดเชยจบ
    แล้วรอบ 10:00 ดึงยอดขาย 3 วัน + สต็อกทุกยี่ห้อซ้ำอีกรอบในติ๊กเดียวกัน)
    ปิดเฉพาะรอบที่ถึงเวลาแล้ว — กดก่อนเวลารอบ รอบยังรันตามเวลาของมัน
    ล้างป้าย "ล้ม" ของรอบพวกนี้ด้วย ข้อมูลสดแล้ว จะโชว์ ❌ ค้างไว้ก็ไม่จริง · ล้างการรอลองใหม่ด้วยเหตุผลเดียวกัน
    """
    today = now.date().isoformat()
    passed = [t for t in stock_rounds(state) if _late_min(now, t) >= 0]
    if passed:
        _mark_rounds(state, "stock_round_done", passed, today)
        if "stock_round_failed" in state:
            state["stock_round_failed"] = {t: d for t, d in _day_map(state, "stock_round_failed").items()
                                           if t not in passed}
    for k in _ROUND_RETRY_KEYS:
        state.pop(k, None)


def _rounds_on(state):
    # /auto off บอกคนในห้องว่า "ต้องกดปุ่มเอาเอง" — ถ้ารอบกลางวันยังวิ่งอยู่ ข้อความนั้นจะไม่จริง
    return bool(state.get("auto_enabled", True)) and bool(state.get("stock_rounds_enabled", True))


def _round_retry_wait(now, state):
    r = state.get("stock_round_retry_at")
    return isinstance(r, (int, float)) and now.timestamp() < r


def _retry_alive(now, state):
    """มีการลองใหม่ที่นัดไว้จริง และยังไม่เลยเวลานัดมาเกิน AUTO_RETRY_MIN นาที (ยังไม่ถึงเวลานัดก็นับ)"""
    r = state.get("stock_round_retry_at")
    return isinstance(r, (int, float)) and now.timestamp() - r <= AUTO_RETRY_MIN * 60


def _nightly_pending(now, state):
    """รอบเที่ยงคืนของวันนี้ยังค้างไหม — ถึงเวลาแล้วแต่ยังไม่จบ (เครื่องเพิ่งเปิด · กำลังรัน · รอลองใหม่)

    ค้างอยู่ = รอบกลางวันรอ (เหตุผลอยู่ที่หัวข้อของส่วนนี้) · ยอมแพ้แล้ว auto_done_date เป็นวันนี้ = ไม่ค้าง
    """
    if not state.get("auto_enabled", True):
        return False
    return now.strftime("%H:%M") >= _nightly_at(state) and state.get("auto_done_date") != now.date().isoformat()


def _round_open(now, state, t, running=False):
    """รอบ t ของวันนี้ยังค้างอยู่ไหม — ถึงเวลาแล้ว · ยังไม่จบ · ยังไม่เลยกำหนด (หรือกำลังลองใหม่ตามนัด)

    running=True (มีรอบกำลังซิงค์อยู่ — ใช้กับหน้าสถานะเท่านั้น): รอบที่ลองไปแล้ววันนี้ยังนับว่าค้างอยู่ แม้การลองใหม่ที่
    กำลังรันจะเลยเวลานัดมานาน (scraper ค้างได้ถึง 30 นาทีต่อขั้น) — รอบที่พลาดนัดจริงถูกปิดเป็น "ล้ม"
    ตั้งแต่ต้นรอบที่กำลังรันแล้ว (ดู run_stock_round) รอบที่ลองแล้วแต่ยังไม่จบระหว่างนั้นจึงอยู่ในชุดที่รันแน่นอน
    """
    today = now.date().isoformat()
    late = _late_min(now, t)
    if late < 0 or _day_map(state, "stock_round_done").get(t) == today:
        return False
    if late > STOCK_ROUND_LATE_MAX_MIN:
        # รอบที่เริ่มทันเวลาแต่ล้ม ได้ลองซ้ำตามสิทธิ์แม้จะเลยกำหนดไปแล้ว — กำหนดมีไว้กันการ "เริ่ม" รอบที่สายเกิน
        # ไม่ได้มีไว้ตัดสิทธิ์ลองใหม่ (ไม่งั้นรอบที่ล้มตอน 13:59 จะบอกว่า "จะลองใหม่" แล้วเงียบหายไปเฉย ๆ)
        # ⚠️ สิทธิ์นี้ต้องเก็บรายรอบ (stock_round_attempted) — เดิมผูกกับรอบล่าสุดของชุดที่ล้มรอบเดียว
        #    รอบ 10:00 ล้มตอน 13:50 แล้วรอบ 14:00 มาร่วมชุดลองใหม่ → 10:00 เสียสิทธิ์ หลุดจากการลองใหม่ที่สัญญาไว้
        #    แบบเงียบ ๆ แล้วหน้าสถานะโชว์ "ข้าม เพราะบอทพร้อมช้า" ทั้งที่ลองไปแล้วสองครั้ง
        # ⚠️ และต้องมีการลองใหม่ที่นัดไว้จริง ยังไม่เลยนัดมานาน — การลองใหม่ที่ไม่ได้เกิด (บอทดับ/เครื่องหลับ/
        #    /rounds off หรือ /auto off ไว้ระหว่างรอ) ไม่ใช่สิทธิ์ตลอดวัน ไม่งั้นบอทฟื้นตอน 19:00 แล้วโผล่
        #    "ซิงค์รอบ 10:00" ตอนค่ำ ซึ่งกำหนด 4 ชม. มีไว้กันพอดี — รอบแบบนี้นับเป็นล้ม (_round_missed)
        return (_day_map(state, "stock_round_attempted").get(t) == today
                and (running or _retry_alive(now, state)))
    return True


def _round_missed(now, state, t, running=False):
    """รอบ t ลองไปแล้ววันนี้ ยังไม่จบ เลยกำหนดแล้ว และการลองใหม่ไม่ได้เกิดตามนัด = ล้มของวันนี้ (ฟังก์ชันล้วน)

    หน้าสถานะโชว์ ❌ ทันที · run_stock_round ปิดให้จริง (done+failed) ก่อนคิดว่ารอบไหนถึงคิว
    """
    today = now.date().isoformat()
    return (_late_min(now, t) > STOCK_ROUND_LATE_MAX_MIN
            and _day_map(state, "stock_round_attempted").get(t) == today
            and _day_map(state, "stock_round_done").get(t) != today
            and not _round_open(now, state, t, running))


def stock_rounds_due(now, state):
    """รอบระหว่างวันที่ถึงคิวตอนนี้ (ฟังก์ชันล้วน — ทดสอบได้) → ["10:00", ...] · [] = ยังไม่มีอะไรต้องทำ

    เงื่อนไขแบบเดียวกับ auto_due — "วันนี้รอบนี้ทำหรือยัง" ไม่ใช่ "ตี 10 พอดีหรือยัง" — บวกอีกสามข้อ
      · ค้างหลายรอบ (เครื่องเพิ่งเปิด) คืนมาทั้งหมดในครั้งเดียว → รันรอบเดียวแล้วปิดทุกรอบที่ค้าง
        ข้อมูลหลังรันสดกว่าเวลาของทุกรอบที่ผ่านมาแล้ว รันไล่ทีละรอบก็ได้ของเดิมซ้ำ ๆ
      · เลยเวลารอบมาเกิน STOCK_ROUND_LATE_MAX_MIN = ข้ามรอบนั้นของวันนี้ (เหตุผลอยู่ที่ค่าตั้ง)
      · รอบเที่ยงคืนของวันนี้ยังค้าง = ยังไม่คืนอะไรเลย (_nightly_pending)
    """
    if not _rounds_on(state) or _round_retry_wait(now, state) or _nightly_pending(now, state):
        return []
    return [t for t in stock_rounds(state) if _round_open(now, state, t)]


def round_states(now, state, running=None):
    """สถานะของแต่ละรอบวันนี้ (ฟังก์ชันล้วน — ทดสอบได้) → [("10:00", "done"), ...]

    done เสร็จ · failed ไม่สำเร็จ หยุดลองของวันนี้แล้ว · wait ยังไม่ถึงเวลา · due ถึงคิว
    running กำลังซิงค์อยู่ · retry รอลองใหม่ · skipped เลยกำหนดไปแล้ว ข้ามของวันนี้
    later ตั้งรอบนี้หลังเวลาของมันวันนี้ เริ่มพรุ่งนี้ · nightly รอรอบเที่ยงคืนที่ยังค้างอยู่
    running: None = อ่านจากธงของตัวรันจริง (_round_running) · ส่ง True/False เองได้ตอนทดสอบ
    """
    if running is None:
        running = _round_running.is_set()
    today = now.date().isoformat()
    done, failed = _day_map(state, "stock_round_done"), _day_map(state, "stock_round_failed")
    set_late = _day_map(state, "stock_round_set_late")
    out = []
    for t in stock_rounds(state):
        if failed.get(t) == today:
            code = "failed"
        elif done.get(t) == today:
            # ตั้งหลังเวลาของมัน = ปิดของวันนี้ไว้ก่อน (ดู /rounds ตั้งเวลา) — โชว์ "เสร็จแล้ว" จะไม่จริง
            code = "later" if set_late.get(t) == today else "done"
        elif _late_min(now, t) < 0:
            code = "wait"
        elif _round_missed(now, state, t, running):
            code = "failed"      # ล้มแล้วการลองใหม่ไม่ได้เกิดตามนัด — หยุดของวันนี้ ไม่ใช่ "ถึงคิว"/"ข้าม"
        elif not _round_open(now, state, t, running):
            code = "skipped"
        elif running:
            code = "running"
        elif _nightly_pending(now, state):
            code = "nightly"
        elif _round_retry_wait(now, state):
            code = "retry"
        else:
            code = "due"
        out.append((t, code))
    return out


ROUND_ICON = {"done": "✅", "failed": "❌", "wait": "⏳", "due": "▶️", "running": "🔄", "retry": "🔁",
              "skipped": "⏭", "later": "⏭", "nightly": "🌙"}


def _rounds_switch(state):
    if not state.get("auto_enabled", True):
        return "<b>ปิด</b> (ตาม /auto off)"
    return "<b>เปิด</b>" if state.get("stock_rounds_enabled", True) else "<b>ปิด</b>"


def rounds_line(now, state):
    """บรรทัดเดียวสำหรับหน้าสถานะ /auto (ฟังก์ชันล้วน — ทดสอบได้)"""
    times = stock_rounds(state)
    head = "☀️ ซิงค์สต็อกระหว่างวัน: "
    if not times:
        return head + "ยังไม่มีรอบ — ตั้งด้วย /rounds 10:00"
    if not _rounds_on(state):
        return head + f"{_rounds_switch(state)} · รอบ {' · '.join(times)} น."
    return (head + "<b>เปิด</b> · วันนี้ "
            + " · ".join(f"{t} {ROUND_ICON[c]}" for t, c in round_states(now, state)))


def rounds_status(now=None, state=None):
    """ข้อความเต็มของ /rounds"""
    now = now or datetime.now()
    state = STATE if state is None else state
    times = stock_rounds(state)
    lines = [f"☀️ <b>ซิงค์สต็อกระหว่างวัน</b>: {_rounds_switch(state)}"]
    if not times:
        lines.append("ยังไม่มีรอบ — ตั้งด้วย /rounds 10:00")
    elif not _rounds_on(state):
        lines.append(f"รอบที่ตั้งไว้: {' · '.join(times)} น.")
    else:
        r = state.get("stock_round_retry_at")
        left = max(1, int((r - now.timestamp()) / 60)) if isinstance(r, (int, float)) else 0
        text = {"done": "เสร็จแล้ว",
                "failed": "ไม่สำเร็จ — หยุดลองรอบนี้ของวันนี้แล้ว",
                "wait": "ยังไม่ถึงเวลา",
                "due": "ถึงคิวแล้ว — เริ่มในไม่กี่วินาที (มีซิงค์อื่นรันอยู่จะต่อคิวหลังตัวนั้น)",
                "running": "กำลังซิงค์อยู่ — เสร็จแล้วจะรายงานในห้องนี้",
                "retry": f"รอลองใหม่อีก {left} นาที",
                "skipped": f"ข้ามของวันนี้ — เลยเวลารอบเกิน {STOCK_ROUND_LATE_MAX_MIN // 60} ชม. ก่อนได้เริ่ม "
                           f"(เครื่องเพิ่งเปิด หรือรอซิงค์อัตโนมัติประจำวันที่ยังไม่ผ่าน)",
                "later": "ตั้งหลังเวลารอบของวันนี้ — เริ่มรอบแรกพรุ่งนี้",
                "nightly": "รอซิงค์อัตโนมัติประจำวันที่ยังค้างอยู่ก่อน — ตัวนั้นดึงทั้งยอดขายและสต็อก ผ่านแล้วนับแทนรอบนี้"}
        lines += [f"• {t} น. — {ROUND_ICON[c]} {text[c]}" for t, c in round_states(now, state)]
    lines.append("")
    lines.append("แต่ละรอบดึงยอดขายล่าสุดก่อนแล้วค่อยดึงสต็อก (ตัวเลขการเติมของจะได้ไม่เพี้ยน) ใช้เวลาราว 2-5 นาที")
    lines.append(f"ล้มแล้วลองใหม่อีกครั้งหลัง {AUTO_RETRY_MIN} นาที · บอทพร้อมช้ากว่าเวลารอบเกิน "
                 f"{STOCK_ROUND_LATE_MAX_MIN // 60} ชม. (เช่น เครื่องเพิ่งเปิด) จะข้ามรอบนั้น ไม่รันย้อน")
    lines.append(f"สั่งได้: /rounds 10:00,15:00 (ตั้งเวลา — ไม่เกิน {STOCK_ROUNDS_MAX} รอบ "
                 f"ห่างกันและห่างจากเวลาซิงค์อัตโนมัติ ({_nightly_at(state)} น.) อย่างน้อย "
                 f"{STOCK_ROUND_MIN_GAP_MIN // 60} ชม. ไม่เกิน {STOCK_ROUND_LAST} น.) · /rounds on · /rounds off")
    return "\n".join(lines)


# เวลาหนึ่งตัวใน /rounds: ชั่วโมง 1-2 หลัก + ":" หรือ "." + นาที 2 หลัก (10:00 · 9:30 · 10.00)
# ⚠️ ต้องกรองก่อนส่งให้ parse_hhmm — int() ยอม "+1" "-0" "1_0" จึงเคยรับ "+1:00" เป็น 01:00 และ "1_0:00" เป็น 10:00
#    นาทีต้อง 2 หลัก: "9:5" เดาไม่ได้ว่า 09:05 หรือ 09:50 · \d รับเลขไทย/เลขเต็มความกว้างด้วย (int() แปลงได้) ตั้งใจให้รับ
_ROUND_TIME = re.compile(r"(\d{1,2})[:.](\d{2})")


def parse_rounds_arg(arg):
    """ข้อความหลัง /rounds → (คำสั่ง, รายการเวลา) (ฟังก์ชันล้วน — ทดสอบได้)

    ("show", None) ดูสถานะ · ("on", None) · ("off", None) · ("set", ["10:00", "15:00"]) · ("bad", None)
    คั่นด้วยจุลภาคหรือเว้นวรรคก็ได้ · รับ "10.00" กับหน่วย "น." ด้วย — คนไทยเขียนเวลาแบบนั้น (เจ้าของพิมพ์มาเองว่า
    "ห้างเปิด10.00") · มีตัวไหนอ่านไม่ออกปฏิเสธทั้งชุด ไม่ตั้งให้ครึ่ง ๆ แล้วให้คนสั่งมาเดาเอาว่าตัวไหนหาย
    ตัวนี้ดูแค่รูปแบบ — เพดานจำนวนรอบ/ระยะห่าง/เวลาดึกสุด อยู่ที่ rounds_problem
    """
    a = (arg or "").strip().lower()
    if not a:
        return "show", None
    if a in ("on", "เปิด"):
        return "on", None
    if a in ("off", "ปิด"):
        return "off", None
    tokens = re.sub(r"น\.?", " ", a).replace(",", " ").split()    # "10.00 น." · "10:00น." → ตัดหน่วยทิ้ง
    times = []
    for tok in tokens:
        m = _ROUND_TIME.fullmatch(tok)
        times.append(parse_hhmm(f"{m[1]}:{m[2]}") if m else None)
    if not times or None in times:
        return "bad", None
    return "set", sorted(set(times))


def _clock_gap(a, b):
    """สองเวลา HH:MM ห่างกันกี่นาทีบนหน้าปัด 24 ชม. — นับข้ามเที่ยงคืนด้วย (23:30 กับ 00:10 ห่าง 40 นาที)"""
    d = abs(_hhmm_min(a) - _hhmm_min(b)) % 1440
    return min(d, 1440 - d)


def _gap_text(gap):
    return "ตรงเวลาเดียวกันเลย" if gap == 0 else f"ห่างกันแค่ {gap} นาที"


def nightly_clash(nightly, times):
    """รอบกลางวันที่อยู่ใกล้เวลารอบเที่ยงคืนเกิน STOCK_ROUND_MIN_GAP_MIN → (เวลา, ห่างกี่นาที) ตัวที่ใกล้สุด
    หรือ None (ฟังก์ชันล้วน — ทดสอบได้)

    ใช้ทั้งตอนตั้ง /rounds และตอนย้าย /auto HH:MM — รอบเที่ยงคืนดึงทั้งยอดขายและสต็อกทุกยี่ห้ออยู่แล้ว
    รอบกลางวันที่ชิดมันคือซิงค์ซ้ำสองชุดติดกันทุกวันเปล่า ๆ (เสี่ยงโดนบล็อกแบบเดียวกับรอบถี่)
    และรอบก่อน 00:10 ยังดึงตอนหลังบ้านตู้ปิดยอดของวันไม่เสร็จด้วย (เหตุผลที่รอบเที่ยงคืนไม่ยิง 00:00 เป๊ะ)
    """
    near = [(_clock_gap(t, nightly), t) for t in times]
    near = [(g, t) for g, t in near if g < STOCK_ROUND_MIN_GAP_MIN]
    if not near:
        return None
    gap, t = min(near)
    return t, gap


def rounds_problem(times, nightly=None):
    """เหตุผลที่ไม่รับรายการเวลานี้ (ข้อความไทย) หรือ None ถ้าตั้งได้ (ฟังก์ชันล้วน — ทดสอบได้)

    times = รายการ "HH:MM" เรียงแล้วจาก parse_rounds_arg · เหตุผลของแต่ละเพดานอยู่ที่ค่าตั้ง
    nightly = เวลารอบเที่ยงคืน (/auto HH:MM) · ไม่ส่งมา = ค่าปริยาย AUTO_AT_DEFAULT
    """
    nightly = parse_hhmm(nightly) or AUTO_AT_DEFAULT
    why = "ทุกรอบดึงข้อมูลจากหลังบ้านตู้ทุกยี่ห้อ ถี่เกินเสี่ยงโดนบล็อก"
    if len(times) > STOCK_ROUNDS_MAX:
        return f"ตั้งได้ไม่เกิน {STOCK_ROUNDS_MAX} รอบต่อวัน (ส่งมา {len(times)} รอบ) — {why}"
    late = [t for t in times if _hhmm_min(t) > _hhmm_min(STOCK_ROUND_LAST)]
    if late:
        return (f"ตั้งได้ถึง {STOCK_ROUND_LAST} น. เท่านั้น ({' · '.join(late)} ดึกเกิน) — "
                "ถ้ารอบนั้นล้ม เวลาลองใหม่จะเลยเที่ยงคืนจนไม่ได้ลอง · ช่วงดึกมีรอบเที่ยงคืนดึงให้อยู่แล้ว")
    clash = nightly_clash(nightly, times)
    if clash:
        t, gap = clash
        return (f"{t} ใกล้เวลาซิงค์อัตโนมัติประจำวัน ({nightly} น.) เกินไป ({_gap_text(gap)}) — "
                f"ต้องห่างกันอย่างน้อย {STOCK_ROUND_MIN_GAP_MIN // 60} ชม. "
                f"เพราะรอบนั้นดึงทั้งยอดขายและสต็อกให้อยู่แล้ว · {why}")
    for a, b in zip(times, times[1:]):
        gap = _hhmm_min(b) - _hhmm_min(a)
        if gap < STOCK_ROUND_MIN_GAP_MIN:
            return (f"แต่ละรอบต้องห่างกันอย่างน้อย {STOCK_ROUND_MIN_GAP_MIN // 60} ชม. "
                    f"({a} กับ {b} ห่างกันแค่ {gap} นาที) — {why}")
    return None


def run_stock_round(now=None):
    """รอบซิงค์ระหว่างวัน: ยอดขายไล่จากตัวชี้ → สต็อก → รายงานผลเข้าห้องข้อความเดียว

    ล้มแล้วลองใหม่หลัง AUTO_RETRY_MIN นาที ได้ STOCK_ROUND_MAX_TRIES ครั้งต่อชุด แล้วยอมแพ้ทุกรอบในชุดนั้นของวันนี้
    (รอบอื่นที่ตามมาทีหลังยังได้สิทธิ์ของมันเต็ม) · เวลาลองใหม่เลย/ชิดเที่ยงคืน = ยอมแพ้เลย ปล่อยรอบเที่ยงคืนเก็บ
    ผ่านแล้วปิดทุกรอบที่ถึงเวลาก่อนซิงค์จบด้วย (รอบที่ถึงเวลาระหว่างรัน นับรวมในรอบนี้ ไม่ซิงค์ซ้ำต่อท้าย)
    ตัวจับเวลาเรียกในเธรดแยก — ดูเหตุผลที่ scheduler
    """
    chat_id = STATE.get("chat_id")
    if not chat_id:
        return                       # ยังไม่ผูกห้อง — ไม่มีที่ให้รายงาน ข้ามไปก่อน (แบบเดียวกับ run_auto)
    if not _lock.acquire(blocking=False):
        return                       # ซิงค์อื่นถือล็อกอยู่ (รอบเที่ยงคืน/ปุ่ม) — ไม่ mark อะไร ติ๊กหน้ามาใหม่
    try:
        now = now or datetime.now()
        today = now.date().isoformat()
        # รอบที่ล้มแล้วการลองใหม่ไม่ได้เกิดตามนัดจนเลยกำหนด = ล้มของวันนี้ ปิดให้จริงก่อนคิดว่ารอบไหนถึงคิว
        # (หน้าสถานะโชว์ ❌ ให้อยู่แล้ว) — ปล่อยค้างไว้ การลองใหม่ของรอบอื่นที่นัดทีหลังจะพามันกลับมารันตอนค่ำ
        missed = [t for t in stock_rounds(STATE) if _round_missed(now, STATE, t)]
        if missed:
            _mark_rounds(STATE, "stock_round_done", missed, today)
            _mark_rounds(STATE, "stock_round_failed", missed, today)
            save_state()
        # เช็กซ้ำหลังได้ล็อก — ระหว่างที่รอบนี้รัน ตัวจับเวลายังเรียกซ้ำทุกติ๊ก ถ้าตัวก่อนเพิ่งจบและปิดรอบไปแล้ว
        # ตัวที่ได้ล็อกต่อต้องไม่ซิงค์ซ้ำอีกรอบ
        due = stock_rounds_due(now, STATE)
        if not due:
            return
        _round_running.set()         # ล้างใน finally ข้างล่าง
        label = "ซิงค์รอบ " + " + ".join(due)
        t0 = time.time()
        try:
            parts, ok = run_sales_catchup(pending_sales_chunks(now.date()))
            if ok:               # ยอดขายพัง อย่าไปต่อ — สต็อกจะคำนวณการเติมผิด (เหตุผลเดียวกับ run_auto)
                ok, stock_body = _run_job(["--stock"])
                parts.append(f"▸ สต็อกหน้าตู้\n{stock_body}")
            body = "\n\n".join(parts)
        except Exception as e:
            ok, body = False, f"ล้มกลางทาง: {e}"
        elapsed = time.time() - t0
        mins = elapsed / 60

        if ok:
            _mark_rounds(STATE, "stock_round_done", due, today)
            # รอบที่ถึงเวลาระหว่างที่ซิงค์นี้รันอยู่ = ได้ข้อมูลสดกว่าเวลาของมันแล้ว ปิดไปด้วยเลย (เหตุผลเดียวกับ mark_day_done)
            # ไม่ปิด → ซิงค์ทุกยี่ห้อซ้ำต่อท้ายทันที (เครื่องเปิด 10:58 มีรอบ 10:00 + 11:00 · ลองใหม่คร่อม 11:00 · รันช้า)
            # เวลาจบ = now ที่ส่งเข้ามา + เวลาที่รันไป (ทดสอบได้) · จบข้ามวันไม่ปิดอะไร รอบของวันใหม่นับใหม่หมด
            end = now + timedelta(seconds=elapsed)
            joined = []
            if end.date() == now.date():
                done_today = _day_map(STATE, "stock_round_done")
                joined = [t for t in stock_rounds(STATE) if done_today.get(t) != today
                          and _late_min(now, t) < 0 <= _late_min(end, t)]
                _close_passed_rounds(end, STATE)
            for k in _ROUND_RETRY_KEYS:
                STATE.pop(k, None)
            save_state()
            also = f" · นับเป็นรอบ {' + '.join(joined)} ด้วย (ถึงเวลาระหว่างที่ซิงค์อยู่)" if joined else ""
            # ⚠️ ห้ามเขียน "/stock" เปล่า ๆ ในข้อความ — Telegram ทำให้เป็นคำสั่งที่กดได้ กดแล้วกลายเป็นสั่งซิงค์สต็อก
            send(chat_id, f"☀️ <b>{label} เสร็จ</b> ({mins:.1f} นาที){also} — หน้าเช็กของในตู้จะอัปเดตตามภายใน 1 นาที"
                          f"\n\n<pre>{_esc(body[:3000])}</pre>")
            return

        # ทุกรอบในชุดที่ล้มได้สิทธิ์ลองใหม่แม้เลยกำหนด 4 ชม. — รายรอบ ดูเหตุผลที่ _round_open
        _mark_rounds(STATE, "stock_round_attempted", due, today)
        # นับครั้งต่อชุดที่รัน (ผูกกับรอบล่าสุดของชุด) — มีรอบใหม่ถึงเวลาระหว่างรอลองใหม่ รอบใหม่ได้สิทธิ์ของมันเต็ม
        key = f"{today} {due[-1]}"
        # ตัวนับในไฟล์ state ที่ไม่ใช่จำนวนเต็มบวก (แก้มือ) นับเป็น 0 — เดิม "1" ทำให้ล้มด้วย TypeError ทุกครั้ง
        # แล้วตาข่ายชั้นนอกนัดลองใหม่เรื่อย ๆ โดยตัวนับไม่เคยขยับ = ลองไม่รู้จบทั้งวัน
        prev = STATE.get("stock_round_tries")
        prev = prev if isinstance(prev, int) and prev > 0 else 0
        tries = prev + 1 if STATE.get("stock_round_tries_for") == key else 1
        retry_at = now.timestamp() + elapsed + AUTO_RETRY_MIN * 60
        # เวลาลองใหม่ข้ามเที่ยงคืน = ไม่มีวันได้ลอง (ข้ามวันแล้วรอบนี้กลายเป็น "ยังไม่ถึงเวลา" ของวันใหม่)
        # บอกว่า "จะลองใหม่" ไปก็โกหก — ยอมแพ้เลย รอบเที่ยงคืนดึงทั้งยอดขายและสต็อกให้อยู่แล้ว
        # ชิดเที่ยงคืนเกินไปก็เหมือนกัน (เผื่อ STOCK_ROUND_MIDNIGHT_MARGIN_MIN — ติ๊กทุก 30 วิ + รอล็อกว่าง)
        past_midnight = (datetime.fromtimestamp(retry_at + STOCK_ROUND_MIDNIGHT_MARGIN_MIN * 60).date()
                         != now.date())
        if tries >= STOCK_ROUND_MAX_TRIES or past_midnight:
            # ปิดทุกรอบในชุดพร้อมกัน — ทุกตัวลองมาด้วยกันและล้มด้วยกัน
            _mark_rounds(STATE, "stock_round_done", due, today)
            _mark_rounds(STATE, "stock_round_failed", due, today)
            for k in _ROUND_RETRY_KEYS:
                STATE.pop(k, None)
            if tries >= STOCK_ROUND_MAX_TRIES:
                note = (f"ลองครบ {tries} ครั้งแล้ว หยุดรอบนี้ไว้ก่อน\n"
                        "ข้อมูลไม่หายจากตู้ รอบถัดไปหรือรอบเที่ยงคืนจะดึงให้เอง หรือกดปุ่มซิงค์เองได้เลย")
            else:
                note = ("ไม่ลองซ้ำแล้ว เพราะเวลาลองใหม่จะเลยเที่ยงคืน (หรือชิดเที่ยงคืนจนลองไม่ทัน)\n"
                        "ข้อมูลไม่หายจากตู้ รอบเที่ยงคืนจะดึงให้เอง หรือกดปุ่มซิงค์เองได้เลย")
        else:
            STATE["stock_round_tries"] = tries
            STATE["stock_round_tries_for"] = key
            STATE["stock_round_retry_at"] = retry_at
            note = f"จะลองใหม่ในอีก {AUTO_RETRY_MIN} นาที (ครั้งที่ {tries}/{STOCK_ROUND_MAX_TRIES})"
        save_state()
        # ตอนล้มเอาท้ายข้อความ — เหตุผลอยู่ท้าย stderr (ตอนผ่านเอาหัว เหมือน run_sync)
        send(chat_id, f"❌ <b>{label} ไม่สำเร็จ</b> ({mins:.1f} นาที) — {note}"
                      f"\n\n<pre>{_esc(body[-3000:])}</pre>")
    except Exception as e:
        # ตาข่ายชั้นสุดท้าย — ตั้งเวลาลองใหม่ในหน่วยความจำก่อนเซฟ ต่อให้เซฟพังก็ไม่โดนเรียกรันรัวทุก 30 วิ
        STATE["stock_round_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
        try:
            save_state()
        except Exception:
            pass
        send(chat_id, f"❌ รอบซิงค์ระหว่างวันล้ม: {_esc(e)}")
    finally:
        _round_running.clear()       # ก่อนปล่อยล็อก — ตัวถัดไปที่ได้ล็อกจะได้ตั้งธงของมันเองใหม่
        _lock.release()


# ── รอบเก็บไอเดียประจำวัน — แทน idea-collector.yml ของ GitHub ──
_ideas_lock = threading.Lock()


def ideas_due(now, state):
    """ถึงเวลาเก็บไอเดียของวันนี้หรือยัง (ฟังก์ชันล้วน — ทดสอบได้) · เงื่อนไขแบบเดียวกับ auto_due"""
    if not state.get("ideas_enabled", True):
        return False
    if now.strftime("%H:%M") < IDEAS_AT_DEFAULT:
        return False
    if state.get("ideas_done_date") == now.date().isoformat():
        return False
    retry_at = state.get("ideas_retry_at")
    if retry_at and now.timestamp() < retry_at:
        return False
    return True


def ideas_summary(collector_out, angles_out="", social_out="", insight_out=""):
    """ตัดเหลือบรรทัดสรุปที่อ่านจบในสายตาเดียว (ฟังก์ชันล้วน — ทดสอบได้)

    ตัวเก็บพิมพ์รายการไอเดีย 15 อันดับแรก ตัวคิดมุมพิมพ์ทีละชิ้นทีละมุม — ยาวเกินห้องแชต
    เก็บเฉพาะบรรทัดที่ขึ้นต้นด้วยป้าย [ideas] [purge] [social] [angles] [insight] กับบรรทัดเตือนที่มี ⚠️
    เรียงตามลำดับที่รันจริง: เก็บ → เฝ้าเพจ → คิดมุม → รายงานรายสัปดาห์
    """
    keep = []
    for out in (collector_out or "", social_out or "", angles_out or "", insight_out or ""):
        for line in out.splitlines():
            s = line.strip()
            if s.startswith(("[ideas]", "[purge]", "[social]", "[angles]", "[insight]")) or "⚠️" in s:
                keep.append(s)
    return "\n".join(keep)


def run_ideas(manual=False):
    """เก็บไอเดีย → คิดมุม · ขั้นคิดมุมล้มไม่นับว่ารอบนี้ล้ม"""
    chat_id = STATE.get("chat_id")
    if not _ideas_lock.acquire(blocking=False):
        if manual and chat_id:
            send(chat_id, "⏳ กำลังเก็บไอเดียอยู่แล้ว — รอผลสักครู่")
        return
    try:
        today = date.today().isoformat()
        if STATE.get("ideas_tries_date") != today:
            STATE["ideas_tries"] = 0
            STATE["ideas_tries_date"] = today
        if manual and chat_id:
            send(chat_id, "💡 เริ่มเก็บไอเดียคอนเทนต์ … ใช้เวลาราว 10-40 นาที (ขั้นคิดมุมช้า) เสร็จแล้วจะรายงานที่นี่")

        t0 = time.time()
        p, err = _run_py(IDEA_COLLECTOR, [], timeout=900)
        ok = p is not None and p.returncode == 0
        col_out = p.stdout if p is not None else ""
        ang_out, ang_note, soc_out, soc_note, ins_out = "", "", "", "", ""
        if ok:
            # ก่อนคิดมุม — ไอเดียจากโซเชียลจะได้มุมในรอบเดียวกัน · ล้มไม่นับว่ารอบเก็บไอเดียล้ม
            s, s_err = _run_py(SOCIAL_WATCH, [], timeout=1500)
            soc_out = s.stdout if s is not None else ""
            if s is None or s.returncode != 0:
                soc_note = ("\n⚠️ เฝ้าเพจโซเชียลไม่สำเร็จ — ไอเดียจากแหล่งอื่นเข้าครบ · "
                            + _esc((s_err if s is None else (s.stderr or "").strip()[-300:]) or "ไม่มีรายละเอียด"))
            # อ่านต้นฉบับก่อนคิดมุม — มุมจะอิงเนื้อหาจริง ไม่เดาจากชื่อคลิป · ล้มไม่นับว่ารอบนี้ล้ม (ตัวคิดมุมยังทำงานต่อ)
            n, n_err = _run_py(SOURCE_NOTES, ["--pending", "--limit", "15"], timeout=1500)
            if n is None or n.returncode != 0:
                soc_note += ("\n⚠️ อ่านต้นฉบับคลิปไม่สำเร็จ — มุมของคลิปรอบนี้คิดจากชื่ออย่างเดียว · "
                             + _esc((n_err if n is None else (n.stderr or "").strip()[-200:]) or "ไม่มีรายละเอียด"))
            a, a_err = _run_py(IDEA_ANGLES, ["--limit", IDEAS_ANGLE_LIMIT], timeout=2700)
            if a is None or a.returncode != 0:
                ang_note = "\n⚠️ ขั้นคิดมุมไม่สำเร็จ — ไอเดียยังอยู่ครบ ใช้มุมจาก template ไปก่อน"
            ang_out = a.stdout if a is not None else a_err
            # หลังคิดมุม — ใช้คลังของตัวเฝ้าเพจ ไม่แตะคิวไอเดีย · ส่งรายงานเข้าห้องเอง (ไฟล์แนบยาว)
            i, i_err = _run_py(SOCIAL_INSIGHT, [], timeout=900)
            ins_out = i.stdout if i is not None else ""
            if i is None or i.returncode != 0:
                ins_out += ("\n⚠️ รายงานบทเรียนรายสัปดาห์ไม่สำเร็จ: "
                            + ((i_err if i is None else (i.stderr or "").strip()[-200:]) or "ไม่มีรายละเอียด"))
        mins = (time.time() - t0) / 60

        if ok:
            STATE["ideas_done_date"] = today
            STATE.pop("ideas_retry_at", None)
            STATE["ideas_tries"] = 0
            save_state()
            if chat_id:
                send(chat_id, f"💡 <b>เก็บไอเดียประจำวันแล้ว</b> ({mins:.1f} นาที) — ดูที่หน้า /marketing"
                              f"{soc_note}{ang_note}\n\n<pre>{_esc(ideas_summary(col_out, ang_out, soc_out, ins_out)[:3000])}</pre>")
            return

        detail = err if p is None else ((p.stderr or "").strip()[-1200:] or col_out[-800:])
        tries = STATE.get("ideas_tries", 0) + 1
        STATE["ideas_tries"] = tries
        if tries >= AUTO_MAX_TRIES:
            STATE["ideas_done_date"] = today        # ยอมแพ้ของวันนี้ พรุ่งนี้ลองใหม่เอง
            STATE.pop("ideas_retry_at", None)
        else:
            STATE["ideas_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
        save_state()
        if chat_id:
            send(chat_id, f"❌ <b>เก็บไอเดียล้ม</b> (รอบที่ {tries}/{AUTO_MAX_TRIES})"
                          + (f" — จะลองใหม่ในอีก {AUTO_RETRY_MIN} นาที" if tries < AUTO_MAX_TRIES
                             else " — หยุดลองของวันนี้ พรุ่งนี้เก็บใหม่เอง หรือพิมพ์ /ideas")
                          + f"\n\n<pre>{_esc(detail)}</pre>")
    except Exception as e:
        STATE["ideas_retry_at"] = time.time() + AUTO_RETRY_MIN * 60
        save_state()
        if chat_id:
            send(chat_id, f"❌ รอบเก็บไอเดียล้ม: {_esc(e)}")
    finally:
        _ideas_lock.release()


# ── สรุปยอด+กำไร รายวัน/รายสัปดาห์ (30 ต.ค. 2026) ──
#
# ลำดับ: ดึงยอดขายจากตู้อีกรอบ (ถือ _lock เดียวกับงานซิงค์อื่น) → รอถึง 08:00 → daily_sales_digest.py ส่งผ่านบอท DVX Job
#   รายวัน = ของเมื่อวาน ทุกวัน · รายสัปดาห์ (--week) = จันทร์–อาทิตย์ของสัปดาห์ที่แล้ว ทุกวันจันทร์
#   วันจันทร์ถึงคิวทั้งคู่ → ดึงยอดรอบเดียว ส่งรายวันก่อนแล้วตามด้วยรายสัปดาห์
# ดึงยอดไม่สำเร็จก็ยังส่ง แต่แนบคำเตือนว่าตัวเลขมาจากรอบซิงค์ก่อนหน้า — ไม่ส่งเลยแย่กว่า
# ส่งไม่สำเร็จ (Telegram/ฐานข้อมูลล่ม) = ลองใหม่ทุก 30 นาที 3 รอบ แล้วรายงานห้องนี้ (แยกนับรายวัน/รายสัปดาห์)
_digest_lock = threading.Lock()


def digest_due(now, state):
    """ถึงเวลาทำสรุปรายวันหรือยัง (ฟังก์ชันล้วน — ทดสอบได้) · เงื่อนไขแบบเดียวกับ ideas_due"""
    if not state.get("digest_enabled", True):
        return False
    if now.strftime("%H:%M") < DIGEST_AT_DEFAULT:
        return False
    if state.get("digest_done_date") == now.date().isoformat():
        return False
    retry_at = state.get("digest_retry_at")
    if retry_at and now.timestamp() < retry_at:
        return False
    return True


def weekly_target(now):
    """วันจันทร์ของสัปดาห์ (จันทร์–อาทิตย์) ล่าสุดที่จบแล้ว (ฟังก์ชันล้วน)"""
    today = now.date()
    return today - timedelta(days=today.weekday() + 7)


def weekly_due(now, state):
    """ถึงเวลาทำสรุปรายสัปดาห์หรือยัง (ฟังก์ชันล้วน — ทดสอบได้)

    ปกติวันจันทร์ 07:45 · เครื่องปิดวันจันทร์ = ส่งชดเชยได้ถึงวันพุธ (WEEKLY_CATCHUP_DAYS)
    เลยกว่านั้นข้ามสัปดาห์นั้นไป — กันสรุปสัปดาห์ที่แล้วโผล่กลางสัปดาห์ (เช่นรีสตาร์ตบอทวันพฤหัส)
    """
    if not state.get("digest_enabled", True):
        return False
    if now.weekday() > WEEKLY_CATCHUP_DAYS:
        return False
    # ทุกวันที่ชดเชยได้ต้องรอ 07:45 เหมือนกัน — ไม่งั้นเปิดเครื่องตีหนึ่งวันอังคารจะเริ่มรอบนั้นเลย
    # แล้วนอนรอ 08:00 ถือล็อกไว้ 7 ชม. ทับรอบรายวัน · รอ 07:45 = ดึงยอดรอบเดียวส่งพร้อมรายวัน
    if now.strftime("%H:%M") < DIGEST_AT_DEFAULT:
        return False
    if state.get("weekly_done_for") == weekly_target(now).isoformat():
        return False
    retry_at = state.get("weekly_retry_at")
    if retry_at and now.timestamp() < retry_at:
        return False
    return True


def digest_wait_sec(now, send_at=DIGEST_SEND_AT):
    """เหลืออีกกี่วินาทีถึงเวลาส่ง (ฟังก์ชันล้วน) · เลยแล้ว = 0"""
    h, m = map(int, send_at.split(":"))
    target = now.replace(hour=h, minute=m, second=0, microsecond=0)
    return max(0.0, (target - now).total_seconds())


# ชนิดสรุป → (ป้ายในข้อความ, อาร์กิวเมนต์, คีย์ state "ทำแล้ว", คีย์นับครั้งที่ลอง, คีย์รอบลองใหม่)
DIGEST_KINDS = {
    "daily": ("สรุปยอดรายวัน", [], "digest_done_date", "digest_tries", "digest_retry_at"),
    "weekly": ("สรุปยอดรายสัปดาห์", ["--week"], "weekly_done_for", "weekly_tries", "weekly_retry_at"),
}


def _digest_mark(kind, now):
    """ค่าที่บอกว่า "รอบนี้ของ kind ทำแล้ว" — รายวันผูกวันนี้ · รายสัปดาห์ผูกสัปดาห์เป้าหมาย"""
    return now.date().isoformat() if kind == "daily" else weekly_target(now).isoformat()


def digest_period_arg(kind, now):
    """--date ที่ส่งให้สคริปต์ — คิดจาก now เดียวกับ _digest_mark (ฟังก์ชันล้วน)

    ห้ามให้สคริปต์เดาวันเองจากนาฬิกาตอนรัน: รอบที่เริ่ม 23:58 แต่ไปถึงขั้นส่งหลังเที่ยงคืน
    จะสรุปผิดวัน ทั้งที่บันทึกว่า "ทำแล้ว" ของอีกวัน
    """
    if kind == "daily":
        return (now.date() - timedelta(days=1)).isoformat()
    return weekly_target(now).isoformat()


def run_digest(manual=False, kinds=None):
    """kinds = ชนิดที่จะส่ง · ไม่ระบุ = ตามที่ถึงคิว (ตัวจับเวลา)"""
    chat_id = STATE.get("chat_id")
    if not _digest_lock.acquire(blocking=False):
        if manual and chat_id:
            send(chat_id, "⏳ กำลังทำสรุปยอดอยู่แล้ว — รอผลสักครู่")
        return
    try:
        now = datetime.now()
        kinds = kinds or [k for k, due in (("daily", digest_due), ("weekly", weekly_due)) if due(now, STATE)]
        if not kinds:
            return
        for k in kinds:                       # นับครั้งที่ลองแยกตามรอบเป้าหมาย (วัน/สัปดาห์)
            mark = _digest_mark(k, now)
            if STATE.get(f"{k}_tries_for") != mark:
                STATE[DIGEST_KINDS[k][3]] = 0
                STATE[f"{k}_tries_for"] = mark
        if manual and chat_id:
            send(chat_id, f"📊 เริ่มทำ{' + '.join(DIGEST_KINDS[k][0] for k in kinds)} — ดึงยอดขายจากตู้อีกรอบก่อน (ราว 2-5 นาที)")

        # 1) ดึงยอดขายรอบเช้า — ไล่จากตัวชี้แบบเดียวกับรอบอัตโนมัติ (ห้ามเรียก sync_local เปล่า ๆ ดู run_sales_catchup)
        #    รอบลองใหม่ (Telegram/DB ล้ม) ไม่ดึงซ้ำถ้าเพิ่งดึงสำเร็จไม่เกิน DIGEST_RESYNC_MIN นาที
        synced_at = STATE.get("digest_synced_at") or 0
        if time.time() - synced_at < DIGEST_RESYNC_MIN * 60:
            note = f"🔄 ดึงยอดจากตู้รอบเช้าแล้ว ({datetime.fromtimestamp(synced_at):%H:%M} น.)"
        elif _lock.acquire(timeout=DIGEST_SYNC_WAIT_SEC):
            try:
                parts, sync_ok = run_sales_catchup(pending_sales_chunks())
            finally:
                _lock.release()
            if sync_ok:
                STATE["digest_synced_at"] = time.time()
                save_state()
            note = (f"🔄 ดึงยอดจากตู้รอบเช้าแล้ว ({datetime.now():%H:%M} น.)" if sync_ok
                    else "⚠️ ดึงยอดรอบเช้าไม่สำเร็จ — ตัวเลขมาจากรอบซิงค์ก่อนหน้า อาจยังไม่ครบ")
            if not sync_ok and chat_id:
                send(chat_id, "⚠️ <b>ดึงยอดรอบเช้า (ก่อนสรุปยอด) ไม่สำเร็จ</b> — ยังส่งสรุปตามเวลา พร้อมคำเตือน"
                              f"\n\n<pre>{_esc((parts[-1] if parts else '')[:1500])}</pre>")
        else:
            note = "⚠️ งานซิงค์อื่นค้างนานเกิน — ไม่ได้ดึงยอดรอบเช้า ตัวเลขอาจยังไม่ครบ"

        # 2) ส่งไม่ก่อน 08:00 — กดเองส่งเลย
        if not manual:
            time.sleep(digest_wait_sec(datetime.now()))

        # 3) สรุป + ส่งทีละชนิด (สคริปต์ส่งเองผ่านบอท DVX Job · exit 0 = ส่งครบทุกห้อง)
        for k in kinds:
            label, args, done_key, tries_key, retry_key = DIGEST_KINDS[k]
            p, err = _run_py(DAILY_DIGEST, [*args, "--date", digest_period_arg(k, now), "--note", note], timeout=600)
            # exit 3 = ถึงแชตเจ้าของแล้ว แต่กลุ่ม DVX_Admin ล้ม → นับว่าสำเร็จ (ลองใหม่ = ส่งซ้ำเข้าแชตเจ้าของ) แล้วแจ้งห้องนี้ครั้งเดียว
            ok = p is not None and p.returncode in (0, DIGEST_EXIT_GROUP_FAILED)
            out = ((p.stdout if p is not None else "") or "").strip()
            summary = "\n".join(l for l in out.splitlines() if "[daily]" in l or "[weekly]" in l)
            mark = _digest_mark(k, now)
            if ok:
                STATE[done_key] = mark
                STATE.pop(retry_key, None)
                STATE[tries_key] = 0
                save_state()
                if p.returncode == DIGEST_EXIT_GROUP_FAILED and chat_id:
                    send(chat_id, f"⚠️ <b>{label}</b>: ส่งเข้าแชตเจ้าของแล้ว แต่<b>ส่งเข้ากลุ่ม DVX_Admin ไม่สำเร็จ</b> — "
                                  "เช็กว่าบอท DVX Job ยังอยู่ในกลุ่ม และ TELEGRAM_DVX_ADMIN_CHAT_ID ถูกต้อง"
                                  f"\n<pre>{_esc(summary[:1200])}</pre>")
                elif manual and chat_id:
                    send(chat_id, f"📊 <b>ส่ง{label}แล้ว</b> (บอท DVX Job)\n<pre>{_esc(summary[:1500])}</pre>")
                continue
            detail = err if p is None else ((p.stderr or "").strip()[-1000:] or summary or out[-600:])
            tries = STATE.get(tries_key, 0) + 1
            STATE[tries_key] = tries
            if tries >= AUTO_MAX_TRIES:
                STATE[done_key] = mark                # ยอมแพ้ของรอบนี้ รอบหน้าส่งของใหม่เอง
                STATE.pop(retry_key, None)
            else:
                STATE[retry_key] = time.time() + AUTO_RETRY_MIN * 60
            save_state()
            if chat_id:
                send(chat_id, f"❌ <b>ส่ง{label}ไม่สำเร็จ</b> (รอบที่ {tries}/{AUTO_MAX_TRIES})"
                              + (f" — จะลองใหม่ในอีก {AUTO_RETRY_MIN} นาที" if tries < AUTO_MAX_TRIES
                                 else " — หยุดลองของรอบนี้ พิมพ์ /digest (หรือ /digest week) เพื่อส่งเอง")
                              + f"\n\n<pre>{_esc(detail)}</pre>")
    except Exception as e:
        # นับเป็นการลองหนึ่งครั้งเหมือนล้มปกติ — ไม่งั้นข้อผิดพลาดถาวรจะลองทุก 30 นาทีทั้งวัน
        now2 = datetime.now()
        for k in (kinds or ["daily"]):
            _, _, done_key, tries_key, retry_key = DIGEST_KINDS[k]
            STATE[tries_key] = STATE.get(tries_key, 0) + 1
            if STATE[tries_key] >= AUTO_MAX_TRIES:
                STATE[done_key] = _digest_mark(k, now2)
                STATE.pop(retry_key, None)
            else:
                STATE[retry_key] = time.time() + AUTO_RETRY_MIN * 60
        try:
            save_state()
        except Exception:
            pass
        if chat_id:
            send(chat_id, f"❌ สรุปยอดล้ม: {_esc(e)}")
    finally:
        _digest_lock.release()


# ── โพสต์อัตโนมัติ — เคาะปลายทางบนเว็บทุก 15 นาที (แทน marketing-autopost.yml) ──
#
# ⚠️ ตัวตัดสินใจว่าโพสต์ชิ้นไหนอยู่ฝั่งเว็บ บอทเป็นแค่ตัวจับเวลาเหมือน workflow เดิมเป๊ะ
#    ห้ามย้ายตรรกะการเลือกโพสต์มาที่นี่ — สองที่ที่ตัดสินใจเรื่องเดียวกันจะเพี้ยนคนละทางวันหนึ่ง
# ⚠️ ไม่มี secret = ปลายทางตอบ 503 แล้วไม่โพสต์อะไร ซึ่งไม่ใช่ความล้มเหลว (เหมือนของเดิม)

def autopost_due(now, state):
    if not state.get("autopost_enabled", True):
        return False
    return now.timestamp() - (state.get("autopost_last") or 0) >= AUTOPOST_EVERY_MIN * 60


def autopost_report(code, data):
    """ข้อความที่ควรส่งเข้าห้อง หรือ None ถ้ารอบนี้ไม่มีอะไรต้องบอก (ฟังก์ชันล้วน — ทดสอบได้)

    200 ที่ไม่มีของถึงคิว = เงียบ · ไม่งั้นห้องจะมีข้อความทุก 15 นาทีจนคนเลิกอ่าน
    """
    if code == 503:
        return None
    if code != 200:
        return f"❌ โพสต์อัตโนมัติ: ปลายทางตอบ HTTP {code}"
    results = data.get("results") or []
    manual = [r for r in results if r.get("needsManualFix")]
    if manual:
        return ("🚨 <b>ขึ้นเพจแล้วแต่บันทึกฐานข้อมูลไม่สำเร็จ</b> — ต้องแก้มือ อย่าสั่งโพสต์ซ้ำ\n"
                + " · ".join(f"#{r.get('id')}" for r in manual))
    failed = data.get("failed") or 0
    if failed:
        return (f"⚠️ โพสต์อัตโนมัติ: ล้ม {failed} ชิ้น\n"
                + "\n".join(f"#{r.get('id')} {str(r.get('error'))[:90]}"
                             for r in results if not r.get("ok")))
    posted = data.get("posted") or 0
    if posted:
        return (f"📣 <b>โพสต์อัตโนมัติขึ้นเพจแล้ว {posted} ชิ้น</b>\n"
                + "\n".join(f"#{r.get('id')} {r.get('post_url') or ''}".strip()
                             for r in results if r.get("ok")))
    return None


def run_autopost(manual=False):
    chat_id = STATE.get("chat_id")
    STATE["autopost_last"] = time.time()   # ตั้งก่อนยิง — ยิงไม่ผ่านก็ไม่ควรรัวซ้ำทุกติ๊ก
    save_state()
    secret = env("AUTOPOST_SECRET")
    if not secret:
        if manual and chat_id:
            send(chat_id, "⏸ ยังไม่ได้เปิดใช้โพสต์อัตโนมัติ — ไม่มี AUTOPOST_SECRET ใน deploy/.env.local")
        return
    req = urllib.request.Request(
        AUTOPOST_URL, data=json.dumps({"dryRun": False}).encode("utf-8"),
        headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            code, body = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        code, body = 0, str(e)
    try:
        data = json.loads(body)
    except Exception:
        data = {}

    msg = autopost_report(code, data)
    if manual and chat_id and not msg:
        send(chat_id, f"📭 ไม่มีโพสต์ถึงคิว (ปลายทางตอบ HTTP {code})")
    if not msg or not chat_id:
        return
    bad = msg[0] in "❌⚠️🚨"
    if bad:
        # ปัญหาเดิมซ้ำทุก 15 นาทีจะท่วมห้อง — ข่าวดีส่งได้เสมอ ข่าวร้ายชั่วโมงละครั้ง
        if time.time() - (STATE.get("autopost_alert_at") or 0) < AUTOPOST_ALERT_GAP_MIN * 60:
            return
        STATE["autopost_alert_at"] = time.time()
        save_state()
    send(chat_id, msg + (f"\n\n<pre>{_esc(body[:600])}</pre>" if bad else ""))


# ── สำรองข้อมูลรายสัปดาห์ (แทน weekly-backup.yml) ──
#
# เงื่อนไขเป็น "ครบ 7 วันตั้งแต่ชุดล่าสุดหรือยัง" ไม่ใช่ "วันอาทิตย์หรือยัง" —
# ของเดิมยิงคืนวันเสาร์ ถ้ายึดวันตายตัวแล้ววันนั้นเครื่องปิด สัปดาห์นั้นจะหายไปทั้งรอบ
_backup_lock = threading.Lock()


def backup_due(now, state):
    if not state.get("backup_enabled", True):
        return False
    if now.strftime("%H:%M") < BACKUP_AT_DEFAULT:
        return False
    done = state.get("backup_done_date")
    if not done:
        return True
    try:
        return (now.date() - date.fromisoformat(done)).days >= BACKUP_EVERY_DAYS
    except ValueError:
        return True          # ค่าพังในไฟล์ state อย่าทำให้ไม่สำรองข้อมูลไปตลอด


def prune_backups(keep=BACKUP_KEEP):
    """ลบชุดเก่าที่เกินโควตา คืนชื่อที่ลบ · ชื่อโฟลเดอร์เป็น timestamp เรียงตามตัวอักษรได้ตรงกับเวลา"""
    if not BACKUP_DIR.exists():
        return []
    dirs = sorted((d for d in BACKUP_DIR.iterdir() if d.is_dir()), key=lambda d: d.name)
    dead = dirs[:-keep] if keep > 0 else []
    for d in dead:
        shutil.rmtree(d, ignore_errors=True)
    return [d.name for d in dead]


def run_backup(manual=False):
    chat_id = STATE.get("chat_id")
    if not _backup_lock.acquire(blocking=False):
        if manual and chat_id:
            send(chat_id, "⏳ กำลังสำรองข้อมูลอยู่แล้ว — รอผลสักครู่")
        return
    try:
        if manual and chat_id:
            send(chat_id, "💾 เริ่มสำรองข้อมูล …")
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        p, err = _run_node(BACKUP_SCRIPT, [], timeout=1800, extra_env={"BACKUP_DIR": str(BACKUP_DIR)})
        ok = p is not None and p.returncode == 0
        out = (p.stdout if p is not None else err) or ""
        if not ok:
            detail = err if p is None else ((p.stderr or "").strip()[-1000:] or out[-800:])
            if chat_id:
                send(chat_id, f"❌ <b>สำรองข้อมูลล้ม</b>\n\n<pre>{_esc(detail)}</pre>")
            return
        STATE["backup_done_date"] = date.today().isoformat()
        save_state()
        removed = prune_backups()
        tail = "\n".join(l.strip() for l in out.splitlines() if l.strip()[:1] in "✓✗✅")
        if chat_id:
            send(chat_id, f"💾 <b>สำรองข้อมูลแล้ว</b> ({(time.time() - t0) / 60:.1f} นาที)"
                          + (f" · ลบชุดเก่า {len(removed)} ชุด" if removed else "")
                          + f"\n<pre>{_esc(tail[:2500])}</pre>")
    finally:
        _backup_lock.release()


def scheduler():
    while True:
        try:
            if auto_due(datetime.now(), STATE):
                run_auto()
            # วางหลังซิงค์ — วันที่เปิดเครื่องสายจนค้างทั้งคู่ ไอเดียภายในจะได้อ่านยอดขายล่าสุด
            if ideas_due(datetime.now(), STATE):
                # แยกเธรด — ขั้นคิดมุมวัดจริง 18 นาทีกับ 19 ชิ้น ถ้ารันในเธรดนี้ ตัวจับเวลาซิงค์จะค้างรอไปด้วย
                # ติ๊กถัดไประหว่างที่ยังรันอยู่จะเรียกซ้ำ แต่ _ideas_lock ทำให้ตัวที่ซ้ำออกทันที
                threading.Thread(target=run_ideas, daemon=True).start()
            # สรุปยอดรายวัน/รายสัปดาห์ — แยกเธรด (รอซิงค์ + รอถึง 08:00) · _digest_lock กันเรียกซ้ำระหว่างรอ
            if digest_due(datetime.now(), STATE) or weekly_due(datetime.now(), STATE):
                threading.Thread(target=run_digest, daemon=True).start()
            # ทั้งสองตัวแยกเธรดเหมือนกัน — เคาะโพสต์รอปลายทางได้นาน ส่วนสำรองข้อมูลกินหลายนาที
            if autopost_due(datetime.now(), STATE):
                threading.Thread(target=run_autopost, daemon=True).start()
            if backup_due(datetime.now(), STATE):
                threading.Thread(target=run_backup, daemon=True).start()
            # รอบซิงค์สต็อกระหว่างวัน — แยกเธรด ไม่รันในเธรดนี้แบบรอบเที่ยงคืน เพราะรอบนี้อยู่กลางวัน
            # ถ้ารันตรงนี้ ตัวเคาะโพสต์อัตโนมัติจะค้างรอไปด้วยทุกวัน (ปกติ 2-5 นาที แต่ถ้า scraper ค้าง
            # ค้างได้ถึง 30 นาทีต่อขั้น) · ไม่ซ้อนกับซิงค์อื่นเพราะใช้ _lock ตัวเดียวกันแบบไม่รอ
            # ติ๊กถัดไประหว่างที่ยังรันอยู่จะเรียกซ้ำ → ล็อกไม่ว่างก็ออกทันที + เช็กซ้ำอีกทีหลังได้ล็อก
            # วันที่รอบเที่ยงคืนต้องรันชดเชยพร้อมกัน run_auto ข้างบนรันจบในเธรดนี้ไปก่อนแล้ว จึงไม่แย่งกัน
            # ถ้ามันผ่าน mark_day_done ปิดรอบที่ถึงเวลาแล้วให้ · ถ้ามันล้ม (รอลองใหม่) ตัวเช็กนี้ก็ไม่ปล่อยรอบกลางวัน
            # จนกว่ารอบเที่ยงคืนจะผ่านหรือยอมแพ้ (_nightly_pending) — ทั้งสองทางไม่ซิงค์ซ้ำต่อท้ายในติ๊กเดียวกัน
            # วางท้ายสุด — ถ้าวันไหนตัวเช็กนี้พัง งานอื่นในติ๊กเดียวกันได้รันไปก่อนแล้ว
            if stock_rounds_due(datetime.now(), STATE):
                threading.Thread(target=run_stock_round, daemon=True).start()
        except Exception as e:
            print(f"[scheduler] {e}")
        time.sleep(AUTO_TICK)


def auto_status():
    at = parse_hhmm(STATE.get("auto_at")) or AUTO_AT_DEFAULT
    on = STATE.get("auto_enabled", True)
    last = STATE.get("auto_sales_through") or "ยังไม่เคยรัน"
    done = STATE.get("auto_done_date")
    lines = [f"⏰ ซิงค์อัตโนมัติ: <b>{'เปิด' if on else 'ปิด'}</b> · เวลา <b>{at}</b> น.",
             f"ข้อมูลยอดขายถึงวันที่: {last}",
             f"รอบของวันนี้: {'เสร็จแล้ว' if done == date.today().isoformat() else 'ยังไม่ได้รัน'}"]
    retry = STATE.get("auto_retry_at")
    if retry and retry > time.time():
        lines.append(f"รอลองใหม่อีก {int((retry - time.time()) / 60)} นาที")
    lines.append(rounds_line(datetime.now(), STATE))
    idea_on = STATE.get("ideas_enabled", True)
    idea_done = STATE.get("ideas_done_date") == date.today().isoformat()
    lines.append(f"💡 เก็บไอเดีย: <b>{'เปิด' if idea_on else 'ปิด'}</b> · เวลา <b>{IDEAS_AT_DEFAULT}</b> น. · "
                 f"วันนี้{'เก็บแล้ว' if idea_done else 'ยังไม่ได้เก็บ'}")
    dg_done = STATE.get("digest_done_date") == date.today().isoformat()
    wk_last = STATE.get("weekly_done_for")
    lines.append(f"📊 สรุปยอด (DVX Job): <b>{'เปิด' if STATE.get('digest_enabled', True) else 'ปิด'}</b> · "
                 f"ดึงยอด {DIGEST_AT_DEFAULT} ส่ง {DIGEST_SEND_AT} น. · รายวัน: วันนี้{'ส่งแล้ว' if dg_done else 'ยังไม่ได้ส่ง'} · "
                 f"รายสัปดาห์ทุกจันทร์: ล่าสุดสัปดาห์ของ {wk_last or 'ยังไม่เคย'}")
    bk = STATE.get("backup_done_date") or "ยังไม่เคย"
    lines.append(f"💾 สำรองข้อมูล: <b>{'เปิด' if STATE.get('backup_enabled', True) else 'ปิด'}</b> · "
                 f"ทุก {BACKUP_EVERY_DAYS} วัน · ชุดล่าสุด {bk}")
    ap_last = STATE.get("autopost_last")
    ago = f"{int((time.time() - ap_last) / 60)} นาทีที่แล้ว" if ap_last else "ยังไม่เคย"
    lines.append(f"📣 โพสต์อัตโนมัติ: <b>{'เปิด' if STATE.get('autopost_enabled', True) else 'ปิด'}</b> · "
                 f"เคาะทุก {AUTOPOST_EVERY_MIN} นาที · ล่าสุด {ago}")
    lines.append("\nเครื่องต้องเปิดอยู่บอทถึงจะทำงาน — ถ้าเครื่องปิดข้ามคืน "
                 "บอทจะซิงค์ชดเชยให้ทันทีที่เปิดมา")
    lines.append("สั่งได้: /auto on · /auto off · /auto 00:30 · /rounds (รอบซิงค์ระหว่างวัน) · "
                 "/ideas (เก็บไอเดียเดี๋ยวนี้) · /ideas on|off · /digest (ส่งสรุปเมื่อวานเดี๋ยวนี้) · /digest week · /digest on|off")
    lines.append("ปุ่มหาย/ไม่ขึ้นบนเครื่องใคร ให้พิมพ์ /panel — แผงปุ่มในข้อความ ทุกคนในห้องกดได้")
    return "\n".join(lines)


def handle(u):
    state = STATE
    msg = u.get("message") or {}
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    text = (msg.get("text") or "").strip()
    if not chat_id or not text:
        return

    # ผูกกลุ่มครั้งแรกด้วย /start — หลังจากนั้นล็อกกลุ่มเดียวตลอด
    # ผูกเฉพาะ "กลุ่ม" เท่านั้น — /start ใน DM ใช้เป็นแค่ตัวเช็คว่าคุยถูกบอท
    # (เจอจริง 11 ก.ย.: มีบอทชื่อคล้ายกัน คนกด Start ผิดตัวแล้วงงว่าทำไมเงียบ)
    if "chat_id" not in state:
        if text.startswith("/start"):
            if chat.get("type") not in ("group", "supergroup"):
                send(chat_id, "👋 คุยถูกตัวแล้ว! แต่บอทซิงค์ผูกได้เฉพาะในกลุ่ม — "
                              "เพิ่มบอทเข้าห้องแล้วพิมพ์ /start ที่นั่นครับ")
                return
            state["chat_id"] = chat_id
            state["chat_title"] = chat.get("title") or chat.get("username") or "?"
            save_state()
            send(chat_id, f"🔗 ผูกบอทซิงค์กับห้องนี้แล้ว ({state['chat_title']})\n"
                          f"กดปุ่มด้านล่างหรือพิมพ์ /stock /sync /sales ได้เลย",
                 keyboard=True)
            send_panel(chat_id)
        return
    if chat_id != state["chat_id"]:
        return              # ห้องอื่น/แชทส่วนตัวคนแปลกหน้า — เมินเงียบ ๆ

    if text.startswith("/start") or text.startswith("/buttons") or text.startswith("/panel"):
        # ส่งทั้งสองแบบ — reply keyboard สำหรับคนที่เห็นอยู่แล้ว + แผง inline ที่ทุกคนในห้องเห็น
        send(chat_id, "ปุ่มพร้อมใช้ครับ 👇\n(ซิงค์อัตโนมัติทุกคืนอยู่แล้ว — "
                      "ดูสถานะด้วย /auto)", keyboard=True)
        send_panel(chat_id)
    elif text.startswith("/backup"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["backup_enabled"] = True
            save_state()
            send(chat_id, f"✅ เปิดสำรองข้อมูลอัตโนมัติแล้ว (ทุก {BACKUP_EVERY_DAYS} วัน)")
        elif arg in ("off", "ปิด"):
            state["backup_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดสำรองข้อมูลอัตโนมัติแล้ว — พิมพ์ /backup เพื่อสำรองเองได้")
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /backup · /backup on · /backup off")
        else:
            threading.Thread(target=run_backup, kwargs={"manual": True}, daemon=True).start()
    elif text.startswith("/autopost"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["autopost_enabled"] = True
            save_state()
            send(chat_id, f"✅ เปิดโพสต์อัตโนมัติแล้ว (เคาะทุก {AUTOPOST_EVERY_MIN} นาทีตอนเครื่องเปิด)")
        elif arg in ("off", "ปิด"):
            state["autopost_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดโพสต์อัตโนมัติแล้ว — ของที่ตั้งเวลาไว้จะไม่ขึ้นเพจเอง")
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /autopost · /autopost on · /autopost off")
        else:
            threading.Thread(target=run_autopost, kwargs={"manual": True}, daemon=True).start()
    elif text.startswith("/digest"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["digest_enabled"] = True
            save_state()
            send(chat_id, f"✅ เปิดสรุปยอดแล้ว — รายวันทุกเช้า + รายสัปดาห์ทุกวันจันทร์ (ดึงยอด {DIGEST_AT_DEFAULT} · "
                          f"ส่ง {DIGEST_SEND_AT} น. ผ่านบอท DVX Job)")
        elif arg in ("off", "ปิด"):
            state["digest_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดสรุปยอดอัตโนมัติแล้ว (ทั้งรายวันและรายสัปดาห์) — พิมพ์ /digest หรือ /digest week เพื่อส่งเองได้")
        elif arg in ("week", "weekly", "สัปดาห์"):
            threading.Thread(target=run_digest, kwargs={"manual": True, "kinds": ["weekly"]}, daemon=True).start()
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /digest · /digest week · /digest on · /digest off")
        else:
            threading.Thread(target=run_digest, kwargs={"manual": True, "kinds": ["daily"]}, daemon=True).start()
    elif text.startswith("/ideas"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["ideas_enabled"] = True
            save_state()
            send(chat_id, f"✅ เปิดเก็บไอเดียอัตโนมัติแล้ว (ทุกวัน {IDEAS_AT_DEFAULT} น.)")
        elif arg in ("off", "ปิด"):
            state["ideas_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดเก็บไอเดียอัตโนมัติแล้ว — พิมพ์ /ideas เพื่อเก็บเองได้")
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /ideas · /ideas on · /ideas off")
        else:
            threading.Thread(target=run_ideas, kwargs={"manual": True}, daemon=True).start()
    elif text.startswith("/rounds"):
        parts = text.split(maxsplit=1)
        action, times = parse_rounds_arg(parts[1] if len(parts) > 1 else "")
        if action == "on":
            state["stock_rounds_enabled"] = True
            save_state()
            if not state.get("auto_enabled", True):
                # รอบกลางวันวิ่งเฉพาะตอนเปิดซิงค์อัตโนมัติ (ดู _rounds_on) — ตอบว่า "เปิดแล้ว" เฉย ๆ จะไม่จริง
                send(chat_id, "✅ ตั้งเปิดรอบซิงค์ระหว่างวันไว้แล้ว แต่ตอนนี้ซิงค์อัตโนมัติปิดอยู่ทั้งหมด (/auto off) "
                              "— รอบจะเริ่มทำงานเมื่อพิมพ์ /auto on")
            else:
                send(chat_id, "✅ เปิดซิงค์สต็อกระหว่างวันแล้ว\n\n" + rounds_status())
        elif action == "off":
            state["stock_rounds_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดซิงค์สต็อกระหว่างวันแล้ว — ไม่กระทบรอบเที่ยงคืน (ดูที่ /auto) · กดปุ่มซิงค์เองได้ตลอด")
        elif action == "set":
            problem = rounds_problem(times, _nightly_at(state))
            if problem:
                cur = stock_rounds(state)
                send(chat_id, f"⚠️ ยังไม่ได้ตั้งให้ — {problem}\n"
                              f"รอบที่ใช้อยู่ตอนนี้: {' · '.join(cur) + ' น.' if cur else 'ยังไม่มี'}")
                return
            now = datetime.now()
            today = now.date().isoformat()
            before = stock_rounds(state)
            # ล้างบันทึกตาม "วันที่" ไม่ใช่ตามรายการเวลาใหม่ — เก็บของวันนี้ไว้ทั้งหมด ทิ้งของวันก่อน ๆ
            # ถ้าล้างตามรายการ ถอดรอบที่ทำไปแล้ววันนี้ออกแล้วใส่กลับ (/rounds 15:00 → /rounds 10:00,15:00 ตอนเที่ยง)
            # บันทึก "วันนี้ทำแล้ว" ของมันหาย รอบนั้นรันซ้ำทันที · ไฟล์ state ก็ยังไม่บวม เพราะของเก่าถูกทิ้งทุกครั้งที่ตั้ง
            # dict(...) ก่อนวน — เธรดรอบซิงค์อาจกำลังเขียน dict ตัวเดียวกันอยู่ วนของสดแล้วขนาดเปลี่ยนกลางทางจะพัง
            for k in ("stock_round_done", "stock_round_failed", "stock_round_attempted", "stock_round_set_late"):
                if isinstance(state.get(k), dict):
                    state[k] = {t: d for t, d in dict(state[k]).items() if d == today}
            # รอบที่เพิ่งใส่เพิ่มแต่เวลาของวันนี้ผ่านไปแล้ว = เริ่มพรุ่งนี้ ปิดของวันนี้ไว้เลย ไม่รันชดเชยทันทีที่ตั้ง
            # (ตั้งปุ๊บซิงค์ทุกยี่ห้อปั๊บ ทั้งที่ข้อมูลอาจเพิ่งสดจากรอบก่อนหน้า — อยากได้ตอนนี้กดปุ่มเอาเอง)
            # รอบที่วันนี้จบไปแล้ว (ถอดออกแล้วใส่กลับ) คงสถานะเดิม · stock_round_set_late ให้หน้าสถานะบอก "เริ่มพรุ่งนี้"
            # แทน "เสร็จแล้ว" ที่ไม่จริง
            set_late = [t for t in times if t not in before and _late_min(now, t) >= 0
                        and _day_map(state, "stock_round_done").get(t) != today]
            if set_late:
                _mark_rounds(state, "stock_round_done", set_late, today)
                _mark_rounds(state, "stock_round_set_late", set_late, today)
            state["stock_rounds"] = times
            save_state()
            note = (f"\n{' · '.join(set_late)} น. เลยเวลาของวันนี้ไปแล้ว — เริ่มรอบแรกพรุ่งนี้ "
                    "(อยากได้ข้อมูลสดตอนนี้ กดปุ่มซิงค์ได้เลย)") if set_late else ""
            send(chat_id, f"⏰ ตั้งรอบซิงค์ระหว่างวันเป็น {' · '.join(times)} น. แล้ว{note}\n\n" + rounds_status())
        elif action == "bad":
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /rounds · /rounds 10:00,15:00 · /rounds on · /rounds off")
        else:
            send(chat_id, rounds_status())
    elif text.startswith("/auto"):
        arg = text.split(maxsplit=1)[1].strip().lower() if " " in text else ""
        if arg in ("on", "เปิด"):
            state["auto_enabled"] = True
            save_state()
            send(chat_id, "✅ เปิดซิงค์อัตโนมัติแล้ว\n\n" + auto_status())
        elif arg in ("off", "ปิด"):
            state["auto_enabled"] = False
            save_state()
            send(chat_id, "⏸ ปิดซิงค์อัตโนมัติแล้ว — ต้องกดปุ่มเอาเอง")
        elif arg and parse_hhmm(arg):
            new_at = parse_hhmm(arg)
            # กติกาเดียวกับ /rounds — รอบเที่ยงคืนห้ามชิดรอบกลางวันเกิน 1 ชม. ทั้งสองฝั่ง (ดู nightly_clash)
            # เช็กกับรอบที่ตั้งไว้ทุกรอบ แม้ตอนนี้ปิดรอบกลางวันอยู่ — เปิดกลับเมื่อไหร่จะได้ไม่ชนเงียบ ๆ
            clash = nightly_clash(new_at, stock_rounds(state))
            if clash:
                t, gap = clash
                send(chat_id, f"⚠️ ยังไม่ได้เปลี่ยนเวลา — {new_at} ใกล้รอบซิงค์สต็อกระหว่างวัน {t} น. เกินไป "
                              f"({_gap_text(gap)}) ต้องห่างกันอย่างน้อย {STOCK_ROUND_MIN_GAP_MIN // 60} ชม. — "
                              "ซิงค์อัตโนมัติประจำวันดึงทั้งยอดขายและสต็อกทุกยี่ห้ออยู่แล้ว ซิงค์ซ้ำติด ๆ กันเสี่ยงโดนบล็อก\n"
                              f"เวลาที่ใช้อยู่ตอนนี้: {_nightly_at(state)} น. · ถ้าจะใช้เวลานี้จริง "
                              "ย้ายรอบระหว่างวันก่อนด้วย /rounds")
                return
            state["auto_at"] = new_at
            save_state()
            send(chat_id, f"⏰ เปลี่ยนเวลาเป็น {state['auto_at']} น. แล้ว\n\n" + auto_status())
        elif arg:
            send(chat_id, "ไม่เข้าใจครับ — ใช้ /auto on · /auto off · /auto 00:30")
        else:
            send(chat_id, auto_status())
    elif text == BTN_STOCK or text.startswith("/stock"):
        threading.Thread(target=run_sync,
                         args=(chat_id, ["--stock"], "ซิงค์สต็อกหน้าตู้"),
                         daemon=True).start()
    elif text == BTN_ALL or text.startswith("/sync"):
        threading.Thread(target=run_sync, args=(chat_id, [], "ซิงค์ทั้งหมด"),
                         daemon=True).start()
    elif text.startswith("/sales"):
        threading.Thread(target=run_sync,
                         args=(chat_id, ["--sales"], "ซิงค์ยอดขาย"),
                         daemon=True).start()


# ── ปุ่มจากแผง inline ──
#
# ⚠️ ต้องตอบ answerCallbackQuery ทุกครั้งและตอบก่อนเริ่มงาน — ไม่งั้นปุ่มค้างหมุนบนเครื่องคนกด
#    (Telegram ให้เวลาตอบสั้นมาก งานซิงค์กินหลายนาที รอให้เสร็จก่อนตอบไม่ทันแน่)
CALLBACK_JOBS = {
    "stock": (["--stock"], "ซิงค์สต็อกหน้าตู้"),
    "sync": ([], "ซิงค์ทั้งหมด"),
    "sales": (["--sales"], "ซิงค์ยอดขาย"),
}


def who(user):
    """ชื่อคนกดปุ่ม — ห้องนี้มีหลายคน ต้องรู้ว่าใครสั่ง (ฟังก์ชันล้วน — ทดสอบได้)"""
    u = user or {}
    name = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip()
    if name:
        return name
    return f"@{u['username']}" if u.get("username") else f"id {u.get('id', '?')}"


def handle_callback(cq):
    data = (cq.get("data") or "").strip()
    chat_id = ((cq.get("message") or {}).get("chat") or {}).get("id")
    call("answerCallbackQuery", callback_query_id=cq.get("id"), text="รับคำสั่งแล้ว")
    if not chat_id or chat_id != STATE.get("chat_id"):
        return              # ห้องอื่น — เมินเหมือนข้อความ
    name = who(cq.get("from"))
    if data in CALLBACK_JOBS:
        args, label = CALLBACK_JOBS[data]
        send(chat_id, f"👤 {name} กด <b>{label}</b>")
        threading.Thread(target=run_sync, args=(chat_id, args, label), daemon=True).start()
    elif data == "ideas":
        send(chat_id, f"👤 {name} กด <b>เก็บไอเดีย</b>")
        threading.Thread(target=run_ideas, kwargs={"manual": True}, daemon=True).start()
    elif data == "backup":
        send(chat_id, f"👤 {name} กด <b>สำรองข้อมูล</b>")
        threading.Thread(target=run_backup, kwargs={"manual": True}, daemon=True).start()
    elif data == "status":
        send(chat_id, auto_status())


def main():
    offset = 0
    me = call("getMe")
    print(f"บอทพร้อม: @{(me or {}).get('result', {}).get('username', '?')}"
          f" · ผูกกับ chat: {STATE.get('chat_id', 'ยังไม่ผูก — ส่ง /start ในกลุ่ม')}"
          f" · ซิงค์อัตโนมัติ {parse_hhmm(STATE.get('auto_at')) or AUTO_AT_DEFAULT} น.")
    threading.Thread(target=scheduler, daemon=True).start()

    while True:
        upd = call("getUpdates", offset=offset, timeout=50,
                   allowed_updates=["message", "callback_query"])
        if not upd or not upd.get("ok"):
            time.sleep(5)
            continue
        for u in upd["result"]:
            offset = u["update_id"] + 1
            try:
                if u.get("callback_query"):
                    handle_callback(u["callback_query"])
                else:
                    handle(u)
            except Exception as e:
                # ข้อความแปลก ๆ ใบเดียวต้องไม่ล้มทั้งบอท — เพราะบอทตายเมื่อไหร่
                # ซิงค์อัตโนมัติตายตามไปเงียบ ๆ ไม่มีใครรู้จนยอดขายหายไปหลายวัน
                print(f"[update {u.get('update_id')}] {e}")


if __name__ == "__main__":
    main()
