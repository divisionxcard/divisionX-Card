"use client"
// /diary — ไดอารี่งาน DivisionX บนเว็บของเราเอง (24 ต.ค. 2026 · เจ้าของ: "ทำให้ดูได้โดยไม่ต้องผ่าน claude.ai")
// เปิดได้เฉพาะบัญชีเจ้าของ (ด่านจริงอยู่ที่ /api/diary · หน้านี้แค่บอกผลให้คนอ่านเข้าใจ)
// หน้าตา/ข้อมูลชุดเดียวกับ Artifact เดิม (scripts/diary/diary.html) · ข้อมูลมาจาก /api/diary (คลัง R2 · เฉพาะแอดมิน)
// ติ๊กข้อค้างที่นี่ = บันทึกลง R2 · Claude รวมติ๊กจากหน้านี้กับหน้า claude.ai ทุกต้น session (scripts/diary/sync_r2.py)
import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase, getProfile, signInWithUsername } from "../../lib/supabase"

const REPO = "https://github.com/divisionxcard/divisionX-Card"
const WD = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"]
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
const MON_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
const OWED_SHOW = 4

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
// ข้อความในบันทึกเป็นข้อความธรรมดา — แปลงแค่ `โค้ด` กับ **ตัวหนา** หลัง escape แล้ว
const inline = (s) => ({ __html: esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") })
const parts = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return { y, m, d, wd: new Date(y, m - 1, d).getDay() } }
const fmtShort = (iso) => { const p = parts(iso); return `${p.d} ${MON[p.m - 1]}` }
const num = (n) => Number(n || 0).toLocaleString("en-US")

function Ref({ r }) {
  if (r.type === "commit") return <a className="ref" href={`${REPO}/commit/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer">{r.id}</a>
  if (r.type === "worklog") return <a className="ref wl" href={`${REPO}/blob/main/wiki/worklog/${encodeURIComponent(r.id)}.md`} target="_blank" rel="noopener noreferrer">{r.id}</a>
  return <span className="ref wl">{r.id}</span>
}

function Todo({ d, p, pre, busy, onTick, onGo }) {
  const id = `${pre}-${d.date}-${p.id}`
  return (
    <li className={p.done ? "done" : ""}>
      <input type="checkbox" id={id} checked={!!p.done} disabled={busy} onChange={(e) => onTick(d.date, p.id, e.target.checked)} />
      <label htmlFor={id}>
        <span dangerouslySetInnerHTML={inline(p.text)} />
        {pre === "o" && <> <a className="from" href={`#${d.date}`} onClick={(e) => { e.preventDefault(); onGo(d.date) }}>{fmtShort(d.date)}</a></>}
      </label>
    </li>
  )
}

function Login({ onDone }) {
  const [u, setU] = useState("")
  const [pw, setPw] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr("")
    try { await signInWithUsername(u.trim(), pw); onDone() } catch { setErr("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง") } finally { setBusy(false) }
  }
  return (
    <form className="empty login" onSubmit={submit}>
      <h2>เข้าสู่ระบบก่อนเปิดสมุด</h2>
      <p>ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับเว็บหลังบ้าน · เปิดได้เฉพาะบัญชีเจ้าของ</p>
      <input className="search" autoComplete="username" placeholder="ชื่อผู้ใช้" value={u} onChange={(e) => setU(e.target.value)} />
      <input className="search" type="password" autoComplete="current-password" placeholder="รหัสผ่าน" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="go" type="submit" disabled={busy || !u || !pw}>{busy ? "กำลังเข้า…" : "เปิดสมุด"}</button>
      {err && <p className="err">{err}</p>}
    </form>
  )
}

