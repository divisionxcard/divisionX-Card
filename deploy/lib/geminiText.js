// เรียก Gemini แบบทนล้ม — ใช้ร่วมกันทุก route ที่ให้ AI เขียนข้อความ
//
// ย้ายออกมาจาก api/marketing/content/generate/route.js หลังเจอว่า route ใหม่
// (บรีฟสั่งทำภาพ) ยิงครั้งเดียวแล้วเจอ 503 ทันทีในการทดสอบครั้งแรก
// ถ้าปล่อยให้แต่ละ route เขียนตัวลองซ้ำเอง เดี๋ยวก็มีที่ลืมใส่อีก
//
// ⚠️ ยังค้าง: generate/route.js ยังใช้สำเนาของตัวเองอยู่ เพราะมันแปลง error เป็นข้อความไทย
// ที่ผูกกับชื่อโมเดลที่ล้ม (เช่น 'ใช้โควตาฟรีของ "xxx" ครบแล้ววันนี้') ซึ่งไฟล์นี้ยังไม่รองรับ
// **route ใหม่ทุกตัวให้ใช้ไฟล์นี้** และถ้าจะแก้ตรรกะลองซ้ำ ต้องแก้ทั้งสองที่จนกว่าจะย้ายเสร็จ
//
// ความล้มเหลวของ Gemini มี 4 แบบ ต้องแยกกันคนละทาง:
//   503 / high demand / overloaded  ชั่วคราว  → รอแล้วลองซ้ำ
//   429 PerDay                      โควตาหมด  → สลับโมเดล (โควตานับแยกตามโมเดล)
//   429 PerMinute                   ยิงถี่ไป  → รอแล้วลองซ้ำ
//   404 no longer available         รุ่นตาย   → สลับโมเดล
const BASE = "https://generativelanguage.googleapis.com/v1beta"

// ⚠ ตรวจของจริงก่อนใส่ชื่อ — 2026-08-17 ยิงแล้วพบว่า gemini-2.0-flash-lite /
// 2.5-flash / 2.5-flash-lite ตายหมด (404) เหลือสองตัวนี้ที่ใช้ได้
export const GEMINI_CHAIN = ["gemini-flash-latest", "gemini-flash-lite-latest"]

const sleep = ms => new Promise(r => setTimeout(r, ms))

const isTransient = (status, msg) =>
  status === 503 || status === 500 || status === 502 ||
  /high demand|overloaded|unavailable|try again later/i.test(msg || "")

const isDailyQuota = msg => /per day|daily|GenerateRequestsPerDay/i.test(msg || "")

async function once(model, prompt, opts) {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      ...(opts.system ? { system_instruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // 2048 ไม่ใช่เพราะข้อความยาว แต่รุ่นใหม่ "คิด" ก่อนตอบ และ thinking กินโควตา output ด้วย
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
      },
    }),
    signal: AbortSignal.timeout(opts.timeout ?? 60000),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`
    const e = new Error(msg)
    if (isTransient(res.status, msg)) e.retryable = true
    else if (res.status === 429) { if (isDailyQuota(msg)) e.switchModel = true; else e.retryable = true }
    else if (/no longer available|not found|is not supported/i.test(msg)) e.switchModel = true
    e.status = res.status
    throw e
  }

  const cand = json?.candidates?.[0]
  const text = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join("\n").trim()
  if (!text && cand?.finishReason === "MAX_TOKENS") {
    // ใช้โควตาไปกับการคิดจนไม่เหลือเขียน — รุ่น lite คิดน้อยกว่า ลองตัวถัดไปดีกว่ายิงซ้ำรุ่นเดิม
    const e = new Error("โมเดลใช้โควตาไปกับการคิดจนไม่เหลือเขียน")
    e.switchModel = true
    throw e
  }
  return { text, model }
}

/** เรียก Gemini พร้อมลองซ้ำและสลับโมเดลให้เอง · คืน { text, model } หรือโยน error ตัวสุดท้าย */
export async function askGeminiText(prompt, opts = {}) {
  if (!process.env.GEMINI_API_KEY) throw new Error("ยังไม่ได้ตั้ง GEMINI_API_KEY")
  const first = opts.model || process.env.GEMINI_MODEL || GEMINI_CHAIN[0]
  const chain = [first, ...GEMINI_CHAIN.filter(m => m !== first)]
  let lastErr
  for (const model of chain) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await once(model, prompt, opts)
      } catch (e) {
        lastErr = e
        if (e.switchModel) break
        if (!e.retryable || attempt === 2) break
        await sleep(attempt * 1500)   // 1.5s แล้ว 3s — ปล่อยให้คลื่นคนใช้ผ่านไปก่อน
      }
    }
  }
  throw lastErr || new Error("Gemini เรียกไม่สำเร็จ")
}
