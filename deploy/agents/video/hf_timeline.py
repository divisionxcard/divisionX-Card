"""ห้องตัดต่อ — ประกอบคลิปจากไทม์ไลน์ (plan.engine = "timeline") · สัญญาข้อมูล: TIMELINE.md

23 ต.ค. 2026 · เจ้าของ: "ทำหน้าโรงงานวิดีโอให้ใช้งานง่ายกว่านี้ รองรับการตัดต่อวีดีโอได้ทุกรูปแบบ
พร้อมทั้งรองรับการอัปโหลดไฟล์วีดีโอจากภายนอก (เหมือนคลิป Flow ที่ส่งให้) แล้วเอามาตัดต่อได้ด้วย"

ใช้ของเดิมให้มากที่สุด:
    hf_render.prepare    เสียงพากย์ (TTS + คำอ่าน + ย่อช่วงเงียบ) → เวลารายคำ (whisper) → ท่อนซับ
    hf_render.resolve_image  ไฟล์จาก Storage (https://) · sku: รูปซอง · assets/…
    hf_render._npx       lint + render ด้วย HyperFrames รุ่นที่ปักไว้
    sound.master         เพลง (ลดเสียงหลบคำพูด) + เอฟเฟกต์ + ความดัง −14 LUFS

รัน:  python -m agents.video.hf_timeline --plan plan.json [--out clip.mp4] [--no-check]
"""
import argparse
import html
import json
import pathlib
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from . import config, sound
from . import hf_render as R

MAX_CLIPS, MAX_OVERLAYS, MAX_SECONDS = 40, 40, 180
STYLES = ("bold", "gold", "neon", "box")
# 26 ต.ค. 2026 · เจ้าของ: "เหมือนเอาภาพนิ่งมาตัดเรียงต่อกัน อยากให้ออกแบบอนิเมชั่นและแบล็คกราวให้สวยงามตามเนื้อหา และขยับได้"
#   ท่าของทับ +6 · รอยต่อ +5 · กล้อง +6 · ชั้นเอฟเฟกต์ต่อฉาก 11 แบบ · ฉากที่ AI ออกแบบ (gen:) หาไฟล์จริงตอนเรนเดอร์
ANIMS = ("pop", "slide", "fade", "float", "none", "punch", "type", "words", "slam", "spin", "tilt")
# เย็น 26 ต.ค.: เจ้าของ "ยังไม่ค่อยว้าว" → เลือก "ผสมทั้ง 3 แนว" จากต้นแบบ — beat (A) · dissolve + film (C) · kind "hero" (B)
TRANSITIONS = ("cut", "flash", "zoom", "whip", "bolt", "glitch", "wipe", "ring", "dissolve")
MOTIONS = ("none", "zoomin", "zoomout", "panleft", "panright", "rise", "drift", "push", "shake", "beat")
LAYERS = ("none", "motes", "sparks", "stars", "rays", "speed", "bolts", "rings", "sweep", "bubbles", "confetti", "aurora", "film")
DISSOLVE = 0.5                                     # คลิปก่อนหน้าค้างต่อให้ละลายภาพทับ (วินาที)
TINTS = {"cyan": "#59d2ff", "gold": "#ffc24a", "purple": "#b06bff", "red": "#ff4d5e", "green": "#4dffa6",
         "orange": "#ff8a3d", "pink": "#ff6bd5", "white": "#e8f7ff"}
GEN_KINDS = ("paint", "footage")
PAINT_BUDGET = 3                                   # ภาพวาดใหม่ต่อคลิป — เจ้าของเลือก "ไม่เกิน ~5 บาท/คลิป" (26 ต.ค.)
FITS = ("cover", "contain")
TAIL = 0.6                                         # ค้างท้ายหลังเสียงพากย์จบ
LOGO = "assets/brand/logo-white.png"
BRAND = {"DivisionX Card", "DivisionX", "@divisionxcard"}


def _log(msg):
    print(f"[tl] {msg}", flush=True)


def _num(v, lo, hi, d):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return d
    return d if x != x else max(lo, min(hi, x))            # x != x = NaN


def _pick(v, opts, d):
    return v if v in opts else d


def _line(v):
    """เลขบรรทัดบทพากย์ (0 = บรรทัดแรก) · ไม่ใช่จำนวนเต็ม 0–59 = ไม่ผูก"""
    return v if isinstance(v, int) and not isinstance(v, bool) and 0 <= v < 60 else None


