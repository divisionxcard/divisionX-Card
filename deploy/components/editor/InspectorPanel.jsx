"use client"
// InspectorPanel — แผงขวาของห้องตัดต่อ: ฉาก / ซับ / พาดหัว / โลโก้
//
// หลักการของแผงนี้: ทุกปุ่มพูดภาษาคนธรรมดา (เจ้าของตู้ ไม่ใช่คนตัดต่อ)
// และทุกการแก้ยิงเป็น action เข้า reducer เดียวใน editorStore — แผงนี้ไม่ถือ
// ความจริงอะไรเอง ยกเว้นเศษระหว่างพิมพ์/ลากที่ยังไม่ commit (ดู CommitText/CommitSlider)
//
// ทำไมต้องมีตัว Commit*: action ที่แก้เนื้อหาเข้า undo stack ทุกครั้ง ถ้า dispatch
// ทุกตัวอักษร/ทุก pixel ที่ลาก การกด undo หนึ่งทีจะย้อนได้แค่ตัวอักษรเดียว
// จึงเก็บค่าไว้ในตัวเองระหว่างแก้ แล้วยิงครั้งเดียวตอนปล่อยเมาส์/blur/Enter
import { useState, useEffect } from "react"
import styles from "./InspectorPanel.module.css"
import {
  VISUAL_CHOICES, SUB_STYLES, LOGO_POS, MIN_SUB, MOTIONS, TRANSITIONS,
  VOICES, VOICE_STYLES, MOTION_TEMPLATES,
  sceneAt, totalOf, fmtTime, effectiveVisual, round3, clamp,
  autoMotion, autoTransition, parseTpl, buildTpl, isSelfAnimated,
} from "./editorStore"
import { getSkus } from "../../lib/supabase"

const TABS = [
  { id: "scene", label: "ฉาก" },
  { id: "sub", label: "ซับ" },
  { id: "headline", label: "พาดหัว" },
  { id: "voice", label: "เสียง" },
  { id: "logo", label: "โลโก้" },
]

export default function InspectorPanel({ state, dispatch, api }) {
  const [tab, setTab] = useState("scene")
  const kind = state.ui.selected.kind
  const selIndex = state.ui.selected.index

  // เลือกอะไรบนจอ (คลิกฉาก/ชิปซับ/พาดหัว/โลโก้) → แผงเปิดแท็บนั้นให้ทันที
  // ไม่ต้องคลิกซ้ำสองที่ · ใส่ selIndex ใน deps เพราะคลิกซับใบใหม่ kind ไม่เปลี่ยน
  // แต่แผงก็ควรเด้งกลับมาแท็บซับถ้าผู้ใช้เพิ่งกดไปดูแท็บอื่นอยู่
  useEffect(() => { if (kind) setTab(kind) }, [kind, selIndex])

  // รายชื่อสินค้าไว้เลือกรูปซอง/กล่อง — โหลดครั้งเดียวตอนเปิดห้อง
  // โหลดพลาด (ยังไม่ล็อกอิน/เน็ตล่ม) = แค่ไม่มี dropdown ให้เลือก แท็บฉากที่เหลือ
  // ต้องใช้งานต่อได้ปกติ จึงกลืน error ไว้เป็นแฟล็กเดียว — และนับ "ได้ลิสต์ว่าง"
  // เป็นพลาดด้วย (RLS ยามไม่ล็อกอินตอบ [] เฉย ๆ ไม่ throw ถ้าไม่นับจะค้างคำว่า
  // กำลังโหลดตลอดกาล ไม่มีทั้ง dropdown ทั้งช่องพิมพ์สำรอง)
  const [skus, setSkus] = useState([])
  const [skuFail, setSkuFail] = useState(false)
  useEffect(() => {
    let gone = false
    getSkus()
      .then(rows => {
        if (gone) return
        setSkus(rows || [])
        if (!(rows || []).length) setSkuFail(true)
      })
      .catch(() => { if (!gone) setSkuFail(true) })
    return () => { gone = true }
  }, [])

  return (
    <aside className={styles.panel}>
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {tab === "scene" && <SceneTab state={state} dispatch={dispatch} skus={skus} skuFail={skuFail} />}
        {tab === "sub" && <SubTab state={state} dispatch={dispatch} />}
        {tab === "headline" && <HeadlineTab state={state} dispatch={dispatch} />}
        {tab === "voice" && <VoiceTab state={state} dispatch={dispatch} />}
        {tab === "logo" && <LogoTab state={state} dispatch={dispatch} api={api} />}
      </div>
    </aside>
  )
}

