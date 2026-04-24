// PageClaims — Dark Theme
import { useState, useEffect } from "react"
import { CheckCircle, AlertTriangle, Trash2, Loader2 } from "lucide-react"
import { fmtB, sortSkus } from "../shared/helpers"
import { SectionTitle } from "../shared/dx-components"

const STATUS_OPTIONS = [
  { v: "returned", l: "คืนสต็อก", desc: "สภาพดี นำกลับมาขายได้", accent: { text: "var(--dx-success)", bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.35)" } },
  { v: "damaged",  l: "ชำรุด",    desc: "เสียหาย ขายต่อไม่ได้",   accent: { text: "var(--dx-danger)",  bg: "rgba(255,68,102,0.08)", border: "rgba(255,68,102,0.35)" } },
  { v: "lost",     l: "สูญหาย",   desc: "ตู้ปล่อยเกิน ไม่ได้คืน",  accent: { text: "#FFA573",            bg: "rgba(255,165,115,0.08)", border: "rgba(255,165,115,0.35)" } },
]

const REASONS = ["สินค้าไม่ตก", "ตกผิดช่อง", "ตู้ปล่อยเกิน", "เครื่องค้าง", "สินค้าชำรุด", "อื่นๆ"]

export default function PageClaims({ machines, skus, claims, onAddClaim, onConfirmClaim, onDeleteClaim, machineAssignments, session }) {
  const userId = session?.user?.id
  const myAssignments = (machineAssignments || []).filter(a => a.user_id === userId && a.is_active)
  const hasAssignment = myAssignments.length > 0
  const myMachines = hasAssignment ? machines.filter(m => myAssignments.some(a => a.machine_id === m.machine_id)) : machines
  const myClaims = hasAssignment ? claims.filter(c => myAssignments.some(a => a.machine_id === c.machine_id)) : claims

  const [form, setForm] = useState({
    machine_id: "", sku_id: "", quantity: "1", refund_amount: "",
    product_status: "returned", reason: "สินค้าไม่ตก", note: "",
    claimed_at: new Date().toISOString().slice(0, 10),
  })

  // Auto-fill refund_amount = avg_cost × quantity เมื่อเลือก damaged/lost
  useEffect(() => {
    if (form.product_status === "damaged" || form.product_status === "lost") {
      const sku = skus.find(s => s.sku_id === form.sku_id)
      const avg = parseFloat(sku?.avg_cost) || 0
      const qty = parseInt(form.quantity) || 0
      setForm(f => ({ ...f, refund_amount: (avg * qty).toFixed(2) }))
    }
  }, [form.product_status, form.sku_id, form.quantity, skus])

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.machine_id) { showToast("กรุณาเลือกตู้", "error"); return }
    if (!form.sku_id) { showToast("กรุณาเลือกสินค้า", "error"); return }
    if (form.product_status !== "lost" && (!form.refund_amount || parseFloat(form.refund_amount) <= 0)) { showToast("กรุณาระบุยอดคืนเงิน", "error"); return }
    if (!form.claimed_at) { showToast("กรุณาระบุวันที่เคลม", "error"); return }
    try {
      setSaving(true)
      await onAddClaim({
        machine_id: form.machine_id,
        sku_id: form.sku_id,
        quantity: parseInt(form.quantity) || 1,
        refund_amount: parseFloat(form.refund_amount) || 0,
        product_status: form.product_status,
        reason: form.reason || null,
        note: form.note || null,
        claimed_at: form.claimed_at,
      })
      showToast(`บันทึกเคลมสำเร็จ: ${form.sku_id} → ${form.product_status === "returned" ? "คืนสต็อก" : "ตัดชำรุด"}`)
      setForm(f => ({ ...f, machine_id: "", sku_id: "", quantity: "1", refund_amount: "", note: "", claimed_at: new Date().toISOString().slice(0, 10) }))
    } catch (err) { showToast("เกิดข้อผิดพลาด: " + err.message, "error") }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await onDeleteClaim(id)
      setDeleteId(null)
      showToast("ลบรายการเคลมสำเร็จ")
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
  }

  const handleConfirm = async (claim) => {
    try {
      setConfirming(true)
      await onConfirmClaim(claim)
      setConfirmId(null)
      showToast(`ยืนยันเคลมสำเร็จ: ${claim.sku_id} ${claim.quantity} ซอง`)
    } catch (err) { showToast("ยืนยันไม่สำเร็จ: " + err.message, "error") }
    finally { setConfirming(false) }
  }

  const totalRefund = myClaims.reduce((a, r) => a + (parseFloat(r.refund_amount) || 0), 0)
  const totalReturned = myClaims.filter(r => r.product_status === "returned").length
  const totalDamaged = myClaims.filter(r => r.product_status === "damaged").length
  const totalLost = myClaims.filter(r => r.product_status === "lost").length

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle pill="Claims · Refunds" title="เคลม / คืนเงิน" subtitle="บันทึกรายการเคลม · คืนสต็อก · ตัดชำรุด · สูญหาย"/>

      {toast && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, fontSize: 12,
          background: toast.type === "success" ? "rgba(0,255,136,0.08)" : "rgba(255,68,102,0.08)",
          border: `1px solid ${toast.type === "success" ? "rgba(0,255,136,0.25)" : "rgba(255,68,102,0.25)"}`,
          color: toast.type === "success" ? "var(--dx-success)" : "var(--dx-danger)",
        }}>
          {toast.type === "success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <StatCard label="เคลมทั้งหมด" value={`${myClaims.length} รายการ`} accent="var(--dx-danger)"/>
        <StatCard label="ยอดคืนเงินรวม" value={fmtB(totalRefund)} accent="var(--dx-danger)" mono/>
        <div className="dx-card" style={{ padding: 16 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
            สถานะสินค้า
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--dx-text-secondary)" }}>
            <span style={{ color: "var(--dx-success)", fontWeight: 600 }}>{totalReturned} คืนสต็อก</span>
            <span style={{ color: "var(--dx-text-muted)", margin: "0 6px" }}>·</span>
            <span style={{ color: "var(--dx-danger)", fontWeight: 600 }}>{totalDamaged} ชำรุด</span>
            {totalLost > 0 && (
              <>
                <span style={{ color: "var(--dx-text-muted)", margin: "0 6px" }}>·</span>
                <span style={{ color: "#FFA573", fontWeight: 600 }}>{totalLost} สูญหาย</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 18 }}>
        {/* Form */}
        <div className="dx-card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            บันทึกเคลม
          </h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>วันที่เคลม</label>
              <input type="date" value={form.claimed_at} onChange={e => setForm({ ...form, claimed_at: e.target.value })} className="dx-input"/>
            </div>

            <div>
              <label style={labelStyle}>ตู้ที่เกิดปัญหา</label>
              <select value={form.machine_id} onChange={e => setForm({ ...form, machine_id: e.target.value })} className="dx-input">
                <option value="" disabled>— เลือกตู้ —</option>
                {myMachines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name} ({m.machine_id})</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({ ...form, sku_id: e.target.value })} className="dx-input">
                <option value="" disabled>— เลือกสินค้า —</option>
                {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>จำนวน (ซอง)</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="dx-input dx-mono" style={{ fontWeight: 700 }}/>
              </div>
              <div>
                <label style={labelStyle}>
                  ยอดคืนเงิน (฿)
                  {(form.product_status === "damaged" || form.product_status === "lost") && (
                    <span style={{ marginLeft: 6, fontSize: 9, color: "var(--dx-cyan-soft)", textTransform: "none", letterSpacing: 0 }}>
                      · auto: avg_cost × จำนวน
                    </span>
                  )}
                </label>
                <input type="number" min="0" step="0.01" value={form.refund_amount} onChange={e => setForm({ ...form, refund_amount: e.target.value })}
                  placeholder="0.00" className="dx-input dx-mono"/>
              </div>
            </div>

            <div>
              <label style={labelStyle}>สาเหตุ</label>
              <select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="dx-input">
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>สถานะสินค้า</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {STATUS_OPTIONS.map(opt => {
                  const isActive = form.product_status === opt.v
                  return (
                    <button key={opt.v} type="button" onClick={() => setForm({ ...form, product_status: opt.v })}
                      style={{
                        padding: 12, borderRadius: 10, textAlign: "left", cursor: "pointer",
                        fontFamily: "inherit",
                        background: isActive ? opt.accent.bg : "var(--dx-bg-input)",
                        border: `1px solid ${isActive ? opt.accent.border : "var(--dx-border)"}`,
                        boxShadow: isActive ? `0 0 0 3px ${opt.accent.bg}` : "none",
                        transition: "all .15s",
                      }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: isActive ? opt.accent.text : "var(--dx-text)" }}>
                        {opt.l}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label style={labelStyle}>หมายเหตุ</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" className="dx-input"/>
            </div>

            <button type="submit" disabled={saving}
              style={{
                width: "100%", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: "var(--dx-danger)", color: "#fff", border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "0 4px 16px -4px rgba(255,68,102,0.4)",
                transition: "all .15s",
              }}>
              {saving ? <Loader2 size={14} className="animate-spin"/> : <AlertTriangle size={14}/>}
              {saving ? "กำลังบันทึก..." : "บันทึกเคลม"}
            </button>
          </form>
        </div>

        {/* ประวัติเคลม */}
        <div className="dx-card" style={{ padding: 20, gridColumn: "span 1", minWidth: 0 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            ประวัติเคลม ({myClaims.length} รายการ)
          </h2>
          {myClaims.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "40px 0", fontSize: 13 }}>
              ยังไม่มีรายการเคลม
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                    <Th align="left">วันที่</Th>
                    <Th align="left">ตู้</Th>
                    <Th align="left">SKU</Th>
                    <Th align="right">จำนวน</Th>
                    <Th align="right">คืนเงิน</Th>
                    <Th align="center">สาเหตุ</Th>
                    <Th align="center">สถานะ</Th>
                    <Th align="center">ยืนยัน</Th>
                    <Th align="left">ผู้บันทึก</Th>
                    <Th/>
                  </tr>
                </thead>
                <tbody>
                  {myClaims.map(c => {
                    const m = machines.find(m => m.machine_id === c.machine_id)
                    const statusInfo = STATUS_OPTIONS.find(s => s.v === c.product_status) || STATUS_OPTIONS[0]
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                        <td className="dx-mono" style={{ padding: "10px 8px", fontSize: 11, color: "var(--dx-text-muted)" }}>{c.claimed_at}</td>
                        <td style={{ padding: "10px 8px", fontSize: 11, fontWeight: 500, color: "var(--dx-text)" }}>{m?.name || c.machine_id}</td>
                        <td className="dx-mono" style={{ padding: "10px 8px", fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{c.sku_id}</td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 11, color: "var(--dx-text-secondary)" }}>{c.quantity} ซอง</td>
                        <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--dx-danger)" }}>
                          {fmtB(c.refund_amount)}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 999,
                            background: "var(--dx-bg-elevated)", color: "var(--dx-text-secondary)",
                            border: "1px solid var(--dx-border)",
                          }}>{c.reason}</span>
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                            background: statusInfo.accent.bg, color: statusInfo.accent.text,
                            border: `1px solid ${statusInfo.accent.border}`,
                          }}>
                            {c.product_status === "returned" ? "คืนสต็อก" : c.product_status === "lost" ? "สูญหาย" : "ชำรุด"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          {c.confirm_status === "confirmed" ? (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--dx-success)" }}>ตัดสต็อกแล้ว</span>
                          ) : c.confirm_status === "pending" ? (
                            confirmId === c.id ? (
                              <div style={{ display: "inline-flex", gap: 4 }}>
                                <button onClick={() => handleConfirm(c)} disabled={confirming}
                                  style={{
                                    padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 6,
                                    background: "var(--dx-danger)", color: "#fff", border: "none",
                                    cursor: confirming ? "not-allowed" : "pointer",
                                    opacity: confirming ? 0.5 : 1,
                                  }}>
                                  {confirming ? "..." : "ยืนยันตัดสต็อก"}
                                </button>
                                <button onClick={() => setConfirmId(null)}
                                  style={{ fontSize: 10, color: "var(--dx-text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmId(c.id)}
                                style={{
                                  fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                                  background: "rgba(255,200,87,0.12)", color: "var(--dx-warning)",
                                  border: "1px solid rgba(255,200,87,0.3)",
                                  cursor: "pointer",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,200,87,0.2)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,200,87,0.12)"}>
                                รอยืนยัน
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 8px", fontSize: 10, color: "var(--dx-text-muted)", whiteSpace: "nowrap" }}>
                          {c.created_by || "—"}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right" }}>
                          {deleteId === c.id ? (
                            <div style={{ display: "inline-flex", gap: 6 }}>
                              <button onClick={() => handleDelete(c.id)}
                                style={{ fontSize: 10, fontWeight: 600, color: "var(--dx-danger)", background: "transparent", border: "none", cursor: "pointer" }}>
                                ลบ
                              </button>
                              <button onClick={() => setDeleteId(null)}
                                style={{ fontSize: 10, color: "var(--dx-text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteId(c.id)}
                              style={{
                                padding: 4, borderRadius: 4, border: "none", cursor: "pointer",
                                background: "transparent", color: "var(--dx-text-muted)",
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = "var(--dx-danger)"}
                              onMouseLeave={e => e.currentTarget.style.color = "var(--dx-text-muted)"}>
                              <Trash2 size={13}/>
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
      </div>
    </div>
  )
}

function StatCard({ label, value, accent, mono }) {
  return (
    <div className="dx-card" style={{ padding: 16 }}>
      <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </p>
      <p className={mono ? "dx-mono" : undefined} style={{
        margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: accent, lineHeight: 1.1,
      }}>
        {value}
      </p>
    </div>
  )
}

function Th({ children, align = "left", style }) {
  return (
    <th style={{
      padding: "8px 8px", textAlign: align,
      fontSize: 10, fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase",
      color: "var(--dx-text-muted)",
      ...style,
    }}>
      {children}
    </th>
  )
}
