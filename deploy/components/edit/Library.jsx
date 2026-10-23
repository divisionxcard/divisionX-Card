"use client"
// คลังของห้องตัดต่อ — 4 แท็บ: ไฟล์ของเรา (อัปโหลด + คลิป Flow) · ซองการ์ด · ตัวหนังสือ/โลโก้ · เสียง
//
// อัปโหลด: ขอลิงก์ลงชื่อจาก /api/video/assets แล้ว PUT ไฟล์ตรงเข้า Supabase Storage ด้วย XHR
//   (ไม่ผ่าน Vercel ที่รับ body ได้แค่ 4.5 MB · XHR เพราะ fetch ไม่มีเปอร์เซ็นต์อัปโหลด)
//   ท่าเดียวกับ supabase.storage.uploadToSignedUrl ทุกอย่าง: PUT FormData(cacheControl, ไฟล์) + apikey
// ⚠️ Storage ของโปรเจกต์รับได้ไม่เกิน 50 MB ต่อไฟล์ (ทดสอบ 23 ต.ค. 2026: 60 MB → 413 EntityTooLarge)
//    วิดีโอที่เกิน → ย่อในเบราว์เซอร์ก่อน (compress.js) · ไม่ต้องอัปเกรดแพ็กเกจ Supabase
import { useMemo, useRef, useState } from "react"
import { Film, Package, Type, Music, Upload, Plus, Mic, Search, Loader2, Layers } from "lucide-react"
import { clipFromAsset, totals } from "./timelineState"
import { canCompress, compressVideo } from "./compress"
import s from "./edit.module.css"

