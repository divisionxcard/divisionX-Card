"""ทดสอบกุญแจ browser ร่วมกับ AssetX (deploy/agents/shared_browser.py) + รอบของตัวเฝ้าเพจที่ใช้กุญแจนั้น

ไม่ยิงเน็ต ไม่แตะ DB ไม่เปิด Chrome — ใช้โฟลเดอร์ชั่วคราวแทน ~/.research-browser และของปลอมแทน OpenCLI
รัน:  .venv-image\\Scripts\\python.exe scripts\\test_shared_browser.py
"""
import contextlib
import io
import json
import os
import pathlib
import sys
import tempfile
import time

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TMP = pathlib.Path(tempfile.mkdtemp(prefix="dvx-shared-browser-"))
os.environ["RESEARCH_BROWSER_DIR"] = str(TMP / "shared")      # ก่อน import — ห้ามแตะของจริงในบ้าน

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "deploy" / "agents"))
import shared_browser as sb  # noqa: E402
import social_watch as sw  # noqa: E402

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — ได้ {got!r} ต้องการ {want!r}"))


def age(path, sec):
    t = time.time() - sec
    os.utime(path, (t, t))


# ── กุญแจ ──
base = TMP / "lock1"
a, b = sb.Lock("dvx", base=base), sb.Lock("assetx", base=base)
check("ว่าง = ถือได้", a.try_acquire(), True)
check("มีคนถือ = อีกฝั่งถือไม่ได้", b.try_acquire(), False)
check("ดูได้ว่าใครถือ", (b.holder() or {}).get("project"), "dvx")
age(a.path, 120)
check("สัญญาณชีพ = ยังเป็นของเรา", a.beat(), True)
check("สัญญาณชีพแตะ mtime ใหม่", (b.holder() or {}).get("idle_sec", 999) < 5, True)
b.release()                                                     # ไม่ได้ถือ = ห้ามลบของคนอื่น
check("คนไม่ได้ถือสั่งปล่อย = กุญแจยังอยู่", a.path.exists(), True)
a.release()
check("ปล่อยแล้วไฟล์หาย", a.path.exists(), False)
check("ปล่อยแล้วอีกฝั่งถือได้", b.try_acquire(), True)
b.release()

# ── กุญแจค้าง (คนถือโดน timeout ฆ่า/เครื่องดับ) ──
base = TMP / "lock2"
a, b = sb.Lock("assetx", base=base), sb.Lock("dvx", base=base)
a.try_acquire()
age(a.path, sb.STALE_SEC - 60)
check("เงียบ 9 นาที = ยังไม่ค้าง", b.try_acquire(), False)
age(a.path, sb.STALE_SEC + 60)
check("เงียบเกิน 10 นาที = ยึดได้", b.try_acquire(), True)
check("รู้ว่ายึดมาจากใคร", (b.stolen_from or {}).get("project"), "assetx")
check("ไม่เหลือไฟล์ศพ", sorted(p.name for p in base.iterdir()), ["lock.json"])
check("เจ้าของเดิมตื่นมา = รู้ว่ากุญแจหลุด", a.beat(), False)
try:
    a.require()
    check("หลุดแล้ว require ต้องโยน LostLock", "ไม่โยน", "LostLock")
except sb.LostLock:
    check("หลุดแล้ว require ต้องโยน LostLock", "LostLock", "LostLock")
a.release()
check("เจ้าของเดิมปล่อย = ไม่ลบกุญแจใหม่ของอีกฝั่ง", (b.holder() or {}).get("project"), "dvx")
b.release()

base = TMP / "lock3"
base.mkdir()
(base / "lock.json").write_text("", encoding="utf-8")          # อีกฝั่งเพิ่งสร้าง ยังเขียนเนื้อไม่ทัน
check("ไฟล์กุญแจว่างเปล่าที่ยังสด = ถือว่ามีคนถือ", sb.Lock("dvx", base=base).try_acquire(), False)
age(base / "lock.json", sb.STALE_SEC + 5)
check("ไฟล์กุญแจว่างเปล่าที่ค้าง = ยึดได้", sb.Lock("dvx", base=base).try_acquire(), True)

# ── รอกุญแจ (นาฬิกาปลอม) ──
base = TMP / "lock4"
a, b = sb.Lock("assetx", base=base), sb.Lock("dvx", base=base)
a.try_acquire()
clock = [0.0]
naps = []


