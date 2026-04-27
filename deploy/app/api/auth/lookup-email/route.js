import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

// POST /api/auth/lookup-email
//   body: { username }
//   200 { email } | 404 generic | 400 invalid
// ใช้ตอน login: รับ username → ส่งกลับ email เพื่อ signInWithPassword
// ⚠ return 404 generic เสมอเพื่อกัน username enumeration
export async function POST(req) {
  try {
    const { username } = await req.json().catch(() => ({}))
    const u = (username || "").trim().toLowerCase()

    if (!u || !USERNAME_RE.test(u)) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 })
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("username", u)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 })
    }

    const { data: { user }, error } = await adminClient.auth.admin.getUserById(profile.id)
    if (error || !user?.email) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 })
    }

    return NextResponse.json({ email: user.email })
  } catch {
    return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 })
  }
}
