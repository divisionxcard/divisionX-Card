#!/usr/bin/env python3
"""
กุญแจกลางของ Chrome profile Research — ใช้ร่วมกับโปรเจกต์ AssetX (เจ้าของตัดสิน 3 พ.ย. 2026)

บัญชีสำรองชุดเดียว + ส่วนเสริม OpenCLI ตัวเดียว ถูกใช้ 2 โปรเจกต์บนเครื่องเจ้าของ จึงต้อง:
  1. ผลัดกันใช้ — lock.json สร้างแบบ O_EXCL (ใครสร้างได้คนนั้นถือ) · แตะ mtime ทุกครั้งที่เรียก OpenCLI
     เป็นสัญญาณชีพ · เงียบเกิน 10 นาที = คนถือตายไปแล้ว (โดน timeout ฆ่า/เครื่องดับ) ยึดต่อได้
  2. รู้ร่วมกันว่าบัญชีโดนขอยืนยันตัวตน — state.json · blocked ต่อแพลตฟอร์ม · พัก 3 วันทั้งสองโปรเจกต์
  3. จดว่าใครเปิดกี่เพจ — usage.jsonl ทีละเพจก่อนเปิด + แถวสรุปตอนจบ · คุมเพดานรวมต่อวันของบัญชี
กติกาเขียน: state.json / usage.jsonl เขียนเฉพาะตอนถือกุญแจ (จึงไม่ชนกัน) · อ่านได้ทุกเมื่อ
ที่อยู่: %USERPROFILE%\\.research-browser\\ (นอกรีโปทั้งสอง · ตั้ง RESEARCH_BROWSER_DIR ทับได้ตอนทดสอบ)

ข้อตกลงเต็ม + ตัวฝั่ง Node ของ AssetX: ~/.claude/skills/social-research/profiles/shared-browser-dvx-assetx.md
แก้รูปไฟล์/ความหมายที่นี่ ต้องแก้ references/shared-browser.mjs ในสกิลให้ตรงกันด้วย (เทสต์ข้ามภาษา)
"""
import json
import os
import secrets
import socket
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

TH = timezone(timedelta(hours=7))
STALE_SEC = 600          # ไม่มีสัญญาณชีพเกิน 10 นาที = กุญแจค้าง (คำสั่ง OpenCLI ช้าสุด 150 วิ จึงไม่ชนคนที่ยังทำงาน)
BLOCK_DAYS = 3           # บัญชีโดนขอยืนยันตัวตน → พักเลนนั้น 3 วัน (เท่ากับตัวเฝ้าเพจเดิม)


def default_dir():
    return Path(os.environ.get("RESEARCH_BROWSER_DIR") or (Path.home() / ".research-browser"))


def now_iso():
    return datetime.now(TH).isoformat(timespec="seconds")


def today_iso():
    return datetime.now(TH).date().isoformat()


class LostLock(Exception):
    """กุญแจหลุดมือระหว่างทำงาน (ค้างนานจนอีกฝั่งยึดไป) — ต้องหยุดใช้ browser ทันที
    ไม่ใช่ลูกของ WatchError จึงไม่โดนจับว่า "อ่านเพจนี้ไม่สำเร็จ" แล้ววนเพจต่อไป"""


def _retry(fn, tries=6, wait=0.25):
    """Windows ลบ/แทนไฟล์ที่อีกโปรเซสเปิดอ่านค้างอยู่ไม่ได้ (PermissionError) — การอ่านสั้นมาก รอแป๊บแล้วลองใหม่"""
    for i in range(tries):
        try:
            return fn()
        except PermissionError:
            if i == tries - 1:
                raise
            time.sleep(wait)


def _read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_json(path, obj):
    path = Path(path)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    _retry(lambda: os.replace(tmp, path))


def read_state(base=None):
    st = _read_json((Path(base) if base else default_dir()) / "state.json")
    if not isinstance(st, dict):
        st = {}
    if not isinstance(st.get("blocked"), dict):
        st["blocked"] = {}
    return st


