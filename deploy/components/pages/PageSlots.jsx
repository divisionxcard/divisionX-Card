// PageSlots — Admin self-service slot management UI
// Layer 5 ของ slot-change resilience
import { useEffect, useMemo, useState } from "react"
import {
  Monitor, RefreshCw, History, Edit3, CheckCircle, Flag, X,
  AlertTriangle, Loader2, ArrowRight, Save,
} from "lucide-react"
import { SectionTitle } from "../shared/dx-components"
import {
  getActiveSlotMappings, getSlotHistory, getRecentSlotChanges,
  recordSlotChangeManual, reviewSlotChange,
} from "../../lib/supabase"

const STATUS_BADGE = {
  pending:   { color: "var(--dx-warning)", bg: "rgba(245,158,11,0.12)", label: "รอ review" },
  confirmed: { color: "var(--dx-success)", bg: "rgba(34,197,94,0.12)",  label: "ยืนยันแล้ว" },
  flagged:   { color: "var(--dx-danger)",  bg: "rgba(239,68,68,0.12)",  label: "ติดธง" },
}

export default function PageSlots({ machines = [], skus = [] }) {
  const [active, setActive] = useState([])
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMachine, setSelectedMachine] = useState("all")
  const [historyModal, setHistoryModal] = useState(null)   // { machine_id, slot_number }
  const [manualModal, setManualModal] = useState(null)     // { machine_id, slot_number, current }
  const [reviewDays, setReviewDays] = useState(30)

  const machineNames = useMemo(() => {
    const m = {}
    machines.forEach(x => { m[x.machine_id] = x.name || x.machine_id })
    return m
  }, [machines])

  const load = async () => {
    setLoading(true)
    try {
      const [a, c] = await Promise.all([
        getActiveSlotMappings(),
        getRecentSlotChanges(reviewDays, { includeReviewed: true }),
      ])
      setActive(a)
      setChanges(c)
    } catch (e) {
      console.error("load slots failed", e)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [reviewDays])

  const machineIds = useMemo(() => {
    const ids = [...new Set(active.map(r => r.machine_id))].sort()
    return selectedMachine === "all" ? ids : [selectedMachine].filter(id => ids.includes(id))
  }, [active, selectedMachine])

  const slotsByMachine = useMemo(() => {
    const m = {}
    active.forEach(r => {
      if (!m[r.machine_id]) m[r.machine_id] = []
      m[r.machine_id].push(r)
    })
    Object.values(m).forEach(arr => arr.sort((a, b) => (a.slot_number || "").localeCompare(b.slot_number || "", undefined, { numeric: true })))
    return m
  }, [active])

  const pendingCount = changes.filter(c => c.review_status === "pending").length

  const onReview = async (historyId, status) => {
    let note = null
    if (status === "flagged") {
      note = prompt("ระบุเหตุผล/รายละเอียดของปัญหา:")
      if (note === null) return
    }
    try {
      await reviewSlotChange(historyId, status, note)
      await load()
    } catch (e) { alert("Review ล้มเหลว: " + e.message) }
  }

  return (
    <>
      <SectionTitle
        title="จัดการ Slot ของตู้"
        subtitle="ดู mapping ปัจจุบัน · บันทึกการเปลี่ยนสินค้าด้วยตนเอง · review การเปลี่ยนแปลงที่ scraper ตรวจพบ"
        actions={
          <>
            <select value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)}
              className="dx-input" style={{ minWidth: 140 }}>
              <option value="all">ทุกตู้</option>
              {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name || m.machine_id}</option>)}
            </select>
            <button onClick={load} className="dx-btn dx-btn-ghost" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
              Refresh
            </button>
          </>
        }
      />

      {/* Pending changes alert */}
      {pendingCount > 0 && (
        <div style={{
          padding: "12px 14px", borderRadius: 8,
          background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)",
          color: "var(--dx-warning)", fontSize: 12, marginBottom: 16,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={14}/>
          <span style={{ fontWeight: 600 }}>มี {pendingCount} การเปลี่ยนแปลงที่รอ review</span>
          <span style={{ opacity: 0.8 }}>· เลื่อนลงไปดูตาราง "Recent Changes"</span>
        </div>
      )}

      {/* Active slot mappings per machine */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--dx-text-muted)" }}/>
        </div>
      ) : machineIds.length === 0 ? (
        <div className="dx-card" style={{ padding: 30, textAlign: "center", color: "var(--dx-text-muted)", fontSize: 12 }}>
          ยังไม่มีข้อมูล slot mapping · รอ scraper รันรอบถัดไป
        </div>
      ) : machineIds.map(mid => (
        <div key={mid} className="dx-card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Monitor size={14} style={{ color: "var(--dx-cyan-soft)" }}/>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>
              {machineNames[mid] || mid}
            </h3>
            <span style={{ fontSize: 10, color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>{mid}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--dx-text-muted)" }}>
              {(slotsByMachine[mid] || []).length} slots
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 60 }}>Slot</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>สินค้าปัจจุบัน</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", width: 120 }}>SKU</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", width: 140 }}>เริ่มขายเมื่อ</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(slotsByMachine[mid] || []).map(s => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--dx-border)" }}>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "var(--dx-mono)", color: "var(--dx-cyan-soft)" }}>{s.slot_number}</td>
                    <td style={{ padding: "8px 10px" }}>{s.product_name || "—"}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--dx-mono)", fontSize: 11, color: "var(--dx-text-secondary)" }}>{s.sku_id || "—"}</td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--dx-text-muted)" }}>
                      {s.effective_from ? new Date(s.effective_from).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <button onClick={() => setHistoryModal({ machine_id: mid, slot_number: s.slot_number })}
                        className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>
                        <History size={11}/>ประวัติ
                      </button>
                      <button onClick={() => setManualModal({ machine_id: mid, slot_number: s.slot_number, current: s })}
                        className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>
                        <Edit3 size={11}/>เปลี่ยน
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Recent changes review */}
      <div className="dx-card" style={{ marginTop: 24, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>
            การเปลี่ยนแปลงล่าสุด (Review)
          </h3>
          <select value={reviewDays} onChange={e => setReviewDays(Number(e.target.value))} className="dx-input" style={{ fontSize: 11 }}>
            <option value={7}>7 วันล่าสุด</option>
            <option value={30}>30 วันล่าสุด</option>
            <option value={90}>90 วันล่าสุด</option>
          </select>
        </div>
        {changes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--dx-text-muted)", fontSize: 12 }}>
            ไม่มีการเปลี่ยนแปลงในช่วงนี้
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>เวลา</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>ตู้ / Slot</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>จาก → เป็น</th>
                  <th style={{ padding: "8px 10px", textAlign: "center" }}>สถานะ</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 180 }}>Review</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, idx) => {
                  const badge = STATUS_BADGE[c.review_status] || STATUS_BADGE.pending
                  return (
                    <tr key={`${c.history_id}-${idx}`} style={{ borderTop: "1px solid var(--dx-border)" }}>
                      <td style={{ padding: "8px 10px", color: "var(--dx-text-secondary)" }}>
                        {new Date(c.changed_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontFamily: "var(--dx-mono)", fontSize: 11 }}>{machineNames[c.machine_id] || c.machine_id}</div>
                        <div style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>slot {c.slot_number}</div>
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: 11 }}>
                        <span style={{ color: "var(--dx-text-secondary)" }}>{c.old_product_name || "—"}</span>
                        <ArrowRight size={11} style={{ margin: "0 6px", color: "var(--dx-warning)", verticalAlign: "middle" }}/>
                        <span style={{ color: "var(--dx-success)" }}>{c.new_product_name || "—"}</span>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                        {c.review_note && <div style={{ fontSize: 9, color: "var(--dx-text-muted)", marginTop: 2 }}>{c.review_note}</div>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        {c.review_status === "pending" ? (
                          <>
                            <button onClick={() => onReview(c.history_id, "confirmed")}
                              className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11, color: "var(--dx-success)", marginRight: 4 }}>
                              <CheckCircle size={11}/>ตั้งใจ
                            </button>
                            <button onClick={() => onReview(c.history_id, "flagged")}
                              className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11, color: "var(--dx-danger)" }}>
                              <Flag size={11}/>Bug
                            </button>
                          </>
                        ) : (
                          <button onClick={() => onReview(c.history_id, "pending")}
                            className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 10, color: "var(--dx-text-muted)" }}>
                            reset
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History modal */}
      {historyModal && (
        <HistoryModal {...historyModal} machineName={machineNames[historyModal.machine_id]} onClose={() => setHistoryModal(null)}/>
      )}
      {/* Manual change modal */}
      {manualModal && (
        <ManualChangeModal {...manualModal} machineName={machineNames[manualModal.machine_id]} skus={skus}
          onClose={() => setManualModal(null)}
          onSaved={async () => { setManualModal(null); await load() }}/>
      )}
    </>
  )
}

