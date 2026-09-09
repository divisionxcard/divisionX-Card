"""คลังเพลงประกอบ — เลือกเพลงจาก "รูปแบบโพสต์" ไม่ใช่จากชื่อไฟล์

ทำไมต้องมีตัวกลางแทนที่จะชี้ไฟล์เอาเอง:
    ไฟล์แผน (plan) ของโรงงานวิดีโอมีช่อง "music" เป็น path ตรง ๆ ซึ่งใช้ได้ตอน
    ทำมือทีละคลิป แต่พอเริ่มสร้างคลิปจากคิว marketing_content อัตโนมัติ คนสั่งงาน
    จะรู้แค่ว่าโพสต์นี้เป็นรูปแบบไหน (news_hook / beginner / fomo ...) ไม่รู้ว่า
    เครื่องที่รันมีเพลงอะไรอยู่บ้าง — ตัวนี้จึงแปลง "รูปแบบโพสต์ → ไฟล์เพลงที่มีจริง"

⚠️ ห้ามใช้เพลงที่ไม่มีสิทธิ์ — เด็ดขาด
    TikTok / IG / YouTube ตรวจเสียงอัตโนมัติ เจอแล้วผลคือปิดเสียงทั้งคลิป หรือ
    ถอดคลิปออก ซึ่ง **แก้ทีหลังไม่ได้** — ยอดวิว คอมเมนต์ และการแชร์ที่สะสมมา
    หายไปพร้อมกัน แล้วต้องอัปใหม่เริ่มนับหนึ่ง ต่อให้เปลี่ยนเพลงแล้วก็ตาม
    เพลงในคลังของแอป TikTok ก็ใช้ไม่ได้ เพราะใบอนุญาตนั้นครอบคลุมเฉพาะคลิปที่ตัด
    ในแอป ไม่ครอบคลุมไฟล์ mp4 ที่เรา render เองแล้วเอาไปลงหลายแพลตฟอร์ม
    → ใช้ได้เฉพาะเพลงที่ซื้อใบอนุญาตมา / CC0-CC-BY ที่ให้เครดิตครบ / แต่งเอง
      แล้วกรอกช่อง license กับ source ใน video_music.json ทุกครั้ง

ไฟล์เสียงเก็บที่ deploy/public/music/ และ **ไม่เข้า git** (มีบรรทัดใน .gitignore แล้ว)
เหตุผล 3 ข้อ:
    1. ใบอนุญาตเพลงเกือบทุกเจ้าผูกกับ "ผู้ซื้อ" ไม่ใช่ "ใครก็ตามที่ clone repo ได้"
       การ commit ไฟล์เพลงคือการแจกจ่ายซ้ำ ซึ่งผิดสัญญาตั้งแต่วันที่ commit
    2. deploy/public/ ถูก Next.js เสิร์ฟเป็นไฟล์สาธารณะ — ถ้าไฟล์เข้า git มันจะขึ้น
       Vercel แล้วโหลดได้จาก /music/xxx.mp3 กลายเป็นเว็บแจกเพลงโดยไม่ตั้งใจ
       (การ gitignore จึงกันสองชั้น: ไม่เข้า repo และไม่ขึ้นเว็บ)
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


def catalog():
    """อ่าน video_music.json (อ่านครั้งเดียวแล้วจำไว้)

    ถ้าไฟล์หาย ไม่โยน error แต่คืนคลังเปล่า — คลิปที่ไม่มีเพลงยังใช้ได้
    (compose.build รับ music=None อยู่แล้ว) การล้มทั้งงานเพราะเพลงไม่มีคือคนละเรื่อง
    """
    global _catalog
    if _catalog is None:
        if CATALOG.exists():
            _catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        else:
            _catalog = {"tracks": [], "format_mood": {}, "moods": []}
    return _catalog


def _path_of(track):
    """path ในคลังเก็บแบบเทียบกับโฟลเดอร์ deploy/ — ไม่ผูก path เต็มของเครื่องใคร"""
    rel = (track.get("file") or "").strip()
    if not rel:
        return None
    return config.ROOT / rel


def list_tracks():
    """เพลงที่ **มีไฟล์อยู่จริงบนเครื่องนี้** เท่านั้น

    คืน list ของ dict เดิม + ช่อง "path" (str) เพิ่มเข้ามา

    ที่ต้องกรองด้วยการมีไฟล์จริง เพราะ video_music.json เป็นแค่ "ช่องว่างที่รอเพลง"
    ทุกช่องมีชื่ออยู่ในไฟล์ตั้งแต่ยังไม่มีใครใส่เพลง และไฟล์เพลงไม่เข้า git แปลว่า
    เครื่องคนละเครื่องมีเพลงไม่เท่ากันเป็นเรื่องปกติ — ห้ามสมมติว่ามีครบ
    """
    out = []
    for t in catalog().get("tracks") or []:
        p = _path_of(t)
        if p and p.exists():
            row = dict(t)
            row["path"] = str(p)
            out.append(row)
    return out


def missing():
    """ช่องที่ยังไม่มีไฟล์ — ไว้บอกเจ้าของว่าต้องหาเพลงแบบไหนมาวางชื่ออะไร"""
    out = []
    for t in catalog().get("tracks") or []:
        p = _path_of(t)
        if not p or not p.exists():
            out.append(dict(t))
    return out


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
        4. None                                  ← ยังไม่มีเพลงในเครื่องนี้เลย

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


def main():
    have, gone = list_tracks(), missing()
    print(f"คลังเพลง: {CATALOG}")
    print(f"โฟลเดอร์ไฟล์เสียง: {config.ROOT / (catalog().get('music_dir') or 'public/music')}")
    print(f"มีไฟล์แล้ว {len(have)} / {len(have) + len(gone)} ช่อง\n")

    if have:
        print("— มีเพลงแล้ว —")
        for t in have:
            lic = t.get("license") or "!! ยังไม่ได้กรอกใบอนุญาต"
            print(f"  [{t['mood']:6}] {t['key']:10} {t.get('title_th','')}  ({lic})")
        print()

    if gone:
        print("— ยังว่าง (วางไฟล์ตามชื่อนี้แล้วใช้ได้ทันที) —")
        for t in gone:
            print(f"  [{t['mood']:6}] {t['file']}  ← {t.get('note') or t.get('title_th','')}")
        print("\nอย่าลืม: ใช้ได้เฉพาะเพลงที่มีสิทธิ์จริง แล้วกรอก license/source ในไฟล์คลัง")


if __name__ == "__main__":
    main()
