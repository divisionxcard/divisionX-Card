// PageMachineHistory — Dark Theme
import { useState } from "react"
import { Clock, Pencil, Trash2, Loader2, X, CheckCircle } from "lucide-react"
import { fmt, today, sortByDateThenSku } from "../shared/helpers"
import { Badge } from "../shared/dx-components"
import EditStockOutModal from "./EditStockOutModal"

export default function PageMachineHistory({ machine, stockOut, skus, hideHeader, machines, session, profile, onUpdateStockOut, onDeleteStockOut }) {
  const [filterMode, setFilterMode] = useState("all")
  const [filterDateFrom, setFilterDateFrom] = useState(today())
  const [filterDateTo, setFilterDateTo] = useState(today())
  const [filterMonth, setFilterMonth] = useState(today().slice(0, 7))
  const [filterYear, setFilterYear] = useState(today().slice(0, 4))
  const [filterSku, setFilterSku] = useState("")

  const [editRecord, setEditRecord] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const userId = session?.user?.id
  const isAdmin = profile?.role === "admin"
  const canEditRecord = (r) => isAdmin || (userId && r.withdrawn_by_user_id === userId)
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const handleDelete = async (id) => {
    if (!onDeleteStockOut) return
    setBusy(true)
    try {
      await onDeleteStockOut(id)
      setDeleteId(null)
      showToast("ลบรายการสำเร็จ — คืนสต็อกแล้ว")
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
    finally { setBusy(false) }
  }

  const handleUpdate = async (id, data) => {
    if (!onUpdateStockOut) return
    await onUpdateStockOut(id, data)
    showToast("บันทึกการแก้ไขสำเร็จ")
  }

  // กรองเฉพาะตู้นี้ + sort
  const machineOut = stockOut.filter(r => r.machine_id === machine.machine_id)
  const filtered = machineOut.filter(r => {
    if (filterSku && r.sku_id !== filterSku) return false
    const d = r.withdrawn_at?.slice(0, 10) || ""
    if (filterMode === "daily") return d >= filterDateFrom && d <= filterDateTo
    if (filterMode === "monthly") return d.slice(0, 7) === filterMonth
    if (filterMode === "yearly") return d.slice(0, 4) === filterYear
    return true
  }).sort((a, b) => sortByDateThenSku(a, b, "withdrawn_at"))

  const totalPacks = filtered.reduce((a, r) => a + (r.quantity_packs || 0), 0)
  const skuSummary = {}
  filtered.forEach(r => {
    if (!skuSummary[r.sku_id]) skuSummary[r.sku_id] = 0
    skuSummary[r.sku_id] += r.quantity_packs || 0
  })
  const skuRanked = Object.entries(skuSummary).sort((a, b) => b[1] - a[1])
  const years = [...new Set(machineOut.map(r => r.withdrawn_at?.slice(0, 4)).filter(Boolean))].sort().reverse()

  const filterModes = [
    { v: "all", l: "ทั้งหมด" },
    { v: "daily", l: "รายวัน" },
    { v: "monthly", l: "รายเดือน" },
    { v: "yearly", l: "รายปี" },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {editRecord && onUpdateStockOut && (
        <EditStockOutModal
          record={editRecord}
          skus={skus}
          machines={machines}
          onSave={async (id, data) => { await handleUpdate(id, data); setEditRecord(null) }}
          onClose={() => setEditRecord(null)}
        />
      )}

      {toast && <Toast toast={toast}/>}

      {!hideHeader && (
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--dx-text)", letterSpacing: -0.4 }}>
            {machine.name}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dx-text-muted)" }}>
            {machine.location} — ประวัติการเบิกเติมตู้
          </p>
        </div>
      )}

      {/* ตัวกรอง */}
      <div className="dx-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <select value={filterSku} onChange={e => setFilterSku(e.target.value)} className="dx-input"
            style={{ width: "auto", minWidth: 120, padding: "9px 12px" }}>
            <option value="">ทุก SKU</option>
            {skus.filter(s => s.is_active !== false).sort((a, b) => {
              const order = { OP: 1, EB: 2, PRB: 3 }
              return (order[a.series] || 9) - (order[b.series] || 9) || a.sku_id.localeCompare(b.sku_id)
            }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
          </select>
          {filterModes.map(t => (
            <button key={t.v} onClick={() => setFilterMode(t.v)}
              className={`dx-chip ${filterMode === t.v ? "dx-chip-active" : ""}`}>
              {t.l}
            </button>
          ))}
        </div>
        {filterMode !== "all" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {filterMode === "daily" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="date" value={filterDateFrom}
                  onChange={e => { setFilterDateFrom(e.target.value); if (e.target.value > filterDateTo) setFilterDateTo(e.target.value) }}
                  className="dx-input" style={{ width: "auto", padding: "9px 12px" }}/>
                <span style={{ fontSize: 12, color: "var(--dx-text-muted)" }}>ถึง</span>
                <input type="date" value={filterDateTo} min={filterDateFrom}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="dx-input" style={{ width: "auto", padding: "9px 12px" }}/>
              </div>
            )}
            {filterMode === "monthly" && (
              <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                className="dx-input" style={{ width: "auto", padding: "9px 12px" }}/>
            )}
            {filterMode === "yearly" && (
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                className="dx-input" style={{ width: "auto", padding: "9px 12px" }}>
                {years.length > 0 ? years.map(y => <option key={y} value={y}>{y}</option>)
                  : <option value={filterYear}>{filterYear}</option>}
              </select>
            )}
          </div>
        )}
      </div>

      {/* สรุปยอด */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <SummaryCard label="จำนวนครั้งที่เบิก" value={filtered.length} unit="ครั้ง" accent="cyan"/>
        <SummaryCard label="จำนวนซองที่เบิก" value={fmt(totalPacks)} unit="ซอง" accent="cyanSoft"/>
        <div className="dx-card" style={{ padding: 16, gridColumn: "auto / span 1" }}>
          <div style={{ fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
            SKU ที่เบิกมากสุด
          </div>
          {skuRanked.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--dx-text-muted)" }}>ไม่มีข้อมูล</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {skuRanked.slice(0, 3).map(([skuId, packs], i) => (
                <div key={skuId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                    <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{skuId}</span>
                  </div>
                  <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-cyan-bright)" }}>
                    {fmt(packs)} ซอง
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* รายการเบิก */}
      <div className="dx-card" style={{ padding: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
          รายการเบิก ({filtered.length} รายการ)
        </h2>
        {filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "32px 0", fontSize: 13 }}>
            ไม่มีรายการในช่วงเวลาที่เลือก
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflowY: "auto", paddingRight: 4 }}>
            {filtered.map((r) => {
              const sku = skus.find(s => s.sku_id === r.sku_id)
              const unitMatch = r.note?.match(/^\[(\d+)(กล่อง|ซอง)\]/)
              const cleanNote = r.note?.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, "") || ""
              const editable = canEditRecord(r) && onUpdateStockOut && onDeleteStockOut
              const isConfirming = deleteId === r.id
              return (
                <div key={r.id} style={{
                  padding: 12, borderRadius: 10,
                  background: "var(--dx-bg-input)",
                  border: "1px solid var(--dx-border)",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{r.sku_id}</span>
                        <Badge series={sku?.series || "OP"}/>
                        {r.lot_number && (
                          <span className="dx-mono" style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 4,
                            background: "rgba(0,212,255,0.08)", color: "var(--dx-cyan-soft)",
                            border: "1px solid rgba(0,212,255,0.2)",
                          }}>{r.lot_number}</span>
                        )}
                        {unitMatch && (
                          <span className="dx-mono" style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                            background: "rgba(0,212,255,0.1)", color: "var(--dx-cyan-bright)",
                          }}>
                            {unitMatch[1]} {unitMatch[2]}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: "6px 0 0", fontSize: 10, color: "var(--dx-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={10}/> {r.withdrawn_at?.slice(0, 10)} {r.withdrawn_at?.slice(11, 16) || ""}
                        {r.created_by && <span style={{ marginLeft: 4 }}>· โดย {r.created_by}</span>}
                      </p>
                      {cleanNote && (
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--dx-text-muted)", fontStyle: "italic" }}>
                          "{cleanNote}"
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                      <span className="dx-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--dx-danger)" }}>
                        -{fmt(r.quantity_packs)} ซอง
                      </span>
                      {editable && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 6 }}>
                          <IconBtn onClick={() => setEditRecord(r)} title="แก้ไข" variant="info">
                            <Pencil size={11}/>
                          </IconBtn>
                          <IconBtn onClick={() => setDeleteId(r.id)} title="ลบ" variant="danger">
                            <Trash2 size={11}/>
                          </IconBtn>
                        </div>
                      )}
                    </div>
                  </div>
                  {isConfirming && (
                    <div style={{
                      marginTop: 10, paddingTop: 10,
                      borderTop: "1px solid rgba(255,68,102,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(255,68,102,0.08)",
                      marginLeft: -12, marginRight: -12, marginBottom: -12,
                      padding: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
                    }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "var(--dx-danger)" }}>
                        ยืนยันลบ? จำนวนจะคืนกลับสต็อก
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setDeleteId(null)} disabled={busy} className="dx-btn dx-btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 11 }}>
                          ยกเลิก
                        </button>
                        <button onClick={() => handleDelete(r.id)} disabled={busy}
                          style={{
                            padding: "4px 10px", fontSize: 11, fontWeight: 600,
                            borderRadius: 6, cursor: busy ? "not-allowed" : "pointer",
                            background: "var(--dx-danger)", color: "#fff",
                            border: "none",
                            display: "inline-flex", alignItems: "center", gap: 4,
                            opacity: busy ? 0.5 : 1,
                          }}>
                          {busy ? <Loader2 size={10} className="animate-spin"/> : <Trash2 size={10}/>}
                          ลบ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function SummaryCard({ label, value, unit, accent = "cyan" }) {
  const colors = {
    cyan:     "var(--dx-cyan)",
    cyanSoft: "var(--dx-cyan-soft)",
    success:  "var(--dx-success)",
    warning:  "var(--dx-warning)",
    danger:   "var(--dx-danger)",
  }
  return (
    <div className="dx-card" style={{ padding: 16 }}>
      <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </p>
      <p className="dx-mono" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 700, color: colors[accent] || colors.cyan, lineHeight: 1.1 }}>
        {value}{" "}
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--dx-text-muted)" }}>{unit}</span>
      </p>
    </div>
  )
}

