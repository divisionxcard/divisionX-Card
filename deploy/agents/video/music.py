"""คลังเพลงประกอบ — เลือกเพลงจาก "รูปแบบโพสต์" ไม่ใช่จากชื่อไฟล์

ทำไมต้องมีตัวกลางแทนที่จะชี้ไฟล์เอาเอง:
    ไฟล์แผน (plan) ของโรงงานวิดีโอมีช่อง "music" เป็น path ตรง ๆ ซึ่งใช้ได้ตอน
    ทำมือทีละคลิป แต่พอเริ่มสร้างคลิปจากคิว marketing_content อัตโนมัติ คนสั่งงาน
    จะรู้แค่ว่าโพสต์นี้เป็นรูปแบบไหน (news_hook / beginner / fomo ...) ไม่รู้ว่า
    เครื่องที่รันมีเพลงอะไรอยู่บ้าง — ตัวนี้จึงแปลง "รูปแบบโพสต์ → ไฟล์เพลงที่มีจริง"
    (รูปแบบโพสต์คือค่าในคอลัมน์ marketing_content.content_format ซึ่งตรงกับ
     content_formats[].key ใน tasks/content_voice.json)

⚠️ ห้ามใช้เพลงที่ไม่มีสิทธิ์ — เด็ดขาด
    TikTok / IG / YouTube ตรวจเสียงอัตโนมัติ เจอแล้วผลคือปิดเสียงทั้งคลิป หรือ
    ถอดคลิปออก ซึ่ง **แก้ทีหลังไม่ได้** — ยอดวิว คอมเมนต์ และการแชร์ที่สะสมมา
    หายไปพร้อมกัน แล้วต้องอัปใหม่เริ่มนับหนึ่ง ต่อให้เปลี่ยนเพลงแล้วก็ตาม
    เพลงในคลังของแอป TikTok ก็ใช้ไม่ได้ เพราะใบอนุญาตนั้นครอบคลุมเฉพาะคลิปที่ตัด
    ในแอป ไม่ครอบคลุมไฟล์ mp4 ที่เรา render เองแล้วเอาไปลงหลายแพลตฟอร์ม
    → ใช้ได้เฉพาะเพลงที่ซื้อใบอนุญาตมา / CC0-CC-BY ที่ให้เครดิตครบ / แต่งเอง

    ช่อง license ในคลังจึงไม่ใช่ของประดับ — **เพลงที่ยังไม่กรอก license จะไม่ถูก
    หยิบไปใช้อัตโนมัติ** (ดู list_tracks) เพราะเสียง "เงียบ" แก้ได้ด้วยการ render
    ใหม่ 3 นาที ส่วนคลิปโดนถอดแก้ไม่ได้เลย ราคาสองอย่างนี้ต่างกันคนละโลก
    ถ้าเพลงมาจากไฟล์ที่ยังกรอกไม่ได้จริง ๆ ให้ชี้ path ตรง ๆ ในช่อง music ของ
    ไฟล์แผนแทน — ตรงนั้นถือว่าคนสั่งรับผิดชอบเอง

ไฟล์เสียงเก็บที่ deploy/assets/music/ และ **ไม่เข้า git** (มีบรรทัดใน .gitignore แล้ว)
เหตุผล 3 ข้อ:
    1. ใบอนุญาตเพลงเกือบทุกเจ้าผูกกับ "ผู้ซื้อ" ไม่ใช่ "ใครก็ตามที่ clone repo ได้"
       การ commit ไฟล์เพลงคือการแจกจ่ายซ้ำ ซึ่งผิดสัญญาตั้งแต่วันที่ commit
    2. เก็บนอก deploy/public/ **โดยตั้งใจ** — ทุกอย่างใน public/ ถูก Next.js เสิร์ฟ
       เป็นไฟล์สาธารณะ ถ้าวางไว้ที่นั่นแล้ววันไหน .gitignore พลาด ไฟล์จะขึ้น Vercel
       แล้วโหลดได้จาก /music/xxx.mp3 ทันที กลายเป็นเว็บแจกเพลงโดยไม่มีใครรู้
       (repo นี้เคยเขียนกฎ gitignore พลาดมาแล้ว — บรรทัด `image/` ที่ไม่มี `/` นำหน้า
        ไปโดนโฟลเดอร์ชื่อ image ทุกตัวทั้งโปรเจกต์) การกัน "สองชั้น" ที่แท้จริงคือ
       gitignore + อยู่ในที่ที่เสิร์ฟไม่ได้ ไม่ใช่ gitignore อย่างเดียวสองเหตุผล
    3. ไฟล์เสียงเป็นไบนารีหลาย MB ที่ git ทำ diff ไม่ได้ เปลี่ยนเพลงทีก็บวม history
       ถาวร — โปรเจกต์นี้ตัดสินแบบเดียวกันมาแล้วกับ /image/ (807MB) และ /Video/

รัน (จากโฟลเดอร์ deploy) เพื่อดูว่าช่องไหนมีเพลงแล้ว ช่องไหนยังว่าง:
    py -m agents.video.music
"""
import json
import pathlib
import random
import sys

