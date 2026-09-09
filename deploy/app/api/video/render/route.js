// สั่งเรนเดอร์วิดีโอสั้น — POST /api/video/render { plan, content_id? }
//
// ทำไมต้องยิงไป GitHub Actions แทนที่จะเรนเดอร์ตรงนี้ (เหตุผลเดียวกับโปสเตอร์):
//   คลิปหนึ่งใช้ TTS ~3-4 นาที + whisper + Chromium + ffmpeg — เกินเพดานเวลาของ
//   Vercel function หลายเท่า และตัวอักษรไทยต้องให้ Chromium จริงเป็นคนวาด
//   (next/og / Satori ทิ้งวรรณยุกต์เมื่อซ้อนบนสระบน — ยืนยันแล้วตอนทำโปสเตอร์)
//
// route นี้ทำแค่ 3 อย่าง: ตรวจแผน → จองแถวใน video_jobs → สั่ง workflow แล้วจบ
// สถานะที่เหลือ (rendering/done/failed) runner เป็นคนเขียนกลับมาที่แถวเดิม
// ผ่าน agents/video/publish.py · หน้าเว็บดูความคืบหน้าผ่าน GET /api/video/jobs?id=
//
// contract ฝั่ง DB — ยึดตาม backend/database/migrations/075_video_jobs.sql เป๊ะ ๆ:
//   id UUID (gen_random_uuid) · project TEXT · plan JSONB
//   status TEXT ('queued'|'rendering'|'done'|'failed')   ← ไม่มีคำว่า running
//   content_id BIGINT → marketing_content(id) · created_by UUID → auth.users(id)
//   error TEXT · video_url TEXT · duration_seconds NUMERIC
//   created_at / updated_at TIMESTAMPTZ (updated_at มี trigger อัปเดตให้เอง)
//
// ⚠️ ห้ามเดาชื่อคอลัมน์เอง — ฉบับแรกของไฟล์นี้เขียนไว้เป็น requested_by / started_at /
//    finished_at และสถานะ 'running' ตามที่เข้าใจกันไว้ก่อนจะมี migration จริง
//    ผลคือ insert พังทุกครั้ง (PGRST204 column not found) และตัวกันสั่งซ้ำมองไม่เห็น
//    งานที่กำลังเรนเดอร์อยู่เลย เพราะไปหาคำว่า running ซึ่งไม่มีในระบบ
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdmin } from "../../../../lib/apiAuth"

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TABLE = "video_jobs"
const REPO = process.env.GH_REPO || "divisionxcard/divisionX-Card"
const WORKFLOW = "video-render.yml"

// project ถูกเอาไปต่อเป็น path จริงสองที่ — โฟลเดอร์ .video-work/<project> บน runner
// และชื่อไฟล์ใน storage · ปล่อย "/" หรือ ".." ผ่าน คือยอมให้เขียนไฟล์นอกที่ที่ควร
// คัดที่ปากทางนี้ทีเดียว ดีกว่าไปไล่ escape ทีหลังหลาย ๆ จุดแล้วลืมจุดใดจุดหนึ่ง
// (publish._safe_name() กวาดซ้ำอีกชั้น แต่มันแปลงเงียบ ๆ — ชื่อไฟล์ใน storage จะไม่ตรง
//  กับค่าในคอลัมน์ project แล้วตามหาคลิปไม่เจอ จึงต้องปฏิเสธตั้งแต่ตรงนี้)
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

// เพดานความยาวสคริปต์ — 1 บรรทัด = 1 ฉาก และทุกบรรทัดต้องผ่าน TTS + whisper
// สคริปต์ยาวเกินไปแปลว่า job จะไปชนเพดานเวลาของ runner (timeout-minutes: 45)
// แล้วตายกลางทาง เสีย TTS ทิ้งฟรี ๆ — กันตรงนี้ดีกว่าไปรู้เอาตอนนาทีที่ 44
const MAX_SCENES = 30
const MAX_SCRIPT_CHARS = 4000

