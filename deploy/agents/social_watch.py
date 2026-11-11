#!/usr/bin/env python3
"""
เฝ้าเพจ/บัญชีที่ติดตามไว้ (Facebook · Instagram · Reddit) → หยิบโพสต์ที่ "แรงผิดปกติ" เข้าคิวไอเดีย

เจ้าของขอ 21 ต.ค. 2026: เอาข้อมูลจากเพจที่ติดตามไว้มาเป็นองค์ความรู้ปรับคอนเทนต์ ภาพ วิดีโอ
วงจร: เก็บทุกวัน (ไฟล์นี้) → สรุปบทเรียนรายสัปดาห์ → เจ้าของอนุมัติ → ทดลองจริง → เก็บ/ทิ้ง

  python deploy/agents/social_watch.py                 # รอบปกติ (เพจที่ถึงรอบ)
  python deploy/agents/social_watch.py --dry-run       # อ่านจริงแต่ไม่เขียนคลัง/สถานะ/คิวของเรา (ของร่วมใน ~/.research-browser ยังเขียน)
  python deploy/agents/social_watch.py --target "Nut Card"   # เพจเดียว ไม่สนรอบ
  python deploy/agents/social_watch.py --only facebook

⚠️ รันบนเครื่องเจ้าของเท่านั้น (บอท Telegram เรียกตอนเก็บไอเดีย 07:00) — GitHub Actions ไม่มี Chrome/บัญชี
   ต้องมี Chrome profile "Research" (บัญชีสำรอง) + ส่วนเสริม OpenCLI ต่ออยู่
   ไม่ต่อ = เปิด Chrome profile นั้นแบบไม่มีหน้าต่างให้ 1 ครั้ง แล้วรอให้ต่อ
⚠️ อ่านอย่างเดียว — ห้ามเรียกคำสั่ง [write] ของ OpenCLI (follow/like/comment/join) · เว้นจังหวะระหว่างเพจ
   ทุกคำสั่งระบุ --profile research เสมอ กันพลาดไปใช้บัญชีร้านถ้าวันหน้ามีคนลงส่วนเสริมซ้ำ
⚠️ ข้อมูลดิบเก็บที่ <repo>/research/social/ (gitignored · อยู่นอก deploy/ ที่ถูกอัปขึ้น Vercel)
   เก็บแค่แคปชั่น + ตัวเลข ไม่เก็บชื่อ/ข้อความของคนที่มาคอมเมนต์
⚠️ ไอเดียใช้ source 'manual' + subtype social_fb / social_ig / social_reddit
   (ตารางไม่มี source โซเชียลแยก แบบเดียวกับ scripts/hermes/competitor_radar.py)
   หน้าเว็บตัดสินโลโก้จากโดเมนลิงก์ (lib/ideaPlatform.js) จึงขึ้นใต้โลโก้ FB/IG/Reddit เอง
⚠️ Chrome profile Research ใช้ร่วมกับโปรเจกต์ AssetX (เฉพาะ Facebook · เจ้าของตัดสิน 3 พ.ย. 2026) → shared_browser.py
   ถือกุญแจกลางก่อนแตะ browser (ไม่ว่าง = รอสูงสุด wait_minutes แล้วข้ามรอบ) · บัญชีโดนขอยืนยันตัวตน = แจ้งอีกฝั่งด้วย ·
   เปิดเพจรวมทั้งสองโปรเจกต์ไม่เกิน daily_cap ต่อวัน (ของเราเองไม่เกิน own_daily_cap — กันที่ให้ AssetX) ·
   จดการใช้ทีละเพจก่อนเปิด · ทั้งรอบ (รวมรอกุญแจ) ไม่เกิน run_budget_sec ให้จบเองก่อนบอทฆ่าที่ 1500 วิ ·
   session ของเรา "dvxwatch" (ปิดเฉพาะของเรา) · --dry-run / --target ก็ต้องถือกุญแจและจดการใช้เหมือนรอบจริง

Facebook ไม่มีคำสั่งอ่านโพสต์ของเพจใน OpenCLI → เปิดหน้าเพจแล้วอ่าน DOM เอง (FB_JS) · กับดักที่เจอ:
  - FB ล้างเนื้อหาโพสต์ที่เลื่อนพ้นจอ (เหลือกรอบ aria-posinset เปล่า) → ต้องอ่านทีละจอระหว่างเลื่อน
  - เวลาโพสต์ถูกสลับตัวอักษรกันบอท อ่านไม่ได้ → ใช้ "วันที่เห็นครั้งแรก" แทน (รอบถัดไปอัปเดตยอด)
  - ลิงก์เวลาโพสต์เป็น "#" จนกว่าจะเอาเมาส์ชี้ → คลิปใช้ data-video-id · รูปใช้ลิงก์ photo/?fbid=
"""
import argparse
import hashlib
import json
import os
import random
import re
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dvx_data as data  # noqa: E402
import shared_browser as sb  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CFG_FILE = ROOT / "deploy" / "tasks" / "social_watch.json"
STORE = ROOT / "research" / "social"
OPENCLI = (Path(os.environ.get("APPDATA", "")) / "npm" / "node_modules" / "@jackwener" / "opencli"
           / "dist" / "src" / "main.js")
CHROME_PATHS = [
    Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
]
# Chrome ต้องเปิดด้วยค่านี้ ไม่งั้นหน้าต่างโหมด background ที่ถูกบัง/จอล็อก = hidden → FB ไม่โหลดโพสต์ต่อ (3 พ.ย. 2026)
# ไอคอน Chrome ของเจ้าของใส่ไว้แล้ว (สำรองไอคอนเดิมที่ ~/.research-browser/chrome-shortcut-backup) · ค่าใช้ทั้ง process ทุก profile
CHROME_FLAGS = ["--disable-backgrounding-occluded-windows", "--disable-features=CalculateNativeWinOcclusion"]
SESSION = "dvxwatch"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_LOCK = None             # กุญแจ browser ร่วม (shared_browser.Lock) ระหว่างรอบ · oc() แตะสัญญาณชีพให้ทุกคำสั่ง
TH = timezone(timedelta(hours=7))

PLATFORM_LABEL = {"facebook": "Facebook", "instagram": "Instagram", "reddit": "Reddit"}
SUBTYPE = {"facebook": "social_fb", "instagram": "social_ig", "reddit": "social_reddit"}
SHORT = {"facebook": "fb", "instagram": "ig", "reddit": "rd"}
FMT_TH = {"video": "คลิป", "photo": "รูป", "album": "อัลบั้มรูป", "link": "แชร์ลิงก์", "text": "ข้อความ",
          "carousel": "สไลด์รูป", "reel": "Reels", "post": "กระทู้"}
MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

# มุมตั้งต้นตามกลุ่มเพจ — ตัวคิดมุม (idea_angles.py) จะคิดเพิ่มอีก 3 มุมโดยมีกติกาเลน "social" กำกับ
ANGLE = {
    "competitor": ("คู่แข่งโพสต์นี้แล้วคนตอบรับแรงกว่าปกติ — ถอดว่าเขาเล่นมุม/ข้อเสนออะไร แล้วทำมุมของเราที่ต่างออกไป "
                   "(จุดขายเรา: กดเองได้ในห้าง ไม่ต้องต่อคิว) · ห้ามพาดพิงชื่อเขา ห้ามลอกข้อความ/ภาพ"),
    "shop": ("โพสต์นี้แรงกว่าปกติของเพจ — ถอดรูปแบบ (ฮุคเปิด · ชนิดโพสต์ · เรื่องที่เล่า) "
             "แล้วทำเวอร์ชันของเราจากสินค้า/ตู้จริง · ห้ามลอกข้อความ/ภาพ"),
    "official": ("ประกาศทางการที่แฟน ๆ ตอบรับแรง — บอกว่าคนรออะไรอยู่ · ทำโพสต์ของเราโยงเฉพาะสินค้าที่ตู้เรามีจริง "
                 "ห้ามเดาวันของเข้า"),
    "community": ("กระทู้ที่ชุมชนต่างประเทศสนใจมาก — หยิบ 'คำถาม/ความอยากรู้' มาเล่าให้คนไทยรู้ก่อนใคร "
                  "ระบุว่ามาจากชุมชนต่างประเทศ ห้ามเขียนเหมือนข่าวไทยที่ยืนยันแล้ว"),
}
ANGLE["media"] = ANGLE["shop"]

