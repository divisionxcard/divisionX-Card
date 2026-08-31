#!/usr/bin/env python3
"""ทดสอบด่านจำกัด "มุมเดิม" ในคิวไอเดีย — idea_collector.cap_by_subtype + save()

รัน: py scripts/test_idea_cap.py
คืน exit 1 ถ้าด่านไม่ทำงานตามที่ตั้งใจ

⚠️ ทดสอบผ่าน save() ของจริงด้วย ไม่ใช่เรียกแต่ฟังก์ชันย่อย
   28 ส.ค. 2026 เคยเจ็บมาแล้ว: splitHeadline ผ่านทดสอบ 34/34 แต่ route เรียกไม่ได้
   เลยเพราะลืมบรรทัด import — ทดสอบที่แตะแต่ไลบรารีไม่ได้พิสูจน์เส้นทางที่ของจริงเดิน
   ท่อนล่างจึงยิงผ่าน save() ที่อ่านคิวจริงจาก DB (dry-run ไม่เขียนอะไร)
"""
import io
import json
import os
import pathlib
import re
import sys
from contextlib import redirect_stdout

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
sys.stdout.reconfigure(encoding="utf-8")

import idea_collector as ic  # noqa: E402
import dvx_data as data      # noqa: E402

CFG = json.loads((ROOT / "deploy" / "tasks" / "idea_sources.json").read_text(encoding="utf-8-sig"))
CAP = CFG.get("max_per_subtype", 5)

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


def row(subtype, score, source="internal", key=None):
    return {"source": source, "subtype": subtype, "score": score,
            "title": f"{subtype} {score}", "external_key": key or f"t:{subtype}:{score}"}


# ── 1. ตรรกะของด่าน ─────────────────────────────────────────────────────
print("── ตรรกะด่าน cap_by_subtype ──")

kept, over = ic.cap_by_subtype([row("machine_drop", 3.7), row("machine_drop", 3.5)],
                               {("internal", "machine_drop"): CAP}, CAP)
check("คิวเต็มแล้ว → ข้ามทั้งหมด", (len(kept), len(over)), (0, 2))

kept, over = ic.cap_by_subtype(
    [row("falling_sku", 3.1), row("falling_sku", 4.9), row("falling_sku", 3.8), row("falling_sku", 4.2)],
    {("internal", "falling_sku"): CAP - 2}, CAP)
check("คิวเหลือที่ 2 → รับ 2 ข้าม 2", (len(kept), len(over)), (2, 2))
check("รับตัวคะแนนสูงก่อน ไม่ใช่ตัดท้ายตามลำดับ",
      sorted(r["score"] for r in kept), [4.2, 4.9])

# กลุ่มอื่นต้องไม่โดนหางเลขจากกลุ่มที่เต็ม
kept, over = ic.cap_by_subtype(
    [row("machine_drop", 3.7), row("การ์ดเกม TCG ไทย", 2.0, source="news")],
    {("internal", "machine_drop"): CAP}, CAP)
check("กลุ่มที่ยังไม่เต็มยังผ่านได้", [r["subtype"] for r in kept], ["การ์ดเกม TCG ไทย"])

# ของในรอบเดียวกันต้องนับกันเองด้วย ไม่ใช่ดูแค่คิวเดิม
kept, over = ic.cap_by_subtype([row("restock", i) for i in range(CAP + 3)], {}, CAP)
check("รอบเดียวล้นเอง → ตัดให้เหลือเท่า cap", (len(kept), len(over)), (CAP, 3))

kept, over = ic.cap_by_subtype([row("machine_drop", 3.7), row("machine_drop", 3.5)],
                               {("internal", "machine_drop"): 99}, 0)
check("cap = 0 → ปิดด่าน ผ่านหมด", (len(kept), len(over)), (2, 0))

src = [row("hot_sku", 1.0), row("news_a", 9.0, source="news"), row("hot_sku", 2.0)]
kept, _ = ic.cap_by_subtype(src, {}, CAP)
check("คืนของตามลำดับเดิม ไม่ใช่ลำดับคะแนน", [r["score"] for r in kept], [1.0, 9.0, 2.0])

kept, over = ic.cap_by_subtype([row(None, 1.0), row(None, 2.0)], {("internal", None): CAP}, CAP)
check("subtype ว่างไม่ทำให้ล้ม (ไอเดียเก่าก่อน migration 061)", (len(kept), len(over)), (0, 2))


# ── 2. เส้นทางจริง — ผ่าน save() ที่อ่านคิวจริงจาก DB ─────────────────────
print("\n── เส้นทางจริง save(..., dry_run=True) ──")

queue = {}
for r in data.sb_get("marketing_ideas?select=source,subtype,status"):
    if r.get("status") == "new":
        k = (r.get("source"), r.get("subtype"))
        queue[k] = queue.get(k, 0) + 1

if not queue:
    print("  ⚠️  คิวว่าง — ข้ามท่อนนี้ (ต้องมีของค้างในคิวถึงจะพิสูจน์การนับข้ามรอบได้)")
else:
    (src_name, sub), n_queued = max(queue.items(), key=lambda kv: kv[1])
    print(f"  คิวจริงกลุ่มที่แน่นสุด: {src_name}/{sub} = {n_queued} ชิ้น · cap = {CAP}")

    fake = [row(sub, 9.0 - i, source=src_name, key=f"test:cap:{sub}:{i}") for i in range(CAP + 3)]
    fake.append(row("__ไม่มีในคิว__", 5.0, source="manual", key="test:cap:fresh"))

    buf = io.StringIO()
    with redirect_stdout(buf):
        ic.save(fake, CFG, dry_run=True)
    out = buf.getvalue()
    print("\n".join("      " + ln for ln in out.strip().splitlines()))

    want_kept = max(0, CAP - n_queued) + 1          # +1 = ตัวที่ subtype ยังไม่มีในคิว
    m = re.search(r"ใหม่ (\d+)", out)
    check("save() ตัดของเกินก่อนเขียนจริง", int(m.group(1)) if m else None, want_kept)
    check("มีบรรทัดบอกว่าข้ามอะไรไปบ้าง (ห้ามข้ามแบบเงียบ)", "🚧" in out, True)
    check("บอกจำนวนที่ข้าม", f"ข้าม {CAP + 3 - max(0, CAP - n_queued)} ชิ้น" in out, True)

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
