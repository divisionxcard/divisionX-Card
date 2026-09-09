"""อัปคลิปขึ้น Supabase Storage แล้วรายงานผลกลับตาราง video_jobs

โรงงานวิดีโอ (make_video.py) จบงานที่ไฟล์ mp4 บนดิสก์ ซึ่งถ้ารันบน GitHub Actions
เท่ากับ "ไม่เหลืออะไรเลย" — เครื่องถูกทิ้งทันทีที่ job จบ ไฟล์นี้คือขาที่พาผลลัพธ์
ออกจากเครื่องนั้นให้ทันก่อนมันหาย: ขึ้น storage หนึ่งที่ · เขียนสถานะกลับ DB อีกที่
(เหตุผลเต็ม ๆ ว่าทำไมต้องมีคิวคั่นกลาง อยู่ในหัวไฟล์ migration 075_video_jobs.sql)

รัน:
    python -m agents.video.publish --job <uuid>      # สั่งจากโฟลเดอร์ deploy/
    py deploy/agents/video/publish.py --job <uuid>   # หรือเรียกไฟล์ตรง ๆ ก็ได้

ครบวงจร: claim (queued→rendering) → build_video → upload → finish (→done)
พังตรงไหนก็ตามจะเขียน error ลงแถวแล้วตั้ง failed เสมอ **ไม่ปล่อยค้าง rendering**
เพราะไม่มีใครมาเก็บกวาดงานค้าง — หน้าเว็บจะขึ้นว่า "กำลังเรนเดอร์" ไปตลอดกาล
และคนสั่งจะไม่มีทางรู้ว่าต้องสั่งใหม่
"""
import argparse
import hashlib
import json
import pathlib
import re
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request

if __package__ in (None, ""):                       # ให้รันไฟล์ตรง ๆ ได้ด้วย
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
    __package__ = "agents.video"

from . import config                                # noqa: E402

# บังคับ stdout เป็น UTF-8 ก่อน print บรรทัดแรก — เหตุผลเต็มใน deploy/agents/_console.py
# (รันผ่าน Git Bash หรือ pipe แล้ว Python เดา cp1252 → ตายตั้งแต่ print แรก ได้ log เปล่า)
# append ไม่ใช่ insert เพราะไม่อยากให้ไฟล์ใน deploy/agents/ ไปบัง module ชื่อซ้ำของ stdlib
# และยอมพลาดได้ — path ของ _console ต่างกันระหว่างเรียกแบบ -m กับเรียกไฟล์ตรง
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))
try:
    import _console  # noqa: F401,E402
except Exception:
    pass

BUCKET = "marketing"        # bucket เดียวกับโปสเตอร์ (poster_render.py) — public read
STORAGE_DIR = "video"       # เก็บแยกโฟลเดอร์จาก poster/ กับ aibg/ ที่มีอยู่แล้ว

_CREDS = None


# ── คุยกับ Supabase ผ่าน REST ตรง ─────────────────────────────────────────
# ไม่ลง supabase-py เพราะทั้งโปรเจกต์ฝั่ง python ใช้ urllib ล้วนมาตลอด (poster_render.py,
# scraper ทุกตัว) — เพิ่ม dependency ให้ workflow ต้องลงเพิ่มโดยได้แค่ syntax ที่สั้นลง
# ไม่คุ้ม และ pip install ที่ล้มบน CI คือความล้มเหลวชนิดที่แก้ยากที่สุดชนิดหนึ่ง

