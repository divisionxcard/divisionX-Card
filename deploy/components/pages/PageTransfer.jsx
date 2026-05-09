// PageTransfer — Dark Theme
import { useState } from "react"
import { X, CheckCircle, Send, Trash2, Loader2, Check, Ban, Inbox } from "lucide-react"
import { fmt, sortSkus } from "../shared/helpers"
import { SectionTitle } from "../shared/dx-components"

export default function PageTransfer({ stockIn, stockOut, stockBalance, skus, transfers, profiles, withdrawalRequests = [], onAddTransfer, onDeleteTransfer, onApproveRequest, onRejectRequest }) {
  const nowDate = () => new Date().toISOString().slice(0, 10)
  const nowTime = () => new Date().toTimeString().slice(0, 5)
  const [form, setForm] = useState({ sku_id: "", lot_number: "", to_user_id: "", unit: "box", quantity: "1", note: "", date: nowDate(), time: nowTime() })
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [historyFilter, setHistoryFilter] = useState("all")
  const [historyDateFrom, setHistoryDateFrom] = useState(nowDate())
  const [historyDateTo, setHistoryDateTo] = useState(nowDate())
  const [approvingId, setApprovingId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  // สต็อกหลัก = stock_in - transfers ออก - stock_out(เก่า)
  const mainBalMap = {}
  stockIn.forEach(r => { mainBalMap[r.sku_id] = (mainBalMap[r.sku_id] || 0) + (r.quantity_packs || 0) })
  transfers.forEach(r => { mainBalMap[r.sku_id] = (mainBalMap[r.sku_id] || 0) - (r.quantity_packs || 0) })
  stockOut.filter(r => !r.withdrawn_by_user_id).forEach(r => { mainBalMap[r.sku_id] = (mainBalMap[r.sku_id] || 0) - (r.quantity_packs || 0) })

  const available = mainBalMap[form.sku_id] || 0
  const selectedSku = skus.find(s => s.sku_id === form.sku_id)

  // Lot options (FIFO)
  const skuLots = (() => {
    if (!form.sku_id) return []
    const lotMap = {}
    stockIn.filter(r => r.sku_id === form.sku_id && r.lot_number).forEach(r => {
      if (!lotMap[r.lot_number]) lotMap[r.lot_number] = { ...r, quantity_packs: 0 }
      lotMap[r.lot_number].quantity_packs += r.quantity_packs || 0
    })
    const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at))
    const totalUsed = transfers.filter(t => t.sku_id === form.sku_id).reduce((a, t) => a + (t.quantity_packs || 0), 0)
      + stockOut.filter(so => so.sku_id === form.sku_id && !so.withdrawn_by_user_id).reduce((a, so) => a + (so.quantity_packs || 0), 0)
    let remainOut = totalUsed
    return lotsArr.map(r => {
      const used = Math.min(r.quantity_packs || 0, remainOut)
      remainOut -= used
      return { ...r, lotBalance: (r.quantity_packs || 0) - used }
    })
  })()

  const availableLots = skuLots.filter(r => r.lotBalance > 0)
  const selectedLot = skuLots.find(r => r.lot_number === form.lot_number)
  const withdrawQty = parseInt(form.quantity) || 0
  const withdrawPacks = form.unit === "box" ? withdrawQty * (selectedSku?.packs_per_box || 24) : withdrawQty
  const overStock = withdrawPacks > available
  const overLot = selectedLot && withdrawPacks > selectedLot.lotBalance

  const adminProfiles = profiles.filter(p => p.role === "admin" || p.role === "user")

  // ── Pending Withdrawal Requests ──
  const pendingRequests = (withdrawalRequests || [])
    .filter(r => r.status === "pending")
    .sort((a, b) => (a.requested_at || "").localeCompare(b.requested_at || ""))

  // FIFO lot finder ต่อ SKU
  const computeLotsForSku = (skuId) => {
    const lotMap = {}
    stockIn.filter(r => r.sku_id === skuId && r.lot_number).forEach(r => {
      if (!lotMap[r.lot_number]) lotMap[r.lot_number] = { ...r, quantity_packs: 0 }
      lotMap[r.lot_number].quantity_packs += r.quantity_packs || 0
    })
    const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at))
    const totalUsed = transfers.filter(t => t.sku_id === skuId).reduce((a, t) => a + (t.quantity_packs || 0), 0)
      + stockOut.filter(so => so.sku_id === skuId && !so.withdrawn_by_user_id).reduce((a, so) => a + (so.quantity_packs || 0), 0)
    let remainOut = totalUsed
    return lotsArr.map(r => {
      const used = Math.min(r.quantity_packs || 0, remainOut)
      remainOut -= used
      return { ...r, lotBalance: (r.quantity_packs || 0) - used }
    })
  }

  const pickFifoLotForRequest = (req) => {
    const lots = computeLotsForSku(req.sku_id).filter(l => l.lotBalance > 0)
    return lots.find(l => l.lotBalance >= req.quantity_packs) || null
  }

  const handleApprove = async (req) => {
    if (!onApproveRequest) return
    const main = mainBalMap[req.sku_id] || 0
    if (req.quantity_packs > main) {
      showToast(`สต็อกหลัก ${req.sku_id} ไม่พอ (เหลือ ${fmt(main)} ซอง)`, "error")
      return
    }
    const lot = pickFifoLotForRequest(req)
    setApprovingId(req.id)
    try {
      await onApproveRequest(req.id, lot?.lot_number || null)
      showToast(`อนุมัติสำเร็จ: ${req.sku_id} ${fmt(req.quantity_packs)} ซอง`)
    } catch (err) {
      showToast("อนุมัติไม่สำเร็จ: " + err.message, "error")
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (req) => {
    if (!onRejectRequest) return
    setRejectingId(req.id)
    try {
      await onRejectRequest(req.id)
      showToast(`ปฏิเสธคำขอ ${req.sku_id} แล้ว`)
    } catch (err) {
      showToast("ปฏิเสธไม่สำเร็จ: " + err.message, "error")
    } finally {
      setRejectingId(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.sku_id) { showToast("กรุณาเลือกสินค้า", "error"); return }
    if (!form.to_user_id) { showToast("กรุณาเลือกแอดมินปลายทาง", "error"); return }
    if (!withdrawQty || withdrawQty <= 0) { showToast("กรุณาระบุจำนวน", "error"); return }
    if (overStock) { showToast(`สต็อกหลักไม่เพียงพอ: คงเหลือ ${fmt(available)} ซอง`, "error"); return }
    if (overLot) { showToast(`เกินสต็อก Lot: คงเหลือ ${fmt(selectedLot.lotBalance)} ซอง`, "error"); return }
    if (availableLots.length > 0 && !form.lot_number) { showToast("กรุณาเลือก Lot", "error"); return }
    try {
      setSaving(true)
      const toAdmin = adminProfiles.find(p => p.id === form.to_user_id)
      await onAddTransfer({
        sku_id: form.sku_id,
        lot_number: form.lot_number || null,
        to_user_id: form.to_user_id,
        unit: form.unit,
        quantity: withdrawQty,
        quantity_packs: withdrawPacks,
        transferred_at: `${form.date}T${form.time}:00`,
        note: form.note
          ? `[${form.unit === "box" ? withdrawQty + "กล่อง" : withdrawQty + "ซอง"}] ${form.note}`
          : `[${form.unit === "box" ? withdrawQty + "กล่อง" : withdrawQty + "ซอง"}]`,
      })
      showToast(`แจกจ่ายสำเร็จ: ${form.sku_id} → ${toAdmin?.display_name || "?"} ${fmt(withdrawPacks)} ซอง`)
      setForm(f => ({ ...f, sku_id: "", lot_number: "", quantity: "1", note: "" }))
    } catch (err) { showToast("เกิดข้อผิดพลาด: " + err.message, "error") }
    finally { setSaving(false) }
  }

  const filteredTransfers = transfers.filter(t => {
    const d = (t.transferred_at || t.created_at || "").slice(0, 10)
    if (historyFilter === "date") return d >= historyDateFrom && d <= historyDateTo
    return true
  }).sort((a, b) => (b.transferred_at || "").localeCompare(a.transferred_at || ""))

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && <Toast toast={toast}/>}

      <SectionTitle
        pill="Distribute · Admin Only"
        title="แจกจ่ายสินค้า"
        subtitle="เบิกจากสต็อกหลัก แจกจ่ายให้แอดมินแต่ละคนเพื่อนำไปเติมตู้"
      />

      {/* คำขอที่รออนุมัติ */}
      {pendingRequests.length > 0 && (
        <div className="dx-card" style={{
          padding: 20,
          border: "1px solid rgba(255,193,7,0.35)",
          background: "linear-gradient(180deg, rgba(255,193,7,0.04) 0%, var(--dx-bg-card) 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Inbox size={16} style={{ color: "var(--dx-warning)" }}/>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>
                คำขอเบิกที่รออนุมัติ
              </h2>
              <span style={{
                padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: "rgba(255,193,7,0.15)", color: "var(--dx-warning)",
                border: "1px solid rgba(255,193,7,0.3)",
              }}>
                {pendingRequests.length}
              </span>
            </div>
            <span style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>
              ระบบเลือก Lot อัตโนมัติแบบ FIFO ตอนกดยืนยัน
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                  <ReqTh align="left">เวลา</ReqTh>
                  <ReqTh align="left">ผู้ขอ</ReqTh>
                  <ReqTh align="left">SKU</ReqTh>
                  <ReqTh align="right">จำนวน</ReqTh>
                  <ReqTh align="right">= ซอง</ReqTh>
                  <ReqTh align="right">สต็อกหลัก</ReqTh>
                  <ReqTh align="left">Lot ที่จะใช้</ReqTh>
                  <ReqTh align="center">สถานะ</ReqTh>
                  <ReqTh align="center" style={{ width: 160 }}>จัดการ</ReqTh>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map(req => {
                  const requester = profiles.find(p => p.id === req.requester_id)
                  const main = mainBalMap[req.sku_id] || 0
                  const enough = main >= req.quantity_packs
                  const fifoLot = pickFifoLotForRequest(req)
                  const isApproving = approvingId === req.id
                  const isRejecting = rejectingId === req.id
                  return (
                    <tr key={req.id} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                      <ReqTd muted mono>{(req.requested_at || "").slice(5, 16).replace("T", " ")}</ReqTd>
                      <ReqTd>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#B794F6" }}>
                          {requester?.display_name || requester?.username || "?"}
                        </span>
                      </ReqTd>
                      <ReqTd>
                        <span className="dx-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--dx-text)" }}>
                          {req.sku_id}
                        </span>
                      </ReqTd>
                      <ReqTd align="right">
                        <span className="dx-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--dx-text)" }}>
                          {fmt(req.quantity)} {req.unit === "cotton" ? "ลัง" : "กล่อง"}
                        </span>
                      </ReqTd>
                      <ReqTd align="right" mono style={{ color: "var(--dx-text)" }}>
                        {fmt(req.quantity_packs)}
                      </ReqTd>
                      <ReqTd align="right">
                        <span className="dx-mono" style={{
                          fontSize: 11, fontWeight: 600,
                          color: enough ? "var(--dx-success)" : "var(--dx-danger)",
                        }}>
                          {fmt(main)}
                        </span>
                      </ReqTd>
                      <ReqTd>
                        {fifoLot ? (
                          <span className="dx-mono" style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 4,
                            background: "rgba(0,212,255,0.08)", color: "var(--dx-cyan-soft)",
                            border: "1px solid rgba(0,212,255,0.15)",
                          }}>
                            {fifoLot.lot_number}
                          </span>
                        ) : enough ? (
                          <span style={{ fontSize: 10, color: "var(--dx-warning)" }}>ข้าม Lot (ไม่มี Lot เดี่ยวพอ)</span>
                        ) : (
                          <span style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>-</span>
                        )}
                      </ReqTd>
                      <ReqTd align="center">
                        <span style={{
                          padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600,
                          background: enough ? "rgba(0,255,136,0.12)" : "rgba(255,68,102,0.12)",
                          color: enough ? "var(--dx-success)" : "var(--dx-danger)",
                          border: `1px solid ${enough ? "rgba(0,255,136,0.3)" : "rgba(255,68,102,0.3)"}`,
                        }}>
                          {enough ? "พอ" : "ไม่พอ"}
                        </span>
                      </ReqTd>
                      <ReqTd align="center">
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            onClick={() => handleApprove(req)}
                            disabled={!enough || isApproving || isRejecting}
                            title="ยืนยันการเบิก"
                            style={{
                              padding: "5px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
                              background: enough ? "var(--dx-success)" : "var(--dx-bg-page)",
                              color: enough ? "#000" : "var(--dx-text-muted)",
                              cursor: enough && !isApproving ? "pointer" : "not-allowed",
                              display: "inline-flex", alignItems: "center", gap: 4,
                              opacity: !enough ? 0.5 : 1,
                            }}>
                            {isApproving ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>}
                            ยืนยัน
                          </button>
                          <button
                            onClick={() => handleReject(req)}
                            disabled={isApproving || isRejecting}
                            title="ปฏิเสธคำขอ"
                            style={{
                              padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dx-border)", fontSize: 11,
                              background: "transparent", color: "var(--dx-danger)",
                              cursor: !isRejecting ? "pointer" : "not-allowed",
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}>
                            {isRejecting ? <Loader2 size={11} className="animate-spin"/> : <Ban size={11}/>}
                            ปฏิเสธ
                          </button>
                        </div>
                      </ReqTd>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
        {/* Form */}
        <div className="dx-card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            บันทึกการแจกจ่าย
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 11, color: "var(--dx-text-muted)" }}>
            เลือกสินค้าจากสต็อกหลัก แจกจ่ายให้แอดมินที่รับผิดชอบ
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({ ...form, sku_id: e.target.value, lot_number: "" })} className="dx-input">
                <option value="" disabled>-- เลือกสินค้า --</option>
                {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} -- {s.name}</option>)}
              </select>
            </div>

            {skuLots.length > 0 && (
              <div>
                <label style={labelStyle}>
                  เลือก Lot <span style={{ color: "var(--dx-danger)" }}>*</span>
                  <span style={{ marginLeft: 6, textTransform: "none", letterSpacing: 0, fontSize: 10, opacity: 0.7 }}>
                    ({availableLots.length}/{skuLots.length} Lot มีสต็อก)
                  </span>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 192, overflowY: "auto" }}>
                  {skuLots.map(lot => {
                    const isSelected = form.lot_number === lot.lot_number
                    const depleted = lot.lotBalance <= 0
                    return (
                      <button type="button" key={lot.lot_number} disabled={depleted}
                        onClick={() => setForm({ ...form, lot_number: isSelected ? "" : lot.lot_number })}
                        style={{
                          width: "100%", padding: 12, borderRadius: 12, textAlign: "left",
                          cursor: depleted ? "not-allowed" : "pointer", fontFamily: "inherit",
                          background: isSelected
                            ? "linear-gradient(180deg, rgba(0,212,255,0.12) 0%, rgba(0,212,255,0.04) 100%)"
                            : "var(--dx-bg-input)",
                          border: `1px solid ${isSelected ? "var(--dx-cyan)" : "var(--dx-border)"}`,
                          boxShadow: isSelected ? "0 0 0 3px rgba(0,212,255,0.1)" : "none",
                          opacity: depleted ? 0.4 : 1,
                          transition: "all .15s",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span className="dx-mono" style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                            background: isSelected ? "rgba(0,212,255,0.15)" : "rgba(0,212,255,0.08)",
                            color: isSelected ? "var(--dx-cyan-bright)" : "var(--dx-cyan-soft)",
                          }}>
                            {lot.lot_number}
                          </span>
                          <span className="dx-mono" style={{
                            fontSize: 13, fontWeight: 700,
                            color: depleted ? "var(--dx-text-muted)" : "var(--dx-success)",
                          }}>
                            {fmt(lot.lotBalance)} ซอง
                          </span>
                        </div>
                        {lot.quantity_packs > 0 && (
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 3, background: "var(--dx-bg-page)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{
                                height: "100%",
                                width: `${Math.max(0, (lot.lotBalance / lot.quantity_packs) * 100)}%`,
                                background: isSelected
                                  ? "linear-gradient(90deg, var(--dx-cyan), var(--dx-cyan-bright))"
                                  : "var(--dx-success)",
                                boxShadow: isSelected ? "0 0 6px var(--dx-glow)" : "none",
                              }}/>
                            </div>
                            <span className="dx-mono" style={{ fontSize: 9, color: "var(--dx-text-muted)" }}>
                              {fmt(lot.lotBalance)}/{fmt(lot.quantity_packs)}
                            </span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {form.sku_id && (
              <div style={{
                padding: 12, borderRadius: 10,
                background: available < 24
                  ? "linear-gradient(180deg, rgba(255,200,87,0.08) 0%, transparent 100%)"
                  : "linear-gradient(180deg, rgba(0,255,136,0.08) 0%, transparent 100%)",
                border: `1px solid ${available < 24 ? "rgba(255,200,87,0.2)" : "rgba(0,255,136,0.2)"}`,
              }}>
                <p style={{ margin: 0, fontSize: 10, color: available < 24 ? "var(--dx-warning)" : "var(--dx-success)", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  สต็อกหลักคงเหลือ
                </p>
                <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: available < 24 ? "var(--dx-warning)" : "var(--dx-success)" }}>
                  {fmt(available)} <span style={{ fontSize: 11, fontWeight: 500, color: "var(--dx-text-muted)" }}>ซอง</span>
                </p>
              </div>
            )}

            <div>
              <label style={labelStyle}>แจกจ่ายให้</label>
              <select value={form.to_user_id} onChange={e => setForm({ ...form, to_user_id: e.target.value })} className="dx-input">
                <option value="" disabled>-- เลือกแอดมิน --</option>
                {adminProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.username || p.email}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>หน่วย</label>
                <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--dx-bg-input)", borderRadius: 10, border: "1px solid var(--dx-border)" }}>
                  {[{ v: "box", l: "กล่อง" }, { v: "pack", l: "ซอง" }].map(u => {
                    const isActive = form.unit === u.v
                    return (
                      <button key={u.v} type="button" onClick={() => setForm({ ...form, unit: u.v })}
                        style={{
                          flex: 1, padding: "6px", borderRadius: 6,
                          fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
                          fontFamily: "inherit",
                          background: isActive ? "rgba(0,212,255,0.15)" : "transparent",
                          color: isActive ? "var(--dx-cyan-bright)" : "var(--dx-text-muted)",
                          transition: "all .15s",
                        }}>
                        {u.l}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>จำนวน</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="dx-input dx-mono" style={{ fontWeight: 700 }}/>
              </div>
            </div>

            {withdrawPacks > 0 && (
              <p className="dx-mono" style={{
                margin: 0, fontSize: 11,
                color: (overStock || overLot) ? "var(--dx-danger)" : "var(--dx-text-muted)",
                fontWeight: (overStock || overLot) ? 600 : 400,
              }}>
                = {fmt(withdrawPacks)} ซอง {overStock ? "(เกินสต็อกหลัก!)" : overLot ? "(เกินสต็อก Lot!)" : ""}
              </p>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>วันที่</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="dx-input"/>
              </div>
              <div>
                <label style={labelStyle}>เวลา</label>
                <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="dx-input"/>
              </div>
            </div>

            <div>
              <label style={labelStyle}>หมายเหตุ</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="ไม่บังคับ" className="dx-input"/>
            </div>

            <button type="submit" disabled={saving || overStock || overLot}
              className="dx-btn dx-btn-primary"
              style={{
                width: "100%", padding: 12, fontSize: 13, justifyContent: "center",
                opacity: (saving || overStock || overLot) ? 0.5 : 1,
                cursor: (saving || overStock || overLot) ? "not-allowed" : "pointer",
              }}>
              {saving ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}
              {saving ? "กำลังบันทึก..." : "แจกจ่ายสินค้า"}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="dx-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
              ประวัติแจกจ่าย ({filteredTransfers.length})
            </h2>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ v: "all", l: "ทั้งหมด" }, { v: "date", l: "เลือกวัน" }].map(f => (
                <button key={f.v} onClick={() => setHistoryFilter(f.v)}
                  className={`dx-chip ${historyFilter === f.v ? "dx-chip-active" : ""}`}
                  style={{ padding: "5px 10px", fontSize: 11 }}>
                  {f.l}
                </button>
              ))}
            </div>
          </div>

          {historyFilter === "date" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input type="date" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)}
                className="dx-input" style={{ flex: 1, padding: "6px 10px", fontSize: 11 }}/>
              <span style={{ fontSize: 10, color: "var(--dx-text-muted)", alignSelf: "center" }}>ถึง</span>
              <input type="date" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)}
                className="dx-input" style={{ flex: 1, padding: "6px 10px", fontSize: 11 }}/>
            </div>
          )}

          {filteredTransfers.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "40px 0", fontSize: 13 }}>
              ยังไม่มีประวัติแจกจ่าย
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 600, overflowY: "auto" }}>
              {filteredTransfers.map(t => {
                const toAdmin = profiles.find(p => p.id === t.to_user_id)
                return (
                  <div key={t.id} style={{
                    padding: 12, borderRadius: 10,
                    background: "var(--dx-bg-input)",
                    border: "1px solid var(--dx-border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <span className="dx-mono" style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: "rgba(0,212,255,0.08)", color: "var(--dx-cyan-soft)",
                          border: "1px solid rgba(0,212,255,0.15)",
                        }}>{t.sku_id}</span>
                        {t.lot_number && (
                          <span className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)", marginLeft: 8 }}>
                            {t.lot_number}
                          </span>
                        )}
                      </div>
                      <span className="dx-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>
                        {fmt(t.quantity_packs)} ซอง
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, flexWrap: "wrap", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>
                        → <span style={{ fontWeight: 600, color: "#B794F6" }}>{toAdmin?.display_name || "?"}</span>
                        <span className="dx-mono" style={{ marginLeft: 8, color: "var(--dx-text-muted)" }}>
                          {(t.transferred_at || t.created_at || "").slice(0, 10)}
                        </span>
                        {t.created_by && (
                          <span style={{ marginLeft: 8, color: "var(--dx-text-muted)" }}>
                            · โดย <span style={{ color: "var(--dx-cyan-soft)" }}>{t.created_by}</span>
                          </span>
                        )}
                      </span>
                      {deleteId === t.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={async () => {
                            try { await onDeleteTransfer(t.id); setDeleteId(null); showToast("ลบสำเร็จ") }
                            catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
                          }}
                            style={{
                              fontSize: 11, fontWeight: 600, color: "var(--dx-danger)",
                              background: "transparent", border: "none", cursor: "pointer",
                            }}>ลบ</button>
                          <button onClick={() => setDeleteId(null)}
                            style={{
                              fontSize: 11, color: "var(--dx-text-muted)",
                              background: "transparent", border: "none", cursor: "pointer",
                            }}>ยกเลิก</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteId(t.id)} title="ลบ"
                          style={{
                            padding: 4, borderRadius: 4, border: "none", cursor: "pointer",
                            background: "transparent", color: "var(--dx-text-muted)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--dx-danger)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--dx-text-muted)"}>
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                    {t.note && (
                      <p style={{ margin: "6px 0 0", fontSize: 10, color: "var(--dx-text-muted)", fontStyle: "italic" }}>
                        {t.note}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReqTh({ children, align = "left", style }) {
  return (
    <th style={{
      padding: "8px 10px", textAlign: align,
      fontSize: 10, fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase",
      color: "var(--dx-text-muted)",
      ...style,
    }}>{children}</th>
  )
}

function ReqTd({ children, align = "left", muted, mono, style }) {
  return (
    <td className={mono ? "dx-mono" : undefined} style={{
      padding: "9px 10px", textAlign: align, fontSize: 11,
      color: muted ? "var(--dx-text-muted)" : "var(--dx-text-secondary)",
      ...style,
    }}>{children}</td>
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