# เพจร้าน/ผู้ผลิตตู้โพสต์เรื่องอื่นปนด้วย (Hi-Top ขายเครื่องสแกนนิ้ว · B2S ขายเครื่องเขียน) — โพสต์ที่ไม่มีคำพวกนี้
# ไม่เข้าคิวไอเดีย (รอบแรก 21 ต.ค. โพสต์เครื่องสแกนนิ้วแรงกว่าปกติ 237 เท่าหลุดเข้าคิว) · Reddit เป็นชุมชนการ์ดอยู่แล้ว ไม่กรอง
CARD_TERMS = re.compile(
    r"การ์ด|\bcards?\b|\btcg\b|\bocg\b|ซอง|booster|บูสเตอร์|กล่อง|\bbox|\bpacks?\b|แพ็ค|one ?piece|วันพีซ|"
    r"pok[eé]mon|โปเกม|lorcana|yu-?gi-?oh|ยูกิ|dragon ?ball|ดราก้อนบอล|naruto|นารูโตะ|\bmtg\b|gundam|union arena|"
    r"ตู้กด|vending|กาชา|gacha|สะสม|\bpsa\b|\bbgs\b|เกรด|แข่ง|\bop-?\d{2}\b|\beb-?\d{2}\b",
    re.I)


def card_related(caption):
    return bool(CARD_TERMS.search(caption or ""))


class WatchError(Exception):
    """อ่านไม่สำเร็จ — ข้ามเพจนั้น/เลนนั้น ไม่ทำให้ทั้งรอบล้ม"""


class Blocked(WatchError):
    """แพลตฟอร์มขอให้ล็อกอิน/ยืนยันตัวตน — หยุดเลนนั้นทันที อย่ารัวต่อ (เสี่ยงบัญชีโดนแบน)"""


class Hidden(WatchError):
    """หน้าต่าง browser ถูกซ่อน (จอล็อก/ถูกหน้าต่างอื่นบัง) — Chrome หยุดวาดหน้า FB จึงไม่โหลดโพสต์ถัดไป
    หยุดเลน FB รอบนี้ (เปิดเพจต่อก็ได้เพจละ 1 โพสต์ เปลืองโควตาบัญชีร่วม) · ไม่ใช่บัญชีโดนบล็อก ไม่ต้องพัก 3 วัน"""


def log(msg=""):
    print(msg, flush=True)


def th_today():
    return datetime.now(TH).date()


def thai_day(iso):
    d = date.fromisoformat(iso)
    return f"{d.day} {MONTH_TH[d.month]} {d.year}"


def days_between(a_iso, b):
    return (b - date.fromisoformat(a_iso)).days


def short_num(n):
    if n is None:
        return "-"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M".replace(".0M", "M")
    if n >= 1_000:
        return f"{n / 1_000:.1f}K".replace(".0K", "K")
    return str(n)


# ── OpenCLI ─────────────────────────────────────────────────────────────────
def oc(*args, timeout=150, beat=True):
    """เรียก OpenCLI (node main.js ตรง ๆ — เลี่ยง opencli.cmd ที่ทำเครื่องหมายคำพูดเพี้ยน) → JSON

    รันจากโฟลเดอร์บ้าน ไม่ใช่ใน repo · ห้ามส่งคำสั่ง [write] เข้ามาที่นี่
    ถือกุญแจ browser ร่วมอยู่ = แตะสัญญาณชีพก่อนทุกคำสั่ง · กุญแจหลุดมือ = LostLock (ห้ามใช้ browser ต่อ)
    """
    if beat and _LOCK is not None:
        _LOCK.require()
    if not OPENCLI.exists():
        raise WatchError(f"ไม่พบ OpenCLI ({OPENCLI}) — ติดตั้งด้วย npm i -g @jackwener/opencli@2.0.2")
    try:
        p = subprocess.run(["node", str(OPENCLI), *args], capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout, cwd=str(Path.home()), creationflags=NO_WINDOW)
    except subprocess.TimeoutExpired:
        raise WatchError(f"OpenCLI ช้าเกิน {timeout} วิ ({' '.join(args[:2])})")
    out = (p.stdout or "").strip()
    cmd = " ".join((args[2:] if args[:1] == ("--profile",) else args)[:2])
    try:
        res = json.loads(out)
    except ValueError:
        raise WatchError(f"OpenCLI ตอบไม่ใช่ JSON ({cmd}): {(out or p.stderr or '').strip()[-240:]}")
    if isinstance(res, dict) and res.get("ok") is False:
        err = res.get("error")
        msg = err.get("message") if isinstance(err, dict) else err
        raise WatchError(f"OpenCLI {cmd}: {str(msg or res)[:240]}")
    return res


def unwrap(res):
    d = res.get("data") if isinstance(res, dict) and "data" in res else res
    if isinstance(d, dict) and "result" in d:
        d = d["result"]
    return d


def bridge_info(alias):
    """→ (daemon รันอยู่ไหม — None = ถามไม่ได้, ส่วนเสริมของ profile นั้นต่ออยู่ไหม)"""
    try:
        info = unwrap(oc("profile", "list", timeout=60)) or {}
    except WatchError:
        return None, False
    return (info.get("daemonRunning"),
            any(p.get("alias") == alias and p.get("connected") for p in info.get("profiles") or []))


def bridge_ready(alias):
    return bridge_info(alias)[1]


def ensure_bridge(cfg, deadline=None):
    """→ (พร้อมไหม, เปิด Chrome ให้เองไหม) · เปิดแบบ --no-startup-window = ไม่มีหน้าต่างเด้งใส่หน้าจอ"""
    alias = cfg.get("bridge_profile", "research")
    running, ok = bridge_info(alias)
    if ok:
        return True, False
    if running is False:
        # ⚠️ 31 ต.ค.–3 พ.ย. 2026 ข้ามทุกรอบเพราะ daemon ของ OpenCLI ไม่ขึ้นเองหลังเปิดเครื่อง — `profile list` ไม่สตาร์ตให้
        #    เจ้าของเปิด Chrome profile Research แล้วก็ยังไม่ต่อ · `daemon restart` สตาร์ตจากสถานะหยุดได้ ส่วนเสริมต่อเองทันที
        log("[social] OpenCLI daemon ไม่ได้รัน (เครื่องเพิ่งเปิด?) — สั่งสตาร์ตให้เอง")
        try:
            oc("daemon", "restart", timeout=60)
        except WatchError as e:
            log(f"⚠️ [social] สตาร์ต OpenCLI daemon ไม่สำเร็จ: {e}")
        for _ in range(3):
            time.sleep(3)
            if bridge_ready(alias):
                return True, False
    chrome = next((c for c in CHROME_PATHS if c.exists()), None)
    if not chrome:
        return False, False
    subprocess.Popen([str(chrome), f"--profile-directory={cfg.get('chrome_profile_dir', 'Profile 9')}", *CHROME_FLAGS,
                      "--no-startup-window"], creationflags=NO_WINDOW, close_fds=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(15):
        if deadline is not None and time.monotonic() > deadline:
            break
        time.sleep(4)
        if bridge_ready(alias):
            return True, True
    return False, True


def chrome_flags_active():
    """Chrome ที่รันอยู่เปิดด้วย CHROME_FLAGS ไหม → True / False / None (ไม่มี Chrome หรือเช็กไม่ได้)

    ค่าพวกนี้ติดตอนเปิด process แรกเท่านั้น — เปิด Chrome จากเมนู Start/ลิงก์ของแอปอื่นตอน Chrome ปิดอยู่ = ไม่มีค่า
    """
    ps = ("Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -notmatch '--type=' }"
          " | Select-Object -ExpandProperty CommandLine")
    try:
        p = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=30, creationflags=NO_WINDOW)
    except (OSError, subprocess.TimeoutExpired):
        return None
    lines = [ln for ln in (p.stdout or "").splitlines() if ln.strip()]
    if not lines:
        return None
    return all(CHROME_FLAGS[0] in ln for ln in lines)


