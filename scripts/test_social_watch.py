"""ทดสอบตัวเฝ้าเพจโซเชียล (deploy/agents/social_watch.py) — ฟังก์ชันล้วน ไม่ยิงเน็ต ไม่แตะ DB ไม่เปิด Chrome

รัน:  .venv-image\\Scripts\\python.exe scripts\\test_social_watch.py
"""
import pathlib
import sys
from datetime import date

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "deploy" / "agents"))
import social_watch as sw  # noqa: E402

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — ได้ {got!r} ต้องการ {want!r}"))


CFG = {"outlier_ratio": 2.0, "min_engagement": 10, "min_views": 3000, "baseline_days": 60,
       "max_ideas_per_target": 2, "reddit_min_upvotes": 100, "gates": {"instagram": "2026-10-28"}}
today = date(2026, 10, 21)
iso = today.isoformat()

# ── กุญแจ/ลิงก์ของโพสต์ Facebook ──
check("คลิปใช้ data-video-id", sw.fb_key({"vid": "226", "fbids": ["9"]}), "v226")
check("รูปใช้ fbid", sw.fb_key({"vid": None, "fbids": ["9", "8"]}), "p9")
check("ไม่มีอะไรเลย = ข้าม", sw.fb_key({"vid": None, "fbids": [], "perma": None, "caption": ""}), None)
check("ลิงก์คลิป", sw.fb_link({"vid": "226"}, "https://fb/x"), "https://www.facebook.com/watch/?v=226")
check("ลิงก์ permalink ตัด __cft__ ทิ้ง เก็บ story_fbid",
      sw.fb_link({"vid": None, "fbids": [], "perma": "https://www.facebook.com/permalink.php?story_fbid=5&id=7&__cft__[0]=AZ"},
                 "https://fb/x"),
      "https://www.facebook.com/permalink.php?story_fbid=5&id=7")
check("ไม่มีลิงก์โพสต์ = ลิงก์เพจ", sw.fb_link({"vid": None, "fbids": [], "perma": None}, "https://fb/x"), "https://fb/x")
check("id ของเพจแบบ profile.php",
      sw.target_id("facebook", {"url": "https://www.facebook.com/profile.php?id=61583179858522"}), "fb_61583179858522")
check("id ของเพจแบบชื่อ", sw.target_id("facebook", {"url": "https://www.facebook.com/NutCardTCG/"}), "fb_NutCardTCG")

# ── เลือกเพจที่ถึงรอบ ──
T = [{"name": "a", "url": "https://www.facebook.com/a", "every_days": 2},
     {"name": "b", "url": "https://www.facebook.com/b", "every_days": 3},
     {"name": "c", "url": "https://www.facebook.com/c", "every_days": 1}]
visits = {"fb_a": "2026-10-20", "fb_b": "2026-10-15"}
check("ยังไม่ถึงรอบไม่เอา · เลยรอบนานสุดก่อน · ไม่เคยเปิดมาก่อนสุด",
      [t["name"] for t in sw.due_targets("facebook", T, visits, today, 5)], ["c", "b"])
check("ตัดตามเพดานต่อรอบ", [t["name"] for t in sw.due_targets("facebook", T, visits, today, 1)], ["c"])
check("ประตู IG ยังปิดก่อนวัน", sw.gate_open("instagram", CFG, today), False)
check("ประตู IG เปิดตรงวัน", sw.gate_open("instagram", CFG, date(2026, 10, 28)), True)
check("ไม่มีประตู = เปิด", sw.gate_open("facebook", CFG, today), True)


# ── หาโพสต์แรงผิดปกติ ──
def post(key, r, c=0, s=0, v=None, fmt="photo"):
    return {"key": key, "format": fmt, "link": f"https://x/{key}", "caption": f"โพสต์การ์ด {key}\nบรรทัดสอง",
            "m": {"reactions": r, "comments": c, "shares": s, "views": v}, "posted": None}


store = {"posts": {}}
seen = sw.merge(store, [post("a", 4), post("b", 5), post("c", 6), post("d", 5), post("e", 36)], iso)
hits = sw.outliers("facebook", store, seen, today, CFG)
check("เจอโพสต์ที่แรงกว่ามัธยฐาน 2 เท่าขึ้นไปตัวเดียว", [h["key"] for h in hits], ["e"])
check("อัตราส่วนเทียบมัธยฐานของเพจตัวเอง", round(hits[0]["ratio"], 1), 7.2)

small = {"posts": {}}
seen = sw.merge(small, [post("a", 1), post("b", 1), post("c", 1), post("d", 1), post("e", 6)], iso)
check("แรงกว่ามากแต่ยอดน้อยกว่าขั้นต่ำ = ไม่เอา", sw.outliers("facebook", small, seen, today, CFG), [])