// รายชื่อสองชุดนี้ต้นทางอยู่ฝั่ง python — VOICES ใน agents/video/voice.py และ
// STYLES ใน agents/video/subtitle.py · ที่ต้องคัดซ้ำที่นี่เพราะทั้งคู่พังแบบ "ไม่ฟ้อง":
//   voice ผิดชื่อ → Gemini ตอบ 400 หลังจองงานไปแล้ว คนอ่าน error ไม่ออกว่าพิมพ์ชื่อเสียงผิด
//   style ผิดชื่อ → subtitle.render_many ใช้ STYLES.get(style, brand) คือ **ตกกลับเป็น brand
//                   เงียบ ๆ** คลิปออกมาคนละหน้าตากับที่สั่ง แต่ระบบรายงานว่า done เรียบร้อย
const VOICES = ["Aoede", "Kore", "Puck", "Charon"]
const STYLES = ["brand", "plain", "punch"]

// งานที่ค้างนานกว่านี้ถือว่า runner ตายไปแล้ว ไม่ใช่ "ยังทำอยู่"
// workflow ตั้ง timeout-minutes: 45 ไว้ งานที่ยังมีชีวิตจึงเกิน 45 นาทีไม่ได้เลย
// เผื่อเป็น 60 ให้ห่างจากเพดานจริง (เลขเดียวกับ query ตรวจงานค้างท้าย migration 075)
const STALE_MINUTES = 60

// GitHub ไม่เคยตอบช้าขนาดนี้ แต่ถ้าค้างจนถูก Vercel ตัดกลางคัน แถวที่จองไว้จะค้าง
// queued ตลอดกาลโดยไม่มีใครไปปิด — timeout ของเราเองทำให้ยังมีจังหวะเขียน failed ทัน
const DISPATCH_TIMEOUT_MS = 10000