def _creds():
    """คืน (url, service_key) — ชื่อ env คนละชุดกันระหว่างเครื่องกับ GitHub Actions

        เครื่องเจ้าของ (deploy/.env.local) : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
        GitHub Actions (secrets)          : SUPABASE_URL             + SUPABASE_SERVICE_KEY

    จึงต้องลองทั้งสองชื่อ ไม่ใช่เลือกข้างใดข้างหนึ่ง · config.env() อ่านไฟล์ก่อนแล้วค่อย
    ตกไป os.environ ทำให้ทางเดียวกันนี้ใช้ได้ทั้งสองที่โดยไม่ต้องแยกโค้ด
    """
    global _CREDS
    if _CREDS is None:
        url = config.env("SUPABASE_URL") or config.env("NEXT_PUBLIC_SUPABASE_URL")
        key = config.env("SUPABASE_SERVICE_KEY") or config.env("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError(
                "ไม่พบค่าเชื่อม Supabase — ต้องมี SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL "
                "และ SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY "
                "(บนเครื่องอยู่ใน deploy/.env.local · บน Actions เป็น secrets)"
            )
        _CREDS = (url.rstrip("/"), key)
    return _CREDS


def sb(method, path, body=None, raw=None, ctype=None, base="rest/v1", timeout=60):
    """เรียก PostgREST หรือ Storage API — รูปแบบเดียวกับ sb() ใน poster_render.py"""
    url, key = _creds()
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
        data = json.dumps(body).encode()
    elif raw is not None:
        headers["Content-Type"] = ctype or "application/octet-stream"
        headers["x-upsert"] = "true"
        data = raw
    req = urllib.request.Request(f"{url}/{base}/{path}", method=method,
                                 headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = r.read()
    except urllib.error.HTTPError as e:
        # ข้อความจริงของ PostgREST/Storage อยู่ใน response body ไม่ใช่ใน reason
        # ถ้าไม่อ่านออกมา จะเห็นแค่ "HTTP Error 400: Bad Request" ซึ่งบอกอะไรไม่ได้เลย
        # และข้อความนี้จะถูกเก็บลงคอลัมน์ error ให้คนอ่านบนเว็บ — ต้องมีเนื้อความจริง
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:500]
        except Exception:
            pass
        raise RuntimeError(f"Supabase {method} {path} → HTTP {e.code} {detail}") from None
    if not out:
        return []
    try:
        return json.loads(out)
    except Exception:
        return out


def _q(value):
    """ใส่ค่าลง query string อย่างปลอดภัย — uuid ปกติไม่มีอะไรต้อง escape
    แต่ถ้าใครส่ง --job ที่มี & หรือ ? ติดมา จะกลายเป็นการต่อ filter ใหม่ให้ PostgREST
    ซึ่งอาจไปโดนแถวอื่นทั้งตาราง"""
    return urllib.parse.quote(str(value), safe="")


# ── อัปโหลด ──────────────────────────────────────────────────────────────
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_name(project):
    """ทำชื่อ project ให้ใช้เป็นชื่อไฟล์ใน storage ได้

    คอลัมน์ project เป็น text อิสระ (หน้าเว็บเป็นคนกรอก) ถ้าปล่อยตามนั้น ชื่อไทยหรือ
    ช่องว่างจะกลายเป็น URL ที่ต้อง percent-encode ซึ่งพังคนละแบบในแต่ละที่ — storage
    เก็บได้ แต่ลิงก์ที่เอาไปแปะในโพสต์มักโดน encode ซ้ำจนเปิดไม่ติด
    ส่วน '/' อันตรายที่สุดเพราะกลายเป็นโฟลเดอร์ใหม่เงียบ ๆ แล้วหาไฟล์ไม่เจอ

    ⚠️ ต่อท้ายด้วย hash เมื่อชื่อถูกแปลง เพราะการตัดตัวอักษรทิ้งทำให้ชื่อที่ต่างกัน
    กลายเป็นชื่อเดียวกันได้ — ชื่อไทยทุกชื่อเหลือ "clip" หมด แล้วสองงานคนละเรื่อง
    จะทับไฟล์กันเองโดยไม่มีอะไรฟ้อง (เจอตอนทดสอบ: "ทดลอง คลิป" → "clip")
    hash มาจากชื่อจริงจึงคงที่ — เรนเดอร์ project เดิมซ้ำยังได้ไฟล์เดิม ไม่งอกใหม่
    """
    raw = (project or "").strip()
    if not raw:
        return "clip"
    name = _UNSAFE.sub("-", raw).strip("-.")[:80]
    if name != raw:
        name = f"{name or 'clip'}-{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:8]}"
    return name