export default function DiaryPage() {
  const [auth, setAuth] = useState("checking")      // checking | anon | forbidden | ok
  const [days, setDays] = useState(null)
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState("")
  const [owedAll, setOwedAll] = useState(false)
  const [busy, setBusy] = useState(new Set())
  const [err, setErr] = useState("")

  const token = async () => (await supabase.auth.getSession()).data?.session?.access_token || null

  const check = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const user = data?.session?.user
      if (!user) return setAuth("anon")
      let role
      try { role = (await getProfile(user.id))?.role } catch { role = undefined }
      setAuth(role && role !== "admin" ? "forbidden" : "ok")
    } catch { setAuth("anon") }
  }, [])

  const load = useCallback(async () => {
    const t = await token()
    if (!t) return setAuth("anon")
    const res = await fetch("/api/diary", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" })
    if (res.status === 401) return setAuth("anon")
    if (res.status === 403) return setAuth("forbidden")
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || `เปิดสมุดไม่ได้ (${res.status})`); setDays([]); return }
    setDays(j.days || [])
  }, [])

  useEffect(() => {
    const h = decodeURIComponent((window.location.hash || "").slice(1))
    if (/^\d{4}-\d{2}-\d{2}$/.test(h)) setSel(h)
    check()
  }, [check])
  useEffect(() => { if (auth === "ok") load() }, [auth, load])

  const go = (date) => {
    setSel(date)
    try { window.history.replaceState(null, "", "#" + date) } catch { window.location.hash = date }
    if (window.matchMedia("(max-width: 860px)").matches) setTimeout(() => document.querySelector(".sheet")?.scrollIntoView({ block: "start" }), 0)
  }

  const tick = async (date, pid, done) => {
    if (busy.has(date)) return
    setBusy(b => new Set(b).add(date)); setErr("")
    // แสดงผลทันที แล้วค่อยยืนยันจากเซิร์ฟเวอร์ — ล้มแล้วคืนค่าเดิม
    setDays(ds => ds.map(d => (d.date !== date ? d : { ...d, pending: d.pending.map(p => (p.id === pid ? { ...p, done } : p)) })))
    try {
      const t = await token()
      const res = await fetch("/api/diary", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                                              body: JSON.stringify({ date, pid, done }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.day) throw new Error(j.error || res.status)
      setDays(ds => ds.map(d => (d.date === date ? j.day : d)))
    } catch {
      setErr("บันทึกการติ๊กไม่สำเร็จ ลองใหม่อีกครั้ง")
      setDays(ds => ds.map(d => (d.date !== date ? d : { ...d, pending: d.pending.map(p => (p.id === pid ? { ...p, done: !done } : p)) })))
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(date); return n })
    }
  }

  const list = useMemo(() => {
    if (!days) return []
    const k = q.trim().toLowerCase()
    return k ? days.filter(d => JSON.stringify(d).toLowerCase().includes(k)) : days
  }, [days, q])
  const day = days?.find(d => d.date === sel) || days?.[0]
  const open = useMemo(() => (days || []).flatMap(d => (d.pending || []).filter(p => !p.done).map(p => ({ d, p }))), [days])

  let main
  if (auth === "checking" || (auth === "ok" && days === null)) {
    main = <div className="empty"><h2>กำลังเปิดสมุด…</h2><p>บันทึกของแต่ละวันจะขึ้นที่นี่</p></div>
  } else if (auth === "anon") {
    main = <Login onDone={check} />
  } else if (auth === "forbidden") {
    main = (
      <div className="empty"><h2>หน้านี้เปิดได้เฉพาะบัญชีเจ้าของ</h2><p>บัญชีที่ล็อกอินอยู่ไม่มีสิทธิ์เปิดสมุดเล่มนี้</p>
        <button className="go" type="button" onClick={async () => { try { await supabase.auth.signOut({ scope: "local" }) } catch {} setAuth("anon") }}>เข้าด้วยบัญชีอื่น</button>
      </div>)
  } else if (!days.length) {
    main = <div className="empty"><h2>ยังไม่มีบันทึก</h2><p className={err ? "err" : ""}>{err || "หน้าของแต่ละวันจะขึ้นที่นี่หลังจบงาน — Claude เป็นคนเพิ่มให้จากสรุปประจำวันใน wiki/daily"}</p></div>
  } else {
    const p = parts(day.date), st = day.stats || {}
    let lastMonth = ""
    main = (
      <div className="book">
        <nav className="spine" aria-label="วันที่มีบันทึก">
          <input className="search" type="search" placeholder="ค้นในบันทึก เช่น โปสเตอร์ · Pokémon" aria-label="ค้นในบันทึก"
                 value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="days">
            {list.length ? list.flatMap(d => {
              const dp = parts(d.date), mk = `${dp.y}-${dp.m}`, out = []
              if (mk !== lastMonth) { out.push(<li key={"m" + mk} className="month">{MON_FULL[dp.m - 1]} {dp.y}</li>); lastMonth = mk }
              out.push(
                <li key={d.date}>
                  <button className="day-btn" type="button" aria-current={d.date === day.date ? "true" : "false"} onClick={() => go(d.date)}>
                    <span className="num">{dp.d}</span>
                    <span className="meta"><span className="wd">{WD[dp.wd]} · {MON[dp.m - 1]}</span><span className="tt">{d.title}</span></span>
                  </button>
                </li>)
              return out
            }) : <li className="note">ไม่มีวันที่ตรงกับคำค้น</li>}
          </ul>
        </nav>
        <article className="sheet" key={day.date} aria-labelledby="day-h">
          <div className="stamp"><span className="big">{p.d}</span><span className="wd">วัน{WD[p.wd]}</span><span className="my">{MON_FULL[p.m - 1]} {p.y}</span></div>
          <div className="streak" aria-hidden="true" />
          <h2 id="day-h" dangerouslySetInnerHTML={inline(day.title || fmtShort(day.date))} />
          {day.story && <p className="story" dangerouslySetInnerHTML={inline(day.story)} />}
          <div className="chips">
            {st.commits != null && <span className="chip">{num(st.commits)} commit</span>}
            {st.files != null && <span className="chip">{num(st.files)} ไฟล์</span>}
            {st.added != null && <span className="chip">+{num(st.added)} / −{num(st.deleted)} บรรทัด</span>}
            {(day.areas || []).map(a => <span key={a} className="chip area">{a}</span>)}
          </div>
          {!!(day.highlights || []).length && (
            <section className="sec"><h3>ภาพรวม</h3><ul className="high">{day.highlights.map((h, i) => <li key={i} dangerouslySetInnerHTML={inline(h)} />)}</ul></section>
          )}
          {!!(day.stories || []).length && (
            <section className="sec"><h3>งานที่ทำ</h3>
              <ol className="works">{day.stories.map((w, i) => {
                const rows = [["เปลี่ยนอะไร", w.what], ["ทำไม", w.why], ["ผล", w.result], ["นอกรีโป", w.outside]].filter(([, v]) => v)
                return (
                  <li key={i} className="work">
                    <h4 dangerouslySetInnerHTML={inline(w.title)} />
                    {!!rows.length && <dl>{rows.map(([k, v]) => [<dt key={k + "t"}>{k}</dt>, <dd key={k + "d"} dangerouslySetInnerHTML={inline(v)} />])}</dl>}
                    {!!(w.refs || []).length && <div className="refs">{w.refs.map((r, j) => <Ref key={j} r={r} />)}</div>}
                  </li>
                )
              })}</ol>
            </section>
          )}
          {!!(day.decisions || []).length && (
            <section className="sec"><h3>การตัดสินใจของเจ้าของ</h3>
              <div className="dec-wrap"><table className="dec"><thead><tr><th>เรื่อง</th><th>เลือก</th><th>ไม่เลือก</th></tr></thead>
                <tbody>{day.decisions.map((x, i) => (
                  <tr key={i}><td dangerouslySetInnerHTML={inline(x.topic)} /><td className="ch" dangerouslySetInnerHTML={inline(x.chose)} /><td className="no" dangerouslySetInnerHTML={inline(x.rejected || "—")} /></tr>
                ))}</tbody></table></div>
            </section>
          )}
          {!!(day.pending || []).length && (
            <section className="sec"><h3>ค้าง / รอตัดสินใจ</h3>
              <ul className="todo">{day.pending.map(x => <Todo key={x.id} d={day} p={x} pre="d" busy={busy.has(day.date)} onTick={tick} onGo={go} />)}</ul>
            </section>
          )}
          {err && <p className="err">{err}</p>}
        </article>
      </div>
    )
  }

  return (
    <div className="diary">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap">
        <header className="top">
          <span className="lock">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            <span>ส่วนตัว · เปิดได้เฉพาะเจ้าของ</span>
          </span>
          <h1>ไดอารี่งาน <span className="spark">DivisionX</span></h1>
          <p className="lede">เรื่องราวการทำงานแต่ละวันของ DivisionX Card — วันนั้นเปลี่ยนอะไร ทำไม ตัดสินใจอะไร และอะไรยังค้าง</p>
        </header>
        {auth === "ok" && !!open.length && (
          <section className="owed" aria-labelledby="owed-h">
            <h2 id="owed-h">ยังค้างอยู่ <span className="n">{open.length} เรื่อง</span></h2>
            <ul className="todo">{(owedAll ? open : open.slice(0, OWED_SHOW)).map(({ d, p }) => (
              <Todo key={d.date + p.id} d={d} p={p} pre="o" busy={busy.has(d.date)} onTick={tick} onGo={go} />
            ))}</ul>
            {open.length > OWED_SHOW && (
              <button className="more" type="button" onClick={() => setOwedAll(!owedAll)}>{owedAll ? "ย่อรายการ" : `ดูอีก ${open.length - OWED_SHOW} เรื่อง`}</button>
            )}
          </section>
        )}
        <div>{main}</div>
      </div>
    </div>
  )
}

