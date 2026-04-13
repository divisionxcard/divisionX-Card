import { NextResponse } from "next/server"

export async function POST() {
  const token = process.env.GH_PAT
  if (!token) {
    return NextResponse.json({ error: "GH_PAT not configured" }, { status: 500 })
  }

  // คำนวณวันที่ปัจจุบัน (เวลาไทย UTC+7)
  const nowBkk = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const today = nowBkk.toISOString().slice(0, 10)
  // ดึงย้อนหลัง 3 วัน เพื่อเติมข้อมูลที่อาจหายจาก auto sync ที่ fail
  const from = new Date(nowBkk)
  from.setDate(from.getDate() - 3)
  const fromDate = from.toISOString().slice(0, 10)

  try {
    const res = await fetch(
      "https://api.github.com/repos/divisionxcard/divisionX-Card/actions/workflows/vms-sync.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            days: "0",
            from_date: fromDate,
            to_date: today,
          },
        }),
      }
    )

    if (res.status === 204) {
      return NextResponse.json({ success: true, message: `VMS Sync triggered for ${fromDate} → ${today}` })
    }

    const data = await res.text()
    return NextResponse.json({ error: `GitHub API error: ${res.status}`, detail: data }, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
