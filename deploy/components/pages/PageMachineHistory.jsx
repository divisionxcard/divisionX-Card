import { useState } from "react"
import { Clock, Pencil, Trash2, Loader2, X, CheckCircle } from "lucide-react"
import { fmt, today, sortByDateThenSku } from "../shared/helpers"
import { Badge } from "../shared/ui"
import EditStockOutModal from "./EditStockOutModal"

export default function PageMachineHistory({ machine, stockOut, skus, hideHeader, machines, session, profile, onUpdateStockOut, onDeleteStockOut }) {
  const [filterMode, setFilterMode] = useState("all") // all, daily, monthly, yearly
  const [filterDateFrom, setFilterDateFrom] = useState(today())
  const [filterDateTo, setFilterDateTo] = useState(today())
  const [filterMonth, setFilterMonth] = useState(today().slice(0,7))
  const [filterYear, setFilterYear] = useState(today().slice(0,4))
  const [filterSku, setFilterSku] = useState("")

  // Edit / Delete state
  const [editRecord, setEditRecord] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const userId = session?.user?.id
  const isAdmin = profile?.role === "admin"
  const canEditRecord = (r) => isAdmin || (userId && r.withdrawn_by_user_id === userId)
  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3000) }

  const handleDelete = async (id) => {
    if (!onDeleteStockOut) return
    setBusy(true)
    try {
      await onDeleteStockOut(id)
      setDeleteId(null)
      showToast("ลบรายการสำเร็จ — คืนสต็อกแล้ว")
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally { setBusy(false) }
  }

  const handleUpdate = async (id, data) => {
    if (!onUpdateStockOut) return
    await onUpdateStockOut(id, data)
    showToast("บันทึกการแก้ไขสำเร็จ")
  }

  // กรองเฉพาะตู้นี้
  const machineOut = stockOut.filter(r => r.machine_id === machine.machine_id)

  // กรองตาม SKU และช่วงเวลา
  const filtered = machineOut.filter(r => {
    if (filterSku && r.sku_id !== filterSku) return false
    const d = r.withdrawn_at?.slice(0,10) || ""
    if (filterMode === "daily")   return d >= filterDateFrom && d <= filterDateTo
    if (filterMode === "monthly") return d.slice(0,7) === filterMonth
    if (filterMode === "yearly")  return d.slice(0,4) === filterYear
    return true
  }).sort((a, b) => sortByDateThenSku(a, b, "withdrawn_at"))

  // สรุปยอด
  const totalPacks = filtered.reduce((a,r) => a + (r.quantity_packs || 0), 0)
  const skuSummary = {}
  filtered.forEach(r => {
    if (!skuSummary[r.sku_id]) skuSummary[r.sku_id] = 0
    skuSummary[r.sku_id] += r.quantity_packs || 0
  })
  const skuRanked = Object.entries(skuSummary).sort((a,b) => b[1]-a[1])

  // ปีที่มีข้อมูล
  const years = [...new Set(machineOut.map(r => r.withdrawn_at?.slice(0,4)).filter(Boolean))].sort().reverse()

  return (
    <div className="space-y-6">
      {editRecord && onUpdateStockOut && (
        <EditStockOutModal
          record={editRecord}
          skus={skus}
          machines={machines}
          onSave={async (id, data) => { await handleUpdate(id, data); setEditRecord(null) }}
          onClose={() => setEditRecord(null)}
        />
      )}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error" ? <X size={16}/> : <CheckCircle size={16}/>} {toast.msg}
        </div>
      )}
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{machine.name}</h1>
          <p className="text-sm text-gray-400">{machine.location} — ประวัติการเบิกเติมตู้</p>
        </div>
      )}

      {/* ตัวกรอง */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <select value={filterSku} onChange={e => setFilterSku(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
            <option value="">ทุก SKU</option>
            {skus.filter(s => s.is_active !== false).sort((a,b) => {
              const order = {OP:1, EB:2, PRB:3}
              return (order[a.series]||9) - (order[b.series]||9) || a.sku_id.localeCompare(b.sku_id)
            }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
          </select>
          {[{v:"all",l:"ทั้งหมด"},{v:"daily",l:"รายวัน"},{v:"monthly",l:"รายเดือน"},{v:"yearly",l:"รายปี"}].map(t => (
            <button key={t.v} onClick={() => setFilterMode(t.v)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${filterMode===t.v ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {filterMode === "daily" && (
            <div className="flex items-center gap-2">
              <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); if (e.target.value > filterDateTo) setFilterDateTo(e.target.value) }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
              <span className="text-sm text-gray-400">ถึง</span>
              <input type="date" value={filterDateTo} min={filterDateFrom} onChange={e => setFilterDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
            </div>
          )}
          {filterMode === "monthly" && (
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
          )}
          {filterMode === "yearly" && (
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
              {years.length > 0 ? years.map(y => <option key={y} value={y}>{y}</option>)
                : <option value={filterYear}>{filterYear}</option>}
            </select>
          )}
        </div>
      </div>

      {/* สรุปยอด */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400">จำนวนครั้งที่เบิก</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{filtered.length} <span className="text-sm font-normal text-gray-400">ครั้ง</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400">จำนวนซองที่เบิก</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(totalPacks)} <span className="text-sm font-normal text-gray-400">ซอง</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 col-span-2 lg:col-span-1">
          <p className="text-xs text-gray-400 mb-2">SKU ที่เบิกมากสุด</p>
          {skuRanked.length === 0 ? (
            <p className="text-sm text-gray-300">ไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-1">
              {skuRanked.slice(0,3).map(([skuId, packs], i) => (
                <div key={skuId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{i===0?"🥇":i===1?"🥈":"🥉"}</span>
                    <span className="font-mono text-xs font-bold text-gray-700">{skuId}</span>
                  </div>
                  <span className="text-xs font-medium text-orange-600">{fmt(packs)} ซอง</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* รายการเบิก */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-700 mb-3">
          รายการเบิก ({filtered.length} รายการ)
        </h2>
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">ไม่มีรายการในช่วงเวลาที่เลือก</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map((r) => {
              const sku = skus.find(s => s.sku_id === r.sku_id)
              const unitMatch = r.note?.match(/^\[(\d+)(กล่อง|ซอง)\]/)
              const cleanNote = r.note?.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, "") || ""
              const editable = canEditRecord(r) && onUpdateStockOut && onDeleteStockOut
              const isConfirming = deleteId === r.id
              return (
                <div key={r.id} className="p-3 rounded-xl bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span>
                        <Badge series={sku?.series || "OP"}/>
                        {r.lot_number && (
                          <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{r.lot_number}</span>
                        )}
                        {unitMatch && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                            {unitMatch[1]} {unitMatch[2]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                        <Clock size={10}/> {r.withdrawn_at?.slice(0,10)} {r.withdrawn_at?.slice(11,16) || ""}
                        {r.created_by && <span className="ml-1">· โดย {r.created_by}</span>}
                      </p>
                      {cleanNote && <p className="text-xs text-gray-400 mt-0.5 italic">"{cleanNote}"</p>}
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-orange-500 font-bold text-sm">-{fmt(r.quantity_packs)} ซอง</span>
                      {editable && (
                        <div className="flex gap-1 justify-end mt-1">
                          <button onClick={() => setEditRecord(r)} title="แก้ไข"
                            className="p-1 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200">
                            <Pencil size={12}/>
                          </button>
                          <button onClick={() => setDeleteId(r.id)} title="ลบ"
                            className="p-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200">
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {isConfirming && (
                    <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between bg-red-50 -mx-3 -mb-3 p-3 rounded-b-xl">
                      <p className="text-xs text-red-600 font-medium">ยืนยันลบ? จำนวนจะคืนกลับสต็อก</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteId(null)} disabled={busy}
                          className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50">
                          ยกเลิก
                        </button>
                        <button onClick={() => handleDelete(r.id)} disabled={busy}
                          className="px-3 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
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