function IconBtn({ children, onClick, title, variant }) {
  const variants = {
    info:   { bg: "rgba(0,212,255,0.1)",   color: "var(--dx-cyan-bright)", hover: "rgba(0,212,255,0.2)" },
    danger: { bg: "rgba(255,68,102,0.1)",  color: "var(--dx-danger)",      hover: "rgba(255,68,102,0.2)" },
  }
  const v = variants[variant] || variants.info
  return (
    <button onClick={onClick} title={title}
      style={{
        padding: 6, borderRadius: 6, border: "none", cursor: "pointer",
        background: v.bg, color: v.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background .15s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = v.hover}
      onMouseLeave={e => e.currentTarget.style.background = v.bg}>
      {children}
    </button>
  )
}

function Toast({ toast }) {
  const isError = toast.type === "error"
  return (
    <div style={{
      position: "fixed",
      top: 16, left: 16, right: 16,
      zIndex: 50,
      padding: "12px 16px",
      borderRadius: 12,
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--dx-bg-card)",
      border: `1px solid ${isError ? "rgba(255,68,102,0.35)" : "rgba(0,255,136,0.35)"}`,
      color: isError ? "var(--dx-danger)" : "var(--dx-success)",
      boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)",
      fontSize: 13,
      ...(typeof window !== "undefined" && window.innerWidth >= 640
        ? { left: "auto", right: 16, maxWidth: 360 }
        : {}),
    }}>
      {isError ? <X size={16}/> : <CheckCircle size={16}/>}
      <span>{toast.msg}</span>
    </div>
  )
}