few = {"posts": {}}
seen = sw.merge(few, [post("a", 4), post("b", 90)], iso)
check("โพสต์น้อยกว่า 4 ชิ้น = ยังไม่มีฐานเทียบ ไม่เดา", sw.outliers("facebook", few, seen, today, CFG), [])

vids = {"posts": {}}
seen = sw.merge(vids, [post("a", 30, v=14000, fmt="video"), post("b", 31, v=9800, fmt="video"),
                       post("c", 33, v=12000, fmt="video"), post("d", 16, v=41000, fmt="video"),
                       post("e", 30)], iso)
hits = sw.outliers("facebook", vids, seen, today, CFG)
check("คลิปเทียบยอดวิวกับคลิปด้วยกันได้ แม้เอ็นเกจปกติ", [(h["key"], h["by"]) for h in hits], [("d", "views")])

vids["posts"]["d"]["idea"] = iso
check("ส่งเข้าคิวแล้วไม่เสนอซ้ำ", sw.outliers("facebook", vids, seen, today, CFG), [])

store2 = {"posts": {}}
sw.merge(store2, [post("a", 4)], "2026-10-20")
sw.merge(store2, [post("a", 9, c=2)], iso)
rec = store2["posts"]["a"]
check("เห็นซ้ำวันใหม่ = ต่อประวัติ เก็บยอดล่าสุด", (rec["first_seen"], rec["m"]["reactions"], len(rec["hist"])),
      ("2026-10-20", 9, 2))
sw.merge(store2, [post("a", 11, c=2)], iso)
check("เห็นซ้ำวันเดิม = ทับแถววันนั้น ไม่เพิ่มแถว", len(store2["posts"]["a"]["hist"]), 2)
check("ตัดของที่ไม่เห็นนานเกินกำหนด", sw.prune(store2, date(2027, 3, 1), 120), 1)

rd = {"posts": {}}
seen = sw.merge(rd, [post(k, u) for k, u in (("a", 80), ("b", 120), ("c", 150), ("d", 90), ("e", 400))], iso)
check("Reddit: ผ่านขั้นต่ำ + แรงกว่ากระทู้ฮิตวันอื่น 2 เท่า", [h["key"] for h in sw.outliers("reddit", rd, seen, today, CFG)],
      ["e"])

# ── โพสต์ที่ไม่เกี่ยวกับการ์ดไม่เข้าคิว (รอบแรก: เครื่องสแกนนิ้วของ Hi-Top แรงกว่าปกติ 237 เท่า) ──
check("โพสต์เครื่องสแกนนิ้ว = ไม่เกี่ยวกับการ์ด", sw.card_related("ทนทุกการใช้ ไวทุกสัมผัส แบบ All-in One"), False)
check("รหัสชุดการ์ด = เกี่ยว", sw.card_related("Restock OP-17 พร้อมส่ง"), True)
check("คำว่า box ต้องเป็นคำขึ้นต้น ไม่ใช่กลางคำ", sw.card_related("inbox us"), False)
mixed = {"posts": {}}
seen = sw.merge(mixed, [post("a", 4), post("b", 5), post("c", 6), post("d", 5), post("e", 90)], iso)
mixed["posts"]["e"]["caption"] = "Biometric รุ่นใหม่ สแกนนิ้วไว"
check("แรงแค่ไหนถ้าไม่เกี่ยวกับการ์ดก็ไม่เข้าคิว", sw.outliers("facebook", mixed, seen, today, CFG), [])

# ── แถวไอเดีย ──
tgt = {"name": "BLACK CARD TCG", "url": "https://www.facebook.com/profile.php?id=615", "group": "competitor"}
store = {"posts": {}}
seen = sw.merge(store, [post("a", 4), post("b", 5), post("c", 6), post("d", 5), post("e", 36)], iso)
h = sw.outliers("facebook", store, seen, today, CFG)[0]
row = sw.idea_row("facebook", tgt, store["posts"]["e"], h, iso)
check("source manual + subtype social_fb (ตารางไม่มี source โซเชียล)", (row["source"], row["subtype"]),
      ("manual", "social_fb"))
check("ป้ายแหล่ง = แพลตฟอร์ม · ชื่อเพจ", row["source_label"], "Facebook · BLACK CARD TCG")
check("หัวเรื่องบอกชนิดโพสต์ + กี่เท่า + บรรทัดแรก", row["title"], "รูปแรงกว่าปกติของเพจ 7.2 เท่า — โพสต์การ์ด e")
check("คะแนนอยู่ช่วงเดียวกับเลนอื่น (เพดาน 6.2 + คู่แข่ง 0.3)", row["score"], 6.5)
check("กุญแจกันซ้ำผูกเพจ + โพสต์", row["external_key"], "sw:fb:fb_615:e")
check("มุมคู่แข่งห้ามพาดพิงชื่อ", "ห้ามพาดพิงชื่อเขา" in row["angle"], True)
check("ตัวเลขอ่านง่าย", sw.short_num(14000), "14K")
check("ตัวเลขทศนิยม", sw.short_num(9800), "9.8K")

