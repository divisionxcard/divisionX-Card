// PageClaims — Dark Theme
import { useState, useEffect, Fragment } from "react"
import { CheckCircle, AlertTriangle, Trash2, Loader2 } from "lucide-react"
import { fmtB, sortSkus } from "../shared/helpers"
import { SectionTitle } from "../shared/dx-components"
import ShipFailsSection from "./ShipFailsSection"

const STATUS_OPTIONS = [
  { v: "returned", l: "คืนสต็อก", desc: "สภาพดี / ไม่ได้หยิบ — คืนเข้าสต็อก",  accent: { text: "var(--dx-success)", bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.35)" } },
  { v: "damaged",  l: "ชำรุด",    desc: "เสียหาย ขายต่อไม่ได้",                accent: { text: "var(--dx-danger)",  bg: "rgba(255,68,102,0.08)", border: "rgba(255,68,102,0.35)" } },
  { v: "lost",     l: "สูญหาย",   desc: "ตู้ปล่อยเกิน ไม่ได้คืน",               accent: { text: "#FFA573",            bg: "rgba(255,165,115,0.08)", border: "rgba(255,165,115,0.35)" } },
]

const REASONS = ["สินค้าไม่ตก", "ตกผิดช่อง", "ตู้ปล่อยเกิน", "เครื่องค้าง", "สินค้าชำรุด", "ลืมหยิบของไป", "อื่นๆ"]

export default function PageClaims({ machines, skus, claims, onAddClaim, onConfirmClaim, onDeleteClaim, machineAssignments, session, profile }) {
  const userId = session?.user?.id
  const isAdmin = profile?.role === "admin"
  const myAssignments = (machineAssignments || []).filter(a => a.user_id === userId && a.is_active)
  const hasAssignment = myAssignments.length > 0
  const myMachines = hasAssignment ? machines.filter(m => myAssignments.some(a => a.machine_id === m.machine_id)) : machines
  // Admin → เห็นทุกเคลม · User → เฉพาะเคลมของตัวเอง (managed_by_user_id)
  const myClaims = isAdmin
    ? claims
    : claims.filter(c => c.managed_by_user_id === userId)

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
  const [confirmError, setConfirmError] = useState(null) // { id, msg } · inline error ใต้แถวเคลม
  const [tab, setTab] = useState("claims")  // claims | shipfails

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.machine_id) { showToast("กรุณาเลือกตู้", "error"); return }
    if (!form.sku_id) { showToast("กรุณาเลือกสินค้า", "error"); return }
    // refund > 0 บังคับเฉพาะ damaged (สินค้าชำรุดที่ต้องคืนเงินลูกค้า)
    // returned (คืนสต็อก / ไม่ได้หยิบ) + lost (สูญหาย) → 0 ได้
    if (form.product_status === "damaged" && (!form.refund_amount || parseFloat(form.refund_amount) <= 0)) { showToast("กรุณาระบุยอดคืนเงิน", "error"); return }
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
      setConfirmError(null)
      await onConfirmClaim(claim)
      setConfirmId(null)
      showToast(`ยืนยันเคลมสำเร็จ: ${claim.sku_id} ${claim.quantity} ซอง`)
    } catch (err) {
      setConfirmError({ id: claim.id, msg: err.message })
      setConfirmId(null)
      setTimeout(() => setConfirmError(prev => prev?.id === claim.id ? null : prev), 6000)
    }
    finally { setConfirming(false) }
  }

  const totalRefund = myClaims.reduce((a, r) => a + (parseFloat(r.refund_amount) || 0), 0)
  const totalReturned = myClaims.filter(r => r.product_status === "returned").length
  const totalDamaged = myClaims.filter(r => r.product_status === "damaged").length
  const totalLost = myClaims.filter(r => r.product_status === "lost").length

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle pill="Claims · Refunds" title="เคลม / คืนเงิน" subtitle="บันทึกรายการเคลม · คืนสต็อก · ตัดชำรุด · สูญหาย · Ship Fail จาก WW"/>

      {/* Tab switch */}
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--dx-border)", paddingBottom: 0 }}>
        {[
          { v: "claims", l: "เคลม / คืนเงิน" },
          ...(isAdmin ? [{ v: "shipfails", l: "Ship Fail (WW)" }] : []),
        ].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            style={{
              padding: "10px 16px", fontSize: 12, fontWeight: 600,
              background: "transparent", border: "none", cursor: "pointer",
              color: tab === t.v ? "var(--dx-cyan-bright)" : "var(--dx-text-muted)",
              borderBottom: `2px solid ${tab === t.v ? "var(--dx-cyan-bright)" : "transparent"}`,
              marginBottom: -1,
            }}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "shipfails" && isAdmin && <ShipFailsSection session={session}/>}

      {tab === "claims" && (
      <>
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
                    {isAdmin && <Th/>}
                  </tr>
                </thead>
                <tbody>
                  {myClaims.map(c => {
                    const m = machines.find(m => m.machine_id === c.machine_id)
                    const statusInfo = STATUS_OPTIONS.find(s => s.v === c.product_status) || STATUS_OPTIONS[0]
                    const showError = confirmError?.id === c.id
                    return (
                      <Fragment key={c.id}>
                      <tr style={{ borderBottom: showError ? "none" : "1px solid var(--dx-border)" }}>
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
                            isAdmin ? (
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
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                                background: "rgba(255,200,87,0.12)", color: "var(--dx-warning)",
                                border: "1px solid rgba(255,200,87,0.3)",
                              }}>รอ admin ยืนยัน</span>
                            )
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 8px", fontSize: 10, color: "var(--dx-text-muted)", whiteSpace: "nowrap" }}>
                          {c.created_by || "—"}
                        </td>
                        {isAdmin && (
                          <td style={{ padding: "10px 8px", textAlign: "right" }}>
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
                          </td>
                        )}
                      </tr>
                      {showError && (
                        <tr style={{ borderBottom: "1px solid var(--dx-border)" }}>
                          <td colSpan={isAdmin ? 10 : 9} style={{ padding: "0 8px 10px" }}>
                            <div style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "8px 12px", borderRadius: 8,
                              background: "rgba(255,68,102,0.08)",
                              border: "1px solid rgba(255,68,102,0.3)",
                              fontSize: 11, color: "var(--dx-danger)",
                            }}>
                              <AlertTriangle size={14} style={{ flexShrink: 0 }}/>
                              <span>ยืนยันไม่สำเร็จ: {confirmError.msg}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      </>
      )}

      {deleteId && (() => {
        const claim = myClaims.find(c => c.id === deleteId)
        if (!claim) return null
        const m = machines.find(mm => mm.machine_id === claim.machine_id)
        const willRevertStock = claim.confirm_status === "confirmed"
        const revertDirection = claim.product_status === "returned"
          ? "ลด" // returned: ตอน confirm = user pocket +N · ตอน revert = -N
          : "เพิ่ม" // damaged/lost: ตอน confirm = user pocket -N · ตอน revert = +N
        const statusLabel = claim.product_status === "returned" ? "คืนสต็อก" : claim.product_status === "lost" ? "สูญหาย" : "ชำรุด"
        const confirmLabel = claim.confirm_status === "confirmed" ? "ยืนยันแล้ว (ตัดสต็อก)" : claim.confirm_status === "pending" ? "รอยืนยัน" : "—"
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }} onClick={() => setDeleteId(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "var(--dx-bg-card)", borderRadius: 16,
              width: "100%", maxWidth: 440,
              border: "1px solid var(--dx-border-glow)",
              boxShadow: "0 30px 60px -10px rgba(0,0,0,0.7), 0 0 40px -10px var(--dx-glow)",
              fontFamily: "var(--dx-font)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, borderBottom: "1px solid var(--dx-border)" }}>
                <AlertTriangle size={18} style={{ color: "var(--dx-danger)" }}/>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--dx-text)" }}>
                  ยืนยันลบเคลม
                </h2>
              </div>

              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 12, color: "var(--dx-text-secondary)" }}>
                  ลบเคลมต่อไปนี้ออกจากระบบ? <strong style={{ color: "var(--dx-danger)" }}>การกระทำนี้ย้อนกลับไม่ได้</strong>
                </p>

                <div style={{ display: "grid", gap: 6, padding: 12, background: "var(--dx-bg-elevated)", borderRadius: 10, fontSize: 12 }}>
                  <Row label="วันที่" value={claim.claimed_at}/>
                  <Row label="ตู้" value={m?.name || claim.machine_id}/>
                  <Row label="สินค้า" value={`${claim.sku_id} · ${claim.quantity} ซอง`}/>
                  <Row label="สถานะสินค้า" value={statusLabel}/>
                  <Row label="ยอดคืนเงิน" value={fmtB(claim.refund_amount)}/>
                  <Row label="การยืนยัน" value={confirmLabel}/>
                </div>

                {willRevertStock && (
                  <div style={{
                    display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10,
                    background: "rgba(255,200,87,0.08)", border: "1px solid rgba(255,200,87,0.3)",
                    fontSize: 11, color: "var(--dx-warning)",
                  }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
                    <span>
                      เคลมนี้ยืนยันแล้ว · ระบบจะ revert side-effect · สต็อกของผู้รับจะ <strong>{revertDirection === "ลด" ? "-" : "+"}{claim.quantity} ซอง</strong> กลับมาเท่าก่อนยืนยัน
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, padding: 16, borderTop: "1px solid var(--dx-border)", justifyContent: "flex-end" }}>
                <button onClick={() => setDeleteId(null)}
                  style={{
                    padding: "8px 18px", fontSize: 12, fontWeight: 500, borderRadius: 8,
                    background: "transparent", color: "var(--dx-text)",
                    border: "1px solid var(--dx-border)", cursor: "pointer",
                  }}>
                  ยกเลิก
                </button>
                <button onClick={() => handleDelete(claim.id)}
                  style={{
                    padding: "8px 18px", fontSize: 12, fontWeight: 600, borderRadius: 8,
                    background: "var(--dx-danger)", color: "#fff",
                    border: "none", cursor: "pointer",
                  }}>
                  ลบเคลม
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span style={{ color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ color: "var(--dx-text)", fontWeight: 500 }}>{value}</span>
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
