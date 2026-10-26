// ตัวเขียนสตอรี่บอร์ด — ไอเดียจากรีเสิร์ช → ร่างห้องตัดต่อ (26 ต.ค. 2026)
//
//   GET  /api/video/storyboard                         → { patterns: [...], recent: [pattern id ล่าสุด] }
//   POST /api/video/storyboard { idea_id | "auto", pattern? ("auto" · "free" · id), voice? }
//        → { edit_id, name, seconds, pattern, beats, dropped, idea, timeline }
//   idea_id "auto" = ระบบเลือกไอเดียเด็ดที่ยังไม่เคยทำสตอรี่บอร์ด (โหมด "ให้ระบบออกแบบ" ในหน้า /video · 26 ต.ค. 2026)
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
import { getObject, listObjects, mediaUrl, putObject } from "../../../../lib/r2"
import { cleanTimeline, VOICES } from "../../../../lib/videoTimeline"
import { detectFranchise, FRANCHISE_LABEL } from "../../../../lib/franchiseDetect"
import {
  buildAssets, buildPrompt, choosePattern, compile, FREE, internalFacts, nameRegex, offCards, parseStoryboard, scrubNames, scrubSource,
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

const task = async (name) => JSON.parse((await readFile(path.join(process.cwd(), "tasks", name), "utf-8")).replace(/^\uFEFF/, ""))

// ชื่อร้าน/ช่อง/เพจอื่นที่ห้ามเอ่ย — ช่อง YouTube ที่เก็บไอเดีย · เพจที่ตัวเฝ้าเพจติดตาม (ยกเว้นเพจทางการของค่าย) · คู่แข่งในเรดาร์
// "Guy Ngid (กายหงิด)" → ทั้งชื่ออังกฤษและไทย
async function otherNames(idea) {
  const out = []
  const split = (s) => String(s || "").replace(/^(YouTube|Facebook|TikTok|Instagram)\s*·\s*/i, "").split(/[()（）·|,]/).map(x => x.trim())
  try { for (const c of (await task("idea_sources.json")).youtube_channels || []) out.push(...split(c.label)) } catch { /* ไม่มีไฟล์ */ }
  try {
    const sw = await task("social_watch.json")
    for (const k of ["facebook", "instagram"]) for (const t of sw[k] || []) if (t.group !== "official") out.push(...split(t.name))
  } catch { /* ไม่มีไฟล์ */ }
  try { for (const c of (await task("competitor_watch.json")).competitors || []) out.push(...split(c.name)) } catch { /* ไม่มีไฟล์ */ }
  out.push(...split(idea?.source_label))
  return nameRegex(out)
}

// คลังรูปแบบ = ไฟล์ในรีโป (tasks/video_patterns.json) + รูปแบบที่ทีมเพิ่มจากกล่องส่งแอด (R2 · /api/video/ads adopt)
async function allPatterns() {
  const base = await task("video_patterns.json")
  let extra = []
  try {
    const res = await getObject("research/video-patterns-extra.json")
    if (res) extra = (await res.json()).filter(p => p?.id && Array.isArray(p.beats) && !base.patterns.some(b => b.id === p.id))
  } catch { /* ยังไม่มีรูปแบบจากแอด */ }
  return { ...base, patterns: [...base.patterns, ...extra] }
}

// ภาพฉากในคลัง R2 + ค่ายของแต่ละภาพ — ใช้ได้เฉพาะภาพของค่ายเดียวกับไอเดีย
// ทดสอบ 26 ต.ค.: คลิปทัวร์นาเมนต์ One Piece ได้ภาพฟ้าชมพูพาสเทลที่วาดให้โพสต์โปเกมอน
//   aibg/<content id>-… · aibg/top5-<content id>-…  → marketing_content.source_sku → skus.franchise (ไม่มี = เดาจากแคปชั่น)
//   video-bg/<project>-<hash>.png                     → video_jobs.plan.bg.hero
async function backgroundsFor(franchise) {
  const files = [...await listObjects("aibg/", 200), ...await listObjects("video-bg/", 200)]
    .filter(f => /\.(png|jpe?g|webp)$/i.test(f.key))
    // พื้นหลังโปสเตอร์ "5 ใบเด็ด" เป็นพื้นน้ำเงินเปล่าไว้วางการ์ด 5 ใบ — ในคลิปกลายเป็นฉากโล่ง (เรนเดอร์จริง 26 ต.ค.)
    .filter(f => !f.key.startsWith("aibg/top5-"))
    .sort((a, b) => String(b.modified).localeCompare(String(a.modified)))
  const cid = (k) => (k.match(/^aibg\/(?:top5-)?(\d+)-/) || [])[1]
  const proj = (k) => (k.match(/^video-bg\/(.+)-[0-9a-f]{8}\.(?:png|jpe?g|webp)$/) || [])[1]
  // คลังภาพฉากรายฉาก (hf_bg.paint_scene · 26 ต.ค.) — มีค่าย/แท็ก/คำอธิบายในดัชนี → AI เลือกภาพที่ตรงเรื่องมาใช้ซ้ำได้ฟรี
  let lib = new Map()
  try {
    const res = await getObject("video-bg/lib/index.json")
    const idx = res ? await res.json() : { items: [] }
    lib = new Map((idx.items || []).map(x => [x.key, x]))
  } catch { /* ยังไม่มีคลัง */ }
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
  return files.map(f => {
    const L = lib.get(f.key)
    if (L) return { url: mediaUrl(f.key), franchise: L.franchise || null, tags: L.tags || [], note: L.note || "" }
    return { url: mediaUrl(f.key), franchise: fr.get(cid(f.key) ? `c${cid(f.key)}` : `p${proj(f.key)}`) || null }
  })
    .filter(b => b.franchise && (!franchise || b.franchise === franchise))
    .slice(0, 10)
}

async function recentLogs(n = 15) {
  try {
    const files = await listObjects(`${LOG_DIR}/`, 400)
    return files.sort((a, b) => String(b.modified).localeCompare(String(a.modified))).slice(0, n).map(f => f.key.slice(LOG_DIR.length + 1))
  } catch { return [] }
}
const recentPatterns = async (n = 10) =>
  (await recentLogs(n)).map(k => (k.match(/^[a-z0-9]+-([a-z0-9-]+?)--/) || [])[1]).filter(Boolean)

// สรุปที่ไม่มีอะไรเกินหัวข้อ (ข่าวที่ดึงเนื้อข่าวเต็มไม่ได้)
const squash = (s) => String(s || "").replace(/[\s\-–—·'"“”‘’|:]/g, "").toLowerCase()
const thin = (summary, title) => squash(summary).length < squash(title).length + 40

// ไอเดียเด็ดที่ยังไม่เคยทำ — คะแนนสูง · ถอดเนื้อหาแล้ว/ข้อมูลจริงของเรา/ทางการ/ราคา ได้แต้มเพิ่ม · ไม่ซ้ำ 15 สตอรี่บอร์ดล่าสุด
// กดเลือกรูปแบบมา → เลือกไอเดียที่เข้ากับรูปแบบก่อน (ทดสอบ 26 ต.ค.: "เรื่องเล่าในโลกของค่าย" ได้ไอเดียยอดขาย OP-17)
async function pickIdea(seed, pattern = null) {
  const used = new Set((await recentLogs(15)).map(k => Number((k.match(/--i(\d+)\.json$/) || [])[1])).filter(Boolean))
  const { data } = await db.from("marketing_ideas").select("id,source,subtype,title,summary,score,related_sku")
    .in("status", ["new", "picked"]).order("score", { ascending: false }).limit(80)
  const f = pattern?.fits
  const fit = (x) => !f || ((!f.sources?.length || f.sources.includes(x.source)) &&
    (!f.strict || (f.subtypes || []).includes(x.subtype)) && (!f.needs_sku || x.related_sku))
  const fresh = (data || []).filter(x => !used.has(x.id))
  const fitting = fresh.filter(fit)
  const pool = (fitting.length ? fitting : fresh).map(x => ({
    id: x.id,
    s: Number(x.score || 0) + (String(x.summary || "").startsWith("📌") ? 1 : 0) +
       (["internal", "official", "price"].includes(x.source) ? 0.5 : 0) + (x.related_sku ? 0.3 : 0),
  })).sort((a, b) => b.s - a.s).slice(0, 10)
  return pool.length ? pool[Math.abs(seed) % pool.length].id : null
}

export async function GET(req) {
  const gate = await requireMarketing(req)
  if (gate.error) return gate.error
  try {
    const { patterns } = await allPatterns()
    return NextResponse.json({
      patterns: [...patterns, FREE].map(p => ({ id: p.id, name: p.name, why: p.why, length: p.length, evidence: p.evidence,
        needs_sku: !!p.fits?.needs_sku, from_ad: p.from_ad || null, free: !!p.free })),
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
  let ideaId = Number(body?.idea_id)
  if (body?.idea_id === "auto") {
    const forced = typeof body?.pattern === "string" && !["auto", "free"].includes(body.pattern)
      ? (await allPatterns()).patterns.find(p => p.id === body.pattern) : null
    ideaId = await pickIdea(Math.floor(Date.now() / 1000), forced)
    if (!ideaId) return NextResponse.json({ error: "ไม่มีไอเดียใหม่ให้เลือก — รอตัวเก็บไอเดียรอบ 07:00 หรือเลือกไอเดียเองในโหมด \"จากไอเดีย\"" }, { status: 404 })
  }
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
    const { patterns, trust_facts: trustFacts } = await allPatterns()
    const recent = await recentPatterns()
    const pattern = choosePattern(patterns, {
      idea, hasSku: !!sku, recent, forced: typeof body?.pattern === "string" && body.pattern !== "auto" ? body.pattern : null,
      seed: ideaId + recent.length + Math.floor(Date.now() / 60000),
    })
    if (!pattern) return NextResponse.json({ error: "ไม่มีรูปแบบในคลัง (tasks/video_patterns.json)" }, { status: 500 })

    // ── ข้อมูลที่ตัวเขียนใช้ได้ (ข้อเท็จจริงทั้งหมดต้องมาจากตรงนี้) ──
    const angle = (Array.isArray(idea.angles) ? idea.angles : []).find(a => a?.label === idea.chosen_angle)
    const forbid = await otherNames(idea)
    const inside = idea.source === "internal" ? internalFacts(idea) : null
    // หัวข่าว Google News ห้อยชื่อสำนักข่าว " - Animation Magazine" — AI เข้าใจว่าสำนักข่าวเป็นคนเปิดตัว (ทดสอบ 26 ต.ค.)
    if (idea.source === "news") idea.title = String(idea.title || "").replace(/\s+[-–]\s+[^-–—]{2,60}$/, "")
    const summary = inside ? inside.summary : scrubNames(scrubSource(idea.summary, idea.source_label), forbid).slice(0, 1800)
    const facts = [
      `หัวข้อ: ${(inside ? inside.title : scrubNames(idea.title, forbid)) || "-"}`,
      summary ? `ข้อเท็จจริงของเรื่อง:\n${summary}` : null,
      angle ? `มุมที่เลือกไว้: ${angle.label} — ${inside ? inside.scrub(angle.brief) : scrubNames(scrubSource(angle.brief, idea.source_label), forbid)}` : null,
      sku ? `สินค้าในตู้ที่เกี่ยวข้อง: ${sku.name} (${sku.sku_id}) · ค่าย ${FRANCHISE_LABEL[sku.franchise] || sku.franchise}` +
            (sku.language ? ` · ฉบับภาษา${LANG_TH[sku.language] || sku.language}` : "") : null,
      siblings.length ? `ชุดอื่นของค่ายเดียวกันที่มีในตู้: ${siblings.map(s => s.name).join(" · ")}` : null,
      sku ? (haveAt.length ? `สาขาที่มีชุดนี้ตามรอบซิงค์ล่าสุด: ${haveAt.map(b => b.name).join(" · ")}`
                           : "สาขาที่มีชุดนี้: ไม่มีข้อมูล (ห้ามระบุสาขา)") : null,
      offCards(idea) ? "หมายเหตุ: เรื่องนี้ไม่ได้พูดเรื่องการ์ดโดยตรง" : null,
      // ข่าวที่มีแค่หัวข่าว (ทดสอบ 26 ต.ค.: หนัง Wild Card → AI แต่ง "ภาคนี้ฉีกแนวจนทุกคนต้องอึ้ง")
      !inside && thin(summary, idea.title)
        ? "หมายเหตุ: ข้อมูลมีแค่หัวข้อข่าว — เล่าได้แค่ที่หัวข้อบอก ห้ามแต่งรายละเอียดเพิ่ม (เนื้อเรื่อง แนว วันฉาย ราคา คำวิจารณ์) · ใช้ฉากชวนคิด/ชวนคอมเมนต์แทน" : null,
    ].filter(Boolean).join("\n")
      // ไอเดียจากยอดขายในตู้ (internal) มีตัวเลขในหัวข้อ "ยอดโต 1730%" — ห้ามขึ้นคอนเทนต์ · ลบตั้งแต่ก่อนส่งให้ AI
      .replace(/ยอด(โต|ตก|ขาย|พุ่ง)\s*[+-]?\d[\d,.]*\s*(%|เปอร์เซ็นต์|ซอง|ชิ้น)?/g, "ยอด$1 (ตัวเลขภายใน ห้ามบอก)")

    let voiceCfg = null
    try { voiceCfg = await task("content_voice.json") } catch { /* ใช้ค่ากลาง */ }
    let world = null
    try { world = franchise ? (await task("franchise_style.json")).franchises?.[franchise]?.look || null : null } catch { /* ไม่มีไฟล์ */ }
    const { system, user } = buildPrompt({ pattern, idea, facts, assets, voice: voiceCfg, trustFacts, library: patterns, world })

    let sb = null, model = null
    for (let i = 0; i < 2 && !sb; i++) {
      const r = await askGeminiText(i ? `${user}\n\n⚠️ รอบก่อนตอบไม่ใช่ JSON — ตอบเป็น JSON ล้วนเท่านั้น` : user,
        { system, temperature: 0.85, maxOutputTokens: 8192, timeout: 90000 })
      sb = parseStoryboard(r.text); model = r.model
    }
    if (!sb) return NextResponse.json({ error: "AI เขียนสตอรี่บอร์ดไม่สำเร็จ (ตอบไม่เป็น JSON) — กดใหม่อีกครั้ง" }, { status: 502 })

    const out = compile(sb, assets, { voice, pattern, forbid, internal: !!inside, franchise,
      external: ["youtube", "manual", "social", "radar"].includes(idea.source) })
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
      paints: out.paints, cost_thb: out.cost_thb,
      created_at: new Date().toISOString(), created_by: gate.user.id,
    }
    const doc = { id, name, timeline: cleaned.timeline, job_id: null, updated_at: story.created_at, updated_by: gate.user.id, story }
    await putObject(`video-edits/${id}.json`, JSON.stringify(doc), "application/json")
    try {
      await putObject(`${LOG_DIR}/${stamp}-${pattern.id}--${id}--i${idea.id}.json`, JSON.stringify(story), "application/json")
    } catch { /* ประวัติเป็นงานรอง — ร่างบันทึกแล้ว */ }

    return NextResponse.json({
      edit_id: id, name, seconds: out.seconds, voice,
      pattern: { id: pattern.id, name: pattern.name, why: pattern.why, evidence: pattern.evidence, free: !!pattern.free },
      idea: { id: idea.id, title: idea.title, source: idea.source },
      beats: out.beats, dropped: out.dropped, model, timeline: cleaned.timeline,
      paints: out.paints, cost_thb: out.cost_thb,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