# ── Facebook: อ่าน DOM หน้าเพจ ──────────────────────────────────────────────
# คืนเฉพาะแคปชั่น + ตัวเลข + id สื่อ — ไม่คืนบรรทัดคอมเมนต์ (มีชื่อ/ข้อความคนอื่น)
FB_JS = r"""
(() => {
  const clean = s => (s || '').replace(/[\u200b-\u200f\u034f\u2060\ufeff]/g, '');
  const path = location.pathname;
  if (/^\/(login|checkpoint)/.test(path)) return { blocked: path.split('/')[1], posts: [] };
  if (document.querySelector('input[name="pass"]') && !document.querySelector('div[aria-posinset]'))
    return { blocked: 'login', posts: [] };
  const MUL = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, 'พัน': 1e3, 'หมื่น': 1e4, 'แสน': 1e5, 'ล้าน': 1e6 };
  const num = s => {
    const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KkMm]|พัน|หมื่น|แสน|ล้าน)?/);
    return m ? Math.round(parseFloat(m[1]) * (MUL[m[2]] || 1)) : null;
  };
  const N = '([\\d.,]+\\s*(?:[KkMm]|พัน|หมื่น|แสน|ล้าน)?)';
  const RX = {
    comments: [new RegExp('^' + N + '\\s+comments?$', 'i'), new RegExp('^ความคิดเห็น\\s*' + N + '\\s*รายการ$')],
    shares: [new RegExp('^' + N + '\\s+shares?$', 'i'), new RegExp('^(?:แชร์|การแชร์)\\s*' + N + '\\s*ครั้ง$')],
    views: [new RegExp('^' + N + '\\s+(?:views?|plays?)$', 'i'), new RegExp('^(?:การดู|ดู|ยอดดู)\\s*' + N + '\\s*ครั้ง$')],
  };
  const UI = /^(?:·\s*)?(See translation|See original|Rate this translation|See more|… ?See more|ดูคำแปล|ดูต้นฉบับ|ให้คะแนนคำแปลนี้|ดูเพิ่มเติม|Send message|ส่งข้อความ|Like|Comment|Share|ถูกใจ|แสดงความคิดเห็น|แชร์|Follow|ติดตาม|·)$/;
  const STOP = /^(All reactions:?|ความรู้สึกทั้งหมด:?|Like|ถูกใจ)$/i;
  const posts = [];
  for (const a of document.querySelectorAll('div[aria-posinset]')) {
    const txt = clean(a.innerText).trim();
    if (!txt) continue;
    // ⚠️ 22 ต.ค. 2026 — บางโพสต์มีป้ายซ่อนคำว่า "Facebook" ซ้ำหลายสิบบรรทัดนำหน้า (เห็นใน innerText)
    //    ไม่กรองแล้วแคปชั่นสำรองกลายเป็น "Facebook" 32 บรรทัด + ชื่อเพจ (เจอที่ Pokémon Trainers Thailand)
    const lines = txt.split('\n').map(s => s.trim()).filter(l => l && l !== 'Facebook');
    const m = { reactions: null, comments: null, shares: null, views: null };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (m.reactions == null && /^(All reactions:?|ความรู้สึกทั้งหมด:?)$/i.test(l)) m.reactions = num(lines[i + 1]);
      for (const k of ['comments', 'shares', 'views']) {
        if (m[k] != null) continue;
        for (const rx of RX[k]) { const x = l.match(rx); if (x) { m[k] = num(x[1]); break; } }
      }
    }
    const msgEl = a.querySelector('[data-ad-comet-preview="message"], [data-ad-preview="message"]');
    let caption = msgEl ? clean(msgEl.innerText) : '';
    if (!caption) {
      const end = lines.findIndex(l => STOP.test(l) || RX.views[0].test(l));
      caption = lines.slice(1, end > 0 ? end : 12)
        .filter(l => l.length > 2 && !UI.test(l) && !/^\d+:\d+ \/ \d+:\d+$/.test(l)).join('\n');
    }
    caption = caption.replace(/…\s*(See more|ดูเพิ่มเติม)\s*$/, '…').trim();
    const vEl = a.querySelector('[data-video-id]');
    const vid = vEl ? vEl.getAttribute('data-video-id') : null;
    const fbids = [...new Set([...a.querySelectorAll('a[href*="fbid="]')]
      .map(x => ((x.getAttribute('href') || '').match(/[?&]fbid=(\d+)/) || [])[1]).filter(Boolean))];
    const perma = [...a.querySelectorAll('a[href]')].map(x => x.href)
      .find(h => /\/posts\/|story_fbid=|\/permalink\.php|\/reel\/\d+|\/videos\/\d+/.test(h) && !/comment_id=/.test(h)) || null;
    const ext = [...a.querySelectorAll('a[href*="l.facebook.com/l.php"]')].map(x => {
      try { return new URL(new URL(x.href).searchParams.get('u')).hostname; } catch (e) { return null; } }).find(Boolean) || null;
    const format = vid ? 'video' : fbids.length > 1 ? 'album' : fbids.length === 1 ? 'photo' : ext ? 'link' : 'text';
    posts.push({ pos: Number(a.getAttribute('aria-posinset')) || null, vid, fbids: fbids.slice(0, 4), perma, ext,
      format, caption: caption.slice(0, 700), m });
  }
  return { blocked: null, posts, vis: document.visibilityState };
})()
"""


def _hash(s):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:14]


def fb_key(p):
    if p.get("vid"):
        return f"v{p['vid']}"
    if p.get("fbids"):
        return f"p{p['fbids'][0]}"
    if p.get("perma"):
        return f"u{_hash(p['perma'].split('?')[0])}"
    if p.get("caption"):
        return f"h{_hash(p['caption'][:160])}"
    return None


def fb_link(p, page_url):
    if p.get("vid"):
        return f"https://www.facebook.com/watch/?v={p['vid']}"
    if p.get("fbids"):
        return f"https://www.facebook.com/photo/?fbid={p['fbids'][0]}"
    if p.get("perma"):
        u = urllib.parse.urlsplit(p["perma"])
        keep = [(k, v) for k, v in urllib.parse.parse_qsl(u.query) if k in ("story_fbid", "id", "v")]
        return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, urllib.parse.urlencode(keep), ""))
    return page_url


def _richness(p):
    return sum(v is not None for v in p["m"].values()) * 1000 + len(p.get("caption") or "")


def read_facebook(target, cfg):
    W = ["--session", SESSION, "--window", "background", "--profile", cfg.get("bridge_profile", "research")]
    oc("browser", "open", target["url"], *W)
    time.sleep(random.uniform(5.5, 7.5))
    got, stale = {}, 0
    for _ in range(int(cfg.get("fb_scroll_steps", 10))):
        res = unwrap(oc("browser", "eval", FB_JS, *W)) or {}
        if res.get("blocked"):
            raise Blocked(f"Facebook ขอ {res['blocked']} (บัญชี Research อาจหลุดล็อกอิน/ถูกขอยืนยันตัวตน)")
        before = len(got)
        for p in res.get("posts") or []:
            k = fb_key(p)
            if not k:
                continue
            if k not in got or _richness(p) > _richness(got[k]):
                got[k] = p
        if res.get("vis") == "hidden":
            # ⚠️ 3 พ.ย. 2026 ต้นเหตุ "เพจละ 1 โพสต์" (7 จาก 11 รอบ): หน้าต่างโหมด background ถูกบัง/จอล็อก → visibilityState hidden ·
            #    requestAnimationFrame ไม่ทำงาน → FB ไม่โหลดโพสต์ถัดไปแม้เลื่อนสุด · ทดสอบแล้ว: หน้าต่างที่มองเห็นโหลดปกติ (1 → 7 ใน 3 ครั้ง)
            if len(got) < int(cfg.get("fb_low_posts", 3)):
                raise Hidden(f"หน้าต่าง browser ถูกซ่อน (จอล็อก/ถูกหน้าต่างอื่นบัง) — Chrome หยุดวาดหน้า Facebook "
                             f"ไม่โหลดโพสต์ต่อ (เห็น {len(got)} โพสต์)")
            break
        if len(got) >= int(cfg.get("fb_max_posts", 12)):
            break
        stale = stale + 1 if len(got) == before else 0
        if stale >= 3:
            break
        oc("browser", "scroll", "down", "--amount", "900", *W)
        time.sleep(random.uniform(1.8, 3.2))
    posts = sorted(got.items(), key=lambda kv: kv[1].get("pos") or 999)
    out = []
    for k, p in posts[: int(cfg.get("fb_max_posts", 12))]:
        out.append({"key": k, "format": p["format"], "link": fb_link(p, target["url"]),
                    "caption": p.get("caption") or "", "m": p["m"], "posted": None})
    return out


# ── Instagram (ปิดไว้จนถึงวันใน gates) ──────────────────────────────────────
# ⚠️ 11 พ.ย. 2026 — endpoint เดิม /api/v1/feed/user/<user>/username/ (ตัวเดียวกับ `opencli instagram user` 2.0.2) ตอบ 404 "Page Not Found"
#    โค้ดเดิมนับ HTML ที่ได้เป็น blocked:redirect → พักเลน 3 วันวนทุกรอบตั้งแต่ 28 ต.ค. ทั้งที่บัญชีล็อกอินอยู่ปกติ
#    (สรุปเดิมว่า "IG จำกัดบัญชี" ผิด · เจ้าของเปิดดูหน้าเว็บ 28 ต.ค. ไม่มีแจ้งเตือน · ตรวจ 11 พ.ย. ล็อกอินอยู่ หน้าโปรไฟล์โชว์โพสต์ปกติ)
#    ตอนนี้อ่านคำตอบที่หน้าโปรไฟล์โหลดเองตอนเปิด: `browser open` เริ่มจดเครือข่ายก่อนนำทาง → `browser network` ดึงออกมา
#    เราไม่ยิงคำขอไป IG เองเลยสักครั้ง · ห้ามหา endpoint อื่นมายิงแทน
IG_TIMELINE = "xdt_api__v1__feed__user_timeline_graphql_connection"
# ป้ายบล็อกเป็นค่าคงที่ — path หน้า challenge มีรหัสบัญชีต่อท้าย ห้ามหลุดไปรายงาน/ไฟล์ร่วม
IG_PAGE_JS = r"""
(() => {
  const m = location.pathname.match(/^\/(?:accounts\/(login|suspended|disabled)|(challenge))(?:\/|$)/);
  if (m) return { blocked: m[2] || 'accounts/' + m[1] };
  if (!document.cookie.split(';').some(c => c.trim().startsWith('ds_user_id='))) return { blocked: 'logged out' };
  const body = (document.body && document.body.innerText) || '';
  return { missing: /Sorry, this page isn't available|ขออภัย หน้านี้ไม่พร้อมใช้งาน/.test(body),
           grid: document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length };
})()
"""
# `browser network` เขียนทุกอย่างที่หน้าโหลดลงดิสก์ (token ของหน้าเว็บ · ชื่อบัญชีคนอื่น · ไฟล์ละหลายสิบ MB) แล้วไม่ลบเอง
# → อ่านเสร็จลบไฟล์ของ session เราทิ้ง (ชื่อไฟล์ <context>_<session>.json · ไม่แตะของ AssetX)
NET_CACHE = Path(os.environ.get("OPENCLI_CACHE_DIR") or Path.home() / ".opencli" / "cache") / "browser-network"