def blocked_for(platform, today, base=None):
    """→ แถว blocked ของแพลตฟอร์มนั้นถ้ายังไม่ครบ 3 วัน ไม่งั้น None · today เป็น date หรือ ISO"""
    b = read_state(base)["blocked"].get(platform)
    if not isinstance(b, dict) or not b.get("at"):
        return None
    t = today if isinstance(today, date) else date.fromisoformat(today)
    try:
        return b if (t - date.fromisoformat(b["at"])).days < BLOCK_DAYS else None
    except ValueError:
        return None


def usage_rows(base=None):
    path = (Path(base) if base else default_dir()) / "usage.jsonl"
    try:
        # ถอดแบบแทนไบต์เสีย + ตัดด้วย \n เท่านั้น ให้ตรงกับฝั่ง Node — บรรทัดที่ขาดกลางตัวอักษรไทยเสียแค่บรรทัดเดียว
        # (read_text จะโยน UnicodeDecodeError ทั้งไฟล์ = เพดานรวมดับทั้งวัน)
        lines = path.read_bytes().decode("utf-8", errors="replace").split("\n")
    except OSError:
        return []
    rows = []
    for ln in lines:
        if not ln.strip():
            continue
        try:
            r = json.loads(ln)
        except ValueError:
            continue                       # บรรทัดเสีย (เขียนค้างตอนเครื่องดับ) ข้ามไป ไม่ล้มทั้งไฟล์
        if isinstance(r, dict):
            rows.append(r)
    return rows


def pages_on(day_iso, base=None, rows=None):
    """จำนวนเพจที่เปิดในวันนั้น (เวลาไทย) ต่อแพลตฟอร์ม รวมทุกโปรเจกต์ → {"facebook": 7, ...}"""
    total = {}
    for r in usage_rows(base) if rows is None else rows:
        if r.get("date") != day_iso:
            continue
        for k, v in (r.get("pages") or {}).items():
            if isinstance(v, (int, float)) and v > 0:
                total[k] = total.get(k, 0) + int(v)
    return total