def fake_sleep(s):
    naps.append(s)
    clock[0] += s
    if clock[0] >= 40:
        a.release()                                             # อีกฝั่งใช้เสร็จตอนวินาทีที่ 40


check("รอจนอีกฝั่งปล่อย = ได้กุญแจ", b.acquire(wait_sec=300, poll_sec=20, sleep=fake_sleep, clock=lambda: clock[0]), True)
check("ถามซ้ำทุก 20 วิ", naps, [20, 20])
b.release()
a.try_acquire()
clock[0], naps[:] = 0.0, []
check("รอครบแล้วยังไม่ว่าง = ไม่ได้", b.acquire(wait_sec=50, poll_sec=20, sleep=lambda s: clock.__setitem__(0, clock[0] + s),
                                               clock=lambda: clock[0]), False)
check("wait 0 = ลองครั้งเดียว", sb.Lock("x", base=base).acquire(wait_sec=0), False)
a.release()

# ── สถานะพักร่วม + บันทึกการใช้ ──
base = TMP / "state"
a = sb.Lock("assetx", base=base)
try:
    a.set_blocked("facebook", "checkpoint")
    check("เขียนสถานะร่วมโดยไม่ถือกุญแจ = ห้าม", "เขียนได้", "LostLock")
except sb.LostLock:
    check("เขียนสถานะร่วมโดยไม่ถือกุญแจ = ห้าม", "LostLock", "LostLock")
a.try_acquire()
a.set_blocked("facebook", "Facebook ขอ checkpoint", "2026-11-03")
b = sb.blocked_for("facebook", "2026-11-05", base)
check("พักร่วม 3 วัน: วันที่ 3 ยังพัก", (b or {}).get("by"), "assetx")
check("พักร่วม: ครบ 3 วันแล้วไม่พัก", sb.blocked_for("facebook", "2026-11-06", base), None)
check("แพลตฟอร์มอื่นไม่โดน", sb.blocked_for("instagram", "2026-11-03", base), None)
check("ลบสถานะพักเมื่ออ่านสำเร็จ", a.clear_blocked("facebook"), True)
check("ไม่มีสถานะพัก = ไม่เขียนไฟล์ซ้ำ", a.clear_blocked("facebook"), False)
check("วันที่เพี้ยนไม่ทำให้ล้ม", sb.blocked_for("x", "2026-11-03", TMP / "nowhere"), None)
a.log_usage({"facebook": 4}, "ok", day="2026-11-03")
a.log_usage({"facebook": 0, "reddit": 2}, "ok", day="2026-11-03")
a.log_usage({"facebook": 3}, "ok", day="2026-11-02")
with (base / "usage.jsonl").open("a", encoding="utf-8") as f:
    f.write('{"project": "dvx", "date": "2026-11-03", "pages": {"facebook": 5}}\n{"broken line\n')
check("รวมเพจของวันนั้นทุกโปรเจกต์ · ข้ามบรรทัดเสีย", sb.pages_on("2026-11-03", base), {"facebook": 9, "reddit": 2})
check("ไม่เก็บแพลตฟอร์มที่เปิด 0 เพจ", json.loads((base / "usage.jsonl").read_text(encoding="utf-8").splitlines()[1])["pages"],
      {"reddit": 2})
a.release()
(base / "state.json").write_text("{เสีย", encoding="utf-8")
check("state.json เสีย = ถือว่าไม่มีอะไรพัก", sb.read_state(base)["blocked"], {})
torn = '{"project": "assetx", "date": "2026-11-03", "pages": {"facebook": 1}, "note": "อ่านเพจ"}'.encode("utf-8")
with (base / "usage.jsonl").open("ab") as f:              # เครื่องดับกลางตัวอักษรไทย = ไบต์ UTF-8 ขาดครึ่ง
    f.write(torn[:-9])                                   # ของจริง: ขาดกลางทาง ไม่มี \n ปิดท้าย
a.try_acquire()
a.log_usage({"facebook": 2}, "open", day="2026-11-03")
check("บรรทัดขาดกลางตัวอักษรไทย = เสียบรรทัดเดียว · แถวถัดไปไม่โดนกลืน", sb.pages_on("2026-11-03", base),
      {"facebook": 11, "reddit": 2})
with (base / "usage.jsonl").open("ab") as f:
    f.write(b"\x00" * 40)                                # เครื่องดับบน NTFS อาจเหลือท้ายไฟล์เป็น NUL
