"use client"
// หน้าเช็กของในตู้ (/stock) — ส่วนที่กดได้: ค้นหาสินค้า · หาสาขาใกล้ฉัน · กาง/ย่อรายการ · ลิงก์ตรงถึงสาขา (/stock#machine_id)
//
// ⚠️ ไฟล์นี้วิ่งในเบราว์เซอร์ — ห้าม import lib/publicPageData หรืออะไรที่แตะ service key
//    รับเฉพาะข้อมูลที่กรองแล้วจาก page.jsx (lib/publicStock → buildStockView)
// ⚠️ ตำแหน่งของผู้ใช้อยู่ใน state ของหน้านี้เท่านั้น — ห้ามส่งไปเซิร์ฟเวอร์ / log / analytics และห้ามเก็บลงเครื่อง
// ⚠️ ห้ามเขียน "เรียลไทม์" หรือ "ล่าสุดตอนนี้" — ตัวเลขคือยอด ณ เวลาซิงก์ของแต่ละตู้ (โชว์เวลาไว้ทุกสาขา)

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { detectFranchise, FRANCHISE_LABEL } from "../../lib/franchiseDetect"

// ── เวลา ────────────────────────────────────────────────────────────────
// เวลาไทย = UTC+7 ไม่มี DST → คำนวณเอง ไม่พึ่ง Intl/โซนเวลาของเครื่อง
// เซิร์ฟเวอร์กับเบราว์เซอร์จึงได้ข้อความตรงกันตอน hydrate (ไม่งั้น React เตือนข้อความไม่ตรง)
const BKK = 7 * 3600 * 1000
const DAY = 86400 * 1000
const STALE_MS = 30 * 3600 * 1000      // เกิน ~30 ชม. = น่าจะพลาดรอบซิงก์กลางคืน → บอกเบา ๆ
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
const pad2 = (n) => String(n).padStart(2, "0")

