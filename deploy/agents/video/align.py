"""หาว่าแต่ละบรรทัดของสคริปต์ถูกพูดที่วินาทีไหน — ด้วย faster-whisper

ทำไมต้องมี:
    เราอ่านทั้งสคริปต์รวดเดียวเพื่อให้น้ำเสียงต่อเนื่อง (ดู segments.speech_text)
    แต่การตัดภาพกับซับต้องรู้เวลาเป็นรายบรรทัด — whisper ถอดเสียงพร้อมเวลารายคำ
    ให้ได้ จึงเอามาเทียบกลับกับข้อความต้นฉบับที่เรารู้อยู่แล้ว

    นี่คือความต่างระหว่าง "ซับตรงเสียงเป๊ะ" กับ "ซับที่เดาเวลาเอา" — อย่างหลัง
    จะเลื่อนสะสมไปเรื่อย ๆ พอถึงท้ายคลิปซับกับเสียงห่างกันเป็นวินาที

⚠️ เราไม่ได้ใช้ "ข้อความ" ที่ whisper ถอดมา ใช้แค่ "เวลา"
    ข้อความจริงเรามีอยู่แล้วเพราะเราเป็นคนสั่งให้อ่าน การเอาข้อความจาก whisper
    มาแสดงจะทำให้ซับผิดตรงที่มันถอดพลาด ทั้งที่เรารู้คำที่ถูกต้องอยู่แล้ว
"""
import re

_NOSPACE = re.compile(r"\s+")

_model_cache = {}


def _load(size, device):
    """โหลดโมเดลครั้งเดียวแล้วใช้ซ้ำ — โหลดใหม่ทุกครั้งกิน RAM และเวลาเปล่า"""
    from faster_whisper import WhisperModel

    key = (size, device)
    if key in _model_cache:
        return _model_cache[key]

    if device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"
    ctype = "float16" if device == "cuda" else "int8"
    try:
        m = WhisperModel(size, device=device, compute_type=ctype)
    except Exception:
        # การ์ดจอ 6GB บางทีไม่พอถ้า FLUX ยังค้างอยู่ใน VRAM — ตกไป CPU ดีกว่าพัง
        m = WhisperModel(size, device="cpu", compute_type="int8")
    _model_cache[key] = m
    return m


def word_times(wav_path, model_size="large-v3", device="auto"):
    """ถอดเสียงเอาเฉพาะเวลารายคำ → [(คำ, เริ่ม, จบ), ...]"""
    m = _load(model_size, device)
    segs, _ = m.transcribe(str(wav_path), language="th", word_timestamps=True,
                           vad_filter=False)
    out = []
    for s in segs:
        for w in (s.words or []):
            t = _NOSPACE.sub("", w.word)
            if t:
                out.append((t, float(w.start), float(w.end)))
    return out


