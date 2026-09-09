"""แปลงสคริปต์ข้อความเป็นเซ็กเมนต์ — หน่วยเล็กสุดที่ผูกกับหนึ่งภาพและหนึ่งช่วงเวลา

กติกาเดียวกับที่เจ้าของคุ้นมือจาก Hero AI Studio: **หนึ่งบรรทัด = หนึ่งเซ็กเมนต์**
เลือกแบบนี้เพราะมันทำให้คนเขียนสคริปต์ควบคุมจังหวะภาพได้เองโดยไม่ต้องเรียนอะไรใหม่
กด Enter คือสั่งให้เปลี่ยนภาพ

⚠️ ทุกบรรทัดจะถูกอ่านออกเสียง — emoji แฮชแท็ก และวงเล็บกำกับฉากห้ามอยู่ในสคริปต์
   ตัว sanitize จึงตัดทิ้งให้ ไม่ใช่แค่เตือน เพราะถ้าปล่อยผ่านจะได้เสียงอ่านว่า
   "แฮชแท็กวันพีซทีซีจี" ซึ่งพังทั้งคลิปโดยที่กว่าจะรู้ก็เรนเดอร์ไปแล้ว
"""
import re
import unicodedata

# ช่วง emoji หลัก ๆ + สัญลักษณ์ที่ TTS อ่านออกมาเป็นคำ
_EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF️☀-⛿]+"
)
_HASHTAG = re.compile(r"#\S+")
_BRACKET = re.compile(r"[\[\(（].*?[\]\)）]")      # [ภาพ: ...] หรือ (โคลสอัพ)
_URL = re.compile(r"https?://\S+|www\.\S+")
_SPACES = re.compile(r"[ \t ]+")


def sanitize(line):
    """ล้างบรรทัดให้เหลือเฉพาะสิ่งที่ควรถูกอ่านออกเสียง"""
    s = unicodedata.normalize("NFC", line)
    s = _URL.sub("", s)
    s = _BRACKET.sub("", s)
    s = _HASHTAG.sub("", s)
    s = _EMOJI.sub("", s)
    s = _SPACES.sub(" ", s)
    return s.strip(" -–—·•\t")


def split_script(text, max_chars=90):
    """สคริปต์ดิบ → รายการเซ็กเมนต์

    บรรทัดที่ยาวเกิน max_chars จะถูกซอยต่อที่ช่องว่าง เพราะเซ็กเมนต์ยาวเกินไป
    แปลว่าภาพเดียวค้างบนจอนานเกิน คนดูจะเลื่อนผ่าน
    """
    out = []
    for raw in text.splitlines():
        line = sanitize(raw)
        if not line:
            continue
        for piece in _wrap(line, max_chars):
            out.append({"index": len(out), "text": piece})
    return out


def _wrap(line, limit):
    """ซอยบรรทัดยาวที่ช่องว่าง — ภาษาไทยไม่มีช่องว่างระหว่างคำ
    ถ้าซอยไม่ได้ก็ปล่อยยาวไว้ ดีกว่าตัดกลางคำจนอ่านไม่รู้เรื่อง"""
    if len(line) <= limit:
        return [line]
    words, cur, out = line.split(" "), "", []
    for w in words:
        if cur and len(cur) + 1 + len(w) > limit:
            out.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        out.append(cur)
    return out or [line]


def speech_text(segments):
    """ข้อความที่จะส่งให้ TTS อ่านรวดเดียว

    อ่านทีเดียวทั้งสคริปต์ ไม่ใช่ทีละบรรทัด เพราะ TTS ต้องเห็นประโยคถัดไป
    ถึงจะวางน้ำเสียงกับจังหวะหายใจได้ถูก ถ้าตัดอ่านทีละบรรทัดจะได้เสียงกระตุก
    เหมือนคนอ่านทีละป้าย — แล้วค่อยใช้ whisper หาว่าแต่ละบรรทัดอยู่วินาทีไหน
    """
    return "\n".join(s["text"] for s in segments)
