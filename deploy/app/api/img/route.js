import { NextResponse } from "next/server"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  if (!url) {
    return new NextResponse("Missing url param", { status: 400 })
  }

  try {
    const res = await fetch(url, {
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
