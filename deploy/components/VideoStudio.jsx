"use client"
// Video Studio — หน้า /video · สั่งโรงงานวิดีโอสั้น (deploy/agents/video) จากเว็บ
//
// ธีสิสการออกแบบ: หน้านี้คือ "ใบสั่งงาน" ไม่ใช่โปรแกรมตัดต่อ
// ตั้งใจไม่ทำ timeline ลากวาง เพราะของที่กำหนดผลลัพธ์จริงมีแค่สามอย่าง —
// สคริปต์ · ภาพประจำฉาก · เสียง — ที่เหลือเป็นงานของโรงงานฝั่ง python
// สามขั้นบนจอจึงเป็นสามอย่างนี้ตรง ๆ ไม่มีขั้นที่สี่
//
// ⚠️ ห้ามคิดกติกาตัดฉากเองในไฟล์นี้ — ต้องเลียน deploy/agents/video/segments.py
//    ให้ตรง (ดู sanitize/splitScenes ข้างล่าง) เพราะเลข "กี่ฉาก" ที่โชว์บนจอ
//    ต้องเท่ากับจำนวนภาพที่ฝั่ง python จะขอจริง ถ้าคลาดกันแม้ฉากเดียว ภาพจะเลื่อน
//    ไปทั้งคลิปโดยไม่มีอะไรฟ้อง error ให้เห็น
//
// สัญญากับฝั่ง API — plan ก้อนในนั้นคือ contract เดียวกับไฟล์ .json ที่ CLI รับ:
//    POST /api/video/render   body = { plan: { project, script, visuals, headline,
//                                             voice, style, music, xfade } }
//                             → 202 { job_id, status } · 409 ถ้าชื่องานซ้ำกับใบที่ยังทำอยู่
//    GET  /api/video/jobs?id= → { id, project, status, video_url, duration_seconds, error, ... }
//                               status = queued | rendering | done | failed
//                               (ไม่มีคำว่า running — CHECK ในตาราง video_jobs ห้ามไว้
//                                STATUS_ALIAS ข้างล่างรับไว้เผื่อฝั่งเซิร์ฟเวอร์เปลี่ยนคำเฉย ๆ)
//    GET  /api/video/jobs     → { items: [...] }
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
  Film, Type, Image as ImageIcon, Send, AlertTriangle, X, Lock, Download,
  RefreshCw, Loader2, Check, Clock, Sparkles, Mic,
} from "lucide-react"
import { supabase, getSkus, getProfile } from "../lib/supabase"

// ── ตัวเลือกที่ต้องตรงกับฝั่ง python ────────────────────────────────────
// คำอธิบายลอกมาจาก VOICES ใน agents/video/voice.py — เสียงพวกนี้ทดสอบกับไทยแล้ว
// ห้ามเติมชื่ออื่นเองแม้ Gemini จะมีให้เลือกอีกเยอะ (ยังไม่มีใครฟังว่าอ่านไทยรู้เรื่องไหม)
const VOICES = [
  { id: "Aoede",  label: "Aoede",  desc: "หญิง · โทนสบาย ไม่เร่ง — ค่าเริ่มต้น" },
  { id: "Kore",   label: "Kore",   desc: "หญิง · หนักแน่น เหมาะกับให้ความรู้" },
  { id: "Puck",   label: "Puck",   desc: "ชาย · สดใส จังหวะเร็ว" },
  { id: "Charon", label: "Charon", desc: "ชาย · ทุ้มนิ่ง เหมาะกับเล่าเรื่อง" },
]

// สีซับ — ตรงกับ STYLES ใน agents/video/subtitle.py
const STYLES = [
  { id: "brand", label: "แบรนด์",  desc: "ขาว ขอบกรมท่า เน้นฟ้านีออน" },
  { id: "plain", label: "เรียบ",   desc: "ขาว ขอบดำ — อ่านง่ายบนภาพทุกแบบ" },
  { id: "punch", label: "จัดจ้าน", desc: "เหลือง ขอบดำ — เด่นสุด" },
]

// อัตราอ่านโดยประมาณของ Gemini TTS กับข้อความไทย (~11 อักขระ/วินาที)
// วัดคร่าว ๆ จากคลิปที่ทำจริง ไม่ใช่ค่าคงที่ของระบบ — ความยาวจริงรู้หลังทำเสียงเสร็จ
const CHARS_PER_SEC = 11

const MAX_SCENE_CHARS = 90     // เท่ากับ max_chars ของ segments.split_script

// เพดานเวลาของ runner — timeout-minutes: 45 ใน .github/workflows/video-render.yml
// งานที่ยังมีชีวิตอยู่จริงจะเกินเลขนี้ไม่ได้เลย เกินเมื่อไหร่คือ "ตายแล้วแต่ไม่มีใครปิดใบให้"
const RUNNER_CEILING_SEC = 45 * 60

// เพดานเดียวกับ validatePlan ใน app/api/video/render/route.js — ต้องแก้พร้อมกันสองที่
// ตั้งใจไม่ import จาก route เพราะไฟล์นั้นเป็น server-only (ดึง service key มาด้วย)
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MAX_LINES = 30
const MAX_SCRIPT_CHARS = 4000

// ── ล้างข้อความให้เหมือน segments.sanitize() ────────────────────────────
// ที่ต้องมีสองชุด (มี /g กับไม่มี) เพราะ RegExp ที่มี /g จำ lastIndex ไว้ —
// เรียก .test() ซ้ำกับสตริงเดิมจะได้ true สลับ false เป็นชุด ๆ ซึ่งบนหน้านี้จะกลาย
// เป็นคำเตือน "มีอีโมจิ" กะพริบเข้า-ออกทุกครั้งที่พิมพ์ แล้วหาสาเหตุไม่เจอ
//
// ⚠️ ช่วง emoji ต้องเท่ากับ _EMOJI ใน segments.py **เป๊ะ ๆ** ห้ามกว้างกว่าเด็ดขาด
//    ฉบับแรกเขียนไว้ 2600-2BFF ซึ่งกว้างกว่า python (หยุดที่ 27BF) ผลคือ ⭐ ⭕ ⬛ ⬜
//    ถูกตัดฝั่งเว็บแต่ python เก็บไว้ → บรรทัด "⭐" เดี่ยว ๆ หน้าเว็บนับได้ 0 ฉาก
//    แต่ python นับได้ 1 ฉาก ภาพเลยเลื่อนกันทั้งคลิปตั้งแต่ฉากนั้นไป โดยไม่มีอะไรฟ้อง
//    (รันเทียบสองฝั่งด้วยสคริปต์จริง 9 ก.ย. 2026 — ต่างกัน 7 จาก 18 เคส)
//
//    วงเล็บใช้ `.` ไม่ใช่ `[\s\S]` เพราะ python ก็ใช้ `.` ซึ่งไม่ข้ามบรรทัด
//    ถ้าปล่อยให้ข้ามได้ วงเล็บเปิดบรรทัดแรกกับวงเล็บปิดบรรทัดที่ห้าจะจับคู่กันเอง
//    แล้วขึ้นเตือน "มีข้อความในวงเล็บ" ทั้งที่ไม่มีอะไรถูกตัดจริงสักตัว
const RE = {
  url:     /https?:\/\/\S+|www\.\S+/g,
  bracket: /[[(（].*?[\])）]/g,
  hashtag: /#\S+/g,
  emoji:   /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\uFE0F]+/gu,
  spaces:  /[ \t\u00A0]+/g,
}
const HAS = {
  url:     /https?:\/\/\S+|www\.\S+/,
  bracket: /[[(（].*?[\])）]/,
  hashtag: /#\S+/,
  emoji:   /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\uFE0F]/u,
  // \u0E2A\u0E31\u0E0D\u0E25\u0E31\u0E01\u0E29\u0E13\u0E4C\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48 "\u0E19\u0E2D\u0E01" \u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48 sanitize \u0E15\u0E31\u0E14 \u2014 \u2B50 \u2B55 \u2B1B \u2B1C \u2192 \u25B6 \u0E2F\u0E25\u0E2F
  // \u0E15\u0E31\u0E14\u0E40\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E1E\u0E23\u0E32\u0E30\u0E08\u0E30\u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A python (\u0E14\u0E39\u0E04\u0E33\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E02\u0E49\u0E32\u0E07\u0E1A\u0E19) \u0E21\u0E31\u0E19\u0E08\u0E36\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E15\u0E34\u0E14\u0E44\u0E1B\u0E43\u0E2B\u0E49 TTS \u0E2D\u0E48\u0E32\u0E19\u0E08\u0E23\u0E34\u0E07
  // \u0E15\u0E49\u0E2D\u0E07\u0E1A\u0E2D\u0E01\u0E43\u0E2B\u0E49\u0E04\u0E19\u0E40\u0E02\u0E35\u0E22\u0E19\u0E25\u0E1A\u0E40\u0E2D\u0E07 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E1B\u0E25\u0E48\u0E2D\u0E22\u0E44\u0E1B\u0E44\u0E14\u0E49\u0E22\u0E34\u0E19\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E2A\u0E31\u0E0D\u0E25\u0E31\u0E01\u0E29\u0E13\u0E4C\u0E43\u0E19\u0E04\u0E25\u0E34\u0E1B\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E2D\u0E22\u0E23\u0E39\u0E49
  leftover: /[\u2190-\u25FF\u27C0-\u2BFF]/,
}

