import { NextResponse } from "next/server"

export async function POST() {
  const token = process.env.GH_PAT
  if (!token) {
    return NextResponse.json({ error: "GH_PAT not configured" }, { status: 500 })
  }

  try {
    const res = await fetch(
      "https://api.github.com/repos/divisionxcard/divisionX-Card/actions/workflows/vms-sync.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    )

    if (res.status === 204) {
      return NextResponse.json({ success: true, message: "VMS Sync triggered successfully" })
    }

    const data = await res.text()
    return NextResponse.json({ error: `GitHub API error: ${res.status}`, detail: data }, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
