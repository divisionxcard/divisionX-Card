"""เสียงพากย์ไทยจาก Gemini TTS

ทำไม Gemini ไม่ใช่ ElevenLabs:
    ElevenLabs อ่านไทยดีกว่าจริง แต่ต้องผูกบัตร ซึ่งโปรเจกต์นี้ติดปัญหาบัตร
    ถูกปฏิเสธมาแล้วทั้ง OpenAI และ Google Cloud (ดู local_image.py) ส่วน Gemini
    ใช้ API key ฟรีที่มีอยู่แล้ว · และเราได้ยินผลจริงจาก Hero AI Studio แล้วว่า
    เสียง Gemini อ่านไทยฟังรู้เรื่อง — ยืนยันซ้ำด้วยการถอดกลับด้วย whisper

ผลลัพธ์: PCM 16-bit mono 24kHz → ห่อเป็น .wav เอง
Gemini คืน raw PCM ไม่ใช่ไฟล์เสียงสำเร็จรูป (mimeType: audio/L16;codec=pcm;rate=24000)
เขียนลงไฟล์ตรง ๆ จะได้ไฟล์เปิดไม่ได้ ต้องใส่ header เอง
"""
import base64
import io
import json
import pathlib
import re
import time
import urllib.error
import urllib.request
import wave

from . import config

API = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
# รุ่น 3.x (gemini-3.8-flash-tts — ตัวแทนรุ่น 2.5 ที่ปิด 17 พ.ย. 2026) ใช้ Interactions API คนละรูปแบบ:
# ข้อความ = บทพูดตรงตัวเท่านั้น · คำสั่งอารมณ์ไปอยู่ใน annotations (speech_metadata.style)
# ถ้ายัดคำสั่งไว้หน้าบทแบบรุ่น 2.5 รุ่นนี้จะอ่านคำสั่งออกเสียงด้วย
INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions"
PRONOUNCE = config.TASKS / "tts_pronounce.json"

# เสียงที่ทดสอบกับภาษาไทยแล้ว — ชื่ออื่นมีอีกเยอะแต่ยังไม่ได้ลอง อย่าใส่มั่ว
# (รุ่น 3.8 ใช้ชื่อชุดเดียวกัน · คลังเสียงตามภาษาของ Google มี 30 ภาษา ไม่มีไทย — ตรวจ 23 ต.ค. 2026)
VOICES = {
    "Aoede":   "หญิง · โทนสบาย ไม่เร่ง — ค่าเริ่มต้น เข้ากับโทนเพื่อนคุยกัน",
    "Kore":    "หญิง · หนักแน่นกว่า เหมาะกับคอนเทนต์ให้ความรู้",
    "Puck":    "ชาย · สดใส จังหวะเร็ว",
    "Charon":  "ชาย · ทุ้มนิ่ง เหมาะกับเล่าเรื่อง",
}


def _interactions(model):
    return model.startswith("gemini-3")


_rules_cache = {}


def pronounce(text):
    """ข้อความเขียน → ข้อความที่ให้ TTS อ่าน ตาม deploy/tasks/tts_pronounce.json (ซับยังใช้ข้อความเขียนเดิม)

    23 ต.ค. 2026 · เจ้าของ: "ยังมีบางคำที่อ่านผิด" — รุ่น 2.5 อ่าน "Pokémon" แบบฝรั่ง (whisper ถอดกลับได้ "พอร์คีมม่อน")
    กฎอยู่ในไฟล์ ไม่ฝังโค้ด จะได้เติมคำที่เจ้าของได้ยินผิดได้ทันที · ไฟล์เสีย/ไม่มี = อ่านตามเดิม ไม่ล้มทั้งคลิป
    """
    try:
        mtime = PRONOUNCE.stat().st_mtime
        if _rules_cache.get("mtime") != mtime:
            raw = json.loads(PRONOUNCE.read_text(encoding="utf-8"))
            _rules_cache.update(mtime=mtime, rules=[(re.compile(r["from"]), r["to"]) for r in raw.get("rules", [])])
        rules = _rules_cache["rules"]
    except Exception:
        return text
    for rx, to in rules:
        text = rx.sub(to, text)
    return text