// ── History modal ──────────────────────────────────────────────
function HistoryModal({ machine_id, slot_number, machineName, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    (async () => {
      try { setRows(await getSlotHistory(machine_id, slot_number)) }
      finally { setLoading(false) }
    })()
  }, [machine_id, slot_number])

  return (
    <ModalShell title={`ประวัติ Slot ${slot_number}`} subtitle={`${machineName || machine_id} · slot ${slot_number}`} onClose={onClose}>
      {loading ? <Loader2 size={20} className="animate-spin" style={{ color: "var(--dx-text-muted)" }}/>
       : rows.length === 0 ? <div style={{ textAlign: "center", color: "var(--dx-text-muted)", fontSize: 12, padding: 20 }}>ไม่มีประวัติ</div>
       : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>ตั้งแต่</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>ถึง</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>สินค้า</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>ที่มา</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--dx-border)" }}>
                <td style={{ padding: "8px 10px", color: "var(--dx-text-secondary)" }}>
                  {r.effective_from ? new Date(r.effective_from).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </td>
                <td style={{ padding: "8px 10px", color: r.effective_to ? "var(--dx-text-secondary)" : "var(--dx-success)" }}>
                  {r.effective_to ? new Date(r.effective_to).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "active"}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <div>{r.product_name || "—"}</div>
                  {r.sku_id && <div style={{ fontSize: 9, color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>{r.sku_id}</div>}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--dx-text-muted)" }}>{r.detected_by || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
       )}
    </ModalShell>
  )
}

