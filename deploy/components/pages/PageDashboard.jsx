import { useState } from "react"
import {
  Package, AlertTriangle, Layers, TrendingUp, Search, Clock,
} from "lucide-react"
import { UNIT_LABEL } from "../shared/constants"
import { fmt, fmtB, fmtBoxPack } from "../shared/helpers"
import KpiCard from "../shared/KpiCard"
import { Badge } from "../shared/ui"

export default function PageDashboard({ stockIn, stockOut, stockBalance, skus }) {
  const [expandedSku, setExpandedSku] = useState(null)
  const [seriesSel,   setSeriesSel]   = useState("ทั้งหมด")
  const [search,      setSearch]      = useState("")

  // Balance map from view
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in:  parseFloat(r.total_in)  || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance:   parseFloat(r.balance)   || 0,
  }]))

  const totalPacks     = stockBalance.reduce((a, r) => a + (parseFloat(r.balance) || 0), 0)
  const lowStock       = skus.filter(s => (balMap[s.sku_id]?.balance || 0) < 24)
  const totalLotValue  = stockIn.reduce((a, r) => a + (parseFloat(r.total_cost) || 0), 0)

  // Lots grouped by SKU (sorted newest first)
  const lotsMap = {}
  stockIn.forEach(r => {
    if (!lotsMap[r.sku_id]) lotsMap[r.sku_id] = []
    lotsMap[r.sku_id].push(r)
  })
  Object.values(lotsMap).forEach(arr =>
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  )

  const SERIES_ORDER = { OP: 0, EB: 1, PRB: 2 }
  const filtered = skus
    .filter(s => s.sku_id.toLowerCase().includes(search.toLowerCase()) ||
                 s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => seriesSel === "ทั้งหมด" || s.series === seriesSel)
    .sort((a, b) => (SERIES_ORDER[a.series] ?? 9) - (SERIES_ORDER[b.series] ?? 9) || a.sku_id.localeCompare(b.sku_id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">ภาพรวมสต็อกสินค้า</h1>
        <p className="text-sm text-gray-400">สต็อกคงเหลือแยกตาม SKU พร้อมประวัติ Lot ต้นทุน</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Package}       label="สต็อกรวม"      value={`${fmt(totalPacks)} ซอง`}    sub={`≈ ${fmt(Math.floor(totalPacks / 12))} กล่อง`} color="blue"/>
        <KpiCard icon={AlertTriangle} label="ใกล้หมด"       value={`${lowStock.length} SKU`}   sub="ต่ำกว่า 24 ซอง"    color="amber"/>
        <KpiCard icon={Layers}        label="Lot ทั้งหมด"   value={`${stockIn.length} Lot`}     sub="รายการรับเข้า"    color="green"/>
        <KpiCard icon={TrendingUp}    label="มูลค่าซื้อรวม" value={fmtB(totalLotValue)}         sub="ต้นทุนสะสมทั้งหมด" color="purple"/>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา SKU..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"/>
        </div>
        <div className="flex gap-1">
          {["ทั้งหมด","OP","PRB","EB"].map(s => (
            <button key={s} onClick={() => setSeriesSel(s)}
              className={`px-3 py-2 text-xs rounded-lg font-medium transition-all ${seriesSel===s?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* SKU Cards — Visual Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered.map(s => {
          const b          = balMap[s.sku_id] || { balance:0, total_in:0, total_out:0 }
          const low        = b.balance < 24
          const lots       = lotsMap[s.sku_id] || []
          const isExpanded = expandedSku === s.sku_id

          // Moving Average Cost (ต้นทุนเฉลี่ยเคลื่อนที่ — ตรึงไว้จนกว่าจะรับของใหม่)
          const avgCpp = s.avg_cost || 0

          // แปลงหน่วยแสดงผล
          const balCotton = Math.floor(b.balance / (12 * s.packs_per_box))
          const balBoxes  = Math.floor((b.balance % (12 * s.packs_per_box)) / s.packs_per_box)
          const balPacks  = b.balance % s.packs_per_box

          // สีของ series
          const seriesBg = { OP: "from-blue-500 to-blue-600", PRB: "from-purple-500 to-purple-600", EB: "from-emerald-500 to-emerald-600" }
          const seriesBgLight = { OP: "from-blue-50 to-blue-100", PRB: "from-purple-50 to-purple-100", EB: "from-emerald-50 to-emerald-100" }

          // Progress
          const maxPacks = lots.reduce((a, r) => a + (r.quantity_packs || 0), 0) || 1
          const pctRemain = Math.min(100, (b.balance / maxPacks) * 100)

          return (
            <div key={s.sku_id} className="flex flex-col">
              {/* Card */}
              <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer
                ${low && b.balance > 0 ? "border-amber-300 ring-1 ring-amber-100" : b.balance === 0 ? "border-red-300 ring-1 ring-red-100" : "border-gray-100"}`}
                onClick={() => setExpandedSku(isExpanded ? null : s.sku_id)}>

                {/* Image area */}
                <div className={`relative h-32 bg-gradient-to-br ${seriesBgLight[s.series] || "from-gray-50 to-gray-100"} flex items-center justify-center overflow-hidden`}>
                  {s.image_url ? (
                    <img src={s.image_url} alt={s.sku_id}
                      className="h-full w-full object-contain p-2"
                      onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
                  ) : null}
                  <div className={`${s.image_url ? 'hidden' : 'flex'} w-16 h-16 rounded-2xl bg-gradient-to-br ${seriesBg[s.series] || "from-gray-400 to-gray-500"} items-center justify-center shadow-lg`}>
                    <span className="text-white font-black text-xs leading-tight text-center">{s.sku_id}</span>
                  </div>
                  {/* Status badge */}
                  {b.balance === 0 && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">หมด</div>
                  )}
                  {low && b.balance > 0 && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">ใกล้หมด</div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge series={s.series}/>
                    <span className="font-mono text-xs font-bold text-gray-700">{s.sku_id}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-3" title={s.name}>{s.name}</p>

                  {/* Stock display */}
                  <div className="space-y-1.5">
                    {balCotton > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Cotton</span>
                        <span className="text-sm font-bold text-gray-800">{fmt(balCotton)}</span>
                      </div>
                    )}
                    {balBoxes > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">กล่อง</span>
                        <span className="text-sm font-bold text-gray-800">{fmt(balBoxes)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">ซอง</span>
                      <span className={`text-sm font-bold ${b.balance === 0 ? "text-red-500" : low ? "text-amber-600" : "text-gray-800"}`}>
                        {balCotton > 0 || balBoxes > 0 ? fmt(balPacks) : fmt(b.balance)}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">รวม</span>
                      <span className={`text-xs font-semibold ${b.balance === 0 ? "text-red-500" : low ? "text-amber-600" : "text-blue-600"}`}>
                        {fmt(b.balance)} ซอง
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${b.balance === 0 ? "bg-red-400" : low ? "bg-amber-400" : "bg-green-400"}`}
                      style={{width:`${pctRemain}%`}}/>
                  </div>

                  {/* Cost */}
                  {avgCpp > 0 && (
                    <p className="text-xs text-purple-500 mt-1.5 text-center">ต้นทุน {fmtB(avgCpp.toFixed(2))}/ซอง</p>
                  )}
                </div>
              </div>

              {/* Expanded Lot detail — below card */}
              {isExpanded && (
                <div className="mt-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden col-span-full">
                  {/* Summary bar */}
                  <div className="px-4 py-3 bg-gray-50 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span className="font-semibold text-gray-600">{s.sku_id} — {s.name}</span>
                    <span className="text-blue-600 font-medium">
                      รับเข้า: {fmtBoxPack(b.total_in, s.packs_per_box)}
                    </span>
                    <span className="text-orange-500 font-medium">
                      เบิกออก: {fmtBoxPack(b.total_out, s.packs_per_box)}
                    </span>
                    {avgCpp > 0 && (
                      <span className="text-purple-600 font-medium">ต้นทุน: {fmtB(avgCpp.toFixed(2))}/ซอง</span>
                    )}
                    <span className="text-gray-500">{lots.length} Lot</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {lots.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูลการรับสินค้า</p>
                    ) : (() => {
                      const activeLots = []
                      const depletedLots = []
                      // FIFO: กระจาย stock_out ทั้งหมดของ SKU ลง lot เรียงจากเก่าสุด
                      const skuTotalOut = stockOut.filter(r => r.sku_id === s.sku_id).reduce((a, r) => a + (r.quantity_packs || 0), 0)
                      const lotsForFifo = [...lots].sort((a, b) => (a.purchased_at || "").localeCompare(b.purchased_at || "") || (a.id || 0) - (b.id || 0))
                      let remainOut = skuTotalOut
                      const fifoBalMap = new Map()
                      lotsForFifo.forEach(lot => {
                        const usedFromLot = Math.min(lot.quantity_packs || 0, remainOut)
                        remainOut -= usedFromLot
                        fifoBalMap.set(lot.id, { lotWithdrawn: usedFromLot, lotBalance: (lot.quantity_packs || 0) - usedFromLot })
                      })
                      lots.forEach(lot => {
                        const fifo = fifoBalMap.get(lot.id) || { lotWithdrawn: 0, lotBalance: lot.quantity_packs || 0 }
                        const lotWithdrawn = fifo.lotWithdrawn
                        const lotBalance = fifo.lotBalance
                        const lotOuts = stockOut.filter(r => r.lot_number === lot.lot_number)
                        const lastOut = lotOuts.length > 0 ? lotOuts.sort((a,b) => (b.withdrawn_at||"").localeCompare(a.withdrawn_at||""))[0] : null
                        const entry = { lot, lotWithdrawn, lotBalance, lastOut }
                        if (lotBalance <= 0) depletedLots.push(entry)
                        else activeLots.push(entry)
                      })
                      return (
                        <>
                          {/* Lot ที่ยังมีสต็อก */}
                          {activeLots.map(({ lot, lotWithdrawn, lotBalance }, i) => {
                            const cpp = (lot.quantity_packs || 0) > 0 ? (parseFloat(lot.total_cost) || 0) / lot.quantity_packs : 0
                            return (
                              <div key={i} className="p-3 rounded-xl border bg-gray-50 border-gray-100">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{lot.lot_number || "ไม่ระบุ"}</span>
                                      <span className="text-xs text-gray-500">{lot.source}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock size={10}/> {lot.purchased_at?.slice(0,10)}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-green-600">{fmtBoxPack(lotBalance, s.packs_per_box)}</p>
                                    <p className="text-xs text-gray-400">{fmt(lotBalance)} ซอง</p>
                                  </div>
                                </div>
                                {lot.quantity_packs > 0 && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                      <div className="h-1.5 rounded-full bg-green-400 transition-all" style={{width:`${Math.max(0,(lotBalance/lot.quantity_packs)*100)}%`}}/>
                                    </div>
                                    <span className="text-xs text-gray-400">{fmt(lotWithdrawn)}/{fmt(lot.quantity_packs)}</span>
                                  </div>
                                )}
                                <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                                  <div>
                                    <p className="text-xs text-gray-400">รับเข้า</p>
                                    <p className="text-xs font-bold text-blue-600">+{fmt(lot.quantity)} {UNIT_LABEL[lot.unit] || lot.unit}</p>
                                    <p className="text-xs text-blue-400">= {fmt(lot.quantity_packs)} ซอง</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">ต้นทุน/ซอง</p>
                                    <p className="text-xs font-bold text-purple-600">{fmtB(cpp.toFixed(2))}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">มูลค่า Lot</p>
                                    <p className="text-xs font-bold text-gray-800">{fmtB(lot.total_cost)}</p>
                                  </div>
                                </div>
                                {lot.note && <p className="text-xs text-gray-400 mt-1.5 italic">"{lot.note}"</p>}
                              </div>
                            )
                          })}

                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
