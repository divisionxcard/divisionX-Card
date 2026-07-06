// ── Client-side fetch ที่แนบ Supabase access token อัตโนมัติ ──
// ใช้แทน fetch() เวลาเรียก API route ที่ต้อง login
//   import { authFetch } from "@/lib/authFetch"
//   const res = await authFetch("/api/admin/users", { method: "POST", body: ... })
import { supabase } from "./supabase"

export async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const headers = new Headers(options.headers || {})
  if (token) headers.set("Authorization", `Bearer ${token}`)
  return fetch(url, { ...options, headers })
}