// ── Manual change modal ────────────────────────────────────────
function ManualChangeModal({ machine_id, slot_number, current, machineName, skus, onClose, onSaved }) {
  const [skuId, setSkuId] = useState("")
  const [productName, setProductName] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const selectedSku = useMemo(() => skus.find(s => s.sku_id === skuId), [skus, skuId])
  useEffect(() => {
    if (selectedSku && !productName) setProductName(selectedSku.canonical_sku || selectedSku.product_name || selectedSku.sku_id)
  }, [selectedSku])

  const save = async () => {
    if (!skuId && !productName) { setErr("กรุณาเลือก SKU หรือกรอกชื่อสินค้า"); return }
    try {
      setSaving(true); setErr(null)
      await recordSlotChangeManual({
        machine_id, slot_number,
        new_sku_id:      skuId || null,
        new_product_id:  null,                // ไม่ทราบจาก UI (จะ sync จาก scraper รอบถัดไป)
        new_product_name: productName || (selectedSku?.product_name) || skuId,
        note: note || null,
      })
      onSaved?.()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={`เปลี่ยนสินค้า Slot ${slot_number}`} subtitle={`${machineName || machine_id} · slot ${slot_number}`} onClose={onClose}>
      <div style={{ marginBottom: 12, padding: 10, background: "var(--dx-bg-input)", borderRadius: 6, fontSize: 11 }}>
        <div style={{ color: "var(--dx-text-muted)", marginBottom: 2 }}>สินค้าปัจจุบัน</div>
        <div style={{ color: "var(--dx-text)" }}>{current?.product_name || "—"} {current?.sku_id && <span style={{ color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>({current.sku_id})</span>}</div>
      </div>

      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>SKU ใหม่</label>
      <select value={skuId} onChange={e => setSkuId(e.target.value)} className="dx-input" style={{ width: "100%", marginBottom: 10 }}>
        <option value="">— เลือก SKU —</option>
        {skus.filter(s => s.active !== false).map(s => (
          <option key={s.sku_id} value={s.sku_id}>{s.sku_id} · {s.canonical_sku || s.product_name}</option>
        ))}
      </select>

      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>ชื่อสินค้าตามที่แสดงในตู้ (optional)</label>
      <input value={productName} onChange={e => setProductName(e.target.value)} className="dx-input"
        placeholder="เช่น One Piece OP - 15 Pack" style={{ width: "100%", marginBottom: 10 }}/>

      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>หมายเหตุ (optional)</label>
      <textarea value={note} onChange={e => setNote(e.target.value)} className="dx-input" rows={2}
        placeholder="เช่น เปลี่ยนเพราะของหมด · ทดลองวางสินค้าใหม่"
        style={{ width: "100%", marginBottom: 14, resize: "vertical" }}/>

      {err && <div style={{ color: "var(--dx-danger)", fontSize: 11, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} className="dx-btn dx-btn-ghost" disabled={saving}>ยกเลิก</button>
        <button onClick={save} className="dx-btn dx-btn-primary" disabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
          บันทึก
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared modal shell ─────────────────────────────────────────
function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--dx-bg-card)", borderRadius: 14, border: "1px solid var(--dx-border)",
        width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottom: "1px solid var(--dx-border)" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--dx-text)" }}>{title}</h3>
            {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--dx-text-muted)" }}>
            <X size={18}/>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}