def anchor(tl, timing, total):
    """ผูกชิ้นงานกับบรรทัดเสียงพากย์ — ตั้งเวลาตามจังหวะพูดจริงหลังทำเสียง (26 ต.ค. 2026 · สตอรี่บอร์ด)

    ทำไม: ความยาวเสียงรู้ได้หลัง TTS เท่านั้น สตอรี่บอร์ดเดาเวลาไว้ล่วงหน้า (ตัวอักษร/วินาที) จะคลาดสะสม
    จนตัวหนังสือขึ้นก่อน/หลังเสียงพูดเป็นวินาที
    คลิปหลัก: ชิ้นที่มี line ยาวถึงเวลาเริ่มบรรทัดของชิ้นถัดไป (ชิ้นท้าย = ท้ายเสียง + ค้างท้าย) — เฉพาะชิ้นที่ต่อกันและ
    เลขบรรทัดเรียงขึ้น · ไม่เรียง (คนลากสลับ) = ไม่แตะคลิปหลักเลย (ใช้เวลาเดิมในร่าง)
    ของทับ: เริ่มตอนบรรทัด line เริ่มพูด · จบตอนบรรทัดถัดจาก line+span-1 เริ่ม (ค้างระหว่างเว้นวรรค)
    คืนจำนวนชิ้นที่ตั้งเวลาใหม่
    """
    st = {int(t["index"]): float(t["start"]) for t in (timing or []) if "start" in t}
    if not st:
        return 0
    end_all = round(total + TAIL, 3)
    n = 0
    clips = tl["clips"]
    # ช็อตย่อย (จังหวะไวรัล): หลายคลิปต่อกันผูกบรรทัดเดียวกัน = กลุ่มเดียว → แบ่งเวลาของบรรทัดตามสัดส่วนความยาวในร่าง
    groups = []
    for i, c in enumerate(clips):
        if groups and c.get("line") is not None and c.get("line") == clips[groups[-1][-1]].get("line"):
            groups[-1].append(i)
        else:
            groups.append([i])
    lines = [clips[g[0]].get("line") for g in groups if clips[g[0]].get("line") in st]
    if lines and all(b > a for a, b in zip(lines, lines[1:])):
        t = 0.0
        for gi, g in enumerate(groups):
            head = clips[g[0]]
            if head.get("line") in st:
                nxt = clips[groups[gi + 1][0]] if gi + 1 < len(groups) else None
                target = (st[nxt["line"]] if nxt is not None and nxt.get("line") in st
                          else end_all if nxt is None else None)
                if target is not None:
                    d = max(0.4 * len(g), target - t)
                    weights = [max(0.1, clip_len(clips[i])) for i in g]
                    for i, w in zip(g, weights):
                        c = clips[i]
                        part = round(max(0.4, d * w / sum(weights)), 3)
                        if c["kind"] == "video":
                            c["out"] = round(c["in"] + part * c["speed"], 3)
                        else:
                            c["dur"] = min(60.0, part)
                        n += 1
            t += sum(clip_len(clips[i]) for i in g)
    elif lines:
        _log("⚠️ เลขบรรทัดของคลิปหลักไม่เรียง (ลากสลับในห้องตัดต่อ?) — ใช้เวลาตามร่าง ไม่ผูกกับเสียง")
    last_line = max(st)
    for o in tl["overlays"]:
        ln = o.get("line")
        if ln not in st:
            continue
        last = min(ln + max(1, int(o.get("span") or 1)) - 1, last_line)
        o["start"] = 0.0 if ln == 0 else round(st[ln], 3)
        o["end"] = round(st[last + 1], 3) if (last + 1) in st else end_all
        n += 1
    return n


def _gen(v):
    """สเปกฉากที่ AI ออกแบบ (สตอรี่บอร์ด) — พร้อมต์ภาพ/วิดีโอ (อังกฤษ) · คำค้นฟุตเทจ · แท็ก · ค่าย · คำอธิบายไทย"""
    if not isinstance(v, dict):
        return None
    s = lambda k, n: str(v.get(k) or "").strip()[:n]
    tags = [str(t).strip().lower()[:24] for t in (v.get("tags") or []) if str(t).strip()][:6] if isinstance(v.get("tags"), list) else []
    g = {"kind": v.get("kind") if v.get("kind") in GEN_KINDS else "footage", "prompt": s("prompt", 700), "video": s("video", 700),
         "query": s("query", 60), "note": s("note", 160), "franchise": s("franchise", 8) or None, "tags": tags}
    return g if (g["prompt"] or g["query"]) else None