# ── รายงานบทเรียนรายสัปดาห์ (social_insight.py) ──
import social_insight as si  # noqa: E402

check("สัปดาห์แบบ ISO", si.iso_week(date(2026, 10, 21)), "2026-W43")
check("ช่วงวันของสัปดาห์", si.week_range_th(date(2026, 10, 21)), "19 ต.ค. – 25 ต.ค. 2026")
check("หัวข้อจากแคปชั่นไทย+อังกฤษ", si.tags_for("บรรยากาศงานแข่ง Lorcana Pre-Release", si.TOPICS), ["งานแข่ง/อีเวนต์"])
check("คำว่า event ต้องเป็นคำ ไม่ใช่ส่วนของคำอื่น", si.tags_for("eventually", si.TOPICS), [])
check("ค่ายจากรหัสชุด", si.tags_for("Restock OP-17 พร้อมส่ง", si.FRANCHISES), ["One Piece"])

page = {"posts": {}}
sw.merge(page, [post("a", 4), post("b", 5), post("c", 6), post("d", 5), post("e", 36)], iso)
page["posts"]["e"]["caption"] = "บรรยากาศงานแข่งการ์ด"
page["posts"]["a"]["caption"] = "เติมของแล้ว การ์ดใหม่"
thin_page = {"posts": {}}
sw.merge(thin_page, [post("x", 9)], iso)
stores = [("facebook", {"name": "BC", "group": "competitor"}, page),
          ("facebook", {"name": "เพจใหม่", "group": "shop"}, thin_page)]
rows, thin = si.observations(stores, today)
check("เพจที่โพสต์ในคลังไม่ถึง 4 ชิ้น ไม่เอามาคิด แต่บอกชื่อไว้", (len(rows), thin), (5, ["เพจใหม่"]))
check("lift = เท่าของมัธยฐานเพจตัวเอง", sorted(r["lift"] for r in rows), [0.8, 1.0, 1.0, 1.2, 7.2])
s = si.summarize(rows)
check("นับโพสต์แรงผิดปกติ", s["outliers"], 1)
check("หัวข้อที่แรงสุดขึ้นก่อน", s["by_topic"][0]["key"], "งานแข่ง/อีเวนต์")
check("โพสต์แรงสุดอยู่บนสุด", s["top"][0]["caption"], "บรรยากาศงานแข่งการ์ด")
old = {"posts": {}}
sw.merge(old, [post(k, 5) for k in "abcd"], "2026-09-01")
rows, _ = si.observations([("facebook", {"name": "เก่า", "group": "shop"}, old)], today)
check("โพสต์ที่ไม่ได้เห็นเกิน 14 วัน ไม่อยู่ในรายงานสัปดาห์นี้", rows, [])
check("หัวข้อความเชื่อใจจับคำของคู่แข่งตู้ได้", "ความเชื่อใจ (ไม่คัดซอง/ของแท้)" in si.tags_for("ไม่มีคัดซอง ตรงเรทคาตั้น100%", si.TOPICS), True)
check("Pre-Release ไม่นับเป็นวันวางขาย", si.tags_for("Lorcana Pre-Release", si.TOPICS), ["งานแข่ง/อีเวนต์"])
check("ข้อมูลน้อย = เพดานความมั่นใจ low", si.confidence_cap({"posts": 41, "pages": 6}), "low")
check("ข้อมูลพอประมาณ = medium", si.confidence_cap({"posts": 120, "pages": 12}), "medium")
check("AI ให้ high แต่เพดาน low = low", si.cap_confidence("high", "low"), "low")
check("AI ตอบค่าแปลก = low", si.cap_confidence("very high", "medium"), "low")
check("AI ให้ medium เพดาน high = medium", si.cap_confidence("Medium", "high"), "medium")

