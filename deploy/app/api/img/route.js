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
    return new NextResponse("Forbidden host", { status: 403 })
  }

  try {
    const res = await fetch(target.toString(), {
      headers: { "Referer": "https://vms.inboxcorp.co.th/" },
    })

    if (!res.ok) {
      return new NextResponse("Image not found", { status: 404 })
    }

    const contentType = res.headers.get("content-type") || "image/png"
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    })
  } catch {
    return new NextResponse("Failed to fetch image", { status: 500 })
  }
}
