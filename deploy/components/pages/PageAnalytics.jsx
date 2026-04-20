import { useState } from "react"
import { BarChart2 } from "lucide-react"
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts"
import { SERIES_COLOR, CHART_COLORS } from "../shared/constants"
import { fmt, fmtB, getLastNDays, fmtDayLabel } from "../shared/helpers"
import { Badge } from "../shared/ui"

export default function PageAnalytics({ sales, skus }) {
  const [metric, setMetric] = useState("revenue")

  const skuMap = {}
  sales.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty:0, rev:0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })

  const ranked = Object.entries(skuMap)
    .map(([id, v]) => {
      const s = skus.find(sk => sk.sku_id === id)
      return { sku_id:id, series:s?.series||"OP", ...v,
        profit: v.rev - v.qty * (s?.avg_cost || s?.cost_price || 0) }
    })
    .sort((a, b) => metric==="revenue" ? b.rev-a.rev : metric==="qty" ? b.qty-a.qty : b.profit-a.profit)

  const top5    = ranked.slice(0, 5).map(r => r.sku_id)
  const last7   = getLastNDays(7)
  const trendData = last7.map(d => {
    const row = { day: fmtDayLabel(d) }
    top5.forEach(skuId => {
      const rows = sales.filter(r => r.sold_at === d && r.sku_id === skuId)
      row[skuId] = rows.reduce((a, r) => a + r.quantity_sold, 0)
    })
    return row
  })

  const seriesData = ["OP","PRB","EB"].map(s => {
    const rows = sales.filter(r => skus.find(sk => sk.sku_id === r.sku_id)?.series === s)
    return { name:s, ยอดขาย: rows.reduce((a, r) => a+r.revenue, 0), ซอง: rows.reduce((a, r) => a+r.quantity_sold, 0) }
  })

  if (sales.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">วิเคราะห์ยอดขาย SKU</h1>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <BarChart2 size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">ยังไม่มีข้อมูลยอดขาย</p>
          <p className="text-gray-300 text-xs mt-1">ข้อมูลจะปรากฏหลัง VMS Scraper ทำงานครั้งแรก</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">วิเคราะห์ยอดขาย SKU</h1>

      {/* Series Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {seriesData.map((s, i) => (
          <div key={s.name} className="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-4">
            <div className="w-3 h-12 rounded-full flex-shrink-0" style={{backgroundColor:Object.values(SERIES_COLOR)[i]}}/>
            <div>
              <Badge series={s.name}/><br/>
              <span className="text-lg font-bold text-gray-800 mt-1 block">{fmtB(s.ยอดขาย)}</span>
              <span className="text-xs text-gray-400">{fmt(s.ซอง)} ซอง</span>
            </div>
          </div>
        ))}
      </div>

      {/* Ranking Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-gray-700">อันดับ SKU ทั้งหมด</h2>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"revenue",l:"รายรับ"},{v:"qty",l:"จำนวน"},{v:"profit",l:"กำไร"}].map(t => (
              <button key={t.v} onClick={() => setMetric(t.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${metric===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs text-gray-400 w-8">#</th>
                <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                <th className="text-center py-2 text-xs text-gray-400 hidden sm:table-cell">Series</th>
                <th className="text-right py-2 text-xs text-gray-400 hidden sm:table-cell">ซองที่ขาย</th>
                <th className="text-right py-2 text-xs text-gray-400">รายรับ</th>
                <th className="text-right py-2 text-xs text-gray-400">กำไร</th>
                <th className="py-2 px-2 text-xs text-gray-400 w-20 hidden sm:table-cell">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const maxRev = ranked[0]?.rev || 1
                const pct = r.rev / maxRev * 100
                return (
                  <tr key={r.sku_id} className={`border-b border-gray-50 hover:bg-gray-50 ${i<3?"bg-yellow-50/30":""}`}>
                    <td className="py-2.5 text-center">
                      {i===0?"🥇":i===1?"🥈":i===2?"🥉":<span className="text-gray-400 text-xs">{i+1}</span>}
                    </td>
                    <td className="py-2.5 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                    <td className="py-2.5 text-center hidden sm:table-cell"><Badge series={r.series}/></td>
                    <td className="py-2.5 text-right font-medium text-gray-700 hidden sm:table-cell">{fmt(r.qty)}</td>
                    <td className="py-2.5 text-right font-semibold text-green-600">{fmtB(r.rev)}</td>
                    <td className="py-2.5 text-right font-semibold text-purple-600">{fmtB(r.profit)}</td>
                    <td className="py-2.5 px-2 hidden sm:table-cell">
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-400" style={{width:`${pct}%`}}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart */}
      {top5.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">แนวโน้มการขาย Top 5 SKU (7 วัน)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{top:0,right:20,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="day" tick={{fontSize:11}}/>
              <YAxis tick={{fontSize:11}}/>
              <Tooltip/>
              <Legend/>
              {top5.map((skuId, i) => (
                <Line key={skuId} type="monotone" dataKey={skuId} stroke={CHART_COLORS[i]} strokeWidth={2} dot={{r:3}}/>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
