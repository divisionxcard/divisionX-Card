// ตัวเขียนสตอรี่บอร์ด — ไอเดียจากรีเสิร์ช → ร่างห้องตัดต่อ (26 ต.ค. 2026)
//
//   GET  /api/video/storyboard                         → { patterns: [...], recent: [pattern id ล่าสุด] }
//   POST /api/video/storyboard { idea_id, pattern?, voice? } → { edit_id, name, seconds, pattern, beats, dropped }
//
// ลำดับ: ไอเดีย (marketing_ideas) + สินค้า/สต็อก/สาขาจริง (DB) + รูปแบบไวรัล (tasks/video_patterns.json)
//        → Gemini เขียนสตอรี่บอร์ด JSON → lib/storyboard.compile → ร่าง R2 video-edits/<id>.json
//        → หน้าเว็บพาไป /video/editor?id=<id> ให้คนดู/แก้ก่อนกดทำ (เจ้าของเลือก "เป็นงานในห้องตัดต่อ")
// ไม่มีค่าใช้จ่ายนอกจาก Gemini (คีย์ฟรี) · ไม่วาดภาพใหม่ · ใช้แต่ภาพที่มีอยู่แล้ว (ซองจริง · รูปตู้สาขา · ภาพฉากในคลัง)
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { requireMarketing } from "../../../../lib/apiAuth"
import { askGeminiText } from "../../../../lib/geminiText"
import { listObjects, mediaUrl, putObject } from "../../../../lib/r2"
import { cleanTimeline, VOICES } from "../../../../lib/videoTimeline"
import { detectFranchise, FRANCHISE_LABEL } from "../../../../lib/franchiseDetect"
import {
  buildAssets, buildPrompt, choosePattern, compile, offCards, parseStoryboard, scrubSource,
} from "../../../../lib/storyboard"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const LOG_DIR = "research/storyboards"          // ประวัติการใช้รูปแบบ (ชื่อไฟล์มี id รูปแบบ — เลี่ยงซ้ำโดยไม่ต้องเปิดไฟล์)
const LANG_TH = { JA: "ญี่ปุ่น", EN: "อังกฤษ", TH: "ไทย", CN: "จีน" }

const task = async (name) => JSON.parse(await readFile(path.join(process.cwd(), "tasks", name), "utf-8"))

// ภาพฉากในคลัง R2 + ค่ายของแต่ละภาพ — ใช้ได้เฉพาะภาพของค่ายเดียวกับไอเดีย
// ทดสอบ 26 ต.ค.: คลิปทัวร์นาเมนต์ One Piece ได้ภาพฟ้าชมพูพาสเทลที่วาดให้โพสต์โปเกมอน
//   aibg/<content id>-… · aibg/top5-<content id>-…  → marketing_content.source_sku → skus.franchise (ไม่มี = เดาจากแคปชั่น)
//   video-bg/<project>-<hash>.png                     → video_jobs.plan.bg.hero
async function backgroundsFor(franchise) {
  const files = [...await listObjects("aibg/", 200), ...await listObjects("video-bg/", 200)]
    .filter(f => /\.(png|jpe?g|webp)$/i.test(f.key))
    .sort((a, b) => String(b.modified).localeCompare(String(a.modified)))
  const cid = (k) => (k.match(/^aibg\/(?:top5-)?(\d+)-/) || [])[1]
  const proj = (k) => (k.match(/^video-bg\/(.+)-[0-9a-f]{8}\.(?:png|jpe?g|webp)$/) || [])[1]
  const ids = [...new Set(files.map(f => cid(f.key)).filter(Boolean))].map(Number)
  const projects = [...new Set(files.map(f => proj(f.key)).filter(Boolean))]
  const fr = new Map()
  if (ids.length) {
    const { data: rows } = await db.from("marketing_content").select("id,source_sku,caption").in("id", ids)
    const skuIds = [...new Set((rows || []).map(r => r.source_sku).filter(Boolean))]
    const { data: sk } = skuIds.length ? await db.from("skus").select("sku_id,franchise").in("sku_id", skuIds) : { data: [] }
    const skuFr = new Map((sk || []).map(s => [s.sku_id, s.franchise]))
    for (const r of rows || []) fr.set(`c${r.id}`, skuFr.get(r.source_sku) || detectFranchise(r.caption))
  }
  if (projects.length) {
    const { data: jobs } = await db.from("video_jobs").select("project,plan").in("project", projects)
    for (const j of jobs || []) if (j.plan?.bg?.hero) fr.set(`p${j.project}`, j.plan.bg.hero)
  }
  return files.map(f => ({ url: mediaUrl(f.key), franchise: fr.get(cid(f.key) ? `c${cid(f.key)}` : `p${proj(f.key)}`) || null }))
    .filter(b => b.franchise && (!franchise || b.franchise === franchise))
    .slice(0, 6)
}