if __package__ in (None, ""):                       # ให้รันตรง ๆ ได้ด้วย
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
    __package__ = "agents.video"

from . import config                                # noqa: E402

CATALOG = config.TASKS / "video_music.json"

_catalog = None
_warned = set()                 # เตือนเรื่องเดิมครั้งเดียวต่อโปรเซส ไม่ใช่ทุกคลิป


def _warn(tag, msg):
    """เตือนทาง stderr ครั้งเดียว — เงียบไม่ได้ แต่ก็ไม่ควรท่วมล็อกตอนทำหลายคลิป"""
    if tag in _warned:
        return
    _warned.add(tag)
    print(f"[music] {msg}", file=sys.stderr, flush=True)


def catalog():
    """อ่าน video_music.json (อ่านครั้งเดียวแล้วจำไว้)

    ไม่โยน error ทั้งตอนไฟล์หายและตอนไฟล์พัง แต่คืนคลังเปล่าพร้อมเตือนทาง stderr
    เพราะไฟล์นี้ถูกแก้ด้วยมือทุกครั้งที่เพิ่มเพลง (ลืมจุลภาคคือ JSONDecodeError)
    และตอนที่รู้ตัวคือหลังจ่ายค่า TTS ไปแล้ว 3-4 นาที — การล้มทั้งคลิปเพราะคลัง
    เพลงพิมพ์ผิดคือคนละเรื่องกับการทำคลิป (compose.build รับ music=None อยู่แล้ว)
    """
    global _catalog
    if _catalog is None:
        if CATALOG.exists():
            try:
                _catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                _warn("broken", f"อ่าน {CATALOG.name} ไม่ได้ ({e}) — คลิปรอบนี้จะไม่มีเพลง")
                _catalog = {}
        else:
            _catalog = {}
        _catalog.setdefault("tracks", [])
        _catalog.setdefault("format_mood", {})
        _catalog.setdefault("moods", [])
    return _catalog


def _path_of(track):
    """path ในคลังเก็บแบบเทียบกับโฟลเดอร์ deploy/ — ไม่ผูก path เต็มของเครื่องใคร"""
    rel = (track.get("file") or "").strip()
    if not rel:
        return None
    return config.ROOT / rel


def _has_file(track):
    """is_file ไม่ใช่ exists — โฟลเดอร์ชื่อ hype-01.mp3 ก็ผ่าน exists() ได้"""
    p = _path_of(track)
    return bool(p and p.is_file())


def _licensed(track):
    return bool((track.get("license") or "").strip())


def list_tracks():
    """เพลงที่ **หยิบไปใช้อัตโนมัติได้จริง** — มีไฟล์บนเครื่องนี้ และกรอก license แล้ว

    คืน list ของ dict เดิม + ช่อง "path" (str) เพิ่มเข้ามา

    ที่ต้องกรองด้วยการมีไฟล์จริง เพราะ video_music.json เป็นแค่ "ช่องว่างที่รอเพลง"
    ทุกช่องมีชื่ออยู่ในไฟล์ตั้งแต่ยังไม่มีใครใส่เพลง และไฟล์เพลงไม่เข้า git แปลว่า
    เครื่องคนละเครื่องมีเพลงไม่เท่ากันเป็นเรื่องปกติ — ห้ามสมมติว่ามีครบ

    ที่ต้องกรองด้วย license ด้วย เพราะลำดับงานจริงคือ "โยนไฟล์ลงโฟลเดอร์ก่อน
    เดี๋ยวค่อยกรอก" แล้วก็ลืม ถ้าปล่อยผ่าน คลิปที่ออกไปแล้วโดนถอดย้อนแก้ไม่ได้
    — เงียบทั้งคลิปยังถูกกว่ามาก จึงตัดออกจากการเลือกอัตโนมัติแล้วเตือนดัง ๆ แทน
    """
    out, blocked = [], []
    for t in catalog().get("tracks") or []:
        if not _has_file(t):
            continue
        if not _licensed(t):
            blocked.append(t.get("key") or t.get("file") or "?")
            continue
        row = dict(t)
        row["path"] = str(_path_of(t))
        out.append(row)
    if blocked:
        _warn("nolicense",
              "ข้ามเพลงที่ยังไม่กรอกช่อง license ใน video_music.json: "
              + ", ".join(blocked)
              + " — กรอกก่อนถึงจะถูกหยิบไปใช้ (กันคลิปโดนถอดเพราะลิขสิทธิ์)")
    return out


def unlicensed():
    """ช่องที่มีไฟล์แล้วแต่ยังไม่กรอก license — ค้างอยู่ตรงกลาง ใช้ไม่ได้จนกว่าจะกรอก"""
    return [dict(t) for t in (catalog().get("tracks") or [])
            if _has_file(t) and not _licensed(t)]


def missing():
    """ช่องที่ยังไม่มีไฟล์ — ไว้บอกเจ้าของว่าต้องหาเพลงแบบไหนมาวางชื่ออะไร"""
    return [dict(t) for t in (catalog().get("tracks") or []) if not _has_file(t)]