def normalize(tl):
    """ตรวจ/ล้างไทม์ไลน์ (ฝั่ง runner ตรวจซ้ำจาก route) → dict ที่ปลอดภัยต่อการประกอบ"""
    tl = tl if isinstance(tl, dict) else {}
    clips = []
    for c in (tl.get("clips") or [])[:MAX_CLIPS]:
        if not isinstance(c, dict) or not isinstance(c.get("src"), str) or not c["src"].strip():
            continue
        kind = "image" if c.get("kind") == "image" else "video"
        row = {"id": str(c.get("id") or f"c{len(clips) + 1}")[:24], "kind": kind, "src": c["src"].strip(),
               "fit": _pick(c.get("fit"), FITS, "cover" if kind == "video" else "contain"),
               "fx": _num(c.get("fx"), 0, 1, 0.5), "fy": _num(c.get("fy"), 0, 1, 0.5),
               "zoom": _num(c.get("zoom"), 1, 2, 1.0),
               "transition": _pick(c.get("transition"), TRANSITIONS, "cut"),
               "layer": _pick(c.get("layer"), LAYERS, "none"), "tint": _pick(c.get("tint"), TINTS, "cyan")}
        g = _gen(c.get("gen"))
        if g:
            row["gen"] = g
        if row["src"].startswith("hero:"):              # ฉากเปิดตัวซอง — src "hero:<รหัสซอง>"
            if not re.fullmatch(r"hero:[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}", row["src"]):
                continue
            kind = row["kind"] = "hero"
        if c.get("hype") is True:
            row["hype"] = True                             # ซับช่วงคลิปนี้เป็นคำยักษ์กลางจอ (จังหวะไวรัล)
        if row["src"].startswith("gen:"):
            if not g:
                continue
            kind = row["kind"] = "image"                   # ยังไม่มีไฟล์ — ใช้ความยาวแบบรูป (dur) จนกว่าจะหาไฟล์ได้ตอนเรนเดอร์
        if kind == "video":
            row["in"] = _num(c.get("in"), 0, 36000, 0.0)
            row["out"] = _num(c.get("out"), row["in"] + 0.2, 36000, row["in"] + 5.0)
            row["speed"] = _num(c.get("speed"), 0.25, 4, 1.0)
            row["volume"] = _num(c.get("volume"), 0, 2, 1.0)
            row["motion"] = _pick(c.get("motion"), MOTIONS, "none")
        else:
            row["dur"] = _num(c.get("dur"), 0.3, 60, 3.0)
            row["motion"] = _pick(c.get("motion"), MOTIONS, "zoomin" if kind == "image" else "none")
        if _line(c.get("line")) is not None:
            row["line"] = c["line"]
        clips.append(row)
    overlays = []
    for o in (tl.get("overlays") or [])[:MAX_OVERLAYS]:
        if not isinstance(o, dict):
            continue
        typ = o.get("type")
        if typ not in ("text", "image", "logo"):
            continue
        row = {"id": str(o.get("id") or f"o{len(overlays) + 1}")[:24], "type": typ,
               "start": _num(o.get("start"), 0, MAX_SECONDS, 0.0), "end": _num(o.get("end"), -1, MAX_SECONDS, -1),
               "x": _num(o.get("x"), 0, 1, 0.5), "y": _num(o.get("y"), 0, 1, 0.5),
               "anim": _pick(o.get("anim"), ANIMS, "pop")}
        if typ == "text":
            text = str(o.get("text") or "").strip()[:200]
            if not text:
                continue
            row.update(text=text, size=_num(o.get("size"), 28, 220, 90), style=_pick(o.get("style"), STYLES, "bold"),
                       color=o["color"] if isinstance(o.get("color"), str) and len(o["color"]) <= 9
                       and o["color"].startswith("#") else "#ffffff")
        elif typ == "image":
            if not isinstance(o.get("src"), str) or not o["src"].strip():
                continue
            row.update(src=o["src"].strip(), w=_num(o.get("w"), 0.05, 1, 0.45))
        else:
            row.update(x=_num(o.get("x"), 0, 1, 0.88), y=_num(o.get("y"), 0, 1, 0.05), w=_num(o.get("w"), 0.05, 0.5, 0.14),
                       anim=_pick(o.get("anim"), ANIMS, "none"))
        if _line(o.get("line")) is not None:
            row["line"] = o["line"]
            if isinstance(o.get("span"), int) and not isinstance(o.get("span"), bool) and o["span"] > 1:
                row["span"] = min(o["span"], 10)
        overlays.append(row)
    v = tl.get("voice") if isinstance(tl.get("voice"), dict) else None
    voice = None
    if v and str(v.get("script") or "").strip():
        voice = {"script": str(v["script"]).strip()[:3000], "voice": v.get("voice"), "style": v.get("style"),
                 "tts_model": v.get("tts_model")}
    m = tl.get("music") if isinstance(tl.get("music"), dict) else None
    music = {"src": str(m["src"]), "volume": _num(m.get("volume"), 0, 1, sound.MUSIC_VOL)} if m and m.get("src") else None
    return {"clips": clips, "overlays": overlays, "voice": voice,
            "captions": bool((tl.get("captions") or {}).get("on", True)) if isinstance(tl.get("captions"), dict) else True,
            "music": music, "sfx": tl.get("sfx") is not False}


def clip_len(c):
    return round((c["out"] - c["in"]) / c["speed"], 3) if c["kind"] == "video" else c["dur"]


def _hold(clips, i):
    """สื่อของคลิป i ค้างต่ออีกเท่าไร — คลิปถัดไปละลายภาพทับ (dissolve) ต้องเห็นภาพเดิมอยู่ข้างใต้"""
    return DISSOLVE if i + 1 < len(clips) and clips[i + 1].get("transition") == "dissolve" else 0.0


def _clip_tags(clips, starts):
    """แทร็กหลัก — กล่องห่อ (ไม่จับเวลา) + สื่อ (จับเวลา) · contain = สำเนาเบลอเต็มจอด้านหลัง"""
    out = []
    for i, (c, t0) in enumerate(zip(clips, starts)):
        d = clip_len(c) + _hold(clips, i)
        if c["kind"] == "hero":
            out.append(f'      <div id="c-{i}" class="tl-clip" aria-hidden="true" data-layout-ignore>\n'
                       f'        <div id="h-{i}" class="clip tl-hero" data-start="{t0:.3f}" data-duration="{d:.3f}" data-track-index="2" '
                       f'style="--t: {TINTS[c.get("tint", "gold")]};"></div>\n      </div>')
            continue
        style = (f'object-fit: {c["fit"]}; object-position: {c["fx"] * 100:.1f}% {c["fy"] * 100:.1f}%;')
        src = html.escape(c["local"], quote=True)
        common = f'data-start="{t0:.3f}" data-duration="{d:.3f}"'
        if c["kind"] == "video":
            # ค้างต่อให้ละลายภาพ: แค่ยืด data-duration (d) — เกินท้ายช่วงที่ตัดไว้ = ค้างเฟรมสุดท้าย 0.5 วิใต้ภาพใหม่
            # ห้ามแก้ c["out"] ตรงนี้: ชั้นเอฟเฟกต์ (_layer_tags) คำนวณความยาวจาก clip_len ทีหลัง → ซ้อนทับฉากถัดไป
            media = (f'data-media-start="{c["in"]:.3f}" data-playback-rate="{c["speed"]}"')
            audio = (f'data-has-audio="true" data-volume="{c["volume"]:.2f}"' if c["volume"] > 0.001 else "muted")
            fill = (f'<video id="vf-{i}" class="clip tl-fill" src="{src}" muted playsinline {common} {media} '
                    f'data-track-index="1"></video>' if c["fit"] == "contain" else "")
            main = (f'<video id="v-{i}" class="clip tl-media" style="{style}" src="{src}" playsinline {audio} '
                    f'{common} {media} data-track-index="2"></video>')
        else:
            # ⚠️ รูปนิ่ง: พื้นเบลอต้องเป็นไฟล์ที่เบลอไว้แล้ว (c["fill"]) — <img> ที่ใส่ CSS filter: blur ทำให้
            #    ของทับที่เป็นรูป (โลโก้) หายตอนเรนเดอร์จริง ทั้งที่ snapshot/พรีวิวเห็นปกติ (ทดสอบ 23 ต.ค.)
            #    วิดีโอแบบ contain ใช้ CSS blur ได้ (ทดสอบแล้วโลโก้ไม่หาย)
            fill = (f'<img id="vf-{i}" class="clip tl-fill-baked" src="{html.escape(c["fill"], quote=True)}" alt="" '
                    f'{common} data-track-index="1" />' if c["fit"] == "contain" and c.get("fill") else "")
            main = f'<img id="v-{i}" class="clip tl-media" style="{style}" src="{src}" alt="" {common} data-track-index="2" />'
        out.append(f'      <div id="c-{i}" class="tl-clip" aria-hidden="true" data-layout-ignore>\n'
                   f'        {fill}\n        {main}\n      </div>')
    return "\n".join(out)


