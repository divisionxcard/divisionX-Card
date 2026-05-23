// DivisionX Card — Dashboard (Dark Theme version)
// Ported from Claude Design's shell.jsx.DashboardPage + SkuCard + EmptyState
// ใช้ business logic + props เดิมของ pages/PageDashboard.jsx
// แค่เปลี่ยน UI เป็น dark theme โดยใช้ shared/dx-components + globals.css classes

import { useState, useMemo, Fragment } from "react"
import {
  Package, AlertTriangle, TrendingUp, Wallet, Search, Plus,
  Download, Filter, RefreshCw, Clock,
  Users, Warehouse, Home, Monitor, ChevronDown, ChevronRight, ArrowDownUp,
} from "lucide-react"
import { fmt, fmtB, today, toBkkDate, fmtDayLabel } from "../shared/helpers"
import { Badge, StatusDot, KpiCard, SectionTitle, BoosterPH } from "../shared/dx-components"
import SlotChangesAlert from "../shared/SlotChangesAlert"
import AIInsightWidget from "../shared/AIInsightWidget"

export default function PageDashboardDX({ stockIn, stockOut, stockBalance, skus, transfers = [], machineStock = [], sales = [], machines = [], onAddLot, profile }) {
  const isAdmin = profile?.role === "admin"
  const [expandedSku, setExpandedSku] = useState(null)
  const [seriesSel,   setSeriesSel]   = useState("ทั้งหมด")
  const [search,      setSearch]      = useState("")

  // Balance map from view (main warehouse)
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in:  parseFloat(r.total_in)  || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance:   parseFloat(r.balance)   || 0,
  }]))

  const totalPacks    = stockBalance.reduce((a, r) => a + (parseFloat(r.balance) || 0), 0)
  const lowStock      = skus.filter(s => (balMap[s.sku_id]?.balance || 0) < 24)
  const totalLotValue = stockIn.reduce((a, r) => a + (parseFloat(r.total_cost) || 0), 0)

  // ── Lot cost aggregation (ต้นทุนต่อซองของแต่ละ lot จริง ไม่ใช่ avg_cost)
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

  // ── #6 Main value = total_cost − transferred − direct_stock_out (by lot cost)
  const transferOutValue = transfers.reduce(
    (a, t) => a + (parseFloat(t.quantity_packs) || 0) * cppOf(t.sku_id, t.lot_number), 0
  )
  const directOutValue = stockOut
    .filter(so => !so.withdrawn_by_user_id)
    .reduce((a, so) => a + (parseFloat(so.quantity_packs) || 0) * cppOf(so.sku_id, so.lot_number), 0)
  const totalMainValue = Math.max(0, totalLotValue - transferOutValue - directOutValue)

  // ── #3 User value = Σ (user lot balance × cost_per_pack of lot) ทุก user
  const usersWithTransfers = [...new Set(transfers.map(t => t.to_user_id).filter(Boolean))]
  const totalUserValue = usersWithTransfers.reduce((grand, uid) => {
    const uTransfers = transfers.filter(t => t.to_user_id === uid)
    const uStockOut  = stockOut.filter(so => so.withdrawn_by_user_id === uid)
    const uSkus = [...new Set(uTransfers.map(t => t.sku_id))]
    return grand + uSkus.reduce((sumSku, skuId) => {
      const lotMap = {}
      uTransfers.filter(t => t.sku_id === skuId && t.lot_number).forEach(t => {
        if (!lotMap[t.lot_number]) lotMap[t.lot_number] = { lot_number: t.lot_number, packs: 0, transferred_at: t.transferred_at }
        lotMap[t.lot_number].packs += t.quantity_packs || 0
      })
      const lots = Object.values(lotMap).sort((a, b) => new Date(a.transferred_at) - new Date(b.transferred_at))
      const totalOut = uStockOut.filter(so => so.sku_id === skuId).reduce((a, so) => a + (so.quantity_packs || 0), 0)
      let remainOut = totalOut
      return sumSku + lots.reduce((s, lot) => {
        const used = Math.min(lot.packs, remainOut)
        remainOut -= used
        return s + (lot.packs - used) * cppOf(skuId, lot.lot_number)
      }, 0)
    }, 0)
  }, 0)

  // ── #7 Machine value = Σ machine_stock.remain × skus.avg_cost
  //    Box slots (product_name มี 'box') → remain เป็นกล่อง · ต้อง × packs_per_box
  const skuAvgCostMap = Object.fromEntries(skus.map(s => [s.sku_id, parseFloat(s.avg_cost) || 0]))
  const skuPpbForMachine = Object.fromEntries(skus.map(s => [s.sku_id, parseInt(s.packs_per_box) || 24]))
  const slotPacks = (slot) => {
    const remain = parseInt(slot.remain) || 0
    const isBox = (slot.product_name || "").toLowerCase().includes("box")
    return isBox ? remain * (skuPpbForMachine[slot.sku_id] || 24) : remain
  }
  const totalMachineValue = machineStock.reduce((sum, slot) => {
    return sum + slotPacks(slot) * (skuAvgCostMap[slot.sku_id] || 0)
  }, 0)

  // ── #4 Breakdown: Main / User / ตู้ packs by SKU → boxes + packs
  const skuPpbMap = Object.fromEntries(skus.map(s => [s.sku_id, s.packs_per_box || 24]))
  const toBoxesPacks = (packsBySku) => {
    let boxes = 0, packs = 0
    Object.entries(packsBySku).forEach(([sid, p]) => {
      const ppb = skuPpbMap[sid] || 24
      const n = Math.max(0, p)
      boxes += Math.floor(n / ppb)
      packs += n % ppb
    })
    return { boxes, packs }
  }
  // Main packs by SKU (จาก view)
  const mainPacksBySku = Object.fromEntries(stockBalance.map(r => [r.sku_id, parseFloat(r.balance) || 0]))
  // User packs by SKU (transfers - user stock_out)
  const userPacksBySku = {}
  transfers.forEach(t => {
    userPacksBySku[t.sku_id] = (userPacksBySku[t.sku_id] || 0) + (t.quantity_packs || 0)
  })
  stockOut.filter(so => so.withdrawn_by_user_id).forEach(so => {
    userPacksBySku[so.sku_id] = (userPacksBySku[so.sku_id] || 0) - (so.quantity_packs || 0)
  })
  // Machine packs by SKU (with box conversion)
  const machinePacksBySku = {}
  machineStock.forEach(slot => {
    if (!slot.sku_id) return
    machinePacksBySku[slot.sku_id] = (machinePacksBySku[slot.sku_id] || 0) + slotPacks(slot)
  })
  const mainBP    = toBoxesPacks(mainPacksBySku)
  const userBP    = toBoxesPacks(userPacksBySku)
  const machineBP = toBoxesPacks(machinePacksBySku)

  // Lots grouped by SKU (sorted newest first)
  const lotsMap = {}
  stockIn.forEach(r => {
    if (!lotsMap[r.sku_id]) lotsMap[r.sku_id] = []
    lotsMap[r.sku_id].push(r)
  })
  Object.values(lotsMap).forEach(arr =>
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  )

  const SERIES_ORDER = { OP: 0, PRB: 1, EB: 2 }
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
        actions={isAdmin ? (
          <>
            <button className="dx-btn dx-btn-ghost"><Download size={14}/>Export</button>
            <button className="dx-btn dx-btn-primary" onClick={onAddLot}><Plus size={14}/>รับของเข้า Lot</button>
          </>
        ) : null}
      />

      {/* Layer 4: Slot Changes Alert (admin only · auto-hide ถ้าไม่มี change) */}
      {isAdmin && <SlotChangesAlert days={7}/>}

      {/* KPI Grid — admin: 4 cols w/ tall card #4; user: simple 2 cards */}
      {isAdmin ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
          {/* Mobile order: 1=สต็อกรวม, 2=ใกล้หมด, 3=ซื้อรวม, 4=Main, 5=User, 6=ทุกตู้, 7=composite */}
          {/* #1 สต็อกรวม (ซอง) */}
          <KpiCard
            compact
            className="order-1 md:order-none"
            icon={Package}
            label="สต็อกรวม"
            value={fmt(totalPacks)}
            sub={`ซอง · ≈ ${fmt(Math.floor(totalPacks / 24))} กล่อง`}
            accent="cyan"
            glow
          />
          {/* #2 มูลค่าซื้อรวม */}
          <KpiCard
            compact
            className="order-3 md:order-none"
            icon={TrendingUp}
            label="มูลค่าซื้อรวม"
            value={fmtB(totalLotValue)}
            sub="ต้นทุนสะสมทั้งหมด"
            accent="green"
          />
          {/* #3 มูลค่าสต็อกรวมทุก User */}
          <KpiCard
            compact
            className="order-5 md:order-none"
            icon={Users}
            label="มูลค่าสต็อกรวมทุก User"
            value={fmtB(totalUserValue)}
            sub="ของที่แอดมินถืออยู่ก่อนเติมตู้"
            accent="purple"
          />
          {/* #4 Composite: มูลค่าคงเหลือรวมในบริษัท (mobile: last & compact · desktop: tall row-span-2) */}
          <div className="order-7 md:order-none md:row-span-2">
            <CompositeValueCard
              mainValue={totalMainValue}  mainBoxes={mainBP.boxes}    mainPacks={mainBP.packs}
              userValue={totalUserValue}  userBoxes={userBP.boxes}    userPacks={userBP.packs}
              machineValue={totalMachineValue} machineBoxes={machineBP.boxes} machinePacks={machineBP.packs}
            />
          </div>
          {/* #5 SKU ใกล้หมด */}
          <KpiCard
            compact
            className="order-2 md:order-none"
            icon={AlertTriangle}
            label="จำนวน SKU ใกล้หมด"
            value={`${lowStock.length} SKU`}
            sub="ต่ำกว่า 24 ซอง"
            accent="warning"
          />
          {/* #6 มูลค่าสต็อก Main */}
          <KpiCard
            compact
            className="order-4 md:order-none"
            icon={Home}
            label="มูลค่าสต็อก Main"
            value={fmtB(totalMainValue)}
            sub="คลังหลัก · ยังไม่แจก"
            accent="cyan"
          />
          {/* #7 มูลค่าสต็อกรวมทุกตู้ */}
          <KpiCard
            compact
            className="order-6 md:order-none"
            icon={Monitor}
            label="มูลค่าสต็อกรวมทุกตู้"
            value={fmtB(totalMachineValue)}
            sub="หน้าตู้ (VMS) × avg_cost"
            accent="warning"
          />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <KpiCard
            icon={Package}
            label="สต็อกรวม"
            value={fmt(totalPacks)}
            sub={`ซอง · ≈ ${fmt(Math.floor(totalPacks / 24))} กล่อง`}
            accent="cyan"
            glow
          />
          <KpiCard
            icon={AlertTriangle}
            label="จำนวน SKU ใกล้หมด"
            value={`${lowStock.length} SKU`}
            sub="ต่ำกว่า 24 ซอง"
            accent="warning"
          />
        </div>
      )}

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
          {["ทั้งหมด", "OP", "PRB", "EB", "FB", "UB", "OTHER"].map(s => (
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

      {/* Section: เทียบยอดเติม vs ขาย รายวัน */}
      <SalesVsRefillSection
        sales={sales}
        stockOut={stockOut}
        machines={machines}
        skus={skus}
      />

      {/* AI Insights — ดึงจาก wiki/skus/*.md (อัปเดตทุกคืนโดย agent) */}
      {isAdmin && <AIInsightWidget limit={3} />}
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, minWidth: 0 }}>
          <Badge series={sku.series}/>
          <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text-secondary)", flexShrink: 0 }}>
            {sku.sku_id}
          </span>
          <span style={{
            fontSize: 11, color: "var(--dx-text-muted)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            minWidth: 0, flex: 1, textAlign: "right",
          }} title={sku.name}>
            {sku.name}
          </span>
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
// CompositeValueCard — การ์ด #4 สูง 2 แถว แสดง Main/User/ตู้ แยกเป็นมูลค่า + กล่อง + ซอง
// ─────────────────────────────────────────────
function CompositeValueCard({
  mainValue, mainBoxes, mainPacks,
  userValue, userBoxes, userPacks,
  machineValue, machineBoxes, machinePacks,
}) {
  const totalValue = mainValue + userValue + machineValue
  const totalBoxes = mainBoxes + userBoxes + machineBoxes
  const totalPacks = mainPacks + userPacks + machinePacks

  return (
    <div className="dx-card" style={{ padding: 12, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
          มูลค่าคงเหลือรวมในบริษัท
        </p>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(183,148,246,0.10)",
          border: "1px solid rgba(183,148,246,0.30)",
          color: "#B794F6",
          flexShrink: 0,
        }}>
          <Warehouse size={15}/>
        </div>
      </div>

      <p className="dx-mono" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: "var(--dx-text)", lineHeight: 1.1, letterSpacing: -0.5 }}>
        {fmtB(totalValue)}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
        {fmt(totalBoxes)} กล่อง · {fmt(totalPacks)} ซอง
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// SalesVsRefillSection — เทียบยอดเติมตู้ vs ยอดขาย รายวัน × ตู้ × SKU
// + drill-down refill cycle ต่อคู่ machine×sku
// ─────────────────────────────────────────────
function SalesVsRefillSection({ sales, stockOut, machines, skus }) {
  // default = 7 วันล่าสุด
  const defaultFrom = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return d.toISOString().slice(0, 10)
  })()

  const [fromDate, setFromDate]         = useState(defaultFrom)
  const [toDate, setToDate]             = useState(today())
  const [selectedMachine, setMachine]   = useState("all")
  const [selectedSku, setSku]           = useState("all")
  const [expandedKey, setExpandedKey]   = useState(null)
  const [sortBy, setSortBy]             = useState("diff") // diff | machine

  const skuPpbMap     = useMemo(() => Object.fromEntries(skus.map(s => [s.sku_id, parseInt(s.packs_per_box) || 24])), [skus])
  const machineNameMap= useMemo(() => Object.fromEntries(machines.map(m => [m.machine_id, m.name || m.machine_id])), [machines])
  const skuNameMap    = useMemo(() => Object.fromEntries(skus.map(s => [s.sku_id, s.name])), [skus])

  // Note: sales.quantity_sold ถูก normalize box→ซอง แล้วที่ DivisionXApp.jsx (ตอน setSales)
  const saleToPacks = (r) => r.quantity_sold || 0

  // Aggregate: 1 row per machine×SKU (รวมยอดทั้งช่วง)
  const aggregated = useMemo(() => {
    const refills = stockOut.filter(r => !r.from_claim_id)
    const inRange = (d) => d >= fromDate && d <= toDate
    const matchFilter = (mId, sId) =>
      (selectedMachine === "all" || mId === selectedMachine) &&
      (selectedSku     === "all" || sId === selectedSku)

    const map = {} // key = `${machine_id}__${sku_id}`
    const ensure = (mId, sId) => {
      const k = `${mId}__${sId}`
      if (!map[k]) map[k] = { machine_id: mId, sku_id: sId, refill: 0, sold: 0, refillCount: 0 }
      return map[k]
    }

    refills.forEach(r => {
      const date = toBkkDate(r.withdrawn_at)
      if (!inRange(date)) return
      if (!matchFilter(r.machine_id, r.sku_id)) return
      const row = ensure(r.machine_id, r.sku_id)
      row.refill += (r.quantity_packs || 0)
      row.refillCount += 1
    })

    sales.forEach(r => {
      const date = toBkkDate(r.sold_at)
      if (!inRange(date)) return
      if (!matchFilter(r.machine_id, r.sku_id)) return
      ensure(r.machine_id, r.sku_id).sold += saleToPacks(r)
    })

    return Object.values(map)
  }, [stockOut, sales, fromDate, toDate, selectedMachine, selectedSku, skuPpbMap])

  const sortedRows = useMemo(() => {
    const rows = aggregated.map(r => ({ ...r, diff: r.refill - r.sold }))
    if (sortBy === "machine") {
      rows.sort((a, b) => {
        if (a.machine_id !== b.machine_id) return a.machine_id.localeCompare(b.machine_id)
        return a.sku_id.localeCompare(b.sku_id)
      })
    } else {
      // diff: absolute ใหญ่ก่อน · เห็น "ผิดปกติ" ก่อน
      rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    }
    return rows
  }, [aggregated, sortBy])

  // Summary
  const summary = useMemo(() => {
    const totRefill = sortedRows.reduce((a, r) => a + r.refill, 0)
    const totSold   = sortedRows.reduce((a, r) => a + r.sold, 0)
    return { refill: totRefill, sold: totSold, diff: totRefill - totSold, rows: sortedRows.length }
  }, [sortedRows])

  // SKU options + machine options (เฉพาะที่มีกิจกรรมในช่วง)
  const machineOpts = useMemo(() => {
    const ids = new Set()
    stockOut.forEach(r => { const d = toBkkDate(r.withdrawn_at); if (d >= fromDate && d <= toDate && !r.from_claim_id) ids.add(r.machine_id) })
    sales.forEach(r => { const d = toBkkDate(r.sold_at); if (d >= fromDate && d <= toDate) ids.add(r.machine_id) })
    return [...ids].sort()
  }, [stockOut, sales, fromDate, toDate])

  return (
    <div className="dx-card" style={{ padding: 20, marginTop: 8 }}>
      {/* Header + filters */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dx-text)" }}>
            เทียบยอดเติม vs ขาย <span style={{ fontSize: 11, fontWeight: 400, color: "var(--dx-text-muted)", marginLeft: 6 }}>
              ({fmtDayLabel(fromDate)}{fromDate !== toDate ? ` → ${fmtDayLabel(toDate)}` : ""})
            </span>
          </h2>
          <div style={{ fontSize: 11, color: "var(--dx-text-muted)", marginTop: 2 }}>
            ส่วนต่าง = เติม − ขาย · &gt; 0 เติมเร็วกว่าขาย · &lt; 0 ขายเกินเติม (สต็อกในตู้กำลังหด)
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="dx-input" style={{ width: "auto", padding: "6px 10px", fontSize: 11 }}/>
          <span style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>→</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="dx-input" style={{ width: "auto", padding: "6px 10px", fontSize: 11 }}/>
          <select value={selectedMachine} onChange={e => setMachine(e.target.value)}
            className="dx-input" style={{ width: "auto", padding: "6px 10px", fontSize: 11 }}>
            <option value="all">ทุกตู้</option>
            {machineOpts.map(id => (
              <option key={id} value={id}>{machineNameMap[id] || id}</option>
            ))}
          </select>
          <select value={selectedSku} onChange={e => setSku(e.target.value)}
            className="dx-input" style={{ width: "auto", padding: "6px 10px", fontSize: 11 }}>
            <option value="all">ทุก SKU</option>
            {skus.map(s => (
              <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>
            ))}
          </select>
          <button
            onClick={() => setSortBy(sortBy === "diff" ? "machine" : "diff")}
            className="dx-chip"
            title="สลับการเรียง"
            style={{ padding: "5px 10px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ArrowDownUp size={12}/>
            {sortBy === "diff" ? "ส่วนต่างมากก่อน" : "ตู้/SKU"}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
        padding: "10px 12px", marginBottom: 10,
        background: "var(--dx-bg-input)", borderRadius: 8, border: "1px solid var(--dx-border)",
      }}>
        <SummaryStat label="แถว" value={fmt(summary.rows)} />
        <SummaryStat label="เติมรวม" value={fmt(summary.refill)} unit="ซอง" color="cyan"/>
        <SummaryStat label="ขายรวม" value={fmt(summary.sold)}   unit="ซอง" color="purple"/>
        <SummaryStat label="ส่วนต่าง" value={(summary.diff >= 0 ? "+" : "") + fmt(summary.diff)} unit="ซอง"
          color={summary.diff > 0 ? "green" : summary.diff < 0 ? "warning" : "muted"}/>
      </div>

      {/* Table */}
      {sortedRows.length === 0 ? (
        <div style={{ padding: "30px 0", textAlign: "center", fontSize: 12, color: "var(--dx-text-muted)" }}>
          ไม่มีข้อมูลเติม/ขายในช่วงที่เลือก
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--dx-border)", color: "var(--dx-text-muted)", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.4 }}>
                <th style={{ textAlign: "left",  padding: "10px 8px", width: 24 }}></th>
                <th style={{ textAlign: "left",  padding: "10px 8px" }}>ตู้</th>
                <th style={{ textAlign: "left",  padding: "10px 8px" }}>SKU</th>
                <th style={{ textAlign: "right", padding: "10px 8px" }}>เติม (ซอง)</th>
                <th style={{ textAlign: "right", padding: "10px 8px" }}>ขาย (ซอง)</th>
                <th style={{ textAlign: "right", padding: "10px 8px" }}>ส่วนต่าง</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => {
                const key = `${r.machine_id}__${r.sku_id}`
                const isOpen = expandedKey === key
                const diffColor = r.diff > 0 ? "var(--dx-success)" : r.diff < 0 ? "var(--dx-warning)" : "var(--dx-text-muted)"
                const bgRow = r.diff > 0
                  ? "rgba(34,197,94,0.05)"
                  : r.diff < 0
                  ? "rgba(255,200,87,0.05)"
                  : "transparent"
                return (
                  <Fragment key={key}>
                    <tr
                        style={{ borderBottom: "1px solid var(--dx-border)", background: bgRow, cursor: "pointer" }}
                        onClick={() => setExpandedKey(isOpen ? null : key)}>
                      <td style={{ padding: "10px 8px", color: "var(--dx-text-muted)" }}>
                        {isOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                      </td>
                      <td style={{ padding: "10px 8px", color: "var(--dx-text)", fontWeight: 500 }}>
                        {machineNameMap[r.machine_id] || r.machine_id}
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        <span className="dx-mono" style={{ color: "var(--dx-cyan-soft)", fontWeight: 600 }}>{r.sku_id}</span>
                        <span style={{ color: "var(--dx-text-muted)", marginLeft: 6, fontSize: 10 }}>{skuNameMap[r.sku_id]}</span>
                      </td>
                      <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", color: "var(--dx-cyan-bright)", fontWeight: 600, fontSize: 13 }}>
                        {r.refill > 0 ? (
                          <>
                            {fmt(r.refill)}
                            <span style={{ color: "var(--dx-text-muted)", fontSize: 10, fontWeight: 400, marginLeft: 4 }}>
                              ({r.refillCount}×)
                            </span>
                          </>
                        ) : <span style={{ color: "var(--dx-text-muted)" }}>—</span>}
                      </td>
                      <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", color: "#B794F6", fontWeight: 600, fontSize: 13 }}>
                        {r.sold > 0 ? fmt(r.sold) : <span style={{ color: "var(--dx-text-muted)" }}>—</span>}
                      </td>
                      <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", color: diffColor, fontWeight: 700, fontSize: 14 }}>
                        {(r.diff >= 0 ? "+" : "") + fmt(r.diff)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: "12px 32px 16px", background: "var(--dx-bg-input)" }}>
                          <DailyBreakdown
                            machineId={r.machine_id}
                            skuId={r.sku_id}
                            stockOut={stockOut}
                            sales={sales}
                            fromDate={fromDate}
                            toDate={toDate}
                            saleToPacks={saleToPacks}
                          />
                          <div style={{ marginTop: 14 }}>
                            <RefillCycleDrilldown
                              machineId={r.machine_id}
                              skuId={r.sku_id}
                              stockOut={stockOut}
                              sales={sales}
                              fromDate={fromDate}
                              toDate={toDate}
                              saleToPacks={saleToPacks}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value, unit, color }) {
  const colorMap = {
    cyan:   "var(--dx-cyan-bright)",
    purple: "#B794F6",
    green:  "var(--dx-success)",
    warning:"var(--dx-warning)",
    muted:  "var(--dx-text-muted)",
  }
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--dx-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div className="dx-mono" style={{ fontSize: 16, fontWeight: 700, color: colorMap[color] || "var(--dx-text)", marginTop: 2 }}>
        {value} {unit && <span style={{ fontSize: 10, color: "var(--dx-text-muted)", fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// DailyBreakdown — ขยาย machine×SKU ออกเป็นรายวันในช่วงที่เลือก
// ─────────────────────────────────────────────
function DailyBreakdown({ machineId, skuId, stockOut, sales, fromDate, toDate, saleToPacks }) {
  const days = useMemo(() => {
    const inRange = (d) => d >= fromDate && d <= toDate
    const map = {} // date → { refill, sold }
    const ensure = (d) => {
      if (!map[d]) map[d] = { date: d, refill: 0, sold: 0 }
      return map[d]
    }

    stockOut
      .filter(r => r.machine_id === machineId && r.sku_id === skuId && !r.from_claim_id)
      .forEach(r => {
        const d = toBkkDate(r.withdrawn_at)
        if (!inRange(d)) return
        ensure(d).refill += (r.quantity_packs || 0)
      })

    sales
      .filter(s => s.machine_id === machineId && s.sku_id === skuId)
      .forEach(s => {
        const d = toBkkDate(s.sold_at)
        if (!inRange(d)) return
        ensure(d).sold += saleToPacks(s)
      })

    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
  }, [machineId, skuId, stockOut, sales, fromDate, toDate, saleToPacks])

  if (days.length === 0) {
    return <div style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>ไม่มีกิจกรรมในช่วงนี้</div>
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--dx-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        รายวัน · {days.length} วัน
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ color: "var(--dx-text-muted)", fontSize: 10 }}>
            <th style={{ textAlign: "left",  padding: "4px 6px" }}>วันที่</th>
            <th style={{ textAlign: "right", padding: "4px 6px" }}>เติม</th>
            <th style={{ textAlign: "right", padding: "4px 6px" }}>ขาย</th>
            <th style={{ textAlign: "right", padding: "4px 6px" }}>ส่วนต่าง</th>
          </tr>
        </thead>
        <tbody>
          {days.map(d => {
            const diff = d.refill - d.sold
            const diffColor = diff > 0 ? "var(--dx-success)" : diff < 0 ? "var(--dx-warning)" : "var(--dx-text-muted)"
            return (
              <tr key={d.date} style={{ borderTop: "1px solid var(--dx-border)" }}>
                <td className="dx-mono" style={{ padding: "5px 6px", color: "var(--dx-text)" }}>{fmtDayLabel(d.date)}</td>
                <td className="dx-mono" style={{ padding: "5px 6px", textAlign: "right", color: d.refill > 0 ? "var(--dx-cyan-bright)" : "var(--dx-text-muted)" }}>
                  {d.refill > 0 ? fmt(d.refill) : "—"}
                </td>
                <td className="dx-mono" style={{ padding: "5px 6px", textAlign: "right", color: d.sold > 0 ? "#B794F6" : "var(--dx-text-muted)" }}>
                  {d.sold > 0 ? fmt(d.sold) : "—"}
                </td>
                <td className="dx-mono" style={{ padding: "5px 6px", textAlign: "right", color: diffColor, fontWeight: 600 }}>
                  {(diff >= 0 ? "+" : "") + fmt(diff)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────
// RefillCycleDrilldown — ต่อรอบเติม: เติม X / ขายจนรอบหน้า Y / ส่วนต่าง
// ─────────────────────────────────────────────
function RefillCycleDrilldown({ machineId, skuId, stockOut, sales, fromDate, toDate, saleToPacks }) {
  const cycles = useMemo(() => {
    // ดึง refills ของคู่ machine×sku ทั้งหมด (ไม่จำกัด range เพราะต้องการรอบก่อนหน้าเพื่อจับขายในช่วงด้วย)
    const refills = stockOut
      .filter(r => r.machine_id === machineId && r.sku_id === skuId && !r.from_claim_id)
      .sort((a, b) => new Date(a.withdrawn_at) - new Date(b.withdrawn_at))

    if (refills.length === 0) return []

    const relSales = sales.filter(s => s.machine_id === machineId && s.sku_id === skuId)
    const nowEnd   = new Date()

    const all = refills.map((r, i) => {
      const cycleStart = new Date(r.withdrawn_at)
      const cycleEnd   = i + 1 < refills.length ? new Date(refills[i + 1].withdrawn_at) : nowEnd

      const salesInCycle = relSales.filter(s => {
        const t = new Date(s.sold_at)
        return t >= cycleStart && t < cycleEnd
      })
      const soldPacks = salesInCycle.reduce((a, s) => a + saleToPacks(s), 0)

      return {
        idx: i + 1,
        refillAt: r.withdrawn_at,
        refillQty: r.quantity_packs || 0,
        soldUntilNext: soldPacks,
        diff: (r.quantity_packs || 0) - soldPacks,
        isOpen: i + 1 === refills.length,    // รอบล่าสุด = ยังเปิดอยู่
      }
    })

    // โชว์ 8 รอบล่าสุด (เก่าสุดด้านบน → ใหม่สุดด้านล่าง)
    return all.slice(-8)
  }, [machineId, skuId, stockOut, sales, fromDate, toDate, saleToPacks])

  if (cycles.length === 0) {
    return <div style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>ยังไม่มีรอบเติม · ข้อมูลขายมาจาก VMS อย่างเดียว</div>
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--dx-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        รอบเติม · {cycles.length} รอบ
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ color: "var(--dx-text-muted)", fontSize: 10 }}>
            <th style={{ textAlign: "left",  padding: "4px 6px" }}>รอบ</th>
            <th style={{ textAlign: "left",  padding: "4px 6px" }}>วันเติม</th>
            <th style={{ textAlign: "right", padding: "4px 6px" }}>เติม</th>
            <th style={{ textAlign: "right", padding: "4px 6px" }}>ขายจนรอบหน้า</th>
            <th style={{ textAlign: "right", padding: "4px 6px" }}>ส่วนต่าง</th>
            <th style={{ textAlign: "left",  padding: "4px 6px" }}></th>
          </tr>
        </thead>
        <tbody>
          {cycles.map(c => {
            const diffColor = c.diff > 0 ? "var(--dx-success)" : c.diff < 0 ? "var(--dx-warning)" : "var(--dx-text-muted)"
            return (
              <tr key={c.idx} style={{ borderTop: "1px solid var(--dx-border)" }}>
                <td className="dx-mono" style={{ padding: "5px 6px", color: "var(--dx-text-muted)" }}>#{c.idx}</td>
                <td className="dx-mono" style={{ padding: "5px 6px", color: "var(--dx-text)" }}>{toBkkDate(c.refillAt)}</td>
                <td className="dx-mono" style={{ padding: "5px 6px", textAlign: "right", color: "var(--dx-cyan-bright)" }}>{fmt(c.refillQty)}</td>
                <td className="dx-mono" style={{ padding: "5px 6px", textAlign: "right", color: "#B794F6" }}>{fmt(c.soldUntilNext)}</td>
                <td className="dx-mono" style={{ padding: "5px 6px", textAlign: "right", color: diffColor, fontWeight: 600 }}>
                  {(c.diff >= 0 ? "+" : "") + fmt(c.diff)}
                </td>
                <td style={{ padding: "5px 6px", color: "var(--dx-text-muted)", fontSize: 10 }}>
                  {c.isOpen ? "(รอบปัจจุบัน · นับถึงวันนี้)" : ""}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
