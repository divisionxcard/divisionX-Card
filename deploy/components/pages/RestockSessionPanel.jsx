// RestockSessionPanel — รอบจัดของ + สรุปการเติมจริง (Slot Refill Tracking เฟส 2)
// ต่างจาก "รายงานเติมสินค้า" เดิม (= ต้องเติมเท่าไหร่ให้เต็ม) · อันนี้ = เติมไปแล้วจริงเท่าไหร่ (slot_refill_events)
import { useState, useEffect, useCallback } from "react"
import {
  PackagePlus, Play, CheckCircle2, X, RefreshCw, Pencil, Check,
  ChevronDown, ChevronUp, History,
} from "lucide-react"
import { fmt } from "../shared/helpers"
import {
  getOpenRestockSession, startRestockSession, closeRestockSession, cancelRestockSession,
  getRestockSessions, getRefillEventsForSession, updateRefillEventQty, getLatestStockSyncedAt,
} from "../../lib/supabase"
import { authFetch } from "../../lib/authFetch"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bkkTime = (iso) => (iso ? new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "")

export default function RestockSessionPanel({ machines = [], skus = [], profile }) {
  const [expanded, setExpanded]   = useState(false)
  const [session, setSession]     = useState(null)     // open session (ถ้ามี)
  const [events, setEvents]       = useState([])       // refill events ของ open session (preview)
  const [history, setHistory]     = useState([])       // closed sessions ล่าสุด
  const [histEvents, setHistEvents] = useState({})     // sessionId -> events[]
  const [openHistId, setOpenHistId] = useState(null)
  const [picked, setPicked]       = useState([])       // ตู้ที่เลือกจะเริ่มรอบ
  const [busy, setBusy]           = useState(null)      // 'start' | 'closing' | 'cancel' | null
  const [msg, setMsg]             = useState(null)
  const [editId, setEditId]       = useState(null)
  const [editVal, setEditVal]     = useState("")

  // ── map machine → brand/name ──
  const brandOf = (id) => machines.find((m) => m.machine_id === id)?.brand || (id?.startsWith("wwv") ? "worldwide" : "vms")
  const nameOf  = (id) => machines.find((m) => m.machine_id === id)?.name || id
  const ppbOf   = (skuId) => skus.find((s) => s.sku_id === skuId)?.packs_per_box || 24
  const eventPacks = (e) => (e.is_box ? (e.qty_added || 0) * ppbOf(e.sku_id) : (e.qty_added || 0))

  const activeMachines = machines
    .filter((m) => m.status === "active")
    .map((m) => m.machine_id)
    .sort()

  const reloadOpen = useCallback(async () => {
    const s = await getOpenRestockSession()
    setSession(s)
    if (s) setEvents(await getRefillEventsForSession(s))
    else setEvents([])
  }, [])

  const reloadHistory = useCallback(async () => {
    const list = (await getRestockSessions(10)).filter((s) => s.status === "closed")
    setHistory(list)
  }, [])

  useEffect(() => {
    if (!expanded) return
    reloadOpen().catch((e) => setMsg({ type: "error", msg: e.message }))
    reloadHistory().catch(() => {})
  }, [expanded, reloadOpen, reloadHistory])

  // default เลือกทุกตู้ active
  useEffect(() => { if (picked.length === 0 && activeMachines.length) setPicked(activeMachines) }, [activeMachines.join(",")]) // eslint-disable-line

  const togglePick = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  // ── สั่ง sync ตู้ตาม platform + รอจน machine_stock มีข้อมูลใหม่ (async ~1-2 นาที) ──
  // return true ถ้าข้อมูลใหม่มาถึง · throw ถ้า dispatch ไม่สำเร็จ
  const syncAndWait = async (machineIds, label) => {
    const before = await getLatestStockSyncedAt(machineIds)
    const brands = new Set(machineIds.map(brandOf))
    const triggers = []
    if (brands.has("vms")) triggers.push(authFetch("/api/stock-sync", { method: "POST" }))
    if (brands.has("worldwide")) triggers.push(authFetch("/api/worldwide-stock-sync", { method: "POST" }))
    const results = await Promise.all(triggers.map((p) => p.then((r) => r.json()).catch((e) => ({ error: e.message }))))
    const failed = results.find((r) => !r.success)
    if (failed) throw new Error(failed.error || "สั่งซิงค์ไม่สำเร็จ")
    for (let i = 0; i < 12; i++) {
      await sleep(12000)
      const latest = await getLatestStockSyncedAt(machineIds)
      if (latest && latest !== before) return true
      setMsg({ type: "info", msg: `${label}... (${(i + 1) * 12}s)` })
    }
    return false
  }

  // ── เริ่มรอบ: ดึงสต็อกสดเป็น baseline ก่อน แล้วค่อยสร้าง session ──
  const handleStart = async () => {
    if (!picked.length) { setMsg({ type: "error", msg: "เลือกตู้อย่างน้อย 1 ตู้" }); return }
    try {
      setBusy("start"); setMsg({ type: "info", msg: "กำลังดึงสต็อกตั้งต้น (baseline)..." })
      const landed = await syncAndWait(picked, "กำลังดึง baseline & รอข้อมูลใหม่")
      if (!landed) {
        setMsg({ type: "error", msg: "ดึง baseline ไม่ทัน (sync ช้า) — ลองกด \"เริ่มรอบจัดของ\" อีกครั้ง" })
        return
      }
      await startRestockSession({
        machine_ids: picked,
        started_by: profile?.id || null,
        started_by_name: profile?.display_name || profile?.username || null,
      })
      await reloadOpen()
      setMsg({ type: "success", msg: "ตั้ง baseline + เริ่มรอบแล้ว — จัดของหน้าตู้ได้เลย เสร็จแล้วกด \"จัดเสร็จ\"" })
    } catch (e) { setMsg({ type: "error", msg: e.message }) }
    finally { setBusy(null) }
  }

  // ── จัดเสร็จ: sync ตู้ → รอข้อมูลใหม่ → ปิดรอบ + stamp ──
  const handleFinish = async () => {
    if (!session) return
    try {
      setBusy("closing"); setMsg({ type: "info", msg: "กำลังสั่งซิงค์ตู้..." })
      const landed = await syncAndWait(session.machine_ids, "กำลังซิงค์ & รอข้อมูลใหม่")
      if (!landed) {
        setMsg({ type: "error", msg: "ยังไม่ได้ข้อมูล sync ใหม่ (sync อาจช้า) — รอสักครู่แล้วกด \"จัดเสร็จ\" อีกครั้ง · รอบยังเปิดอยู่" })
        return
      }
      await closeRestockSession(session.id)
      await reloadOpen(); await reloadHistory()
      setMsg({ type: "success", msg: "จัดเสร็จแล้ว — ดูสรุปการเติมด้านล่าง" })
    } catch (e) { setMsg({ type: "error", msg: e.message }) }
    finally { setBusy(null) }
  }

  const handleCancel = async () => {
    if (!session) return
    try { setBusy("cancel"); await cancelRestockSession(session.id); await reloadOpen(); setMsg(null) }
    catch (e) { setMsg({ type: "error", msg: e.message }) }
    finally { setBusy(null) }
  }

  // ── แก้จำนวนเติมเอง ──
  const startEdit = (e) => { setEditId(e.id); setEditVal(String(e.qty_added ?? 0)) }
  const saveEdit = async (e, isHistory, sessionId) => {
    try {
      const v = parseInt(editVal, 10)
      if (isNaN(v) || v < 0) { setMsg({ type: "error", msg: "จำนวนไม่ถูกต้อง" }); return }
      await updateRefillEventQty(e.id, v)
      setEditId(null)
      if (isHistory) { setHistEvents((h) => ({ ...h, [sessionId]: h[sessionId].map((x) => x.id === e.id ? { ...x, qty_added: v, manual_adjusted: true } : x) })) }
      else { setEvents((evs) => evs.map((x) => x.id === e.id ? { ...x, qty_added: v, manual_adjusted: true } : x)) }
    } catch (err) { setMsg({ type: "error", msg: err.message }) }
  }

  const toggleHist = async (s) => {
    if (openHistId === s.id) { setOpenHistId(null); return }
    setOpenHistId(s.id)
    if (!histEvents[s.id]) {
      const evs = await getRefillEventsForSession(s)
      setHistEvents((h) => ({ ...h, [s.id]: evs }))
    }
  }

  // ── สรุป totals (เป็นซอง) ──
  const totalsPacks = (evs) => (evs || []).reduce((a, e) => a + eventPacks(e), 0)

  return (
    <div className="dx-card" style={{ padding: 0, overflow: "hidden", border: session ? "2px solid rgba(0,255,136,0.35)" : undefined }}>
      {/* Header */}
      <button onClick={() => setExpanded((v) => !v)}
        style={{ width: "100%", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
          <PackagePlus size={18} style={{ color: "var(--dx-success)" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--dx-text)" }}>รอบจัดของ — ติดตามการเติมจริง</h2>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
              บันทึกว่าแต่ละรอบเติมอะไรเข้าตู้เท่าไหร่ (สำหรับตัดสต็อกคลัง)
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {session && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(0,255,136,0.12)", color: "var(--dx-success)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--dx-success)", boxShadow: "0 0 6px var(--dx-success)" }} />
              กำลังจัดของ
            </span>
          )}
          {expanded ? <ChevronUp size={16} style={{ color: "var(--dx-text-muted)" }} /> : <ChevronDown size={16} style={{ color: "var(--dx-text-muted)" }} />}
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--dx-border)", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {msg && (
            <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12,
              background: msg.type === "success" ? "rgba(0,255,136,0.08)" : msg.type === "error" ? "rgba(255,68,102,0.08)" : "rgba(0,212,255,0.08)",
              border: `1px solid ${msg.type === "success" ? "rgba(0,255,136,0.25)" : msg.type === "error" ? "rgba(255,68,102,0.25)" : "rgba(0,212,255,0.25)"}`,
              color: msg.type === "success" ? "var(--dx-success)" : msg.type === "error" ? "var(--dx-danger)" : "var(--dx-cyan-bright)" }}>
              {msg.msg}
            </div>
          )}

          {!session ? (
            /* ── ไม่มีรอบเปิด → เลือกตู้ + เริ่ม ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--dx-text-secondary)" }}>เลือกตู้ที่จะจัด</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {activeMachines.map((id) => (
                    <button key={id} onClick={() => togglePick(id)}
                      className={`dx-chip ${picked.includes(id) ? "dx-chip-active" : ""}`}
                      style={{ padding: "6px 12px", fontSize: 11 }}>
                      {nameOf(id)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleStart} disabled={busy === "start"} className="dx-btn dx-btn-primary"
                  style={{ opacity: busy === "start" ? 0.6 : 1 }}>
                  {busy === "start" ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                  {busy === "start" ? "กำลังดึง baseline..." : "เริ่มรอบจัดของ"}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--dx-text-muted)" }}>
                ℹ️ กด "เริ่มรอบจัดของ" ระบบจะดึงสต็อกสดเป็นจุดตั้งต้น (baseline) ก่อน ~1-2 นาที → แล้วค่อยจัดของหน้าตู้
                · จัดของช่วงห้างปิด (ไม่มีขาย) จะได้ตัวเลขแม่นสุด
              </p>
            </div>
          ) : (
            /* ── รอบเปิดอยู่ ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--dx-text-secondary)" }}>
                  เริ่ม <b style={{ color: "var(--dx-text)" }}>{bkkTime(session.started_at)}</b>
                  {session.started_by_name ? ` · โดย ${session.started_by_name}` : ""}
                  <br />ตู้: {session.machine_ids.map(nameOf).join(", ")}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleFinish} disabled={busy === "closing"} className="dx-btn dx-btn-primary"
                    style={{ opacity: busy === "closing" ? 0.6 : 1 }}>
                    {busy === "closing" ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    {busy === "closing" ? "กำลังซิงค์..." : "จัดเสร็จ — ซิงค์ & สรุป"}
                  </button>
                  <button onClick={handleCancel} disabled={!!busy} className="dx-btn dx-btn-ghost">
                    <X size={13} /> ยกเลิก
                  </button>
                </div>
              </div>
              <RefillTable events={events} nameOf={nameOf} eventPacks={eventPacks}
                editId={editId} editVal={editVal} setEditVal={setEditVal}
                onEdit={startEdit} onSave={(e) => saveEdit(e, false)} onCancelEdit={() => setEditId(null)}
                emptyHint={'ยังไม่มีการเติม — จัดของเสร็จแล้วกด "จัดเสร็จ" เพื่อดึงข้อมูล'} />
            </div>
          )}

          {/* ── ประวัติรอบที่ปิดแล้ว ── */}
          {history.length > 0 && (
            <div style={{ borderTop: "1px solid var(--dx-border)", paddingTop: 14 }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, color: "var(--dx-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                <History size={13} /> รอบที่ผ่านมา
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((s) => {
                  const evs = histEvents[s.id]
                  const open = openHistId === s.id
                  return (
                    <div key={s.id} style={{ border: "1px solid var(--dx-border)", borderRadius: 8, overflow: "hidden" }}>
                      <button onClick={() => toggleHist(s)}
                        style={{ width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--dx-bg-elevated)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <span style={{ fontSize: 12, color: "var(--dx-text)", textAlign: "left" }}>
                          {bkkTime(s.started_at)} → {bkkTime(s.closed_at)} · {s.machine_ids.map(nameOf).join(", ")}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {evs && <span className="dx-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--dx-success)" }}>{fmt(totalsPacks(evs))} ซอง</span>}
                          {open ? <ChevronUp size={14} style={{ color: "var(--dx-text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--dx-text-muted)" }} />}
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: 14 }}>
                          <RefillTable events={evs || []} nameOf={nameOf} eventPacks={eventPacks}
                            editId={editId} editVal={editVal} setEditVal={setEditVal}
                            onEdit={startEdit} onSave={(e) => saveEdit(e, true, s.id)} onCancelEdit={() => setEditId(null)}
                            emptyHint="ไม่มีการเติมในรอบนี้" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ตารางสรุปการเติม (1 แถว/refill event · แก้ qty_added ได้) ──
function RefillTable({ events, nameOf, eventPacks, editId, editVal, setEditVal, onEdit, onSave, onCancelEdit, emptyHint }) {
  const refills = (events || []).filter((e) => e.change_type === "refill")
  if (refills.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, color: "var(--dx-text-muted)", padding: "10px 0" }}>{emptyHint}</p>
  }
  // group ตามตู้
  const byMachine = {}
  refills.forEach((e) => { (byMachine[e.machine_id] = byMachine[e.machine_id] || []).push(e) })
  const grandPacks = refills.reduce((a, e) => a + eventPacks(e), 0)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Object.entries(byMachine).map(([machId, evs]) => {
        const mPacks = evs.reduce((a, e) => a + eventPacks(e), 0)
        return (
          <div key={machId}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dx-text)" }}>{nameOf(machId)}</span>
              <span className="dx-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--dx-cyan-bright)" }}>{fmt(mPacks)} ซอง</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "var(--dx-bg-elevated)" }}>
                    {["SKU", "หน่วย", "ช่อง", "ก่อน", "หลัง", "ขาย", "เติม", ""].map((h) => (
                      <th key={h} style={{ padding: "5px 8px", fontWeight: 600, color: "var(--dx-text-muted)",
                        textAlign: ["ก่อน", "หลัง", "ขาย", "เติม"].includes(h) ? "right" : "left", border: "1px solid var(--dx-border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evs.map((e) => {
                    const editing = editId === e.id
                    return (
                      <tr key={e.id}>
                        <td className="dx-mono" style={{ padding: "5px 8px", fontWeight: 700, color: "var(--dx-text)", border: "1px solid var(--dx-border)" }}>{e.sku_id || e.product_name || "?"}</td>
                        <td style={{ padding: "5px 8px", color: "var(--dx-text-secondary)", border: "1px solid var(--dx-border)" }}>{e.is_box ? "กล่อง" : "ซอง"}</td>
                        <td style={{ padding: "5px 8px", color: "var(--dx-text-muted)", border: "1px solid var(--dx-border)" }}>{e.slot_number || "รวม"}</td>
                        <td className="dx-mono" style={{ padding: "5px 8px", textAlign: "right", color: "var(--dx-text-muted)", border: "1px solid var(--dx-border)" }}>{e.qty_before}</td>
                        <td className="dx-mono" style={{ padding: "5px 8px", textAlign: "right", color: "var(--dx-text-muted)", border: "1px solid var(--dx-border)" }}>{e.qty_after}</td>
                        <td className="dx-mono" style={{ padding: "5px 8px", textAlign: "right", color: "var(--dx-text-muted)", border: "1px solid var(--dx-border)" }}>{e.sold_between || 0}</td>
                        <td className="dx-mono" style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, border: "1px solid var(--dx-border)",
                          color: e.manual_adjusted ? "var(--dx-warning)" : "var(--dx-success)" }}>
                          {editing ? (
                            <input value={editVal} onChange={(ev) => setEditVal(ev.target.value)} autoFocus
                              onKeyDown={(ev) => { if (ev.key === "Enter") onSave(e); if (ev.key === "Escape") onCancelEdit() }}
                              className="dx-input" style={{ width: 56, padding: "2px 6px", fontSize: 11, textAlign: "right" }} />
                          ) : (
                            <span title={e.manual_adjusted ? "แก้ด้วยมือ" : ""}>{e.qty_added}{e.manual_adjusted ? " *" : ""}</span>
                          )}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "center", border: "1px solid var(--dx-border)" }}>
                          {editing ? (
                            <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <Check size={14} style={{ cursor: "pointer", color: "var(--dx-success)" }} onClick={() => onSave(e)} />
                              <X size={14} style={{ cursor: "pointer", color: "var(--dx-text-muted)" }} onClick={onCancelEdit} />
                            </span>
                          ) : (
                            <Pencil size={12} style={{ cursor: "pointer", color: "var(--dx-text-muted)" }} onClick={() => onEdit(e)} />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, paddingTop: 4, borderTop: "1px solid var(--dx-border)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dx-text)" }}>รวมเติมทั้งหมด</span>
        <span className="dx-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--dx-success)" }}>{fmt(grandPacks)} ซอง</span>
      </div>
    </div>
  )
}