def _layer_tags(clips, starts):
    """ชั้นเอฟเฟกต์ของแต่ละฉาก — จับเวลาเท่าคลิปหลักชิ้นนั้น (ชิ้นในสร้างด้วยสคริปต์ในเทมเพลต)"""
    out = []
    for i, (c, t0) in enumerate(zip(clips, starts)):
        if c.get("layer", "none") == "none":
            continue
        out.append(f'      <div id="l-{i}" class="clip tl-fx" data-start="{t0:.3f}" data-duration="{clip_len(c):.3f}" '
                   f'data-track-index="3" style="--t: {TINTS[c.get("tint", "cyan")]};" aria-hidden="true" data-layout-ignore></div>')
    return "\n".join(out)


def _resolve_gen(tl, plan):
    """ฉากที่ AI ออกแบบไว้ (src "gen:paint" / "gen:footage") → ไฟล์จริง ก่อนโหลดสื่อ — ต้องรันหลัง anchor (รู้ความยาวฉากจริงแล้ว)

    ลำดับ (เจ้าของเลือก 26 ต.ค.: "ไม่เกิน ~5 บาท/คลิป"):
      paint   → ภาพในคลังที่ตรงเรื่อง (พร้อมต์เดียวกัน/แท็กตรง · ฟรี) → วาดใหม่ถ้ายังไม่เกิน PAINT_BUDGET → ฟุตเทจ
      footage → ฟุตเทจจริงฟรีจาก Pixabay ตามคำค้น (ไม่เจอ = คำค้นสำรองของค่าย) → ภาพในคลัง
    หาไม่ได้เลย = ภาพฉากตู้ในเทมเพลต (คลิปไม่ล้มเพราะหาภาพไม่ได้)
    คืน [(index, ผลลัพธ์)] สำหรับเขียนกลับร่างห้องตัดต่อ
    """
    from . import hf_bg
    todo = [(i, c) for i, c in enumerate(tl["clips"]) if c["src"].startswith("gen:")]
    if not todo:
        return []
    budget = int(plan.get("paint_budget", PAINT_BUDGET))
    rng = random.Random(f"gen:{plan.get('project')}")
    painted, used_lib, used_px, done = 0, set(), set(), []
    same = {}                                              # ช็อตย่อยของฉากเดียวกัน (จังหวะไวรัล) → ไฟล์เดียวกัน
    for i, c in todo:
        g = c.get("gen") or {}
        dur = clip_len(c)
        sig = (c["src"], g.get("prompt"), g.get("query"))
        got = dict(same[sig]) if sig in same else None
        if got and got["kind"] == "video":                 # วิดีโอ: ช็อตย่อยถัดไปเริ่มต่อจากช่วงก่อน (ไม่เล่นซ้ำท่อนเดิม)
            got["in"] = round(got["out"], 3)
            got["out"] = round(got["in"] + dur * got["speed"], 3)
        want = [g["kind"], "footage" if g["kind"] == "paint" else "library"]
        for how in want + ["library"]:
            if got:
                break
            if how == "paint":
                hit = hf_bg.library_find(g, used_lib)
                if hit:
                    got = {"kind": "image", "src": hit["url"], "via": "คลังภาพ"}
                    used_lib.add(hit["key"])
                elif painted < budget:
                    url = hf_bg.paint_scene(g, plan.get("project") or "clip")
                    if url:
                        painted += 1
                        got = {"kind": "image", "src": url, "via": "วาดใหม่"}
            elif how == "footage":
                pick = hf_bg.footage_clip(g, rng, used_px, plan.get("project") or "clip", i)
                if pick:
                    used_px.add(pick["id"])
                    secs = float(pick.get("seconds") or 8)
                    speed = max(0.5, min(1.0, secs / max(0.3, dur)))
                    got = {"kind": "video", "src": pick["url"], "in": 0.0, "out": round(min(secs, dur * speed), 3),
                           "speed": round(speed, 3), "volume": 0.0, "via": f"ฟุตเทจ ({pick['query']})"}
            elif how == "library":
                hit = hf_bg.library_find(dict(g, prompt=""), used_lib, loose=True)
                if hit:
                    got = {"kind": "image", "src": hit["url"], "via": "คลังภาพ (ใกล้เคียง)"}
                    used_lib.add(hit["key"])
        if not got:
            got = {"kind": "image", "src": "assets/machine-scene.jpg", "via": "ภาพสำรอง"}
        same.setdefault(sig, got)
        c["kind"], c["src"] = got["kind"], got["src"]
        if got["kind"] == "video":
            c.update(fit="cover", **{k: got[k] for k in ("in", "out", "speed", "volume")})
        else:
            c["fit"] = "cover"
            c["dur"] = dur
        _log(f"ฉาก {i + 1}: {got['via']}" + (f" — {g.get('note')}" if g.get("note") else ""))
        done.append((i, got))
    _log(f"ฉากที่ AI ออกแบบ {len(todo)} ฉาก · วาดใหม่ {painted} ภาพ (~{painted * hf_bg.AI_COST_USD * 35:.1f} บาท)")
    return done


