import { useState } from "react"
import { X, CheckCircle, Send, Trash2 } from "lucide-react"
import { fmt, sortSkus } from "../shared/helpers"

export default function PageTransfer({ stockIn, stockOut, stockBalance, skus, transfers, profiles, onAddTransfer, onDeleteTransfer }) {
  const nowDate = () => new Date().toISOString().slice(0,10)
  const nowTime = () => new Date().toTimeString().slice(0,5)
  const [form, setForm] = useState({ sku_id:"", lot_number:"", to_user_id:"", unit:"box", quantity:"1", note:"", date: nowDate(), time: nowTime() })
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [historyFilter, setHistoryFilter] = useState("all")
  const [historyDateFrom, setHistoryDateFrom] = useState(nowDate())
  const [historyDateTo,   setHistoryDateTo]   = useState(nowDate())

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3500) }

  // สต็อกหลัก = stock_in - transfers ออก (ไม่นับ stock_out เก่าที่ยังไม่มี withdrawn_by_user_id)
  const mainBalMap = {}
  stockIn.forEach(r => { mainBalMap[r.sku_id] = (mainBalMap[r.sku_id] || 0) + (r.quantity_packs || 0) })
  transfers.forEach(r => { mainBalMap[r.sku_id] = (mainBalMap[r.sku_id] || 0) - (r.quantity_packs || 0) })
  // หักข้อมูลเก่า (stock_out ที่ไม่มี withdrawn_by_user_id = เบิกจากสต็อกหลักโดยตรง)
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
    // FIFO: หักทั้ง transfers + stock_out(เก่า) ออก
    const totalUsed = (transfers.filter(t => t.sku_id === form.sku_id).reduce((a, t) => a + (t.quantity_packs || 0), 0))
      + (stockOut.filter(so => so.sku_id === form.sku_id && !so.withdrawn_by_user_id).reduce((a, so) => a + (so.quantity_packs || 0), 0))
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.sku_id) { showToast("กรุณาเลือกสินค้า","error"); return }
    if (!form.to_user_id) { showToast("กรุณาเลือกแอดมินปลายทาง","error"); return }
    if (!withdrawQty || withdrawQty <= 0) { showToast("กรุณาระบุจำนวน","error"); return }
    if (overStock) { showToast(`สต็อกหลักไม่เพียงพอ: คงเหลือ ${fmt(available)} ซอง`, "error"); return }
    if (overLot) { showToast(`เกินสต็อก Lot: คงเหลือ ${fmt(selectedLot.lotBalance)} ซอง`, "error"); return }
    if (availableLots.length > 0 && !form.lot_number) { showToast("กรุณาเลือก Lot","error"); return }
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
          ? `[${form.unit === "box" ? withdrawQty+"กล่อง" : withdrawQty+"ซอง"}] ${form.note}`
          : `[${form.unit === "box" ? withdrawQty+"กล่อง" : withdrawQty+"ซอง"}]`,
      })
      showToast(`แจกจ่ายสำเร็จ: ${form.sku_id} → ${toAdmin?.display_name || "?"} ${fmt(withdrawPacks)} ซอง`)
      setForm(f => ({...f, sku_id:"", lot_number:"", quantity:"1", note:""}))
    } catch (err) { showToast("เกิดข้อผิดพลาด: " + err.message, "error") }
    finally { setSaving(false) }
  }

  // ประวัติการแจกจ่าย (กรองวัน)
  const filteredTransfers = transfers.filter(t => {
    const d = (t.transferred_at || t.created_at || "").slice(0,10)
    if (historyFilter === "date") return d >= historyDateFrom && d <= historyDateTo
    return true
  }).sort((a,b) => (b.transferred_at||"").localeCompare(a.transferred_at||""))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">แจกจ่ายสินค้า</h1>
      <p className="text-sm text-gray-400">เบิกจากสต็อกหลัก แจกจ่ายให้แอดมินแต่ละคนเพื่อนำไปเติมตู้</p>

      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error"?<X size={16}/>:<CheckCircle size={16}/>} {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ฟอร์มแจกจ่าย */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-1">บันทึกการแจกจ่าย</h2>
          <p className="text-xs text-gray-400 mb-4">เลือกสินค้าจากสต็อกหลัก แจกจ่ายให้แอดมินที่รับผิดชอบ</p>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* SKU */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value, lot_number:""})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="" disabled>-- เลือกสินค้า --</option>
                {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} -- {s.name}</option>)}
              </select>
            </div>

            {/* Lot selection */}
            {skuLots.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  เลือก Lot <span className="text-red-400">*</span>
                  <span className="ml-1 text-gray-400">({availableLots.length}/{skuLots.length} Lot มีสต็อก)</span>
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {skuLots.map(lot => {
                    const isSelected = form.lot_number === lot.lot_number
                    const depleted = lot.lotBalance <= 0
                    return (
                      <button type="button" key={lot.lot_number} disabled={depleted}
                        onClick={() => setForm({...form, lot_number: isSelected ? "" : lot.lot_number})}
                        className={`w-full p-3 rounded-xl border-2 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed
                          ${isSelected ? "border-blue-400 bg-blue-50" : depleted ? "border-gray-200 bg-gray-50" : "border-gray-200 hover:border-blue-300"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${isSelected ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                            {lot.lot_number}
                          </span>
                          <span className={`text-sm font-bold ${depleted ? "text-gray-400" : "text-green-600"}`}>
                            {fmt(lot.lotBalance)} ซอง
                          </span>
                        </div>
                        {lot.quantity_packs > 0 && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1">
                              <div className={`h-1 rounded-full ${isSelected?"bg-blue-400":"bg-green-400"}`}
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
            {form.sku_id && (
              <div className={`p-3 rounded-xl text-sm ${available < 24 ? "bg-amber-50" : "bg-green-50"}`}>
                <p className={`text-xs ${available < 24 ? "text-amber-500" : "text-green-500"}`}>สต็อกหลักคงเหลือ</p>
                <p className={`text-lg font-bold ${available < 24 ? "text-amber-700" : "text-green-700"}`}>{fmt(available)} ซอง</p>
              </div>
            )}

            {/* แอดมินปลายทาง */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">แจกจ่ายให้</label>
              <select value={form.to_user_id} onChange={e => setForm({...form, to_user_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="" disabled>-- เลือกแอดมิน --</option>
                {adminProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.email}</option>
                ))}
              </select>
            </div>

            {/* หน่วย + จำนวน */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">หน่วย</label>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                  {[{v:"box",l:"กล่อง"},{v:"pack",l:"ซอง"}].map(u => (
                    <button key={u.v} type="button" onClick={() => setForm({...form, unit:u.v})}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${form.unit===u.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                      {u.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
            </div>

            {withdrawPacks > 0 && (
              <p className={`text-xs ${overStock || overLot ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                = {fmt(withdrawPacks)} ซอง {overStock ? "(เกินสต็อกหลัก!)" : overLot ? "(เกินสต็อก Lot!)" : ""}
              </p>
            )}

            {/* วัน/เวลา */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">วันที่</label>
                <input type="date" value={form.date} onChange={e => setForm({...form, date:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">เวลา</label>
                <input type="time" value={form.time} onChange={e => setForm({...form, time:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
            </div>

            {/* หมายเหตุ */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
              <input type="text" value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                placeholder="ไม่บังคับ" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
            </div>

            <button type="submit" disabled={saving}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              <Send size={16}/> {saving ? "กำลังบันทึก..." : "แจกจ่ายสินค้า"}
            </button>
          </form>
        </div>

        {/* ประวัติแจกจ่าย */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">ประวัติแจกจ่าย ({filteredTransfers.length})</h2>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {[{v:"all",l:"ทั้งหมด"},{v:"date",l:"เลือกวัน"}].map(f => (
                <button key={f.v} onClick={() => setHistoryFilter(f.v)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium ${historyFilter===f.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                  {f.l}
                </button>
              ))}
            </div>
          </div>

          {historyFilter === "date" && (
            <div className="flex gap-2 mb-3">
              <input type="date" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"/>
              <span className="text-xs text-gray-400 self-center">ถึง</span>
              <input type="date" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"/>
            </div>
          )}

          {filteredTransfers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีประวัติแจกจ่าย</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredTransfers.map(t => {
                const toAdmin = profiles.find(p => p.id === t.to_user_id)
                return (
                  <div key={t.id} className="p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{t.sku_id}</span>
                        {t.lot_number && <span className="text-xs text-gray-400 ml-2">{t.lot_number}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-700">{fmt(t.quantity_packs)} ซอง</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-500">
                        → <span className="font-semibold text-purple-600">{toAdmin?.display_name || "?"}</span>
                        <span className="ml-2 text-gray-400">{(t.transferred_at || t.created_at || "").slice(0,10)}</span>
                      </span>
                      {deleteId === t.id ? (
                        <div className="flex gap-1">
                          <button onClick={async () => { await onDeleteTransfer(t.id); setDeleteId(null); showToast("ลบสำเร็จ") }}
                            className="text-xs text-red-600 font-medium">ลบ</button>
                          <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400">ยกเลิก</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteId(t.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14}/></button>
                      )}
                    </div>
                    {t.note && <p className="text-xs text-gray-400 mt-1">{t.note}</p>}
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
