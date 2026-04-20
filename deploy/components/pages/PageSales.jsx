import { useState } from "react"
import {
  CheckCircle, AlertTriangle, RefreshCw, X, Loader2, ShoppingCart,
  ChevronUp, ChevronDown,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts"
import { CHART_COLORS } from "../shared/constants"
import { fmt, fmtB, getLastNDays, fmtDayLabel, today } from "../shared/helpers"
import { Badge } from "../shared/ui"

// ─────────────────────────────────────────────
// SALES: SKU × Machine breakdown
// ─────────────────────────────────────────────
function SalesSkuByMachine({ sales, machines, skus }) {
  const [expandedMachine, setExpandedMachine] = useState(null)
  const [sortBy, setSortBy] = useState("rev") // rev, qty
  const [dateFilter, setDateFilter] = useState("all") // all, daily
  const [selectedDate, setSelectedDate] = useState(today())

  // วันที่ที่มีข้อมูล (สำหรับ quick nav)
  const availDates = [...new Set(sales.map(r => r.sold_at).filter(Boolean))].sort().reverse()

  // กรองตามวัน
  const filteredSales = dateFilter === "daily"
    ? sales.filter(r => r.sold_at === selectedDate)
    : sales

  // สร้าง map: machine → sku → { packQty, boxQty, rev }
  // packQty = จำนวนซองจากการขายแบบซองเท่านั้น (ไม่รวมกล่อง)
  // boxQty  = จำนวนกล่องจากการขายแบบกล่อง
  const machineSkuMap = {}
  machines.forEach(m => { machineSkuMap[m.machine_id] = {} })
  filteredSales.forEach(r => {
    if (!machineSkuMap[r.machine_id]) machineSkuMap[r.machine_id] = {}
    if (!machineSkuMap[r.machine_id][r.sku_id]) machineSkuMap[r.machine_id][r.sku_id] = { packQty:0, boxQty:0, rev:0 }
    const raw = (r.product_name_raw || "").toLowerCase()
    const isBox = raw.includes("(box)") || raw.split(/\s+/).includes("box")
    if (isBox) {
      machineSkuMap[r.machine_id][r.sku_id].boxQty += 1
    } else {
      machineSkuMap[r.machine_id][r.sku_id].packQty += r.quantity_sold || 0
    }
    machineSkuMap[r.machine_id][r.sku_id].rev += r.revenue || 0
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-700">
          รายการขายแยก SKU ต่อตู้
          {dateFilter === "daily" && <span className="text-sm font-normal text-gray-400 ml-2">({fmtDayLabel(selectedDate)})</span>}
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          {/* ตัวกรองวัน */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"all",l:"ทั้งหมด"},{v:"daily",l:"รายวัน"}].map(t => (
              <button key={t.v} onClick={() => setDateFilter(t.v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${dateFilter===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
          {dateFilter === "daily" && (
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          )}
          {/* เรียงลำดับ */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"rev",l:"ยอดขาย"},{v:"qty",l:"จำนวน"}].map(t => (
              <button key={t.v} onClick={() => setSortBy(t.v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${sortBy===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {machines.map((m, mi) => {
          const skuData = machineSkuMap[m.machine_id] || {}
          const skuList = Object.entries(skuData)
            .map(([skuId, v]) => {
              const s = skus.find(sk => sk.sku_id === skuId)
              return { sku_id: skuId, series: s?.series || "OP", name: s?.name || skuId, ...v }
            })
            .sort((a, b) => sortBy === "rev" ? b.rev - a.rev : b.qty - a.qty)
          const machineTotal = skuList.reduce((a, r) => a + r.rev, 0)
          const machineTotalPack = skuList.reduce((a, r) => a + r.packQty, 0)
          const machineTotalBox = skuList.reduce((a, r) => a + r.boxQty, 0)
          const machineTxn = new Set(filteredSales.filter(r => r.machine_id === m.machine_id).map(r => r.transaction_id).filter(Boolean)).size
          const isExpanded = expandedMachine === m.machine_id

          return (
            <div key={m.machine_id} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* Machine header */}
              <button onClick={() => setExpandedMachine(isExpanded ? null : m.machine_id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: CHART_COLORS[mi]}}/>
                  <div className="text-left">
                    <p className="font-semibold text-sm text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.location} · {skuList.length} SKU</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{fmtB(machineTotal)}</p>
                    <p className="text-xs text-gray-400">{fmt(machineTxn)} ธุรกรรม · {machineTotalBox > 0 ? `${fmt(machineTotalBox)} กล่อง · ` : ""}{fmt(machineTotalPack)} ซอง</p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                </div>
              </button>

              {/* SKU list */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {skuList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูลการขาย</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left py-2 px-4 text-xs text-gray-400 font-medium">#</th>
                            <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">SKU</th>
                            <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">ชื่อสินค้า</th>
                            <th className="text-center py-2 px-2 text-xs text-gray-400 font-medium">Series</th>
                            <th className="text-right py-2 px-2 text-xs text-red-400 font-medium">กล่องที่ขาย</th>
                            <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium">ซองที่ขาย</th>
                            <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium">ยอดขาย</th>
                            <th className="py-2 px-4 text-xs text-gray-400 font-medium w-24">สัดส่วน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {skuList.map((r, i) => {
                            const maxVal = skuList[0]?.[sortBy] || 1
                            const pct = (r[sortBy] / maxVal) * 100
                            return (
                              <tr key={r.sku_id} className={`border-b border-gray-50 hover:bg-gray-50 ${i < 3 ? "bg-yellow-50/30" : ""}`}>
                                <td className="py-2 px-4 text-center">
                                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":<span className="text-gray-400 text-xs">{i+1}</span>}
                                </td>
                                <td className="py-2 px-2 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                                <td className="py-2 px-2 text-xs text-gray-500 truncate max-w-[120px]">{r.name}</td>
                                <td className="py-2 px-2 text-center"><Badge series={r.series}/></td>
                                <td className="py-2 px-2 text-right font-medium text-red-500">{r.boxQty > 0 ? fmt(r.boxQty) : "-"}</td>
                                <td className="py-2 px-2 text-right font-medium text-blue-600">{r.packQty > 0 ? fmt(r.packQty) : "-"}</td>
                                <td className="py-2 px-2 text-right font-semibold text-green-600">{fmtB(r.rev)}</td>
                                <td className="py-2 px-4">
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{width:`${pct}%`}}/>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={4} className="py-2 px-4 text-xs text-gray-500">รวม {m.name}</td>
                            <td className="py-2 px-2 text-right text-red-600 text-xs">{fmt(machineTotalBox)} กล่อง</td>
                            <td className="py-2 px-2 text-right text-blue-700 text-xs">{fmt(machineTotalPack)} ซอง</td>
                            <td className="py-2 px-2 text-right text-green-700 text-xs">{fmtB(machineTotal)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PageSales({ machines, sales, skus, claims, onRefresh }) {
  const [viewMode, setViewMode]   = useState("daily")
  const [machineSel, setMachineSel] = useState("all")
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState(null)

  const triggerSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch("/api/vms-sync", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg({ type:"success", text:"สั่งดึงข้อมูลย้อนหลัง 3 วันสำเร็จ — รอประมาณ 2-3 นาที แล้วกด refresh" })
      } else {
        setSyncMsg({ type:"error", text: data.error || "เกิดข้อผิดพลาด" })
      }
    } catch (err) {
      setSyncMsg({ type:"error", text: err.message })
    } finally {
      setSyncing(false)
    }
  }

  const filtered = machineSel === "all" ? sales : sales.filter(r => r.machine_id === machineSel)

  // Last 7 days chart per machine
  const last7 = getLastNDays(7)
  const dailyData = last7.map(d => {
    const row = { day: fmtDayLabel(d) }
    machines.forEach(m => {
      const rows = sales.filter(r => r.sold_at === d && r.machine_id === m.machine_id)
      row[m.name] = rows.reduce((a, r) => a + r.revenue, 0)
    })
    return row
  })

  const totalRev = filtered.reduce((a, r) => a + r.revenue, 0)
  const totalQty = filtered.reduce((a, r) => a + r.quantity_sold, 0)
  const totalTxn = new Set(filtered.map(r => r.transaction_id).filter(Boolean)).size
  const dayCount = Math.max(1, [...new Set(filtered.map(r => r.sold_at))].length)

  // Top SKUs
  const skuMap = {}
  filtered.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty:0, rev:0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })
  const topSkus = Object.entries(skuMap)
    .sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
    .map(([id, v]) => ({ sku_id: id, ...v }))

  // Profit estimate (หักยอดคืนเงินจากเคลม)
  const totalRefund = (claims || []).reduce((a, c) => a + (parseFloat(c.refund_amount) || 0), 0)
  const profit = filtered.reduce((a, r) => {
    const s = skus.find(sk => sk.sku_id === r.sku_id)
    const cost = (s?.avg_cost || s?.cost_price || 0) * (r.quantity_sold || 0)
    return a + (r.revenue || 0) - cost
  }, 0) - totalRefund

  return (
    <div className="space-y-6">
      {/* Sync message */}
      {syncMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${syncMsg.type==="success"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {syncMsg.type==="success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          <span className="flex-1">{syncMsg.text}</span>
          {syncMsg.type==="success" && (
            <button onClick={onRefresh} className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 flex items-center gap-1">
              <RefreshCw size={12}/> Refresh
            </button>
          )}
          <button onClick={() => setSyncMsg(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">ยอดขาย (30 วันล่าสุด)</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {/* ปุ่มดึงข้อมูล VMS */}
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {syncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            {syncing ? "กำลังสั่ง..." : "ดึงข้อมูล VMS"}
          </button>
          <select value={machineSel} onChange={e => setMachineSel(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">ทุกตู้</option>
            {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
          </select>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"daily",l:"รายวัน"},{v:"stacked",l:"สะสม"}].map(t => (
              <button key={t.v} onClick={() => setViewMode(t.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <ShoppingCart size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">ยังไม่มีข้อมูลยอดขาย</p>
          <p className="text-gray-300 text-xs mt-1">ข้อมูลจะปรากฏหลัง VMS Scraper ทำงานครั้งแรก</p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">ยอดขายรวม (30 วัน)</p>
              <p className="text-xl font-bold text-green-600 mt-1">{fmtB(totalRev)}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">จำนวนธุรกรรม</p>
              <p className="text-xl font-bold text-indigo-600 mt-1">{fmt(totalTxn)} <span className="text-sm font-normal text-gray-400">ครั้ง</span></p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">จำนวนซองที่ขาย</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{fmt(totalQty)} ซอง</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">เฉลี่ยต่อวัน</p>
              <p className="text-xl font-bold text-purple-600 mt-1">{fmtB(Math.round(totalRev/dayCount))}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">กำไรโดยประมาณ</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{fmtB(profit)}</p>
            </div>
          </div>

          {/* Daily Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย 7 วันล่าสุด แยกตู้ (บาท)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyData} margin={{top:0,right:10,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="day" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:11}} tickFormatter={v => fmt(v)}/>
                <Tooltip formatter={v => fmtB(v)}/>
                <Legend/>
                {machines.map((m, i) => (
                  <Bar key={m.machine_id} dataKey={m.name} fill={CHART_COLORS[i]}
                    radius={viewMode==="stacked" ? [0,0,0,0] : [4,4,0,0]}
                    stackId={viewMode==="stacked" ? "a" : undefined}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top SKUs */}
          {topSkus.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Top SKU ยอดขายสูงสุด</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topSkus} layout="vertical" margin={{top:0,right:30,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11}} tickFormatter={v => fmt(v)}/>
                  <YAxis type="category" dataKey="sku_id" width={60} tick={{fontSize:11}}/>
                  <Tooltip formatter={(v, n) => [n==="rev" ? fmtB(v) : fmt(v), n==="rev"?"รายรับ":"ซอง"]}/>
                  <Bar dataKey="rev" name="rev" fill="#3b82f6" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* รายการขายแยก SKU ต่อตู้ */}
          <SalesSkuByMachine sales={filtered} machines={machines} skus={skus}/>
        </>
      )}
    </div>
  )
}