// ── แท็บ ฉาก ────────────────────────────────────────────────────────────
function SceneTab({ state, dispatch, skus, skuFail }) {
  // เลือกฉากไว้ก็ใช้ฉากนั้น ไม่ได้เลือกก็ใช้ฉากใต้ playhead — คนดูพรีวิวอยู่ตรงไหน
  // ก็อยากแก้ตรงนั้น ไม่ควรบังคับให้คลิกเลือกก่อน
  const sel = state.ui.selected
  const rawI = sel.kind === "scene" && sel.index != null ? sel.index : sceneAt(state.timing, state.ui.t)
  const i = state.timing[rawI] ? rawI : sceneAt(state.timing, state.ui.t)
  const t = state.timing[i]

  // ปุ่มวิทยุ "ซอง/กล่อง"/"ไฟล์" ต้องกดได้ก่อนจะรู้ค่าจริง (ยังไม่ได้เลือกสินค้า/พิมพ์ชื่อ)
  // จึงถือโหมดที่กดไว้ในตัวเองจนกว่าจะมีค่า commit จริง — เปลี่ยนฉากแล้วล้างทิ้ง
  const [mode, setMode] = useState(null)
  useEffect(() => { setMode(null) }, [i])

  if (!t) return <p className={styles.empty}>ยังไม่มีข้อมูลฉาก</p>

  const vis = effectiveVisual(state, i)
  const isTpl = vis.startsWith("tpl:")
  const visMode = isTpl ? "tpl"
    : vis.startsWith("sku:") ? "sku" : vis.startsWith("file:") ? "file" : vis
  const shownMode = mode ?? visMode
  const setVisual = (v) => { setMode(null); dispatch({ type: "SCENE_SET", index: i, patch: { visual: v } }) }
  const zoom = state.edit.scenes?.[String(i)]?.zoom ?? 0.08   // ค่าปกติของตัวเรนเดอร์
  const tpl = parseTpl(vis) || { name: "", img: "", title: "", tag: "" }
  const setTpl = (patch) => setVisual(buildTpl({ ...tpl, ...patch }))

  return (
    <div>
      <div className={styles.head}>
        <div className={styles.headTitle}>ฉากที่ {i + 1}</div>
        <div className={styles.headMeta}>
          {fmtTime(t.start)} – {fmtTime(t.end)} · ยาว {(t.end - t.start).toFixed(1)} วิ
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ภาพประกอบ</div>
        {VISUAL_CHOICES.map(c => (
          <label key={c.id} className={styles.radio}>
            <input type="radio" name="scene-visual" checked={shownMode === c.id}
              onChange={() => setVisual(c.id)} />
            <span>{c.label}</span>
          </label>
        ))}

        <label className={styles.radio}>
          <input type="radio" name="scene-visual" checked={shownMode === "sku"}
            onChange={() => setMode("sku")} />
          <span>ซอง/กล่องสินค้า</span>
        </label>
        {shownMode === "sku" && (
          skus.length ? (
            <select className={`dx-input ${styles.wide}`}
              value={vis.startsWith("sku:") ? vis.slice(4) : ""}
              onChange={e => e.target.value && setVisual(`sku:${e.target.value}`)}>
              <option value="">— เลือกสินค้า —</option>
              {/* "ยังไม่มีรูป" ต้องเห็นตั้งแต่ตอนเลือก — ตัวเรนเดอร์จะพังที่ขั้นภาพ
                  ถ้าเลือกตัวที่ไม่มีรูป และนั่นคือหลังจ่ายค่าเสียงไปแล้ว */}
              {skus.map(s => (
                <option key={s.sku_id} value={s.sku_id}>
                  {s.sku_id} · {s.name}{!s.image_url && !s.image_url_box ? " (ยังไม่มีรูป)" : ""}
                </option>
              ))}
            </select>
          ) : skuFail ? (
            // dropdown พัง → พิมพ์รหัสเองแทน อย่างน้อยงานไม่สะดุด
            <CommitText value={vis.startsWith("sku:") ? vis.slice(4) : ""}
              placeholder="พิมพ์รหัสสินค้า เช่น OP 17" mono
              onCommit={v => { const s = v.trim(); if (s) setVisual(`sku:${s}`) }} />
          ) : (
            <p className={styles.hint}>กำลังโหลดรายการสินค้า…</p>
          )
        )}

        <label className={styles.radio}>
          <input type="radio" name="scene-visual" checked={shownMode === "file"}
            onChange={() => setMode("file")} />
          <span>ไฟล์ในโฟลเดอร์งาน</span>
        </label>
        {shownMode === "file" && (
          <>
            <CommitText value={vis.startsWith("file:") ? vis.slice(5) : ""}
              placeholder="ชื่อไฟล์ เช่น photo.jpg" mono
              onCommit={v => {
                const n = v.trim().replace(/^file:/, "")
                if (n) setVisual(`file:${n}`)
              }} />
            <p className={styles.hint}>
              รองรับทั้งภาพ (.jpg .png) และ<strong>ฟุตเทจวิดีโอ</strong> (.mp4 .mov) —
              เช่นช็อตที่ออกแบบใน Google Flow หรือคลิปถ่ายเอง: วางไฟล์ลงโฟลเดอร์
              .video-work/{state.project}/ แล้วพิมพ์ชื่อไฟล์ตรงนี้ ระบบครอป 9:16
              และตัดให้พอดีช่วงฉากเอง (เสียงติดฟุตเทจถูกตัดทิ้ง — ใช้เสียงพากย์ของเรา)
            </p>
          </>
        )}

        <label className={styles.radio}>
          <input type="radio" name="scene-visual" checked={shownMode === "tpl"}
            onChange={() => setMode("tpl")} />
          <span>ฉากกราฟิกเคลื่อนไหว ✨</span>
        </label>
        {shownMode === "tpl" && (
          <>
            <select className={`dx-input ${styles.wide}`}
              value={isTpl ? tpl.name : ""}
              onChange={e => e.target.value &&
                setVisual(buildTpl({ ...tpl, name: e.target.value }))}>
              <option value="">— เลือกแบบฉาก —</option>
              {MOTION_TEMPLATES.map(m => (
                <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
              ))}
            </select>

            {isTpl && tpl.name === "showcase" && (
              skus.length ? (
                <select className={`dx-input ${styles.wide}`}
                  value={tpl.img.startsWith("sku:") ? tpl.img.slice(4) : ""}
                  onChange={e => e.target.value && setTpl({ img: `sku:${e.target.value}` })}>
                  <option value="">— เลือกสินค้าบนเวที —</option>
                  {skus.map(s => (
                    <option key={s.sku_id} value={s.sku_id}>
                      {s.sku_id} · {s.name}{!s.image_url && !s.image_url_box ? " (ยังไม่มีรูป)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <CommitText value={tpl.img.startsWith("sku:") ? tpl.img.slice(4) : ""}
                  placeholder="รหัสสินค้าบนเวที เช่น OP 17" mono
                  onCommit={v => { const s = v.trim(); if (s) setTpl({ img: `sku:${s}` }) }} />
              )
            )}
            {isTpl && (
              <>
                <CommitText value={tpl.title}
                  placeholder={tpl.name === "intro" ? "ชื่อใหญ่ (เว้นว่าง = DIVISION X)" : "พาดชื่อบนฉาก เช่น อันดับ 1"}
                  onCommit={v => setTpl({ title: v.trim() })} />
                <CommitText value={tpl.tag}
                  placeholder={tpl.name === "intro" ? "บรรทัดรอง (เว้นว่าง = CARD GAME)" : "ป้ายกำกับ เช่น วันพีซ OP-17"}
                  onCommit={v => setTpl({ tag: v.trim() })} />
              </>
            )}
            <p className={styles.hint}>
              ฉากนี้เคลื่อนไหวในตัวเอง (แสง อนุภาค ของลอย) — พรีวิวสดเห็นเป็นภาพนิ่ง
              ผลจริงดูหลังเรนเดอร์ · เรนเดอร์รอบแรกช้ากว่าฉากรูปถ่าย (~30-60 วิ)
              รอบต่อไปใช้แคชถ้าไม่ได้แก้ฉากนี้
            </p>
          </>
        )}
      </div>

      {isSelfAnimated(vis) ? (
        <div className={styles.group}>
          <div className={styles.label}>ท่ากล้อง</div>
          <p className={styles.hint}>
            {isTpl ? "ฉากกราฟิกเคลื่อนไหวในตัวเอง — ไม่ใช้ท่ากล้อง/ซูมทับ"
                   : "ฟุตเทจวิดีโอเล่นของมันเอง — ไม่ซ้อนท่ากล้อง/ซูมทับ"}
          </p>
        </div>
      ) : (
      <div className={styles.group}>
        <div className={styles.label}>ท่ากล้อง</div>
        <select className={`dx-input ${styles.wide}`}
          value={state.edit.scenes?.[String(i)]?.motion ?? "auto"}
          onChange={e => dispatch({ type: "SCENE_SET", index: i, patch: { motion: e.target.value } })}>
          {MOTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {(state.edit.scenes?.[String(i)]?.motion ?? "auto") === "auto" && (
          <p className={styles.hint}>
            {/* บอกว่า auto จะออกท่าไหน — คนจะได้ตัดสินใจได้โดยไม่ต้องเดา */}
            ฉากนี้ระบบเลือก: {(MOTIONS.find(m =>
              m.id === autoMotion(i, state.timing.length, vis)) || {}).label}
          </p>
        )}
        <CommitSlider min={0} max={0.15} step={0.01} value={zoom}
          format={v => v === 0 ? "ภาพนิ่ง" : `แรง ${Math.round(v * 100)}%`}
          onCommit={v => dispatch({ type: "SCENE_SET", index: i, patch: { zoom: round3(v) } })} />
        <p className={styles.hint}>แรง = ระยะซูม/กวาดของท่ากล้อง · 0 = ภาพนิ่งสนิท</p>
      </div>
      )}

      <div className={styles.group}>
        <div className={styles.label}>การเปลี่ยนภาพเข้าฉากนี้</div>
        {i === 0 ? (
          <p className={styles.hint}>ฉากแรกไม่มีรอยต่อเข้า — เริ่มคลิปตรง ๆ</p>
        ) : (
          <>
            <select className={`dx-input ${styles.wide}`}
              value={state.edit.scenes?.[String(i)]?.transition ?? "auto"}
              onChange={e => dispatch({ type: "SCENE_SET", index: i, patch: { transition: e.target.value } })}>
              {TRANSITIONS.map(tr => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
            </select>
            {(state.edit.scenes?.[String(i)]?.transition ?? "auto") === "auto" && (
              <p className={styles.hint}>
                ฉากนี้ระบบเลือก: {(TRANSITIONS.find(tr =>
                  tr.id === autoTransition(i)) || {}).label}
              </p>
            )}
          </>
        )}
      </div>

      <div className={styles.group}>
        <div className={styles.label}>จังหวะตัด — ขยับจุดเริ่มฉากนี้ (วินาที)</div>
        <div className={styles.btnRow}>
          {[-0.5, -0.1, 0.1, 0.5].map(by => (
            <button key={by} type="button" className="dx-btn dx-btn-secondary" disabled={i === 0}
              onClick={() => dispatch({ type: "CUT_NUDGE", index: i, by })}>
              {by < 0 ? `◀ ${Math.abs(by)}` : `${by} ▶`}
            </button>
          ))}
        </div>
        {i === 0 && <p className={styles.hint}>ฉากแรกตรึงที่ 0 เสมอ — ขยับไม่ได้</p>}
      </div>

      <div className={styles.group}>
        <div className={styles.label}>สลับภาพ</div>
        <div className={styles.btnRow}>
          <button type="button" className="dx-btn dx-btn-secondary" disabled={i === 0}
            onClick={() => dispatch({ type: "SCENE_SWAP", index: i, dir: -1 })}>
            ↑ สลับกับฉากก่อน
          </button>
          <button type="button" className="dx-btn dx-btn-secondary" disabled={i === state.timing.length - 1}
            onClick={() => dispatch({ type: "SCENE_SWAP", index: i, dir: +1 })}>
            ↓ สลับกับฉากถัดไป
          </button>
        </div>
        <p className={styles.hint}>สลับเฉพาะภาพ — เสียงพากย์ยังเล่าเรียงเดิม</p>
      </div>
    </div>
  )
}

// ── แท็บ ซับ ────────────────────────────────────────────────────────────
function SubTab({ state, dispatch }) {
  const ss = state.edit.sub_style || {}
  // ค่า override ไม่มี → ตกไปใช้ค่าระดับ plan → ตกไปใช้ค่าปกติของตัวเรนเดอร์
  // ลำดับ fallback ต้องก๊อปจาก make_video.py เป๊ะ ๆ ไม่งั้นเลขที่โชว์โกหกก่อนผู้ใช้แตะ
  const styleId = ss.style ?? state.plan?.style ?? "brand"
  const size = ss.size ?? state.plan?.sub_size ?? 64
  const bottom = ss.bottom ?? 430
  const karaoke = !!(ss.karaoke ?? state.plan?.sub_karaoke)
  const set = (patch) => dispatch({ type: "SUBSTYLE_SET", patch })

  const selIdx = state.ui.selected.kind === "sub" ? state.ui.selected.index : null
  const sub = selIdx != null ? state.subtitles[selIdx] : null

  return (
    <div>
      <div className={styles.group}>
        <div className={styles.label}>สไตล์ซับทั้งคลิป</div>
        <div className={styles.styleCards}>
          {SUB_STYLES.map(s => (
            <button key={s.id} type="button"
              className={`${styles.styleCard} ${styleId === s.id ? styles.styleCardOn : ""}`}
              onClick={() => set({ style: s.id })}>
              <span className={`${styles.stylePrev} ${styles["prev_" + s.id]}`}>
                {/* สไตล์แบรนด์มีคำเน้นเป็นฟ้านีออน — โชว์ให้เห็นในการ์ดเลย */}
                {s.id === "brand" ? <>ตัวอย่าง<em>ซับ</em></> : "ตัวอย่างซับ"}
              </span>
              <span className={styles.styleName}>{s.label}</span>
              <span className={styles.styleDesc}>{s.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ไล่สีตามคำที่พูด (คาราโอเกะ)</div>
        <label className={styles.radio}>
          <input type="checkbox" checked={karaoke}
            onChange={e => set({ karaoke: e.target.checked })} />
          <span>เปิดใช้ <span className={styles.hintInline}>· ลุคมาตรฐานของคลิปสั้น คนดูแบบปิดเสียงตามง่ายขึ้น</span></span>
        </label>
        <p className={styles.hint}>
          {state.words?.length
            ? `ไล่สีตามจังหวะพูดจริง (มีเวลารายคำ ${state.words.length} คำ)`
            : "ยังไม่มีเวลารายคำของงานนี้ — จะไล่สีแบบเฉลี่ยไปก่อน เรนเดอร์อีกรอบแล้วจะแม่นขึ้น"}
          {" · "}เรนเดอร์นานขึ้นเล็กน้อยเพราะต้องวาดซับหลายเฟรมต่อหนึ่งใบ
        </p>
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ขนาดตัวอักษร</div>
        <CommitSlider min={40} max={90} step={1} value={size}
          format={v => `${v}px`} onCommit={v => set({ size: v })} />
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ความสูงจากขอบล่าง</div>
        <CommitSlider min={200} max={700} step={10} value={bottom}
          format={v => `${v}px`} onCommit={v => set({ bottom: v })} />
        <p className={styles.hint}>ยกสูงหลบแถบ TikTok — เปิดเส้นไกด์ (ปุ่ม safe บน header) ช่วยกะ</p>
      </div>

      {sub ? (
        <div className={styles.section}>
          <div className={styles.label}>ใบที่เลือก</div>
          <p className={styles.selText}>&ldquo;{sub.text}&rdquo;</p>
          <div className={styles.timeRow}>
            <label>
              เริ่ม (วินาที)
              {/* clamp กันชนกัน: เริ่มต้องจบก่อนจุดจบอย่างน้อย MIN_SUB เสมอ */}
              <CommitNum value={sub.start} min={0} max={round3(sub.end - MIN_SUB)} step={0.1}
                onCommit={v => dispatch({ type: "SUB_EDIT", index: selIdx, patch: { start: v } })} />
            </label>
            <label>
              จบ (วินาที)
              <CommitNum value={sub.end} min={round3(sub.start + MIN_SUB)}
                max={round3(totalOf(state.timing))} step={0.1}
                onCommit={v => dispatch({ type: "SUB_EDIT", index: selIdx, patch: { end: v } })} />
            </label>
          </div>
        </div>
      ) : (
        <p className={styles.hint}>คลิกการ์ดซับด้านซ้าย หรือชิปซับบน timeline เพื่อแก้เวลาทีละใบ</p>
      )}
    </div>
  )
}

// ── แท็บ พาดหัว ─────────────────────────────────────────────────────────
function HeadlineTab({ state, dispatch }) {
  const h = state.edit.headline
  // plan.headline เป็นสตริงจากใบสั่งงานเดิม — กันเผื่อของเก่าบางงานเก็บเป็น object
  const planHead = typeof state.plan?.headline === "string"
    ? state.plan.headline : state.plan?.headline?.text ?? ""
  const text = h?.text ?? planHead
  // ตัวเรนเดอร์ตกไปใช้ plan.headline_seconds ก่อนถึงจะใช้ 3.0 — เลขที่โชว์ต้องเดินตาม
  const seconds = h?.seconds ?? state.plan?.headline_seconds ?? 3
  const size = h?.size ?? 86
  const off = h != null && h.text === ""   // reducer แทน "ไม่ใช้พาดหัว" ด้วย text ว่าง
  const set = (patch) => dispatch({ type: "HEADLINE_SET", patch })

  return (
    <div>
      <div className={styles.group}>
        <div className={styles.label}>ข้อความพาดหัว</div>
        <CommitText value={text} placeholder="พิมพ์พาดหัว เช่น เปิดกล่องสุ่มการ์ด!"
          onCommit={v => set({ text: v })} />
        {off && <p className={styles.hint}>ตอนนี้ปิดพาดหัวอยู่ — พิมพ์ข้อความเพื่อเปิดใช้อีกครั้ง</p>}
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ค้างบนจอกี่วินาที</div>
        <CommitSlider min={1} max={6} step={0.5} value={seconds}
          format={v => `${v} วิ`} onCommit={v => set({ seconds: v })} />
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ขนาดตัวอักษร</div>
        <CommitSlider min={60} max={110} step={1} value={size}
          format={v => `${v}px`} onCommit={v => set({ size: v })} />
      </div>

      <button type="button" className="dx-btn dx-btn-ghost" disabled={off}
        onClick={() => dispatch({ type: "HEADLINE_SET", patch: null })}>
        ไม่ใช้พาดหัว
      </button>
    </div>
  )
}

// ── แท็บ เสียง ──────────────────────────────────────────────────────────
function VoiceTab({ state, dispatch }) {
  // "กำหนดเอง" ต้องกดได้ก่อนพิมพ์เสร็จ — ถือโหมดไว้ในตัวเองแบบเดียวกับ SceneTab
  const isPreset = VOICE_STYLES.some(s => s.id === state.voiceStyle)
  const [customOn, setCustomOn] = useState(false)
  const showCustom = customOn || !isPreset
  const set = (patch) => dispatch({ type: "VOICE_SET", patch })

  return (
    <div>
      <div className={styles.group}>
        <div className={styles.label}>เสียงพากย์</div>
        {VOICES.map(v => (
          <label key={v.id} className={styles.radio}>
            <input type="radio" name="voice-id" checked={state.voice === v.id}
              onChange={() => set({ voice: v.id })} />
            <span>{v.label} <span className={styles.hintInline}>· {v.desc}</span></span>
          </label>
        ))}
      </div>

      <div className={styles.group}>
        <div className={styles.label}>อารมณ์การอ่าน</div>
        {VOICE_STYLES.map(s => (
          <label key={s.label} className={styles.radio}>
            <input type="radio" name="voice-style"
              checked={!showCustom && state.voiceStyle === s.id}
              onChange={() => { setCustomOn(false); set({ style: s.id }) }} />
            <span>{s.label} <span className={styles.hintInline}>· {s.desc}</span></span>
          </label>
        ))}
        <label className={styles.radio}>
          <input type="radio" name="voice-style" checked={showCustom}
            onChange={() => setCustomOn(true)} />
          <span>กำหนดเอง</span>
        </label>
        {showCustom && (
          <CommitText value={isPreset ? "" : state.voiceStyle}
            placeholder="เช่น อ่านแบบกระซิบ ลึกลับ เหมือนเล่าข่าวลือ"
            onCommit={v => set({ style: v.trim() })} />
        )}
      </div>

      {/* เสียงเป็นของแพงและพ่วงผลข้างเคียง — บอกให้ครบก่อนกดเรนเดอร์ ไม่ใช่ให้ไปเจอเอง */}
      <p className={styles.hint}>
        พรีวิวสดยังเล่นเสียงเดิมจนกว่าจะเรนเดอร์ใหม่ · เปลี่ยนเสียง/อารมณ์แล้วเรนเดอร์
        = สร้างเสียงพากย์ใหม่ (ใช้โควตา TTS และจังหวะอ่านจะเปลี่ยน —
        เวลาตัด/ซับที่แก้มือไว้จะถูกจับใหม่จากเสียงจริงโดยอัตโนมัติ)
      </p>
    </div>
  )
}

// ── แท็บ โลโก้ ──────────────────────────────────────────────────────────
function LogoTab({ state, dispatch, api }) {
  const logo = state.edit.logo
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file) => {
    if (!file || busy) return
    setErr(null)
    // เช็คฝั่งเว็บก่อนส่ง — เพดานเดียวกับ API upload (5MB · png/jpg/webp)
    // จะได้ฟ้องทันทีไม่ต้องรอ round-trip แล้วเดาจาก error กลับมา
    if (file.size > 5 * 1024 * 1024) { setErr("ไฟล์ใหญ่เกิน 5MB"); return }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { setErr("รับเฉพาะไฟล์ .png .jpg .webp"); return }
    if (!api?.uploadLogo) { setErr("อัปโหลดไม่ได้ในโหมดนี้"); return }
    setBusy(true)
    try {
      const res = await api.uploadLogo(file)
      const name = typeof res === "string" ? res : res?.file
      if (!name) throw new Error("เซิร์ฟเวอร์ไม่คืนชื่อไฟล์")
      // ค่าตั้งต้น: มุมบนขวา ขนาดกลาง โปร่งนิด ๆ — จุดที่บังเนื้อหาน้อยสุดบนคลิปแนวตั้ง
      dispatch({ type: "LOGO_SET", patch: { file: name, pos: "tr", size: 140, opacity: 0.9 } })
    } catch (e) {
      setErr(e?.message || "อัปโหลดไม่สำเร็จ")
    } finally {
      setBusy(false)
    }
  }

  if (!logo?.file) {
    return (
      <div>
        <label className={styles.dropZone}>
          <input type="file" className={styles.fileInput} accept=".png,.jpg,.jpeg,.webp"
            onChange={e => { upload(e.target.files?.[0]); e.target.value = "" }} />
          <span className={styles.dropBig}>{busy ? "กำลังอัปโหลด…" : "+ เลือกไฟล์โลโก้"}</span>
          <span className={styles.hint}>.png .jpg .webp ขนาดไม่เกิน 5MB</span>
        </label>
        {err && <p className={styles.err}>{err}</p>}
      </div>
    )
  }

  const src = `/api/video/local/asset?name=${encodeURIComponent(state.project)}&file=${encodeURIComponent(logo.file)}`
  const set = (patch) => dispatch({ type: "LOGO_SET", patch })

  return (
    <div>
      <div className={styles.logoPrev}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ local dev ไม่ผ่าน optimizer */}
        <img src={src} alt="โลโก้ที่อัปโหลดไว้" />
      </div>

      <div className={styles.group}>
        <div className={styles.label}>มุมที่วางบนจอ</div>
        {/* ปุ่มเรียงเป็นผัง 2x2 ตรงกับมุมจอจริง — LOGO_POS เรียง tl tr bl br อยู่แล้ว */}
        <div className={styles.cornerGrid}>
          {LOGO_POS.map(p => (
            <button key={p.id} type="button"
              className={`${styles.corner} ${styles["c_" + p.id]} ${logo.pos === p.id ? styles.cornerOn : ""}`}
              onClick={() => set({ pos: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ขนาดโลโก้</div>
        <CommitSlider min={80} max={260} step={5} value={logo.size ?? 140}
          format={v => `${v}px`} onCommit={v => set({ size: v })} />
      </div>

      <div className={styles.group}>
        <div className={styles.label}>ความทึบ (จางลงจะบังภาพน้อยลง)</div>
        <CommitSlider min={0.3} max={1} step={0.05} value={logo.opacity ?? 0.9}
          format={v => `${Math.round(v * 100)}%`} onCommit={v => set({ opacity: round3(v) })} />
      </div>

      <button type="button" className="dx-btn dx-btn-ghost"
        onClick={() => dispatch({ type: "LOGO_SET", patch: null })}>
        ลบโลโก้ออกจากคลิป
      </button>
      {err && <p className={styles.err}>{err}</p>}
    </div>
  )
}

// ── ตัวช่วยกรอก: dispatch ครั้งเดียวตอนจบการแก้ ─────────────────────────

// slider ที่ถือค่าระหว่างลากไว้ในตัวเอง — ปล่อยเมาส์/ยกนิ้ว/ปล่อยปุ่มลูกศรค่อย commit
function CommitSlider({ value, min, max, step, format, onCommit }) {
  const [drag, setDrag] = useState(null)
  const shown = drag ?? value
  const commit = () => {
    if (drag == null) return
    if (drag !== value) onCommit(drag)
    setDrag(null)
  }
  return (
    <div className={styles.sliderRow}>
      <input type="range" className={styles.slider}
        min={min} max={max} step={step} value={shown}
        onChange={e => setDrag(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <span className={styles.sliderVal}>{format ? format(shown) : shown}</span>
    </div>
  )
}

// ช่องข้อความ — commit ตอน blur หรือ Enter (Enter แค่สั่ง blur จะได้มีทางเดียว)
function CommitText({ value, placeholder, mono, onCommit }) {
  const [txt, setTxt] = useState(value)
  useEffect(() => { setTxt(value) }, [value])   // undo/เปลี่ยนฉาก → ตามค่าจริงเสมอ
  return (
    <input className={`dx-input ${styles.wide}${mono ? " dx-mono" : ""}`}
      value={txt} placeholder={placeholder}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => { if (txt !== value) onCommit(txt) }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur() }} />
  )
}

// ช่องตัวเลข — clamp ให้อยู่ในกรอบก่อน commit (คนพิมพ์ 99 ใส่ช่อง "เริ่ม" ได้เสมอ)
function CommitNum({ value, min, max, step, onCommit }) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => { setTxt(String(value)) }, [value])
  const commit = () => {
    const v = Number(txt)
    // ช่องว่างเปล่าต้องถอยกลับค่าเดิม — Number("") ดันได้ 0 ถ้าปล่อยผ่านจะ
    // commit ค่าขอบล่างทั้งที่ผู้ใช้แค่ลบทิ้งยังพิมพ์ไม่เสร็จ
    if (txt.trim() === "" || !Number.isFinite(v)) { setTxt(String(value)); return }
    const c = round3(clamp(v, min, max))
    if (c !== value) onCommit(c)
    setTxt(String(c))
  }
  return (
    <input type="number" className={`dx-input ${styles.wide}`}
      value={txt} min={min} max={max} step={step}
      onChange={e => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur() }} />
  )
}