# ── ป้ายซ่อน "Facebook" ในแคปชั่น (22 ต.ค. 2026 · Pokémon Trainers Thailand ได้ "Facebook" 32 บรรทัด) ──
junk = "\n".join(["Facebook"] * 32 + ["ประกาศปิดปรับปรุงเว็บไซต์", "· See original", "· Rate this translation"])
check("ล้างป้าย Facebook + ปุ่มแปล", sw.clean_caption(junk), "ประกาศปิดปรับปรุงเว็บไซต์")
check("แคปชั่นปกติไม่ถูกแตะ", sw.clean_caption("Facebook Gaming มาแล้ว\nเปิดซองสด"), "Facebook Gaming มาแล้ว\nเปิดซองสด")
dirty = {"posts": {}}
sw.merge(dirty, [dict(post("a", 4), caption=junk)], "2026-10-21")
check("เก็บใหม่ = ล้างก่อนเก็บ", dirty["posts"]["a"]["caption"], "ประกาศปิดปรับปรุงเว็บไซต์")
dirty["posts"]["a"]["caption"] = junk                     # ของที่เก็บไว้ก่อนแก้
sw.merge(dirty, [dict(post("a", 5), caption="ประกาศปิดปรับปรุง")], iso)
check("ของเก่าที่มีขยะ ห้ามชนะเพราะยาวกว่า", dirty["posts"]["a"]["caption"], "ประกาศปิดปรับปรุงเว็บไซต์")

# ── ของร่วมกับ AssetX: สถานะพักร่วม + เพดานรวมต่อวัน (3 พ.ย. 2026) ──
fb6 = [{"name": f"p{i}"} for i in range(6)]
rd2 = [{"name": "r1"}, {"name": "r2"}]
plan, notes = sw.shared_limits([("facebook", fb6), ("reddit", rd2)], {}, {}, {"facebook": 12})
check("ไม่มีอะไรร่วม = แผนเดิม", [(p, len(t)) for p, t in plan], [("facebook", 6), ("reddit", 2)])
check("ไม่มีอะไรร่วม = ไม่มีข้อความ", notes, [])
plan, notes = sw.shared_limits([("facebook", fb6), ("reddit", rd2)],
                               {"facebook": {"at": "2026-11-03", "why": "Facebook ขอ checkpoint", "by": "assetx"}},
                               {}, {"facebook": 12})
check("AssetX เจอบล็อก FB = เราพัก FB ด้วย เลนอื่นเดินต่อ", [p for p, _ in plan], ["reddit"])
check("ข้อความบอกว่าใครเจอ", "assetx เจอ" in notes[0] and notes[0].startswith("⚠️ [social]"), True)
plan, notes = sw.shared_limits([("facebook", fb6)], {}, {"facebook": 9}, {"facebook": 12})
check("เหลือโควตา 3 = อ่าน 3 เพจแรก (ค้างนานสุดก่อน)", [x["name"] for x in plan[0][1]], ["p0", "p1", "p2"])
check("บอกว่าตัดเพราะโควตา", "อ่าน 3 จาก 6" in notes[0], True)
plan, notes = sw.shared_limits([("facebook", fb6), ("reddit", rd2)], {}, {"facebook": 12, "reddit": 40},
                               {"facebook": 12})
check("ครบเพดาน FB = ไม่อ่าน FB · Reddit ไม่มีเพดาน", [p for p, _ in plan], ["reddit"])
check("ครบเพดานไม่ใช่ ⚠️ (เป็นเรื่องปกติ)", notes[0].startswith("[social]"), True)
plan, notes = sw.shared_limits([("facebook", fb6)], {}, {"facebook": 6}, {"facebook": 12}, {"facebook": 6}, {"facebook": 8})
check("รวมเหลือ 6 แต่ส่วนของเราเหลือ 2 = อ่าน 2 (กันที่ให้ AssetX)", len(plan[0][1]), 2)
check("บอกว่าตัดเพราะส่วนของเรา", "เหลือโควตาส่วนของเราวันนี้ 2 เพจ" in notes[0], True)
plan, notes = sw.shared_limits([("facebook", fb6)], {}, {"facebook": 11}, {"facebook": 12}, {"facebook": 2}, {"facebook": 8})
check("ส่วนของเราเหลือ 6 แต่รวมเหลือ 1 = อ่าน 1 (ตัวที่น้อยกว่าชนะ)", len(plan[0][1]), 1)

# ── bridge: daemon ไม่ขึ้นเองหลังเปิดเครื่อง (31 ต.ค.–3 พ.ย. 2026 ข้ามทุกรอบ) — ของปลอมแทน OpenCLI ไม่เปิด Chrome จริง ──
def fake_bridge(states):
    """states = ลำดับผล profile list [(daemonRunning, connected), ...] · คืน (oc ปลอม, รายการคำสั่งที่ถูกเรียก)"""
    seq, calls = list(states), []

    def oc(*args, timeout=150, beat=True):
        calls.append(args[:2])
        if args[:2] == ("profile", "list"):
            run, conn = seq.pop(0) if len(seq) > 1 else seq[0]
            return {"ok": True, "data": {"daemonRunning": run, "profiles": [{"alias": "research", "connected": conn}]}}
        return {"ok": True, "data": {"action": "started"}}
    return oc, calls


