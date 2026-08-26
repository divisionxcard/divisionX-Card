"""ตรวจว่าคนภายนอกยังเข้าถึงฐานข้อมูลได้อยู่ไหม

ใช้ **anon key** ยิงทุกตาราง — คีย์เดียวกับที่ฝังอยู่ในหน้าเว็บ
(NEXT_PUBLIC_SUPABASE_ANON_KEY · ใครเปิด DevTools ก็เห็น ไม่ใช่ความลับ)

ทำไมต้องทดสอบด้วย anon ไม่ใช่ service key:
    service key ข้าม RLS อยู่แล้ว ทดสอบด้วยตัวนั้นจะไม่เห็นช่องโหว่เลย

รัน:
    py -3 deploy/scraper/rls_check.py

คืน exit code 0 ถ้าปลอดภัย · 1 ถ้ายังมีตารางที่เข้าถึงได้
เอาไปใส่ CI ได้ถ้าอยากกันไม่ให้หลุดอีก

⚠️ อ่านอย่างเดียว การทดสอบเขียน/ลบใช้เงื่อนไข id = -999999 ซึ่งไม่ match แถวจริง
   ดูแค่ "รหัสตอบกลับ" ว่าผ่านด่านสิทธิ์ไหม ไม่ได้แตะข้อมูลจริง
"""
import json
import pathlib
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = pathlib.Path(__file__).resolve().parent

# คอลัมน์ที่ถ้าหลุดถือว่าร้ายแรงกว่าข้อมูลทั่วไป
SENSITIVE = ("email", "password", "phone", "token", "secret", "ip_address",
             "user_agent", "display_name", "user_id", "requester_id", "created_by")
NOMATCH = "id=eq.-999999"


def env():
    for src in (HERE.parent / ".env.local", HERE / ".env"):
        if not src.exists():
            continue
        out = {}
        for ln in src.read_text(encoding="utf-8").splitlines():
            if "=" in ln and not ln.strip().startswith("#"):
                k, v = ln.split("=", 1)
                out[k.strip()] = v.strip()
        if "NEXT_PUBLIC_SUPABASE_ANON_KEY" in out:
            return out
    raise SystemExit("❌ หา NEXT_PUBLIC_SUPABASE_ANON_KEY ไม่เจอใน deploy/.env.local")


E = env()
URL = E["NEXT_PUBLIC_SUPABASE_URL"]
ANON = E["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
SVC = E.get("SUPABASE_SERVICE_ROLE_KEY")


def call(method, path, key, body=None):
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "Range": "0-0", "Prefer": "count=exact"}
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            n = r.headers.get("Content-Range", "?/?").split("/")[-1]
            data = json.load(r) if method == "GET" else []
            return r.status, n, data
    except urllib.error.HTTPError as e:
        return e.code, "-", e.read().decode()[:120]
    except Exception as e:                                       # noqa: BLE001
        return 0, "-", str(e)[:90]


def blocked(code, msg):
    return code in (401, 403) or "42501" in str(msg) or "permission denied" in str(msg).lower()


def main():
    spec = json.load(urllib.request.urlopen(urllib.request.Request(
        f"{URL}/rest/v1/", headers={"apikey": SVC or ANON,
                                    "Authorization": f"Bearer {SVC or ANON}"}), timeout=60))
    rels = sorted(k.lstrip("/") for k in spec.get("paths", {})
                  if k != "/" and not k.startswith("/rpc/"))

    print(f"ยิง {len(rels)} ตาราง/วิว ด้วย anon key\n")
    print(f"{'ตาราง':<30}{'อ่าน':<16}{'ลบ':<16}ข้อมูลอ่อนไหวที่หลุด")
    print("─" * 96)

    bad_read, bad_write = [], []
    for t in rels:
        rc, n, data = call("GET", f"{t}?select=*", ANON)
        # ⚠️ ต้องรับ 206 ด้วย — PostgREST คืน "206 Partial Content" เมื่อมีแถวมากกว่า
        #    ที่ Range ขอ ถ้าเช็กแค่ == 200 ตารางที่มีข้อมูลจะถูกรายงานว่า "บล็อก"
        #    ทั้งที่อ่านได้ = false negative ที่ทำให้คิดว่าปลอดภัยแล้ว (เจอตอนเขียนไฟล์นี้)
        readable = not blocked(rc, data) and rc in (200, 206)
        sens = []
        if readable and isinstance(data, list) and data:
            sens = [c for c in data[0] if any(s in c.lower() for s in SENSITIVE)]
        dc, _, dm = call("DELETE", f"{t}?{NOMATCH}", ANON)
        deletable = not blocked(dc, dm) and dc != 0 and dc not in (404, 405)

        if readable:
            bad_read.append((t, n, sens))
        if deletable:
            bad_write.append(t)
        print(f"{t:<30}"
              f"{('🔴 ' + str(n) + ' แถว') if readable else '🟢 บล็อก':<16}"
              f"{'🔴 ได้' if deletable else '🟢 บล็อก':<16}"
              f"{', '.join(sens) if sens else ''}")

    print("\n" + "=" * 96)
    if not bad_read and not bad_write:
        print("🟢 ปลอดภัย — คนที่ไม่ล็อกอินเข้าถึงอะไรไม่ได้เลย")
        return 0

    print(f"🔴 อ่านได้โดยไม่ล็อกอิน {len(bad_read)} · ลบได้ {len(bad_write)}")
    leak = [(t, n, s) for t, n, s in bad_read if s]
    if leak:
        print("\n   ข้อมูลส่วนบุคคลที่หลุด:")
        for t, n, s in leak:
            print(f"     {t:<28}{n} แถว → {', '.join(s)}")
    print("\n   แก้โดยรัน backend/database/migrations/069_enable_rls.sql")
    print("   ใน Supabase Dashboard → SQL Editor")
    return 1


if __name__ == "__main__":
    sys.exit(main())
