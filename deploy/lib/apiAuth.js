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

// ต้องเป็น admin เท่านั้น
export async function requireAdmin(req) {
  const gate = await requireUser(req)
  if (gate.error) return gate
  if (gate.profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return gate
}
