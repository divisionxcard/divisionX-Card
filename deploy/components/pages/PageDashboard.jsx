// DivisionX Card — Dashboard (Dark Theme version)
// Ported from Claude Design's shell.jsx.DashboardPage + SkuCard + EmptyState
// ใช้ business logic + props เดิมของ pages/PageDashboard.jsx
// แค่เปลี่ยน UI เป็น dark theme โดยใช้ shared/dx-components + globals.css classes

import { useState } from "react"
import {
  Package, AlertTriangle, TrendingUp, Wallet, Search, Plus,
  Download, Filter, RefreshCw, Clock,
} from "lucide-react"
import { fmt, fmtB } from "../shared/helpers"
import { Badge, StatusDot, KpiCard, SectionTitle, BoosterPH } from "../shared/dx-components"

export default function PageDashboardDX({ stockIn, stockOut, stockBalance, skus, transfers = [], onAddLot }) {
  const [expandedSku, setExpandedSku] = useState(null)
  const [seriesSel,   setSeriesSel]   = useState("ทั้งหมด")
  const [search,      setSearch]      = useState("")

  // Balance map from view
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in:  parseFloat(r.total_in)  || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance:   parseFloat(r.balance)   || 0,
  }]))

  const totalPacks    = stockBalance.reduce((a, r) => a + (parseFloat(r.balance) || 0), 0)
  const lowStock      = skus.filter(s => (balMap[s.sku_id]?.balance || 0) < 24)
  const totalLotValue = stockIn.reduce((a, r) => a + (parseFloat(r.total_cost) || 0), 0)

  // มูลค่าคงเหลือรวม = total_cost ของทุก Lot − (packs เบิกออก × cost_per_pack ของ lot นั้น ๆ)
  // ใช้ต้นทุนรับเข้าจริงต่อ lot (ไม่ใช่ avg_cost)
  const lotKey = (sku_id, lot_number) => `${sku_id}__${lot_number || ""}`
  const lotAgg = {}
  stockIn.forEach(r => {
    const k = lotKey(r.sku_id, r.lot_number)
    if (!lotAgg[k]) lotAgg[k] = { packs: 0, cost: 0 }
    lotAgg[k].packs += parseFloat(r.quantity_packs) || 0
    lotAgg[k].cost  += parseFloat(r.total_cost)     || 0
  })
  const cppOf = (sku_id, lot_number) => {
    const info = lotAgg[lotKey(sku_id, lot_number)]
    return info && info.packs > 0 ? info.cost / info.packs : 0
  }
  const transferOutValue = transfers.reduce(
    (a, t) => a + (parseFloat(t.quantity_packs) || 0) * cppOf(t.sku_id, t.lot_number), 0
  )
  const directOutValue = stockOut
    .filter(so => !so.withdrawn_by_user_id)
    .reduce((a, so) => a + (parseFloat(so.quantity_packs) || 0) * cppOf(so.sku_id, so.lot_number), 0)
  const totalRemainingValue = Math.max(0, totalLotValue - transferOutValue - directOutValue)

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
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle
        pill="Live Inventory"
        title="ภาพรวมสต็อกสินค้า"
        subtitle="สต็อกคงเหลือแยกตาม SKU พร้อมประวัติ Lot ต้นทุน"
        actions={
          <>
            <button className="dx-btn dx-btn-ghost"><Download size={14}/>Export</button>
            <button className="dx-btn dx-btn-primary" onClick={onAddLot}><Plus size={14}/>รับของเข้า Lot</button>
          </>
        }
      />

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <KpiCard
          icon={Package}
          label="สต็อกรวม"
          value={`${fmt(totalPacks)}`}
          sub={`ซอง · ≈ ${fmt(Math.floor(totalPacks / 12))} กล่อง`}
          accent="cyan"
          glow
        />
        <KpiCard
          icon={AlertTriangle}
          label="ใกล้หมด"
          value={`${lowStock.length} SKU`}
          sub="ต่ำกว่า 24 ซอง"
          accent="warning"
        />
        <KpiCard
          icon={TrendingUp}
          label="มูลค่าซื้อรวม"
          value={fmtB(totalLotValue)}
          sub="ต้นทุนสะสมทั้งหมด"
          accent="green"
        />
        <KpiCard
          icon={Wallet}
          label="มูลค่าคงเหลือรวม"
          value={fmtB(totalRemainingValue)}
          sub="หลังหักยอดเบิกจ่ายแอดมิน"
          accent="purple"
        />
      </div>

      {/* Filters */}
      <div className="dx-card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--dx-text-muted)", pointerEvents: "none" }}/>
          <input
            className="dx-input"
            style={{ paddingLeft: 36 }}
            placeholder="ค้นหา SKU หรือ ชื่อสินค้า..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["ทั้งหมด", "OP", "PRB", "EB"].map(s => (
            <button
              key={s}
              className={`dx-chip ${seriesSel === s ? "dx-chip-active" : ""}`}
              onClick={() => setSeriesSel(s)}
            >
              {s}
              {s !== "ทั้งหมด" && (
                <span className="dx-mono" style={{ opacity: 0.7, marginLeft: 4 }}>
                  {skus.filter(x => x.series === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 26, background: "var(--dx-border)" }}/>
        <button className="dx-btn dx-btn-ghost"><Filter size={13}/>ตัวกรอง</button>
      </div>

      {/* SKU Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="ไม่พบ SKU ที่ค้นหา"
          subtitle="ลองเปลี่ยนคำค้นหา หรือเลือกชุดอื่น"
          onReset={() => { setSearch(""); setSeriesSel("ทั้งหมด") }}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {filtered.map(sku => (
            <SkuCard
              key={sku.sku_id}
              sku={sku}
              balance={balMap[sku.sku_id]?.balance || 0}
              lots={lotsMap[sku.sku_id] || []}
              stockOut={stockOut}
              expanded={expandedSku === sku.sku_id}
              onToggle={() => setExpandedSku(expandedSku === sku.sku_id ? null : sku.sku_id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SkuCard — dark themed SKU display with expand-to-lots
// ─────────────────────────────────────────────
function SkuCard({ sku, balance, lots, stockOut, expanded, onToggle }) {
  const isEmpty = balance === 0
  const isLow   = !isEmpty && balance < 24
  const ppb     = sku.packs_per_box || 24

  // แยกกล่อง/ซอง
  const boxes = Math.floor(balance / ppb)
  const packs = balance % ppb

  // FIFO — map lots to remaining balance
  const activeLots = (() => {
    if (lots.length === 0) return []
    const skuTotalOut = stockOut
      .filter(r => r.sku_id === sku.sku_id)
      .reduce((a, r) => a + (r.quantity_packs || 0), 0)
    const lotsForFifo = [...lots].sort((a, b) =>
      (a.purchased_at || "").localeCompare(b.purchased_at || "") || (a.id || 0) - (b.id || 0)
    )
    let remainOut = skuTotalOut
    return lotsForFifo
      .map(lot => {
        const used = Math.min(lot.quantity_packs || 0, remainOut)
        remainOut -= used
        return { ...lot, lotBalance: (lot.quantity_packs || 0) - used }
      })
      .filter(l => l.lotBalance > 0)
      .reverse() // newest first
  })()

  const borderColor = isEmpty
    ? "rgba(255,68,102,0.35)"
    : isLow
    ? "rgba(255,200,87,0.35)"
    : "var(--dx-border)"
  const boxShadow = isEmpty
    ? "0 0 20px -10px rgba(255,68,102,0.4)"
    : isLow
    ? "0 0 20px -10px rgba(255,200,87,0.4)"
    : "none"

  return (
    <div
      className="dx-card"
      onClick={onToggle}
      style={{
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        borderColor,
        boxShadow,
      }}
    >
      <div style={{ padding: 10, position: "relative" }}>
        {sku.image_url ? (
          <div style={{
            height: 120,
            borderRadius: 12,
            overflow: "hidden",
            background: "linear-gradient(135deg, rgba(0,212,255,0.1) 0%, #1A2F52 60%, #0F1F3D 100%)",
            border: "1px solid rgba(0,212,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img src={sku.image_url} alt={sku.sku_id}
              style={{ height: "100%", width: "auto", objectFit: "contain", padding: 4 }}/>
          </div>
        ) : (
          <BoosterPH sku={sku.sku_id} series={sku.series}/>
        )}
        {isEmpty && (
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: "var(--dx-danger)", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
            boxShadow: "0 0 12px var(--dx-danger)",
          }}>หมด</div>
        )}
        {isLow && (
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: "var(--dx-warning)", color: "#0A1628",
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
          }}>ใกล้หมด</div>
        )}
      </div>

      <div style={{ padding: "6px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Badge series={sku.series}/>
          <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text-secondary)" }}>
            {sku.sku_id}
          </span>
        </div>
        <div style={{
          fontSize: 12, color: "var(--dx-text-muted)",
          marginBottom: 10,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={sku.name}>
          {sku.name}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, fontSize: 11 }}>
          <div style={{ color: "var(--dx-text-muted)" }}>กล่อง</div>
          <div className="dx-mono" style={{ textAlign: "right", fontWeight: 600, color: "var(--dx-text)" }}>{boxes}</div>
          <div style={{ color: "var(--dx-text-muted)" }}>ซอง</div>
          <div className="dx-mono" style={{ textAlign: "right", fontWeight: 600, color: "var(--dx-text)" }}>{packs}</div>
        </div>

        <div style={{ borderTop: "1px dashed var(--dx-border)", margin: "10px 0 8px" }}/>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>
            รวม
          </span>
          <span className="dx-mono" style={{
            fontSize: 16, fontWeight: 700,
            color: isEmpty ? "var(--dx-danger)" : isLow ? "var(--dx-warning)" : "var(--dx-cyan-bright)",
          }}>
            {fmt(balance)}{" "}
            <span style={{ fontSize: 10, color: "var(--dx-text-muted)", fontWeight: 500 }}>ซอง</span>
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 8, height: 4, background: "var(--dx-bg-input)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, (balance / Math.max(500, balance * 1.2)) * 100)}%`,
            background: isEmpty
              ? "var(--dx-danger)"
              : isLow
              ? "var(--dx-warning)"
              : "linear-gradient(90deg, var(--dx-cyan), var(--dx-cyan-bright))",
            boxShadow: !isEmpty && !isLow ? "0 0 8px var(--dx-glow)" : "none",
          }}/>
        </div>

        {sku.avg_cost > 0 && (
          <div className="dx-mono" style={{ marginTop: 10, fontSize: 10, color: "#B794F6", textAlign: "center" }}>
            ต้นทุน {fmtB(sku.avg_cost.toFixed(2))}/ซอง
          </div>
        )}

        {expanded && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              marginTop: 12, padding: 10,
              background: "var(--dx-bg-input)",
              borderRadius: 10,
              border: "1px solid var(--dx-border)",
            }}
          >
            <div style={{ fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
              Active Lots · {activeLots.length}
            </div>
            {activeLots.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--dx-text-muted)", textAlign: "center", padding: "8px 0" }}>
                ไม่มี lot ที่เหลือสต็อก
              </div>
            ) : (
              activeLots.map((l, i) => {
                const cpp = (l.quantity_packs || 0) > 0
                  ? (parseFloat(l.total_cost) || 0) / l.quantity_packs
                  : 0
                return (
                  <div key={l.id || i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "6px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--dx-border)",
                    fontSize: 11,
                  }}>
                    <div>
                      <div className="dx-mono" style={{ color: "var(--dx-cyan-soft)", fontWeight: 600 }}>
                        {l.lot_number || "—"}
                      </div>
                      <div style={{ color: "var(--dx-text-muted)", fontSize: 10 }}>
                        {(l.purchased_at || "").slice(0, 10)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="dx-mono" style={{ color: "var(--dx-success)", fontWeight: 600 }}>
                        {fmt(l.lotBalance)} ซอง
                      </div>
                      {cpp > 0 && (
                        <div className="dx-mono" style={{ color: "#B794F6", fontSize: 10 }}>
                          ฿{cpp.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────
function EmptyState({ title, subtitle, onReset }) {
  return (
    <div className="dx-card" style={{ padding: 60, textAlign: "center" }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        margin: "0 auto 16px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,212,255,0.05)",
        border: "1px dashed var(--dx-border-glow)",
        color: "var(--dx-cyan)",
      }}>
        <Search size={24}/>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--dx-text)", marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: "var(--dx-text-muted)", marginBottom: 16 }}>
        {subtitle}
      </div>
      {onReset && (
        <button className="dx-btn dx-btn-secondary" onClick={onReset}>
          <RefreshCw size={13}/>ล้างตัวกรอง
        </button>
      )}
    </div>
  )
}