def _drop_net_cache():
    for f in [*NET_CACHE.glob(f"*_{SESSION}.json"), NET_CACHE / f"{SESSION}.json"]:
        try:
            f.unlink(missing_ok=True)
        except OSError:
            pass


def _ig_body(detail):
    body = detail.get("body") if isinstance(detail, dict) else None
    if isinstance(body, str):
        for chunk in (body, body.lstrip().split("\n", 1)[0]):   # graphql บางชุดส่งหลายก้อนคั่นบรรทัด — ก้อนแรกคือ data
            try:
                body = json.loads(chunk)
                break
            except ValueError:
                continue
    return body if isinstance(body, dict) else None


def _ig_authors(node):
    """ชื่อบัญชีเจ้าของโพสต์ + ผู้ร่วมโพสต์ (collab) — หน้าโปรไฟล์ร้านเล็กบางเพจมีแต่โพสต์ร่วมที่ลูกค้าเป็นคนโพสต์
    (Sanctuary Gallery 11 พ.ย. ทั้ง 12 โพสต์) → ดูแค่คนโพสต์จะนึกว่าเป็นชุดของเพจอื่น"""
    people = [node.get("user"), node.get("owner"), *(node.get("coauthor_producers") or [])]
    return {str(p.get("username") or "").lower() for p in people if isinstance(p, dict)} - {""}


def ig_timeline(user, W, cfg):
    """→ node ของโพสต์ที่หน้าโปรไฟล์ `user` โหลดเอง (จาก network capture ของ OpenCLI) · None = ไม่เจอ

    `browser network` ดูดของที่จดไว้ออกทั้งหมด · รอบที่ว่างจะคืนชุดเก่าที่เก็บไว้ (`cache_reused` — ของเพจก่อนหน้า) → ข้าม
    ถูกจำกัด/ให้ล็อกอินใหม่ (429 · require_login) = คำตอบไม่มีชุดโพสต์ใน shape → ดูจากทุกคำขอของ IG ที่หน้าโหลด
    แต่โยน Blocked เฉพาะเมื่อไม่ได้ชุดโพสต์เลย (คำขอเบื้องหลังตัวอื่นล้มทั้งที่อ่านได้ ≠ บัญชีโดนจำกัด)
    """
    want, nodes, limited = user.lower(), {}, None
    for attempt in range(2):
        if attempt:
            time.sleep(random.uniform(3, 5))                 # หน้ายังโหลดไม่ถึง timeline — รออีกนิดแล้วดูใหม่ครั้งเดียว
        res = unwrap(oc("browser", "network", *W)) or {}
        if res.get("cache_reused") or res.get("cache_warning"):
            continue        # ชุดเก่าที่ OpenCLI คืนมา / บันทึกแคชไม่ได้ (--detail จะอ่านไฟล์เก่า) — ไม่ใช่ของหน้านี้
        ents = [e for e in (res.get("entries") or []) if isinstance(e, dict) and e.get("key")]
        limited = limited or next((e for e in ents if "instagram.com/" in str(e.get("url") or "") and (
            ("/graphql" in str(e.get("url")) and e.get("status") in (401, 403, 429))
            or ("/api/" in str(e.get("url")) and e.get("status") == 429)
            or any(k in (e.get("shape") or {}) for k in ("$.require_login", "$.checkpoint_url")))), None)
        cands = [e for e in ents if any(IG_TIMELINE in k for k in (e.get("shape") or {}))]
        cands.sort(key=lambda e: str(e.get("timestamp") or ""), reverse=True)
        for e in cands[:4]:
            if e.get("status") != 200:
                continue
            detail = unwrap(oc("browser", "network", "--detail", e["key"], *W)) or {}
            body = _ig_body(detail)
            if body is None:
                if detail.get("body_truncated"):
                    log(f"⚠️ [social] Instagram {user}: ข้อมูลโพสต์ถูกตัด ({detail.get('body_full_size')} ไบต์) อ่านไม่ได้")
                continue
            conn = (body.get("data") or {}).get(IG_TIMELINE) if isinstance(body.get("data"), dict) else None
            got = [ed["node"] for ed in (conn or {}).get("edges") or []
                   if isinstance(ed, dict) and isinstance(ed.get("node"), dict) and ed["node"].get("code")]
            if any(want in _ig_authors(n) for n in got):
                for n in got:
                    nodes.setdefault(n["code"], n)
        if nodes:
            break
    if not nodes:
        if limited:
            raise Blocked(f"Instagram ตอบ HTTP {limited.get('status')} ตอนหน้าโปรไฟล์โหลดโพสต์ (ถูกจำกัด/ให้ล็อกอินใหม่)")
        return None
    return sorted(nodes.values(), key=lambda n: -(n.get("taken_at") or 0))[: int(cfg.get("ig_max_posts", 12))]


def read_instagram(target, cfg):
    W = ["--session", SESSION, "--window", "background", "--profile", cfg.get("bridge_profile", "research")]
    user = target["user"]
    oc("browser", "open", f"https://www.instagram.com/{urllib.parse.quote(user)}/", *W)
    # รอหน้านิ่งแล้วดูดเครือข่ายก่อน ค่อยตรวจหน้า — ระหว่างหน้า IG ประมวลผลชุดโพสต์ (~700 KB) คำสั่ง eval ของ OpenCLI
    # ตรวจการเชื่อมต่อไม่ทัน 2 วิแล้วต่อ debugger ใหม่ (ส่วนเสริม 1.0.27 ensureAttached) คำตอบที่มาระหว่างนั้นหายได้ ·
    # การดูดเครือข่ายไม่แตะ debugger · เปิดลิงก์เดิมซ้ำในแท็บเดิมหน้าไม่โหลดใหม่ (ลอง 11 พ.ย.) จึงไม่มีเปิดซ้ำ
    time.sleep(random.uniform(7, 9))
    page = {}
    try:
        nodes = ig_timeline(user, W, cfg)
        if nodes is None:
            page = unwrap(oc("browser", "eval", IG_PAGE_JS, *W)) or {}
            if page.get("blocked"):
                raise Blocked(f"Instagram ขอ {page['blocked']} (บัญชี Research หลุดล็อกอิน/ถูกขอยืนยันตัวตน)")
    finally:
        _drop_net_cache()
    if nodes is None:
        # ไม่ใช่บล็อก — ไม่พักเลน 3 วัน · ไม่นับว่าอ่านแล้ว รอบหน้าลองใหม่
        raise WatchError(f"Instagram {user}: ไม่เจอชุดโพสต์ที่หน้าโปรไฟล์โหลด"
                         + (" (ไม่มีเพจนี้แล้ว?)" if page.get("missing") else
                            f" (หน้าโชว์ {page['grid']} โพสต์แต่ OpenCLI จดคำตอบไม่ทัน?)" if page.get("grid") else
                            " (หน้าโหลดไม่ขึ้น/IG เปลี่ยนรูปแบบ?)"))
    out = []
    for n in nodes:
        cap = n.get("caption") if isinstance(n.get("caption"), dict) else {}
        fmt = ("reel" if n.get("product_type") == "clips"
               else {1: "photo", 2: "video", 8: "carousel"}.get(n.get("media_type"), "photo"))
        ts = n.get("taken_at")
        posted = datetime.fromtimestamp(ts, TH).date().isoformat() if isinstance(ts, (int, float)) and ts > 0 else None
        hidden = bool(n.get("like_and_view_counts_disabled"))      # เจ้าของโพสต์ซ่อนยอดไลก์ — ไม่เอาตัวเลขไปเทียบ
        out.append({"key": n["code"], "format": fmt, "link": f"https://www.instagram.com/p/{n['code']}/",
                    "caption": (cap.get("text") or "")[:700], "posted": posted,
                    "m": {"reactions": None if hidden else n.get("like_count"), "comments": n.get("comment_count"),
                          "shares": None,
                          "views": None if hidden else (n.get("play_count") or n.get("ig_play_count") or n.get("view_count"))}})
    return out