real_oc, real_sleep, real_paths = sw.oc, sw.time.sleep, sw.CHROME_PATHS
sw.time.sleep, sw.CHROME_PATHS = (lambda s: None), []
try:
    sw.oc, calls = fake_bridge([(True, True)])
    check("ต่ออยู่แล้ว = พร้อม ไม่แตะ daemon", (sw.ensure_bridge({}), ("daemon", "restart") in calls), ((True, False), False))
    sw.oc, calls = fake_bridge([(False, False), (True, True)])
    check("daemon ไม่รัน = สั่ง restart แล้วต่อได้", (sw.ensure_bridge({}), calls.count(("daemon", "restart"))), ((True, False), 1))
    sw.oc, calls = fake_bridge([(True, False)])
    check("daemon รันแต่ส่วนเสริมไม่ต่อ (ไม่มี Chrome) = ไม่พร้อม · ไม่ restart", (sw.ensure_bridge({}), ("daemon", "restart") in calls),
          ((False, False), False))
finally:
    sw.oc, sw.time.sleep, sw.CHROME_PATHS = real_oc, real_sleep, real_paths


# ── หน้าต่างถูกซ่อน (3 พ.ย. 2026 ต้นเหตุ "เพจละ 1 โพสต์") — ของปลอมแทน OpenCLI ──
def fake_fb(vis_seq, posts_per_eval):
    seen, calls = {"n": 0}, []

    def oc(*args, timeout=150, beat=True):
        calls.append(args[:2])
        if args[:2] == ("browser", "eval"):
            i = seen["n"]
            seen["n"] += 1
            posts = [{"pos": j + 1, "vid": f"{j}", "fbids": [], "perma": None, "ext": None, "format": "video",
                      "caption": f"โพสต์ {j}", "m": {"reactions": 1, "comments": 0, "shares": 0, "views": None}}
                     for j in range(min(posts_per_eval * (i + 1), 12))]
            return {"ok": True, "data": {"blocked": None, "posts": posts, "vis": vis_seq[min(i, len(vis_seq) - 1)]}}
        return {"ok": True, "data": {}}
    return oc, calls


real_oc, real_sleep = sw.oc, sw.time.sleep
sw.time.sleep = lambda s: None
fbcfg = {"fb_scroll_steps": 10, "fb_max_posts": 12, "fb_low_posts": 3}
page = {"name": "x", "url": "https://www.facebook.com/x/"}
try:
    sw.oc, calls = fake_fb(["hidden"], 1)
    try:
        sw.read_facebook(page, fbcfg)
        check("หน้าต่างถูกซ่อน + ได้ 1 โพสต์ = โยน Hidden", "ไม่โยน", "Hidden")
    except sw.Hidden:
        check("หน้าต่างถูกซ่อน + ได้ 1 โพสต์ = โยน Hidden", "Hidden", "Hidden")
    check("ซ่อนอยู่ = ไม่เลื่อนต่อ (อ่านครั้งเดียว)", (calls.count(("browser", "eval")), ("browser", "scroll") in calls), (1, False))
    check("Hidden ไม่ใช่ Blocked (ไม่พักบัญชี 3 วัน)", issubclass(sw.Hidden, sw.Blocked), False)
    sw.oc, calls = fake_fb(["visible"], 4)
    check("หน้าต่างมองเห็น = เลื่อนโหลดต่อจนครบ 12", len(sw.read_facebook(page, fbcfg)), 12)
    sw.oc, calls = fake_fb(["hidden"], 4)
    check("ซ่อนแต่ได้ ≥ 3 โพสต์แล้ว = เก็บที่ได้ ไม่โยน", len(sw.read_facebook(page, fbcfg)), 4)
finally:
    sw.oc, sw.time.sleep = real_oc, real_sleep


# ── Instagram: อ่านจากคำตอบที่หน้าโปรไฟล์โหลดเอง (11 พ.ย. 2026 — endpoint เดิมตอบ 404 แล้วโดนนับเป็นบล็อก) ──
# รูปข้อมูลปลอมทำตาม `browser network` ของ OpenCLI 2.0.2 จริง: รายการ = key/url/status/timestamp/shape · --detail = body เต็ม
IG_GQL = "https://www.instagram.com/api/graphql"


def ig_node(code, owner="op_en", ts=1794189677, likes=100, comments=5, media=1, product="feed", **kw):
    n = {"code": code, "taken_at": ts, "like_count": likes, "comment_count": comments, "media_type": media,
         "product_type": product, "caption": {"text": f"แคปชั่น {code}"}, "user": {"username": owner}}
    n.update(kw)
    return n


