import { useState } from "react"
import {
  X, CheckCircle, Package, PlusCircle, MinusCircle, Loader2, Trash2,
} from "lucide-react"
import { fmt, fmtBoxPack, sortSkus, getSkuSeries } from "../shared/helpers"
import KpiCard from "../shared/KpiCard"
import { Badge } from "../shared/ui"

export default function PageMyStock({ transfers, stockOut, skus, profile, session, profiles, machines, machineAssignments, onDeleteTransfer }) {
  const [tab, setTab] = useState("balance") // balance, history_in, history_out
  const isAdmin = profile?.role === "admin"
  const userId = session?.user?.id

  const [deleteTransferId, setDeleteTransferId] = useState(null)
  const [deletingTransfer, setDeletingTransfer] = useState(false)
  const [toast, setToast] = useState(null)
  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3000) }
  const handleDeleteTransfer = async (id) => {
    setDeletingTransfer(true)
    try {
      await onDeleteTransfer(id)
      setDeleteTransferId(null)
      showToast("ลบสำเร็จ — คืนสต็อกหลักแล้ว")
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally { setDeletingTransfer(false) }
  }

  // Admin สามารถเลือกดูสต็อกของคนอื่นได้
  const usersWithTransfers = [...new Set(transfers.map(t => t.to_user_id))]
  const viewableUsers = (profiles || []).filter(p => usersWithTransfers.includes(p.id))
  const [viewUserId, setViewUserId] = useState("")
  // ถ้ายังไม่ได้เลือก → ใช้ตัวเอง (ถ้ามี transfers) หรือคนแรกที่มี
  const defaultUserId = usersWithTransfers.includes(userId) ? userId : (viewableUsers[0]?.id || userId)
  const activeUserId = isAdmin ? (viewUserId || defaultUserId) : userId
  const activeProfile = (profiles || []).find(p => p.id === activeUserId)

  // ตู้ที่ activeUser รับผิดชอบ
  const userAssignments = (machineAssignments || []).filter(a => a.user_id === activeUserId && a.is_active)
  const userMachines = (machines || []).filter(m => userAssignments.some(a => a.machine_id === m.machine_id))

  // สต็อกของ activeUser: transfers ที่ได้รับ - stock_out ที่เบิกออก
  const myTransfers = transfers.filter(t => t.to_user_id === activeUserId)
  const myStockOut = stockOut.filter(so => so.withdrawn_by_user_id === activeUserId)

  // คำนวณยอดคงเหลือต่อ SKU
  const balanceMap = {}
  myTransfers.forEach(t => {
    if (!balanceMap[t.sku_id]) balanceMap[t.sku_id] = { received: 0, withdrawn: 0 }
    balanceMap[t.sku_id].received += t.quantity_packs || 0
  })
  myStockOut.forEach(so => {
    if (!balanceMap[so.sku_id]) balanceMap[so.sku_id] = { received: 0, withdrawn: 0 }
    balanceMap[so.sku_id].withdrawn += so.quantity_packs || 0
  })

  const balanceList = sortSkus(
    Object.entries(balanceMap).map(([sku_id, v]) => ({
      sku_id,
      name: skus.find(s => s.sku_id === sku_id)?.name || sku_id,
      series: getSkuSeries(sku_id),
      received: v.received,
      withdrawn: v.withdrawn,
      balance: v.received - v.withdrawn,
      packs_per_box: skus.find(s => s.sku_id === sku_id)?.packs_per_box || 24,
    }))
  ).filter(r => r.received > 0 || r.withdrawn > 0)

  const totalBalance = balanceList.reduce((a, r) => a + r.balance, 0)
  const totalReceived = balanceList.reduce((a, r) => a + r.received, 0)

  // Lot balance (FIFO)
  const getMyLotBalance = (skuId) => {
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

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error" ? <X size={16}/> : <CheckCircle size={16}/>} {toast.msg}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isAdmin && activeUserId !== userId ? `สต็อกของ ${activeProfile?.display_name || "?"}` : "สต็อกของฉัน"}
          </h1>
          <p className="text-sm text-gray-400">สินค้าที่ได้รับแจกจ่ายมา และประวัติการเบิกออก</p>
        </div>
        {/* Admin: เลือกดูสต็อกของแต่ละคน */}
        {isAdmin && viewableUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">ดูสต็อกของ:</span>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
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

      {/* ตู้ที่รับผิดชอบ */}
      {userMachines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-400 self-center">ตู้ที่รับผิดชอบ:</span>
          {userMachines.map(m => (
            <span key={m.machine_id} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
              {m.name}
            </span>
          ))}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={Package} label="สต็อกคงเหลือ (ซอง)" value={fmt(totalBalance)} color="blue"/>
        <KpiCard icon={PlusCircle} label="รับเข้าทั้งหมด (ซอง)" value={fmt(totalReceived)} color="green"/>
        <KpiCard icon={MinusCircle} label="SKU ที่ถือ" value={`${balanceList.filter(r => r.balance > 0).length} รายการ`} color="purple"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{v:"balance",l:"ยอดคงเหลือ"},{v:"history_in",l:"ประวัติรับเข้า"},{v:"history_out",l:"ประวัติเบิกออก"}].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Tab: ยอดคงเหลือ */}
      {tab === "balance" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {balanceList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีสินค้าในสต็อก</p>
          ) : (
            <div className="space-y-3">
              {balanceList.map(r => {
                const lots = getMyLotBalance(r.sku_id)
                const pct = r.received > 0 ? (r.balance / r.received * 100) : 0
                return (
                  <div key={r.sku_id} className="p-4 rounded-xl border border-gray-100 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge series={r.series}/>
                        <span className="font-mono text-sm font-bold text-gray-800">{r.sku_id}</span>
                        <span className="text-xs text-gray-400">{r.name}</span>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${r.balance < 24 ? "text-amber-600" : "text-green-600"}`}>
                          {fmt(r.balance)} <span className="text-xs font-normal">ซอง</span>
                        </p>
                        <p className="text-xs text-gray-400">{fmtBoxPack(r.balance, r.packs_per_box)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${r.balance < 24 ? "bg-amber-400" : "bg-green-400"}`}
                          style={{width:`${Math.min(100, pct)}%`}}/>
                      </div>
                      <span className="text-xs text-gray-400">{fmt(r.balance)}/{fmt(r.received)}</span>
                    </div>
                    {/* Lot breakdown */}
                    {lots.filter(l => l.lotBalance > 0).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lots.filter(l => l.lotBalance > 0).map(l => (
                          <span key={l.lot_number} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono">
                            {l.lot_number}: {fmt(l.lotBalance)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: ประวัติรับเข้า */}
      {tab === "history_in" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ประวัติรับสินค้าจากสต็อกหลัก ({myTransfers.length})</h2>
          {myTransfers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีประวัติ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs text-gray-400">วันที่</th>
                    <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                    <th className="text-left py-2 text-xs text-gray-400">Lot</th>
                    <th className="text-right py-2 text-xs text-gray-400">จำนวน</th>
                    <th className="text-left py-2 text-xs text-gray-400">ผู้แจกจ่าย</th>
                    <th className="text-left py-2 text-xs text-gray-400">หมายเหตุ</th>
                    {onDeleteTransfer && <th className="text-center py-2 text-xs text-gray-400 w-28">จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...myTransfers].sort((a,b) => (b.transferred_at||"").localeCompare(a.transferred_at||"")).map(t => {
                    const isConfirming = deleteTransferId === t.id
                    return (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 text-xs text-gray-600">{(t.transferred_at||"").slice(0,10)}</td>
                        <td className="py-2"><span className="font-mono text-xs font-bold">{t.sku_id}</span></td>
                        <td className="py-2 text-xs text-gray-500">{t.lot_number || "-"}</td>
                        <td className="py-2 text-right text-xs font-semibold text-green-600">+{fmt(t.quantity_packs)} ซอง</td>
                        <td className="py-2 text-xs text-gray-500">{t.created_by || "-"}</td>
                        <td className="py-2 text-xs text-gray-400">{t.note || "-"}</td>
                        {onDeleteTransfer && (
                          <td className="py-2 text-center">
                            {isConfirming ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => setDeleteTransferId(null)} disabled={deletingTransfer}
                                  className="px-2 py-0.5 text-[10px] rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50">
                                  ยกเลิก
                                </button>
                                <button onClick={() => handleDeleteTransfer(t.id)} disabled={deletingTransfer}
                                  className="px-2 py-0.5 text-[10px] rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                                  {deletingTransfer ? <Loader2 size={9} className="animate-spin"/> : <Trash2 size={9}/>}
                                  ลบ
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteTransferId(t.id)} title="ลบและคืนกลับสต็อกหลัก"
                                className="p-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200">
                                <Trash2 size={12}/>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: ประวัติเบิกออก */}
      {tab === "history_out" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ประวัติเบิกไปเติมตู้ ({myStockOut.length})</h2>
          {myStockOut.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีประวัติ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs text-gray-400">วันที่</th>
                    <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                    <th className="text-left py-2 text-xs text-gray-400">Lot</th>
                    <th className="text-left py-2 text-xs text-gray-400">ตู้ปลายทาง</th>
                    <th className="text-right py-2 text-xs text-gray-400">จำนวน</th>
                    <th className="text-left py-2 text-xs text-gray-400">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...myStockOut].sort((a,b) => (b.withdrawn_at||"").localeCompare(a.withdrawn_at||"")).map(so => (
                    <tr key={so.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-xs text-gray-600">{(so.withdrawn_at||"").slice(0,10)}</td>
                      <td className="py-2"><span className="font-mono text-xs font-bold">{so.sku_id}</span></td>
                      <td className="py-2 text-xs text-gray-500">{so.lot_number || "-"}</td>
                      <td className="py-2 text-xs text-gray-700">{so.machine_id}</td>
                      <td className="py-2 text-right text-xs font-semibold text-red-600">-{fmt(so.quantity_packs)} ซอง</td>
                      <td className="py-2 text-xs text-gray-400">{so.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