async function recentPatterns(n = 10) {
  try {
    const files = await listObjects(`${LOG_DIR}/`, 400)
    return files.sort((a, b) => String(b.modified).localeCompare(String(a.modified))).slice(0, n)
      .map(f => (f.key.slice(LOG_DIR.length + 1).match(/^[a-z0-9]+-([a-z0-9-]+?)--/) || [])[1]).filter(Boolean)
  } catch { return [] }
}

export async function GET(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  try {
    const { patterns } = await task("video_patterns.json")
    return NextResponse.json({
      patterns: patterns.map(p => ({ id: p.id, name: p.name, why: p.why, length: p.length, evidence: p.evidence, needs_sku: !!p.fits?.needs_sku })),
      recent: await recentPatterns(),
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const ideaId = Number(body?.idea_id)
  if (!Number.isInteger(ideaId) || ideaId < 1) return NextResponse.json({ error: "ต้องระบุ idea_id" }, { status: 400 })
  const voice = VOICES.includes(body?.voice) ? body.voice : VOICES[Math.floor(Math.random() * VOICES.length)]

  try {
    const { data: idea, error: e1 } = await db.from("marketing_ideas")
      .select("id,source,subtype,source_label,title,summary,angle,angles,chosen_angle,related_sku,relevance,url")
      .eq("id", ideaId).maybeSingle()
    if (e1) throw e1
    if (!idea) return NextResponse.json({ error: `ไม่พบไอเดีย #${ideaId}` }, { status: 404 })

    // ── สินค้าที่เกี่ยวข้อง + ชุดอื่นของค่ายเดียวกัน (เฉพาะที่มีรูปซองจริง) ──
    const SKU_COLS = "sku_id,name,franchise,set_code,language,image_url"
    let sku = null
    if (idea.related_sku) {
      const { data } = await db.from("skus").select(SKU_COLS).eq("sku_id", idea.related_sku).maybeSingle()
      sku = data?.image_url ? data : null
    }
    const franchise = sku?.franchise || detectFranchise(idea.title, idea.summary)
    let siblings = []
    if (franchise) {
      const { data } = await db.from("skus").select(SKU_COLS).eq("franchise", franchise).eq("is_active", true)
        .not("image_url", "is", null).order("sku_id", { ascending: false }).limit(8)
      siblings = (data || []).filter(s => s.sku_id !== sku?.sku_id).slice(0, 5)
    }

    // ── สาขาจริง (หน้าเว็บสาธารณะ) + สาขาที่มีชุดนี้ตอนนี้ (ตามรอบซิงค์ล่าสุด) ──
    const { data: machines } = await db.from("machines").select("machine_id,config").eq("status", "active")
    const branches = (machines || [])
      .map(m => ({ id: m.machine_id, b: m.config?.branch }))
      .filter(x => x.b?.public === true && x.b?.display_name)
      .sort((a, b) => (a.b.order ?? 999) - (b.b.order ?? 999))
      .map(x => ({ id: x.id, name: x.b.display_name }))
    let haveAt = []
    if (sku) {
      const { data: st } = await db.from("machine_stock").select("machine_id,remain")
        .eq("sku_id", sku.sku_id).eq("is_occupied", true).gt("remain", 0)
      const ids = new Set((st || []).map(r => r.machine_id))
      haveAt = branches.filter(b => ids.has(b.id))
    }

    // ── ภาพที่ใช้ได้: ภาพฉากในคลัง R2 (ไม่มีตัวหนังสือ/สินค้า — วาดไว้แล้ว ใช้ซ้ำไม่เสียเงิน) + คลิป Flow ──
    let backgrounds = []
    try { backgrounds = await backgroundsFor(franchise) } catch { /* ไม่มีภาพฉาก = ใช้ซอง/รูปตู้อย่างเดียว */ }
    let broll = []
    try {
      broll = ((await task("video_broll.json")).clips || [])
        .filter(c => !c.franchise?.length || !franchise || c.franchise.includes(franchise))
    } catch { /* ไม่มีคลังคลิป */ }
    const assets = buildAssets({ sku, siblings, branches, backgrounds, broll, haveAt })

    // ── เลือกรูปแบบ (เลี่ยงที่เพิ่งใช้) ──
    const { patterns, trust_facts: trustFacts } = await task("video_patterns.json")
    const recent = await recentPatterns()
    const pattern = choosePattern(patterns, {
      idea, hasSku: !!sku, recent, forced: typeof body?.pattern === "string" ? body.pattern : null,
      seed: ideaId + recent.length + Math.floor(Date.now() / 60000),
    })
    if (!pattern) return NextResponse.json({ error: "ไม่มีรูปแบบในคลัง (tasks/video_patterns.json)" }, { status: 500 })

    // ── ข้อมูลที่ตัวเขียนใช้ได้ (ข้อเท็จจริงทั้งหมดต้องมาจากตรงนี้) ──
    const angle = (Array.isArray(idea.angles) ? idea.angles : []).find(a => a?.label === idea.chosen_angle)
    const summary = scrubSource(idea.summary, idea.source_label).slice(0, 1800)
    const facts = [
      `หัวข้อ: ${idea.title || "-"}`,
      summary ? `ข้อเท็จจริงของเรื่อง:\n${summary}` : null,
      angle ? `มุมที่เลือกไว้: ${angle.label} — ${scrubSource(angle.brief, idea.source_label)}` : null,
      sku ? `สินค้าในตู้ที่เกี่ยวข้อง: ${sku.name} (${sku.sku_id}) · ค่าย ${FRANCHISE_LABEL[sku.franchise] || sku.franchise}` +
            (sku.language ? ` · ฉบับภาษา${LANG_TH[sku.language] || sku.language}` : "") : null,
      siblings.length ? `ชุดอื่นของค่ายเดียวกันที่มีในตู้: ${siblings.map(s => s.name).join(" · ")}` : null,
      sku ? (haveAt.length ? `สาขาที่มีชุดนี้ตามรอบซิงค์ล่าสุด: ${haveAt.map(b => b.name).join(" · ")}`
                           : "สาขาที่มีชุดนี้: ไม่มีข้อมูล (ห้ามระบุสาขา)") : null,
      offCards(idea) ? "หมายเหตุ: เรื่องนี้ไม่ได้พูดเรื่องการ์ดโดยตรง" : null,
    ].filter(Boolean).join("\n")
      // ไอเดียจากยอดขายในตู้ (internal) มีตัวเลขในหัวข้อ "ยอดโต 1730%" — ห้ามขึ้นคอนเทนต์ · ลบตั้งแต่ก่อนส่งให้ AI
      .replace(/ยอด(โต|ตก|ขาย|พุ่ง)\s*[+-]?\d[\d,.]*\s*(%|เปอร์เซ็นต์|ซอง|ชิ้น)?/g, "ยอด$1 (ตัวเลขภายใน ห้ามบอก)")

    let voiceCfg = null
    try { voiceCfg = await task("content_voice.json") } catch { /* ใช้ค่ากลาง */ }
    const { system, user } = buildPrompt({ pattern, idea, facts, assets, voice: voiceCfg, trustFacts })

    let sb = null, model = null
    for (let i = 0; i < 2 && !sb; i++) {
      const r = await askGeminiText(i ? `${user}\n\n⚠️ รอบก่อนตอบไม่ใช่ JSON — ตอบเป็น JSON ล้วนเท่านั้น` : user,
        { system, temperature: 0.85, maxOutputTokens: 4096, timeout: 60000 })
      sb = parseStoryboard(r.text); model = r.model
    }
    if (!sb) return NextResponse.json({ error: "AI เขียนสตอรี่บอร์ดไม่สำเร็จ (ตอบไม่เป็น JSON) — กดใหม่อีกครั้ง" }, { status: 502 })

    const out = compile(sb, assets, { voice, pattern })
    if (out.error) return NextResponse.json({ error: out.error, dropped: out.dropped }, { status: 422 })
    const cleaned = cleanTimeline(out.timeline)
    if (cleaned.error) return NextResponse.json({ error: `ไทม์ไลน์ไม่ผ่าน: ${cleaned.error}` }, { status: 422 })

    // ── บันทึกเป็นร่างห้องตัดต่อ (รูปทรงเดียวกับ PUT /api/video/edits) ──
    const stamp = Date.now().toString(36)
    const id = `e-sb-${stamp}-${Math.random().toString(36).slice(2, 6)}`
    const title = String(sb.title || idea.title || "").replace(/\s+/g, " ").trim().slice(0, 50)
    const name = `สตอรี่บอร์ด · ${pattern.name} · ${title}`.slice(0, 80)
    const story = {
      idea_id: idea.id, idea_title: idea.title, pattern_id: pattern.id, pattern_name: pattern.name,
      evidence: pattern.evidence, model, voice, beats: out.beats, dropped: out.dropped, seconds: out.seconds,
      created_at: new Date().toISOString(), created_by: gate.user.id,
    }
    const doc = { id, name, timeline: cleaned.timeline, job_id: null, updated_at: story.created_at, updated_by: gate.user.id, story }
    await putObject(`video-edits/${id}.json`, JSON.stringify(doc), "application/json")
    try {
      await putObject(`${LOG_DIR}/${stamp}-${pattern.id}--${id}.json`, JSON.stringify(story), "application/json")
    } catch { /* ประวัติเป็นงานรอง — ร่างบันทึกแล้ว */ }

    return NextResponse.json({
      edit_id: id, name, seconds: out.seconds, voice,
      pattern: { id: pattern.id, name: pattern.name, why: pattern.why, evidence: pattern.evidence },
      beats: out.beats, dropped: out.dropped, model,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
