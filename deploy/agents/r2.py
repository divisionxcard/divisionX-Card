"""Cloudflare R2 (คลังวิดีโอ/รูปการตลาด) — ตัวเซ็นลิงก์ S3 SigV4 ด้วย stdlib ล้วน (ไม่ต้องลง boto3)

23 ต.ค. 2026: ย้ายไฟล์หนักออกจาก Supabase Storage — แพ็กเกจฟรีของ Supabase มี Storage 1 GB และดาวน์โหลด 5 GB/เดือน
ใช้ร่วมกับฐานข้อมูลทั้งองค์กร ถ้าวิดีโอกินเกิน โปรเจกต์โดนจำกัด (402) แล้วซิงค์ยอดขาย/สต็อกรายวันตายตาม
R2: เก็บฟรี 10 GB · ดาวน์โหลดฟรีไม่จำกัด · bucket ส่วนตัว (ลิงก์ r2.dev จำกัดความเร็ว ใช้ได้แค่ทดสอบ) → ใช้ลิงก์ลงชื่อแทน

env: R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET (deploy/.env.local หรือ GitHub secrets)
คีย์เป็น "Object Read & Write" เฉพาะ bucket นี้ — ตั้ง CORS/สร้าง bucket ไม่ได้ (ทำในหน้า Cloudflare)

ฝั่งเว็บมีตัวเซ็นคู่กันที่ deploy/lib/r2.js — แก้วิธีเซ็นต้องแก้สองที่
รัน:  python -m agents.r2 --selftest
"""
import datetime
import hashlib
import hmac
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

try:
    from .envload import load_env_local
except ImportError:                                     # รันเป็นไฟล์เดี่ยว
    from envload import load_env_local

load_env_local()

REGION, SERVICE = "auto", "s3"
# ลิงก์ถาวรของไฟล์ = หน้า /media/<key> ของเว็บ (302 ไปลิงก์ลงชื่อ · app/media/[...key]/route.js)
SITE = (os.environ.get("NEXT_PUBLIC_SITE_URL") or "https://division-x-card.vercel.app").rstrip("/")
MEDIA_BASE = f"{SITE}/media/"
LEGACY_MARKER = "/storage/v1/object/public/marketing/"     # ลิงก์ Supabase เดิม (ก่อนย้าย 23 ต.ค. 2026) · key เดียวกัน