// python \u0E15\u0E31\u0E14\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E14\u0E49\u0E27\u0E22 str.splitlines() \u0E0B\u0E36\u0E48\u0E07\u0E15\u0E31\u0E14\u0E17\u0E35\u0E48 \r \u0E41\u0E25\u0E30 U+2028/2029 \u0E14\u0E49\u0E27\u0E22 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E41\u0E04\u0E48 \n
// textarea \u0E04\u0E37\u0E19\u0E04\u0E48\u0E32\u0E21\u0E32\u0E40\u0E1B\u0E47\u0E19 \n \u0E01\u0E47\u0E08\u0E23\u0E34\u0E07 \u0E41\u0E15\u0E48\u0E2A\u0E04\u0E23\u0E34\u0E1B\u0E15\u0E4C\u0E17\u0E35\u0E48 "\u0E27\u0E32\u0E07" \u0E21\u0E32\u0E08\u0E32\u0E01 Word \u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E1F\u0E25\u0E4C CRLF
// \u0E1E\u0E32 \r \u0E01\u0E31\u0E1A U+2028 \u0E15\u0E34\u0E14\u0E21\u0E32\u0E44\u0E14\u0E49 \u2014 \u0E1D\u0E31\u0E48\u0E07\u0E40\u0E27\u0E47\u0E1A\u0E19\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E40\u0E14\u0E35\u0E22\u0E27 python \u0E19\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E2A\u0E2D\u0E07 \u0E20\u0E32\u0E1E\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E2D\u0E35\u0E01\u0E17\u0E32\u0E07
const LINE_BREAK = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/

// \u0E19\u0E31\u0E1A\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E40\u0E1B\u0E47\u0E19 "\u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23" (code point) \u0E41\u0E1A\u0E1A len() \u0E02\u0E2D\u0E07 python \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48 .length \u0E02\u0E2D\u0E07 JS
// \u0E17\u0E35\u0E48\u0E19\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E2B\u0E19\u0E48\u0E27\u0E22 UTF-16 \u2014 \u0E15\u0E31\u0E27\u0E2B\u0E19\u0E32\u0E41\u0E1A\u0E1A\u0E42\u0E0B\u0E40\u0E0A\u0E35\u0E22\u0E25 (\uD835\uDC07\uD835\uDC1E\uD835\uDC25\uD835\uDC25\uD835\uDC28 = U+1D400 \u0E02\u0E36\u0E49\u0E19\u0E44\u0E1B) \u0E19\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19 2 \u0E15\u0E48\u0E2D\u0E15\u0E31\u0E27
// \u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14\u0E22\u0E32\u0E27 \u0E46 \u0E08\u0E36\u0E07\u0E16\u0E39\u0E01\u0E0B\u0E2D\u0E22\u0E1D\u0E31\u0E48\u0E07\u0E40\u0E27\u0E47\u0E1A\u0E41\u0E15\u0E48\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E0B\u0E2D\u0E22\u0E1D\u0E31\u0E48\u0E07 python = \u0E08\u0E33\u0E19\u0E27\u0E19\u0E09\u0E32\u0E01\u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E19\u0E2D\u0E35\u0E01\u0E41\u0E1A\u0E1A
const cpLen = (s) => [...s].length

function sanitize(line) {
  let s = line.normalize("NFC")
  s = s.replace(RE.url, "")
  s = s.replace(RE.bracket, "")
  s = s.replace(RE.hashtag, "")
  s = s.replace(RE.emoji, "")
  s = s.replace(RE.spaces, " ")
  // เท่ากับ .strip(" -–—·•\t") ฝั่ง python
  return s.replace(/^[ \-–—·•\t]+/, "").replace(/[ \-–—·•\t]+$/, "")
}

// ซอยบรรทัดยาวที่ช่องว่าง — ก๊อปตรรกะจาก segments._wrap
// ภาษาไทยไม่มีช่องว่างระหว่างคำ ถ้าซอยไม่ได้ก็ปล่อยยาวไว้ ดีกว่าตัดกลางคำจนอ่านไม่รู้เรื่อง
function wrapLine(line, limit) {
  if (cpLen(line) <= limit) return [line]
  const out = []
  let cur = ""
  for (const w of line.split(" ")) {
    if (cur && cpLen(cur) + 1 + cpLen(w) > limit) { out.push(cur); cur = w }
    else cur = `${cur} ${w}`.trim()
  }
  if (cur) out.push(cur)
  return out.length ? out : [line]
}

function splitScenes(text) {
  const out = []
  for (const raw of (text || "").split(LINE_BREAK)) {
    const line = sanitize(raw)
    if (!line) continue
    for (const piece of wrapLine(line, MAX_SCENE_CHARS)) out.push(piece)
  }
  return out
}

// คืนข้อความบอกว่า path นี้ใช้ไม่ได้เพราะอะไร · คืน null ถ้าผ่าน
// กติกาลอกจาก badVisual() ใน app/api/video/render/route.js — เครื่องเรนเดอร์เป็น ubuntu
// ที่ checkout รีโปแล้วรันด้วย working-directory: deploy path ของเครื่องเราจึงไม่มีอยู่จริงที่นั่น
//
// ⚠️ ลิงก์ http(s) ต้องกันเองตรงนี้ด้วย เพราะ route ปล่อยผ่าน (ไม่เข้าเงื่อนไขไดรฟ์/แบ็กสแลช/
//    ขึ้นต้นด้วย /) แต่ visuals.resolve() เปิดเป็นไฟล์ตรง ๆ ไม่ได้ดาวน์โหลดให้ — งานจะไปตาย
//    FileNotFoundError ที่ขั้น 4 คือหลังจ่ายค่า TTS ไปแล้ว เสียทั้งโควตาและเวลา runner
function badFilePath(p) {
  if (!p) return "ยังไม่ได้ใส่ที่อยู่ไฟล์"
  if (/^https?:\/\//i.test(p)) {
    return "ยังใช้ลิงก์รูปไม่ได้ — ต้องเป็นไฟล์ที่อยู่ในรีโป (คอมมิตเข้าไปก่อน แล้วอ้างเป็น path)"
  }
  if (/^[A-Za-z]:/.test(p) || p.includes("\\") || p.startsWith("/")) {
    return "ต้องเป็น path ในรีโปแบบ relative จากโฟลเดอร์ deploy/ เช่น public/machine/machine-hero.jpg"
  }
  if (p.split("/").includes("..")) return "ห้ามมี .. ใน path"
  return null
}