def _writeback(plan, tl, done):
    """ไฟล์ที่หาได้ → ร่างห้องตัดต่อ (R2 video-edits/<edit_id>.json) — เปิดร่างมาเห็นภาพจริง · เรนเดอร์ซ้ำไม่ต้องหา/วาดใหม่"""
    eid = plan.get("edit_id")
    if not done or not isinstance(eid, str) or not eid.startswith("e-"):
        return
    try:
        from .. import r2
        key = f"video-edits/{eid}.json"
        doc = json.loads(r2.get_bytes(key).decode("utf-8"))
        by_id = {c.get("id"): c for c in (doc.get("timeline") or {}).get("clips") or []}
        n = 0
        for i, got in done:
            if got["src"].startswith("assets/"):
                continue
            row = by_id.get(tl["clips"][i]["id"])
            if not row or not str(row.get("src", "")).startswith("gen:"):
                continue                                   # คนแก้ฉากนี้ไปแล้ว — ไม่ทับ
            row["src"], row["kind"] = got["src"], got["kind"]
            if got["kind"] == "video":
                row.update({k: got[k] for k in ("in", "out", "speed", "volume")})
                row.pop("dur", None)
            row["fit"] = "cover"
            n += 1
        if n:
            r2.put_bytes(json.dumps(doc, ensure_ascii=False).encode("utf-8"), key, "application/json")
            _log(f"เขียนไฟล์ที่หาได้กลับร่างห้องตัดต่อ {n} ฉาก")
    except Exception as e:
        _log(f"⚠️ เขียนกลับร่างไม่ได้ ({str(e)[:100]}) — คลิปนี้ไม่กระทบ")


