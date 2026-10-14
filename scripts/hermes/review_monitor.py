"""เฝ้าคิวตรวจคอนเทนต์ — monitor_script ของงาน cron "ตรวจคอนเทนต์ก่อนถึงมือเจ้าของ" (47c6603299a7)

Hermes รันสคริปต์นี้ก่อนทุกรอบ แล้วเทียบ output แบบไบต์ต่อไบต์กับรอบก่อน
  เหมือนเดิม → ไม่ปลุกโมเดล (ไม่เสียโทเคน ไม่มีข้อความ)
  เปลี่ยน    → ปลุกโมเดลตรวจ พร้อมแนบ diff ของคิว
  สคริปต์ล้ม → Hermes นับเป็น error ไม่ใช่ "เปลี่ยน" (ไม่ปลุกโมเดลมั่ว)

เกณฑ์ "รอตรวจ" ต้องตรงกับ dvx_data.query_content_for_review ทุกตัวอักษร:
  status เป็น pending หรือ draft และ review_verdict ยังว่าง
ถ้าเกณฑ์ตรงกัน พอโมเดลบันทึกผลครบ คิวจะว่าง → ปลุกอีก 1 รอบสั้น ๆ (ทูลตอบ waiting=0 แล้วจบ) แล้วนิ่ง

output ต้องนิ่ง: เรียงตาม id · ห้ามพิมพ์เวลาปัจจุบัน · ใส่ updated_at ของแต่ละชิ้นไว้
เพื่อให้เจ้าของแก้แคปชั่นที่ค้างอยู่แล้วโมเดลกลับมาตรวจใหม่

ไฟล์จริงที่ Hermes รัน: %LOCALAPPDATA%/hermes/scripts/review_monitor.py (ก๊อปจากไฟล์นี้)
ทดสอบมือ: python scripts/hermes/review_monitor.py
"""
import json
import pathlib
import sys
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DVX_ENV = pathlib.Path(r"C:\Projects\divisionX Card") / "deploy" / ".env.local"


def env_value(path, key):
    """อ่านค่าจากไฟล์ .env — utf-8-sig + split ที่ = ตัวแรก (ไฟล์ฝั่ง repo มี BOM และเป็น CRLF)"""
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return None
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.strip().strip('"').strip("'")
    return None


def main():
    base = env_value(DVX_ENV, "NEXT_PUBLIC_SUPABASE_URL")
    key = env_value(DVX_ENV, "SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        print("ไม่พบ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน deploy/.env.local")
        return 1
    query = (
        base.rstrip("/") + "/rest/v1/marketing_content"
        "?select=id,status,platform,content_format,revision_count,updated_at"
        "&status=in.(pending,draft)&review_verdict=is.null&order=id.asc"
    )
    req = urllib.request.Request(query, headers={"apikey": key, "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.load(resp)
    except urllib.error.HTTPError as e:
        print("ดึงคิวไม่ได้: HTTP", e.code, e.read()[:200].decode("utf-8", "replace"))
        return 1
    except Exception as e:  # DNS/timeout — ให้เป็น error ไม่ใช่การเปลี่ยน
        print("ดึงคิวไม่ได้:", type(e).__name__, str(e)[:160])
        return 1

    print(f"waiting={len(rows)}")
    for r in rows:
        print(
            f"#{r['id']} {r.get('status')} {r.get('platform')} {r.get('content_format')} "
            f"rev={r.get('revision_count') or 0} updated={(r.get('updated_at') or '')[:19]}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
