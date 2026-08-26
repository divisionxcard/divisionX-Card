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
import os
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
ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def env():
    """อ่านจากไฟล์ก่อน (รันในเครื่อง) ไม่มีก็ใช้ env var (รันใน GitHub Actions)"""
    for src in (HERE.parent / ".env.local", HERE / ".env"):
        if not src.exists():
            continue
        out = {}
        for ln in src.read_text(encoding="utf-8").splitlines():
            if "=" in ln and not ln.strip().startswith("#"):
                k, v = ln.split("=", 1)
                out[k.strip()] = v.strip()
        if out.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"):
            return out

    # CI — ชื่อ secret ฝั่ง GitHub ต่างจากฝั่งเว็บ รับทั้งสองแบบ
    out = {
        "NEXT_PUBLIC_SUPABASE_URL":
            os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", ""),
        "NEXT_PUBLIC_SUPABASE_ANON_KEY":
            os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
            or os.environ.get("SUPABASE_ANON_KEY", ""),
        "SUPABASE_SERVICE_ROLE_KEY":
            os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_SERVICE_KEY", ""),
    }
    if out["NEXT_PUBLIC_SUPABASE_URL"] and out["NEXT_PUBLIC_SUPABASE_ANON_KEY"]:
        return out
    # ⚠️ ออกด้วยรหัส 2 ไม่ใช่ 1 — "รันไม่ได้" กับ "ฐานข้อมูลรั่ว" คนละเรื่องกัน
    #    ถ้าใช้รหัสเดียวกัน CI จะยิงแจ้งเตือนว่าฐานข้อมูลรั่วทั้งที่แค่ไม่มีคีย์
    #    = เตือนหลอก ซึ่งทำให้คนเลิกเชื่อการแจ้งเตือนทั้งระบบ
    print("❌ ต้องมี anon key — รันในเครื่องให้ใส่ใน deploy/.env.local\n"
          "   รันใน CI ให้ตั้ง secret SUPABASE_ANON_KEY (+ SUPABASE_URL)\n"
          "   ⚠️ anon key ไม่ใช่ความลับ (อยู่ใน bundle หน้าเว็บอยู่แล้ว) แต่ต้องมีถึงจะทดสอบได้",
          file=sys.stderr)
    raise SystemExit(2)


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
    """ถูกบล็อกเพราะไม่มีสิทธิ์จริงหรือเปล่า — ดู SQLSTATE ไม่ใช่แค่รหัส HTTP

    42501 = permission denied  → ถูกบล็อกจริง
    55000 = view เขียนไม่ได้เชิงโครงสร้าง (มี GROUP BY / join หลายตาราง)
            ไม่เกี่ยวกับสิทธิ์ แต่ก็เขียนไม่ได้อยู่ดี → นับว่าปลอดภัย
    """
    s = str(msg)
    return (code in (401, 403) or "42501" in s or "55000" in s
            or "permission denied" in s.lower() or "not automatically updatable" in s.lower())


def classify_write(code, msg):
    """แยก 3 สถานะ — เทสต์ที่เตือนหลอกจะไม่มีใครเชื่อ ต้องบอกให้ตรง

    blocked  ไม่มีสิทธิ์จริง (42501)
    n/a      ทดสอบไม่ได้ ไม่ใช่ช่องโหว่:
               55000 view เขียนไม่ได้เชิงโครงสร้าง (มี GROUP BY / join หลายตาราง)
               42703 ไม่มีคอลัมน์ที่ใช้เป็นเงื่อนไข (view ส่วนใหญ่ไม่มี id)
               22P02 ชนิดข้อมูลไม่ตรง แม้ลองซ้ำด้วย uuid แล้ว
    open     ผ่านด่านสิทธิ์ = ถ้าใส่เงื่อนไขจริงจะลบได้ → ช่องโหว่
    """
    s = str(msg)
    if code in (401, 403) or "42501" in s or "permission denied" in s.lower():
        return "blocked"
    if any(c in s for c in ("55000", "42703", "22P02")) or code in (404, 405) or code == 0:
        return "n/a"
    return "open"


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
        # ⚠️ id ของบางตารางเป็น uuid — ส่งเลขติดลบเข้าไปจะตาย 22P02 ตั้งแต่ก่อนถึง
        #    ชั้นสิทธิ์ แล้วจะถูกอ่านผิดว่า "ลบได้" (false positive · เจอตอนตรวจ
        #    profiles กับ slot_restock_sessions หลังรัน migration 069)
        #    → ถ้าเจอ 22P02 ให้ยิงซ้ำด้วยค่ารูปแบบ uuid
        dc, _, dm = call("DELETE", f"{t}?{NOMATCH}", ANON)
        if "22P02" in str(dm):
            dc, _, dm = call("DELETE", f"{t}?id=eq.{ZERO_UUID}", ANON)
        write = classify_write(dc, dm)
        deletable = write == "open"

        if readable:
            bad_read.append((t, n, sens))
        if deletable:
            bad_write.append(t)
        wtxt = {"open": "🔴 ได้", "blocked": "🟢 บล็อก", "n/a": "⚪ ทดสอบไม่ได้"}[write]
        print(f"{t:<30}"
              f"{('🔴 ' + str(n) + ' แถว') if readable else '🟢 บล็อก':<16}"
              f"{wtxt:<16}"
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
