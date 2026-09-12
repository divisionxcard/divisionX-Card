// ── Server-side auth guard สำหรับ API routes ──────────────────
// ตรวจ Bearer token จาก header Authorization ด้วย service_role client
// แล้วเช็ค role จากตาราง profiles
//
// ใช้:
//   const gate = await requireUser(req)   // ต้อง login
//   if (gate.error) return gate.error
//   const { user } = gate
//
//   const gate = await requireAdmin(req)  // ต้องเป็น admin
//   if (gate.error) return gate.error
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function bearer(req) {
  const h = req.headers.get("authorization") || ""
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null
}

// คืน { user, profile } ถ้า login สำเร็จ, หรือ { error: NextResponse } ถ้าไม่
export async function requireUser(req) {
  const token = bearer(req)
  if (!token) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }
  const { data: profile } = await admin
    .from("profiles").select("id, role, username").eq("id", data.user.id).maybeSingle()
  return { user: data.user, profile }
}

// ── สิทธิ์ที่ระบบรู้จัก ───────────────────────────────────────
// admin     = ทำได้ทุกอย่าง
// user      = หน้าสต็อก/ยอดขาย/เตรียมของ (ไม่เห็นการตลาด ไม่เห็นจัดการผู้ใช้)
// marketing = **เห็นเฉพาะการตลาดกับโรงงานวิดีโอ** ไม่เห็นข้อมูลธุรกิจเลย
//             (เพิ่ม 12 ก.ย. 2026 — ดู migration 076)
export const ROLES = ["admin", "user", "marketing"]

// ต้องเป็น admin เท่านั้น
export async function requireAdmin(req) {
  const gate = await requireUser(req)
  if (gate.error) return gate
  if (gate.profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return gate
}

// งานการตลาด/วิดีโอ — admin หรือ marketing
//
// ⚠️ ใช้กับ route ของ /api/marketing/* และ /api/video/* เท่านั้น
//    route ที่แตะข้อมูลธุรกิจ (สต็อก ยอดขาย ซิงค์ตู้ จัดการผู้ใช้) ต้องคง requireAdmin ไว้
//    เพราะนี่คือด่านจริงที่กันบัญชีการตลาดออกจากข้อมูลพวกนั้น — การซ่อนเมนู
//    ในหน้าเว็บเป็นแค่ความสะดวก ไม่ใช่ความปลอดภัย
export async function requireMarketing(req) {
  const gate = await requireUser(req)
  if (gate.error) return gate
  const role = gate.profile?.role
  if (role !== "admin" && role !== "marketing") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return gate
}