def _cfg():
    acc, key, sec = (os.environ.get(k, "").strip() for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"))
    if not (acc and key and sec):
        raise RuntimeError("ยังไม่ได้ตั้งคีย์ R2 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)")
    return acc, key, sec, os.environ.get("R2_BUCKET", "dvx-media").strip() or "dvx-media"


def configured():
    try:
        _cfg()
        return True
    except RuntimeError:
        return False


def _q(s, safe="-_.~"):
    return urllib.parse.quote(str(s), safe=safe)


def _hmac(k, msg):
    return hmac.new(k, msg.encode("utf-8"), hashlib.sha256).digest()


def presign(method, key="", expires=3600, query=None):
    """ลิงก์ลงชื่อ (query-string SigV4) — เบราว์เซอร์/urllib ใช้ตรงได้ ไม่ต้องแนบ header ลายเซ็น
    key = path ใน bucket (ว่าง = ระดับ bucket เช่น list) · expires ≤ 7 วัน"""
    acc, ak, sk, bucket = _cfg()
    host = f"{acc}.r2.cloudflarestorage.com"
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    scope = f"{day}/{REGION}/{SERVICE}/aws4_request"
    uri = "/" + _q(bucket) + ("/" + _q(key, safe="-_.~/") if key else "")
    params = dict(query or {})
    params.update({
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": f"{ak}/{scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(int(min(max(expires, 1), 604800))),
        "X-Amz-SignedHeaders": "host",
    })
    qs = "&".join(f"{_q(k)}={_q(v)}" for k, v in sorted(params.items()))
    canonical = "\n".join([method.upper(), uri, qs, f"host:{host}\n", "host", "UNSIGNED-PAYLOAD"])
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = _hmac(_hmac(_hmac(_hmac(("AWS4" + sk).encode(), day), REGION), SERVICE), "aws4_request")
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    return f"https://{host}{uri}?{qs}&X-Amz-Signature={sig}"


def media_url(key):
    return MEDIA_BASE + "/".join(urllib.parse.quote(p, safe="-_.~") for p in key.split("/"))


def key_of(url):
    """ลิงก์ไฟล์ของเรา (/media/ แบบใหม่ หรือ Supabase marketing แบบเดิม) → key · ไม่ใช่ของเรา = None"""
    if not isinstance(url, str):
        return None
    rest = None
    if url.startswith(MEDIA_BASE):
        rest = url[len(MEDIA_BASE):]
    elif LEGACY_MARKER in url and ".supabase.co" in url:
        rest = url.split(LEGACY_MARKER, 1)[1]
    elif "/media/" in url and (".vercel.app/" in url or "://localhost" in url):
        rest = url.split("/media/", 1)[1]
    if not rest:
        return None
    key = urllib.parse.unquote(rest.split("?", 1)[0])
    return None if (".." in key or key.startswith("/")) else key


def upload(src, key, content_type="application/octet-stream"):
    """อัปไฟล์ (path หรือ bytes) → ลิงก์ถาวร /media/<key>"""
    if isinstance(src, (bytes, bytearray)):
        put_bytes(bytes(src), key, content_type)
    else:
        put_file(src, key, content_type)
    return media_url(key)


def _req(method, url, data=None, headers=None, timeout=300):
    r = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.status, resp.read()


def put_file(path, key, content_type="application/octet-stream"):
    """อัปไฟล์ในเครื่องขึ้น R2 (PUT ครั้งเดียว · R2 รับได้ถึง 5 GB ต่อครั้ง)"""
    with open(path, "rb") as f:
        body = f.read()
    return put_bytes(body, key, content_type)


def put_bytes(body, key, content_type="application/octet-stream"):
    status, _ = _req("PUT", presign("PUT", key, 900), body, {"Content-Type": content_type})
    return status


def get_bytes(key):
    return _req("GET", presign("GET", key, 900))[1]


def download(key, dest):
    url = presign("GET", key, 3600)
    with urllib.request.urlopen(url, timeout=600) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return dest


def head(key):
    """ขนาดไฟล์ (byte) หรือ None ถ้าไม่มี"""
    try:
        r = urllib.request.Request(presign("HEAD", key, 300), method="HEAD")
        with urllib.request.urlopen(r, timeout=30) as resp:
            return int(resp.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def delete(key):
    return _req("DELETE", presign("DELETE", key, 900))[0]


def list_keys(prefix="", limit=1000):
    """[(key, size, last_modified)] — ไล่หน้าให้ครบ (ListObjectsV2)"""
    out, token = [], None
    ns = "{http://s3.amazonaws.com/doc/2006-03-01/}"
    while True:
        q = {"list-type": "2", "max-keys": str(min(limit, 1000)), "prefix": prefix}
        if token:
            q["continuation-token"] = token
        _, body = _req("GET", presign("GET", "", 900, q))
        root = ET.fromstring(body)
        for c in root.findall(f"{ns}Contents"):
            out.append((c.findtext(f"{ns}Key"), int(c.findtext(f"{ns}Size") or 0), c.findtext(f"{ns}LastModified")))
        if root.findtext(f"{ns}IsTruncated") != "true" or len(out) >= limit:
            return out
        token = root.findtext(f"{ns}NextContinuationToken")


def _selftest():
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    key = f"_selftest/{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.txt"
    print("list ก่อน:", len(list_keys("_selftest/")), "ไฟล์")
    print("PUT:", put_bytes("ทดสอบ R2 ✓".encode("utf-8"), key, "text/plain; charset=utf-8"))
    print("GET:", get_bytes(key).decode("utf-8"))
    print("list หลัง:", [k for k, *_ in list_keys("_selftest/")])
    # CORS: จำลองเบราว์เซอร์ที่หน้าเว็บจริงถามก่อนอัป
    url = presign("PUT", key, 600)
    for origin in ("https://division-x-card.vercel.app", "http://localhost:3000"):
        r = urllib.request.Request(url, method="OPTIONS", headers={
            "Origin": origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type"})
        try:
            with urllib.request.urlopen(r, timeout=30) as resp:
                print("CORS", origin, resp.status, resp.headers.get("Access-Control-Allow-Origin"), resp.headers.get("Access-Control-Allow-Methods"))
        except urllib.error.HTTPError as e:
            print("CORS", origin, "ไม่ผ่าน", e.code, e.read()[:200])
    print("DELETE:", delete(key))
    print("list สุดท้าย:", len(list_keys("_selftest/")), "ไฟล์")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        print(__doc__)