function mmss(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function thaiAgo(iso) {
  if (!iso) return "—"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "เมื่อกี้"
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`
  return `${Math.floor(hrs / 24)} วันที่แล้ว`
}

// ── สถานะงาน ───────────────────────────────────────────────────────────
// ฝั่งเซิร์ฟเวอร์อาจใช้คำต่างกันเล็กน้อย (pending/running/success) — แปลงเป็นสี่คำ
// ที่หน้านี้รู้จัก ดีกว่าปล่อยป้ายว่างแล้วคนเดาไม่ออกว่างานถึงไหน หรือแย่กว่านั้นคือ
// ปุ่มติดตามหยุดเอง เพราะสถานะที่ไม่รู้จักถูกนับเป็น "จบแล้ว"
const STATUS_ALIAS = {
  pending: "queued", waiting: "queued", new: "queued",
  running: "rendering", processing: "rendering", in_progress: "rendering", building: "rendering",
  success: "done", completed: "done", finished: "done", ok: "done",
  error: "failed", failure: "failed", cancelled: "failed",
}
const STATUS = {
  queued:    { label: "รอคิว",     cls: "vs-st-wait" },
  rendering: { label: "กำลังทำ",   cls: "vs-st-run" },
  done:      { label: "เสร็จแล้ว", cls: "vs-st-ok" },
  failed:    { label: "ล้มเหลว",   cls: "vs-st-bad" },
}
const OPEN_STATES = new Set(["queued", "rendering"])

function normJob(raw) {
  if (!raw) return null
  const j = raw.job || raw
  const st = STATUS_ALIAS[j.status] || j.status || "queued"
  return {
    ...j,
    id: j.id ?? j.job_id,
    status: STATUS[st] ? st : "queued",
    // ชื่อฟิลด์ url ฝั่ง API ยังไม่นิ่ง — รับหลายชื่อไว้ก่อน ถ้ามาผิดชื่อจะกลายเป็น
    // "เสร็จแล้วแต่กดเล่นไม่ได้" ซึ่งดูเหมือนโรงงานพัง ทั้งที่ไฟล์อยู่ครบ
    video_url: j.video_url || j.url || j.mp4_url || j.output_url || null,
  }
}

export default function VideoStudio() {
  const [authState, setAuthState] = useState("checking")   // checking | ok | anon | forbidden
  const [err, setErr] = useState(null)

  // ── ขั้น 01 สคริปต์ ──
  const [script, setScript] = useState("")
  const [headline, setHeadline] = useState("")
  // ชื่อโปรเจกต์ = ชื่อโฟลเดอร์งานใน .video-work/ บนเครื่องเรนเดอร์
  const [project, setProject] = useState("")

  // ── ขั้น 02 องค์ประกอบ ──
  const [picks, setPicks] = useState([])
  const [voice, setVoice] = useState("Aoede")
  const [style, setStyle] = useState("brand")
  const [xfade, setXfade] = useState(0.35)
  const [skus, setSkus] = useState([])
  const [skuErr, setSkuErr] = useState("")

  // ── ขั้น 03 เรนเดอร์ ──
  const [step, setStep] = useState(1)
  const [sending, setSending] = useState(false)
  const [job, setJob] = useState(null)          // งานที่กำลังติดตามอยู่
  const [jobs, setJobs] = useState([])          // รายการงานเก่า
  const [jobsErr, setJobsErr] = useState("")    // อ่านรายการงานเก่าไม่สำเร็จเพราะอะไร
  const [since, setSince] = useState(null)      // เวลาที่กดส่ง — ใช้นับว่ารอมากี่นาทีแล้ว

  // ธงบอกว่ายังอยู่บนหน้านี้ไหม — ลูปติดตามงานต้องหยุดเองถ้าคนปิดหน้าไปแล้ว
  // ไม่งั้นจะยิง API ต่อและ setState กับ component ที่ถูก unmount ไปแล้ว
  //
  // ⚠️ ต้องตั้งกลับเป็น true ตอน mount ด้วย ห้ามพึ่งค่าเริ่มต้นของ useRef อย่างเดียว —
  //    React StrictMode (เปิดโดยดีฟอลต์ตั้งแต่ Next 13.5 ตอน dev) รัน effect เป็น
  //    mount → cleanup → mount ค่าจึงค้างเป็น false ตั้งแต่วินาทีแรก แล้วทุกผลลัพธ์
  //    จาก API ถูกทิ้งเงียบ ๆ: รายการงานว่างตลอด สถานะไม่เคยขยับ และไม่มี error ให้เห็น
  //    (prod ไม่เจอเพราะ effect รันรอบเดียว — บั๊กที่โผล่เฉพาะตอน dev คือแบบที่หาสาเหตุนานสุด)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // ── auth ──
  // ท่าเดียวกับ MarketingOS แต่ตรวจ role เพิ่มตั้งแต่เปิดหน้า เพราะสองปลายทางคนละสิทธิ์:
  // /api/video/jobs ใช้ requireUser (ล็อกอินแล้วดูสถานะได้) ส่วน /api/video/render ใช้
  // requireAdmin — ถ้าไม่ตรวจตรงนี้ คนที่ไม่ใช่แอดมินจะพิมพ์สคริปต์จนจบแล้วเพิ่งโดน 403
  // ตอนกดส่ง ซึ่งจังหวะนั้นทั้งจอถูกแทนด้วยหน้า "เฉพาะแอดมิน" = สคริปต์ที่พิมพ์มาหายทั้งดุ้น
  useEffect(() => {
    let stop = false
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data?.session?.access_token ? data.session.user : null
      if (!user) { if (!stop) setAuthState("anon"); return }
      let role
      // อ่าน role ไม่ได้ (เน็ตหลุด/RLS) ให้ผ่านไปก่อนแล้วปล่อยให้ route เป็นคนตัดสิน —
      // ล็อกแอดมินตัวจริงออกเพราะ query พลาดครั้งเดียว แย่กว่าปล่อยให้ไปเจอ 403 ตอนกด
      try { role = (await getProfile(user.id))?.role } catch { role = undefined }
      if (stop) return
      setAuthState(role && role !== "admin" ? "forbidden" : "ok")
    }).catch(() => {
      // getSession() พังเอง (localStorage ถูกปิด / โดเมนแปลก) — ถ้าไม่รับไว้ตรงนี้
      // authState จะค้างที่ "checking" คือจอ "กำลังตรวจสิทธิ์…" ตลอดกาล ไม่มี error ให้เห็น
      if (!stop) setAuthState("anon")
    })
    return () => { stop = true }
  }, [])

  // ⚠️ ต้องดึง token สดทุกครั้ง ห้ามใช้ตัวที่เก็บไว้ตอน mount —
  //    access_token หมดอายุใน ~1 ชม. client ต่ออายุให้เองแต่ตัวที่ copy ไปแล้วไม่ตาม
  //    หน้านี้เปิดค้างรอเรนเดอร์เป็นสิบนาทีเป็นเรื่องปกติ จึงเจอเคสนี้ง่ายกว่าหน้าอื่น
  const api = useCallback(async (path, opts = {}) => {
    const { data: s } = await supabase.auth.getSession()
    const fresh = s?.session?.access_token
    if (!fresh) { setAuthState("anon"); throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง") }
    const res = await fetch(`/api/video/${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fresh}`, ...(opts.headers || {}) },
    })
    if (res.status === 401) { setAuthState("anon"); throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่อีกครั้ง") }
    if (res.status === 403) { setAuthState("forbidden"); throw new Error("ต้องเป็น admin เท่านั้น") }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = new Error(json.error || `HTTP ${res.status}`)
      e.status = res.status
      // route ตอบ 404 พร้อมข้อความไทยตอนหางานไม่เจอ — ถ้า 404 มาแบบไม่มี body เลย
      // แปลว่ายังไม่มีปลายทางบนเซิร์ฟเวอร์นี้ คนละเรื่องกันคนละวิธีแก้
      e.hint = json.hint || (res.status === 404 && !json.error
        ? "ยังไม่มีปลายทาง /api/video บนเซิร์ฟเวอร์นี้ — ถ้าเพิ่งเพิ่มโค้ด ต้อง push ขึ้น main ให้ Vercel deploy ก่อน"
        : undefined)
      // 409 (ชื่องานซ้ำ) / 502 (ยิง GitHub ไม่ผ่าน) แนบเลขงานกลับมาด้วย —
      // เก็บไว้เพื่อพาไปดูงานใบนั้นต่อ ดีกว่าบอกว่าซ้ำแล้วปล่อยให้ไปหาเอง
      if (json.job_id) e.job = { id: json.job_id, status: json.status }
      throw e
    }
    return json
  }, [])

  // ── ชื่องานเริ่มต้น: วันเวลาแบบสั้น ──
  // ตั้งใน effect ไม่ใช่ค่าเริ่มต้นของ useState เพราะ new Date() ตอน render ทำให้ HTML
  // ที่เซิร์ฟเวอร์กับเบราว์เซอร์วาดไม่ตรงกัน (hydration mismatch)
  useEffect(() => {
    if (project) return
    const d = new Date()
    const p = (n) => String(n).padStart(2, "0")
    setProject(`clip-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`)
  }, [project])

  // ── รายชื่อสินค้าไว้เลือกรูปซอง/กล่องจริง ──
  // อ่านผ่าน supabase client เหมือนหน้าอื่น (ต้องล็อกอินแล้ว เพราะ RLS ปิด anon ไว้)
  useEffect(() => {
    if (authState !== "ok") return
    getSkus()
      .then(rows => setSkus(rows || []))
      .catch(e => setSkuErr(e.message || "โหลดรายการสินค้าไม่สำเร็จ"))
  }, [authState])

  // ยังไม่มีรูปซอง/กล่องในระบบ = สั่งไปก็ตายที่ขั้น 4 ของโรงงาน (visuals._sku_image
  // โยน "SKU ... ยังไม่มีรูป") ซึ่งเป็นจังหวะหลังจ่ายค่า TTS ไปแล้ว — กันตั้งแต่ตรงนี้
  // (ชื่อคอลัมน์สองตัวนี้ต้องตรงกับที่ _sku_image อ่าน: image_url ก่อน แล้วค่อย image_url_box)
  const skuNoImage = useMemo(
    () => new Set(skus.filter(s => !s.image_url && !s.image_url_box).map(s => s.sku_id)),
    [skus])

  const scenes = useMemo(() => splitScenes(script), [script])
  const chars = useMemo(() => scenes.reduce((n, s) => n + cpLen(s), 0), [scenes])
  const estSec = chars / CHARS_PER_SEC

  // เพดานของ /api/video/render นับ "บรรทัดที่ไม่ว่าง" ของสคริปต์ดิบ ไม่ใช่ฉากหลังซอย
  // จึงต้องนับแบบเดียวกันเป๊ะ ไม่งั้นหน้าเว็บบอกว่าผ่านแต่เซิร์ฟเวอร์ตีกลับ
  //
  // ⚠️ ตัวตัดบรรทัดตรงนี้เป็น /\r?\n/ ต่างจาก LINE_BREAK ของ splitScenes โดยตั้งใจ —
  //    สองบรรทัดนี้ตอบคนละคำถาม: อันนี้เลียน route (ตัวที่จะตีกลับ) ส่วน splitScenes
  //    เลียน python (ตัวที่กำหนดว่าจะได้กี่ฉาก) ทำให้เหมือนกันเมื่อไหร่จะผิดฝั่งใดฝั่งหนึ่ง
  const rawLines = useMemo(
    () => script.split(/\r?\n/).map(s => s.trim()).filter(Boolean), [script])

  // สิ่งที่จะถูกตัดทิ้งตอนอ่านออกเสียง — เตือนตั้งแต่ตอนเขียน ไม่ใช่ให้ไปเจอในคลิป
  // เจ้าของเจอกับเครื่องมือเจ้าอื่นมาแล้ว: มันอ่าน "แฮชแท็กวันพีซทีซีจี" ออกมาจริง ๆ
  // ระบบเราตัดให้อยู่แล้ว แต่คนเขียนควรรู้ว่าบรรทัดที่พิมพ์กับที่ถูกอ่านไม่ใช่อันเดียวกัน
  const warns = useMemo(() => {
    const w = []
    if (HAS.emoji.test(script)) w.push("อีโมจิ")
    if (HAS.hashtag.test(script)) w.push("แฮชแท็ก (#)")
    if (HAS.bracket.test(script)) w.push("ข้อความในวงเล็บ")
    if (HAS.url.test(script)) w.push("ลิงก์")
    return w
  }, [script])

  // ต่างจาก warns ข้างบน: พวกนี้ระบบ "ตัดให้ไม่ได้" (ตัดแล้วจะไม่ตรงกับ segments.py)
  // จึงเหลือติดไปให้ TTS อ่านออกเสียงจริง ๆ ต้องบอกให้ลบเอง ไม่ใช่บอกว่าเดี๋ยวตัดให้
  // ตรวจกับข้อความ "หลังล้างแล้ว" เพราะตัวที่อยู่ในวงเล็บ/ท้ายแฮชแท็กถูกตัดไปก่อนแล้ว
  const leftovers = useMemo(
    () => scenes.some(s => HAS.leftover.test(s)), [scenes])

  // ── ภาพต่อฉาก: ยาวเท่าจำนวนฉากเสมอ ──
  // ค่าเริ่มต้นสลับ hero/scene ตามที่ make_video.py ทำเวลาระบุภาพมาไม่ครบ
  // เลือกให้เหมือนกันเพื่อให้ "ที่เห็นบนจอ" = "ที่จะได้จริง" ตั้งแต่ยังไม่แตะอะไรเลย
  useEffect(() => {
    setPicks(prev => {
      if (prev.length === scenes.length) return prev
      const next = prev.slice(0, scenes.length)
      while (next.length < scenes.length) {
        next.push({ source: next.length % 2 === 0 ? "machine:hero" : "machine:scene", sku: "", file: "" })
      }
      return next
    })
  }, [scenes.length])

  const setPick = (i, patch) => setPicks(p => p.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const visuals = useMemo(() => picks.map(p => (
    p.source === "sku" ? `sku:${p.sku}`
      : p.source === "file" ? `file:${p.file.trim()}`
      : p.source
  )), [picks])

  // ปัญหาที่ทำให้ยังส่งไม่ได้ — โชว์เป็นข้อ ๆ ข้างปุ่ม ดีกว่าปล่อยให้กดแล้วค่อยเด้ง error
  // (ฝั่งเรนเดอร์รู้ว่า sku ผิดตอนขั้นที่ 4 คือหลังจ่ายค่า TTS ไปแล้ว)
  const blockers = useMemo(() => {
    const b = []
    if (!scenes.length) b.push("ยังไม่ได้พิมพ์สคริปต์")
    // กติกาชุดนี้ลอกจาก validatePlan ใน app/api/video/render/route.js —
    // ถ้าปล่อยให้หลวมกว่าฝั่งนั้น จะได้ปุ่มที่กดได้แต่ตีกลับ ซึ่งแย่กว่าปุ่มที่กดไม่ได้
    if (!PROJECT_RE.test(project)) {
      b.push("ชื่องานใช้ได้เฉพาะ a-z 0-9 - _ (พิมพ์เล็ก) ไม่เกิน 64 ตัว และขึ้นต้นด้วยตัวอักษรหรือตัวเลข")
    }
    if (rawLines.length > MAX_LINES) b.push(`สคริปต์ ${rawLines.length} บรรทัด — รับได้ไม่เกิน ${MAX_LINES}`)
    if (rawLines.join("\n").length > MAX_SCRIPT_CHARS) {
      b.push(`สคริปต์ยาวเกิน ${MAX_SCRIPT_CHARS.toLocaleString("th-TH")} ตัวอักษร`)
    }
    picks.forEach((p, i) => {
      if (p.source === "sku") {
        if (!p.sku) b.push(`ฉาก ${i + 1} ยังไม่ได้เลือกสินค้า`)
        else if (skuNoImage.has(p.sku)) {
          b.push(`ฉาก ${i + 1} · ${p.sku} ยังไม่มีรูปซอง/กล่องในระบบ — อัปโหลดที่หน้าจัดการ SKU ก่อน`)
        }
      }
      if (p.source === "file") {
        const bad = badFilePath(p.file.trim())
        if (bad) b.push(`ฉาก ${i + 1} · ${bad}`)
      }
    })
    return b
  }, [scenes.length, project, picks, rawLines, skuNoImage])

  // ── รายการงานเก่า ──
  const loadJobs = useCallback(async () => {
    try {
      const r = await api("jobs")
      if (!alive.current) return
      setJobs((r.items || r.jobs || []).map(normJob))
      setJobsErr("")
    } catch (e) {
      // อ่านรายการงานเก่าไม่ได้ ไม่ควรบังหน้าที่เหลือซึ่งยังสั่งงานใหม่ได้ตามปกติ
      // แต่ต้องเก็บสาเหตุไว้โชว์ในกล่องว่าง ๆ ด้วย — ไม่งั้น 500 จากเซิร์ฟเวอร์กับ
      // "ยังไม่เคยสั่งงานเลย" หน้าตาเหมือนกันเป๊ะ แล้วคนสั่งซ้ำเพราะนึกว่าใบเก่าหายไป
      if (alive.current) { setJobs([]); setJobsErr(e.message || "อ่านรายการงานไม่สำเร็จ") }
    }
  }, [api])

  useEffect(() => { if (authState === "ok") loadJobs() }, [authState, loadJobs])

  // ── ติดตามงานที่กำลังทำ (ทุก 5 วินาที) ──
  // deps เป็น id กับ status ซึ่งเป็นสตริง ไม่ใช่ตัว job ทั้งก้อน — ถ้าใส่ทั้งก้อน
  // ทุกครั้งที่ poll เสร็จ object จะเปลี่ยน reference แล้ว effect รีสตาร์ต
  // ตัวจับเวลาเลยถูกล้างทิ้งก่อนครบ 5 วิเสมอ (เคยเป็นบั๊กแบบนี้มาแล้วในหน้าอื่น)
  useEffect(() => {
    if (!job?.id || !OPEN_STATES.has(job.status)) return
    const t = setInterval(async () => {
      try {
        const r = await api(`jobs?id=${encodeURIComponent(job.id)}`)
        if (!alive.current) return
        const n = normJob(r)
        setJob(n)
        // ถามสำเร็จแล้ว = เน็ตกลับมาแล้ว ต้องเก็บแบนเนอร์ของรอบที่หลุดไปด้วย
        // ไม่งั้นข้อความ "เน็ตหลุด" ค้างจอทั้งที่งานเดินต่อปกติ คนจะไม่กล้ารอ
        // ⚠️ เก็บเฉพาะตัวที่ลูปนี้เป็นคนตั้ง (from === "poll") — error จากตอนกดส่ง
        //    เช่น 409 ชื่อซ้ำ ต้องค้างไว้ให้อ่าน ไม่ใช่โดนลูปลบทิ้งใน 5 วินาที
        setErr(prev => (prev?.from === "poll" ? null : prev))
        if (n && !OPEN_STATES.has(n.status)) loadJobs()
      } catch (e) {
        // ล้มครั้งเดียวไม่เลิกติดตาม — เน็ตมือถือหลุดวูบเดียวไม่ควรทำให้เลิกตามงาน
        // ที่ยังทำอยู่จริง (เรนเดอร์คลิปหนึ่งตัวกินเวลา ~5 นาที มีเวลาให้หลุดเยอะ)
        if (alive.current) setErr({ msg: e.message, hint: e.hint, from: "poll" })
      }
    }, 5000)
    return () => clearInterval(t)
  }, [job?.id, job?.status, api, loadJobs])

  // นาฬิกาเดินระหว่างรอ — ไม่มีตัวเลขขยับ คนจะคิดว่าค้างแล้วกดส่งซ้ำ
  // (บทเรียนจากปุ่มสร้างภาพในหน้า /marketing ที่ใช้เวลา 1-2 นาทีเหมือนกัน)
  const [, tick] = useState(0)
  const running = !!job && OPEN_STATES.has(job.status)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [running])

  async function submit() {
    if (sending || blockers.length) return
    setSending(true); setErr(null)
    try {
      const plan = {
        project,
        script,
        visuals,
        headline: headline.trim() || null,
        voice,
        style,
        music: null,               // คลังเพลงยังไม่มี — ส่ง null ไว้ให้คีย์ครบตาม contract
        xfade: Number(xfade),
      }
      // ⚠️ ห่อไว้ใน { plan } — route ฝั่งเซิร์ฟเวอร์อ่าน body.plan ไม่ใช่ body ทั้งก้อน
      //    (มันประกอบแผนขึ้นใหม่จากคีย์ที่อยู่ใน contract เท่านั้น ส่งแบน ๆ ไปจะถูกตีกลับ
      //    ว่า "ต้องส่ง plan เป็น object" ซึ่งอ่านแล้วนึกว่าแผนตัวเองผิด)
      const r = await api("render", { method: "POST", body: JSON.stringify({ plan }) })
      const n = normJob(r)
      if (!n?.id) throw new Error("เซิร์ฟเวอร์ไม่ได้ส่งเลขงานกลับมา — ติดตามสถานะไม่ได้")
      // route ตอบกลับแค่ { job_id, status } ไม่มีชื่องานมาด้วย — เติมเองไว้ก่อน
      // ไม่งั้นพาเนลจะโชว์ uuid ยาว ๆ อยู่ 5 วินาทีจนกว่ารอบ poll แรกจะกลับมา
      setJob({ ...n, project: n.project || project }); setSince(Date.now()); setStep(3)
      loadJobs()
    } catch (e) {
      setErr({ msg: e.message, hint: e.hint })
      // ชื่องานซ้ำกับใบที่ยังทำอยู่ — พาไปดูใบนั้นเลย เพราะสิ่งที่คนอยากรู้จริง ๆ
      // คือ "แล้วใบเก่าถึงไหนแล้ว" ไม่ใช่แค่รู้ว่าซ้ำ
      if (e.job?.id) { setJob(normJob(e.job)); setSince(null); setStep(3) }
    } finally {
      setSending(false)
    }
  }

  // ── หน้าจอสถานะสิทธิ์ ──
  if (authState === "checking") return <Frame><p className="vs-dim">กำลังตรวจสิทธิ์…</p></Frame>
  if (authState === "anon") return (
    <Frame>
      <div className="dx-card vs-gate">
        <Lock size={30} />
        <p className="vs-gate-t">ต้องเข้าสู่ระบบก่อน</p>
        <p className="vs-dim">หน้านี้สั่งงานเครื่องเรนเดอร์ภายใน</p>
        <a href="/" className="dx-btn dx-btn-primary">ไปหน้าเข้าสู่ระบบ</a>
      </div>
    </Frame>
  )
  if (authState === "forbidden") return (
    <Frame>
      <div className="dx-card vs-gate">
        <Lock size={30} color="var(--dx-danger)" />
        <p className="vs-gate-t">เฉพาะผู้ดูแลระบบ (admin)</p>
      </div>
    </Frame>
  )

  // นาฬิกา "รอมาแล้ว" ต้องเดินได้ทั้งงานที่เพิ่งกดส่ง (since) และงานเก่าที่กดเปิดจาก
  // รายการข้างล่าง (ไม่มี since แต่มี created_at) — ใบที่ค้างมาข้ามคืนคือใบที่ต้องรู้ที่สุด
  const startedAt = since ?? (job?.created_at ? new Date(job.created_at).getTime() : null)
  const waited = running && startedAt ? (Date.now() - startedAt) / 1000 : null

  return (
    <Frame onRefresh={loadJobs}>
      {err && (
        <div className="vs-err">
          <AlertTriangle size={16} />
          <div className="vs-err-body">
            <div>{err.msg}</div>
            {err.hint && <div className="vs-err-hint">{err.hint}</div>}
          </div>
          <button onClick={() => setErr(null)} className="vs-x" title="ปิด"><X size={14} /></button>
        </div>
      )}

      {/* ── สามขั้นบนสุด ── */}
      <div className="vs-steps">
        <StepTab n="01" label="สคริปต์"     icon={Type}      active={step === 1} done={scenes.length > 0} onClick={() => setStep(1)} />
        <StepTab n="02" label="องค์ประกอบ"  icon={ImageIcon} active={step === 2} done={scenes.length > 0 && !blockers.length} onClick={() => setStep(2)} />
        <StepTab n="03" label="ส่งเรนเดอร์" icon={Send}      active={step === 3} done={job?.status === "done"} onClick={() => setStep(3)} />
      </div>

      {/* ══ 01 สคริปต์ ══ */}
      {step === 1 && (
        <section className="dx-card vs-card">
          <h2 className="vs-h"><Type size={16} /> สคริปต์</h2>
          <p className="vs-dim vs-lead">หนึ่งบรรทัด = หนึ่งฉาก · กด Enter คือสั่งเปลี่ยนภาพ</p>

          <textarea
            className="dx-input vs-script"
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder="พิมพ์สคริปต์ที่นี่... ขึ้นบรรทัดใหม่ = แยกฉาก"
            spellCheck={false}
          />

          <div className="vs-stats">
            <Stat value={scenes.length} unit="ฉาก" />
            <Stat value={chars.toLocaleString("th-TH")} unit="ตัวอักษร" />
            <Stat value={mmss(estSec)} unit="นาที (ประมาณ)" />
          </div>
          <p className="vs-dim vs-fine">
            ความยาวเป็นค่าประมาณจากจำนวนตัวอักษร (~{CHARS_PER_SEC} ตัว/วินาที)
            {" — "}ความยาวจริงรู้หลังทำเสียงพากย์เสร็จเท่านั้น
          </p>
          {estSec > 90 && (
            <p className="vs-note">
              ยาวเกินนาทีครึ่ง — บน Reels/Shorts คนจะเลื่อนผ่านก่อนถึงท่อนสรุป ตัดให้สั้นลงดีกว่า
            </p>
          )}
          {rawLines.length > MAX_LINES && (
            <p className="vs-note">
              สคริปต์ {rawLines.length} บรรทัด — เซิร์ฟเวอร์รับได้ไม่เกิน {MAX_LINES} บรรทัดต่อคลิป
              (ยาวกว่านี้งานจะไปตายกลางทางหลังจ่ายค่าเสียงไปแล้ว)
            </p>
          )}

          {warns.length > 0 && (
            <div className="vs-warn">
              <AlertTriangle size={15} />
              <div>
                <b>ในสคริปต์มี{warns.join(" · ")}</b>
                <p>
                  ทุกบรรทัดจะถูก<u>อ่านออกเสียง</u> ระบบจึงตัดของพวกนี้ทิ้งให้ก่อนส่งเข้า TTS
                  ไม่งั้นจะได้ยินคำว่า &ldquo;แฮชแท็กวันพีซทีซีจี&rdquo; ในคลิปจริง
                  {" — "}ข้อความที่ถูกอ่านคือที่เห็นในขั้น 02 เท่านั้น
                </p>
              </div>
            </div>
          )}

          {leftovers && (
            <p className="vs-note">
              มีสัญลักษณ์อย่าง ⭐ ⭕ ⬛ → เหลืออยู่ในบรรทัดที่จะถูกอ่าน
              {" — "}ตัวพวกนี้ระบบ<u>ไม่ได้ตัดให้</u> (ต่างจากอีโมจิ) มันจะถูกส่งเข้า TTS ตามนั้น
              {" "}ลบออกเองก่อนส่ง แล้วดูข้อความจริงที่จะถูกอ่านได้ในขั้น 02
            </p>
          )}

          <div className="vs-two">
            <label className="vs-field">
              <span>พาดหัวเปิดคลิป <i className="vs-dim">(ค้างบนจอ ~3 วินาทีแรก)</i></span>
              <input className="dx-input" value={headline} maxLength={60}
                onChange={e => setHeadline(e.target.value)}
                placeholder="เช่น ตู้การ์ดที่หยอดแล้วได้ของจริง" />
            </label>
            <label className="vs-field">
              <span>ชื่องาน <i className="vs-dim">(ชื่อโฟลเดอร์บนเครื่องเรนเดอร์)</i></span>
              <input className="dx-input dx-mono" value={project}
                onChange={e => setProject(e.target.value.trim())} />
            </label>
          </div>
          <p className="vs-dim vs-fine">
            ตั้งชื่องานซ้ำของเดิม = ใช้เสียงกับภาพที่แคชไว้ (แก้ภาพอย่างเดียวไม่ต้องจ่ายค่า TTS ใหม่)
            {" — "}แต่ถ้าเผลอซ้ำกับงานคนละเรื่อง จะได้เสียงของงานเก่ามาแทน
          </p>

          <div className="vs-actions">
            <button className="dx-btn dx-btn-primary" disabled={!scenes.length} onClick={() => setStep(2)}>
              ต่อไป · เลือกภาพ
            </button>
          </div>
        </section>
      )}

      {/* ══ 02 องค์ประกอบ ══ */}
      {step === 2 && (
        <section className="dx-card vs-card">
          <h2 className="vs-h"><ImageIcon size={16} /> องค์ประกอบ</h2>
          <p className="vs-dim vs-lead">
            รูปถ่ายของจริงชนะทุกอย่าง — คลังภาพสต็อกกับ AI ไม่รู้จักซองการ์ดของเรา
            (เคยได้ภาพล็อบบี้โรงพยาบาลมาทั้งคลิป เพราะมันแปลคำว่า &ldquo;ซอง&rdquo; เป็นซองยา)
          </p>

          {skuErr && (
            <p className="vs-note">
              โหลดรายการสินค้าไม่สำเร็จ: {skuErr} — ยังเลือกภาพตู้หรือพิมพ์รหัสสินค้าเองได้
            </p>
          )}

          <div className="vs-scenes">
            {scenes.map((text, i) => (
              <SceneRow key={i} i={i} text={text} pick={picks[i]} skus={skus}
                onChange={patch => setPick(i, patch)} />
            ))}
          </div>

          <div className="vs-two vs-mt">
            <label className="vs-field">
              <span><Mic size={13} /> เสียงพากย์</span>
              <select className="dx-input" value={voice} onChange={e => setVoice(e.target.value)}>
                {VOICES.map(v => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
              </select>
            </label>
            <label className="vs-field">
              <span><Sparkles size={13} /> สไตล์ซับ</span>
              <select className="dx-input" value={style} onChange={e => setStyle(e.target.value)}>
                {STYLES.map(s => <option key={s.id} value={s.id}>{s.label} — {s.desc}</option>)}
              </select>
            </label>
          </div>

          <label className="vs-field vs-mt">
            <span>ระยะเกยภาพ (xfade) · <b className="dx-mono">{Number(xfade).toFixed(2)} วิ</b></span>
            <input type="range" min="0" max="1" step="0.05" value={xfade}
              onChange={e => setXfade(e.target.value)} className="vs-range" />
          </label>
          <p className="vs-dim vs-fine">
            0 = ตัดแข็ง เปลี่ยนภาพทันที · ยิ่งมากยิ่งนุ่มแต่จังหวะเนือย
            {" — "}ความยาวคลิปรวมไม่เปลี่ยนตาม ระบบชดเชยเวลาที่ถูกเกยกินให้แล้ว
          </p>

          <div className="vs-actions">
            <button className="dx-btn dx-btn-ghost" onClick={() => setStep(1)}>ย้อนกลับ</button>
            <button className="dx-btn dx-btn-primary" onClick={() => setStep(3)}>ต่อไป · ส่งเรนเดอร์</button>
          </div>
        </section>
      )}

      {/* ══ 03 ส่งเรนเดอร์ ══ */}
      {step === 3 && (
        <section className="dx-card vs-card">
          <h2 className="vs-h"><Send size={16} /> ส่งเรนเดอร์</h2>

          <div className="vs-sum">
            <SumRow k="ฉาก" v={`${scenes.length} ฉาก · ประมาณ ${mmss(estSec)} นาที`} />
            <SumRow k="พาดหัว" v={headline.trim() || "— ไม่มี —"} />
            <SumRow k="เสียง / ซับ"
              v={`${voice} · ${STYLES.find(s => s.id === style)?.label} · เกยภาพ ${Number(xfade).toFixed(2)} วิ`} />
            <SumRow k="ชื่องาน" v={<span className="dx-mono">{project}</span>} />
          </div>

          {blockers.length > 0 && (
            <div className="vs-warn">
              <AlertTriangle size={15} />
              <div>
                <b>ยังส่งไม่ได้</b>
                <ul>{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </div>
            </div>
          )}

          <div className="vs-actions">
            <button className="dx-btn dx-btn-primary" disabled={sending || blockers.length > 0} onClick={submit}>
              {sending
                ? <><Loader2 size={14} className="vs-spin" /> กำลังส่ง…</>
                : <><Send size={14} /> ส่งเรนเดอร์</>}
            </button>
            <span className="vs-dim vs-fine">
              คลิปหนึ่งตัวใช้เวลา ~5 นาที (ช้าสุดคือทำเสียงพากย์ 3-4 นาที) · ปิดหน้านี้ไปก่อนได้ งานไม่หาย
            </span>
          </div>

          {job && <JobPanel job={job} waited={waited} />}
        </section>
      )}

      {/* ── งานเก่า ── */}
      <section className="dx-card vs-card">
        <h2 className="vs-h"><Clock size={16} /> งานที่ผ่านมา</h2>
        {!jobs.length
          ? (jobsErr
              ? <p className="vs-note">อ่านรายการงานไม่สำเร็จ: {jobsErr} — งานเก่าอาจยังอยู่ครบ กดรีเฟรชอีกครั้ง</p>
              : <p className="vs-dim vs-fine">ยังไม่มีงาน</p>)
          : (
            <div className="vs-jobs">
              {jobs.map(j => (
                <button key={j.id} className={`vs-job ${job?.id === j.id ? "vs-job-on" : ""}`}
                  onClick={() => { setJob(j); setSince(null); setStep(3) }}>
                  <span className={`vs-st ${STATUS[j.status]?.cls}`}>{STATUS[j.status]?.label}</span>
                  <span className="vs-job-name dx-mono">{j.project || j.id}</span>
                  <span className="vs-dim vs-fine">{thaiAgo(j.created_at || j.inserted_at)}</span>
                </button>
              ))}
            </div>
          )}
      </section>
    </Frame>
  )
}

// ── ชิ้นส่วนย่อย ────────────────────────────────────────────────────────

function StepTab({ n, label, icon: Icon, active, done, onClick }) {
  return (
    <button className={`vs-step ${active ? "vs-step-on" : ""}`} onClick={onClick}>
      <span className="vs-step-n dx-mono">{done && !active ? <Check size={13} /> : n}</span>
      <span className="vs-step-l"><Icon size={13} /> {label}</span>
    </button>
  )
}

function Stat({ value, unit }) {
  return (
    <div className="vs-stat">
      <b className="dx-mono">{value}</b>
      <span>{unit}</span>
    </div>
  )
}

function SumRow({ k, v }) {
  return <div className="vs-sum-row"><span className="vs-dim">{k}</span><span>{v}</span></div>
}

// หนึ่งฉาก = หนึ่งบรรทัดที่จะถูกอ่าน + หนึ่งภาพ
// ⚠️ โชว์ข้อความ "หลังล้างแล้ว" ไม่ใช่ที่พิมพ์มา เพราะนี่คือสิ่งที่ TTS จะอ่านจริง
//    เป็นที่เดียวในหน้านี้ที่เห็นผลของการตัดอีโมจิ/แฮชแท็กด้วยตาตัวเอง
function SceneRow({ i, text, pick, skus, onChange }) {
  if (!pick) return null
  return (
    <div className="vs-scene">
      <span className="vs-scene-n dx-mono">{String(i + 1).padStart(2, "0")}</span>
      <div className="vs-scene-body">
        <p className="vs-scene-t">{text}</p>
        <div className="vs-scene-pick">
          <select className="dx-input" value={pick.source}
            onChange={e => onChange({ source: e.target.value })}>
            <option value="machine:hero">รูปตู้ — หน้าตรง (hero)</option>
            <option value="machine:scene">รูปตู้ — ในสถานที่จริง (scene)</option>
            <option value="sku">รูปซอง/กล่องสินค้า</option>
            <option value="file">ไฟล์ที่ถ่ายเอง</option>
          </select>

          {pick.source === "sku" && (
            skus.length ? (
              <select className="dx-input" value={pick.sku} onChange={e => onChange({ sku: e.target.value })}>
                <option value="">— เลือกสินค้า —</option>
                {/* ป้าย "ยังไม่มีรูป" ต้องเห็นตั้งแต่ตอนเลือก ไม่ใช่ไปโผล่เป็น blocker
                    ทีหลังแล้วต้องเดาว่าตัวไหนใช้ได้บ้าง */}
                {skus.map(s => (
                  <option key={s.sku_id} value={s.sku_id}>
                    {s.sku_id} · {s.name}{!s.image_url && !s.image_url_box ? " (ยังไม่มีรูป)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input className="dx-input dx-mono" value={pick.sku}
                placeholder="พิมพ์รหัสสินค้า เช่น OP 17"
                onChange={e => onChange({ sku: e.target.value })} />
            )
          )}

          {pick.source === "file" && (
            /* เครื่องเรนเดอร์คือ ubuntu ของ GitHub ที่ checkout รีโปมา — path เดียวที่มี
               อยู่จริงคือไฟล์ในรีโป และต้อง relative จาก deploy/ (workflow ตั้ง
               working-directory: deploy) · ลิงก์ http ยังใช้ไม่ได้ ดู badFilePath() */
            <input className="dx-input" value={pick.file}
              placeholder="path ในรีโป เช่น public/machine/machine-hero.jpg"
              onChange={e => onChange({ file: e.target.value })} />
          )}
        </div>
      </div>
    </div>
  )
}

function JobPanel({ job, waited }) {
  const st = STATUS[job.status]
  return (
    <div className="vs-jobpanel">
      <div className="vs-jobpanel-head">
        <span className={`vs-st ${st?.cls}`}>
          {job.status === "rendering" && <Loader2 size={12} className="vs-spin" />} {st?.label}
        </span>
        <span className="dx-mono vs-fine">{job.project || job.id}</span>
        {waited != null && <span className="vs-dim vs-fine">รอมาแล้ว {mmss(waited)}</span>}
        {job.duration_seconds > 0 && (
          <span className="vs-dim vs-fine">คลิปยาว {mmss(job.duration_seconds)}</span>
        )}
      </div>

      {/* ระหว่างรอไม่มีสถานะย่อยให้ดู (API เก็บแค่ queued/running/done/failed) —
          บอกลำดับงานไว้แทน คนจะได้รู้ว่าเงียบไป 4 นาทีเป็นเรื่องปกติ ไม่ใช่ค้าง */}
      {job.status === "rendering" && (
        <p className="vs-dim vs-fine">
          ลำดับงาน: เสียงพากย์ (~3-4 นาที · ช้าสุด) → จับเวลารายคำ → เตรียมภาพ → เรนเดอร์ซับ → ประกอบ
        </p>
      )}

      {/* งานค้างเกินเพดานของ runner = ตายไปแล้ว ไม่ใช่ "ยังทำอยู่" — ไม่มีใครไปเขียน
          failed ให้ (publish.py เขียนได้เฉพาะตอนที่มันยังมีชีวิต) ป้ายจึงค้าง "กำลังทำ"
          ตลอดกาล ต้องบอกวิธีปลดล็อกด้วย: /api/video/render เก็บกวาดงานค้างให้ตอนมีคน
          สั่งชื่อเดิมซ้ำ (STALE_MINUTES = 60) ไม่ใช่มีใครไปไล่ปิดให้เอง */}
      {waited != null && waited > RUNNER_CEILING_SEC && (
        <p className="vs-note">
          รอมาเกิน {Math.round(RUNNER_CEILING_SEC / 60)} นาทีแล้ว ซึ่งเกินเพดานเวลาของเครื่องเรนเดอร์
          {" — "}แปลว่ามันน่าจะตายกลางคันโดยไม่ได้เขียนสถานะกลับมา
          {" "}สั่งเรนเดอร์ชื่องานเดิมซ้ำอีกครั้งเพื่อปิดใบนี้แล้วเริ่มใหม่ได้เลย
        </p>
      )}

      {job.status === "failed" && (
        <p className="vs-note">{job.error || "เรนเดอร์ล้มเหลว — ดู log บนเครื่องเรนเดอร์"}</p>
      )}

      {job.status === "done" && job.video_url && (
        <>
          {/* 9:16 — จำกัดความกว้างไว้ ไม่งั้นบนจอคอมคลิปแนวตั้งจะสูงล้นจอจนต้องเลื่อนหาปุ่มเล่น */}
          <video className="vs-video" src={job.video_url} controls playsInline preload="metadata" />
          <div className="vs-actions">
            <a className="dx-btn dx-btn-primary" href={job.video_url}
              download={`${job.project || "clip"}.mp4`}>
              <Download size={14} /> ดาวน์โหลด mp4
            </a>
          </div>
        </>
      )}

      {job.status === "done" && !job.video_url && (
        <p className="vs-note">
          งานเสร็จแล้วแต่ไม่ได้ลิงก์ไฟล์กลับมา — ไฟล์อยู่ที่ .video-work บนเครื่องเรนเดอร์
        </p>
      )}
    </div>
  )
}

// เปลือกหน้า — หัวเรื่อง + พื้นหลัง + CSS ทั้งหมดของหน้านี้
// ใช้ dx-* จาก globals.css เป็นหลัก (หน้านี้ถือว่า migrate เป็น dark theme แล้ว)
// ที่เหลือเป็นคลาสขึ้นต้น vs- กันชนกับหน้าอื่น — ท่าเดียวกับ app/products/page.jsx
function Frame({ children, onRefresh }) {
  return (
    <main className="vs-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="vs-top">
        <div className="vs-top-in">
          <Film size={20} color="var(--dx-cyan)" />
          <div className="vs-top-t">
            <h1>โรงงานวิดีโอ</h1>
            <p>DivisionX Card · สคริปต์ → คลิป 9:16 พร้อมโพสต์</p>
          </div>
          {/* ห้องตัดต่อทำงานกับไฟล์ในเครื่อง (.video-work) จึงมีเฉพาะตอนรัน dev
              บน Vercel ลิงก์นี้พาไปเจอ 404 ของ /api/video/local — ยอมรับได้:
              คนที่ใช้ผ่าน Vercel คือคนสั่งงานผ่านคิว ไม่ใช่คนนั่งตัดต่อ */}
          <a href="/video/editor" className="vs-back" title="แก้คลิปที่เรนเดอร์แล้วในเครื่องนี้">
            ✂️ ห้องตัดต่อ
          </a>
          <a href="/" className="vs-back">← กลับหน้าหลัก</a>
          {onRefresh && (
            <button className="dx-btn dx-btn-ghost" onClick={onRefresh}>
              <RefreshCw size={14} /> <span className="vs-hide-sm">รีเฟรช</span>
            </button>
          )}
        </div>
      </header>
      <div className="vs-wrap">{children}</div>
    </main>
  )
}

const CSS = `
.vs-page{min-height:100vh;background:var(--dx-bg-page);color:var(--dx-text);font-family:var(--dx-font);}
.vs-top{position:sticky;top:0;z-index:20;background:rgba(13,30,56,.92);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--dx-border);}
.vs-top::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;
  background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.55;}