def ig_entry(key, nodes, status=200, ts="2026-11-11T08:40:07.007Z"):
    body = {"data": {sw.IG_TIMELINE: {"edges": [{"node": n} for n in nodes], "page_info": {"has_next_page": True}}},
            "extensions": {"is_final": True}}
    listing = {"key": key, "method": "POST", "url": IG_GQL, "status": status, "timestamp": ts, "ct": "text/javascript",
               "shape": {"$": "object", "$.data": "object", f"$.data.{sw.IG_TIMELINE}": "object",
                         f"$.data.{sw.IG_TIMELINE}.edges": f"array({len(nodes)})"}}
    return listing, {"key": key, "url": IG_GQL, "status": status, "body": body}


def ig_err(key, status, shape=None, url=IG_GQL):
    """คำตอบที่ถูกจำกัด/ให้ล็อกอิน — ไม่มีชุดโพสต์ใน shape (OpenCLI ทำ shape จากเนื้อคำตอบจริง)"""
    return {"key": key, "method": "POST", "url": url, "status": status, "timestamp": "2026-11-11T08:40:07.100Z",
            "shape": shape or {"$": "object", "$.message": "string", "$.status": "string"}}, None


def fake_ig(pages, batches):
    """pages = ลำดับผล eval ของหน้า · batches = ลำดับผล `browser network` (list ของ (listing, detail) หรือ {"reused": True, "items": …})"""
    pseq, seq, calls = list(pages), list(batches), []
    every = [it for b in batches for it in (b["items"] if isinstance(b, dict) else b)]

    def oc(*args, timeout=150, beat=True):
        calls.append(args[:3])
        if args[:2] == ("browser", "eval"):
            return {"ok": True, "data": pseq.pop(0) if len(pseq) > 1 else pseq[0]}
        if args[:2] == ("browser", "network"):
            if args[2] == "--detail":
                for listing, detail in every:
                    if listing["key"] == args[3] and detail is not None:
                        return {"ok": True, "data": detail}
                raise sw.WatchError("OpenCLI browser network: key_not_found")
            cur = seq.pop(0) if len(seq) > 1 else seq[0]
            items = cur["items"] if isinstance(cur, dict) else cur
            viewer = {"key": "POST www.instagram.com/api/graphql#2", "url": IG_GQL, "status": 200,
                      "shape": {"$.data.xdt_viewer": "object"}}
            data = {"session": "dvxwatch", "entries": [viewer] + [listing for listing, _ in items]}
            if isinstance(cur, dict) and cur.get("reused"):
                data["cache_reused"] = True
            return {"ok": True, "data": data}
        return {"ok": True, "data": {}}
    return oc, calls


def raises(fn, exc):
    try:
        fn()
    except exc:
        return exc.__name__
    except sw.WatchError as e:
        return f"{type(e).__name__}: {e}"
    return "ไม่โยน"


import json  # noqa: E402
import tempfile  # noqa: E402