a.log_usage({"facebook": 1}, "open", day="2026-11-03")
check("ท้ายไฟล์เป็น NUL = แถวใหม่ยังนับ", sb.pages_on("2026-11-03", base), {"facebook": 12, "reddit": 2})
a.release()


# ── รอบเต็มของตัวเฝ้าเพจ (ของปลอมแทน OpenCLI/Chrome · --dry-run ไม่แตะ DB) ──
CFG = {"chrome_profile_dir": "Profile 9", "bridge_profile": "research", "gates": {},
       "shared_browser": {"wait_minutes": 0, "daily_cap": {"facebook": 12}},
       "max_targets_per_run": {"facebook": 6}, "fb_low_posts": 0,
       "facebook": [{"name": f"เพจ{i}", "url": f"https://www.facebook.com/page{i}/", "group": "shop", "every_days": 1}
                    for i in range(3)]}
cfg_file = TMP / "social_watch.json"
cfg_file.write_text(json.dumps(CFG, ensure_ascii=False), encoding="utf-8")
sw.CFG_FILE, sw.STORE = cfg_file, TMP / "store"
sw.random.uniform = lambda lo, hi: 0
sw.time.sleep = lambda s: None
sw.ensure_bridge = lambda cfg, deadline=None: (True, False)
sw.chrome_flags_active = lambda: None                            # ไม่ถาม Chrome จริงของเครื่อง
calls = []


def fake_oc(*args, timeout=150, beat=True):
    if beat and sw._LOCK is not None:
        sw._LOCK.require()                                      # เหมือน oc() จริง: กุญแจหลุด = ไม่ได้ยิงคำสั่ง
    calls.append((args[:2], beat))
    return {}


sw.oc = fake_oc


def page_reader(t, cfg):
    sw.oc("browser", "open", t["url"])
    return [{"key": f"{t['name']}-1", "format": "photo", "link": t["url"], "caption": "การ์ด", "posted": None,
             "m": {"reactions": 1, "comments": 0, "shares": 0, "views": None}}]


def run_main(base, reader, argv=("--dry-run",)):
    os.environ["RESEARCH_BROWSER_DIR"] = str(base)
    sw.READERS["facebook"] = reader
    calls.clear()
    out = io.StringIO()
    sys.argv = ["social_watch.py", *argv]
    with contextlib.redirect_stdout(out):
        rc = sw.main()
    return rc, out.getvalue()


today = sw.th_today().isoformat()

base = TMP / "run-ok"
rc, out = run_main(base, page_reader)
check("รอบปกติจบ 0", rc, 0)
check("ปล่อยกุญแจแล้ว", (base / "lock.json").exists(), False)
check("ล้างตัวแปรกุญแจ", sw._LOCK, None)
rows = sb.usage_rows(base)
check("จดทีละเพจก่อนเปิด: นับ FB ได้ 3", sb.pages_on(today, base), {"facebook": 3})
check("แถวสรุปตอนจบ: pages ว่าง (ไม่นับซ้ำ) · opened = 3 · ok",
      (rows[-1]["project"], rows[-1]["pages"], rows[-1]["opened"], rows[-1]["result"]), ("dvx", {}, {"facebook": 3}, "ok"))
check("แถวทีละเพจผล open", [r["result"] for r in rows[:-1]], ["open", "open", "open"])
check("ปิด session ของเราโดยไม่แตะสัญญาณชีพ", calls[-1], (("browser", "close"), False))

base = TMP / "run-busy"
other = sb.Lock("assetx", purpose="facebook_watch", base=base)
other.try_acquire()
rc, out = run_main(base, page_reader)
check("AssetX ถือ browser อยู่ = ข้ามรอบ ไม่เปิดเพจ", [c for c in calls if c[0] == ("browser", "open")], [])
check("รายงานว่าใครถือ (บรรทัด ⚠️ เข้าห้องเทเลแกรม)",
      "⚠️ [social] Chrome profile Research ถูกใช้อยู่ (assetx facebook_watch" in out, True)
check("ไม่ได้ถือกุญแจ = ไม่จดการใช้", sb.usage_rows(base), [])
check("ไม่แตะกุญแจของ AssetX", (other.holder() or {}).get("project"), "assetx")
other.release()