def upload_video(mp4_path, project):
    """อัป mp4 ขึ้น bucket marketing ที่ video/<project>.mp4 — คืน public URL

    ⚠️ ชื่อไฟล์ผูกกับ project อย่างเดียว ไม่มี timestamp เหมือนโปสเตอร์ แปลว่า
    **เรนเดอร์ชื่อเดิมซ้ำ = ทับคลิปเก่า** ซึ่งตั้งใจ (ไม่งั้นขยะสะสมทีละ 10-20 MB)
    แต่มีผลข้างเคียงสองข้อที่ต้องรู้:
      1. โพสต์เก่าที่แปะลิงก์นี้ไว้แล้ว จะกลายเป็นคลิปใหม่โดยไม่มีใครสั่ง
      2. public URL ของ Supabase ผ่าน CDN — ทับไฟล์แล้วอาจยังได้ของเก่าอยู่พักหนึ่ง
    ถ้าวันไหนต้องเก็บทุกเวอร์ชัน ให้เติม job id ลงใน path (ดู comment ใน migration 075)
    """
    p = pathlib.Path(mp4_path)
    if not p.exists():
        raise FileNotFoundError(f"ไม่พบไฟล์วิดีโอ {p}")
    raw = p.read_bytes()
    if len(raw) < 1024:
        # ffmpeg ทิ้งไฟล์เปล่าไว้ได้เมื่อคำสั่งพังกลางทาง — ถ้าปล่อยขึ้นไปแล้วปิดงานเป็น
        # done หน้าเว็บจะได้ลิงก์ที่เปิดไม่ติดโดยไม่มีอะไรบอกว่าผิด ซึ่งหลอกกว่า failed
        raise RuntimeError(f"ไฟล์วิดีโอเล็กผิดปกติ ({len(raw)} ไบต์) — ไม่อัปขึ้น storage")

    key = f"{STORAGE_DIR}/{_safe_name(project)}.mp4"
    # timeout ยาวกว่า default มาก เพราะคลิป 9:16 ความยาว ~45 วิ หนักหลักสิบ MB
    # (โปสเตอร์หนัก ~4 MB จึงใช้ 60 วิได้สบาย) เน็ตบ้านอัปช้ากว่านั้นเยอะ
    sb("POST", f"{BUCKET}/{urllib.parse.quote(key)}", raw=raw, ctype="video/mp4",
       base="storage/v1/object", timeout=600)
    url, _ = _creds()
    print(f"[publish] อัปโหลด {len(raw)/1024/1024:.1f} MB → {key}")
    return f"{url}/storage/v1/object/public/{BUCKET}/{key}"