OK = {"missing": False, "grid": 12}
real_oc, real_sleep, real_cache = sw.oc, sw.time.sleep, sw.NET_CACHE
sw.time.sleep = lambda s: None
tmp = pathlib.Path(tempfile.mkdtemp())
sw.NET_CACHE = tmp
igt = {"name": "ONE PIECE CARD GAME English", "user": "op_en"}
try:
    reel = ig_node("R1", media=2, product="clips", likes=900, comments=40, ts=1794189677)
    car = ig_node("C1", media=8, product="carousel_container", ts=1794103282)
    old = ig_node("P1", ts=1793757616, caption=None)
    (tmp / "7t3asn4t_dvxwatch.json").write_text("{}")
    (tmp / "44wkjy4p_assetxwatch.json").write_text("{}")
    sw.oc, calls = fake_ig([OK], [[ig_entry("POST www.instagram.com/api/graphql#6", [car, old, reel])]])
    got = sw.read_instagram(igt, {})
    check("IG อ่านจากคำตอบของหน้า: ได้ครบ 3 โพสต์ เรียงใหม่ → เก่า", [p["key"] for p in got], ["R1", "C1", "P1"])
    check("IG รูปแบบ: clips = reel · 8 = carousel · 1 = photo", [p["format"] for p in got], ["reel", "carousel", "photo"])
    check("IG ตัวเลข + ลิงก์ + วันโพสต์ (เวลาไทย)", (got[0]["m"], got[0]["link"], got[0]["posted"]),
          ({"reactions": 900, "comments": 40, "shares": None, "views": None}, "https://www.instagram.com/p/R1/", "2026-11-09"))
    check("IG แคปชั่นว่าง (caption = null) ไม่ล้ม", got[2]["caption"], "")
    check("IG ไม่ยิงคำขอเอง — อ่านได้แล้วมีแค่ open / network (ไม่ eval ระหว่างหน้าโหลด)", sorted({c[:2] for c in calls}),
          [("browser", "network"), ("browser", "open")])
    check("IG อ่านเสร็จลบแคชเครือข่ายของ session เรา · ไม่แตะของ AssetX",
          sorted(f.name for f in tmp.iterdir()), ["44wkjy4p_assetxwatch.json"])

    sw.oc, _ = fake_ig([OK], [[ig_entry("k1", [ig_node("A", owner="someone_else")])]])
    check("IG ชุดโพสต์ของเพจอื่น = ไม่รับ · ไม่ใช่บล็อก",
          raises(lambda: sw.read_instagram(igt, {}), sw.Blocked).startswith("WatchError"), True)
    sw.oc, _ = fake_ig([OK], [{"reused": True, "items": [ig_entry("k1b", [ig_node("A1")])]}])
    check("IG ชุดที่ OpenCLI คืนจากแคชเก่า (cache_reused) = ไม่รับแม้เจ้าของตรง",
          raises(lambda: sw.read_instagram(igt, {}), sw.Blocked).startswith("WatchError"), True)

    sw.oc, calls = fake_ig([OK], [[], [ig_entry("k2", [ig_node("B")])]])
    check("IG รอบแรกยังไม่มี timeline = รอแล้วดูใหม่ 1 ครั้ง", [p["key"] for p in sw.read_instagram(igt, {})], ["B"])

    sw.oc, calls = fake_ig([OK], [[]])
    msg = raises(lambda: sw.read_instagram(igt, {}), sw.Blocked)
    check("IG ไม่เจอ timeline เลย = WatchError (ไม่พักเลน 3 วัน) · เปิดหน้าครั้งเดียว · ดูด ≤ 2 ครั้ง",
          (msg.startswith("WatchError"), calls.count(("browser", "open", "https://www.instagram.com/op_en/")),
           sum(1 for c in calls if c == ("browser", "network", "--session"))), (True, 1, 2))
    check("IG ข้อความล้มบอกว่าหน้าโชว์โพสต์แต่จดไม่ทัน", "หน้าโชว์ 12 โพสต์" in msg, True)
    first_net = next(i for i, c in enumerate(calls) if c[:2] == ("browser", "network"))
    first_eval = next(i for i, c in enumerate(calls) if c[:2] == ("browser", "eval"))
    check("IG ดูดเครือข่ายก่อนสั่ง eval (eval ระหว่างหน้าโหลด = debugger ต่อใหม่ ชุดโพสต์หาย)", first_net < first_eval, True)

    sw.oc, calls = fake_ig([{"missing": True, "grid": 0}], [[]])
    msg = raises(lambda: sw.read_instagram(igt, {}), sw.Blocked)
    check("IG ไม่มีเพจนี้ = บอกว่าไม่มีเพจ", "ไม่มีเพจนี้" in msg, True)

    collab = [ig_node(f"S{i}", owner=f"customer{i}", coauthor_producers=[{"username": f"customer{i}"}, {"username": "op_en"}])
              for i in range(3)]
    sw.oc, _ = fake_ig([OK], [[ig_entry("k2c", collab)]])
    check("IG เพจที่มีแต่โพสต์ร่วม (ลูกค้าโพสต์ ใส่เพจเป็นผู้ร่วม) = รับ (Sanctuary 11 พ.ย.)",
          len(sw.read_instagram(igt, {})), 3)

    for label in ("accounts/login", "challenge", "accounts/suspended", "logged out"):
        sw.oc, _ = fake_ig([{"blocked": label}], [[]])
        check(f"IG หน้า {label} = Blocked", raises(lambda: sw.read_instagram(igt, {}), sw.Blocked), "Blocked")
    check("IG ป้ายบล็อกเป็นค่าคงที่ ไม่เอา path ต่อท้าย (รหัสบัญชีในหน้า challenge)",
          "split('/')" in sw.IG_PAGE_JS or "slice(0, 2)" in sw.IG_PAGE_JS, False)

    sw.oc, _ = fake_ig([OK], [[ig_err("POST www.instagram.com/api/graphql#6", 429)]])
    check("IG หน้าโหลดโพสต์แล้วได้ 429 (ไม่มีชุดโพสต์) = Blocked", raises(lambda: sw.read_instagram(igt, {}), sw.Blocked), "Blocked")
    sw.oc, _ = fake_ig([OK], [[ig_err("POST www.instagram.com/api/graphql#6", 200,
                                       {"$": "object", "$.message": "string", "$.require_login": "boolean"})]])
    check("IG คำตอบ require_login = Blocked", raises(lambda: sw.read_instagram(igt, {}), sw.Blocked), "Blocked")
    web403 = "https://www.instagram.com/api/v1/web/x/"
    sw.oc, _ = fake_ig([OK], [[ig_err("POST www.instagram.com/api/v1/web/x/", 403, url=web403), ig_entry("k4", [ig_node("D")])]])
    check("IG คำขอเบื้องหลังตัวอื่นล้ม แต่อ่านโพสต์ได้ = ไม่บล็อก", [p["key"] for p in sw.read_instagram(igt, {})], ["D"])
    sw.oc, _ = fake_ig([OK], [[ig_err("POST www.instagram.com/api/v1/web/x/", 403, url=web403)]])
    check("IG 403 ของคำขอ /api/v1/web (ไม่ใช่ graphql) อย่างเดียว ≠ บล็อก",
          raises(lambda: sw.read_instagram(igt, {}), sw.Blocked).startswith("WatchError"), True)
    sw.oc, _ = fake_ig([OK], [[ig_entry("k4b", [ig_node("D2")], status=500)]])
    check("IG ชุดโพสต์ตอบ 500 = ข้าม (WatchError ไม่ใช่บล็อก)",
          raises(lambda: sw.read_instagram(igt, {}), sw.Blocked).startswith("WatchError"), True)

    check("IG body เป็นข้อความ JSON = แปลงได้", sorted(sw._ig_body({"body": json.dumps({"data": {}})})), ["data"])
    check("IG body หลายก้อนคั่นบรรทัด = เอาก้อนแรก", sw._ig_body({"body": '{"data": {"a": 1}}\n{"x": 2}'}), {"data": {"a": 1}})
    check("IG body ถูกตัด = None (ไม่ล้ม)", sw._ig_body({"body": '{"data": {"a', "body_truncated": True}), None)

    sw.oc, _ = fake_ig([OK], [[ig_entry("k7", [ig_node("G", like_and_view_counts_disabled=True)])]])
    check("IG เจ้าของซ่อนยอดไลก์ = ไม่เอาไลก์ไปเทียบ", sw.read_instagram(igt, {})[0]["m"]["reactions"], None)

    sw.oc, _ = fake_ig([OK], [[ig_entry("k8", [ig_node("H", owner="partner_shop"), ig_node("I")])]])
    check("IG โพสต์ร่วม (คนโพสต์เป็นอีกบัญชี) อยู่ในชุดของเพจ = เก็บด้วย", sorted(p["key"] for p in sw.read_instagram(igt, {})),
          ["H", "I"])
    sw.oc, _ = fake_ig([OK], [[ig_entry("k9a", [ig_node("N1", ts=1794000001)], ts="2026-11-11T08:40:07.000Z"),
                               ig_entry("k9b", [ig_node("N1", ts=1794000001), ig_node("N2", ts=1794000002)],
                                        ts="2026-11-11T08:40:09.000Z")]])
    check("IG หลายชุด = รวมกันไม่ซ้ำ", [p["key"] for p in sw.read_instagram(igt, {})], ["N2", "N1"])

    many = [ig_node(f"M{i}", ts=1794000000 + i) for i in range(20)]
    sw.oc, _ = fake_ig([OK], [[ig_entry("k9", many)]])
    check("IG เกิน ig_max_posts = เก็บใหม่สุดตามจำนวน", [p["key"] for p in sw.read_instagram(igt, {"ig_max_posts": 3})],
          ["M19", "M18", "M17"])
