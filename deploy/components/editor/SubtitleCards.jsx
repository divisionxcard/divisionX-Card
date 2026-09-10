"use client"
// การ์ดซับ — คอลัมน์ซ้ายของห้องตัดต่อ: แก้ข้อความ inline · รวม/แยกใบ · ขยับเวลาเริ่ม
//
// หลักคิด: การ์ดคือ "มุมมองข้อความ" ของแทร็กซับบน timeline — แหล่งความจริงเดียวกัน
// (state.subtitles) ห้ามเก็บสำเนาข้อความไว้ใน component ไม่งั้นพิมพ์ฝั่งนี้แล้ว
// ฝั่ง timeline ไม่ขยับตาม และ undo จะย้อนไม่ครบ
import { useEffect, useRef } from "react"
import { fmtTime, subAt, MIN_SUB, NUDGE } from "./editorStore"
import styles from "./SubtitleCards.module.css"

// อัตราอ่านสูงสุดที่ตาคนตามทัน (ตัวอักษร/วินาที) — เกินนี้ขึ้นขอบเหลืองเตือน
// เป็นเกณฑ์ตรวจคุณภาพเฉพาะหน้านี้ ไม่ใช่ค่าที่ตัวเรนเดอร์ใช้ จึงไม่ย้ายไป editorStore
const MAX_CPS = 40