base = TMP / "run-cap"
other = sb.Lock("assetx", base=base)
other.try_acquire()
other.log_usage({"facebook": 11})
other.release()
rc, out = run_main(base, page_reader)
check("AssetX ใช้ไป 11 จาก 12 = เราอ่านแค่ 1 เพจ (รวมทั้งบัญชีครบ 12)", sb.pages_on(today, base), {"facebook": 12})
check("บอกในรายงานว่าตัดเพราะโควตา", "เหลือโควตาบัญชีร่วมวันนี้ 1 เพจ" in out, True)

base = TMP / "run-shared-block"
other = sb.Lock("assetx", base=base)
other.try_acquire()
other.set_blocked("facebook", "Facebook ขอ checkpoint")
other.release()
rc, out = run_main(base, page_reader)
check("AssetX เจอบล็อก FB = เราไม่เปิดเพจเลย", calls, [])
check("ไม่ต้องถือกุญแจ", (base / "lock.json").exists(), False)
check("รายงานว่าพักเพราะ AssetX", "assetx เจอ" in out, True)
rc, out = run_main(base, page_reader, ("--dry-run", "--target", "เพจ1"))
check("--target ตรวจเพจด้วยมือ = ข้ามสถานะพักร่วมได้", [c[0] for c in calls if c[0] == ("browser", "open")],
      [("browser", "open")])
check("อ่านสำเร็จ = ลบสถานะพักร่วม (บัญชีกลับมาใช้ได้)", sb.blocked_for("facebook", today, base), None)


def blocked_reader(t, cfg):
    sw.oc("browser", "open", t["url"])
    raise sw.Blocked("Facebook ขอ checkpoint (บัญชี Research อาจหลุดล็อกอิน/ถูกขอยืนยันตัวตน)")


base = TMP / "run-block"
rc, out = run_main(base, blocked_reader)
check("เราเจอบล็อก = หยุดเลนทันทีหลังเพจแรก", len([c for c in calls if c[0] == ("browser", "open")]), 1)
check("แจ้ง AssetX ผ่านสถานะร่วม", (sb.blocked_for("facebook", today, base) or {}).get("by"), "dvx")
check("บันทึกการใช้บอกผล blocked", sb.usage_rows(base)[-1]["result"], "blocked:facebook")
check("เพจที่เจอบล็อกก็นับ (เปิดไปแล้วจริง)", sb.pages_on(today, base), {"facebook": 1})


def thief_reader(t, cfg):
    """จำลองกุญแจหลุดมือกลางรอบ: อีกฝั่งยึดกุญแจไปแล้ว (เช่นเครื่องหลับนานเกิน 10 นาที)"""
    if t["name"] == "เพจ1":
        os.remove(sw._LOCK.path)
        sb.Lock("assetx", base=sw._LOCK.dir).try_acquire()
    return page_reader(t, cfg)


base = TMP / "run-lost"
rc, out = run_main(base, thief_reader)
check("กุญแจหลุด = จบ 0 ไม่พัง", rc, 0)
check("หยุดอ่านทันที (เปิดแค่เพจแรก)", len([c for c in calls if c[0] == ("browser", "open")]), 1)
check("รายงานกุญแจหลุด", "กุญแจ browser หลุดมือ" in out, True)
check("ไม่ลบกุญแจของ AssetX ที่ยึดไป", (sb.Lock("x", base=base).holder() or {}).get("project"), "assetx")
check("ยังปิด session ของเราเอง", calls[-1], (("browser", "close"), False))
check("กุญแจหลุด = เพจที่เปิดแล้วยังนับ (นับเกินได้ 1 ไม่นับขาด)", sb.pages_on(today, base), {"facebook": 2})

base = TMP / "run-own-cap"
mine = sb.Lock("dvx", base=base)
mine.try_acquire()
mine.log_usage({"facebook": 8})                                  # เช้านี้เราใช้ครบส่วนของเราแล้ว (/ideas กดซ้ำ)
mine.release()
CFG["shared_browser"]["own_daily_cap"] = {"facebook": 8}
cfg_file.write_text(json.dumps(CFG, ensure_ascii=False), encoding="utf-8")
rc, out = run_main(base, page_reader)
check("ใช้ครบส่วนของเรา 8 = ไม่อ่าน FB แม้เพดานรวมยังเหลือ 4 (กันไว้ให้ AssetX)", calls, [])
check("บอกว่ากันที่ไว้ให้ AssetX", "กันไว้ให้ AssetX" in out, True)