/** "วันนี้ 14:06 น." · "เมื่อวาน 00:12 น." · "14 ต.ค. 00:12 น." (ข้ามปีมีปี พ.ศ. 2 หลัก) */
function updatedLabel(iso, now) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d = new Date(t + BKK)
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} น.`
  const diff = Math.floor((now + BKK) / DAY) - Math.floor((t + BKK) / DAY)
  if (diff <= 0) return `วันนี้ ${time}`     // ติดลบ = นาฬิกาเครื่องลูกค้าช้ากว่าเวลาซิงก์ ถือว่าวันนี้
  if (diff === 1) return `เมื่อวาน ${time}`
  const y = d.getUTCFullYear()
  const yy = new Date(now + BKK).getUTCFullYear() === y ? "" : ` ${String(y + 543).slice(-2)}`
  return `${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}${yy} ${time}`
}

// ── ระยะทาง (เส้นตรง) ───────────────────────────────────────────────────
function kmBetween(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}
const fmtKm = (d) => `~${d < 10 ? Math.max(0.1, Math.round(d * 10) / 10).toFixed(1) : Math.round(d)} กม.`

// ── ค้นหา ───────────────────────────────────────────────────────────────
// ตัดช่องว่าง/ขีด/จุดออก → "OP-13" "op13" "OP 13" เจอตัวเดียวกัน · é → e (Pokémon)
const norm = (s) => String(s || "").toLowerCase().replace(/é/g, "e").replace(/[\s\-–—_.,:;!?'"’()\/]+/g, "")

/**
 * แยกคำค้นเป็นคำ ๆ — ทุกคำต้องเจอ (AND)
 * ชื่อค่ายภาษาไทย ("โปเกม่อน" "วันพีซ") ใช้ตัวเดาค่ายกลาง lib/franchiseDetect (ห้ามก๊อปรายการคำมาไว้ที่นี่)
 * ชื่อสองคำที่แยกกันแล้วเดาไม่ออก ("ดราก้อน บอล") ลองเดาจากคู่คำติดกันอีกรอบ
 */
function parseQuery(q) {
  const raw = q.trim().split(/\s+/).filter(Boolean).slice(0, 8)
  const fr = raw.map((t) => detectFranchise(t))
  for (let i = 0; i + 1 < raw.length; i++) {
    if (!fr[i] && !fr[i + 1]) {
      const f = detectFranchise(`${raw[i]} ${raw[i + 1]}`)
      if (f) { fr[i] = f; fr[i + 1] = f }
    }
  }
  return raw.map((t, i) => ({ n: norm(t), fr: fr[i] })).filter((t) => t.n || t.fr)
}

const UNIT = { pack: "ซอง", box: "กล่อง" }
const mapHref = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
const thumbSrc = (f, w) => `/api/sku-thumb?f=${encodeURIComponent(f)}&w=${w}`
const EMPTY = new Set()

// รูปย่อ 48px — โหลดเฉพาะตอนกางรายการ (ไม่มี <img> ในหน้าเลยจนกว่าจะกด) · ไฟล์ละ ~2–4 KB จาก /api/sku-thumb
function Thumb({ file }) {
  const [bad, setBad] = useState(false)
  if (!file || bad) return <span className="sk-th sk-th-ph" aria-hidden="true">🎴</span>
  return (
    <img className="sk-th" src={thumbSrc(file, 96)}
      srcSet={`${thumbSrc(file, 96)} 2x, ${thumbSrc(file, 144)} 3x`}
      width={48} height={48} loading="lazy" decoding="async" alt="" onError={() => setBad(true)} />
  )
}

function Row({ it, sku }) {
  return (
    <li className="sk-item">
      <Thumb file={it.u === "box" ? sku.box : sku.pack} />
      <span className="sk-iname">
        {sku.name}
        {/* เว้นวรรคจริง ไม่ใช้ margin — ป้ายตกบรรทัดบนจอแคบแล้วจะไม่เยื้อง และโปรแกรมอ่านจอเว้นจังหวะ */}
        {it.u === "box" ? <> <span className="sk-boxtag">ยกกล่อง</span></> : null}
      </span>
      <span className="sk-qty">เหลือ <b>{it.r}</b> {UNIT[it.u]}</span>
    </li>
  )
}

function OutRows({ rows, skus }) {
  return (
    <ul className="sk-oitems">
      {rows.map((it) => (
        <li key={`${it.s}-${it.u}`}>
          <span>{skus[it.s].name}</span>
          <span className="sk-otag">เหลือ 0 {UNIT[it.u]}</span>
        </li>
      ))}
    </ul>
  )
}

function Panel({ inStock, soldOut, inlineOut, skus, franchises, onCollapse }) {
  // จัดกลุ่มตามค่าย — เซิร์ฟเวอร์เรียงสินค้าตามค่ายมาให้แล้ว แค่ตัดเป็นช่วง ๆ
  const groups = []
  for (const it of inStock) {
    const fr = skus[it.s].fr
    if (!groups.length || groups[groups.length - 1].fr !== fr) groups.push({ fr, rows: [] })
    groups[groups.length - 1].rows.push(it)
  }
  return (
    <>
      {groups.map((g) => (
        <section className="sk-grp" key={g.fr || "_"}>
          <h3 className="sk-grp-h">
            <span aria-hidden="true">{franchises[g.fr]?.emoji || "🎴"}</span>
            {franchises[g.fr]?.label || "อื่น ๆ"}
            <span className="sk-grp-c">{g.rows.length} รายการ</span>
          </h3>
          <ul className="sk-items">
            {g.rows.map((it) => <Row key={`${it.s}-${it.u}`} it={it} sku={skus[it.s]} />)}
          </ul>
        </section>
      ))}
      {soldOut.length > 0 && (inlineOut ? (
        <div className="sk-out">
          <div className="sk-out-h">หมดชั่วคราว {soldOut.length} รายการ</div>
          <OutRows rows={soldOut} skus={skus} />
        </div>
      ) : (
        <details className="sk-out">
          <summary>หมดชั่วคราว {soldOut.length} รายการ</summary>
          <OutRows rows={soldOut} skus={skus} />
        </details>
      ))}
      {/* ปุ่มย่อท้ายรายการ — มีเฉพาะรายการยาว (ค้นเจอ 2 แถวไม่ต้องมีให้รก) */}
      {inStock.length + soldOut.length > 8 ? (
        <button type="button" className="sk-collapse" onClick={onCollapse}>
          ย่อรายการ <span aria-hidden="true">▴</span>
        </button>
      ) : null}
    </>
  )
}

function BranchCard({ r, open, flash, now, searching, skus, franchises, onToggle, onCollapse }) {
  const { b, inStock, soldOut, filterOn } = r
  const label = updatedLabel(b.syncedAt, now)
  const stale = label && now - Date.parse(b.syncedAt) > STALE_MS
  const hasItems = inStock.length + soldOut.length > 0
  const main = !b.items.length
    ? (label ? "ยังไม่มีรายการสินค้าในตู้" : "ยังไม่มีข้อมูลสินค้า")
    : filterOn
      ? (inStock.length ? `ตรงคำค้น ${inStock.length} รายการ` : "หมดชั่วคราว")
      : (inStock.length ? `มีของ ${inStock.length} รายการ` : "ของหมดชั่วคราว")
  return (
    <article id={b.id} className={`sk-card${open ? " is-open" : ""}${flash ? " sk-flash" : ""}`}
      aria-labelledby={`h-${b.id}`}>
      <div className="sk-head">
        <div className="sk-top" onClick={hasItems ? onToggle : undefined}>
          <div className="sk-row">
            <h2 className="sk-name" id={`h-${b.id}`}><span aria-hidden="true">📍 </span>{b.name}</h2>
            {b.floor ? <span className="sk-floor">{b.floor}</span> : null}
          </div>
          {b.landmark ? <div className="sk-hint">{b.landmark}</div> : null}
          <div className="sk-meta">
            {r.dist != null ? <span className="sk-dist">ห่าง {fmtKm(r.dist)}</span> : null}
            <span>{label ? `อัปเดตล่าสุด ${label}` : "ยังไม่มีข้อมูลจากตู้"}</span>
          </div>
          {stale ? <div className="sk-stale">ข้อมูลอาจยังไม่อัปเดต</div> : null}
        </div>
        <div className="sk-bar">
          <button type="button" className="sk-toggle" onClick={onToggle} disabled={!hasItems}
            aria-expanded={hasItems ? open : undefined} aria-controls={`p-${b.id}`}>
            <span>{main}</span>
            {hasItems ? (
              <span className="sk-more">{open ? "ย่อ" : "ดูสินค้า"} <span aria-hidden="true">{open ? "▴" : "▾"}</span></span>
            ) : null}
          </button>
          <a className="sk-map" href={mapHref(b.maps)} target="_blank" rel="noopener noreferrer"
            aria-label={`นำทางไป ${b.name} ${b.floor} ด้วย Google Maps`}>🧭 นำทาง</a>
        </div>
      </div>
      <div className="sk-panel" id={`p-${b.id}`} hidden={!open}>
        {open ? (
          <Panel inStock={inStock} soldOut={soldOut} inlineOut={searching && filterOn}
            skus={skus} franchises={franchises} onCollapse={onCollapse} />
        ) : null}
      </div>
    </article>
  )
}

export default function StockBrowser({ view, children }) {
  const { branches, skus, franchises, generatedAt, hasStock } = view
  const [now, setNow] = useState(generatedAt)      // ตอน hydrate ใช้เวลาเดียวกับเซิร์ฟเวอร์ ค่อยเปลี่ยนเป็นเวลาเครื่อง
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(() => new Set())
  const [closedQ, setClosedQ] = useState({ q: "", ids: EMPTY })   // สาขาที่ผู้ใช้ย่อเองระหว่างค้น (ล้างเมื่อคำค้นเปลี่ยน)
  const [geo, setGeo] = useState({ state: "idle" })
  const [flash, setFlash] = useState(null)
  const inputRef = useRef(null)

  // นาฬิกา — "วันนี้/เมื่อวาน" ต้องคิดจากเวลาเครื่องลูกค้า (หน้า ISR อาจถูกแคชไว้ข้ามเที่ยงคืน)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // ลิงก์ตรง /stock#wwv06 — กางสาขานั้น เลื่อนไปหา แล้วเรืองแสงให้รู้ว่าคือการ์ดไหน
  useEffect(() => {
    const go = () => {
      let id = ""
      try { id = decodeURIComponent(window.location.hash.slice(1)).trim() } catch { return }
      const hit = branches.find((b) => b.id.toLowerCase() === id.toLowerCase())
      if (!hit) return
      setQ("")
      setOpen((prev) => new Set(prev).add(hit.id))
      setFlash(hit.id)
      requestAnimationFrame(() => document.getElementById(hit.id)?.scrollIntoView({ block: "start" }))
    }
    go()
    window.addEventListener("hashchange", go)
    return () => window.removeEventListener("hashchange", go)
  }, [branches])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2800)
    return () => clearTimeout(t)
  }, [flash])

  // คำค้นของแต่ละสินค้า: ชื่อ + รหัสชุด + ชื่อค่าย (สั้น/ยาว) + คำบอกหน่วย · คั่นด้วยช่องว่าง (คำค้นไม่มีช่องว่างแล้ว จึงไม่ข้ามคำ)
  const hay = useMemo(() => skus.map((s) => {
    const base = norm(s.name) + " " + norm(s.code) + " " + norm(franchises[s.fr]?.label) + " " + norm(FRANCHISE_LABEL[s.fr])
    return { pack: `${base} ซอง pack`, box: `${base} กล่อง ยกกล่อง box` }
  }), [skus, franchises])
  const branchHay = useMemo(() => branches.map((b) => `${norm(b.name)} ${norm(b.maps)}`), [branches])

  // คำค้นแบบหน่วง — ค้นคำกว้าง ๆ ("ซอง") กางหลายร้อยแถว มือถือรุ่นเล็กพิมพ์แล้วไม่สะดุด
  const dq = useDeferredValue(q)
  const tokens = useMemo(() => parseQuery(dq), [dq])
  const searching = tokens.length > 0
  const geoOk = geo.state === "ok"

  const results = useMemo(() => branches.map((b, idx) => {
    // คำที่ตรงชื่อสาขา ("พระราม 2") ใช้เลือกสาขา · คำที่เหลือใช้กรองสินค้า ("พระราม 2 OP-13")
    const rest = searching ? tokens.filter((t) => !(t.n && branchHay[idx].includes(t.n))) : []
    const filterOn = rest.length > 0
    const inStock = []
    const soldOut = []
    for (const it of b.items) {
      if (filterOn) {
        const h = hay[it.s][it.u === "box" ? "box" : "pack"]
        const fr = skus[it.s].fr
        if (!rest.every((t) => (t.n && h.includes(t.n)) || (t.fr && t.fr === fr))) continue
      }
      ;(it.r > 0 ? inStock : soldOut).push(it)
    }
    const dist = geoOk && b.lat != null && b.lng != null ? kmBetween(geo.pos, b) : null
    const branchHit = searching && !filterOn
    return { b, idx, inStock, soldOut, filterOn, dist, branchHit,
      visible: !searching || branchHit || inStock.length + soldOut.length > 0 }
  }), [branches, tokens, searching, branchHay, hay, skus, geoOk, geo])

  const ordered = useMemo(() => {
    const has = (r) => r.branchHit || r.inStock.length > 0
    return results.filter((r) => r.visible).sort((a, b) =>
      (searching ? Number(!has(a)) - Number(!has(b)) : 0)   // ค้นอยู่: สาขาที่มีของก่อน สาขาที่ของหมดไว้ท้าย
      || (geoOk ? (a.dist ?? Infinity) - (b.dist ?? Infinity) : 0)   // ไม่มีพิกัด = Infinity ไปท้าย
      || a.idx - b.idx)
  }, [results, searching, geoOk])

  const closed = closedQ.q === dq ? closedQ.ids : EMPTY
  const isOpen = (id) => (searching ? !closed.has(id) : open.has(id))

  function toggle(id) {
    if (searching) {
      setClosedQ((prev) => {
        const ids = new Set(prev.q === dq ? prev.ids : [])
        if (ids.has(id)) ids.delete(id); else ids.add(id)
        return { q: dq, ids }
      })
      return
    }
    const willOpen = !open.has(id)
    setOpen((prev) => {
      const n = new Set(prev)
      if (willOpen) n.add(id); else n.delete(id)
      return n
    })
    // ใส่ #id ในแถบที่อยู่ — คัดลอกลิงก์สาขานี้ไปแปะคอมเมนต์ได้เลย (ไม่เลื่อนจอ ไม่เพิ่มประวัติย้อนกลับ)
    try {
      if (willOpen) window.history.replaceState(window.history.state, "", `#${id}`)
      else if (window.location.hash === `#${id}`) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)
      }
    } catch { /* บางเบราว์เซอร์ในแอปไม่ยอมให้แก้ URL — ไม่เป็นไร */ }
  }

  // ปุ่มย่อท้ายรายการยาว ๆ — ย่อแล้วเลื่อนกลับมาที่หัวการ์ด ไม่งั้นจอค้างอยู่กลางการ์ดถัดไป
  function collapse(id) {
    toggle(id)
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }))
  }

  // ตำแหน่งใช้คิดระยะในเครื่องนี้เท่านั้น — ไม่ส่งไปไหน ไม่เก็บ
  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeo({ state: "unavailable" }); return }
    setGeo({ state: "locating" })
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ state: "ok", pos: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      (e) => setGeo({ state: e && e.code === 1 ? "denied" : "error" }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 })
  }

  const nHave = ordered.filter((r) => r.branchHit || r.inStock.length > 0).length
  const nOut = ordered.length - nHave
  const summary = !branches.length ? ""
    : searching
      ? (ordered.length
        ? [nHave ? `มีของที่ค้นหาใน ${nHave} สาขา` : "", nOut ? `หมดชั่วคราว ${nOut} สาขา` : ""].filter(Boolean).join(" · ")
        : "")
      : geoOk
        ? "เรียงจากใกล้ไปไกล · ระยะเป็นเส้นตรงโดยประมาณ"
        : `${branches.length} สาขา · แตะสาขาเพื่อดูของในตู้`

  const geoNote = {
    idle: "ใช้ตำแหน่งในเครื่องคุณเพื่อเรียงสาขาเท่านั้น ไม่ส่งไปที่ไหน",
    locating: "ใช้ตำแหน่งในเครื่องคุณเพื่อเรียงสาขาเท่านั้น ไม่ส่งไปที่ไหน",
    ok: null,
    // คนส่วนใหญ่กดมาจากคอมเมนต์ = เบราว์เซอร์ในแอป Facebook/IG/TikTok ซึ่งมักขอตำแหน่งไม่ได้ → บอกทางออกไว้ด้วย
    denied: "ไม่ได้รับสิทธิ์ใช้ตำแหน่ง เลยเรียงตามลำดับเดิมไว้ก่อน — เปิดสิทธิ์ตำแหน่ง หรือถ้าเปิดจากในแอป (Facebook · IG · TikTok) ลองเปิดในเบราว์เซอร์แล้วกดใหม่",
    unavailable: "เบราว์เซอร์นี้หาตำแหน่งไม่ได้ เลยเรียงตามลำดับเดิมไว้ก่อน — ลองเปิดในเบราว์เซอร์ (Chrome · Safari)",
    error: "หาตำแหน่งไม่สำเร็จ เลยเรียงตามลำดับเดิมไว้ก่อน — ลองกดอีกครั้ง หรือเปิดในเบราว์เซอร์แทนแอป",
  }[geo.state]

  return (
    <>
      <header className="sk-hero">
        {children}
        <div className="sk-tools">
          <form className="sk-search" role="search"
            onSubmit={(e) => { e.preventDefault(); inputRef.current?.blur() }}>
            <svg className="sk-search-ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M20 20l-3.6-3.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้า เช่น OP-13" aria-label="ค้นหาสินค้าในตู้ทุกสาขา"
              enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off"
              spellCheck={false} maxLength={60} />
            {q ? (
              <button type="button" className="sk-clear" aria-label="ล้างคำค้น"
                onClick={() => { setQ(""); inputRef.current?.focus() }}>×</button>
            ) : null}
          </form>
          <button type="button" className="sk-near" onClick={locate} disabled={geo.state === "locating"}>
            <span aria-hidden="true">📍</span> {geo.state === "locating" ? "กำลังหาตำแหน่ง…" : "หาสาขาใกล้ฉัน"}
          </button>
        </div>
        {geoOk ? (
          <p className="sk-geo">
            เรียงตามระยะทางแล้ว ·{" "}
            <button type="button" className="sk-link" onClick={() => setGeo({ state: "idle" })}>เรียงแบบเดิม</button>
          </p>
        ) : geoNote ? (
          <p className={`sk-geo${["denied", "unavailable", "error"].includes(geo.state) ? " is-warn" : ""}`}>{geoNote}</p>
        ) : null}
      </header>

      {!hasStock && branches.length > 0 ? (
        <p className="sk-alert">ตอนนี้ยังดึงข้อมูลสต็อกไม่ได้ · ลองรีเฟรชอีกครั้งในอีกสักครู่นะครับ</p>
      ) : null}

      <p className="sk-sum" role="status" aria-live="polite">{summary}</p>

      {!branches.length ? (
        <p className="sk-empty">กำลังอัปเดตรายชื่อสาขา · ลองใหม่อีกครั้งนะครับ</p>
      ) : searching && !ordered.length ? (
        <p className="sk-empty">
          ไม่พบ “{dq.trim()}” ในตู้สาขาไหนเลย<br />
          ลองพิมพ์ชื่อชุด เช่น OP-15 · FB-05 · Pokémon
        </p>
      ) : (
        <div className="sk-list">
          {ordered.map((r) => (
            <BranchCard key={r.b.id} r={r} open={isOpen(r.b.id)} flash={flash === r.b.id} now={now}
              searching={searching} skus={skus} franchises={franchises}
              onToggle={() => toggle(r.b.id)} onCollapse={() => collapse(r.b.id)} />
          ))}
        </div>
      )}
    </>
  )
}