.vs-top-in{max-width:900px;margin:0 auto;padding:11px 14px;display:flex;align-items:center;gap:10px;}
.vs-top-t{flex:1;min-width:0;}
.vs-top-t h1{margin:0;font-size:15px;font-weight:600;letter-spacing:.2px;}
.vs-top-t p{margin:1px 0 0;font-size:11px;color:var(--dx-text-muted);}
.vs-back{font-size:12px;color:var(--dx-text-muted);text-decoration:none;white-space:nowrap;}
.vs-back:hover{color:var(--dx-cyan-soft);}
.vs-wrap{max-width:900px;margin:0 auto;padding:16px 14px 64px;display:flex;flex-direction:column;gap:14px;}

.vs-card{padding:16px;}
.vs-h{display:flex;align-items:center;gap:7px;margin:0 0 4px;font-size:14px;font-weight:600;color:var(--dx-cyan-bright);}
.vs-lead{margin:0 0 12px;font-size:12px;line-height:1.7;}
.vs-dim{color:var(--dx-text-muted);}
.vs-fine{font-size:11.5px;line-height:1.7;}
.vs-mt{margin-top:12px;}

/* ── สามขั้นบนสุด ── */
.vs-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.vs-step{display:flex;align-items:center;gap:9px;padding:11px 12px;border-radius:12px;cursor:pointer;
  background:var(--dx-bg-card);border:1px solid var(--dx-border);color:var(--dx-text-2);
  font-family:var(--dx-font);font-size:13px;transition:all .18s;text-align:left;min-width:0;}