# ── Reddit (ปิดไว้จนถึงวันใน gates) ─────────────────────────────────────────
def read_reddit(target, cfg):
    # คำสั่งของเว็บ (ไม่ใช่ browser ...) รับ --profile แค่ตำแหน่งหน้าสุด — ต่อท้ายแล้ว "unknown option" (28 ต.ค. 2026)
    res = unwrap(oc("--profile", cfg.get("bridge_profile", "research"), "reddit", "subreddit", target["sub"],
                    "--sort", "top", "--time", "day", "--limit", "10", "--window", "background"))
    if not isinstance(res, list):
        raise WatchError(f"Reddit {target['sub']}: ได้ข้อมูลรูปแบบแปลก ({type(res).__name__})")
    out = []
    for p in res:
        if not p.get("id"):
            continue
        try:
            posted = datetime.fromtimestamp(float(p.get("created_utc")), TH).date().isoformat()
        except (TypeError, ValueError):
            posted = None
        body = (p.get("selftext") or "").strip()
        out.append({"key": str(p["id"]), "format": "post", "link": p.get("url") or "",
                    "caption": (str(p.get("title") or "") + ("\n" + body if body else ""))[:700], "posted": posted,
                    "m": {"reactions": _int(p.get("upvotes")), "comments": _int(p.get("comments")),
                          "shares": None, "views": None}})
    return out


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


READERS = {"facebook": read_facebook, "instagram": read_instagram, "reddit": read_reddit}


# ── คลังข้อมูลในเครื่อง ─────────────────────────────────────────────────────
def target_id(platform, t):
    if platform == "instagram":
        return f"ig_{t['user']}"
    if platform == "reddit":
        return f"rd_{t['sub']}"
    u = urllib.parse.urlsplit(t["url"])
    q = dict(urllib.parse.parse_qsl(u.query))
    slug = q.get("id") or u.path.strip("/").split("/")[0]
    return "fb_" + re.sub(r"[^A-Za-z0-9._-]", "_", slug)


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def tags_of(caption):
    return sorted({t.lower() for t in re.findall(r"#[^\s#.,!?()\[\]\"']+", caption or "")})[:20]


# ป้ายซ่อน "Facebook" + ปุ่มแปลภาษาที่หลุดเข้าแคปชั่น (ดู FB_JS) — ล้างของที่เก็บไว้ก่อนแก้ด้วย
_FB_NOISE = re.compile(r"^(?:Facebook|·?\s*(?:See original|Rate this translation|ดูต้นฉบับ|ให้คะแนนคำแปลนี้))$")


def clean_caption(c):
    return "\n".join(ln for ln in (c or "").split("\n") if not _FB_NOISE.match(ln.strip())).strip()


def merge(store, posts, today_iso):
    """อัปเดตคลังของเพจนั้น → รายการกุญแจที่เห็นรอบนี้ · เก็บประวัติตัวเลขรายวันไว้ดูว่าโพสต์โตเร็วแค่ไหน"""
    seen = []
    for p in posts:
        cap = clean_caption(p["caption"])
        rec = store["posts"].get(p["key"])
        if rec is None:
            rec = store["posts"][p["key"]] = {
                "first_seen": today_iso, "posted": p.get("posted"), "format": p["format"], "link": p["link"],
                "caption": cap, "tags": tags_of(cap), "m0": p["m"], "hist": []}
        # เลือกแคปชั่นที่ยาวกว่าหลังล้างแล้ว — ของเก่าที่มีขยะยาวกว่าของใหม่ที่สะอาด ห้ามชนะเพราะขยะ
        old = clean_caption(rec.get("caption"))
        best = cap if len(cap) > len(old) else old
        if best != rec.get("caption"):
            rec["caption"], rec["tags"] = best, tags_of(best)
        rec.update(last_seen=today_iso, m=p["m"], link=p["link"] or rec.get("link"))
        row = [today_iso] + [p["m"].get(k) for k in ("reactions", "comments", "shares", "views")]
        hist = rec["hist"]
        if hist and hist[-1][0] == today_iso:
            hist[-1] = row
        else:
            hist.append(row)
        del hist[:-30]
        seen.append(p["key"])
    return seen


def prune(store, today, keep_days):
    old = [k for k, r in store["posts"].items() if days_between(r.get("last_seen", r["first_seen"]), today) > keep_days]
    for k in old:
        del store["posts"][k]
    return len(old)


# ── หาโพสต์ที่แรงผิดปกติ ───────────────────────────────────────────────────
def eng(m):
    """เอ็นเกจรวมแบบถ่วงน้ำหนัก — คอมเมนต์/แชร์ใช้แรงคนมากกว่ากดรีแอคชัน"""
    return (m.get("reactions") or 0) + 2 * (m.get("comments") or 0) + 3 * (m.get("shares") or 0)


def outliers(platform, store, seen, today, cfg):
    """โพสต์ในรอบนี้ที่แรงกว่ามัธยฐานของเพจเดียวกันตั้งแต่ outlier_ratio เท่า (ฟังก์ชันล้วน — ทดสอบได้)

    เทียบกับเพจตัวเอง ไม่เทียบข้ามเพจ — เพจ 500K กับเพจ 1K ตัวเลขดิบคนละโลก
    คลิปเทียบยอดวิวกับคลิปด้วยกันด้วย (โพสต์รูปไม่มียอดวิว)
    """
    window = int(cfg.get("baseline_days", 60))
    recent = [r for r in store["posts"].values()
              if days_between(r.get("posted") or r["first_seen"], today) <= window]
    ratio_min = float(cfg.get("outlier_ratio", 2.0))
    found = []
    if platform == "reddit":
        # top/day ของทั้งชุมชน = ฮิตอยู่แล้วทุกกระทู้ · เอาเฉพาะที่ผ่านขั้นต่ำ และแรงกว่ากระทู้ฮิตวันอื่น
        # ของชุมชนเดียวกัน ratio เท่า (เทียบแต้มโหวตกับแต้มโหวต)
        ups = [r["m"].get("reactions") or 0 for r in recent]
        base_u = statistics.median(ups) if len(ups) >= 5 else None
        floor = max(int(cfg.get("reddit_min_upvotes", 100)), int(ratio_min * base_u) if base_u else 0)
        for k in seen:
            r = store["posts"][k]
            u = r["m"].get("reactions") or 0
            if not r.get("idea") and u >= floor:
                found.append({"key": k, "ratio": u / max(base_u or u, 1), "by": "eng", "base_e": base_u, "base_v": None})
        found.sort(key=lambda f: -f["ratio"])
        return found[: int(cfg.get("max_ideas_per_target", 2))]

    engs = [eng(r["m"]) for r in recent]
    views = [r["m"]["views"] for r in recent if r["m"].get("views")]
    base_e = statistics.median(engs) if len(engs) >= 4 else None
    base_v = statistics.median(views) if len(views) >= 3 else None
    for k in seen:
        r = store["posts"][k]
        if r.get("idea") or not card_related(r.get("caption")):
            continue
        if r.get("posted") and days_between(r["posted"], today) > window:
            continue    # โพสต์ปักหมุด/เก่าที่ IG ส่งมาในชุดแรก — ยอดสะสมนานกว่าฐานเทียบ ไม่ใช่ของแรง (FB ไม่มีวันโพสต์ = ไม่โดน)
        e, v = eng(r["m"]), r["m"].get("views") or 0
        re_ = e / max(base_e, 1) if base_e is not None else 0
        rv = v / max(base_v, 1) if base_v and v else 0
        ratio = max(re_, rv)
        if ratio >= ratio_min and (e >= int(cfg.get("min_engagement", 10)) or v >= int(cfg.get("min_views", 3000))):
            found.append({"key": k, "ratio": ratio, "by": "views" if rv > re_ else "eng",
                          "base_e": base_e, "base_v": base_v})
    found.sort(key=lambda f: -f["ratio"])
    return found[: int(cfg.get("max_ideas_per_target", 2))]


def metrics_th(m):
    parts = [f"❤️ {short_num(m.get('reactions') or 0)}", f"💬 {short_num(m.get('comments') or 0)}"]
    if m.get("shares") is not None:
        parts.append(f"↗️ {short_num(m['shares'])}")
    if m.get("views"):
        parts.append(f"▶️ {short_num(m['views'])} วิว")
    return " · ".join(parts)