export const MAX_UPLOAD = 50 * 1024 * 1024
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ACCEPT = "video/mp4,video/quicktime,video/webm,.mov,.m4v,image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,.m4a"
const mb = (n) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`

// ความยาววิดีโอจริง (วินาที) — อ่านแค่ metadata ไม่โหลดทั้งไฟล์
export function probeSeconds(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video")
    const done = (x) => { v.removeAttribute("src"); v.load(); resolve(x) }
    v.preload = "metadata"
    v.muted = true
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null)
    v.onerror = () => done(null)
    setTimeout(() => done(null), 15000)
    v.src = url
  })
}

function putSigned(path, token, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", `${SB_URL}/storage/v1/object/upload/sign/marketing/${path}?token=${encodeURIComponent(token)}`)
    xhr.setRequestHeader("apikey", SB_ANON)
    xhr.setRequestHeader("Authorization", `Bearer ${SB_ANON}`)
    xhr.setRequestHeader("x-upsert", "false")
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let msg = `อัปโหลดไม่ผ่าน (HTTP ${xhr.status})`
      try {
        const j = JSON.parse(xhr.responseText)
        if (String(j.statusCode) === "413" || j.error === "Payload too large") msg = "ไฟล์ใหญ่เกินที่ Storage รับ (50 MB)"
        else if (j.message) msg = `อัปโหลดไม่ผ่าน: ${j.message}`
      } catch { /* ไม่ใช่ JSON */ }
      reject(new Error(msg))
    }
    xhr.onerror = () => reject(new Error("เน็ตหลุดระหว่างอัปโหลด — ลองใหม่อีกครั้ง"))
    const fd = new FormData()
    fd.append("cacheControl", "3600")
    fd.append("", file)
    xhr.send(fd)
  })
}

const TEXT_PRESETS = [
  { label: "พาดหัวใหญ่", hint: "ขาวขอบกรมท่า · ด้านบน", sample: "พาดหัว", cls: "st_bold",
    ov: { type: "text", text: "พิมพ์พาดหัวตรงนี้", style: "bold", size: 110, y: 0.2, anim: "pop" } },
  { label: "ตัวทอง", hint: "เน้นคำสำคัญ", sample: "เด็ด!", cls: "st_gold",
    ov: { type: "text", text: "คำเด็ด", style: "gold", size: 120, y: 0.32, anim: "pop" } },
  { label: "นีออน", hint: "เรืองแสงสีฟ้า", sample: "NEW", cls: "st_neon",
    ov: { type: "text", text: "ของใหม่มาแล้ว", style: "neon", size: 104, y: 0.45, anim: "float" } },
  { label: "กล่องข้อความ", hint: "อ่านง่ายบนภาพลายตา", sample: "กล่อง", cls: "st_box",
    ov: { type: "text", text: "ข้อความในกล่อง", style: "box", size: 64, y: 0.76, anim: "slide" } },
  { label: "ตัวเล็กมุมล่าง", hint: "หมายเหตุ / ที่มา", sample: "เล็ก", cls: "st_bold",
    ov: { type: "text", text: "หมายเหตุสั้น ๆ", style: "bold", size: 52, y: 0.9, anim: "fade" } },
]

export default function Library({ api, dispatch, state, assets, reloadAssets, skus, skuImg, onError, tab, setTab }) {
  const [ups, setUps] = useState([])                   // [{ key, name, size, p, err, done }]
  const [over, setOver] = useState(false)
  const [autoAdd, setAutoAdd] = useState(true)
  const [q, setQ] = useState("")
  const pick = useRef(null)
  const tot = state.tl

  const visual = assets.filter(a => a.kind === "video" || a.kind === "image")
  const audio = assets.filter(a => a.kind === "audio")

  const addAsset = async (a, localUrl) => {
    if (a.kind === "audio") {
      dispatch({ type: "SET_MUSIC", music: { src: a.url, volume: 0.22 }, select: true })
      return
    }
    let seconds = null
    if (a.kind === "video") seconds = await probeSeconds(localUrl || a.url)
    dispatch({ type: "ADD_CLIP", clip: clipFromAsset({ ...a, seconds: seconds || 5 }) })
  }

  const upload = async (files) => {
    for (const f0 of files) {
      let f = f0
      const key = `${f.name}-${f.size}-${Date.now()}`
      const row = { key, name: f.name, size: f.size, p: 0, err: null, done: false, phase: "up" }
      setUps(u => [row, ...u])
      const set = (patch) => setUps(u => u.map(x => (x.key === key ? { ...x, ...patch } : x)))
      // วิดีโอเกิน 50 MB → ย่อในเบราว์เซอร์ก่อน (compress.js) · รูป/เพลงเกิน = ให้ผู้ใช้ย่อเอง
      if (f.size > MAX_UPLOAD) {
        const isVideo = (f.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name)
        if (!isVideo || !canCompress()) {
          set({ err: `ไฟล์ ${mb(f.size)} ใหญ่เกิน 50 MB — ${isVideo ? "เบราว์เซอร์นี้ย่อเองไม่ได้ ใช้ Chrome/Edge หรือ" : ""}ย่อไฟล์ก่อนแล้วลองใหม่` })
          continue
        }
        try {
          set({ phase: "squash", p: 0 })
          f = await compressVideo(f0, (p) => set({ p }))
          set({ phase: "up", p: 0, size: f.size, squashed: f0.size })
        } catch (e) {
          set({ err: e.message || String(e) })
          continue
        }
        if (f.size > MAX_UPLOAD) {
          set({ err: `ย่อแล้วยังเหลือ ${mb(f.size)} — คลิปยาวเกินไป ตัดให้สั้นลงก่อน` })
          continue
        }
      }
      try {
        const tk = await api("assets", { method: "POST", body: JSON.stringify({ name: f.name, type: f.type, size: f.size }) })
        await putSigned(tk.path, tk.token, f, (p) => set({ p }))
        set({ p: 1, done: true })
        const asset = { url: tk.url, kind: tk.kind, name: f0.name }
        if (autoAdd) {
          const local = tk.kind === "video" ? URL.createObjectURL(f) : null
          await addAsset(asset, local)
          if (local) setTimeout(() => URL.revokeObjectURL(local), 20000)
        }
      } catch (e) {
        set({ err: e.message || String(e) })
      }
    }
    reloadAssets()
  }

  const onDrop = (e) => {
    e.preventDefault()
    setOver(false)
    const files = [...(e.dataTransfer?.files || [])]
    if (files.length) upload(files)
  }

  const packs = useMemo(() => {
    const k = q.trim().toLowerCase()
    return skus.filter(x => skuImg[x.sku_id])
      .filter(x => !k || `${x.sku_id} ${x.name || ""}`.toLowerCase().includes(k))
  }, [skus, skuImg, q])

  const addText = (p) => dispatch({ type: "ADD_OVERLAY", overlay: { ...p.ov }, len: 3 })
  const addLogo = () => dispatch({ type: "ADD_OVERLAY", overlay: { type: "logo", x: 0.88, y: 0.05, w: 0.14, anim: "none", end: -1 }, start: 0 })
  // ปิดท้าย = 3 วิสุดท้ายของคลิป → อยู่ถึงท้ายเสมอ (ต่อคลิปเพิ่มทีหลัง = โผล่เร็วขึ้น ไม่ใช่หายก่อนจบ)
  const addEndCard = () => {
    const { total } = totals(tot)
    dispatch({ type: "ADD_OVERLAY", overlay: { type: "text", text: "เช็กหน้าเว็บก่อนไป\nตามลิงก์ด้านล่างได้เลย", style: "box", size: 66, y: 0.72, anim: "slide", end: -1 },
               start: Math.max(0, total - 3), len: 3 })
  }

  return (
    <div>
      <div className={s.tabs} role="tablist">
        {[["files", "ไฟล์", Film], ["packs", "ซองการ์ด", Package], ["text", "ตัวหนังสือ", Type], ["audio", "เสียง", Music]].map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`${s.tab} ${tab === k ? s.tabOn : ""}`} onClick={() => setTab(k)}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {tab === "files" && (
        <div className={s.libBody}>
          <div className={`${s.drop} ${over ? s.dropOver : ""}`} onClick={() => pick.current?.click()}
               onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <Upload size={20} style={{ marginBottom: 4 }} /><br />
            <b>ลากไฟล์มาวาง</b> หรือคลิกเพื่อเลือก<br />
            วิดีโอ · รูป · เพลง · วิดีโอเกิน 50 MB ย่อให้อัตโนมัติ
            <input ref={pick} type="file" multiple accept={ACCEPT} hidden
                   onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f) }} />
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={autoAdd} onChange={(e) => setAutoAdd(e.target.checked)} />
            อัปเสร็จแล้วใส่ต่อท้ายไทม์ไลน์เลย
          </label>
          {ups.slice(0, 6).map(u => (
            <div key={u.key} className={s.upRow}>
              <span>{u.done ? "✓ " : ""}{u.name} · {mb(u.size)}{u.squashed ? ` (ย่อจาก ${mb(u.squashed)})` : ""}</span>
              {!u.err && !u.done && <span className={s.hint}>{u.phase === "squash" ? `กำลังย่อไฟล์ในเครื่อง ${Math.round(u.p * 100)}%` : `กำลังอัปโหลด ${Math.round(u.p * 100)}%`}</span>}
              {u.err ? <span className={s.upErr}>{u.err}</span>
                : <div className={s.bar}><i style={{ width: `${Math.round(u.p * 100)}%` }} /></div>}
            </div>
          ))}
          <div className={s.secTitle}>ไฟล์ในคลัง ({visual.length})</div>
          {!visual.length && <div className={s.empty}>ยังไม่มีไฟล์ — อัปโหลดคลิปจากมือถือ หรือคลิปที่ทำจาก Google Flow ได้เลย</div>}
          <div className={s.grid}>
            {visual.map(a => (
              <button key={a.path} className={s.asset} title={`ใส่ "${a.name}" ต่อท้ายไทม์ไลน์`} onClick={() => addAsset(a).catch(onError)}>
                {a.kind === "video"
                  ? <video src={`${a.url}#t=0.5`} preload="metadata" muted playsInline />
                  : <img src={a.url} alt="" loading="lazy" />}
                {a.folder === "video-broll" && <span className={s.assetTag}>Flow</span>}
                <span className={s.assetAdd}><Plus size={15} /></span>
                <span className={s.assetName}>{a.name}</span>
              </button>
            ))}
          </div>
          <p className={s.hint}>ไฟล์ที่อัปโหลดเก็บไว้ตลอด ใช้ซ้ำในงานอื่นได้ · คลิปที่มีเสียงพูดของคนอื่นหรือเพลงติดมา ต้องมีสิทธิ์ใช้ก่อนโพสต์</p>
        </div>
      )}

      {tab === "packs" && (
        <div className={s.libBody}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: 10, color: "#8aa2c8" }} />
            <input className={`${s.input} ${s.search}`} style={{ paddingLeft: 28 }} placeholder="ค้นหา เช่น OP 17, PRB, Pokemon"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className={s.hint}>กด <b>ทับ</b> = วางซองลอยบนคลิป · กด <b>ฉาก</b> = เป็นภาพเต็มจอในแทร็กหลัก</p>
          <div className={s.grid}>
            {packs.map(x => (
              <div key={x.sku_id} className={`${s.asset} ${s.assetPack}`} style={{ cursor: "default" }}>
                <img src={skuImg[x.sku_id]} alt="" loading="lazy" />
                <span className={s.assetName} style={{ display: "flex", gap: 4, alignItems: "center", whiteSpace: "normal" }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.sku_id}</span>
                  <button className={s.chip} style={{ padding: "2px 7px" }}
                          onClick={() => dispatch({ type: "ADD_OVERLAY", overlay: { type: "image", src: `sku:${x.sku_id}`, w: 0.5, y: 0.55, anim: "pop" }, len: 3 })}>
                    <Layers size={11} /> ทับ
                  </button>
                  <button className={s.chip} style={{ padding: "2px 7px" }}
                          onClick={() => dispatch({ type: "ADD_CLIP", clip: clipFromAsset({ kind: "image", url: `sku:${x.sku_id}`, name: x.sku_id }) })}>
                    ฉาก
                  </button>
                </span>
              </div>
            ))}
          </div>
          {!packs.length && <div className={s.empty}>ไม่พบซองที่มีรูป</div>}
        </div>
      )}

      {tab === "text" && (
        <div className={s.libBody}>
          <div className={s.secTitle}>ตัวหนังสือ — ใส่ที่ตำแหน่งหัวอ่าน ยาว 3 วิ</div>
          {TEXT_PRESETS.map(p => (
            <button key={p.label} className={s.preset} onClick={() => addText(p)}>
              <span className={`${s.presetSample} ${s.ovText} ${s[p.cls]}`}><span className={s.ovIn} style={{ WebkitTextStrokeWidth: p.cls === "st_neon" ? 1 : 3, fontSize: 17, padding: p.cls === "st_box" ? "2px 8px" : 0, borderWidth: 2, borderRadius: 8 }}>{p.sample}</span></span>
              <span>{p.label}<small>{p.hint}</small></span>
            </button>
          ))}
          <div className={s.secTitle}>แบรนด์</div>
          <button className={s.preset} onClick={addLogo}>
            <img src="/logo-white.png" alt="" style={{ width: 64, height: 32, objectFit: "contain" }} />
            <span>โลโก้ร้าน<small>มุมขวาบน ตลอดคลิป · ไฟล์จริง ไม่วาดใหม่</small></span>
          </button>
          <button className={s.preset} onClick={addEndCard}>
            <span className={`${s.presetSample} ${s.ovText} ${s.st_box}`}><span className={s.ovIn} style={{ fontSize: 12, padding: "3px 6px", borderWidth: 2, borderRadius: 8 }}>เช็กหน้าเว็บ</span></span>
            <span>ปิดท้าย: เช็กหน้าเว็บก่อนไป<small>3 วิสุดท้าย · "ตามลิงก์ด้านล่างได้เลย"</small></span>
          </button>
          <p className={s.hint}>ห้ามใส่ยอดขาย/ตัวเลขยอดในคลิป · ข้อความบนจอไม่ผ่านด่านตรวจคำเว่อร์อัตโนมัติ — อ่านทวนก่อนโพสต์</p>
        </div>
      )}

      {tab === "audio" && (
        <div className={s.libBody}>
          <div className={s.secTitle}>เสียงพากย์ (AI อ่านบท)</div>
          <button className={s.preset} onClick={() => dispatch(tot.voice
            ? { type: "SELECT", sel: { kind: "voice", id: "voice" } }
            : { type: "SET_VOICE", voice: { script: "", voice: "Puck", style: null, tts_model: null }, select: true })}>
            <Mic size={22} />
            <span>{tot.voice ? "แก้บทพากย์" : "เพิ่มเสียงพากย์"}<small>พิมพ์บท 1 บรรทัด = ซับ 1 ท่อน · ซับไทยขึ้นเองตามเสียง</small></span>
          </button>
          <div className={s.secTitle}>เพลงประกอบ</div>
          <div className={s.note}>คลังเพลงที่มีใบอนุญาต<b> ยังว่าง</b> (รอเลือกแหล่งเพลง) — อัปโหลดเพลงเองได้ที่แท็บ "ไฟล์" แล้วกดเลือกด้านล่าง
            <br />เพลงที่อัปโหลดเอง <b>ต้องมีสิทธิ์ใช้</b> ไม่งั้นโพสต์โดนปิดเสียง/ลบ</div>
          {!audio.length && <div className={s.empty}>ยังไม่มีไฟล์เสียงในคลัง</div>}
          {audio.map(a => (
            <button key={a.path} className={s.audioRow} onClick={() => addAsset(a)}>
              <Music size={15} /><span>{a.name}</span>
              {tot.music?.src === a.url ? <b style={{ color: "#3ddcff" }}>ใช้อยู่</b> : <Plus size={14} />}
            </button>
          ))}
          <div className={s.secTitle}>เสียงจากคลิป</div>
          <p className={s.hint}>ปรับความดัง/ปิดเสียงของคลิปวิดีโอแต่ละชิ้นได้ที่แผงขวา หลังกดเลือกคลิปบนไทม์ไลน์</p>
        </div>
      )}
      {ups.some(u => !u.done && !u.err) && (
        <div className={s.hint} style={{ padding: "0 10px 10px", display: "flex", gap: 6, alignItems: "center" }}>
          <Loader2 size={13} className="animate-spin" /> กำลังอัปโหลด — อย่าเพิ่งปิดหน้านี้
        </div>
      )}
    </div>
  )
}
