// สายพานการผลิต — โซน C ของหน้า /marketing
//
// GET /api/marketing/pipeline → สถานะ automation แต่ละตัว (รันล่าสุดเมื่อไหร่ ผ่านไหม)
//
// ตอบคำถามเดียว: "ระบบยังทำงานอยู่ไหม" — ไม่ใช่หน้ารายงานละเอียด
import { NextResponse } from "next/server"
import { requireAdmin } from "../../../../lib/apiAuth"

const REPO = process.env.GH_REPO || "divisionxcard/divisionX-Card"
const GH_PAT = process.env.GH_PAT

// automation ที่การตลาดสนใจ — เรียงตามลำดับที่มันทำงานจริงในหนึ่งวัน
const JOBS = [
  { key: "vms-stock",   file: "vms-stock-sync.yml",       label: "ดึงสต็อกหน้าตู้ VMS" },
  { key: "ww-stock",    file: "worldwide-stock-sync.yml", label: "ดึงสต็อกหน้าตู้ WorldWide" },
  { key: "vms-sales",   file: "vms-sync.yml",             label: "ดึงยอดขาย VMS" },
  { key: "ww-sales",    file: "worldwide-sync.yml",       label: "ดึงยอดขาย WorldWide" },
  { key: "payif-sales", file: "payif-sync.yml",           label: "ดึงยอดขาย Payif" },
  { key: "restock",     file: "restock-guard.yml",        label: "เตือนเติมสต็อก" },
  { key: "reminders",   file: "marketing-reminders.yml",  label: "แจ้งเตือนงานการตลาด" },
  { key: "digest",      file: "weekly-sales-digest.yml",  label: "สรุปยอดขายรายสัปดาห์" },
]

async function latestRun(file) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${file}/runs?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${GH_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // สถานะ workflow ไม่ต้องสด ๆ ทุกวินาที — cache 60 วิ กัน rate limit ของ GitHub
      next: { revalidate: 60 },
    }
  )
  if (!res.ok) return { state: "unknown", error: `GitHub ${res.status}` }
  const json = await res.json()
  const run = (json.workflow_runs || [])[0]
  if (!run) return { state: "never" }
  return {
    state: run.status === "completed" ? (run.conclusion || "unknown") : run.status,
    started_at: run.run_started_at || run.created_at || null,
    trigger: run.event,
    url: run.html_url,
  }
}

export async function GET(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  if (!GH_PAT) {
    return NextResponse.json({
      jobs: JOBS.map(j => ({ ...j, state: "unknown", error: "ไม่ได้ตั้ง GH_PAT" })),
      warning: "ไม่ได้ตั้ง GH_PAT — ดูสถานะ automation ไม่ได้",
    })
  }

  try {
    const jobs = await Promise.all(JOBS.map(async (j) => ({ ...j, ...(await latestRun(j.file)) })))
    return NextResponse.json({
      jobs,
      failing: jobs.filter(j => j.state === "failure").length,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