def idea_row(platform, target, rec, hit, today_iso):
    """แถวสำหรับ marketing_ideas (ฟังก์ชันล้วน — ทดสอบได้)"""
    group = target.get("group", "shop")
    head = next((ln.strip() for ln in (rec.get("caption") or "").splitlines() if ln.strip()), "") or "(ไม่มีข้อความ)"
    head = re.sub(r"\s+", " ", head)[:110]
    fmt = FMT_TH.get(rec.get("format"), rec.get("format") or "โพสต์")
    if platform == "reddit":
        title = f"กระทู้ฮิตใน {target['name']}: {head}"
        base = (f"กระทู้ฮิตวันอื่นของชุมชนนี้ ≈ {short_num(round(hit['base_e']))} แต้ม"
                if hit.get("base_e") is not None else "")
    else:
        title = f"{fmt}แรงกว่าปกติของเพจ {hit['ratio']:.1f} เท่า — {head}"
        if hit["by"] == "views":
            base = f"คลิปปกติของเพจ ≈ {short_num(round(hit['base_v']))} วิว"
        else:
            base = f"โพสต์ปกติของเพจ ≈ {short_num(round(hit['base_e']))} เอ็นเกจ"
    when = (f"โพสต์ {thai_day(rec['posted'])}" if rec.get("posted")
            else f"เห็นครั้งแรก {thai_day(rec['first_seen'])}")
    cap = re.sub(r"\s+", " ", rec.get("caption") or "").strip()
    summary = " · ".join(x for x in (metrics_th(rec["m"]), base, when) if x)
    if cap:
        summary += f"\n“{cap[:300]}{'…' if len(cap) > 300 else ''}”"
    # ให้อยู่ช่วงเดียวกับเลนอื่น (ทางการ/YouTube/ต่างประเทศ ~4–7) ไม่ใช่ทับทุกเลน · 2 เท่า = 4.6 · 6 เท่าขึ้นไป = 6.2
    score = round(min(3.8 + 0.4 * min(hit["ratio"], 6.0), 6.2), 2)
    if group == "competitor":
        score = round(score + 0.3, 2)
    return {
        "status": "new", "source": "manual", "subtype": SUBTYPE[platform],
        "source_label": f"{PLATFORM_LABEL[platform]} · {target['name']}"[:120],
        "title": title[:300], "summary": summary[:600], "url": rec.get("link") or "",
        "score": score, "angle": ANGLE.get(group, ANGLE["shop"]),
        "relevance": (f"ตัวเฝ้าโซเชียล ({PLATFORM_LABEL[platform]} · บัญชีสำรอง อ่านอย่างเดียว) · "
                      + ("เทียบยอดวิวกับคลิปอื่นของเพจ" if hit["by"] == "views" else "เทียบเอ็นเกจกับโพสต์อื่นของเพจ")),
        "related_sku": None,
        "external_key": f"sw:{SHORT[platform]}:{target_id(platform, target)}:{hit['key']}"[:200],
    }