# ── สถานะงานในคิว ────────────────────────────────────────────────────────
def claim_job(job_id):
    """จองงานแล้วคืน plan — เปลี่ยนสถานะ queued → rendering

    เงื่อนไข status=eq.queued อยู่ใน URL ของ PATCH โดยตั้งใจ ไม่ใช่อ่านมาเช็คใน python ก่อน
    เพราะ "อ่านแล้วค่อยเขียน" เปิดช่องให้สองเครื่องอ่านเจอ queued พร้อมกันแล้วเรนเดอร์ซ้อน
    (จ่ายค่า TTS สองรอบ และไฟล์ปลายทางชื่อเดียวกันจะทับกันมั่ว)
    PATCH ที่พกเงื่อนไขมาด้วยคือ compare-and-set ของ PostgREST — ผู้ชนะได้แถวกลับ 1 แถว
    ผู้แพ้ได้ [] ซึ่งเราถือว่าจองไม่ได้ทันที
    """
    rows = sb("PATCH", f"video_jobs?id=eq.{_q(job_id)}&status=eq.queued",
              # ล้าง error เก่าตั้งแต่ตอนจอง — งานที่ถูกโยนกลับเข้าคิวหลังเคยพัง
              # ถ้ายังมีข้อความเดิมค้างอยู่ คนอ่านจะแยกไม่ออกว่าพังรอบนี้หรือรอบก่อน
              {"status": "rendering", "error": None})
    if not rows:
        cur = sb("GET", f"video_jobs?id=eq.{_q(job_id)}&select=id,status")
        if not cur:
            raise RuntimeError(
                f"ไม่พบงาน id={job_id} ในตาราง video_jobs — ตรวจว่า id ถูกไหม "
                "และที่ใช้เป็น service key จริง (ถ้าเผลอใช้ anon key จะโดน RLS "
                "แล้วได้ 200 พร้อมผลลัพธ์ว่างเปล่า ไม่ใช่ error)"
            )
        raise RuntimeError(
            f"งาน {job_id} สถานะเป็น '{cur[0].get('status')}' ไม่ใช่ 'queued' — ไม่จองซ้ำ "
            "(ถ้าค้าง rendering เพราะรอบก่อนถูกฆ่ากลางคัน ให้สั่ง fail_job แล้วเข้าคิวใหม่)"
        )

    row = rows[0]
    plan = row.get("plan")
    if not isinstance(plan, dict):
        raise RuntimeError(f"คอลัมน์ plan ของงาน {job_id} ไม่ใช่ JSON object — เรนเดอร์ต่อไม่ได้")
    if not plan.get("script"):
        # ปล่อยไปก็ตายที่ build_video อยู่ดี แต่ตายตรงนี้ได้ข้อความที่บอกสาเหตุจริง
        raise RuntimeError(f"plan ของงาน {job_id} ไม่มีคีย์ script — ฝั่งที่สร้างงานส่งมาไม่ครบ")

    # คอลัมน์ project เป็นตัวจริงเสมอ เพราะมันคือชื่อโฟลเดอร์งานและชื่อไฟล์ใน storage
    # (ดู comment ของคอลัมน์ใน migration 075) · plan.project ที่ไม่ตรงกันแปลว่าฝั่งสร้างงาน
    # กรอกไม่ตรงกันเอง ถ้าปล่อยไว้จะเรนเดอร์ลง .video-work/ คนละโฟลเดอร์กับชื่อไฟล์ที่อัป
    if row.get("project") and plan.get("project") != row["project"]:
        if plan.get("project"):
            print(f"[publish] plan.project ({plan['project']}) ไม่ตรงคอลัมน์ project "
                  f"({row['project']}) — ยึดคอลัมน์")
        plan["project"] = row["project"]
    plan.setdefault("project", "clip")
    return plan


