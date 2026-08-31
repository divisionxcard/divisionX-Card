#!/usr/bin/env python3
"""ทดสอบตัวไล่โมเดลของ idea_angles — แยก "ล้นชั่วคราว" ออกจาก "หมดโควตา"

รัน: py scripts/test_gemini_router.py
คืน exit 1 ถ้าจำแนกผิด หรือปลดโมเดลทิ้งทั้งที่เป็นอาการชั่วคราว

⚠️ ปลอมที่ชั้น urllib ไม่ใช่ปลอมที่ ask_gemini — เพื่อให้ ask_gemini + Router ตัวจริง
   ได้เดินจริงทั้งเส้น (บทเรียน 28 ส.ค.: ทดสอบที่แตะแต่ไลบรารีไม่พิสูจน์เส้นทางจริง)

เคสที่ต้องคุมให้ได้ — ของจริงที่เจอ 31 ส.ค. 2026 คือ 503 high demand ซึ่ง
เดิมถูกโยนออกไปเป็น error ทั้งชิ้น ทำให้ทั้งตาราง 60 แถวมี angles แค่ 5 แถว
"""
import io
import json
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "deploy" / "agents"))
sys.stdout.reconfigure(encoding="utf-8")

import idea_angles as ia  # noqa: E402

ia.GEMINI_KEY = "test-key"
ia.time.sleep = lambda s: None          # ไม่ต้องรอจริงตอนทดสอบ
VOICE = {"ollama_model": "qwen2.5:14b"}

fails = []


def check(name, got, want):
    ok = got == want
    print(f"  {'✓' if ok else '❌'} {name}")
    if not ok:
        print(f"      ได้ {got!r} · ควรเป็น {want!r}")
        fails.append(name)


def http_error(code, message):
    body = json.dumps({"error": {"code": code, "message": message}}).encode()
    return urllib.error.HTTPError("https://x", code, message, {}, io.BytesIO(body))


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def ok_body(text="[{\"label\":\"ก\",\"brief\":\"ข\"}]", finish="STOP"):
    return Resp(json.dumps({"candidates": [
        {"finishReason": finish, "content": {"parts": [{"text": text}]}}]}).encode())


def fake_net(plan):
    """plan: dict ชื่อโมเดล → list ของสิ่งที่จะตอบทีละครั้ง (Exception = โยน)"""
    calls = []

    def urlopen(req, timeout=None):
        model = req.full_url.split("/models/")[1].split(":")[0]
        calls.append(model)
        nxt = plan[model].pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    ia.urllib.request.urlopen = urlopen
    return calls


# ── 1. จำแนกอาการ ────────────────────────────────────────────────────────
print("── classify: สี่ทางต้องไม่ปนกัน ──")
check("503 high demand = ล้นชั่วคราว", ia.classify(503, "This model is experiencing high demand"), "spike")
check("500 = ล้นชั่วคราว", ia.classify(500, "internal"), "spike")
check("429 PerDay = โควตารายวัน", ia.classify(429, "GenerateRequestsPerDayPerProjectPerModel"), "day")
check("429 อื่น = ลิมิตต่อนาที", ia.classify(429, "GenerateRequestsPerMinute"), "minute")
check("404 = รุ่นตาย", ia.classify(404, "is no longer available"), "dead")
check("400 key ผิด = จบเลย ไม่ยิงซ้ำ", ia.classify(400, "API key not valid"), "fatal")

# ── 2. ล้นชั่วคราว: รอสั้น ๆ แล้วผ่านเอง (ไม่ต้องเปลี่ยนรุ่น) ──────────────
print("\n── ask_gemini: 503 แล้วหายเอง ──")
calls = fake_net({"gemini-flash-latest": [http_error(503, "high demand"), ok_body()]})
got = ia.ask_gemini("x", "gemini-flash-latest")
check("ยิงซ้ำรุ่นเดิมแล้วได้คำตอบ", (len(calls), bool(got)), (2, True))

print("\n── ask_gemini: 503 ไม่หาย → ขอเปลี่ยนรุ่นแบบไม่ถาวร ──")
calls = fake_net({"gemini-flash-latest": [http_error(503, "high demand")] * 3})
try:
    ia.ask_gemini("x", "gemini-flash-latest")
    check("โยน SwitchModel", False, True)
except ia.SwitchModel as e:
    check("ลองครบ 1 + 2 ครั้งก่อนยอมเปลี่ยน", len(calls), 3)
    check("ไม่ใช่การหมดถาวร", e.permanent, False)

