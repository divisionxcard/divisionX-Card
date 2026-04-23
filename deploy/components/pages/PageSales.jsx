// PageSales — Dark Theme
import { useState } from "react"
import {
  CheckCircle, AlertTriangle, RefreshCw, X, Loader2, ShoppingCart,
  ChevronUp, ChevronDown, TrendingUp, Clock, Layers,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts"
import { CHART_COLORS } from "../shared/constants"
import { fmt, fmtB, getLastNDays, fmtDayLabel, today } from "../shared/helpers"
import { Badge, KpiCard, SectionTitle } from "../shared/dx-components"

// ─────────────────────────────────────────────
// SALES: SKU × Machine breakdown
// ─────────────────────────────────────────────
function SalesSkuByMachine({ sales, machines, skus }) {
  const [expandedMachine, setExpandedMachine] = useState(null)
  const [sortBy, setSortBy] = useState("rev")
  const [dateFilter, setDateFilter] = useState("all")
  const [selectedDate, setSelectedDate] = useState(today())

  const filteredSales = dateFilter === "daily" ? sales.filter(r => r.sold_at === selectedDate) : sales

  const machineSkuMap = {}
  machines.forEach(m => { machineSkuMap[m.machine_id] = {} })
  filteredSales.forEach(r => {
    if (!machineSkuMap[r.machine_id]) machineSkuMap[r.machine_id] = {}
    if (!machineSkuMap[r.machine_id][r.sku_id]) machineSkuMap[r.machine_id][r.sku_id] = { packQty: 0, boxQty: 0, rev: 0 }
    const raw = (r.product_name_raw || "").toLowerCase()
    const isBox = raw.includes("(box)") || raw.split(/\s+/).includes("box")
    if (isBox) machineSkuMap[r.machine_id][r.sku_id].boxQty += 1
    else machineSkuMap[r.machine_id][r.sku_id].packQty += r.quantity_sold || 0
    machineSkuMap[r.machine_id][r.sku_id].rev += r.revenue || 0
  })

  // รวมทุกตู้
  const grandTotal = filteredSales.reduce((a, r) => a + (r.revenue || 0), 0)
  let grandPack = 0, grandBox = 0
  filteredSales.forEach(r => {
    const raw = (r.product_name_raw || "").toLowerCase()
    const isBox = raw.includes("(box)") || raw.split(/\s+/).includes("box")
    if (isBox) grandBox += 1
    else grandPack += r.quantity_sold || 0
  })
  const grandTxn = new Set(filteredSales.map(r => r.transaction_id).filter(Boolean)).size

  return (
    <div className="dx-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
          รายการขายแยก SKU ต่อตู้
          {dateFilter === "daily" && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--dx-text-muted)" }}>
              ({fmtDayLabel(selectedDate)})
            </span>
          )}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ v: "all", l: "ทั้งหมด" }, { v: "daily", l: "รายวัน" }].map(t => (
              <button key={t.v} onClick={() => setDateFilter(t.v)}
                className={`dx-chip ${dateFilter === t.v ? "dx-chip-active" : ""}`}
                style={{ padding: "5px 10px", fontSize: 11 }}>{t.l}</button>
            ))}
          </div>
          {dateFilter === "daily" && (
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="dx-input" style={{ width: "auto", padding: "6px 10px", fontSize: 11 }}/>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            {[{ v: "rev", l: "ยอดขาย" }, { v: "qty", l: "จำนวน" }].map(t => (
              <button key={t.v} onClick={() => setSortBy(t.v)}
                className={`dx-chip ${sortBy === t.v ? "dx-chip-active" : ""}`}
                style={{ padding: "5px 10px", fontSize: 11 }}>{t.l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            <div key={m.machine_id} style={{
              borderRadius: 10, overflow: "hidden",
              border: "1px solid var(--dx-border)",
              background: "var(--dx-bg-input)",
            }}>
              <button onClick={() => setExpandedMachine(isExpanded ? null : m.machine_id)}
                style={{
                  width: "100%", padding: 14,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background .15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 999,
                    background: CHART_COLORS[mi],
                    boxShadow: `0 0 8px ${CHART_COLORS[mi]}`,
                  }}/>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--dx-text)" }}>{m.name}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                      {m.location} · {skuList.length} SKU
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ textAlign: "right" }}>
                    <p className="dx-mono" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--dx-success)" }}>
                      {fmtB(machineTotal)}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                      {fmt(machineTxn)} ธุรกรรม
                      {machineTotalBox > 0 ? ` · ${fmt(machineTotalBox)} กล่อง` : ""}
                      {" · "}{fmt(machineTotalPack)} ซอง
                    </p>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={14} style={{ color: "var(--dx-text-muted)" }}/>
                    : <ChevronDown size={14} style={{ color: "var(--dx-text-muted)" }}/>}
                </div>
              </button>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--dx-border)" }}>
                  {skuList.length === 0 ? (
                    <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "24px 0", fontSize: 12 }}>
                      ไม่มีข้อมูลการขาย
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--dx-bg-elevated)" }}>
                            <Th align="center" style={{ width: 44 }}>#</Th>
                            <Th align="left">SKU</Th>
                            <Th align="left" className="hidden sm:table-cell">ชื่อสินค้า</Th>
                            <Th align="center">Series</Th>
                            <Th align="right" style={{ color: "var(--dx-danger)" }}>กล่อง</Th>
                            <Th align="right">ซอง</Th>
                            <Th align="right">ยอดขาย</Th>
                            <Th align="left" style={{ width: 100 }}>สัดส่วน</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {skuList.map((r, i) => {
                            const maxVal = skuList[0]?.[sortBy] || 1
                            const pct = (r[sortBy] / maxVal) * 100
                            return (
                              <tr key={r.sku_id} style={{
                                borderBottom: "1px solid var(--dx-border)",
                                background: i < 3 ? "rgba(255,200,87,0.03)" : "transparent",
                              }}>
                                <td style={{ padding: "8px 12px", textAlign: "center", fontSize: 13 }}>
                                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉"
                                    : <span className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>{i + 1}</span>}
                                </td>
                                <td className="dx-mono" style={{ padding: "8px 8px", fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>
                                  {r.sku_id}
                                </td>
                                <td className="hidden sm:table-cell" style={{ padding: "8px 8px", fontSize: 11, color: "var(--dx-text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {r.name}
                                </td>
                                <td style={{ padding: "8px 8px", textAlign: "center" }}>
                                  <Badge series={r.series}/>
                                </td>
                                <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, fontWeight: 500, color: r.boxQty > 0 ? "var(--dx-danger)" : "var(--dx-text-muted)" }}>
                                  {r.boxQty > 0 ? fmt(r.boxQty) : "-"}
                                </td>
                                <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, fontWeight: 500, color: r.packQty > 0 ? "var(--dx-cyan-soft)" : "var(--dx-text-muted)" }}>
                                  {r.packQty > 0 ? fmt(r.packQty) : "-"}
                                </td>
                                <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--dx-success)" }}>
                                  {fmtB(r.rev)}
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ height: 3, background: "var(--dx-bg-page)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{
                                      height: "100%", width: `${pct}%`,
                                      background: "linear-gradient(90deg, var(--dx-cyan), var(--dx-cyan-bright))",
                                      boxShadow: "0 0 6px var(--dx-glow)",
                                    }}/>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "var(--dx-bg-elevated)", fontWeight: 600 }}>
                            <td colSpan={4} style={{ padding: "8px 12px", fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.4 }}>
                              รวม {m.name}
                            </td>
                            <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 10, color: "var(--dx-danger)" }}>
                              {fmt(machineTotalBox)} กล่อง
                            </td>
                            <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 10, color: "var(--dx-cyan-bright)" }}>
                              {fmt(machineTotalPack)} ซอง
                            </td>
                            <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 10, color: "var(--dx-success)" }}>
                              {fmtB(machineTotal)}
                            </td>
                            <td/>
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

        {/* รวมทุกตู้ — มุมขวาล่าง */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "10px 16px", borderRadius: 10,
            background: "var(--dx-bg-elevated)",
            border: "1px solid var(--dx-border-glow)",
            boxShadow: "0 0 14px -8px var(--dx-glow)",
          }}>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                รวมทุกตู้{dateFilter === "daily" ? ` · ${fmtDayLabel(selectedDate)}` : ""}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                {fmt(grandTxn)} ธุรกรรม
                {grandBox > 0 ? ` · ${fmt(grandBox)} กล่อง` : ""}
                {" · "}{fmt(grandPack)} ซอง
              </p>
            </div>
            <p className="dx-mono" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--dx-success)" }}>
              {fmtB(grandTotal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PageSales({ machines, sales, skus, claims, onRefresh }) {
  const [viewMode, setViewMode] = useState("daily")
  const [machineSel, setMachineSel] = useState("all")
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)

  const triggerSync = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch("/api/vms-sync", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg({ type: "success", text: "สั่งดึงข้อมูลย้อนหลัง 3 วันสำเร็จ — รอประมาณ 2-3 นาที แล้วกด refresh" })
      } else {
        setSyncMsg({ type: "error", text: data.error || "เกิดข้อผิดพลาด" })
      }
    } catch (err) { setSyncMsg({ type: "error", text: err.message }) }
    finally { setSyncing(false) }
  }

  const filtered = machineSel === "all" ? sales : sales.filter(r => r.machine_id === machineSel)
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

  const skuMap = {}
  filtered.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty: 0, rev: 0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })
  const topSkus = Object.entries(skuMap)
    .sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
    .map(([id, v]) => ({ sku_id: id, ...v }))

  const totalRefund = (claims || []).reduce((a, c) => a + (parseFloat(c.refund_amount) || 0), 0)
  const profit = filtered.reduce((a, r) => {
    const s = skus.find(sk => sk.sku_id === r.sku_id)
    const cost = (s?.avg_cost || s?.cost_price || 0) * (r.quantity_sold || 0)
    return a + (r.revenue || 0) - cost
  }, 0) - totalRefund

  const chartTooltipStyle = {
    background: "var(--dx-bg-elevated)",
    border: "1px solid var(--dx-border-glow)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--dx-text)",
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {syncMsg && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, fontSize: 12,
          background: syncMsg.type === "success" ? "rgba(0,255,136,0.08)" : "rgba(255,68,102,0.08)",
          border: `1px solid ${syncMsg.type === "success" ? "rgba(0,255,136,0.25)" : "rgba(255,68,102,0.25)"}`,
          color: syncMsg.type === "success" ? "var(--dx-success)" : "var(--dx-danger)",
        }}>
          {syncMsg.type === "success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          <span style={{ flex: 1 }}>{syncMsg.text}</span>
          {syncMsg.type === "success" && (
            <button onClick={onRefresh}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: "var(--dx-success)", color: "#0A1628", border: "none", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
              <RefreshCw size={12}/> Refresh
            </button>
          )}
          <button onClick={() => setSyncMsg(null)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--dx-text-muted)", display: "flex" }}>
            <X size={14}/>
          </button>
        </div>
      )}

      <SectionTitle
        pill="Sales · 30 Days"
        title="ยอดขาย"
        subtitle="ข้อมูลธุรกรรมและยอดขายจาก VMS"
        actions={
          <>
            <button onClick={triggerSync} disabled={syncing} className="dx-btn dx-btn-primary"
              style={{ opacity: syncing ? 0.5 : 1, cursor: syncing ? "not-allowed" : "pointer" }}>
              {syncing ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
              {syncing ? "กำลังสั่ง..." : "Sync VMS"}
            </button>
            <select value={machineSel} onChange={e => setMachineSel(e.target.value)}
              className="dx-input" style={{ width: "auto", padding: "9px 12px", fontSize: 12 }}>
              <option value="all">ทุกตู้</option>
              {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ v: "daily", l: "รายวัน" }, { v: "stacked", l: "สะสม" }].map(t => (
                <button key={t.v} onClick={() => setViewMode(t.v)}
                  className={`dx-chip ${viewMode === t.v ? "dx-chip-active" : ""}`}
                  style={{ padding: "6px 12px", fontSize: 11 }}>
                  {t.l}
                </button>
              ))}
            </div>
          </>
        }
      />

      {sales.length === 0 ? (
        <div className="dx-card" style={{ padding: 60, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,212,255,0.05)",
            border: "1px dashed var(--dx-border-glow)",
            color: "var(--dx-cyan)",
          }}>
            <ShoppingCart size={28}/>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dx-text)" }}>ยังไม่มีข้อมูลยอดขาย</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
            ข้อมูลจะปรากฏหลัง VMS Scraper ทำงานครั้งแรก
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <KpiCard icon={TrendingUp} label="ยอดขายรวม (30 วัน)" value={fmtB(totalRev)} accent="success" glow/>
            <KpiCard icon={ShoppingCart} label="จำนวนธุรกรรม" value={fmt(totalTxn)} sub="ครั้ง" accent="cyan"/>
            <KpiCard icon={Layers} label="ซองที่ขาย" value={fmt(totalQty)} sub="ซอง" accent="purple"/>
            <KpiCard icon={Clock} label="เฉลี่ยต่อวัน" value={fmtB(Math.round(totalRev / dayCount))} accent="cyan"/>
            <KpiCard icon={TrendingUp} label="กำไรโดยประมาณ" value={fmtB(profit)} sub="หลังต้นทุน" accent="warning"/>
          </div>

          {/* รายการขายแยก SKU ต่อตู้ */}
          <SalesSkuByMachine sales={filtered} machines={machines} skus={skus}/>

          {/* Daily Chart */}
          <div className="dx-card" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
              ยอดขาย 7 วันล่าสุด · แยกตู้ (บาท)
            </h2>
            <div className="dx-hud-grid" style={{ padding: "4px 0", borderRadius: 8 }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.08)"/>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--dx-text-muted)" }} stroke="var(--dx-border)"/>
                  <YAxis tick={{ fontSize: 11, fill: "var(--dx-text-muted)" }} tickFormatter={v => fmt(v)} stroke="var(--dx-border)"/>
                  <Tooltip formatter={v => fmtB(v)} contentStyle={chartTooltipStyle} labelStyle={{ color: "var(--dx-text-muted)" }}
                    cursor={{ fill: "transparent" }}/>
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--dx-text-secondary)" }}/>
                  {machines.map((m, i) => (
                    <Bar key={m.machine_id} dataKey={m.name} fill={CHART_COLORS[i]}
                      radius={viewMode === "stacked" ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                      stackId={viewMode === "stacked" ? "a" : undefined}/>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top SKUs */}
          {topSkus.length > 0 && (
            <div className="dx-card" style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)", display: "flex", alignItems: "center", gap: 6 }}>
                <TrendingUp size={14} style={{ color: "var(--dx-cyan)" }}/>
                Top SKU · ยอดขายสูงสุด
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topSkus} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.08)" horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--dx-text-muted)" }} tickFormatter={v => fmt(v)} stroke="var(--dx-border)"/>
                  <YAxis type="category" dataKey="sku_id" width={60} tick={{ fontSize: 11, fill: "var(--dx-text-secondary)" }} stroke="var(--dx-border)"/>
                  <Tooltip formatter={(v, n) => [n === "rev" ? fmtB(v) : fmt(v), n === "rev" ? "รายรับ" : "ซอง"]}
                    contentStyle={chartTooltipStyle} labelStyle={{ color: "var(--dx-text-muted)" }}/>
                  <Bar dataKey="rev" name="rev" fill="var(--dx-cyan)" radius={[0, 4, 4, 0]}
                    style={{ filter: "drop-shadow(0 0 4px var(--dx-glow))" }}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Th({ children, align = "left", style, className }) {
  return (
    <th className={className} style={{
      padding: "8px 8px",
      textAlign: align,
      fontSize: 10, fontWeight: 500,
      letterSpacing: 0.5, textTransform: "uppercase",
      color: "var(--dx-text-muted)",
      borderBottom: "1px solid var(--dx-border-strong)",
      ...style,
    }}>
      {children}
    </th>
  )
}