// ── ตรวจแผนก่อนจอง job ──
// คืน { plan } ถ้าผ่าน หรือ { error: "ข้อความไทย" } ถ้าไม่ผ่าน
//
// ⚠️ ประกอบ plan ขึ้นใหม่จากคีย์ที่อยู่ใน contract เท่านั้น (ดู deploy/agents/video/README.md)
//    ไม่ส่ง body ดิบต่อให้ runner — คีย์แปลกปลอมที่หลุดเข้าไปจะกลายเป็นของที่ไม่มีใครตรวจ
//    แล้ววันหนึ่งมีคนเขียนโค้ดไปอ่านมันจริง ๆ
function validatePlan(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "ต้องส่ง plan เป็น object" }
  }

  const project = typeof raw.project === "string" ? raw.project.trim() : ""
  if (!project) return { error: "ต้องระบุ project" }
  if (!PROJECT_RE.test(project)) {
    return { error: "project ใช้ได้แค่ a-z 0-9 - _ (พิมพ์เล็ก) ยาวไม่เกิน 64 ตัว ห้ามมี / หรือ .." }
  }

  if (typeof raw.script !== "string" || !raw.script.trim()) {
    return { error: "ต้องมี script ที่ไม่ว่าง" }
  }
  // ตัดบรรทัดว่างทิ้งตั้งแต่ตรงนี้ — make_video.py นับ "1 บรรทัด = 1 ฉาก"
  // บรรทัดว่างที่ติดมาจาก textarea จะกลายเป็นฉากเงียบคั่นกลางคลิป
  const lines = raw.script.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (!lines.length) return { error: "script มีแต่บรรทัดว่าง" }
  if (lines.length > MAX_SCENES) {
    return { error: `script ยาวเกินไป (${lines.length} ฉาก) — รับได้ไม่เกิน ${MAX_SCENES} ฉาก` }
  }
  const script = lines.join("\n")
  if (script.length > MAX_SCRIPT_CHARS) {
    return { error: `script ยาวเกิน ${MAX_SCRIPT_CHARS} ตัวอักษร` }
  }

  // visuals — สเปกภาพต่อฉาก ไม่บังคับและไม่ต้องครบทุกฉาก (visuals.py วนใช้ซ้ำเองอยู่แล้ว)
  //
  // ⚠️ ต้องคัดสเปกที่ "รันบนเครื่องเรนเดอร์ไม่ได้" ทิ้งตั้งแต่ตรงนี้ ไม่ใช่ปล่อยไปตายกลางคัน
  //    งานจะไปตายหลังจ่ายค่า TTS ไปแล้ว (นาทีที่ 4 เป็นต้นไป) เสียทั้งเวลาและโควตา
  //    แล้วได้ error เป็น FileNotFoundError ที่ไม่ได้บอกว่าต้องแก้ยังไง
  //    ข้อจำกัดของ runner เขียนไว้ในหัวไฟล์ .github/workflows/video-render.yml
  let visuals = []
  if (raw.visuals !== undefined && raw.visuals !== null) {
    if (!Array.isArray(raw.visuals)) return { error: "visuals ต้องเป็น array" }
    visuals = raw.visuals.map(v => (typeof v === "string" ? v.trim() : "")).filter(Boolean)
    for (const spec of visuals) {
      const bad = badVisual(spec)
      if (bad) return { error: bad }
    }
  }

  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null)

  const voice = str(raw.voice) || "Aoede"
  if (!VOICES.includes(voice)) {
    return { error: `ไม่รู้จักเสียง "${voice}" — ใช้ได้: ${VOICES.join(", ")}` }
  }
  const style = str(raw.style) || "brand"
  if (!STYLES.includes(style)) {
    return { error: `ไม่รู้จักสไตล์ซับ "${style}" — ใช้ได้: ${STYLES.join(", ")}` }
  }

  // music เป็น path ของไฟล์เพลง ซึ่งทั้งคลังอยู่ที่ deploy/assets/music/ และ **ไม่เข้า git**
  // (ใบอนุญาตเพลงผูกกับผู้ซื้อ ไม่ใช่ทุกคนที่ clone repo ได้ — เหตุผลเต็มอยู่ในหัวไฟล์
  //  agents/video/music.py และบรรทัด deploy/assets/music/ ใน .gitignore)
  // เครื่องเรนเดอร์เช็คเอาต์จาก git ล้วน ๆ จึงไม่มีไฟล์เพลงสักไฟล์ · compose.build ส่ง
  // path ต่อให้ ffmpeg ตรง ๆ (-i) งานจะไปตายตอน ffmpeg หาไฟล์ไม่เจอ ซึ่งคือนาทีที่
  // จ่ายค่า TTS ไปเรียบร้อยแล้ว — ปฏิเสธตั้งแต่ตรงนี้พร้อมบอกเหตุผลดีกว่า
  // (วันไหนทำให้ runner โหลดเพลงจาก storage ตอนเริ่มงานได้ ค่อยเปิดช่องนี้)
  if (str(raw.music)) {
    return { error: "ยังใส่เพลงประกอบผ่านหน้าเว็บไม่ได้ — ไฟล์เพลงถูก gitignore ไว้ เครื่องเรนเดอร์จึงไม่มีไฟล์ (ดู deploy/agents/video/music.py)" }
  }

  // xfade มีผลกับการชดเชยเวลาซับ/เสียงใน make_video.py — ค่าเพี้ยน (ติดลบ หรือยาวกว่าฉาก)
  // ทำให้ซับค่อย ๆ เลื่อนออกจากเสียงจนท้ายคลิปหลุดเป็นวินาที
  let xfade = 0.35
  if (raw.xfade !== undefined && raw.xfade !== null) {
    const n = Number(raw.xfade)
    if (!Number.isFinite(n) || n < 0 || n > 2) {
      return { error: "xfade ต้องเป็นตัวเลข 0-2 วินาที" }
    }
    xfade = n
  }

  return {
    plan: {
      project,
      script,
      visuals,
      headline: str(raw.headline),
      voice,
      style,
      music: null,          // คงคีย์ไว้ให้ครบ contract แม้จะยังใส่ค่าไม่ได้ (ดูเหตุผลข้างบน)
      xfade,
    },
  }
}