print("\n── ask_gemini: เครือข่ายไม่ตอบ (คนละชนิด exception กับ 503) ──")
calls = fake_net({"gemini-flash-latest": [TimeoutError("read operation timed out"), ok_body()]})
got = ia.ask_gemini("x", "gemini-flash-latest")
check("ยิงใหม่ครั้งเดียวแล้วผ่าน", (len(calls), bool(got)), (2, True))

calls = fake_net({"gemini-flash-latest": [TimeoutError("t"), TimeoutError("t")]})
try:
    ia.ask_gemini("x", "gemini-flash-latest")
    check("โยน SwitchModel", False, True)
except ia.SwitchModel as e:
    check("ให้โอกาสเดียวเท่านั้น (แต่ละครั้งกินได้ถึง 90 วิ)", len(calls), 2)
    check("ไม่ใช่การหมดถาวร", e.permanent, False)

print("\n── ask_gemini: MAX_TOKENS ไม่เหลือข้อความ → เปลี่ยนรุ่น ──")
fake_net({"gemini-flash-latest": [ok_body(text="", finish="MAX_TOKENS")]})
try:
    ia.ask_gemini("x", "gemini-flash-latest")
    check("โยน SwitchModel", False, True)
except ia.SwitchModel as e:
    check("ขอเปลี่ยนรุ่น ไม่ใช่ยิงซ้ำรุ่นเดิม", e.permanent, False)

# ── 3. Router: จำเฉพาะที่หมดถาวร ────────────────────────────────────────
print("\n── Router: 503 ต้องไม่ปลดโมเดลดีทิ้งทั้งรอบ ──")
r = ia.Router(["gemini-flash-latest", "gemini-flash-lite-latest"], VOICE)
fake_net({
    "gemini-flash-latest": [http_error(503, "high demand")] * 3 + [ok_body()],
    "gemini-flash-lite-latest": [ok_body()],
})
r.ask("ชิ้นที่ 1")
check("ชิ้นที่ 1 ตกไปใช้รุ่นสำรอง", r.label, "gemini-flash-latest")   # label = ตัวที่จะเริ่มยิงรอบหน้า
check("ยังไม่ปลดรุ่นหลัก (i ไม่ขยับ)", r.i, 0)
r.ask("ชิ้นที่ 2")
check("ชิ้นที่ 2 กลับมาใช้รุ่นหลักได้", r.i, 0)

print("\n── Router: โควตารายวันหมด = ปลดถาวร ──")
r = ia.Router(["gemini-flash-latest", "gemini-flash-lite-latest"], VOICE)
fake_net({
    "gemini-flash-latest": [http_error(429, "GenerateRequestsPerDayPerProjectPerModel")],
    "gemini-flash-lite-latest": [ok_body(), ok_body()],
})
r.ask("ชิ้นที่ 1")
check("ปลดรุ่นหลักถาวร", r.i, 1)
r.ask("ชิ้นที่ 2")
check("ชิ้นที่ 2 ไม่แวะรุ่นที่หมดแล้ว", r.label, "gemini-flash-lite-latest")

print("\n── Router: หมดถาวรทุกรุ่น → ถอยไป Ollama ──")
r = ia.Router(["gemini-flash-latest", "gemini-flash-lite-latest"], VOICE)
fake_net({m: [http_error(429, "GenerateRequestsPerDay")] for m in r.chain})
ia.ask_ollama = lambda prompt, voice: "[]"
r.ask("ชิ้นที่ 1")
check("สลับไป Ollama", r.on_ollama, True)

print("\n── Router: ล้นชั่วคราวทุกรุ่น → ข้ามชิ้นนี้ ไม่ใช่ถอยไป Ollama ──")
r = ia.Router(["gemini-flash-latest", "gemini-flash-lite-latest"], VOICE)
fake_net({m: [http_error(503, "high demand")] * 3 for m in r.chain})
try:
    r.ask("ชิ้นที่ 1")
    check("โยนต่อให้ main นับเป็นชิ้นที่ล้ม", False, True)
except ia.SwitchModel:
    check("ไม่ถอยไป Ollama เพราะ Gemini ยังไม่ได้หมดจริง", r.on_ollama, False)
    check("ยังไม่ปลดรุ่นไหนเลย", r.i, 0)

print()
if fails:
    print(f"❌ ไม่ผ่าน {len(fails)} ข้อ: {' · '.join(fails)}")
    sys.exit(1)
print("✅ ผ่านครบทุกข้อ")
