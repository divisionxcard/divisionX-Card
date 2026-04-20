import { useState, useEffect } from "react"
import {
  AlertTriangle, CheckCircle, X, ClipboardList, Clock, Monitor,
  Boxes, Package, RefreshCw, Loader2,
} from "lucide-react"
import { fmt } from "../shared/helpers"
import KpiCard from "../shared/KpiCard"
import PageMachineHistory from "./PageMachineHistory"

export default function PageRefillPrep({ machines, machineStock, machineAssignments, transfers, stockOut, skus, profile, session, profiles, onAddStockOut }) {
  const userId = session?.user?.id
  const isAdmin = profile?.role === "admin"

  // Admin เลือก user ที่จะดู — ถ้าตัวเองไม่มี assignment ให้ default เป็นคนที่มี
  const usersWithAssignments = [...new Set((machineAssignments || []).filter(a => a.is_active).map(a => a.user_id))]
  const viewableUsers = (profiles || []).filter(p => usersWithAssignments.includes(p.id))
  const [viewUserId, setViewUserId] = useState("")
  const defaultUserId = usersWithAssignments.includes(userId) ? userId : (viewableUsers[0]?.id || userId)
  const activeUserId = isAdmin ? (viewUserId || defaultUserId) : userId
  const activeProfile = (profiles || []).find(p => p.id === activeUserId)

  // ตู้ที่ active user รับผิดชอบ
  const myMachineIds = (machineAssignments || []).filter(a => a.user_id === activeUserId && a.is_active).map(a => a.machine_id)
  const myMachines = machines.filter(m => myMachineIds.includes(m.machine_id))

  // สต็อกของ active user (per SKU)
  const myTransfers = transfers.filter(t => t.to_user_id === activeUserId)
  const myStockOut = stockOut.filter(so => so.withdrawn_by_user_id === activeUserId)
  const myBalMap = {}
  myTransfers.forEach(t => { myBalMap[t.sku_id] = (myBalMap[t.sku_id] || 0) + (t.quantity_packs || 0) })
  myStockOut.forEach(so => { myBalMap[so.sku_id] = (myBalMap[so.sku_id] || 0) - (so.quantity_packs || 0) })

  // สร้างรายการเติมตู้จากข้อมูล VMS
  const refillItems = []
  myMachineIds.forEach(machId => {
    const slots = machineStock.filter(s => s.machine_id === machId && s.product_name && s.is_occupied)
    const skuRefill = {}
    slots.forEach(s => {
      const refill = Math.max(0, (s.max_capacity || 0) - (s.remain || 0))
      if (refill === 0) return
      const name = s.product_name || ""
      const isBox = name.toLowerCase().includes("box")
      const key = `${machId}_${s.sku_id || name}_${isBox ? "box" : "pack"}`
      if (!skuRefill[key]) skuRefill[key] = { machine_id: machId, sku_id: s.sku_id || "", product_name: name, isBox, refill: 0, remain: 0, capacity: 0, slotNums: [] }
      skuRefill[key].refill += refill
      skuRefill[key].remain += s.remain || 0
      skuRefill[key].capacity += s.max_capacity || 0
      skuRefill[key].slotNums.push(s.slot_number)
    })
    Object.values(skuRefill).forEach(r => refillItems.push(r))
  })

  // Tab เลือกตู้ — "all" หรือ machine_id
  const [activeTab, setActiveTab] = useState("all")
  // Reset tab เมื่อสลับ user (กัน tab ชี้ไปตู้ที่ user ใหม่ไม่มี)
  useEffect(() => { setActiveTab("all") }, [activeUserId])

  // group by SKU (สรุปรวม)
  const skuSummary = {}
  refillItems.forEach(r => {
    const key = `${r.sku_id}_${r.isBox ? "box" : "pack"}`
    if (!skuSummary[key]) skuSummary[key] = { sku_id: r.sku_id, product_name: r.product_name, isBox: r.isBox, totalRefill: 0, machines: [] }
    skuSummary[key].totalRefill += r.refill
    skuSummary[key].machines.push({ machine_id: r.machine_id, refill: r.refill })
  })
  const summaryList = Object.values(skuSummary).sort((a, b) => (a.sku_id || "").localeCompare(b.sku_id || ""))

  const lastSync = machineStock.length > 0
    ? machineStock.reduce((latest, s) => { const t = s.synced_at || ""; return t > latest ? t : latest }, "")
    : null

  const machineNameMap = {}
  machines.forEach(m => { machineNameMap[m.machine_id] = m.name || m.machine_id })

  // Helper: นับ refill ต่อตู้ (จำนวน SKU + รวมซอง)
  const machineStats = {}
  myMachineIds.forEach(machId => {
    const items = refillItems.filter(r => r.machine_id === machId)
    const totalPacks = items.reduce((a, r) => {
      const sku = skus.find(s => s.sku_id === r.sku_id)
      return a + (r.isBox ? r.refill * (sku?.packs_per_box || 24) : r.refill)
    }, 0)
    machineStats[machId] = { skuCount: items.length, totalPacks }
  })

  // ── Refill action: FIFO lot balance ต่อ SKU ของ active user ──
  const getSubLots = (skuId) => {
    const lotMap = {}
    myTransfers.filter(t => t.sku_id === skuId && t.lot_number).forEach(t => {
      if (!lotMap[t.lot_number]) lotMap[t.lot_number] = { lot_number: t.lot_number, quantity_packs: 0, transferred_at: t.transferred_at }
      lotMap[t.lot_number].quantity_packs += t.quantity_packs || 0
    })
    const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.transferred_at) - new Date(b.transferred_at))
    const totalOut = myStockOut.filter(so => so.sku_id === skuId).reduce((a, so) => a + (so.quantity_packs || 0), 0)
    let remainOut = totalOut
    return lotsArr.map(r => {
      const used = Math.min(r.quantity_packs, remainOut)
      remainOut -= used
      return { ...r, lotBalance: r.quantity_packs - used }
    })
  }

  const [qtyMap,      setQtyMap]      = useState({})
  const [submitting,  setSubmitting]  = useState(false)
  const [toast,       setToast]       = useState(null)
  const [subView,     setSubView]     = useState("prep") // "prep" | "history"

  // reset subView เมื่อสลับ tab/user
  useEffect(() => { setSubView("prep") }, [activeTab, activeUserId])

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3500) }

  // ห้าม admin เบิกแทน user คนอื่น — เบิกได้เฉพาะตัวเอง
  const canRefill = activeUserId === userId

  const itemKey = (item) => `${item.machine_id}_${item.sku_id}_${item.isBox?"b":"p"}`

  // Reset qtyMap เมื่อสลับ tab/user — default = r.refill (ยอดที่ตู้ต้องการเสมอ ไม่เกี่ยวกับสต็อกฉัน)
  useEffect(() => {
    if (activeTab === "all") { setQtyMap({}); return }
    const q = {}
    refillItems.filter(r => r.machine_id === activeTab).forEach(r => {
      q[itemKey(r)] = r.refill
    })
    setQtyMap(q)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeUserId])

  const getQty = (r) => {
    const v = qtyMap[itemKey(r)]
    return v === undefined ? r.refill : v
  }
  const setQty = (r, next) => {
    const max = r.refill
    const v = Math.max(0, Math.min(max, next))
    setQtyMap(prev => ({ ...prev, [itemKey(r)]: v }))
  }

  const handleBatchSubmit = async (items) => {
    // ข้ามแถวไม่มีสต็อก อัตโนมัติ
    const picks = items.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) > 0)
    if (picks.length === 0) { showToast("ไม่มีรายการที่เบิกได้","error"); return }

    // FIFO lot assignment + validate
    const lotUsage = {} // key: sku_id_lot → packs ที่ใช้ไปแล้วใน batch นี้
    const assignments = []
    for (const r of picks) {
      const qty = getQty(r)
      const sku = skus.find(s => s.sku_id === r.sku_id)
      const packs = r.isBox ? qty * (sku?.packs_per_box || 24) : qty
      const lots = getSubLots(r.sku_id)
      const lot = lots.find(l => {
        const k = `${r.sku_id}_${l.lot_number}`
        return (l.lotBalance - (lotUsage[k] || 0)) >= packs
      })
      if (!lot) {
        showToast(`${r.sku_id}: Lot เดียวไม่พอ ${fmt(packs)} ซอง — ลดจำนวนหรือเบิกแยก`, "error")
        return
      }
      lotUsage[`${r.sku_id}_${lot.lot_number}`] = (lotUsage[`${r.sku_id}_${lot.lot_number}`] || 0) + packs
      assignments.push({ r, qty, packs, lot_number: lot.lot_number })
    }

    try {
      setSubmitting(true)
      const now = new Date().toISOString()
      for (const a of assignments) {
        await onAddStockOut({
          sku_id:        a.r.sku_id,
          lot_number:    a.lot_number,
          machine_id:    a.r.machine_id,
          unit:          a.r.isBox ? "box" : "pack",
          quantity:      a.qty,
          quantity_packs: a.packs,
          withdrawn_at:  now,
          note:          `เบิกจากหน้าเตรียมของเติมตู้ (batch)`,
        })
      }
      showToast(`เบิกสำเร็จ ${assignments.length} รายการ → ${machineNameMap[picks[0].machine_id]}`)
      setQtyMap({})
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally {
      setSubmitting(false)
    }
  }

  // Empty state: ไม่มี user ไหนมี assignment เลย
  if (viewableUsers.length === 0 && !usersWithAssignments.includes(userId)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">เตรียมของเติมตู้</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertTriangle size={32} className="text-amber-400 mx-auto mb-2"/>
          <p className="text-sm text-amber-700">ยังไม่มีการกำหนดตู้ให้ผู้ใช้คนใด กรุณาไปที่ "จัดการผู้ใช้ → กำหนดตู้"</p>
        </div>
      </div>
    )
  }

  if (myMachineIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">เตรียมของเติมตู้</h1>
        {/* Admin switcher */}
        {isAdmin && viewableUsers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">ดูของ:</span>
            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
              {viewableUsers.map(p => (
                <button key={p.id} onClick={() => setViewUserId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeUserId === p.id ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                  {p.display_name || p.email}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertTriangle size={32} className="text-amber-400 mx-auto mb-2"/>
          <p className="text-sm text-amber-700">
            {isAdmin && activeUserId !== userId
              ? `${activeProfile?.display_name || "?"} ยังไม่ได้ถูก assign ตู้`
              : "คุณยังไม่ได้ถูก assign ตู้ กรุณาติดต่อแอดมินเพื่อกำหนดตู้ที่รับผิดชอบ"}
          </p>
        </div>
      </div>
    )
  }

  // Active items ตาม tab
  const activeItems = activeTab === "all" ? refillItems : refillItems.filter(r => r.machine_id === activeTab)
  const activeMachine = activeTab !== "all" ? machines.find(m => m.machine_id === activeTab) : null

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error"?<X size={16}/>:<CheckCircle size={16}/>} {toast.msg}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            เตรียมของเติมตู้
            {isAdmin && activeUserId !== userId && (
              <span className="ml-2 text-base font-normal text-gray-500">· {activeProfile?.display_name || "?"}</span>
            )}
          </h1>
          <p className="text-sm text-gray-400">
            คำนวณจาก VMS เทียบกับสต็อก
            {lastSync && <span className="ml-2">· VMS: {lastSync.slice(0,10)} {lastSync.slice(11,16)}</span>}
          </p>
        </div>
        {/* Admin switcher */}
        {isAdmin && viewableUsers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">ดูของ:</span>
            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
              {viewableUsers.map(p => (
                <button key={p.id} onClick={() => setViewUserId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeUserId === p.id ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                  {p.display_name || p.email}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tab เลือกตู้ */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab("all")}
          className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${activeTab === "all" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
          <span className="flex items-center gap-1.5">
            <ClipboardList size={14}/>
            สรุปรวม
            <span className="text-xs text-gray-400">({refillItems.length})</span>
          </span>
        </button>
        {myMachines.map(m => {
          const stat = machineStats[m.machine_id] || { skuCount: 0, totalPacks: 0 }
          const isActive = activeTab === m.machine_id
          const empty = stat.skuCount === 0
          return (
            <button key={m.machine_id} onClick={() => setActiveTab(m.machine_id)} disabled={empty}
              className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                ${isActive ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
              <span className="flex items-center gap-1.5">
                <Monitor size={14}/>
                {m.name}
                {empty
                  ? <span className="text-xs text-green-600">✓</span>
                  : <span className={`text-xs ${isActive ? "text-orange-500" : "text-gray-400"}`}>({stat.skuCount})</span>
                }
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === "all" ? (
        /* ── สรุปรวมทุกตู้ ── */
        <>
          {/* KPI รวม */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard icon={AlertTriangle} label="ต้องเติม (SKU)" value={summaryList.length} color="red"/>
            <KpiCard icon={Package} label="ตู้รับผิดชอบ" value={`${myMachines.length} ตู้`} color="blue"/>
            <KpiCard icon={Boxes} label="SKU ที่ฉันมี" value={`${Object.values(myBalMap).filter(v => v > 0).length} SKU`} color="purple"/>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3 text-sm">สรุปสินค้าที่ต้องเตรียมทั้งหมด</h2>
            {summaryList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">✓ ตู้ทุกช่องเต็มแล้ว</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                      <th className="text-right py-2 text-xs text-gray-400">ต้องเติม</th>
                      <th className="text-right py-2 text-xs text-gray-400">สต็อกของฉัน</th>
                      <th className="text-center py-2 text-xs text-gray-400">สถานะ</th>
                      <th className="text-left py-2 text-xs text-gray-400 pl-4">ตู้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryList.map(r => {
                      const myBal = myBalMap[r.sku_id] || 0
                      const sku = skus.find(s => s.sku_id === r.sku_id)
                      const refillPacks = r.isBox ? r.totalRefill * (sku?.packs_per_box || 24) : r.totalRefill
                      const enough = myBal >= refillPacks
                      const unit = r.isBox ? "กล่อง" : "ซอง"
                      return (
                        <tr key={r.sku_id + (r.isBox?"b":"p")} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2.5"><span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span></td>
                          <td className="py-2.5 text-right text-sm font-bold text-red-600">{fmt(r.totalRefill)} {unit}</td>
                          <td className="py-2.5 text-right text-sm">
                            <span className={`font-bold ${enough ? "text-green-600" : "text-amber-600"}`}>{fmt(myBal)} ซอง</span>
                          </td>
                          <td className="py-2.5 text-center">
                            {enough
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">พร้อม</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">ไม่พอ</span>}
                          </td>
                          <td className="py-2.5 text-xs text-gray-500 pl-4">
                            {r.machines.map(m => (
                              <span key={m.machine_id} className="inline-block mr-1.5 mb-0.5 px-1.5 py-0.5 bg-gray-100 rounded">
                                {machineNameMap[m.machine_id]}({m.refill})
                              </span>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── ตู้เดียว ── */
        <>
          {/* Sub-tab: เตรียมของ / ประวัติการเบิก */}
          <div className="flex gap-1 border-b-2 border-gray-100">
            <button onClick={() => setSubView("prep")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-all
                ${subView === "prep" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <span className="flex items-center gap-1.5"><ClipboardList size={14}/>เตรียมของ</span>
            </button>
            <button onClick={() => setSubView("history")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-all
                ${subView === "history" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <span className="flex items-center gap-1.5"><Clock size={14}/>ประวัติการเบิก</span>
            </button>
          </div>

          {subView === "history" ? (
            <PageMachineHistory machine={activeMachine} stockOut={stockOut} skus={skus} hideHeader/>
          ) : (<>
          {/* KPI ของตู้นี้ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard icon={Monitor} label="ตู้" value={activeMachine?.name || activeTab}
              sub={activeMachine?.location || ""} color="orange"/>
            <KpiCard icon={AlertTriangle} label="ช่องที่ต้องเติม" value={`${activeItems.length} SKU`} color="red"/>
            <KpiCard icon={Package} label="รวม (ซอง)" value={fmt(machineStats[activeTab]?.totalPacks || 0)} color="blue"/>
            <KpiCard icon={Boxes} label="สต็อกของฉัน"
              value={fmt(Object.values(myBalMap).reduce((a,v) => a + Math.max(0,v), 0))}
              sub="ซอง รวมทุก SKU" color="green"/>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700 text-sm">
                รายการเติม — {activeMachine?.name}
              </h2>
              {activeMachine?.location && <span className="text-xs text-gray-400">{activeMachine.location}</span>}
            </div>
            {activeItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">✓ ตู้นี้ทุกช่องเต็มแล้ว</p>
            ) : (() => {
              const sortedItems = [...activeItems].sort((a,b) => (a.sku_id||"").localeCompare(b.sku_id||""))
              // รวมสรุปต่อ batch — นับเฉพาะแถวที่มีสต็อกและ qty > 0
              const picks = sortedItems.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) > 0)
              const skipped = sortedItems.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) <= 0).length
              const totalPacks = picks.reduce((a, r) => {
                const sku = skus.find(s => s.sku_id === r.sku_id)
                return a + (r.isBox ? getQty(r) * (sku?.packs_per_box || 24) : getQty(r))
              }, 0)
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                          <th className="text-left py-2 text-xs text-gray-400">ช่อง</th>
                          <th className="text-right py-2 text-xs text-gray-400">คงเหลือ/ความจุ</th>
                          <th className="text-center py-2 text-xs text-gray-400 font-bold text-red-500">ต้องเติม</th>
                          <th className="text-right py-2 text-xs text-gray-400">สต็อกฉัน</th>
                          <th className="text-center py-2 text-xs text-gray-400">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedItems.map(r => {
                          const myBal = myBalMap[r.sku_id] || 0
                          const sku = skus.find(s => s.sku_id === r.sku_id)
                          const refillPacks = r.isBox ? r.refill * (sku?.packs_per_box || 24) : r.refill
                          const enough = myBal >= refillPacks
                          const unit = r.isBox ? "กล่อง" : "ซอง"
                          const key = itemKey(r)
                          const qty = getQty(r)
                          const disabled = !canRefill || myBal <= 0
                          const changed = qty !== r.refill

                          return (
                            <tr key={key} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2.5"><span className="font-mono text-xs font-bold">{r.sku_id}</span></td>
                              <td className="py-2.5 text-xs text-gray-500">{r.slotNums.join(", ")}</td>
                              <td className="py-2.5 text-right text-xs text-gray-600">{r.remain} / {r.capacity}</td>
                              <td className="py-2.5">
                                {canRefill ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button type="button" onClick={() => setQty(r, qty - 1)} disabled={disabled || qty <= 0}
                                      title="ลด" aria-label="ลด"
                                      className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-base leading-none flex items-center justify-center">−</button>
                                    <input type="number" min="0" max={r.refill}
                                      value={qty}
                                      onChange={e => setQty(r, parseInt(e.target.value) || 0)}
                                      disabled={disabled}
                                      className={`w-12 text-center font-bold text-sm border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed ${qty === 0 ? "text-gray-400 bg-gray-50" : qty < r.refill ? "text-amber-600" : "text-red-600"}`}/>
                                    <button type="button" onClick={() => setQty(r, qty + 1)} disabled={disabled || qty >= r.refill}
                                      title="เพิ่ม" aria-label="เพิ่ม"
                                      className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-600 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-base leading-none flex items-center justify-center">+</button>
                                    <span className="text-xs text-gray-500 ml-0.5">{unit}</span>
                                    {changed && !disabled && (
                                      <button type="button" onClick={() => setQty(r, r.refill)}
                                        title={`คืนค่าเดิม (${r.refill})`} aria-label="คืนค่าเดิม"
                                        className="w-7 h-7 ml-0.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center">
                                        <RefreshCw size={12}/>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-right text-sm font-bold text-red-600">{fmt(r.refill)} {unit}</div>
                                )}
                                {canRefill && myBal <= 0 && <div className="text-center text-[10px] text-amber-600 mt-1">ไม่มีสต็อก</div>}
                              </td>
                              <td className="py-2.5 text-right text-sm">
                                <span className={`font-bold ${enough ? "text-green-600" : "text-amber-600"}`}>{fmt(myBal)}</span>
                              </td>
                              <td className="py-2.5 text-center">
                                {enough
                                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">พร้อม</span>
                                  : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">ไม่พอ</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {canRefill && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4 bg-orange-50 rounded-xl border border-orange-200">
                      <div className="text-sm">
                        <div className="text-xs text-gray-500">สรุปเบิก → <b>{activeMachine?.name}</b></div>
                        <div className="font-bold text-orange-700">
                          {picks.length === 0
                            ? <span className="text-gray-400 font-normal">ยังไม่ได้เลือกจำนวน</span>
                            : <>{picks.length} SKU · รวม <span className="text-orange-600">{fmt(totalPacks)}</span> ซอง</>}
                        </div>
                        {skipped > 0 && (
                          <div className="text-[11px] text-amber-600 mt-0.5">ข้าม {skipped} SKU (ไม่มีสต็อก)</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => {
                          const q = {}
                          sortedItems.forEach(r => { q[itemKey(r)] = r.refill })
                          setQtyMap(q)
                        }} disabled={submitting}
                          className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                          รีเซ็ตยอด
                        </button>
                        <button onClick={() => handleBatchSubmit(sortedItems)}
                          disabled={submitting || picks.length === 0}
                          className="px-5 py-2 text-sm rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 font-semibold flex items-center gap-1.5 shadow-sm">
                          {submitting ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>}
                          {submitting ? "กำลังบันทึก..." : "ยืนยันเบิกทั้งหมด"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
          </>)}
        </>
      )}
    </div>
  )
}
