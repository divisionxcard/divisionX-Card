import { NextResponse } from "next/server"

// อนุญาตเฉพาะโฮสต์ของ VMS เท่านั้น — กัน SSRF (ห้ามให้ยิง URL อื่น)
const ALLOWED_HOSTS = new Set([
  "vms.inboxcorp.co.th",
  "api.inboxcorp.co.th",
])

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  if (!url) {
    return new NextResponse("Missing url param", { status: 400 })
  }

  // ── SSRF guard: ต้องเป็น https + โฮสต์ใน allowlist เท่านั้น ──
  let target
  try {
    target = new URL(url)
  } catch {
    return new NextResponse("Invalid url", { status: 400 })
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Ne