.vs-step:hover{border-color:var(--dx-border-strong);color:var(--dx-text);}
.vs-step-on{border-color:var(--dx-cyan);color:var(--dx-cyan-bright);
  background:linear-gradient(180deg,rgba(0,229,255,.10) 0%,rgba(0,212,255,.03) 100%);
  box-shadow:0 0 0 1px rgba(0,212,255,.2),0 0 18px -6px var(--dx-glow);}
.vs-step-n{display:flex;align-items:center;justify-content:center;width:26px;height:26px;flex-shrink:0;
  border-radius:8px;background:var(--dx-bg-input);border:1px solid var(--dx-border-strong);
  font-size:11px;font-weight:600;}
.vs-step-on .vs-step-n{background:rgba(0,212,255,.14);border-color:var(--dx-cyan);}
.vs-step-l{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* ── ขั้น 01 ── */
.vs-script{min-height:190px;line-height:1.9;font-size:14px;resize:vertical;}
.vs-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;}
.vs-stat{background:var(--dx-bg-input);border:1px solid var(--dx-border);border-radius:10px;padding:9px 11px;}
.vs-stat b{display:block;font-size:19px;color:var(--dx-cyan-soft);line-height:1.25;}
.vs-stat span{font-size:11px;color:var(--dx-text-muted);}

