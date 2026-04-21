// PageAnalytics — Dark Theme
import { useState } from "react"
import { BarChart2 } from "lucide-react"
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts"
import { CHART_COLORS } from "../shared/constants"
import { fmt, fmtB, getLastNDays, fmtDayLabel } from "../shared/helpers"
import { Badge, SectionTitle } from "../shared/dx-components"

const SERIES_DARK = { OP: "#4FC3F7", PRB: "#B794F6", EB: "#68D391" }

export default function PageAnalytics({ sales, skus }) {
  const [metric, setMetric] = useState("revenue")

  const skuMap = {}
  sales.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty: 0, rev: 0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })

  const ranked = Object.entries(skuMap)
    .map(([id, v]) => {
      const s = skus.find(sk => sk.sku_id === id)
      return { sku_id: id, series: s?.series || "OP", ...v,
        profit: v.rev - v.qty * (s?.avg_cost || s?.cost_price || 0) }
    })
    .sort((a, b) => metric === "revenue" ? b.rev - a.rev : metric === "qty" ? b.qty - a.qty : b.profit - a.profit)

  const top5 = ranked.slice(0, 5).map(r => r.sku_id)
  const last7 = getLastNDays(7)
  const trendData = last7.map(d => {
    const row = { day: fmtDayLabel(d) }
    top5.forEach(skuId => {
      const rows = sales.filter(r => r.sold_at === d && r.sku_id === skuId)
      row[skuId] = rows.reduce((a, r) => a + r.quantity_sold, 0)
    })
    return row
  })

  const seriesData = ["OP", "PRB", "EB"].map(s => {
    const rows = sales.filter(r => skus.find(sk => sk.sku_id === r.sku_id)?.series === s)
    return { name: s, ยอดขาย: rows.reduce((a, r) => a + r.revenue, 0), ซอง: rows.reduce((a, r) => a + r.quantity_sold, 0) }
  })

  if (sales.length === 0) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <SectionTitle pill="Analytics" title="วิเคราะห์ยอดขาย SKU"/>
        <div className="dx-card" style={{ padding: 60, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,212,255,0.05)",
            border: "1px dashed var(--dx-border-glow)",
            color: "var(--dx-cyan)",
          }}>
            <BarChart2 size={28}/>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dx-text)" }}>
            ยังไม่มีข้อมูลยอดขาย
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
            ข้อมูลจะปรากฏหลัง VMS Scraper ทำงานครั้งแรก
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle pill="Analytics" title="วิเคราะห์ยอดขาย SKU" subtitle="แยกตาม series · ranking ยอดขาย · กำไร"/>

      {/* Series Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {seriesData.map((s) => {
          const c = SERIES_DARK[s.name]
          return (
            <div key={s.name} className="dx-card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
              <div style={{
                position: "absolute", top: 0, left: 0, bottom: 0,
                width: 3, background: c, boxShadow: `0 0 12px ${c}`,
              }}/>
              <div style={{ marginLeft: 12 }}>
                <Badge series={s.name}/>
                <div className="dx-mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--dx-text)", marginTop: 10 }}>
                  {fmtB(s.ยอดขาย)}
                </div>
                <div style={{ fontSize: 11, color: "var(--dx-text-muted)", marginTop: 4 }}>
                  {fmt(s.ซอง)} ซอง
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Ranking Table */}
      <div className="dx-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            อันดับ SKU ทั้งหมด
          </h2>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ v: "revenue", l: "รายรับ" }, { v: "qty", l: "จำนวน" }, { v: "profit", l: "กำไร" }].map(t => (
              <button key={t.v} onClick={() => setMetric(t.v)}
                className={`dx-chip ${metric === t.v ? "dx-chip-active" : ""}`}
                style={{ padding: "6px 12px", fontSize: 11 }}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                <Th align="left" style={{ width: 40 }}>#</Th>
                <Th align="left">SKU</Th>
                <Th align="center" hideOnMobile>Series</Th>
                <Th align="right" hideOnMobile>ซองที่ขาย</Th>
                <Th align="right">รายรับ</Th>
                <Th align="right">กำไร</Th>
                <Th align="center" hideOnMobile style={{ width: 100 }}>สัดส่วน</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const maxRev = ranked[0]?.rev || 1
                const pct = r.rev / maxRev * 100
                const isTop3 = i < 3
                return (
                  <tr key={r.sku_id} style={{
                    borderBottom: "1px solid var(--dx-border)",
                    background: isTop3 ? "rgba(255,200,87,0.03)" : "transparent",
                  }}>
                    <td style={{ padding: "10px 10px", textAlign: "center", fontSize: 14 }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉"
                        : <span className="dx-mono" style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>{i + 1}</span>}
                    </td>
                    <td className="dx-mono" style={{ padding: "10px 10px", fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>
                      {r.sku_id}
                    </td>
                    <TdHideOnMobile align="center">
                      <Badge series={r.series}/>
                    </TdHideOnMobile>
                    <TdHideOnMobile align="right">
                      <span className="dx-mono" style={{ fontSize: 12, color: "var(--dx-text-secondary)" }}>
                        {fmt(r.qty)}
                      </span>
                    </TdHideOnMobile>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>
                      <span className="dx-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--dx-success)" }}>
                        {fmtB(r.rev)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>
                      <span className="dx-mono" style={{ fontSize: 12, fontWeight: 600, color: "#B794F6" }}>
                        {fmtB(r.profit)}
                      </span>
                    </td>
                    <TdHideOnMobile>
                      <div style={{ height: 4, background: "var(--dx-bg-input)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: "linear-gradient(90deg, var(--dx-cyan), var(--dx-cyan-bright))",
                          boxShadow: "0 0 6px var(--dx-glow)",
                        }}/>
                      </div>
                    </TdHideOnMobile>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart */}
      {top5.length > 0 && (
        <div className="dx-card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            แนวโน้มการขาย Top 5 SKU (7 วัน)
          </h2>
          <div className="dx-hud-grid" style={{ padding: "8px 4px 0", borderRadius: 8 }}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.08)"/>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--dx-text-muted)" }} stroke="var(--dx-border)"/>
                <YAxis tick={{ fontSize: 11, fill: "var(--dx-text-muted)" }} stroke="var(--dx-border)"/>
                <Tooltip
                  contentStyle={{
                    background: "var(--dx-bg-elevated)",
                    border: "1px solid var(--dx-border-glow)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--dx-text)",
                  }}
                  labelStyle={{ color: "var(--dx-text-muted)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--dx-text-secondary)" }}/>
                {top5.map((skuId, i) => (
                  <Line key={skuId} type="monotone" dataKey={skuId} stroke={CHART_COLORS[i]} strokeWidth={2}
                    dot={{ r: 3, fill: CHART_COLORS[i] }}
                    style={{ filter: `drop-shadow(0 0 3px ${CHART_COLORS[i]})` }}/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = "left", hideOnMobile, style }) {
  return (
    <th className={hideOnMobile ? "hidden sm:table-cell" : undefined} style={{
      padding: "10px 10px",
      textAlign: align,
      fontSize: 10, fontWeight: 500,
      letterSpacing: 0.5, textTransform: "uppercase",
      color: "var(--dx-text-muted)",
      ...style,
    }}>
      {children}
    </th>
  )
}

function TdHideOnMobile({ children, align = "left" }) {
  return (
    <td className="hidden sm:table-cell" style={{ padding: "10px 10px", textAlign: align }}>
      {children}
    </td>
  )
}
