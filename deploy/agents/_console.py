"""บังคับ stdout/stderr เป็น UTF-8 — import ไว้บนสุดของสคริปต์ที่พิมพ์ภาษาไทย

ทำไมต้องมี:
    สคริปต์เกือบทุกตัวในโฟลเดอร์นี้พิมพ์ข้อความไทย ซึ่งบน Windows ขึ้นกับว่ารันจากไหน
      · PowerShell           → คอนโซล UTF-8 → พิมพ์ได้ปกติ
      · Git Bash / cmd / pipe → Python เดาเป็น cp1252 → **UnicodeEncodeError ตายทั้งสคริปต์**

    เจอจริง (2026-08-10): scene_for_content.py รันใน PowerShell ผ่าน แต่พอสั่งผ่าน bash
    ตายตั้งแต่บรรทัด print แรก ก่อนจะได้วาดภาพด้วยซ้ำ — และ log ออกมาเป็นไฟล์เปล่า
    ทำให้ดูเหมือน "FLUX พัง" ทั้งที่ FLUX ยังไม่ได้เริ่มทำงาน

    เป็นบั๊กประเภทเดียวกับ f-string 3.12 บน CI 3.11 คือ **"รันที่หนึ่งได้ อีกที่พัง"**
    ซึ่งหาเจอยากเพราะบนเครื่องคนเขียนมันผ่าน

errors="replace" ไว้อีกชั้น — พิมพ์เป็น ? ยังดีกว่างานทั้งหมดล่มเพราะตัวอักษรตัวเดียว
"""
import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass          # Python เก่า หรือ stream ที่ reconfigure ไม่ได้ — ปล่อยผ่าน ไม่ใช่เรื่องคอขาดบาดตาย