.vs-warn{display:flex;gap:9px;margin-top:12px;padding:11px 12px;border-radius:11px;font-size:12.5px;line-height:1.65;
  background:rgba(255,200,87,.08);border:1px solid rgba(255,200,87,.32);color:#FFD98A;}
.vs-warn b{color:var(--dx-warning);}
.vs-warn p{margin:3px 0 0;color:#E8D9B4;}
.vs-warn ul{margin:4px 0 0;padding-left:16px;color:#E8D9B4;}
.vs-note{margin:10px 0 0;padding:9px 11px;border-radius:10px;font-size:12px;line-height:1.6;
  background:rgba(255,68,102,.07);border:1px solid rgba(255,68,102,.28);color:#FFAFBE;}

.vs-two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;}
.vs-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--dx-text-2);min-width:0;}
.vs-field > span{display:flex;align-items:center;gap:5px;}
.vs-field i{font-style:normal;font-size:11px;}
.vs-range{width:100%;accent-color:var(--dx-cyan);}

.vs-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;}

/* ── ขั้น 02 ── */
.vs-scenes{display:flex;flex-direction:column;gap:8px;}
.vs-scene{display:flex;gap:10px;padding:10px;border-radius:11px;
  background:var(--dx-bg-input);border:1px solid var(--dx-border);}
