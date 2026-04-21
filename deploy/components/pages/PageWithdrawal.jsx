// PageWithdrawal — Dark Theme
import { useState } from "react"
import { X, CheckCircle, Clock, Loader2, ArrowUpCircle, Trash2, AlertTriangle } from "lucide-react"
import { fmt, sortSkus, sortByDateThenSku } from "../shared/helpers"
import { Badge, SectionTitle } from "../shared/dx-components"

export default function PageWithdrawal({ machines, stockOut, stockIn, stockBalance, onAddStockOut, onDeleteStockOut, skus, transfers, machineAssignments, session, profile }) {
  const nowDate = () => new Date().toISOString().slice(0, 10)
  const nowTime = () => new Date().toTimeString().slice(0, 5)
  const [form, setForm] = useState({ sku_id: "", lot_number: "", machine_id: "", unit: "box", quantity: "1", note: "", date: nowDate(), time: nowTime() })
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  const userId = session?.user?.id
  const myAssignments = (machineAssignments || []).filter(a => a.user_id === userId && a.is_active)
  const hasAssignment = myAssignments.length > 0
  const myMachines = hasAssignment ? machines.filter(m => myAssignments.some(a => a.machine_id === m.machine_id)) : machines

  const myTransfers = (transfers || []).filter(t => t.to_user_id === userId)
  const myStockOutForBalance = hasAssignment ? stockOut.filter(so => so.withdrawn_by_user_id === userId) : []
  const useSubStock = hasAssignment && myTransfers.length > 0

  const [deleteOutId, setDeleteOutId] = useState(null)
  const [deletingOut, setDeletingOut] = useState(false)
  const [historyFilter, setHistoryFilter] = useState("all")
  const [historyDateFrom, setHistoryDateFrom] = useState(nowDate())
  const [historyDateTo, setHistoryDateTo] = useState(nowDate())
  const [historyMonth, setHistoryMonth] = useState(nowDate().slice(0, 7))
  const [historyYear, setHistoryYear] = useState(nowDate().slice(0, 4))
  const [historySku, setHistorySku] = useState("")

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  const handleDeleteOut = async (id) => {
    setDeletingOut(true)
    try {
      await onDeleteStockOut(id)
      setDeleteOutId(null)
      showToast("ลบรายการเบิกสำเร็จ")
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
    finally { setDeletingOut(false) }
  }

  const machineId = form.machine_id || myMachines[0]?.machine_id || ""
  const selectedSku = skus.find(s => s.sku_id === form.sku_id)

  const available = (() => {
    if (!form.sku_id) return 0
    if (useSubStock) {
      const received = myTransfers.filter(t => t.sku_id === form.sku_id).reduce((a, t) => a + (t.quantity_packs || 0), 0)
      const used = myStockOutForBalance.filter(so => so.sku_id === form.sku_id).reduce((a, so) => a + (so.quantity_packs || 0), 0)
      return received - used
    }
    const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, parseFloat(r.balance) || 0]))
    return balMap[form.sku_id] || 0
  })()
  const availBoxes = selectedSku ? Math.floor(available / selectedSku.packs_per_box) : 0

  // Lot options (FIFO)
  const skuLots = (() => {
    if (!form.sku_id) return []
    const lotMap = {}
    if (useSubStock) {
      myTransfers.filter(t => t.sku_id === form.sku_id && t.lot_number).forEach(t => {
        if (!lotMap[t.lot_number]) lotMap[t.lot_number] = { lot_number: t.lot_number, quantity_packs: 0, purchased_at: t.transferred_at }
        lotMap[t.lot_number].quantity_packs += t.quantity_packs || 0
      })
      const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at))
      const skuTotalOut = myStockOutForBalance.filter(so => so.sku_id === form.sku_id).reduce((a, so) => a + (so.quantity_packs || 0), 0)
      let remainOut = skuTotalOut
      return lotsArr.map(r => {
        const used = Math.min(r.quantity_packs || 0, remainOut)
        remainOut -= used
        return { ...r, lotBalance: r.quantity_packs - used }
      })
    } else {
      stockIn.filter(r => r.sku_id === form.sku_id && r.lot_number).forEach(r => {
        if (!lotMap[r.lot_number]) lotMap[r.lot_number] = { ...r, quantity_packs: 0, total_cost: 0 }
        lotMap[r.lot_number].quantity_packs += r.quantity_packs || 0
        lotMap[r.lot_number].total_cost += parseFloat(r.total_cost) || 0
      })
      const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at))
      const skuTotalOut = stockOut.filter(so => so.sku_id === form.sku_id).reduce((a, so) => a + (so.quantity_packs || 0), 0)
      let remainOut = skuTotalOut
      return lotsArr.map(r => {
        const usedFromLot = Math.min(r.quantity_packs || 0, remainOut)
        remainOut -= usedFromLot
        return { ...r, lotBalance: (r.quantity_packs || 0) - usedFromLot }
      })
    }
  })()

  const availableLots = skuLots.filter(r => r.lotBalance > 0)
  const selectedLot = skuLots.find(r => r.lot_number === form.lot_number)
  const withdrawQty = parseInt(form.quantity) || 0
  const withdrawPacks = form.unit === "box" ? withdrawQty * (selectedSku?.packs_per_box || 24) : withdrawQty
  const overStock = withdrawPacks > available
  const overLot = selectedLot && withdrawPacks > selectedLot.lotBalance

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.sku_id) { showToast("กรุณาเลือกสินค้า", "error"); return }
    if (!withdrawQty || withdrawQty <= 0) { showToast("กรุณาระบุจำนวนที่ถูกต้อง", "error"); return }
    if (!machineId) { showToast("กรุณาเลือกตู้ปลายทาง", "error"); return }
    if (overStock) { showToast(`สต็อกไม่เพียงพอ: คงเหลือ ${available} ซอง`, "error"); return }
    if (overLot) { showToast(`เกินสต็อก Lot นี้: คงเหลือ ${fmt(selectedLot.lotBalance)} ซอง`, "error"); return }
    if (availableLots.length > 0 && !form.lot_number) { showToast("กรุณาเลือก Lot ที่จะเบิก", "error"); return }
    try {
      setSaving(true)
      const machine = machines.find(m => m.machine_id === machineId)
      await onAddStockOut({
        sku_id: form.sku_id,
        lot_number: form.lot_number || null,
        machine_id: machineId,
        quantity_packs: withdrawPacks,
        withdrawn_at: `${form.date}T${form.time}:00`,
        note: form.note
          ? `[${form.unit === "box" ? withdrawQty + "กล่อง" : withdrawQty + "ซอง"}] ${form.note}`
          : `[${form.unit === "box" ? withdrawQty + "กล่อง" : withdrawQty + "ซอง"}]`,
      })
      showToast(`เบิกสำเร็จ: ${form.sku_id}${form.lot_number ? ` (${form.lot_number})` : ""} → ${machine?.name ?? machineId} ${fmt(withdrawPacks)} ซอง`)
      setForm(f => ({ ...f, sku_id: "", lot_number: "", quantity: "1", note: "" }))
    } catch (err) { showToast("เกิดข้อผิดพลาด: " + err.message, "error") }
    finally { setSaving(false) }
  }

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && <Toast toast={toast}/>}

      <SectionTitle
        pill={useSubStock ? "Sub-stock · Withdraw" : "Withdraw · Stock Out"}
        title="เบิกสินค้าเติมตู้"
        subtitle={useSubStock ? "เบิกจากสต็อกของคุณไปยังตู้ที่รับผิดชอบ" : "บันทึกการเบิกสินค้าจากคลังกลางไปยังตู้"}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
        {/* Form */}
        <div className="dx-card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            บันทึกการเบิกสินค้าเติมตู้
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 11, color: "var(--dx-text-muted)" }}>
            เลือกเบิกเป็น กล่อง หรือ ซอง ระบบจะคำนวณจำนวนซองให้อัตโนมัติ
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* SKU */}
            <div>
              <label style={labelStyle}>สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({ ...form, sku_id: e.target.value, lot_number: "" })} className="dx-input">
                <option value="" disabled>— เลือกสินค้า —</option>
                {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            {/* Lot selection */}
            {skuLots.length > 0 && (
              <div>
                <label style={labelStyle}>
                  เลือก Lot ที่จะเบิก <span style={{ color: "var(--dx-danger)" }}>*</span>
                  <span style={{ marginLeft: 6, textTransform: "none", letterSpacing: 0, fontSize: 10, opacity: 0.7 }}>
                    ({availableLots.length}/{skuLots.length} Lot มีสต็อก)
                  </span>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {skuLots.map(lot => {
                    const isSelected = form.lot_number === lot.lot_number
                    const depleted = lot.lotBalance <= 0
                    const lotBoxes = Math.floor(lot.lotBalance / (selectedSku?.packs_per_box || 24))
                    const lotRem = lot.lotBalance % (selectedSku?.packs_per_box || 24)
                    const mismatch = lot.lot_number && !lot.lot_number.toUpperCase().includes(form.sku_id.replace(" ", ""))
                    return (
                      <button type="button" key={lot.lot_number} disabled={depleted}
                        onClick={() => setForm({ ...form, lot_number: isSelected ? "" : lot.lot_number })}
                        style={{
                          width: "100%", padding: 12, borderRadius: 12,
                          textAlign: "left", cursor: depleted ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          background: isSelected
                            ? "linear-gradient(180deg, rgba(0,212,255,0.12) 0%, rgba(0,212,255,0.04) 100%)"
                            : "var(--dx-bg-input)",
                          border: `1px solid ${isSelected ? "var(--dx-cyan)" : "var(--dx-border)"}`,
                          boxShadow: isSelected ? "0 0 0 3px rgba(0,212,255,0.1)" : "none",
                          opacity: depleted ? 0.4 : 1,
                          transition: "all .15s",
                        }}>
                        {mismatch && (
                          <p style={{ margin: "0 0 6px", fontSize: 10, color: "var(--dx-danger)", fontWeight: 500 }}>
                            ⚠ Lot นี้อาจบันทึกผิด SKU — ชื่อ Lot ไม่ตรงกับ {form.sku_id}
                          </p>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div>
                            <span className="dx-mono" style={{
                              fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                              background: isSelected ? "rgba(0,212,255,0.15)" : "rgba(0,212,255,0.08)",
                              color: isSelected ? "var(--dx-cyan-bright)" : "var(--dx-cyan-soft)",
                            }}>
                              {lot.lot_number}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--dx-text-muted)", marginLeft: 8 }}>{lot.source}</span>
                            <span style={{ fontSize: 10, color: "var(--dx-text-muted)", marginLeft: 4 }}>· {lot.purchased_at?.slice(0, 10)}</span>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <p className="dx-mono" style={{
                              margin: 0, fontSize: 13, fontWeight: 700,
                              color: depleted ? "var(--dx-text-muted)"
                                : isSelected ? "var(--dx-cyan-bright)"
                                : "var(--dx-success)",
                            }}>
                              {fmt(lot.lotBalance)} ซอง
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                              {depleted ? "หมดแล้ว" : `${lotBoxes > 0 ? lotBoxes + "กล่อง" : ""}${lotBoxes > 0 && lotRem > 0 ? "+" : ""}${lotRem > 0 ? lotRem + "ซอง" : ""}`}
                            </p>
                          </div>
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

            {/* สต็อกคงเหลือ */}
            <div style={{
              padding: 12, borderRadius: 12,
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              background: available < 24
                ? "linear-gradient(180deg, rgba(255,200,87,0.08) 0%, transparent 100%)"
                : "linear-gradient(180deg, rgba(0,255,136,0.08) 0%, transparent 100%)",
              border: `1px solid ${available < 24 ? "rgba(255,200,87,0.2)" : "rgba(0,255,136,0.2)"}`,
            }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 10, color: available < 24 ? "var(--dx-warning)" : "var(--dx-success)", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {selectedLot ? "Lot นี้คงเหลือ" : useSubStock ? "สต็อกของฉัน (ซอง)" : "คงเหลือรวม (ซอง)"}
                </p>
                <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: available < 24 ? "var(--dx-warning)" : "var(--dx-success)" }}>
                  {fmt(selectedLot ? selectedLot.lotBalance : available)}
                </p>
              </div>
              <div style={{ textAlign: "center", borderLeft: "1px solid var(--dx-border)" }}>
                <p style={{ margin: 0, fontSize: 10, color: available < 24 ? "var(--dx-warning)" : "var(--dx-success)", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  คงเหลือ (กล่อง)
                </p>
                <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: available < 24 ? "var(--dx-warning)" : "var(--dx-success)" }}>
                  {selectedLot
                    ? Math.floor(selectedLot.lotBalance / (selectedSku?.packs_per_box || 24))
                    : availBoxes}
                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--dx-text-muted)", marginLeft: 4 }}>
                    ({selectedSku?.packs_per_box} ซอง/กล่อง)
                  </span>
                </p>
              </div>
            </div>

            {/* เลือกหน่วย */}
            <div>
              <label style={labelStyle}>เบิกเป็น</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[{ v: "box", l: "กล่อง (Box)", sub: `${selectedSku?.packs_per_box || 24} ซอง/กล่อง` },
                  { v: "pack", l: "ซอง (Pack)", sub: "ระบุจำนวนซองตรงๆ" }].map(opt => {
                  const isActive = form.unit === opt.v
                  return (
                    <button type="button" key={opt.v}
                      onClick={() => setForm({ ...form, unit: opt.v, quantity: "1" })}
                      style={{
                        padding: 12, borderRadius: 10, textAlign: "left", cursor: "pointer",
                        fontFamily: "inherit",
                        background: isActive ? "rgba(0,212,255,0.1)" : "var(--dx-bg-input)",
                        border: `1px solid ${isActive ? "var(--dx-cyan)" : "var(--dx-border)"}`,
                        boxShadow: isActive ? "0 0 0 3px rgba(0,212,255,0.1)" : "none",
                        transition: "all .15s",
                      }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isActive ? "var(--dx-cyan-bright)" : "var(--dx-text)" }}>
                        {opt.l}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>{opt.sub}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* จำนวน */}
            <div>
              <label style={labelStyle}>จำนวน{form.unit === "box" ? "กล่อง" : "ซอง"}</label>
              <input type="number" min="1" max={form.unit === "box" ? availBoxes : available}
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                className="dx-input dx-mono"
                style={{
                  fontWeight: 700,
                  borderColor: overStock ? "var(--dx-danger)" : undefined,
                }}/>

              {withdrawQty > 0 && (
                <div style={{
                  marginTop: 8, padding: 12, borderRadius: 10, fontSize: 12,
                  background: overStock ? "rgba(255,68,102,0.08)" : "rgba(0,212,255,0.05)",
                  color: overStock ? "var(--dx-danger)" : "var(--dx-cyan-soft)",
                  border: `1px solid ${overStock ? "rgba(255,68,102,0.2)" : "rgba(0,212,255,0.15)"}`,
                }}>
                  {form.unit === "box" ? (
                    <span>เบิก <b className="dx-mono">{withdrawQty} กล่อง</b> = <b className="dx-mono">{fmt(withdrawPacks)} ซอง</b></span>
                  ) : (
                    <span>เบิก <b className="dx-mono">{fmt(withdrawPacks)} ซอง</b></span>
                  )}
                  {(overStock || overLot) && (
                    <span style={{ marginLeft: 8, fontWeight: 600 }}>
                      ⚠ เกินสต็อก{overLot && !overStock ? " Lot" : ""}!
                    </span>
                  )}
                  {!overStock && !overLot && (
                    <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.8 }}>
                      เหลือ <span className="dx-mono">{fmt((selectedLot ? selectedLot.lotBalance : available) - withdrawPacks)}</span> ซอง
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* วันที่และเวลา */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>วันที่เบิก</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="dx-input"/>
              </div>
              <div>
                <label style={labelStyle}>เวลา</label>
                <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="dx-input"/>
              </div>
            </div>

            {/* ตู้ปลายทาง */}
            <div>
              <label style={labelStyle}>
                ตู้ปลายทาง
                {hasAssignment && <span style={{ marginLeft: 6, color: "var(--dx-cyan-soft)", textTransform: "none", letterSpacing: 0, fontSize: 10 }}>(ตู้ที่คุณรับผิดชอบ)</span>}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {myMachines.map(m => {
                  const isActive = (form.machine_id || machineId) === m.machine_id
                  return (
                    <button type="button" key={m.machine_id}
                      onClick={() => setForm({ ...form, machine_id: m.machine_id })}
                      style={{
                        padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                        fontFamily: "inherit", textAlign: "left",
                        background: isActive ? "rgba(0,212,255,0.1)" : "var(--dx-bg-input)",
                        border: `1px solid ${isActive ? "var(--dx-cyan)" : "var(--dx-border)"}`,
                        color: isActive ? "var(--dx-cyan-bright)" : "var(--dx-text-secondary)",
                        boxShadow: isActive ? "0 0 0 3px rgba(0,212,255,0.1)" : "none",
                        transition: "all .15s",
                      }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: "var(--dx-text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.location}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* หมายเหตุ */}
            <div>
              <label style={labelStyle}>หมายเหตุ (ไม่บังคับ)</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="เช่น เติมเพิ่มหลังงานอีเว้นท์" className="dx-input"/>
            </div>

            <button type="submit" disabled={saving || overStock || overLot}
              className="dx-btn dx-btn-primary"
              style={{
                width: "100%", padding: 12, fontSize: 13, justifyContent: "center",
                opacity: (saving || overStock || overLot) ? 0.5 : 1,
                cursor: (saving || overStock || overLot) ? "not-allowed" : "pointer",
              }}>
              {saving ? <Loader2 size={15} className="animate-spin"/> : <ArrowUpCircle size={15}/>}
              {saving ? "กำลังบันทึก..." : `บันทึกเบิก ${withdrawQty > 0 ? fmt(withdrawPacks) + " ซอง" : ""}`}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="dx-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
              ประวัติการเบิกสินค้า
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <select value={historySku} onChange={e => setHistorySku(e.target.value)}
                className="dx-input" style={{ width: "auto", padding: "6px 10px", fontSize: 11 }}>
                <option value="">ทุก SKU</option>
                {skus.filter(s => s.is_active !== false).sort((a, b) => {
                  const order = { OP: 1, EB: 2, PRB: 3 }
                  return (order[a.series] || 9) - (order[b.series] || 9) || a.sku_id.localeCompare(b.sku_id)
                }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
              </select>
              <div style={{ display: "flex", gap: 4 }}>
                {[{ v: "all", l: "ทั้งหมด" }, { v: "day", l: "รายวัน" }, { v: "month", l: "รายเดือน" }, { v: "year", l: "รายปี" }].map(t => (
                  <button key={t.v} onClick={() => setHistoryFilter(t.v)}
                    className={`dx-chip ${historyFilter === t.v ? "dx-chip-active" : ""}`}
                    style={{ padding: "6px 10px", fontSize: 11 }}>
                    {t.l}
                  </button>
                ))}
              </div>
              {historyFilter === "day" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="date" value={historyDateFrom}
                    onChange={e => { setHistoryDateFrom(e.target.value); if (e.target.value > historyDateTo) setHistoryDateTo(e.target.value) }}
                    className="dx-input" style={{ width: "auto", padding: "6px 8px", fontSize: 11 }}/>
                  <span style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>ถึง</span>
                  <input type="date" value={historyDateTo} min={historyDateFrom}
                    onChange={e => setHistoryDateTo(e.target.value)}
                    className="dx-input" style={{ width: "auto", padding: "6px 8px", fontSize: 11 }}/>
                </div>
              )}
              {historyFilter === "month" && (
                <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}
                  className="dx-input" style={{ width: "auto", padding: "6px 8px", fontSize: 11 }}/>
              )}
              {historyFilter === "year" && (
                <select value={historyYear} onChange={e => setHistoryYear(e.target.value)}
                  className="dx-input" style={{ width: "auto", padding: "6px 8px", fontSize: 11 }}>
                  {[...new Set(stockOut.map(r => r.withdrawn_at?.slice(0, 4)).filter(Boolean))].sort().reverse()
                    .map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>

          {(() => {
            const skuFiltered = historySku ? stockOut.filter(r => r.sku_id === historySku) : stockOut
            const sorted = [...skuFiltered].sort((a, b) => sortByDateThenSku(a, b, "withdrawn_at"))
            const filtered = historyFilter === "day"
              ? sorted.filter(r => { const d = r.withdrawn_at?.slice(0, 10) || ""; return d >= historyDateFrom && d <= historyDateTo })
              : historyFilter === "month" ? sorted.filter(r => r.withdrawn_at?.slice(0, 7) === historyMonth)
              : historyFilter === "year" ? sorted.filter(r => r.withdrawn_at?.slice(0, 4) === historyYear)
              : sorted
            return filtered.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--dx-text-muted)", padding: "40px 0", textAlign: "center" }}>
                ยังไม่มีประวัติการเบิก{historyFilter !== "all" ? "ในช่วงที่เลือก" : ""}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflowY: "auto", paddingRight: 4 }}>
                {filtered.map((r, i) => {
                  const sku = skus.find(s => s.sku_id === r.sku_id)
                  const machine = machines.find(m => m.machine_id === r.machine_id)
                  const unitMatch = r.note?.match(/^\[(\d+)(กล่อง|ซอง)\]/)
                  const cleanNote = r.note?.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, "") || ""
                  const isConfirming = deleteOutId === r.id
                  return (
                    <div key={i} style={{
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
                                border: "1px solid rgba(0,212,255,0.15)",
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
                          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
                            → <span style={{ fontWeight: 500, color: "var(--dx-cyan-soft)" }}>{machine?.name ?? r.machine_id}</span>
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={10}/> {r.withdrawn_at?.slice(0, 10)} {r.withdrawn_at?.slice(11, 16) || ""}
                          </p>
                          {cleanNote && (
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)", fontStyle: "italic" }}>
                              "{cleanNote}"
                            </p>
                          )}
                          {r.created_by && (
                            <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>โดย: {r.created_by}</p>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                          <span className="dx-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--dx-danger)", display: "block" }}>
                            -{fmt(r.quantity_packs)} ซอง
                          </span>
                          <button onClick={() => setDeleteOutId(r.id)} title="ลบ"
                            style={{
                              marginTop: 6, padding: 5, borderRadius: 6, border: "none", cursor: "pointer",
                              background: "rgba(255,68,102,0.1)", color: "var(--dx-danger)",
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,68,102,0.2)"}
                            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,68,102,0.1)"}>
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      </div>
                      {isConfirming && (
                        <div style={{
                          marginTop: 10, paddingTop: 10,
                          borderTop: "1px solid rgba(255,68,102,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: "rgba(255,68,102,0.06)",
                          marginLeft: -12, marginRight: -12, marginBottom: -12,
                          padding: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
                        }}>
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "var(--dx-danger)" }}>
                            ยืนยันลบรายการนี้?
                          </p>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => setDeleteOutId(null)} className="dx-btn dx-btn-ghost"
                              style={{ padding: "4px 10px", fontSize: 11 }}>
                              ยกเลิก
                            </button>
                            <button onClick={() => handleDeleteOut(r.id)} disabled={deletingOut}
                              style={{
                                padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6,
                                cursor: deletingOut ? "not-allowed" : "pointer",
                                background: "var(--dx-danger)", color: "#fff", border: "none",
                                display: "inline-flex", alignItems: "center", gap: 4,
                                opacity: deletingOut ? 0.5 : 1,
                              }}>
                              {deletingOut ? <Loader2 size={10} className="animate-spin"/> : <Trash2 size={10}/>}
                              ลบ
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
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
