import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// ใช้ Service Role Key เฉพาะ server-side เท่านั้น (ไม่เปิดเผยใน browser)
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/admin/users — ดึงรายชื่อผู้ใช้ทั้งหมด
export async function GET() {
  try {
    const { data: { users }, error } = await adminClient.auth.admin.listUsers()
    if (error) throw error

    const { data: profiles } = await adminClient.from("profiles").select("*")
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))

    const result = users
      .map(u => ({
        id:           u.id,
        email:        u.email,
        display_name: profileMap[u.id]?.display_name || "",
        role:         profileMap[u.id]?.role || "user",
        created_at:   u.created_at,
      }))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/admin/users — เพิ่มผู้ใช้ใหม่
export async function POST(req) {
  try {
    const { email, password, display_name, role } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "กรุณากรอก email และ password" }, { status: 400 })
    }

    const { data: { user }, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,  // ยืนยัน email ทันที ไม่ต้องส่ง email
    })
    if (error) throw error

    // สร้าง profile
    await adminClient.from("profiles").upsert({
      id:           user.id,
      display_name: display_name || email.split("@")[0],
      role:         role || "user",
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

// DELETE /api/admin/users — ลบผู้ใช้
export async function DELETE(req) {
  try {
    const { userId } = await req.json()
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