// คืนข้อความ error ถ้าสเปกภาพนี้ใช้บนเครื่องเรนเดอร์ไม่ได้ · คืน null ถ้าผ่าน
function badVisual(spec) {
  if (spec.startsWith("flux:")) {
    // FLUX ต้องมี CUDA + โมเดลหลาย GB + HF_TOKEN — runner ของ GitHub ไม่มีสักอย่าง
    // (ถ้าวันไหนย้ายไปเครื่องที่มีการ์ดจอ ให้ลบเงื่อนไขนี้ทิ้งได้เลย)
    return "flux: ใช้ไม่ได้บนเครื่องเรนเดอร์ (ไม่มีการ์ดจอ) — เตรียมภาพไว้ก่อนแล้วอ้างเป็น machine: / sku: / file:"
  }
  if (spec.startsWith("file:")) {
    const p = spec.slice(5)
    if (!p) return "file: ต้องระบุ path"
    // ⚠️ ลิงก์รอดทุกด่านข้างล่าง (ไม่มีไดรฟ์ ไม่มีแบ็กสแลช ไม่ขึ้นต้นด้วย /) แต่
    //    visuals.resolve() เปิด file: เป็นไฟล์ตรง ๆ ด้วย pathlib ไม่ได้ดาวน์โหลดให้
    //    ปล่อยผ่าน = FileNotFoundError ที่ขั้น 4 คือหลังจ่ายค่า TTS ไปแล้ว
    if (/^https?:\/\//i.test(p)) {
      return `file: ยังรับลิงก์ไม่ได้ ("${p}") — เครื่องเรนเดอร์เปิดเป็นไฟล์ตรง ๆ ไม่ได้ดาวน์โหลด คอมมิตรูปเข้ารีโปแล้วอ้างเป็น path แทน`
    }
    // "file:C:\ถ่ายเอง\กดตู้.jpg" คือ path บนเครื่องเจ้าของ ซึ่งไม่มีอยู่บน ubuntu
    // path ที่ใช้ได้คือไฟล์ที่อยู่ในรีโป และต้องเป็น relative เพราะ workflow รันด้วย
    // working-directory: deploy (เช่น public/machine/machine-hero.jpg)
    if (/^[A-Za-z]:/.test(p) || p.includes("\\") || p.startsWith("/")) {
      return `file: ต้องเป็น path ในรีโปแบบ relative จากโฟลเดอร์ deploy/ (เช่น public/machine/machine-hero.jpg) — "${p}" เป็น path ของเครื่องอื่น เครื่องเรนเดอร์หาไม่เจอ`
    }
    if (p.split("/").includes("..")) return "file: ห้ามมี .. ใน path"
    return null
  }
  if (spec.startsWith("machine:") || spec.startsWith("sku:")) return null
  // ปล่อยผ่านไปก็ตกไปที่ ValueError("ไม่รู้จักแหล่งภาพ") ใน visuals.resolve อยู่ดี
  // แต่ตายตอนนั้นคือหลังจ่ายค่า TTS ไปแล้ว
  return `ไม่รู้จักแหล่งภาพ "${spec}" — ใช้ได้: machine: / sku: / file:`
}