def map_segments(segments, words, total_duration):
    """ผูกเวลาจาก whisper กลับเข้ากับบรรทัดต้นฉบับ

    ต่อข้อความทุกบรรทัดเป็นสายอักขระเดียว (ตัดช่องว่างทิ้ง เพราะภาษาไทยไม่มี
    ช่องว่างระหว่างคำอยู่แล้ว) จำว่าอักขระตัวที่ i เป็นของบรรทัดไหน แล้วหา
    "ท่อนที่ตรงกัน" ระหว่างสิ่งที่ whisper ถอดได้กับข้อความจริง ด้วย difflib

    ⚠️ เคยเขียนแบบเดินตัวชี้ไปข้างหน้าทีละตัวอักษรแล้วผิดหนัก (9 ก.ย. 2026):
       ภาษาไทยมีอักขระซ้ำเยอะมาก การ "มองหาไปข้างหน้าอีก 12 ตัว" ทำให้ตัวชี้
       กระโดดข้ามไปไกลเกินจริงเรื่อย ๆ จนกินข้อความหมดตั้งแต่วินาทีที่ 23
       ของคลิป 45 วินาที ผลคือ 11 บรรทัดแรกอัดกันอยู่ครึ่งแรก และบรรทัดสุดท้าย
       ค้างบนจอ 21 วินาที — ดูเหมือนทำงานได้ แต่ผิดทั้งเส้น

       difflib หาการจับคู่ที่ดีที่สุดของทั้งสายพร้อมกัน ไม่ใช่ตัดสินทีละตัว
       จึงไม่สะสมความผิดพลาด · autojunk=False สำคัญมาก ไม่งั้นมันจะทิ้งอักขระ
       ที่พบบ่อย (ซึ่งในภาษาไทยคืออักขระส่วนใหญ่) ออกจากการเทียบ
    """
    import difflib

    target, owner = [], []
    for s in segments:
        for ch in _NOSPACE.sub("", s["text"]):
            target.append(ch)
            owner.append(s["index"])
    if not target or not words:
        return _even(segments, total_duration)

    heard, of_word = [], []
    for wi, (text, _, _) in enumerate(words):
        for ch in text:
            heard.append(ch)
            of_word.append(wi)

    sm = difflib.SequenceMatcher(None, heard, target, autojunk=False)
    hits = {s["index"]: [] for s in segments}
    for i, j, n in sm.get_matching_blocks():
        for k in range(n):
            seg = owner[j + k]
            _, start, end = words[of_word[i + k]]
            hits[seg].append((start, end))

    # แปลงอักขระที่จับคู่ได้เป็นช่วงเวลาของแต่ละบรรทัด
    spans = {}
    for s in segments:
        got = hits.get(s["index"]) or []
        if got:
            spans[s["index"]] = [min(a for a, _ in got), max(b for _, b in got)]

    if not spans:
        return _even(segments, total_duration)

    # บรรทัดที่ไม่มีคำไหนตกลงมาเลย — เติมด้วยการแบ่งช่องว่างระหว่างเพื่อนบ้าน
    ordered = [s["index"] for s in segments]
    for i, idx in enumerate(ordered):
        if idx in spans:
            continue
        prev_end = next((spans[j][1] for j in reversed(ordered[:i]) if j in spans), 0.0)
        next_start = next((spans[j][0] for j in ordered[i + 1:] if j in spans),
                          total_duration)
        spans[idx] = [prev_end, max(prev_end + 0.4, next_start)]

    # บังคับให้เรียงต่อกันไม่ทับกัน และคลุมเสียงทั้งเส้น
    out = []
    cursor = 0.0
    for i, idx in enumerate(ordered):
        a, b = spans[idx]
        a = max(cursor, min(a, total_duration))
        b = max(a + 0.35, min(b, total_duration))
        if i == 0:
            a = 0.0                                  # ฉากแรกเริ่มพร้อมคลิป
        if i == len(ordered) - 1:
            b = total_duration                       # ฉากท้ายค้างจนเสียงจบ
        out.append({"index": idx, "start": round(a, 3), "end": round(b, 3)})
        cursor = b
    return out


def _even(segments, total):
    """ทางถอย: แบ่งเวลาตามจำนวนอักขระ ใช้เมื่อ whisper ใช้ไม่ได้

    ไม่แม่นเท่าของจริงแต่ยังดูได้ — ระบบต้องเดินต่อได้แม้ไม่มีการ์ดจอ"""
    lens = [max(1, len(_NOSPACE.sub("", s["text"]))) for s in segments]
    tot = sum(lens)
    out, t = [], 0.0
    for s, ln in zip(segments, lens):
        d = total * ln / tot
        out.append({"index": s["index"], "start": round(t, 3),
                    "end": round(min(t + d, total), 3)})
        t += d
    if out:
        out[-1]["end"] = round(total, 3)
    return out


def subtitle_chunks(segments, timing, max_chars=28):
    """ซอยบรรทัดเป็นชิ้นซับที่อ่านทันบนจอ พร้อมเวลาของแต่ละชิ้น

    แบ่งเวลาภายในบรรทัดตามสัดส่วนอักขระ — ละเอียดพอสำหรับซับ และไม่ต้องพึ่ง
    การจับคู่รายคำซ้ำอีกรอบซึ่งพลาดง่ายกว่า
    """
    by_idx = {t["index"]: t for t in timing}
    out = []
    for s in segments:
        t = by_idx.get(s["index"])
        if not t:
            continue
        pieces = _chunk(s["text"], max_chars)
        lens = [max(1, len(_NOSPACE.sub("", p))) for p in pieces]
        tot = sum(lens)
        span = t["end"] - t["start"]
        cur = t["start"]
        for p, ln in zip(pieces, lens):
            d = span * ln / tot
            out.append({"text": p, "start": round(cur, 3),
                        "end": round(cur + d, 3), "segment": s["index"]})
            cur += d
    return out


def _chunk(text, limit):
    if len(text) <= limit:
        return [text]
    words, cur, out = text.split(" "), "", []
    for w in words:
        if cur and len(cur) + 1 + len(w) > limit:
            out.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        out.append(cur)
    return out or [text]