def synth(text, out_wav, voice=None, model=None, retries=3, style=None):
    """อ่านข้อความเป็นไฟล์ .wav — คืน path

    มีแคช: ถ้าไฟล์มีอยู่แล้วและข้อความไม่เปลี่ยน จะข้ามการเรียก API
    (เก็บ hash ของข้อความไว้ข้าง ๆ) เพราะตอนแก้ภาพหรือซับ ไม่ควรต้องจ่าย TTS ใหม่

    style: คำสั่งอารมณ์การอ่านเป็นภาษาธรรมชาติ เช่น
           "อ่านแบบเพื่อนเล่าให้เพื่อนฟัง ตื่นเต้นนิด ๆ ไม่ใช่อ่านประกาศ"
           Gemini TTS ออกแบบมาให้รับคำสั่งนำแบบนี้โดยไม่อ่านตัวคำสั่งออกเสียง
           ⚠️ ยังไม่ได้ทดสอบกับไทยจริงจัง (10 ก.ย. 2026 โควตาหมดก่อน) —
           ถ้าพบว่าเสียงอ่านคำสั่งออกมา ให้ตรวจ timing ของฉากแรกเป็นพิเศษ
    """
    out_wav = pathlib.Path(out_wav)
    voice = voice or config.TTS_VOICE
    model = model or config.TTS_MODEL
    text = pronounce(text)
    meta = (style or "").strip()
    if meta and not _interactions(model):
        text = f"{meta}:\n\n{text}"

    stamp = out_wav.with_suffix(".stamp.json")
    key = {"text": text, "voice": voice, "model": model}
    if meta and _interactions(model):
        key["style"] = meta
    if out_wav.exists() and stamp.exists():
        try:
            if json.loads(stamp.read_text(encoding="utf-8")) == key:
                return out_wav          # เหมือนเดิมทุกอย่าง ใช้ของเก่า
        except Exception:
            pass

    api_key = config.env("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("ไม่มี GEMINI_API_KEY ใน deploy/.env.local")

    if _interactions(model):
        content = {"type": "text", "text": text}
        if meta:
            content["annotations"] = [{"type": "speech_metadata", "style": meta}]
        body = {
            "model": model,
            "input": [{"type": "user_input", "content": [content]}],
            "response_format": {"type": "audio", "mime_type": "audio/l16", "sample_rate": config.TTS_RATE},
            "generation_config": {"speech_config": [{"voice": voice}]},
        }
        url = INTERACTIONS
    else:
        body = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
                },
            },
        }
        url = API.format(m=model)
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )

    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            last = f"HTTP {e.code} · {raw[:300]}"
            # 429 แบบ "ต่อวัน" (ฟรี 10 ครั้ง/วัน/โมเดล) รอกี่วินาทีก็ไม่หาย —
            # ฟ้องเป็นภาษาคนทันที ข้อความนี้ขึ้นในกล่องแดงของห้องตัดต่อตรง ๆ
            # (เจอจริง 10 ก.ย. 2026: quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier)
            if e.code == 429 and "PerDay" in raw:
                raise RuntimeError(
                    "โควตาเสียงฟรีของ Gemini หมดสำหรับวันนี้ (10 ครั้ง/วัน)\n"
                    "รีเซ็ตราว 14:00 น. ไทย (เที่ยงคืนแคลิฟอร์เนีย) — การแก้ทั้งหมดถูกเก็บ\n"
                    "ไว้แล้ว ถึงเวลาค่อยกดเรนเดอร์ซ้ำได้เลย ไม่ต้องตั้งค่าใหม่\n"
                    "(แก้ภาพ/ซับ/จุดตัด/โลโก้ไม่ใช้โควตานี้ — เฉพาะเปลี่ยนเสียงหรือแก้สคริปต์)")
            # 503/429 ต่อนาที = ชั่วคราว รอแล้วลองใหม่ (บทเรียนจาก askGemini ใน route.js)
            if e.code in (429, 500, 503) and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(f"Gemini TTS ล้ม: {last}")
        except Exception as e:                                  # เน็ตสะดุด
            last = str(e)
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(f"Gemini TTS ล้ม: {last}")

    try:
        if _interactions(model):
            data = next(c["data"] for st in d.get("steps") or [] for c in st.get("content") or [] if c.get("data"))
            pcm = base64.b64decode(data)
            if pcm[:4] == b"RIFF":                      # ขอ l16 แล้ว แต่ถ้าได้ wav มาก็แกะเฟรมออกเอง
                with wave.open(io.BytesIO(pcm)) as w:
                    if w.getframerate() != config.TTS_RATE or w.getnchannels() != 1:
                        raise ValueError(f"wav {w.getframerate()} Hz · {w.getnchannels()} ch")
                    pcm = w.readframes(w.getnframes())
        else:
            part = d["candidates"][0]["content"]["parts"][0]["inlineData"]
            pcm = base64.b64decode(part["data"])
    except Exception:
        raise RuntimeError(f"Gemini ไม่ได้ส่งเสียงกลับมา: {json.dumps(d)[:300]}")

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)                      # 16-bit
        w.setframerate(config.TTS_RATE)
        w.writeframes(pcm)
    stamp.write_text(json.dumps(key, ensure_ascii=False), encoding="utf-8")
    return out_wav


def duration(wav_path):
    with wave.open(str(wav_path), "rb") as w:
        return w.getnframes() / float(w.getframerate())
