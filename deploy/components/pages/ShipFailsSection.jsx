// ShipFailsSection — Dark Theme
// Tab ใน PageClaims · admin only
// แสดง Ship Fail transactions จาก WW · admin ยืนยันหลังตรวจกับ WW portal
import { useState, useEffect } from "react"
import { CheckCircle, AlertTriangle, Loader2, X, RefreshCw, RotateCcw } from "lucide-react"
import { fmtB } from "../shared/helpers"
import { getShipFails, resolveShipFail, reopenShipFail } from "../../lib/supabase"

export default function ShipFailsSection({ session }) {
  const userId = session?.user?.id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("pending")  // pending | resolved | all

  const [resolveId, setResolveId] = useState(null)
  const [refundAmount, setRefundAmount] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getShipFails()
      setRows(data || [])
    } catch (e) {
      setError(e.message || "โหลดไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = filter === "all" ? rows : rows.filter(r => r.status === filter)
  const pendingCount = rows.filter(r => r.status === "pending").length
  const resolvedCount = rows.filter(r => r.status === "resolved").length
  const totalPending = rows.filter(r => r.status === "pending").reduce((a, r) => a + (parseFloat(r.amount) || 0), 0)
  const totalRefunded = rows.filter(r => r.status === "resolved").reduce((a, r) => a + (parseFloat(r.refunded_amount) || 0), 0)

  const openResolve = (row) => {
    setResolveId(row.id)
    setRefundAmount(row.refunded_amount != null ? String(row.refunded_amount) : String(row.amount))
    setNote(row.refunded_note || "")
  }
  const closeResolve = () => { setResolveId(null); setRefundAmount(""); setNote("") }

  const handleResolve = async () => {
    if (!resolveId) return
    setSaving(true)
    try {
      const amt = refundAmount === "" ? null : parseFloat(refundAmount)
      await resolveShipFail(resolveId, { refundedAmount: amt, note, userId })
      closeResolve()
      await load()
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  const handleReopen = async (id) => {
    if (!confirm("กลับเป็น pending? (ลบยอดคืนเงินที่บันทึกไว้)")) return
    try {
      await reopenShipFail(id)
      await load()
    } catch (e) {
      setError(e.message || "ทำไม่สำเร็จ")
    }
  }

  const formatDT = (iso) => {
    if (!iso) return "-"
    const d = new Date(iso)
    return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <KpiCard label="รอตรวจสอบ" value={pendingCount} sub={fmtB(totalPending)} accent="var(--dx-warning)" />
        <KpiCard label="ตรวจแล้ว" value={resolvedCount} sub={`คืนรวม ${fmtB(totalRefunded)}`} accent="var(--dx-success)" />
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,68,102,0.1)", color: "var(--dx-danger)", fontSize: 12, border: "1px solid rgba(255,68,102,0.3)" }}>
          <AlertTriangle size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }}/>
          {error}
        </div>
      )}

      {/* Filter + refresh */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {[
          { v: "pending", l: `รอตรวจสอบ (${pendingCount})` },
          { v: "resolved", l: `ตรวจแล้ว (${resolvedCount})` },
          { v: "all", l: `ทั้งหมด (${rows.length})` },
        ].map(t => (
          <button key={t.v} onClick={() => setFilter(t.v)}
            className={`dx-chip ${filter === t.v ? "dx-chip-active" : ""}`}>
            {t.l}
          </button>
        ))}
        <button onClick={load} className="dx-btn dx-btn-ghost" style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 11 }}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      {/* List */}
      <div className="dx-card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--dx-text-muted)" }}>
            <Loader2 size={20} className="animate-spin"/>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--dx-text-muted)", fontSize: 12 }}>
            ไม่มีรายการ
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <th style={th}>เวลา</th>
                <th style={th}>ตู้</th>
                <th style={th}>SKU</th>
                <th style={th}>สินค้า (raw)</th>
                <th style={{ ...th, textAlign: "right" }}>ยอดจ่าย</th>
                <th style={{ ...th, textAlign: "right" }}>คืนแล้ว</th>
                <th style={{ ...th, textAlign: "center" }}>สถานะ</th>
                <th style={{ ...th, textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--dx-border)" }}>
                  <td style={td}>{formatDT(r.sold_at)}</td>
                  <td style={{ ...td, fontFamily: "var(--dx-mono)" }}>{r.machine_id}</td>
                  <td style={{ ...td, fontFamily: "var(--dx-mono)" }}>{r.sku_id || <span style={{ color: "var(--dx-warning)" }}>—</span>}</td>
                  <td style={{ ...td, fontSize: 11, color: "var(--dx-text-muted)" }} title={r.product_name_raw}>
                    {(r.product_name_raw || "").slice(0, 30)}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--dx-mono)", color: "var(--dx-warning)" }}>
                    {fmtB(r.amount)}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--dx-mono)", color: r.refunded_amount != null ? "var(--dx-success)" : "var(--dx-text-muted)" }}>
                    {r.refunded_amount != null ? fmtB(r.refunded_amount) : "—"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {r.status === "pending" ? (
                      <span style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 4, color: "var(--dx-warning)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                        รอตรวจ
                      </span>
                    ) : (
                      <span style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 4, color: "var(--dx-success)", background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.3)" }}>
                        ตรวจแล้ว
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {r.status === "pending" ? (
                      <button onClick={() => openResolve(r)} className="dx-btn dx-btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}>
                        ยืนยัน
                      </button>
                    ) : (
                      <button onClick={() => handleReopen(r.id)} title="กลับเป็น pending"
                        className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>
                        <RotateCcw size={12}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Resolve modal */}
      {resolveId && (
        <div onClick={closeResolve} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--dx-bg-card)", borderRadius: 14, border: "1px solid var(--dx-border)", width: "100%", maxWidth: 440, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--dx-text)" }}>
                ยืนยัน Ship Fail
              </h3>
              <button onClick={closeResolve} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--dx-text-muted)" }}>
                <X size={18}/>
              </button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 11, color: "var(--dx-text-muted)" }}>
              เช็คกับ WW portal ว่าคืนเงินลูกค้าจริงหรือยัง · บันทึกยอด refund + หมายเหตุ
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }}>
                ยอดคืนเงินจริง (บาท)
              </label>
              <input type="number" min="0" step="0.01" value={refundAmount}
                onChange={e => setRefundAmount(e.target.value)}
                placeholder="ปล่อยว่างถ้ายังไม่คืน"
                className="dx-input dx-mono"/>
              <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                ถ้า WW ยังไม่ได้คืน → ปล่อยว่าง · บันทึกแค่ "ตรวจแล้ว" ก็ได้
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }}>
                หมายเหตุ
              </label>
              <textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="เช่น WW หักจากยอดงวด 2026-05-25"
                rows={2} className="dx-input" style={{ resize: "vertical", minHeight: 50 }}/>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={closeResolve} disabled={saving}
                className="dx-btn dx-btn-ghost"
                style={{ flex: 1, padding: 10, fontSize: 12, justifyContent: "center" }}>
                ยกเลิก
              </button>
              <button onClick={handleResolve} disabled={saving}
                className="dx-btn dx-btn-primary"
                style={{ flex: 1, padding: 10, fontSize: 12, justifyContent: "center" }}>
                {saving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>}
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th = { padding: "10px 12px", textAlign: "left", fontWeight: 600 }
const td = { padding: "10px 12px", color: "var(--dx-text-secondary)" }

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="dx-card" style={{ padding: 16 }}>
      <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: accent || "var(--dx-text)" }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>{sub}</p>}
    </div>
  )
}
