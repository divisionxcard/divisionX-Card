// ดึงข้อมูลให้หน้าสาธารณะ (/branches /products) — ฝั่งเซิร์ฟเวอร์เท่านั้น
//
// ⚠️ ทำไมต้องมีไฟล์นี้ — เคสจริง 26 ส.ค. 2026:
//   หน้า /branches กับ /products ดึงข้อมูลด้วย fetch() ตรง ๆ พร้อม **anon key**
//   พอเปิด RLS (migration 069) anon อ่านไม่ได้แล้ว ทั้งสองหน้าเลย**ว่างเปล่า**
//   แต่ยังตอบ HTTP 200 เพราะโค้ดเขียน `if (!res.ok) return []` กับ `catch { return [] }`
//   → ตรวจด้วย curl แล้วเห็น 200 เลยคิดว่าไม่พัง ทั้งที่พังไปแล้ว
//
//   สองหน้านี้เป็น **server component** (ไม่มี "use client") ข้อมูลถูกดึงตอน build/ISR
//   ฝั่งเซิร์ฟเวอร์ จึงใช้ service key ได้ปลอดภัย คีย์ไม่มีทางไปโผล่ในเบราว์เซอร์
//
//   ทางเลือกที่ไม่เอา: เปิดสิทธิ์ anon ให้ตาราง skus — เพราะ RLS เป็น row-level
//   ไม่ใช่ column-level ถ้าเปิดอ่าน คนนอกจะเห็น **cost_price** ซึ่งเป็นต้นทุนของเรา
//   ทั้งที่หน้าเว็บใช้แค่ชื่อกับราคาขาย
//
// ⚠️ ห้าม import ไฟล์นี้จาก client component เด็ดขาด — service key จะหลุดเข้า bundle

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL

/**
 * ยิง PostgREST ด้วย service key แล้วคืน array
 *
 * ล้มเหลว → คืน [] เพื่อให้หน้ายัง render ได้ (ไม่ทำทั้งหน้า 500)
 * แต่ **log ให้ดังพอ** จะได้ไม่พังเงียบแบบเดิมอีก — ดูได้ที่ Vercel → Logs
 *
 * @param {string} path เช่น "machines?status=eq.active&select=machine_id,config"
 * @param {string} label ชื่อไว้แสดงใน log
 * @returns {Promise<Array>}
 */
export async function fetchPublic(path, label = path.split("?")[0]) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    console.error(
      `[${label}] ❌ ไม่มี SUPABASE_SERVICE_ROLE_KEY — หน้าจะว่างเปล่า\n` +
      `   ต้องตั้งใน Vercel → Settings → Environment Variables (ติ๊ก Production + Preview)`
    )
    return []
  }
  // ⚠️ ต้องมี retry — เจอจริง 26 ส.ค. 2026:
  //   render รอบแรกหลัง deploy ยิงพลาดครั้งเดียว (cold start) ได้ [] กลับมา
  //   แล้ว **ผลว่างนั้นถูก ISR cache ไว้ 60 วินาที** → หน้า /products หายคำว่า
  //   "ทั้ง 12 สาขา" ไปทั้งนาที ทั้งที่ฐานข้อมูลปกติดี
  //   ยิงพลาดครั้งเดียวไม่ควรทำให้ลูกค้าเห็นหน้าไม่ครบ
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 60 },
      })
      if (!res.ok) {
        console.error(`[${label}] ❌ ครั้งที่ ${attempt} HTTP ${res.status} — `
          + `${(await res.text()).slice(0, 200)}`)
      } else {
        const rows = await res.json()
        if (Array.isArray(rows) && rows.length) return rows
        console.warn(`[${label}] ⚠️ ครั้งที่ ${attempt} ดึงสำเร็จแต่ได้ 0 แถว`)
        if (Array.isArray(rows)) return rows       // ว่างจริง ไม่ต้องลองซ้ำ
      }
    } catch (e) {
      console.error(`[${label}] ❌ ครั้งที่ ${attempt} ${e?.name}: `
        + `${String(e?.message).slice(0, 200)}`)
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 400))
  }
  console.error(`[${label}] ❌ ยิงล้มเหลว 2 ครั้ง — หน้าจะแสดงข้อมูลไม่ครบ`)
  return []
}

/**
 * จำนวนสาขาที่แสดงต่อสาธารณะ — นับจากฐานข้อมูล ไม่ใช่เลขตายตัวในโค้ด
 *
 * ⚠️ ทำไมต้องมี — เจ้าของทักเอง 26 ส.ค. 2026:
 *   /products กับ /how-to เขียน "ทั้ง 11 สาขา" ตายตัวไว้ในโค้ด
 *   ตอนเขียนถูก แต่พอเปิดตู้เพิ่มก็ไม่มีใครกลับมาแก้ → ของจริงเป็น 12 แล้ว
 *   ส่วน /branches นับจาก DB จึงถูกอยู่ตลอด = สองหน้าบอกเลขไม่ตรงกัน
 *   ลูกค้าเห็นแล้วสับสน และเสียความน่าเชื่อถือของหน้าที่แชร์ออกโซเชียล
 *
 * นับด้วยเงื่อนไขเดียวกับที่ /branches ใช้แสดงการ์ด:
 *   ตู้ status = active  และ  config.branch.public = true
 * ตู้ที่ปิดไปแล้ว (เช่น wwv02) จะไม่ถูกนับ
 *
 * @returns {Promise<number>} 0 ถ้าอ่านข้อมูลไม่ได้ — ผู้เรียกต้องเผื่อกรณีนี้
 */
export async function branchCount() {
  const rows = await fetchPublic(
    "machines?status=eq.active&select=machine_id,config", "branch-count")
  return rows.filter((m) => m.config?.branch?.public).length
}

export default { fetchPublic, branchCount }