finally:
    sw.oc, sw.time.sleep, sw.NET_CACHE = real_oc, real_sleep, real_cache

# โพสต์ปักหมุด/เก่าที่ IG ส่งมาในชุดแรก — ยอดสะสมนาน ห้ามนับว่า "แรงกว่าปกติ"
ocfg = {"baseline_days": 60, "outlier_ratio": 2.0, "min_engagement": 10, "min_views": 3000, "max_ideas_per_target": 5}
today = date(2026, 11, 11)
posts = {f"r{i}": {"first_seen": "2026-11-05", "posted": f"2026-11-0{i + 1}", "caption": "การ์ด One Piece",
                   "m": {"reactions": 20, "comments": 1, "shares": None, "views": None}} for i in range(5)}
posts["pin"] = {"first_seen": "2026-11-11", "posted": "2026-03-01", "caption": "การ์ด One Piece โพสต์ปักหมุด",
                "m": {"reactions": 5000, "comments": 90, "shares": None, "views": None}}
posts["hot"] = {"first_seen": "2026-11-11", "posted": "2026-11-10", "caption": "การ์ด One Piece ชุดใหม่",
                "m": {"reactions": 400, "comments": 30, "shares": None, "views": None}}
check("โพสต์ปักหมุดเก่ากว่าฐานเทียบ ไม่นับว่าแรง · โพสต์ใหม่ที่แรงยังนับ",
      [h["key"] for h in sw.outliers("instagram", {"posts": posts}, ["pin", "hot"], today, ocfg)], ["hot"])

print(f"\n{'ผ่านครบ' if not fails else f'ไม่ผ่าน {fails} ข้อ'}")
sys.exit(1 if fails else 0)