def _has_audio(path):
    out = subprocess.run([config.ffmpeg_bin("ffprobe"), "-v", "error", "-select_streams", "a", "-show_entries",
                          "stream=index", "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout.strip()
    return bool(out)


def _prep_video(proj, raw_rel, c, name):
    """ตัดเฉพาะช่วงที่ใช้ + เข้ารหัสใหม่ก่อนประกอบ (23 ต.ค. 2026 · เจอตอนเรนเดอร์ไทม์ไลน์จากหน้าเว็บจริง)

    - keyframe ทุก 1 วิ: ไฟล์จากมือถือ/Flow มี keyframe ห่าง 4–8 วิ → HyperFrames เตือนว่าข้ามช่วงแล้วภาพค้าง
    - ย่อเท่าที่จอใช้จริง: ไม่เกินขนาดที่คลุมจอ 1080×1920 ได้ (ไม่ขยาย) · ไฟล์ 4K เหลือเล็กลงมาก
    - ไม่มีแทร็กเสียง → ปิดเสียงคลิปนี้: data-has-audio บนไฟล์ที่ไม่มีเสียง ทำให้ HyperFrames ปฏิเสธทั้งงาน
      ("composition asset(s) do not match their authored media element type (expected: audio)")
    คืน path ใหม่ใน assets/ · แก้ c["in"]/c["out"] ให้นับจากต้นไฟล์ใหม่ · ล้ม = ใช้ไฟล์เดิมตามช่วงเดิม
    """
    src = proj / raw_rel
    audio = _has_audio(src) and c["volume"] > 0.001
    if not audio:
        c["volume"] = 0.0
    seg = round(c["out"] - c["in"], 3)
    dst = proj / "assets" / f"{name}-seg.mp4"
    k = "min(1\\,max(1080/iw\\,1920/ih))"
    cmd = [config.ffmpeg_bin(), "-y", "-v", "error", "-ss", f"{c['in']:.3f}", "-i", str(src), "-t", f"{seg:.3f}",
           "-vf", f"scale=trunc(iw*{k}/2)*2:trunc(ih*{k}/2)*2,fps=30",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
           "-g", "30", "-keyint_min", "30", "-movflags", "+faststart"]
    cmd += ["-c:a", "aac", "-b:a", "160k", "-ar", "48000"] if audio else ["-an"]
    r = subprocess.run(cmd + [str(dst)], capture_output=True, text=True)
    if r.returncode != 0 or not dst.exists():
        _log(f"⚠️ เตรียมคลิป {name} ไม่สำเร็จ ({(r.stderr or '').strip()[-160:]}) — ใช้ไฟล์เดิม")
        return raw_rel
    got = R._media_seconds(dst)
    c["in"], c["out"] = 0.0, round(min(seg, got) if got > 0.2 else seg, 3)
    return f"assets/{dst.name}"


def _bake_fill(proj, rel, name):
    """พื้นหลังเบลอของรูปนิ่งแบบ contain — เบลอ+หรี่ไว้ในไฟล์เลย (ไม่พึ่ง CSS filter)"""
    try:
        from PIL import Image, ImageEnhance, ImageFilter
        im = Image.open(proj / rel).convert("RGBA")
        bg = Image.new("RGBA", im.size, (3, 16, 42, 255))
        bg.alpha_composite(im)
        w, h = 540, 960                                   # ครึ่งขนาดจอ — เบลออยู่แล้ว ไม่ต้องคม · ไฟล์เล็ก
        sc = max(w / bg.width, h / bg.height) * 1.15
        bg = bg.convert("RGB").resize((max(1, int(bg.width * sc)), max(1, int(bg.height * sc))))
        x, y = (bg.width - w) // 2, (bg.height - h) // 2
        bg = bg.crop((x, y, x + w, y + h)).filter(ImageFilter.GaussianBlur(24))
        bg = ImageEnhance.Brightness(bg).enhance(0.55)
        out = proj / "assets" / f"{name}-fill.jpg"
        bg.save(out, quality=82)
        return f"assets/{out.name}"
    except Exception as e:
        _log(f"⚠️ ทำพื้นเบลอไม่ได้ ({str(e)[:80]}) — ใช้พื้นกรมท่าแทน")
        return None


def _aspect(path):
    try:
        from PIL import Image
        with Image.open(path) as im:
            return max(1, im.width), max(1, im.height)
    except Exception:
        return 1, 1


def _overlay_tags(overlays, proj):
    out = []
    for i, o in enumerate(overlays):
        d = max(0.3, o["end"] - o["start"])
        pos = f'left: {o["x"] * 1080:.0f}px; top: {o["y"] * 1920:.0f}px;'
        common = f'id="o-{i}" data-start="{o["start"]:.3f}" data-duration="{d:.3f}" data-track-index="{4 + i % 3}"'
        if o["type"] == "text":
            body = html.escape(o["text"])
            out.append(f'      <div {common} class="clip ov ov-text st-{o["style"]}" '
                       f'style="{pos} font-size: {o["size"]:.0f}px; --c: {html.escape(o["color"], quote=True)};">'
                       f'<span class="ov-in">{body}</span></div>')
        else:
            # ⚠️ ภาพทับต้องเป็นกล่องที่ใช้ภาพเป็นพื้นหลัง ไม่ใช่ <img> — <img> ของทับหายตอนเรนเดอร์จริงเมื่อแทร็กหลัก
            #    เป็นรูปนิ่งแบบ contain (snapshot ยังเห็นปกติ) · ทดสอบ 23 ต.ค.: <img> หาย · background-image ขึ้นครบ
            cls = "ov-img" if o["type"] == "image" else "ov-logo"
            w, h = _aspect(proj / o["local"])
            url = html.escape(o["local"], quote=True)
            out.append(f'      <div {common} class="clip ov {cls}" style="{pos} width: {o["w"] * 1080:.0f}px;">'
                       f'<div class="ov-in ov-pic" style="aspect-ratio: {w} / {h}; background-image: url({url});">'
                       f'</div></div>')
    return "\n".join(out)


def _captions(proj, chunks, hype=()):
    """ซับ · hype = ช่วงเวลา [(เริ่ม, จบ)] ของคลิปจังหวะไวรัล → ท่อนที่เริ่มในช่วงนั้นเป็นคำยักษ์กลางจอ สลับสีขาว/ทอง"""
    caps = []
    n_hype = 0
    for k, c in enumerate(chunks):
        s, e = round(float(c["start"]), 3), round(float(c["end"]), 3)
        big = any(a - 0.05 <= s < b for a, b in hype)
        cls = "clip cap"
        if big:
            cls += " hype" + (" alt" if n_hype % 2 else "")
            n_hype += 1
        caps.append(f'        <div id="cap-{k + 1}" class="{cls}" data-start="{s}" data-duration="{max(0.3, e - s):.3f}" '
                    f'data-track-index="0"><span class="cap-text">{R._caption_html(c["text"], set(), BRAND)}</span></div>')
    tpl = (R.TEMPLATE / "scaffold" / "captions.template.html").read_text(encoding="utf-8")
    (proj / "compositions" / "captions.html").write_text(tpl.replace("{{CAPTIONS}}", "\n".join(caps)), encoding="utf-8")


def _music_path(music, work):
    """lib:<key> = เพลงในคลังที่กรอกใบอนุญาตแล้ว · https:// = ไฟล์ที่ผู้ใช้อัปโหลดเอง (ผู้ใช้รับรองสิทธิ์)"""
    if not music:
        return None
    src = music["src"]
    if src.startswith("lib:"):
        from . import music as M
        hit = next((t for t in M.list_tracks() if t.get("key") == src[4:]), None)
        return hit["path"] if hit else None
    if src.startswith("https://"):
        ext = pathlib.Path(urllib.parse.urlparse(src).path).suffix or ".mp3"
        dst = work / f"music{ext}"
        from .. import r2                                    # ไฟล์ของเรา → ดึงจาก R2 ตรง (23 ต.ค. 2026)
        key = r2.key_of(src)
        if key and r2.configured():
            r2.download(key, dst)
        else:
            with urllib.request.urlopen(src, timeout=120) as r:
                dst.write_bytes(r.read())
        return str(dst)
    return None


def build_video(plan, out_mp4=None, check=True):
    project = plan.get("project") or "edit"
    work = config.work_dir(project)
    (work / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    out_mp4 = pathlib.Path(out_mp4 or (work / f"{project}.mp4")).resolve()
    tl = normalize(plan.get("timeline"))
    if not tl["clips"]:
        raise ValueError("ไทม์ไลน์ไม่มีคลิปในแทร็กหลักเลย — ต้องมีอย่างน้อย 1 คลิป/รูป")

    # ── 1. เสียงพากย์ → เวลารายคำ → ท่อนซับ (ของเดิมของ hf_render ทั้งหมด)
    chunks, voice_total, wav = [], 0.0, None
    if tl["voice"]:
        vp = {"script": tl["voice"]["script"], "voice": tl["voice"]["voice"], "voice_style": tl["voice"]["style"],
              "tts_model": tl["voice"]["tts_model"] or plan.get("tts_model"), "whisper": plan.get("whisper", "large-v3-turbo")}
        _segs, wav, voice_total, _timing, _words, chunks = R.prepare(vp, work)
        _log(f"เสียงพากย์ {voice_total:.1f} วิ · ซับ {len(chunks)} ท่อน")
        k = anchor(tl, _timing, voice_total)
        if k:
            _log(f"ผูกกับบรรทัดเสียงพากย์ {k} ชิ้น (ตั้งเวลาตามจังหวะพูดจริง)")

    # ── 2. โปรเจกต์ = ก๊อปเทมเพลต (ฟอนต์ · โลโก้ · ฉากซับ) แล้วโหลดสื่อลง assets/
    done = _resolve_gen(tl, plan)
    _writeback(plan, tl, done)
    proj = work / "hf"
    if proj.exists():
        shutil.rmtree(proj)
    shutil.copytree(R.TEMPLATE, proj, ignore=shutil.ignore_patterns(
        "renders", ".hyperframes", "node_modules", "index.html", "voice.wav", ".thumbnails", "captions.html"))
    t0 = time.time()
    fetched = {}                                            # ไฟล์เดียวกันหลายชิ้น (หั่นคลิป) → โหลดครั้งเดียว
    for i, c in enumerate(tl["clips"]):
        if c["kind"] == "hero":                            # ฉากเปิดตัวซอง: รูปซองจริง (sku:) เป็นตัวเอก
            key = "sku:" + c["src"][5:]
            if key not in fetched:
                fetched[key] = R.resolve_image(key, proj, f"src-{len(fetched)}")
            c["local"] = fetched[key]
            continue
        if c["src"] not in fetched:
            fetched[c["src"]] = R.resolve_image(c["src"], proj, f"src-{len(fetched)}")
        c["local"] = fetched[c["src"]]
        if c["kind"] == "image" and c["fit"] == "contain":
            c["fill"] = _bake_fill(proj, c["local"], f"clip-{i}")
        if c["kind"] == "video":
            secs = R._media_seconds(proj / c["local"])
            if secs > 0.3:                                  # ช่วงที่ตัดเกินความยาวไฟล์จริง → หดให้พอดี
                need = clip_len(c)
                c["out"] = min(c["out"], secs)
                c["in"] = min(c["in"], max(0.0, c["out"] - 0.2))
                # ผูกกับเสียงพากย์แต่ไฟล์สั้นกว่าบรรทัด (อัปวิดีโอ 5 วิจาก AI ตัวอื่นมาใส่ฉาก 6 วิ) → เล่นช้าลงให้พอดี
                # ไม่งั้นแทร็กหลักหดแล้วทุกฉากหลังจากนี้ขึ้นก่อนเสียงพูด
                if c.get("line") is not None and clip_len(c) + 0.05 < need:
                    c["speed"] = max(0.25, round((c["out"] - c["in"]) / need, 3))
            c["local"] = _prep_video(proj, c["local"], c, f"clip-{i}")
    used = {c["local"] for c in tl["clips"]}
    for rel in set(fetched.values()) - used:                # ไฟล์ต้นฉบับที่ถูกหั่นใช้แล้ว (อาจหลายร้อย MB) — ไม่ต้องติดไปกับโปรเจกต์
        if rel.startswith("assets/src-"):
            (proj / rel).unlink(missing_ok=True)
    for i, o in enumerate(tl["overlays"]):
        if o["type"] == "image":
            o["local"] = R.resolve_image(o["src"], proj, f"ov-{i}")
        elif o["type"] == "logo":
            o["local"] = LOGO
    _log(f"โหลดสื่อ {len(tl['clips'])} คลิป · ของทับ {len(tl['overlays'])} ชิ้น ({time.time() - t0:.0f} วิ)")

    # ── 3. เวลา: แทร็กหลักต่อกัน · ความยาว = max(แทร็กหลัก, เสียงพากย์ + ค้างท้าย)
    starts, t = [], 0.0
    for c in tl["clips"]:
        starts.append(round(t, 3))
        t += clip_len(c)
    duration = round(min(MAX_SECONDS, max(t, (voice_total + TAIL) if wav else 0.0, 1.0)), 3)
    if t + 0.05 < duration:
        _log(f"⚠️ แทร็กหลักยาว {t:.1f} วิ สั้นกว่าเสียงพากย์ — ท้ายคลิปเป็นพื้นกรมท่า {duration - t:.1f} วิ")
    for o in tl["overlays"]:
        if o["end"] < 0 or o["end"] > duration:
            o["end"] = duration
        o["start"] = min(o["start"], max(0.0, o["end"] - 0.3))

    # ── 4. index.html + ซับ
    if wav:
        shutil.copyfile(wav, proj / "assets" / "voice.wav")
    hype = [(s, s + clip_len(c)) for c, s in zip(tl["clips"], starts) if c.get("hype")]
    _captions(proj, chunks if (tl["captions"] and wav) else [], hype)
    caption_slot = (f'      <div id="captions-slot" data-composition-id="captions" data-composition-src="compositions/captions.html" '
                    f'data-start="0" data-duration="{duration}" data-track-index="7" data-track-kind="captions" '
                    f'data-width="1080" data-height="1920"></div>')
    audio = (f'      <audio id="vo" src="assets/voice.wav" data-start="0" data-duration="{round(voice_total, 3)}" '
             f'data-track-index="9" data-volume="1"></audio>') if wav else ""
    tl_json = {"clips": [{"i": i, "start": s, "dur": clip_len(c), "kind": c["kind"], "zoom": c["zoom"],
                          "motion": c.get("motion", "none"), "transition": c["transition"], "layer": c.get("layer", "none"),
                          **({"pk": c["local"]} if c["kind"] == "hero" else {})}
                         for i, (c, s) in enumerate(zip(tl["clips"], starts))],
               "overlays": [{"i": i, "start": o["start"], "end": o["end"], "anim": o["anim"], "kind": o["type"]}
                            for i, o in enumerate(tl["overlays"])]}
    host = (R.TEMPLATE / "scaffold" / "timeline.template.html").read_text(encoding="utf-8")
    out = (host.replace("{{DURATION}}", str(duration))
               .replace("{{CLIPS}}", _clip_tags(tl["clips"], starts))
               .replace("{{LAYERS}}", _layer_tags(tl["clips"], starts))
               .replace("{{OVERLAYS}}", _overlay_tags(tl["overlays"], proj))
               .replace("{{CAPTIONS_SLOT}}", caption_slot)
               .replace("{{AUDIO}}", audio)
               .replace("{{TL_JSON}}", json.dumps(tl_json).replace("\\", "\\\\").replace("'", "\\'")))
    (proj / "index.html").write_text(out, encoding="utf-8")
    sfx = []
    if tl["sfx"]:
        sfx += [(round(max(0.0, s - 0.2), 3), "whoosh", None) for s in starts[1:]]
        # ฉากเปิดตัวซอง: วูบตอนพุ่งเข้า · ประกายตอนแสงกวาด · ไต่ระดับตอนสะสมพลัง · กระแทกตอนระเบิด (เวลาเดียวกับเทมเพลต)
        for c, s in zip(tl["clips"], starts):
            if c["kind"] == "hero":
                k = max(0.55, min(1.3, clip_len(c) / 4.2))
                sfx += [(round(s + 0.12 * k, 3), "whoosh", None), (round(s + 1.3 * k, 3), "shine", None),
                        (round(s + 2.0 * k, 3), "riser", round(0.8 * k, 3)), (round(s + 2.8 * k, 3), "impact", None)]
        sfx += [(round(o["start"] + 0.02, 3), "pop", None) for o in tl["overlays"] if o["type"] != "logo" and o["start"] > 0.05]
    (work / "sfx.json").write_text(json.dumps([e for e in sfx if 0 <= e[0] < duration]), encoding="utf-8")
    _log(f"ประกอบไทม์ไลน์ {duration:.1f} วิ · เอฟเฟกต์ {len(sfx)} จุด")

    # ── 5. lint + render + ชั้นเสียง (ทางเดียวกับ hf_render.build_video)
    if check:
        code, log = R._npx(["lint", "."], proj, timeout=600)
        if code != 0:
            raise RuntimeError("hyperframes lint ไม่ผ่าน:\n" + "\n".join(log.strip().splitlines()[-12:]))
        _log("lint ผ่าน")
    t0 = time.time()
    code, log = R._npx(["render", ".", "--output", str(out_mp4), "--fps", str(config.FPS),
                        "--quality", plan.get("hf_quality", "standard")], proj)
    if code != 0 or not out_mp4.exists():
        raise RuntimeError("hyperframes render ล้ม:\n" + "\n".join(log.strip().splitlines()[-8:]))
    _log(f"เรนเดอร์เสร็จ {duration:.1f} วิ ({time.time() - t0:.0f} วิ) → {out_mp4}")
    if not plan.get("no_master"):
        raw = out_mp4.with_name(out_mp4.stem + ".raw.mp4")
        try:
            track = _music_path(tl["music"], work)
            shutil.move(str(out_mp4), str(raw))
            info = sound.master(raw, out_mp4, sfx, work, music=track,
                                music_volume=(tl["music"] or {}).get("volume") if track else None)
            raw.unlink(missing_ok=True)
            _log(f"ชั้นเสียง: เอฟเฟกต์ {info['events']} จุด · เพลง {'มี' if track else 'ไม่มี'} → {sound.loudness(out_mp4)} LUFS")
        except Exception as e:
            if not out_mp4.exists() and raw.exists():
                shutil.move(str(raw), str(out_mp4))
            _log(f"⚠️ ชั้นเสียงไม่สำเร็จ ({str(e)[:120]}) — ใช้ไฟล์ที่เรนเดอร์ได้")
    return out_mp4, duration


def main(argv=None):
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="ห้องตัดต่อ — เรนเดอร์ไทม์ไลน์ (plan.engine = timeline)")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out")
    ap.add_argument("--no-check", action="store_true")
    a = ap.parse_args(argv)
    plan = json.loads(pathlib.Path(a.plan).read_text(encoding="utf-8"))
    mp4, d = build_video(plan, a.out, check=not a.no_check)
    print(f"✅ {mp4} · {d:.1f} วิ")


if __name__ == "__main__":
    main()