class Lock:
    """กุญแจของ browser ร่วม · project = ชื่อสั้นของโปรเจกต์ ("dvx" / "assetx")"""

    def __init__(self, project, purpose="", base=None):
        self.project = project
        self.dir = Path(base) if base else default_dir()
        self.path = self.dir / "lock.json"
        self.token = secrets.token_hex(8)
        self.held = False
        self.started = None
        self.purpose = purpose
        self.stolen_from = None            # ยึดกุญแจค้างของใครมา (ไว้รายงาน)

    # ── ถือ/ปล่อย ──
    def try_acquire(self):
        self.dir.mkdir(parents=True, exist_ok=True)
        for _ in range(3):
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
            except FileExistsError:
                if not self._clear_if_stale():
                    return False
                continue
            except PermissionError:          # อีกฝั่งกำลังลบไฟล์อยู่พอดี (Windows) — ถือว่ายังไม่ว่าง
                return False
            self.started = now_iso()
            info = {"project": self.project, "token": self.token, "pid": os.getpid(),
                    "host": socket.gethostname(), "purpose": self.purpose, "started_at": self.started}
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(info, f, ensure_ascii=False)
            self.held = True
            return True
        return False

    def acquire(self, wait_sec=0, poll_sec=20, sleep=time.sleep, clock=time.monotonic):
        """รอได้สูงสุด wait_sec วิ → True ถ้าได้กุญแจ"""
        end = clock() + max(wait_sec, 0)
        while True:
            if self.try_acquire():
                return True
            left = end - clock()
            if left <= 0:
                return False
            sleep(min(poll_sec, max(left, 0.5)))

    def _clear_if_stale(self):
        """กุญแจที่ไม่มีสัญญาณชีพเกิน STALE_SEC → ย้ายออกแล้วให้ลองสร้างใหม่ · → True = ลองสร้างใหม่ได้"""
        try:
            st = os.stat(self.path)
        except FileNotFoundError:
            return True
        if time.time() - st.st_mtime < STALE_SEC:
            return False
        grave = self.path.with_name(f"lock.stale-{self.token}.json")
        try:
            os.rename(self.path, grave)
        except FileNotFoundError:
            return True
        except OSError:
            return False
        try:
            fresh = time.time() - os.stat(grave).st_mtime < STALE_SEC
        except OSError:
            fresh = False
        if fresh:
            # ระหว่างเราดูอายุกับย้าย มีคนยึดแล้วสร้างกุญแจสดใหม่ — คืนที่เดิม (link ไม่ทับไฟล์ที่มีอยู่ · คง mtime)
            try:
                os.link(grave, self.path)
            except OSError:
                pass
            try:
                _retry(lambda: os.remove(grave))
            except OSError:
                pass
            return False
        self.stolen_from = _read_json(grave) or {}
        try:
            _retry(lambda: os.remove(grave))
        except OSError:
            pass
        return True

    def holder(self):
        """ใครถือกุญแจอยู่ → dict (+ idle_sec) หรือ None ถ้าว่าง"""
        try:
            st = os.stat(self.path)
        except FileNotFoundError:
            return None
        info = _read_json(self.path) or {}
        info["idle_sec"] = int(time.time() - st.st_mtime)
        return info

    def beat(self):
        """สัญญาณชีพ — เรียกก่อนทุกคำสั่ง OpenCLI · → False = กุญแจไม่ใช่ของเราแล้ว (ห้ามใช้ browser ต่อ)"""
        if not self.held:
            return False
        cur = _read_json(self.path)
        if not cur or cur.get("token") != self.token:
            self.held = False
            return False
        try:
            os.utime(self.path, None)
        except OSError:
            pass
        return True

    def require(self):
        if not self.beat():
            raise LostLock("กุญแจ browser หลุดมือ (ค้างนานจนอีกโปรเจกต์ยึดไป)")

    def release(self):
        if not self.held:
            return
        cur = _read_json(self.path)
        if cur and cur.get("token") == self.token:
            try:
                _retry(lambda: os.remove(self.path))
            except OSError:
                pass
        self.held = False

    # ── เขียนของร่วม (ต้องถือกุญแจ) ──
    def set_blocked(self, platform, why, day=None):
        self.require()
        st = read_state(self.dir)
        st["blocked"][platform] = {"at": day or today_iso(), "why": str(why)[:300], "by": self.project,
                                   "time": now_iso()}
        st.update(updated_at=now_iso(), updated_by=self.project)
        _write_json(self.dir / "state.json", st)

    def clear_blocked(self, platform):
        """อ่านสำเร็จ = บัญชีกลับมาใช้ได้ → ลบสถานะพักของแพลตฟอร์มนั้น (เขียนเฉพาะตอนมีแถวอยู่)"""
        st = read_state(self.dir)
        if platform not in st["blocked"]:
            return False
        self.require()
        st["blocked"].pop(platform, None)
        st.update(updated_at=now_iso(), updated_by=self.project)
        _write_json(self.dir / "state.json", st)
        return True

    def log_usage(self, pages, result="ok", note="", day=None, opened=None):
        """จดการใช้บัญชีร่วม (ต้องถือกุญแจ) — เพดานรวมนับจาก `pages` ของทุกแถว

        จดทีละเพจ **ก่อนเปิด**: log_usage({"facebook": 1}, "open") — รอบที่โดน timeout ฆ่า/กุญแจหลุดกลางทาง
        ก็ยังนับเพจที่เปิดไปแล้วครบ (นับเกินได้ 1 ดีกว่านับขาด) · จบรอบ: log_usage({}, ผล, opened=ยอดรวม) แถวสรุป ไม่นับซ้ำ
        """
        self.require()
        row = {"project": self.project, "date": day or today_iso(), "start": self.started, "end": now_iso(),
               "pages": {k: int(v) for k, v in (pages or {}).items() if v}, "result": result}
        if opened:
            row["opened"] = {k: int(v) for k, v in opened.items() if v}
        if note:
            row["note"] = str(note)[:200]
        path = self.dir / "usage.jsonl"
        lead = b""
        try:
            with path.open("rb") as f:
                f.seek(-1, os.SEEK_END)                 # ไฟล์ว่าง/ไม่มีไฟล์ = OSError = ไม่ต้องขึ้นบรรทัด
                if f.read(1) != b"\n":
                    lead = b"\n"                       # บรรทัดก่อนขาดตอนเครื่องดับ (หรือท้ายเป็น NUL) — ปิดบรรทัดก่อน แถวนี้จะได้ไม่หายไปด้วย
        except OSError:
            pass
        with path.open("ab") as f:
            f.write(lead + (json.dumps(row, ensure_ascii=False) + "\n").encode("utf-8"))