base = TMP / "run-budget"
CFG["shared_browser"]["run_budget_sec"] = 0
cfg_file.write_text(json.dumps(CFG, ensure_ascii=False), encoding="utf-8")
rc, out = run_main(base, page_reader)
check("หมดงบเวลา = ไม่เปิดเพจใหม่ จบปกติ", ([c for c in calls if c[0] == ("browser", "open")], rc), ([], 0))
check("แถวสรุปบอกผล budget + ปล่อยกุญแจ", (sb.usage_rows(base)[-1]["result"], (base / "lock.json").exists()),
      ("budget", False))
del CFG["shared_browser"]["run_budget_sec"]

base = TMP / "run-target"
CFG["max_targets_per_run"] = {"facebook": 2}
cfg_file.write_text(json.dumps(CFG, ensure_ascii=False), encoding="utf-8")
rc, out = run_main(base, page_reader, ("--dry-run", "--target", "เพจ"))
check("--target คำกว้าง = ไม่เกิน max_targets_per_run", sb.pages_on(today, base), {"facebook": 2})

base = TMP / "run-target-clear"
other = sb.Lock("assetx", base=base)
other.try_acquire()
other.set_blocked("facebook", "Facebook ขอ checkpoint")
other.release()
own_state = sw.STORE / "state.json"
sw.save_json(own_state, {"visits": {}, "blocked": {"facebook": {"at": today, "why": "checkpoint"}}})
rc, out = run_main(base, page_reader, ("--dry-run", "--target", "เพจ1"))
check("--target --dry-run อ่านสำเร็จ = ล้างแถวพักร่วม", sb.blocked_for("facebook", today, base), None)
check("…และล้างแถวพักของเราด้วย (ไม่งั้น DVX พักต่อเองอีก 3 วัน)", sw.load_json(own_state, {})["blocked"], {})
check("dry-run ไม่เขียน visits", sw.load_json(own_state, {})["visits"], {})


def one_post_slow(t, cfg):
    """อ่านได้แค่ 1 โพสต์ และกินเวลาจนเกินงบรอบ"""
    clock[0] += 200
    return page_reader(t, cfg)


base = TMP / "run-budget-reopen"
CFG.update(fb_low_posts=3, max_targets_per_run={"facebook": 6})
CFG["shared_browser"]["run_budget_sec"] = 100
cfg_file.write_text(json.dumps(CFG, ensure_ascii=False), encoding="utf-8")
real_mono, clock[0] = sw.time.monotonic, 0.0
sw.time.monotonic = lambda: clock[0]
try:
    rc, out = run_main(base, one_post_slow)
finally:
    sw.time.monotonic = real_mono
check("หมดงบตอนจะเปิดซ้ำ = ไม่เปิดซ้ำ (เปิดเพจเดียว)", len([c for c in calls if c[0] == ("browser", "open")]), 1)
check("ไม่รายงานหลอกว่าลองซ้ำแล้ว", "แม้ลองซ้ำแล้ว" in out, False)
check("บอกว่าหมดงบ ไม่ได้เปิดซ้ำ", "หมดงบเวลารอบ ไม่ได้เปิดซ้ำ" in out, True)
check("แถวสรุปผล budget", sb.usage_rows(base)[-1]["result"], "budget")


def hidden_reader(t, cfg):
    sw.oc("browser", "open", t["url"])
    raise sw.Hidden("หน้าต่าง browser ถูกซ่อน (จอล็อก/ถูกหน้าต่างอื่นบัง) — Chrome หยุดวาดหน้า Facebook ไม่โหลดโพสต์ต่อ (เห็น 1 โพสต์)")


base = TMP / "run-hidden"
del CFG["shared_browser"]["run_budget_sec"]
cfg_file.write_text(json.dumps(CFG, ensure_ascii=False), encoding="utf-8")
rc, out = run_main(base, hidden_reader)
check("หน้าต่างถูกซ่อน = หยุดเลนหลังเพจแรก (ไม่เปลืองโควตา)", len([c for c in calls if c[0] == ("browser", "open")]), 1)
check("ไม่ตั้งพักร่วม (ไม่ใช่บัญชีโดนบล็อก)", sb.blocked_for("facebook", today, base), None)
check("แถวสรุปผล hidden:facebook", sb.usage_rows(base)[-1]["result"], "hidden:facebook")
check("รายงาน ⚠️ บอกเหตุ", "⚠️ [social] หน้าต่าง browser ถูกซ่อน" in out, True)

print(f"\n{'ผ่านครบ' if not fails else f'ไม่ผ่าน {fails} ข้อ'}")
sys.exit(1 if fails else 0)