.vs-scene-n{flex-shrink:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;
  border-radius:7px;background:rgba(0,212,255,.10);border:1px solid rgba(0,212,255,.28);
  color:var(--dx-cyan-soft);font-size:11px;font-weight:600;}
.vs-scene-body{flex:1;min-width:0;}
.vs-scene-t{margin:2px 0 8px;font-size:13px;line-height:1.65;}
.vs-scene-pick{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px;}
.vs-scene-pick > *:only-child{grid-column:1 / -1;}

/* ── ขั้น 03 ── */
.vs-sum{display:flex;flex-direction:column;gap:1px;margin:8px 0 4px;
  border:1px solid var(--dx-border);border-radius:11px;overflow:hidden;}
.vs-sum-row{display:flex;gap:12px;padding:9px 12px;font-size:12.5px;background:var(--dx-bg-input);}
.vs-sum-row > span:first-child{width:96px;flex-shrink:0;}
.vs-sum-row > span:last-child{flex:1;min-width:0;word-break:break-word;}

.vs-jobpanel{margin-top:14px;padding:12px;border-radius:12px;
  background:var(--dx-bg-input);border:1px solid var(--dx-border-glow);}
.vs-jobpanel-head{display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-bottom:8px;}
.vs-st{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;
  font-size:11px;font-weight:600;border:1px solid;white-space:nowrap;}
