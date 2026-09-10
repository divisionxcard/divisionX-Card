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
import json
import pathlib
import time
import urllib.error
import urllib.request
import wave

from . import config

API = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"

# เสียงที่ทดสอบกับภาษาไทยแล้ว — ชื่ออื่นมีอีกเยอะแต่ยังไม่ได้ลอง อย่าใส่มั่ว
VOICES = {
    "Aoede":   "หญิง · โทนสบาย ไม่เร่ง — ค่าเริ่มต้น เข้ากับโทนเพื่อนคุยกัน",
    "Kore":    "หญิง · หนักแน่นกว่า เหมาะกับคอนเทนต์ให้ความรู้",
    "Puck":    "ชาย · สดใส จังหวะเร็ว",
    "Charon":  "ชาย · ทุ้มนิ่ง เหมาะกับเล่าเรื่อง",
}


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
    if style:
        text = f"{style.strip()}:\n\n{text}"

    stamp = out_wav.with_suffix(".stamp.json")
    key = {"text": text, "voice": voice, "model": model}
    if out_wav.exists() and stamp.exists():
        try:
            if json.loads(stamp.read_text(encoding="utf-8")) == key:
                return out_wav          # เหมือนเดิมทุกอย่าง ใช้ของเก่า
        except Exception:
            pass

    api_key = config.env("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("ไม่มี GEMINI_API_KEY ใน deploy/.env.local")

    body = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
            },
        },
    }
    req = urllib.request.Request(
        API.format(m=model),
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