def finish_job(job_id, video_url, duration_seconds):
    """ปิดงานเป็น done + เขียนลิงก์กลับ marketing_content ถ้างานนี้ผูกกับคอนเทนต์"""
    rows = sb("PATCH", f"video_jobs?id=eq.{_q(job_id)}",
              {"status": "done",
               "video_url": video_url,
               "duration_seconds": round(float(duration_seconds), 2),
               "error": None,
               })
    if not rows:
        raise RuntimeError(
            f"อัปคลิปขึ้นแล้ว ({video_url}) แต่หาแถว {job_id} ไม่เจอตอนปิดงาน "
            "— แถวถูกลบระหว่างเรนเดอร์? ไฟล์ยังอยู่ใน storage ไม่ได้หายไปไหน"
        )

    content_id = rows[0].get("content_id")
    if not content_id:
        return                                  # เรนเดอร์เดี่ยว ไม่ได้ผูกกับคอนเทนต์

    # media_url / media_type มีมาตั้งแต่ migration 059 · media_type ถูก check constraint
    # จำกัดไว้แค่ image | video | none — ส่งค่าอื่น Postgres ปฏิเสธทั้งแถว
    #
    # ⚠️ ทับ media_url เดิมที่ poster_render.py เคยใส่โปสเตอร์ไว้ในคอลัมน์เดียวกัน
    # ตั้งใจ: คอนเทนต์ชิ้นหนึ่งมีสื่อได้ชิ้นเดียว การสั่งทำคลิปแปลว่าอยากใช้คลิป
    # ไฟล์โปสเตอร์เก่ายังอยู่ใน storage (ไม่ได้ลบ) กู้กลับได้ถ้าเปลี่ยนใจ
    #
    # ⚠️ ห้ามให้ขั้นนี้โยน exception ออกไป — บรรทัดบนปิดงานเป็น done ไปแล้ว ถ้าปล่อยขึ้นไป
    # main() จะจับแล้วสั่ง fail_job ทับงานที่ "เรนเดอร์เสร็จ อัปขึ้น storage แล้ว" ให้เป็น
    # failed (ทดสอบแล้วเกิดจริง: แถวจบลงด้วย status=failed ทั้งที่มี video_url ใช้ได้อยู่)
    # คนสั่งจะเห็นว่าพังแล้วกดเรนเดอร์ใหม่ = จ่ายค่า TTS กับเวลา Actions ซ้ำฟรี ๆ
    # การเขียนลิงก์กลับคอนเทนต์เป็นงานรอง ล้มแล้วแก้มือทีหลังได้ (คลิปอยู่ครบ)
    try:
        sb("PATCH", f"marketing_content?id=eq.{_q(content_id)}",
           {"media_url": video_url, "media_type": "video"})
        print(f"[publish] เขียนลิงก์กลับ marketing_content id={content_id} แล้ว")
    except Exception as e:
        # ::warning:: ทำให้ขึ้นบนหน้าสรุปของ Actions ด้วย ไม่ใช่จมอยู่ใน log ยาว ๆ
        # (พังเงียบตรงนี้ = คอนเทนต์ยังโชว์โปสเตอร์เก่าอยู่ โดยไม่มีใครรู้ว่าคลิปทำเสร็จแล้ว)
        # ต้องออก stdout เท่านั้น — runner แปลงคำสั่ง ::warning:: จาก stdout ของ step
        # ถ้าพิมพ์ลง stderr จะได้แค่ข้อความธรรมดา ไม่ขึ้นเป็น annotation
        print(f"::warning::คลิปเสร็จแล้วแต่เขียนลิงก์กลับ marketing_content id={content_id} "
              f"ไม่สำเร็จ — เอา {video_url} ไปใส่เองได้: {str(e)[:200]}")


def fail_job(job_id, message):
    """ตั้งสถานะ failed พร้อมข้อความ — ฟังก์ชันนี้ห้าม raise ไม่ว่าอะไรจะเกิดขึ้น

    คนเรียกอยู่ใน except อยู่แล้ว ถ้าตรงนี้โยน exception ซ้ำ ข้อความจริงจะถูกกลบด้วย
    "During handling of the above exception, another exception occurred" และงานก็ยัง
    ค้าง rendering เหมือนเดิม — พังสองต่อจากการพยายามรายงานว่าพัง

    เงื่อนไขเดียวที่ใส่คือ status=neq.done — กันการ "ป้ายงานที่สำเร็จแล้วว่าพัง" ซึ่งเกิดได้
    เมื่อมีอะไรล้มหลังจาก finish_job ปิดงานไปแล้ว (คลิปอยู่ใน storage เรียบร้อย แต่แถวกลับ
    บอกว่า failed → คนสั่งเรนเดอร์ใหม่ จ่ายค่า TTS ซ้ำโดยไม่จำเป็น)
    ไม่กรอง rendering/queued ออกโดยตั้งใจ เพื่อให้เรียกมือปลดงานที่ค้าง rendering
    จากรอบที่ถูกฆ่ากลางคันได้ด้วย (Actions timeout ไม่ได้ให้โอกาสเขียนอะไรกลับเลย)
    """
    text = (str(message) if message else "ไม่ทราบสาเหตุ")[:4000]   # หัวข้อความคือบรรทัดสรุป ตัดหางได้
    try:
        rows = sb("PATCH", f"video_jobs?id=eq.{_q(job_id)}&status=neq.done",
                  {"status": "failed", "error": text})
        if not rows:
            # 200 พร้อม [] = ไม่มีแถวไหนตรงเงื่อนไข · ปกติแปลว่างานปิดเป็น done ไปแล้ว
            # (แล้วค่อยมีอะไรล้มทีหลัง) หรือไม่ก็ id ผิด — ต้องบอก ไม่ใช่เงียบแล้วคืน True
            print(f"[publish] ไม่ได้ตั้ง failed ให้งาน {job_id} — แถวเป็น done ไปแล้ว "
                  "หรือหา id ไม่เจอ", file=sys.stderr)
            return False
        print(f"[publish] ตั้งสถานะ failed ให้งาน {job_id} แล้ว")
        return True
    except Exception as e:
        # เขียน DB ไม่ได้ก็ยังต้องให้ข้อความจริงโผล่ใน log ของ Actions ให้ได้
        print(f"[publish] เขียนสถานะ failed ไม่สำเร็จ: {str(e)[:200]}", file=sys.stderr)
        print(f"[publish] สาเหตุเดิมของงาน: {text[:800]}", file=sys.stderr)
        return False