export async function POST(req) {
  const gate = await requireAdmin(req)
  if (gate.error) return gate.error

  const token = process.env.GH_PAT
  // เช็ก token ก่อนจองแถว — ไม่งั้นได้ job ค้าง queued ตลอดกาลโดยไม่มีใครไปรัน
  // คนดูหน้าเว็บจะนึกว่าระบบกำลังทำอยู่ แล้วนั่งรอคลิปที่ไม่มีวันมา
  if (!token) {
    return NextResponse.json({
      error: "ยังไม่ได้ตั้ง GH_PAT",
      hint: "ฝั่งเว็บอ่านจาก Vercel env — คนละตัวกับใน deploy/.env.local ของเครื่อง",
    }, { status: 503 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }

  const checked = validatePlan(body?.plan)
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 })
  const plan = checked.plan

  // content_id ไม่บังคับ — ใช้ผูกคลิปกลับไปที่แคปชั่นที่อนุมัติแล้วใน marketing_content
  // (publish.finish_job จะเขียน media_url กลับไปที่แถวนั้นให้เมื่อเรนเดอร์เสร็จ)
  let contentId = null
  if (body?.content_id !== undefined && body?.content_id !== null && body?.content_id !== "") {
    const n = Number(body.content_id)
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "content_id ต้องเป็นเลขจำนวนเต็มบวก" }, { status: 400 })
    }
    contentId = n
  }

  try {
    // ── กันสั่งซ้ำชื่อเดียวกัน ──
    // งานสองใบที่ project เดียวกันใช้โฟลเดอร์ .video-work/<project> เดียวกันบน runner
    // และอัปทับ storage key เดียวกัน — รันพร้อมกันคือแคชปนกันจนได้คลิปพันธุ์ทาง
    //
    // ⚠️ ลำดับ chain ต้องเป็น from().select().eq() เสมอ — สลับเป็น from().eq().select() คือ TypeError
    // ⚠️ ต้องเรียงตาม created_at ไม่ใช่ id — id เป็น uuid v4 (สุ่ม) เรียงแล้วไม่มีความหมายอะไรเลย
    const { data: dup, error: dupErr } = await db.from(TABLE)
      .select("id, status, updated_at")
      .eq("project", plan.project)
      .in("status", ["queued", "rendering"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (dupErr) throw dupErr

    if (dup) {
      // ── งานค้างที่ตายไปแล้ว ต้องไม่บล็อกชื่อ project นั้นตลอดกาล ──
      // runner ถูก cancel / ชนเพดาน 45 นาที / เครื่องถูกทิ้งกลางคัน = ไม่มีใครเขียน failed
      // ให้ (publish.py เขียนได้เฉพาะตอนที่มันยังมีชีวิตอยู่) ถ้าไม่เก็บกวาดตรงนี้
      // คนจะสั่งเรนเดอร์ชื่อเดิมไม่ได้อีกเลย และหน้าเว็บขึ้น "กำลังเรนเดอร์" ค้างไปตลอด
      // — migration 075 เขียน query ปลดล็อกแบบมือไว้ท้ายไฟล์ แต่ต้องมีคนนึกได้ว่าต้องไปรัน
      const stuckMin = (Date.now() - new Date(dup.updated_at).getTime()) / 60000
      if (!(stuckMin > STALE_MINUTES)) {
        return NextResponse.json({
          error: `project "${plan.project}" มีงานค้างอยู่แล้ว (job ${dup.id} · ${dup.status})`,
          job_id: dup.id,
          status: dup.status,
        }, { status: 409 })
      }
      await markFailed(dup.id,
        `ค้างสถานะ ${dup.status} เกิน ${STALE_MINUTES} นาที — เครื่องเรนเดอร์น่าจะตายกลางคัน ` +
        `(ปิดอัตโนมัติตอนมีคนสั่งงานชื่อ ${plan.project} ใหม่)`)
    }

    // จองแถวก่อนยิง workflow — job_id ต้องมีอยู่จริงตอนส่งเข้าไปเป็น input
    // คอลัมน์ project ต้องตรงกับ plan.project เป๊ะ ๆ ไม่งั้นติด CHECK video_jobs_plan_project_check
    // (constraint นั้นมีไว้กันคลิปที่ "เรนเดอร์ลงโฟลเดอร์หนึ่ง แต่ไปตามหาอีกโฟลเดอร์หนึ่ง")
    const { data: job, error } = await db.from(TABLE).insert({
      project: plan.project,
      plan,
      status: "queued",
      content_id: contentId,
      created_by: gate.user.id,
    }).select("id, project, status, created_at").single()
    if (error) {
      // 23503 = FK violation · เกิดตอนอ้าง content_id ที่ไม่มีอยู่ใน marketing_content
      // ปล่อยเป็น 500 พร้อมข้อความ Postgres ดิบ คนอ่านไม่ออกว่าตัวเองส่งเลขผิด
      if (error.code === "23503") {
        return NextResponse.json({ error: `ไม่พบคอนเทนต์ id=${contentId} ใน marketing_content` }, { status: 400 })
      }
      throw error
    }

    let res
    try {
      res = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          // dispatch ตอบ 204 ตัวเปล่า ไม่คืน run id กลับมาเลย — ผูกงานกลับได้ทางเดียว
          // คือ job_id ที่ส่งเข้าไป runner จึงต้องเขียนสถานะกลับมาที่แถวนี้เอง
          body: JSON.stringify({ ref: "main", inputs: { job_id: String(job.id) } }),
          signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
        }
      )
    } catch (err) {
      await markFailed(job.id, `ยิง GitHub ไม่สำเร็จ: ${err.message}`)
      return NextResponse.json({ error: err.message, job_id: job.id, status: "failed" }, { status: 502 })
    }

    if (res.status === 204) {
      return NextResponse.json({ job_id: job.id, status: "queued" }, { status: 202 })
    }

    // ── dispatch ไม่ผ่าน = ต้องปิดแถวเป็น failed ──
    // ปล่อยค้าง queued คือหน้าเว็บหมุนรอไปเรื่อย ๆ ทั้งที่ไม่มีอะไรมารัน
    // และตัวกันสั่งซ้ำข้างบนจะบล็อกชื่อ project นั้นไว้อีกชั่วโมง สั่งใหม่ก็ไม่ได้
    const detail = (await res.text().catch(() => "")).slice(0, 250)
    // 404 ตรงนี้มักแปลว่า workflow ยังไม่ถูก merge เข้า main (GitHub หาไฟล์ไม่เจอ)
    // ไม่ใช่เรื่องสิทธิ์ของ token — บอกให้ชัดจะได้ไม่ไปไล่หา PAT ผิดที่
    const reason = res.status === 404
      ? `GitHub หา ${WORKFLOW} ไม่เจอ — ต้อง push ขึ้น main ก่อน`
      : `GitHub ตอบ ${res.status}: ${detail}`
    await markFailed(job.id, reason)

    // ⚠️ ห้ามส่ง status ของ GitHub ต่อให้เบราว์เซอร์ตรง ๆ
    //    ตัวห่อ fetch ของหน้าเว็บ (แม่แบบเดียวกับ api() ใน MarketingOS.jsx) ตีความ
    //    401 = เซสชันหมดอายุ แล้วเด้งผู้ใช้ออกจากระบบ · 403 = ไม่ใช่ admin
    //    PAT หมดอายุหรือขาด scope workflow จึงกลายเป็น "ระบบเตะฉันออก" ทั้งที่ล็อกอินอยู่ดี ๆ
    //    แล้วคนไปไล่หาสาเหตุผิดที่ทั้งวัน · 502 คือความจริง: ต้นน้ำตอบมาไม่ดี
    return NextResponse.json({
      error: reason,
      hint: (res.status === 401 || res.status === 403)
        ? "GH_PAT บน Vercel หมดอายุหรือไม่มี scope workflow"
        : undefined,
      github_status: res.status,
      job_id: job.id,
      status: "failed",
    }, { status: 502 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ปิดแถวเป็น failed · ไม่โยน error ต่อ เพราะผู้เรียกกำลังจะตอบ error อยู่แล้ว
// ถ้าโยนจะกลายเป็น 500 ที่บังสาเหตุจริงซึ่งอุตส่าห์หามาได้
//
// ⚠️ supabase-js **ไม่ throw** เวลา query ล้ม มันคืน { error } มาเฉย ๆ
//    try/catch เปล่า ๆ จึงเท่ากับ "คิดว่าปิดงานแล้ว" ทั้งที่แถวยังค้าง queued อยู่
//    ต้องอ่าน error แล้วพ่นลง log ของ Vercel ไม่งั้นงานค้างโดยไม่มีใครรู้ว่าเพราะอะไร
// (ไม่ต้องเซ็ต updated_at เอง — trigger video_jobs_updated_at ทำให้แล้ว และมันคือ
//  ตัวเดียวกับที่ตัวเก็บกวาดงานค้างข้างบนใช้วัดว่า "ค้างมานานแค่ไหน")
async function markFailed(id, reason) {
  try {
    const { error } = await db.from(TABLE)
      .update({ status: "failed", error: reason })
      .eq("id", id)
    if (error) console.error(`[video/render] ปิดงาน ${id} เป็น failed ไม่สำเร็จ: ${error.message}`)
  } catch (err) {
    console.error(`[video/render] ปิดงาน ${id} เป็น failed ไม่สำเร็จ: ${err?.message || err}`)
  }
}