.vs-st-wait{color:var(--dx-warning);background:rgba(255,200,87,.10);border-color:rgba(255,200,87,.3);}
.vs-st-run{color:var(--dx-cyan-bright);background:rgba(0,212,255,.10);border-color:rgba(0,212,255,.35);}
.vs-st-ok{color:var(--dx-success);background:rgba(0,255,136,.09);border-color:rgba(0,255,136,.3);}
.vs-st-bad{color:var(--dx-danger);background:rgba(255,68,102,.09);border-color:rgba(255,68,102,.3);}
.vs-video{display:block;width:100%;max-width:300px;max-height:66vh;margin:10px auto 0;border-radius:12px;
  background:#000;border:1px solid var(--dx-border-strong);}
.vs-spin{animation:vs-rot 1s linear infinite;}
@keyframes vs-rot{to{transform:rotate(360deg);}}

/* ── งานเก่า ── */
.vs-jobs{display:flex;flex-direction:column;gap:6px;}
.vs-job{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;cursor:pointer;
  background:var(--dx-bg-input);border:1px solid var(--dx-border);color:var(--dx-text-2);
  font-family:var(--dx-font);font-size:12.5px;text-align:left;transition:border-color .15s;}
.vs-job:hover{border-color:var(--dx-border-strong);}
.vs-job-on{border-color:var(--dx-cyan);}
.vs-job-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* ── แถบ error ── */
.vs-err{display:flex;gap:9px;padding:11px 12px;border-radius:12px;font-size:13px;
  background:rgba(255,68,102,.08);border:1px solid rgba(255,68,102,.32);color:#FFB3C0;}
.vs-err-body{flex:1;min-width:0;}
.vs-err-hint{margin-top:4px;font-size:11.5px;line-height:1.6;opacity:.85;}
.vs-x{background:none;border:none;color:#FFB3C0;cursor:pointer;padding:0;}

/* ── จอสถานะสิทธิ์ ── */
.vs-gate{padding:36px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;
  color:var(--dx-text-muted);}
.vs-gate-t{margin:0;font-size:15px;font-weight:600;color:var(--dx-text);}

/* ── มือถือ ── */
/* ⚠️ ต้องลองที่ ~360px จริง — ช่องเลือกภาพสองอันเรียงข้างกันจะบีบจนอ่านชื่อสินค้าไม่ออก */
@media (max-width: 640px){
  .vs-two{grid-template-columns:1fr;}
  .vs-scene-pick{grid-template-columns:1fr;}
  .vs-stat b{font-size:16px;}
  .vs-step{padding:9px;gap:7px;font-size:12px;}
  .vs-step-n{width:22px;height:22px;font-size:10px;}
  .vs-hide-sm{display:none;}
  .vs-sum-row{flex-direction:column;gap:2px;}
  .vs-sum-row > span:first-child{width:auto;font-size:11px;}
  .vs-video{max-width:100%;}
}
`