# ── Supabase ───────────────────────────────────────────────────────────────
def _sb(path, method="GET", body=None, prefer=None):
    if not data.SB_URL or not data.SB_KEY:
        raise WatchError("ไม่มี SUPABASE_URL / SERVICE KEY — ตรวจ deploy/.env.local")
    headers = {"apikey": data.SB_KEY, "Authorization": f"Bearer {data.SB_KEY}",
               "Content-Type": "application/json", "User-Agent": "dvx-social-watch/1.0"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{data.SB_URL}/rest/v1/{path}", method=method, headers=headers,
                                 data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        raise WatchError(f"Supabase HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:240]}")


def queued_social():
    return len(_sb("marketing_ideas?select=id&status=eq.new&subtype=like.social_*"))


def url_known(url):
    if not url:
        return False
    return bool(_sb(f"marketing_ideas?select=id&url=eq.{urllib.parse.quote(url, safe='')}&limit=1"))


def push_ideas(rows):
    """ON CONFLICT (external_key) DO NOTHING → คืนเฉพาะแถวที่เพิ่งเข้าจริง"""
    if not rows:
        return []
    return _sb("marketing_ideas?on_conflict=external_key", "POST", rows,
               prefer="resolution=ignore-duplicates,return=representation")


# ── รอบหลัก ────────────────────────────────────────────────────────────────
def due_targets(platform, targets, visits, today, limit):
    """เพจที่ถึงรอบ (เลยรอบนานสุดก่อน) ตัดตามเพดานต่อรอบ (ฟังก์ชันล้วน — ทดสอบได้)"""
    due = []
    for i, t in enumerate(targets):
        last = visits.get(target_id(platform, t))
        gap = days_between(last, today) if last else 10_000
        over = gap - int(t.get("every_days", 3))
        if over >= 0:
            due.append((-over, i, t))
    due.sort(key=lambda x: (x[0], x[1]))
    return [t for _, _, t in due[:limit]]


def gate_open(platform, cfg, today):
    g = (cfg.get("gates") or {}).get(platform)
    return not g or today >= date.fromisoformat(g)


def shared_limits(plan, blocked, used_today, caps, used_own=None, own_caps=None):
    """ตัดแผนตามของร่วมกับ AssetX (ฟังก์ชันล้วน — ทดสอบได้) → (แผนใหม่, ข้อความเข้ารายงาน)

    blocked = {platform: แถวที่ยังไม่ครบ 3 วัน} · used_today = เพจที่ทุกโปรเจกต์เปิดวันนี้ ·
    caps = เพดานรวมต่อวันของบัญชี (แพลตฟอร์มที่ไม่มีในนี้ = ไม่จำกัดเพิ่ม) ·
    used_own / own_caps = ของ DVX เอง — กันโควตาส่วนของ AssetX ไว้ (เพดานรวมเป็นใครมาก่อนได้ก่อน
    ถ้าไม่กัน /ideas กดซ้ำวันเดียวกันจะกินจนหมด · 22 ต.ค. เราเคยเปิด FB 12 เพจในวันเดียว)
    """
    out, notes = [], []
    for platform, picks in plan:
        label = PLATFORM_LABEL[platform]
        b = blocked.get(platform)
        if b:
            notes.append(f"⚠️ [social] {label} พักไว้ตั้งแต่ {thai_day(b['at'])} — {b.get('by', '?')} เจอ: "
                         f"{str(b.get('why', ''))[:160]} · บัญชีใช้ร่วมกับ AssetX · เจ้าของเปิด Chrome profile Research "
                         "เช็กบัญชีก่อน (ลองใหม่เองหลัง 3 วัน)")
            continue
        cap, own = caps.get(platform), (own_caps or {}).get(platform)
        lefts = []                                   # (เหลือกี่เพจ, ข้อความตอนเต็ม, ข้อความตอนตัด)
        if cap is not None:
            n = int(cap) - int(used_today.get(platform, 0))
            lefts.append((n, f"วันนี้บัญชีร่วมเปิดครบ {cap} เพจแล้ว (นับรวม AssetX)",
                          f"เหลือโควตาบัญชีร่วมวันนี้ {n} เพจ (นับรวม AssetX)"))
        if own is not None:
            n = int(own) - int((used_own or {}).get(platform, 0))
            lefts.append((n, f"วันนี้เราเปิดครบส่วนของเรา {own} เพจแล้ว (ที่เหลือกันไว้ให้ AssetX)",
                          f"เหลือโควตาส่วนของเราวันนี้ {n} เพจ (ที่เหลือกันไว้ให้ AssetX)"))
        if lefts:
            left, say_full, say_left = min(lefts)
            if left <= 0:
                notes.append(f"[social] {label}: {say_full} — รอบนี้ไม่อ่าน")
                continue
            if len(picks) > left:
                notes.append(f"[social] {label}: {say_left} — อ่าน {left} จาก {len(picks)} ที่ถึงรอบ")
                picks = picks[:left]
        out.append((platform, picks))
    return out, notes


def main():
    global _LOCK
    ap = argparse.ArgumentParser(description="เฝ้าเพจโซเชียลที่ติดตามไว้ → โพสต์แรงผิดปกติเข้าคิวไอเดีย")
    ap.add_argument("--dry-run", action="store_true",
                    help="อ่านจริงแต่ไม่เขียนคลัง/สถานะ/ฐานข้อมูลของเรา (การใช้บัญชีร่วมยังจดใน ~/.research-browser)")
    ap.add_argument("--only", choices=list(READERS), help="เฉพาะแพลตฟอร์มเดียว")
    ap.add_argument("--target", help="เฉพาะเพจที่ชื่อ/ลิงก์มีคำนี้ (ไม่สนรอบ)")
    ap.add_argument("--ignore-gate", action="store_true", help="เปิดเลน IG/Reddit ก่อนวันใน gates (เจ้าของสั่งเท่านั้น)")
    args = ap.parse_args()
    t_start = time.monotonic()

    cfg = json.loads(CFG_FILE.read_text(encoding="utf-8-sig"))
    today = th_today()
    today_iso = today.isoformat()
    state = load_json(STORE / "state.json", {"visits": {}, "blocked": {}})
    state.setdefault("visits", {})
    state.setdefault("blocked", {})

    plan = []
    for platform in READERS:
        if args.only and platform != args.only:
            continue
        targets = cfg.get(platform) or []
        if args.target:
            q = args.target.lower()
            targets = [t for t in targets if q in json.dumps(t, ensure_ascii=False).lower()]
            if not targets:
                continue
        if not gate_open(platform, cfg, today) and not args.ignore_gate:
            log(f"[social] {PLATFORM_LABEL[platform]} ยังปิดไว้ถึง {thai_day(cfg['gates'][platform])} (ช่วงวอร์มบัญชีสำรอง)")
            continue
        blk = state["blocked"].get(platform)
        if blk and not args.target and days_between(blk["at"], today) < 3:
            log(f"⚠️ [social] {PLATFORM_LABEL[platform]} พักไว้ตั้งแต่ {thai_day(blk['at'])} — {blk['why']}"
                f" · เจ้าของเปิด Chrome profile Research เช็กบัญชีก่อน (ลองใหม่เองหลัง 3 วัน)")
            continue
        limit = int((cfg.get("max_targets_per_run") or {}).get(platform, 5))
        pick = targets[:limit] if args.target else due_targets(platform, targets, state["visits"], today, limit)
        if pick:
            plan.append((platform, pick))
        else:
            log(f"[social] {PLATFORM_LABEL[platform]}: ยังไม่มีเพจถึงรอบ")
    if not plan:
        return 0

    # ── ของร่วมกับ AssetX (shared_browser.py) — อีกฝั่งเจอบัญชีโดนขอยืนยันตัวตน = พักด้วย · เพดานรวมต่อวัน
    #    --target ไม่ตัด (เจ้าของ/Claude ตรวจเพจด้วยมือ · บอทไม่เคยใช้) แต่ยังถือกุญแจและจดการใช้ตามปกติ
    sbc = cfg.get("shared_browser") or {}

    def num_map(key):
        return {k: int(v) for k, v in (sbc.get(key) or {}).items() if not str(k).startswith("_")}

    caps, own_caps = num_map("daily_cap"), num_map("own_daily_cap")
    # ทั้งรอบ (รวมเวลารอกุญแจ) จบเองก่อนบอทฆ่าที่ 1500 วิ — โดนฆ่า = ไม่มี finally (สถานะ/คิว/ปล่อยกุญแจหายหมด)
    deadline = t_start + float(sbc.get("run_budget_sec", 1200))

    def out_of_time():
        return time.monotonic() >= deadline        # >= : นาฬิกา Windows ละเอียดแค่ ~16 ms งบ 0 ต้องหมดทันที

    def apply_shared(p, say):
        if args.target:
            return p
        blocked = {}
        for platform in READERS:
            b = sb.blocked_for(platform, today)
            if b:
                blocked[platform] = b
        used = sb.usage_rows()
        p, notes = shared_limits(p, blocked, sb.pages_on(today_iso, rows=used), caps,
                                 sb.pages_on(today_iso, rows=[r for r in used if r.get("project") == "dvx"]), own_caps)
        for line in notes if say else ():
            log(line)
        return p

    if not apply_shared(plan, say=False):        # ไม่มีอะไรให้อ่านแน่ ๆ — ไม่ต้องรอกุญแจ
        apply_shared(plan, say=True)
        return 0

    lock = sb.Lock("dvx", purpose="social_watch" + (" --dry-run" if args.dry_run else ""))
    # รอกุญแจได้ไม่เกิน wait_minutes และต้องเหลือเวลาอ่านเองอย่างน้อย 10 นาทีในงบของรอบ
    wait = min(float(sbc.get("wait_minutes", 8)) * 60, max(0.0, deadline - time.monotonic() - 600))
    h0, t0 = lock.holder(), time.monotonic()
    if not lock.acquire(wait_sec=wait):
        h = lock.holder() or h0 or {}
        log(f"⚠️ [social] Chrome profile Research ถูกใช้อยู่ ({h.get('project', '?')} {h.get('purpose', '')}"
            f" · เริ่ม {str(h.get('started_at', '?'))[11:16]}) — รอ {wait / 60:.0f} นาทีแล้วยังไม่ว่าง ·"
            " รอบนี้ข้าม (เพจที่ถึงรอบได้อ่านรอบหน้า)")
        return 0
    _LOCK = lock
    waited = time.monotonic() - t0
    if lock.stolen_from is not None:
        log(f"[social] กุญแจ browser ค้างจาก {lock.stolen_from.get('project', '?')} (เงียบเกิน 10 นาที) — ยึดต่อ")
    elif h0 and waited >= 30:
        log(f"[social] รอ {h0.get('project', '?')} ใช้ browser เสร็จ {waited / 60:.0f} นาที")

    rows, picked_lines, total_new_posts = [], [], 0
    run_log = {"at": datetime.now(TH).isoformat(timespec="seconds"), "dry_run": args.dry_run, "lanes": {}}
    opened, outcome, touched = {}, [], False      # ยอดเพจที่เปิด + ผลรอบ → แถวสรุปใน usage.jsonl ตอนปล่อยกุญแจ
    cleared = set()                               # แพลตฟอร์มที่อ่านสำเร็จ = บัญชีใช้ได้ (ล้างแถวพักของเราแม้ --dry-run)
    try:
        plan = apply_shared(plan, say=True)        # ตรวจซ้ำหลังได้กุญแจ — ระหว่างรอ อีกฝั่งอาจใช้โควตา/เจอบล็อก
        if not plan:
            return 0
        touched = True
        ready, launched = ensure_bridge(cfg, deadline)
        if launched:
            log("[social] เปิด Chrome profile Research ให้เอง (ไม่มีหน้าต่าง)")
        if not ready:
            log("⚠️ [social] ต่อ Chrome profile Research ไม่ได้ — เปิด Chrome profile นั้นค้างไว้"
                " แล้วเช็กว่าส่วนเสริม OpenCLI เปิดอยู่ · รอบนี้ข้ามไปก่อน (AssetX อ่านเพจไม่ได้เหมือนกัน)")
            outcome.append("bridge_down")
            return 0
        try:
            for platform, targets in plan:
                if out_of_time():
                    log(f"[social] หมดงบเวลารอบ ({sbc.get('run_budget_sec', 1200)} วิ รวมรอกุญแจ) —"
                        f" {PLATFORM_LABEL[platform]} อ่านรอบหน้า")
                    outcome.append("budget")
                    continue
                stats = {"pages": 0, "posts": 0, "new": 0, "hits": 0, "fails": [], "low": []}
                for n, t in enumerate(targets):
                    if out_of_time():
                        log(f"[social] หมดงบเวลารอบ ({sbc.get('run_budget_sec', 1200)} วิ รวมรอกุญแจ) —"
                            f" {PLATFORM_LABEL[platform]} ที่เหลือ {len(targets) - n} เพจอ่านรอบหน้า")
                        outcome.append("budget")
                        break
                    if n:
                        time.sleep(random.uniform(6, 14))     # เว้นจังหวะระหว่างเพจ ไม่รัว
                    tid = target_id(platform, t)
                    spath = STORE / platform / f"{tid}.json"
                    store = load_json(spath, {"target": t.get("name"), "posts": {}})
                    low = no_time = False
                    # จดก่อนเปิด (ใต้กุญแจ) — รอบที่โดนฆ่า/กุญแจหลุดกลางทางก็ยังนับเพจที่เปิดไปแล้ว · รวมที่อ่านล้ม
                    lock.log_usage({platform: 1}, "open")
                    opened[platform] = opened.get(platform, 0) + 1
                    try:
                        posts = READERS[platform](t, cfg)
                        # ⚠️ 22 ต.ค. 2026 — รอบ 07:00 ได้เพจละ 1 โพสต์ทั้ง 6 เพจ (เมื่อวาน ~12) แต่รายงานว่าสำเร็จ
                        #    ตรวจแล้วเพจโหลดต่อได้ปกติเมื่ออ่านซ้ำ = หน้าต่างเบื้องหลังบางช่วงไม่โหลดโพสต์ถัดไปตอนเลื่อน
                        #    (น่าจะตอนจอดับ/Chrome เพิ่งเปิด · ยังพิสูจน์ไม่ได้ 100%) → ได้น้อยผิดปกติให้เปิดใหม่ลองอีกรอบ
                        #    ยังน้อยอยู่ = เตือนเข้ารายงาน และไม่นับว่าอ่านแล้ว รอบหน้าจะอ่านเพจนี้ก่อน
                        #    (เพจที่โพสต์ไม่ถึง 3 โพสต์จริง ๆ จะโดนเตือนทุกรอบ — เจอแบบนั้นให้ถอดออกจากรายชื่อ)
                        few = int(cfg.get("fb_low_posts", 3))
                        if platform == "facebook" and len(posts) < few:
                            if out_of_time():                 # ไม่มีเวลาเปิดซ้ำ — ยังไม่นับว่าอ่านแล้ว รอบหน้าอ่านก่อน
                                low = no_time = True
                                outcome.append("budget")
                            else:
                                log(f"[social] {t['name']}: อ่านได้ {len(posts)} โพสต์ — เปิดใหม่ลองอีกรอบ")
                                time.sleep(random.uniform(8, 12))
                                again = READERS[platform](t, cfg)
                                posts = again if len(again) > len(posts) else posts
                                low = len(posts) < few
                    except Blocked as e:
                        state["blocked"][platform] = {"at": today_iso, "why": str(e)}
                        lock.set_blocked(platform, str(e), today_iso)    # ให้ AssetX พักด้วย (บัญชีเดียวกัน)
                        outcome.append(f"blocked:{platform}")
                        log(f"⚠️ [social] {e} — หยุดเลน {PLATFORM_LABEL[platform]} ทันที (แจ้ง AssetX ให้พักด้วยแล้ว)")
                        stats["fails"].append(f"{t['name']}: blocked")
                        break
                    except Hidden as e:
                        outcome.append(f"hidden:{platform}")
                        flags = chrome_flags_active()
                        hint = (" · Chrome ที่รันอยู่เปิดโดยไม่มีค่ากันหยุดวาด — ปิด Chrome ทุกหน้าต่างแล้วเปิดใหม่จากไอคอนบนเดสก์ท็อป"
                                if flags is False else
                                " · Chrome มีค่ากันหยุดวาดแล้วแต่ยังถูกซ่อน (หน้าต่างถูกย่อเล็กสุด/จอดับ?)" if flags else "")
                        log(f"⚠️ [social] {e} — หยุดเลน {PLATFORM_LABEL[platform]} รอบนี้ · เพจที่ถึงรอบยังไม่นับว่าอ่าน (รอบหน้าอ่านก่อน)"
                            + hint)
                        stats["fails"].append(f"{t['name']}: hidden")
                        break
                    except WatchError as e:
                        log(f"⚠️ [social] อ่าน {t['name']} ไม่สำเร็จ: {e}")
                        stats["fails"].append(f"{t['name']}: {str(e)[:120]}")
                        continue
                    state["blocked"].pop(platform, None)
                    cleared.add(platform)
                    lock.clear_blocked(platform)
                    before = len(store["posts"])
                    seen = merge(store, posts, today_iso)
                    new = len(store["posts"]) - before
                    prune(store, today, int(cfg.get("keep_days", 120)))
                    hits = outliers(platform, store, seen, today, cfg)
                    stats["pages"] += 1
                    stats["posts"] += len(seen)
                    stats["new"] += new
                    stats["hits"] += len(hits)
                    total_new_posts += new
                    for h in hits:
                        rec = store["posts"][h["key"]]
                        rows.append((platform, t, tid, spath, h, idea_row(platform, t, rec, h, today_iso)))
                    if not posts:
                        log(f"⚠️ [social] {t['name']}: ไม่เจอโพสต์เลย (เพจย้าย/ปิด/โหลดไม่ขึ้น?)")
                    elif low and no_time:
                        stats["low"].append(t["name"])
                        log(f"[social] {t['name']}: อ่านได้ {len(posts)} โพสต์ · หมดงบเวลารอบ ไม่ได้เปิดซ้ำ — "
                            "รอบหน้าอ่านเพจนี้ก่อน")
                    elif low:
                        stats["low"].append(t["name"])
                        log(f"⚠️ [social] {t['name']}: อ่านได้แค่ {len(posts)} โพสต์แม้ลองซ้ำแล้ว — "
                            "หน้าเพจไม่ยอมโหลดต่อ · รอบหน้าอ่านเพจนี้ซ้ำ")
                    if not args.dry_run:
                        if not low:                          # อ่านได้น้อยผิดปกติ = ยังไม่นับว่าอ่านแล้ว
                            state["visits"][tid] = today_iso
                        store["target"] = t.get("name")
                        save_json(spath, store)
                run_log["lanes"][platform] = stats
                log(f"[social] {PLATFORM_LABEL[platform]}: อ่าน {stats['pages']} เพจ · โพสต์ {stats['posts']}"
                    f" (ใหม่ {stats['new']}) · แรงผิดปกติ {stats['hits']}"
                    + (f" · ล้ม {len(stats['fails'])}" if stats["fails"] else "")
                    + (f" · ได้น้อยผิดปกติ {len(stats['low'])} เพจ" if stats["low"] else ""))
        finally:
            try:          # ปิดเฉพาะ session ของเรา — ไม่แตะ session ของ AssetX · ไม่แตะสัญญาณชีพ (กุญแจอาจหลุดแล้ว)
                oc("browser", "close", "--session", SESSION, "--profile", cfg.get("bridge_profile", "research"),
                   timeout=40, beat=False)
            except WatchError:
                pass
    except sb.LostLock as e:
        outcome.append("lost_lock")
        log(f"⚠️ [social] {e} — หยุดอ่านทันที · ของที่อ่านแล้วยังเก็บ/ส่งเข้าคิวตามปกติ")
    finally:
        if touched and lock.held:
            try:          # แถวสรุป — pages ว่าง (นับไปแล้วทีละเพจ) · opened ไว้ให้คนอ่าน
                lock.log_usage({}, ",".join(dict.fromkeys(outcome)) or "ok", opened=opened)
            except (sb.LostLock, OSError):
                pass
        lock.release()
        _LOCK = None

    # คัดเข้าคิว: แรงสุดก่อน · เพดานต่อรอบ · คิวโซเชียลค้างเกินเพดาน = ไม่เติม
    rows.sort(key=lambda r: -r[4]["ratio"])
    cap = int(cfg.get("max_ideas_per_run", 8))
    for platform, t, tid, spath, h, row in rows[:6]:
        picked_lines.append(f"[social]   ▲ {h['ratio']:.1f} เท่า · {t['name']} · {row['title'].split(' — ', 1)[-1][:60]}")
    created = []
    if rows and not args.dry_run:
        try:
            room = max(int(cfg.get("max_social_in_queue", 20)) - queued_social(), 0)
            if room:
                fresh, known = [], []
                for r in rows:
                    (known if url_known(r[5]["url"]) else fresh).append(r)
                chosen = fresh[: min(cap, room)]
                created = push_ideas([r[5] for r in chosen])
                # ที่เลือกแล้ว (เข้าใหม่ หรือกุญแจซ้ำของเดิม) + ลิงก์ที่มีในคิวอยู่แล้ว = ไม่ต้องเสนอซ้ำรอบหน้า
                # ที่ตกเพดานรอบนี้ไม่ทำเครื่องหมาย — รอบหน้าที่เปิดเพจนั้นอีกยังมีสิทธิ์เข้า
                for platform, t, tid, spath, h, row in chosen + known:
                    store = load_json(spath, None)
                    if store and h["key"] in store["posts"]:
                        store["posts"][h["key"]]["idea"] = today_iso
                        save_json(spath, store)
            else:
                log(f"[social] คิวไอเดียโซเชียลค้างครบ {cfg.get('max_social_in_queue', 20)} ชิ้นแล้ว — รอบนี้ไม่เติม")
        except WatchError as e:
            log(f"⚠️ [social] ส่งเข้าคิวไอเดียไม่สำเร็จ: {e}")
    for line in picked_lines:
        log(line)
    if args.dry_run:
        log(f"[social] DRY RUN — เจอแรงผิดปกติ {len(rows)} ชิ้น ไม่ได้เขียนอะไร")
        stale = [p for p in cleared if p in (load_json(STORE / "state.json", {}).get("blocked") or {})]
        if stale:
            # อ่านสำเร็จ = แถวพักร่วมถูกล้างแล้ว (AssetX อ่านต่อได้) → ล้างแถวพักของเราด้วย เขียนแค่นี้อย่างเดียว
            # ไม่งั้น `--target … --dry-run` ที่ใช้เช็กบัญชีหลังแก้ checkpoint ทำให้ DVX พักต่อเองอีก ≤ 3 วัน
            st = load_json(STORE / "state.json", {"visits": {}, "blocked": {}})
            for p in stale:
                st["blocked"].pop(p, None)
            save_json(STORE / "state.json", st)
            log(f"[social] ล้างสถานะพัก {', '.join(PLATFORM_LABEL[p] for p in stale)} ของเรา (อ่านสำเร็จแล้ว)")
    else:
        log(f"[social] ✅ เข้าคิวไอเดีย {len(created)} ชิ้น" + (f" (จากที่เจอ {len(rows)})" if len(rows) != len(created) else ""))
        run_log["ideas"] = len(created)
        save_json(STORE / "state.json", state)
        STORE.mkdir(parents=True, exist_ok=True)
        with (STORE / "runs.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(run_log, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