// สไตล์ชุดเดียวกับ scripts/diary/diary.html — ตัวแปรสีผูกกับ .diary (ไม่ใช่ :root) จะได้ไม่ชนธีมของหน้าอื่น
const CSS = `
.diary{--paper:#EDF1F6;--sheet:#FFFFFF;--ink:#111A2C;--muted:#566175;--line:#D5DCE7;--volt:#0072B0;--volt-soft:#E1F1FA;--gold:#8F6511;--gold-soft:#F7EED9;
  --pend:#A6530A;--done:#2B7A4B;--done-soft:#E3F2E8;
  --f-display:var(--df-display),var(--df-body),"Leelawadee UI","Thonburi",sans-serif;--f-body:var(--df-body),"Leelawadee UI","Thonburi","Noto Sans Thai",sans-serif;
  --f-mono:var(--df-mono),ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;--r:14px;
  min-height:100vh;background:var(--paper);color:var(--ink);font:400 16px/1.7 var(--f-body);color-scheme:light}
@media (prefers-color-scheme:dark){.diary{--paper:#0A1020;--sheet:#111A2E;--ink:#E6EBF4;--muted:#93A0B9;--line:#243049;--volt:#3FC7FF;--volt-soft:#0E2A40;
  --gold:#E3C06E;--gold-soft:#2A2414;--pend:#F2A552;--done:#62C48F;--done-soft:#12301F;color-scheme:dark}}
.diary *{box-sizing:border-box}
.diary .wrap{max-width:1160px;margin:0 auto;padding-inline:16px;padding-block:28px 64px;display:grid;gap:28px}
.diary a{color:var(--volt);text-underline-offset:3px}
.diary :focus-visible{outline:2px solid var(--volt);outline-offset:2px;border-radius:6px}
.diary .top{display:grid;gap:6px}
.diary .lock{justify-self:start;display:inline-flex;align-items:center;gap:8px;font:600 13px/1 var(--f-body);letter-spacing:.02em;color:var(--muted);padding:7px 12px;border:1px solid var(--line);border-radius:999px;background:var(--sheet)}
.diary .lock svg{width:13px;height:13px}
.diary h1{margin:4px 0 0;font:700 clamp(34px,6vw,52px)/1.1 var(--f-display);letter-spacing:-.01em;text-wrap:balance}
.diary h1 .spark{color:var(--volt)}
.diary .lede{margin:0;color:var(--muted);max-width:62ch}
.diary .owed{background:var(--sheet);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;display:grid;gap:10px}
.diary .owed h2{margin:0;font:600 18px/1.3 var(--f-display);display:flex;gap:10px;align-items:baseline}
.diary .owed h2 .n{font:600 13px/1 var(--f-body);color:var(--pend);background:color-mix(in srgb,var(--pend) 14%,transparent);padding:4px 9px;border-radius:999px}
.diary .more{justify-self:start;font:500 14px/1 var(--f-body);color:var(--volt);background:transparent;border:0;padding:6px 0;cursor:pointer}
.diary .owed .from{color:var(--muted);font-size:13px;white-space:nowrap}
.diary .book{display:grid;grid-template-columns:260px minmax(0,1fr);gap:24px;align-items:start}
.diary .spine{position:sticky;top:calc(env(safe-area-inset-top,0px) + 16px);display:grid;gap:12px}
.diary .search{width:100%;font:400 15px/1.4 var(--f-body);color:var(--ink);background:var(--sheet);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.diary .search::placeholder{color:var(--muted)}
.diary .days{list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:70vh;overflow-y:auto}
.diary .month{font:600 12px/1 var(--f-body);letter-spacing:.08em;color:var(--muted);padding:14px 10px 6px}
.diary .day-btn{width:100%;display:grid;grid-template-columns:44px minmax(0,1fr);gap:10px;align-items:center;text-align:left;background:transparent;border:1px solid transparent;border-radius:10px;padding:8px 10px;color:var(--ink);cursor:pointer;font:inherit}
.diary .day-btn:hover{background:var(--sheet);border-color:var(--line)}
.diary .day-btn[aria-current="true"]{background:var(--sheet);border-color:var(--volt)}
.diary .day-btn .num{font:700 24px/1 var(--f-display);font-variant-numeric:tabular-nums;color:var(--volt);text-align:center}
.diary .day-btn .meta{min-width:0;display:grid}
.diary .day-btn .wd{font-size:12px;color:var(--muted);line-height:1.3}
.diary .day-btn .tt{font-size:14px;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.diary .sheet{background:var(--sheet);border:1px solid var(--line);border-radius:var(--r);padding:clamp(20px,4vw,40px);display:grid;gap:26px;min-width:0}
.diary .stamp{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 18px;align-items:end}
.diary .stamp .big{grid-row:span 2;font:700 clamp(64px,12vw,96px)/.85 var(--f-display);font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.diary .stamp .wd{font:600 15px/1.2 var(--f-display);color:var(--volt)}
.diary .stamp .my{font:500 15px/1.2 var(--f-body);color:var(--muted)}
.diary .streak{height:2px;border-radius:2px;background:linear-gradient(90deg,var(--volt),color-mix(in srgb,var(--volt) 0%,transparent) 70%)}
.diary .sheet h2{margin:0;font:700 clamp(24px,3.4vw,32px)/1.25 var(--f-display);text-wrap:balance}
.diary .story{margin:0;max-width:66ch;font-size:17px}
.diary .chips{display:flex;flex-wrap:wrap;gap:8px}
.diary .chip{font:500 13px/1 var(--f-body);padding:7px 11px;border-radius:999px;border:1px solid var(--line);color:var(--muted);font-variant-numeric:tabular-nums}
.diary .chip.area{color:var(--volt);border-color:color-mix(in srgb,var(--volt) 40%,var(--line))}
.diary .sec{display:grid;gap:12px}
.diary .sec h3{margin:0;font:600 13px/1 var(--f-body);letter-spacing:.1em;color:var(--muted)}
.diary .high{margin:0;padding-left:1.2em;display:grid;gap:6px;max-width:70ch;list-style:disc}
.diary .high li::marker{color:var(--volt)}
.diary .works{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.diary .work{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:6px}
.diary .work:first-child{border-top:0;padding-top:0}
.diary .work h4{margin:0;font:600 18px/1.4 var(--f-display)}
.diary .work dl{margin:0;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px}
.diary .work dt{color:var(--muted);font-size:14px}
.diary .work dd{margin:0;min-width:0}
.diary .refs{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.diary .ref{font:500 12px/1 var(--f-mono);padding:6px 8px;border-radius:6px;background:var(--volt-soft);color:var(--volt);text-decoration:none}
.diary .ref.wl{font-family:var(--f-body);font-size:12.5px;background:transparent;border:1px solid var(--line);color:var(--muted)}
.diary .ref:hover{text-decoration:underline}
.diary code{font:500 .88em var(--f-mono);background:var(--volt-soft);color:var(--volt);padding:1px 5px;border-radius:5px}
.diary .dec{width:100%;border-collapse:collapse;font-size:15px}
.diary .dec th{text-align:left;font:600 13px/1.3 var(--f-body);color:var(--muted);padding:0 10px 8px 0;border-bottom:1px solid var(--line)}
.diary .dec td{padding:10px 10px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
.diary .dec .ch{color:var(--gold);font-weight:600}
.diary .dec .no{color:var(--muted)}
.diary .dec-wrap{overflow-x:auto}
.diary .todo{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.diary .todo li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start}
.diary .todo input{width:18px;height:18px;margin:4px 0 0;accent-color:var(--done)}
.diary .todo label{cursor:pointer}
.diary .todo li.done label{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--line)}
.diary .todo input:disabled+label{cursor:default}
.diary .note{color:var(--muted);font-size:14px}
.diary .empty{background:var(--sheet);border:1px dashed var(--line);border-radius:var(--r);padding:40px 24px;display:grid;gap:8px;justify-items:start}
.diary .empty h2{margin:0;font:600 22px/1.3 var(--f-display)}
.diary .empty p{margin:0;color:var(--muted);max-width:56ch}
.diary .login{max-width:420px;justify-items:stretch;gap:12px}
.diary .go{font:600 15px/1 var(--f-body);color:#fff;background:var(--volt);border:0;border-radius:10px;padding:12px 16px;cursor:pointer}
.diary .go:disabled{opacity:.5;cursor:default}
.diary .err{color:var(--pend);font-size:14px}
@media (max-width:860px){
  .diary .book{grid-template-columns:minmax(0,1fr)}
  .diary .spine{position:static}
  .diary .days{display:flex;overflow-x:auto;overflow-y:hidden;max-height:none;gap:6px;padding-bottom:4px;scroll-snap-type:x proximity}
  .diary .days .month{display:none}
  .diary .days li{flex:0 0 auto;scroll-snap-align:start}
  .diary .day-btn{width:auto;grid-template-columns:auto;justify-items:center;gap:2px;padding:8px 12px;background:var(--sheet);border-color:var(--line)}
  .diary .day-btn .tt{display:none}
  .diary .work dl{grid-template-columns:minmax(0,1fr);gap:0}
  .diary .work dt{margin-top:6px}
}
@media (prefers-reduced-motion:no-preference){.diary .sheet{animation:drise .25s ease-out}@keyframes drise{from{transform:translateY(6px);opacity:.6}to{transform:none;opacity:1}}}
`