def mood_for(format_key):
    """รูปแบบโพสต์ → อารมณ์เพลง

    รูปแบบที่ยังไม่ได้ map จะตกไปใช้ default_mood ไม่ใช่คืน None เพราะเวลามีคนเพิ่ม
    รูปแบบโพสต์ใหม่ใน content_voice.json แล้วลืมมาเพิ่มที่นี่ ผลที่ควรได้คือ
    "เพลงกลาง ๆ" ไม่ใช่ "คลิปเงียบ"
    """
    c = catalog()
    return (c.get("format_mood") or {}).get(format_key) or c.get("default_mood")


def pick_for(format_key):
    """เลือกเพลงให้รูปแบบโพสต์หนึ่ง ๆ — คืน path เป็น str หรือ None ถ้ายังไม่มีเพลงเลย

    คืนเป็น str ไม่ใช่ Path เพราะปลายทางคือช่อง "music" ในไฟล์แผน ซึ่งต้อง json ได้

    ไล่หาเป็นชั้น:
        1. เพลงที่ระบุ fits ตรงรูปแบบนี้        ← ตั้งใจเลือกมาให้โดยเฉพาะ
        2. เพลงอารมณ์เดียวกัน                    ← ยังตรงอารมณ์ แม้ไม่ได้ระบุชื่อรูปแบบ
        3. เพลงอารมณ์สำรอง (default_mood)        ← กลาง ๆ ดีกว่าเงียบ
        4. None                                  ← ยังไม่มีเพลงที่ใช้ได้บนเครื่องนี้

    เลือกจาก list_tracks() เท่านั้น แปลว่าเพลงที่ยังไม่กรอก license จะไม่มีวันถูก
    หยิบมาทางนี้ ต่อให้ไฟล์อยู่ในโฟลเดอร์แล้วก็ตาม

    สุ่มเมื่อเข้าเงื่อนไขเดียวกันหลายเพลง ไม่ได้เอาตัวแรกเสมอ เพราะคลิปของเราออก
    ติด ๆ กันบนฟีดเดียว ถ้าเพลงเดิมทุกคลิปคนจะเริ่มเลื่อนผ่านตั้งแต่วินาทีแรก
    (ผลข้างเคียงคือรันสองครั้งอาจได้เพลงคนละเพลง — ถ้าต้องการล็อกให้ใส่ path ตรง ๆ
    ในช่อง music ของไฟล์แผนแทน ค่าที่ระบุมาเองมีสิทธิ์เหนือกว่าเสมอ)
    """
    tracks = list_tracks()
    if not tracks:
        return None

    exact = [t for t in tracks if format_key in (t.get("fits") or [])]
    if exact:
        return random.choice(exact)["path"]

    mood = mood_for(format_key)
    same = [t for t in tracks if t.get("mood") == mood]
    if same:
        return random.choice(same)["path"]

    fallback = catalog().get("default_mood")
    spare = [t for t in tracks if t.get("mood") == fallback]
    if spare:
        return random.choice(spare)["path"]

    return None


def _row(t):
    """บรรทัดเดียวของหนึ่งช่อง — ใช้ .get ทุกตัวเพราะไฟล์คลังคนแก้ด้วยมือ
    ช่องที่พิมพ์คีย์ตกไม่ควรทำให้คำสั่งตรวจคลังพังทั้งคำสั่ง"""
    return f"  [{str(t.get('mood') or '-'):6}] {str(t.get('file') or '(ยังไม่ระบุชื่อไฟล์)')}"


def main():
    have, waiting, gone = list_tracks(), unlicensed(), missing()
    total = len(have) + len(waiting) + len(gone)
    print(f"คลังเพลง: {CATALOG}")
    print(f"โฟลเดอร์ไฟล์เสียง: {config.ROOT / (catalog().get('music_dir') or 'assets/music')}")
    print(f"ใช้ได้จริง {len(have)} / {total} ช่อง\n")

    if have:
        print("— ใช้ได้ (มีไฟล์ + กรอกใบอนุญาตแล้ว) —")
        for t in have:
            print(f"{_row(t)}  {t.get('title_th', '')}  ({t.get('license')})")
        print()

    if waiting:
        print("!! มีไฟล์แล้วแต่ยังไม่กรอก license — ระบบจะไม่หยิบไปใช้จนกว่าจะกรอก")
        for t in waiting:
            print(f"{_row(t)}  ← กรอก license กับ source ใน {CATALOG.name}")
        print()

    if gone:
        print("— ยังว่าง (วางไฟล์ตามชื่อนี้แล้วกรอก license ก็ใช้ได้ทันที) —")
        for t in gone:
            print(f"{_row(t)}  ← {t.get('note') or t.get('title_th', '')}")
        print("\nอย่าลืม: ใช้ได้เฉพาะเพลงที่มีสิทธิ์จริง แล้วกรอก license/source ในไฟล์คลัง")


if __name__ == "__main__":
    main()