// ยืดหด textarea ตามเนื้อหา — ต้องตั้ง auto ก่อนวัด scrollHeight
// ไม่งั้นลบข้อความออกแล้วกล่องจะไม่หดกลับ (scrollHeight ไม่เล็กลงเองถ้า height ค้าง)
function autoGrow(el) {
  if (!el) return
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight}px`
}

// ── การ์ดหนึ่งใบ ──
// แยกเป็น component ย่อยเพื่อให้แต่ละใบมี useEffect ปรับความสูงของตัวเอง —
// ครอบคลุมทั้งกรณีพิมพ์เอง และกรณี text เปลี่ยนจากข้างนอก (undo/redo, merge/split)
function SubCard({ c, index, isLast, active, selected, dispatch, refCb }) {
  const taRef = useRef(null)
  useEffect(() => { autoGrow(taRef.current) }, [c.text])

  const dur = c.end - c.start
  // นับเป็น code point ([...s]) ไม่ใช่ .length — ตัวอักษรนอก BMP จะได้ไม่นับเบิ้ล
  const cps = [...(c.text || "")].length / Math.max(dur, 0.001)
  const warns = []
  if (dur < MIN_SUB + 0.05)
    warns.push(`ใบนี้ยาวแค่ ${dur.toFixed(2)} วิ — สั้นกว่าเกณฑ์ ${(MIN_SUB + 0.05).toFixed(2)} วิ ตาคนดูจับไม่ทัน`)
  if (cps > MAX_CPS)
    warns.push(`ความเร็วอ่าน ${Math.round(cps)} ตัวอักษร/วิ (เกิน ${MAX_CPS}) — ลองแยกใบหรือยืดเวลาจบ`)

  // คลิก/โฟกัสที่ไหนก็ตามบนใบ = เลือก + พาไปฟังตรงต้นใบ (คำใบ้บนหัวคอลัมน์สัญญาไว้)
  const selectAndSeek = () => {
    dispatch({ type: "SELECT", kind: "sub", index })
    dispatch({ type: "SEEK", t: c.start })
  }

  // ปุ่มจิ๋วทุกตัว stopPropagation — ไม่งั้นการกดปุ่มจะพ่วง seek กลับไปต้นใบ
  // ทั้งที่ผู้ใช้แค่อยากขยับเวลา ไม่ได้อยากให้ playhead เด้ง
  const nudgeStart = (dir) => (e) => {
    e.stopPropagation()
    dispatch({ type: "SUB_NUDGE", index, edge: "start", by: dir * (e.shiftKey ? 0.5 : NUDGE) })
  }
  const merge = (e) => {
    e.stopPropagation()
    dispatch({ type: "SUB_MERGE", index })
  }
  const split = (e) => {
    e.stopPropagation()
    // แยกที่กึ่งกลางเวลา — reducer จะซอยข้อความตามสัดส่วนให้เอง
    dispatch({ type: "SUB_SPLIT", index, at: (c.start + c.end) / 2 })
  }

  const cls = [
    styles.card,
    active ? styles.cardActive : "",
    selected ? styles.cardSelected : "",
    warns.length ? styles.cardWarn : "",
  ].filter(Boolean).join(" ")

  return (
    <div ref={refCb} className={cls} onClick={selectAndSeek}
         title={warns.length ? warns.join("\n") : undefined}>
      <div className={styles.row}>
        <span className={styles.time}>{fmtTime(c.start)} – {fmtTime(c.end)}</span>
        <span className={styles.scene}>ฉาก {(c.segment ?? 0) + 1}</span>
        {warns.length > 0 && <span className={styles.warnDot} title={warns.join("\n")}>⚠</span>}
        <span className={styles.spacer} />
        {/* ป้ายบนปุ่มต้องคำนวณจาก NUDGE ตัวเดียวกับที่ dispatch ใช้ —
            hardcode "0.1" ไว้สองที่ วันไหน store เปลี่ยนค่า ปุ่มจะโกหกผู้ใช้ */}
        <button type="button" className={styles.mini} onClick={nudgeStart(-1)}
                title={`เลื่อนจุดเริ่มไปทางซ้าย ${NUDGE} วิ (กด Shift ค้าง = 0.5)`}>⇤ -{NUDGE}</button>
        <button type="button" className={styles.mini} onClick={nudgeStart(+1)}
                title={`เลื่อนจุดเริ่มไปทางขวา ${NUDGE} วิ (กด Shift ค้าง = 0.5)`}>+{NUDGE} ⇥</button>
        <button type="button" className={styles.mini} onClick={merge} disabled={isLast}
                title={isLast ? "ใบสุดท้าย ไม่มีใบถัดไปให้รวม" : "รวมกับใบถัดไปเป็นใบเดียว"}>รวม↓</button>
        <button type="button" className={styles.mini} onClick={split}
                disabled={dur < MIN_SUB * 2}
                title={dur < MIN_SUB * 2
                  ? `สั้นกว่า ${(MIN_SUB * 2).toFixed(2)} วิ แยกแล้วจะได้ใบที่สั้นเกินเกณฑ์`
                  : "แยกเป็นสองใบที่กึ่งกลางเวลา"}>แยก</button>
      </div>
      {/* value กัน undefined ไว้ — text ที่หายมาจะพลิก textarea เป็น uncontrolled
          แล้วค่าที่ผู้ใช้พิมพ์หลุดจาก state เงียบ ๆ (undo/timeline มองไม่เห็น) */}
      <textarea
        ref={taRef}
        className={styles.text}
        value={c.text ?? ""}
        rows={1}
        placeholder="พิมพ์ซับ… ใส่ *ดอกจัน* รอบคำ = เน้นสีแบรนด์"
        onFocus={selectAndSeek}
        onChange={(e) => dispatch({ type: "SUB_EDIT", index, patch: { text: e.target.value } })}
      />
    </div>
  )
}

export default function SubtitleCards({ state, dispatch, api }) {
  const subs = state.subtitles
  const { t, playing, selected } = state.ui

  // เรียงตามเวลาแต่จำ index เดิมไว้ — dispatch ต้องชี้ตำแหน่งจริงใน state.subtitles
  // และ key ต้องเป็น index เดิม (คงที่ระหว่างพิมพ์) ไม่ใช่ text
  // ไม่งั้น React re-mount textarea ทุกตัวอักษร เคอร์เซอร์เด้งไปท้ายกล่องตลอด
  const ordered = subs.map((c, i) => ({ c, i })).sort((a, b) => a.c.start - b.c.start)

  // ใบที่เสียงกำลังพูดถึง — ไฮไลต์+เลื่อนตาม "เฉพาะตอนเล่น" เท่านั้น
  // ตอนหยุดเพื่อพิมพ์ ถ้ารายการยังเลื่อนเองอยู่จะแย่งสายตาและลากโฟกัสหนีจากที่พิมพ์
  const activeIdx = playing ? subAt(subs, t) : -1

  const cardEls = useRef({})
  useEffect(() => {
    if (activeIdx < 0) return
    cardEls.current[activeIdx]?.scrollIntoView({ block: "nearest" })
  }, [activeIdx])

  // ปุ่ม "เพิ่มซับที่ playhead" — contract ไม่มี action สร้างใบใหม่จากความว่างเปล่า
  // (มีแค่ SUB_SPLIT/SUB_MERGE) จึงทำได้ทางเดียวคือ "แยกใบที่คร่อม playhead อยู่"
  // ถ้า playhead ชี้ลง gap ที่ไม่มีใบคร่อม ก็ไม่มีอะไรให้แยก → ซ่อนปุ่มไปเลย
  // ตั้งใจเคารพ contract มากกว่าฝืนทำฟีเจอร์ — เพิ่ม action นอกสัญญาคือทางไปสู่ blocker
  const hitIdx = subAt(subs, t)
  const hit = hitIdx >= 0 ? subs[hitIdx] : null
  const canSplitHit = hit ? hit.end - hit.start >= MIN_SUB * 2 : false

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.title}>การ์ดซับ ({subs.length})</div>
        <div className={styles.hint}>คลิก = กระโดดไปฟัง · พิมพ์แก้ได้เลย</div>
      </div>

      <div className={styles.list}>
        {subs.length === 0 && (
          <div className={styles.empty}>
            ยังไม่มีซับ — เรนเดอร์รอบแรกจะถอดจากเสียงพากย์ให้อัตโนมัติ
          </div>
        )}

        {ordered.map(({ c, i }) => (
          <SubCard
            key={i}
            c={c}
            index={i}
            isLast={i === subs.length - 1}
            active={i === activeIdx}
            selected={selected.kind === "sub" && selected.index === i}
            dispatch={dispatch}
            refCb={(el) => { cardEls.current[i] = el }}
          />
        ))}

        {hit && (
          <button
            type="button"
            className={styles.addBtn}
            disabled={!canSplitHit}
            title={canSplitHit
              ? `แยกใบที่คร่อมเวลา ${fmtTime(t)} ออกเป็นสองใบ`
              : "ใบที่คร่อม playhead สั้นเกินกว่าจะแยกได้"}
            onClick={() => dispatch({ type: "SUB_SPLIT", index: hitIdx, at: t })}
          >
            ＋ เพิ่มซับที่ playhead
          </button>
        )}
      </div>
    </div>
  )
}