# ── CLI ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="หยิบงานในคิว video_jobs มาเรนเดอร์แล้วอัปขึ้น storage")
    ap.add_argument("--job", required=True, help="video_jobs.id (uuid)")
    ap.add_argument("--no-align", action="store_true",
                    help="ไม่ใช้ whisper จับเวลา — เร็วขึ้นแต่ซับเลื่อน (เครื่องที่ไม่มี GPU)")
    a = ap.parse_args()

    job_id = a.job.strip()

    # จองนอก try โดยตั้งใจ — จองไม่สำเร็จแปลว่ายังไม่ใช่งานของเรา จะไปตั้ง failed
    # ให้แถวที่เครื่องอื่นกำลังทำอยู่ไม่ได้เด็ดขาด
    plan = claim_job(job_id)
    print(f"[publish] จองงาน {job_id} · project={plan.get('project')}")

    try:
        # import ตรงนี้ ไม่ใช่บนหัวไฟล์ ด้วยเหตุผลสองข้อ:
        #   1) claim/finish/fail ต้องเรียกได้จากเครื่องที่ไม่มี ffmpeg/torch/playwright
        #      (เช่นสคริปต์สั้น ๆ ที่แค่จะปลดงานค้าง หรือ API route ฝั่งอื่นในอนาคต)
        #   2) ถ้าเครื่องเรนเดอร์ลง dependency ไม่ครบ เราจับ ImportError ได้ที่นี่แล้วเขียน
        #      ลงคอลัมน์ error — ถ้า import ไว้ข้างบน มันจะตายก่อนถึงบรรทัดแรกของ main()
        #      คือตายแบบที่ไม่มีใครบันทึกอะไรไว้เลย
        from .make_video import build_video

        t0 = time.time()
        mp4, duration = build_video(plan, skip_align=a.no_align)
        print(f"[publish] เรนเดอร์เสร็จ {mp4} · ยาว {duration:.1f} วินาที "
              f"(ใช้เวลา {time.time()-t0:.0f} วิ)")

        url = upload_video(mp4, plan.get("project") or job_id)
        print(f"[publish] {url}")

        finish_job(job_id, url, duration)
        print("[publish] ปิดงานเป็น done เรียบร้อย")

    except BaseException as e:
        # จับถึง BaseException เพราะ KeyboardInterrupt (Ctrl+C กลางคัน) กับ SystemExit
        # คือเคสที่ทำให้แถวค้าง rendering บ่อยที่สุดตอนนั่งทดลองบนเครื่อง
        # และ "งานค้าง rendering ตลอดกาล" คือสิ่งเดียวที่ไฟล์นี้ตั้งใจไม่ให้เกิด
        msg = f"{e.__class__.__name__}: {e}\n\n{traceback.format_exc()}"
        print(msg, file=sys.stderr)
        fail_job(job_id, msg)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
