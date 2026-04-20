import { useState } from "react"
import {
  X, CheckCircle, Clock, Loader2, ArrowUpCircle, Trash2,
} from "lucide-react"
import { fmt, sortSkus, sortByDateThenSku } from "../shared/helpers"
import { Badge } from "../shared/ui"

export default function PageWithdrawal({ machines, stockOut, stockIn, stockBalance, onAddStockOut, onDeleteStockOut, skus, transfers, machineAssignments, session, profile }) {
  const nowDate = () => new Date().toISOString().slice(0,10)
  const nowTime = () => new Date().toTimeString().slice(0,5)
  const [form, setForm]   = useState({ sku_id:"", lot_number:"", machine_id:"", unit:"box", quantity:"1", note:"", date: nowDate(), time: nowTime() })
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  // กรองตู้: ถ้ามี assignment → แสดงเฉพาะตู้ที่ assign ให้ / ถ้าไม่มี → แสดงทั้งหมด (backward compat)
  const userId = session?.user?.id
  const myAssignments = (machineAssignments || []).filter(a => a.user_id === userId && a.is_active)
  const hasAssignment = myAssignments.length > 0
  const myMachines = hasAssignment ? machines.filter(m => myAssignments.some(a => a.machine_id === m.machine_id)) : machines

  // สต็อกย่อย: ถ้ามี assignment → ใช้สต็อกจาก transfers / ถ้าไม่มี → ใช้สต็อกหลัก (backward compat)
  const myTransfers = (transfers || []).filter(t => t.to_user_id === userId)
  const myStockOutForBalance = hasAssignment ? stockOut.filter(so => so.withdrawn_by_user_id === userId) : []
  const useSubStock = hasAssignment && myTransfers.length > 0

  const [deleteOutId, setDeleteOutId] = useState(null)
  const [deletingOut, setDeletingOut] = useState(false)
  const [historyFilter, setHistoryFilter] = useState("all")
  const [historyDateFrom, setHistoryDateFrom] = useState(nowDate())
  const [historyDateTo,   setHistoryDateTo]   = useState(nowDate())
  const [historyMonth,  setHistoryMonth]  = useState(nowDate().slice(0,7))
  const [historyYear,   setHistoryYear]   = useState(nowDate().slice(0,4))
  const [historySku,    setHistorySku]    = useState("")

  const handleDeleteOut = async (id) => {
    setDeletingOut(true)
    try {
      await onDeleteStockOut(id)
      setDeleteOutId(null)
      showToast("ลบรายการเบิกสำเร็จ")
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally {
      setDeletingOut(false)
    }
  }

  const machineId   = form.machine_id || myMachines[0]?.machine_id || ""
  const selectedSku = skus.find(s => s.sku_id === form.sku_id)

  // คำนวณสต็อกคงเหลือ: ใช้สต็อกย่อย(ถ้ามี assignment) หรือสต็อกหลัก
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
  const availBoxes  = selectedSku ? Math.floor(available / selectedSku.packs_per_box) : 0

  // ── Lot options (FIFO) — ใช้ transfers ถ้ามี sub-stock / stockIn ถ้าสต็อกหลัก ──
  const skuLots = (() => {
    if (!form.sku_id) return []
    const lotMap = {}
    if (useSubStock) {
      // Lot จาก transfers ที่ได้รับมา
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
      // สต็อกหลัก (เดิม)
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
  const selectedLot   = skuLots.find(r => r.lot_number === form.lot_number)

  // คำนวณซองที่จะเบิก
  const withdrawQty   = parseInt(form.quantity) || 0
  const withdrawPacks = form.unit === "box"
    ? withdrawQty * (selectedSku?.packs_per_box || 24)
    : withdrawQty
  const overStock = withdrawPacks > available
  const overLot   = selectedLot && withdrawPacks > selectedLot.lotBalance

  const showToast = (msg, type="success") => {
    setToast({msg, type}); setTimeout(() => setToast(null), 3500)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.sku_id)  { showToast("กรุณาเลือกสินค้า","error"); return }
    if (!withdrawQty || withdrawQty <= 0) { showToast("กรุณาระบุจำนวนที่ถูกต้อง","error"); return }
    if (!machineId)    { showToast("กรุณาเลือกตู้ปลายทาง","error"); return }
    if (overStock)     { showToast(`สต็อกไม่เพียงพอ: คงเหลือ ${available} ซอง`, "error"); return }
    if (overLot)       { showToast(`เกินสต็อก Lot นี้: คงเหลือ ${fmt(selectedLot.lotBalance)} ซอง`, "error"); return }
    if (availableLots.length > 0 && !form.lot_number) { showToast("กรุณาเลือก Lot ที่จะเบิก","error"); return }
    try {
      setSaving(true)
      const machine = machines.find(m => m.machine_id === machineId)
      await onAddStockOut({
        sku_id:         form.sku_id,
        lot_number:     form.lot_number || null,
        machine_id:     machineId,
        quantity_packs: withdrawPacks,
        withdrawn_at:   `${form.date}T${form.time}:00`,
        note:           form.note
          ? `[${form.unit === "box" ? withdrawQty+"กล่อง" : withdrawQty+"ซอง"}] ${form.note}`
          : `[${form.unit === "box" ? withdrawQty+"กล่อง" : withdrawQty+"ซอง"}]`,
      })
      showToast(`เบิกสำเร็จ: ${form.sku_id}${form.lot_number ? ` (${form.lot_number})` : ""} → ${machine?.name ?? machineId} ${fmt(withdrawPacks)} ซอง`)
      setForm(f => ({...f, sku_id:"", lot_number:"", quantity:"1", note:""}))
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">เบิกสินค้าเติมตู้</h1>

      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error"?<X size={16}/>:<CheckCircle size={16}/>} {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-1">บันทึกการเบิกสินค้าเติมตู้</h2>
          <p className="text-xs text-gray-400 mb-4">เลือกเบิกเป็น กล่อง หรือ ซอง ระบบจะคำนวณจำนวนซองให้อัตโนมัติ</p>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* SKU */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value, lot_number:""})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="" disabled>— เลือกสินค้า —</option>
                {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            {/* เลือก Lot */}
            {skuLots.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  เลือก Lot ที่จะเบิก <span className="text-red-400">*</span>
                  <span className="ml-1 text-gray-400">({availableLots.length}/{skuLots.length} Lot มีสต็อก)</span>
                </label>
                <div className="space-y-2">
                  {skuLots.map(lot => {
                    const isSelected = form.lot_number === lot.lot_number
                    const depleted   = lot.lotBalance <= 0
                    const lotBoxes   = Math.floor(lot.lotBalance / (selectedSku?.packs_per_box || 24))
                    const lotRem     = lot.lotBalance % (selectedSku?.packs_per_box || 24)
                    return (
                      <button type="button" key={lot.lot_number}
                        disabled={depleted}
                        onClick={() => setForm({...form, lot_number: isSelected ? "" : lot.lot_number})}
                        className={`w-full p-3 rounded-xl border-2 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed
                          ${isSelected ? "border-orange-400 bg-orange-50" : depleted ? "border-gray-200 bg-gray-50" : "border-gray-200 hover:border-orange-300"}`}>
                        {/* แจ้งเตือนถ้า lot_number ไม่ตรงกับ SKU ที่เลือก */}
                        {lot.lot_number && !lot.lot_number.toUpperCase().includes(form.sku_id.replace(" ","")) && (
                          <p className="text-xs text-red-500 font-medium mb-1">⚠ Lot นี้อาจบันทึกผิด SKU — ชื่อ Lot ไม่ตรงกับ {form.sku_id}</p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${isSelected ? "bg-orange-100 text-orange-700" : "bg-blue-50 text-blue-700"}`}>
                              {lot.lot_number}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">{lot.source}</span>
                            <span className="text-xs text-gray-400 ml-1">· {lot.purchased_at?.slice(0,10)}</span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-bold ${depleted ? "text-gray-400" : isSelected ? "text-orange-600" : "text-green-600"}`}>
                              {fmt(lot.lotBalance)} ซอง
                            </p>
                            <p className="text-xs text-gray-400">
                              {depleted ? "หมดแล้ว" : `${lotBoxes > 0 ? lotBoxes+"กล่อง" : ""}${lotBoxes>0&&lotRem>0?"+":""}${lotRem>0?lotRem+"ซอง":""}`}
                            </p>
                          </div>
                        </div>
                        {/* Progress */}
                        {lot.quantity_packs > 0 && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1">
                              <div className={`h-1 rounded-full transition-all ${isSelected?"bg-orange-400":"bg-green-400"}`}
                                style={{width:`${Math.max(0,(lot.lotBalance/lot.quantity_packs)*100)}%`}}/>
                            </div>
                            <span className="text-xs text-gray-400">{fmt(lot.lotBalance)}/{fmt(lot.quantity_packs)}</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* สต็อกคงเหลือ */}
            <div className={`p-3 rounded-xl text-sm grid grid-cols-2 gap-2 ${available < 24 ? "bg-amber-50":"bg-green-50"}`}>
              <div className="text-center">
                <p className={`text-xs ${available < 24 ? "text-amber-500":"text-green-500"}`}>
                  {selectedLot ? `Lot นี้คงเหลือ` : useSubStock ? "สต็อกของฉัน (ซอง)" : "คงเหลือรวม (ซอง)"}
                </p>
                <p className={`text-lg font-bold ${available < 24 ? "text-amber-700":"text-green-700"}`}>
                  {fmt(selectedLot ? selectedLot.lotBalance : available)}
                </p>
              </div>
              <div className="text-center border-l border-white/60">
                <p className={`text-xs ${available < 24 ? "text-amber-500":"text-green-500"}`}>
                  {selectedLot ? "คงเหลือ (กล่อง)" : "คงเหลือ (กล่อง)"}
                </p>
                <p className={`text-lg font-bold ${available < 24 ? "text-amber-700":"text-green-700"}`}>
                  {selectedLot
                    ? Math.floor(selectedLot.lotBalance / (selectedSku?.packs_per_box || 24))
                    : availBoxes}
                  <span className="text-xs font-normal ml-1">({selectedSku?.packs_per_box} ซอง/กล่อง)</span>
                </p>
              </div>
            </div>

            {/* เลือกหน่วย */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">เบิกเป็น</label>
              <div className="grid grid-cols-2 gap-2">
                {[{v:"box",l:"กล่อง (Box)",sub:`${selectedSku?.packs_per_box} ซอง/กล่อง`},
                  {v:"pack",l:"ซอง (Pack)",sub:"ระบุจำนวนซองตรงๆ"}].map(opt => (
                  <button type="button" key={opt.v}
                    onClick={() => setForm({...form, unit:opt.v, quantity:"1"})}
                    className={`py-3 px-4 rounded-xl border-2 text-left transition-all ${form.unit===opt.v?"border-orange-400 bg-orange-50":"border-gray-200 hover:border-gray-300"}`}>
                    <p className={`text-sm font-bold ${form.unit===opt.v?"text-orange-700":"text-gray-700"}`}>{opt.l}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* จำนวน */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                จำนวน{form.unit === "box" ? "กล่อง" : "ซอง"}
              </label>
              <input type="number" min="1"
                max={form.unit === "box" ? availBoxes : available}
                value={form.quantity}
                onChange={e => setForm({...form, quantity:e.target.value})}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 ${overStock?"border-red-300":"border-gray-200"}`}/>

              {/* สรุปการเบิก */}
              {withdrawQty > 0 && (
                <div className={`mt-2 p-3 rounded-xl text-sm ${overStock?"bg-red-50 text-red-700":"bg-orange-50 text-orange-700"}`}>
                  {form.unit === "box" ? (
                    <span>
                      เบิก <span className="font-bold">{withdrawQty} กล่อง</span>
                      {" = "}
                      <span className="font-bold">{fmt(withdrawPacks)} ซอง</span>
                    </span>
                  ) : (
                    <span>เบิก <span className="font-bold">{fmt(withdrawPacks)} ซอง</span></span>
                  )}
                  {(overStock || overLot) && <span className="ml-2 font-semibold">⚠️ เกินสต็อก{overLot && !overStock ? " Lot" : ""}!</span>}
                  {!overStock && !overLot && (
                    <span className="ml-2 text-xs opacity-70">
                      เหลือ {fmt((selectedLot ? selectedLot.lotBalance : available) - withdrawPacks)} ซอง
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* วันที่และเวลา */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">วันที่เบิก</label>
                <input type="date" value={form.date} onChange={e => setForm({...form, date:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">เวลา</label>
                <input type="time" value={form.time} onChange={e => setForm({...form, time:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              </div>
            </div>

            {/* ตู้ปลายทาง */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                ตู้ปลายทาง {hasAssignment && <span className="text-blue-500">(ตู้ที่คุณรับผิดชอบ)</span>}
              </label>
              <div className={`grid gap-2 ${myMachines.length <= 2 ? "grid-cols-2" : "grid-cols-2"}`}>
                {myMachines.map(m => (
                  <button type="button" key={m.machine_id}
                    onClick={() => setForm({...form, machine_id:m.machine_id})}
                    className={`py-3 px-2 rounded-xl text-sm font-medium border-2 transition-all ${(form.machine_id||machineId)===m.machine_id?"border-orange-400 bg-orange-50 text-orange-700":"border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <div className="text-xs font-bold">{m.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{m.location}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* หมายเหตุ */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ (ไม่บังคับ)</label>
              <input value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                placeholder="เช่น เติมเพิ่มหลังงานอีเว้นท์"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
            </div>

            <button type="submit" disabled={saving || overStock || overLot}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin"/> : <ArrowUpCircle size={16}/>}
              {saving ? "กำลังบันทึก..." : `บันทึกเบิก ${withdrawQty > 0 ? fmt(withdrawPacks)+" ซอง" : ""}`}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold text-gray-700">ประวัติการเบิกสินค้า</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={historySku} onChange={e => setHistorySku(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">ทุก SKU</option>
                {skus.filter(s => s.is_active !== false).sort((a,b) => {
                  const order = {OP:1, EB:2, PRB:3}
                  return (order[a.series]||9) - (order[b.series]||9) || a.sku_id.localeCompare(b.sku_id)
                }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
              </select>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {[{v:"all",l:"ทั้งหมด"},{v:"day",l:"รายวัน"},{v:"month",l:"รายเดือน"},{v:"year",l:"รายปี"}].map(t => (
                  <button key={t.v} onClick={() => setHistoryFilter(t.v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${historyFilter===t.v?"bg-white shadow text-orange-600":"text-gray-500"}`}>
                    {t.l}
                  </button>
                ))}
              </div>
              {historyFilter === "day" && (
                <div className="flex items-center gap-1">
                  <input type="date" value={historyDateFrom} onChange={e => { setHistoryDateFrom(e.target.value); if (e.target.value > historyDateTo) setHistoryDateTo(e.target.value) }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200"/>
                  <span className="text-xs text-gray-400">ถึง</span>
                  <input type="date" value={historyDateTo} min={historyDateFrom} onChange={e => setHistoryDateTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200"/>
                </div>
              )}
              {historyFilter === "month" && (
                <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              )}
              {historyFilter === "year" && (
                <select value={historyYear} onChange={e => setHistoryYear(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200">
                  {[...new Set(stockOut.map(r => r.withdrawn_at?.slice(0,4)).filter(Boolean))].sort().reverse()
                    .map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>
          {(() => {
            const skuFiltered = historySku ? stockOut.filter(r => r.sku_id === historySku) : stockOut
            const sorted = [...skuFiltered].sort((a, b) => sortByDateThenSku(a, b, "withdrawn_at"))
            const filtered = historyFilter === "day" ? sorted.filter(r => { const d = r.withdrawn_at?.slice(0,10) || ""; return d >= historyDateFrom && d <= historyDateTo })
              : historyFilter === "month" ? sorted.filter(r => r.withdrawn_at?.slice(0,7) === historyMonth)
              : historyFilter === "year" ? sorted.filter(r => r.withdrawn_at?.slice(0,4) === historyYear)
              : sorted
            return filtered.length === 0 ? (
            <p className="text-gray-400 text-sm">ยังไม่มีประวัติการเบิก{historyFilter !== "all" ? "ในช่วงที่เลือก" : ""}</p>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {filtered.map((r, i) => {
                const sku     = skus.find(s => s.sku_id === r.sku_id)
                const machine = machines.find(m => m.machine_id === r.machine_id)
                const unitMatch = r.note?.match(/^\[(\d+)(กล่อง|ซอง)\]/)
                const cleanNote = r.note?.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, "") || ""
                const isConfirming = deleteOutId === r.id
                return (
                  <div key={i} className="p-3 rounded-xl bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                          <Badge series={sku?.series || "OP"}/>
                          {r.lot_number && (
                            <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              {r.lot_number}
                            </span>
                          )}
                          {unitMatch && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                              {unitMatch[1]} {unitMatch[2]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          → <span className="font-medium text-orange-600">{machine?.name ?? r.machine_id}</span>
                        </p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock size={10}/> {r.withdrawn_at?.slice(0,10)} {r.withdrawn_at?.slice(11,16) || ""}
                        </p>
                        {cleanNote && <p className="text-xs text-gray-400 mt-0.5 italic">"{cleanNote}"</p>}
                        {r.created_by && <p className="text-xs text-gray-400 mt-0.5">โดย: {r.created_by}</p>}
                      </div>
                      <div className="flex-shrink-0 ml-2 text-right">
                        <span className="text-orange-500 font-bold text-sm block">
                          -{fmt(r.quantity_packs)} ซอง
                        </span>
                        <button onClick={() => setDeleteOutId(r.id)}
                          className="mt-1 p-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200">
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </div>
                    {isConfirming && (
                      <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between bg-red-50 rounded-lg p-2">
                        <p className="text-xs text-red-600 font-medium">ยืนยันลบรายการนี้?</p>
                        <div className="flex gap-2">
                          <button onClick={() => setDeleteOutId(null)}
                            className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-white">
                            ยกเลิก
                          </button>
                          <button onClick={() => handleDeleteOut(r.id)} disabled={deletingOut}
                            className="px-3 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
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
