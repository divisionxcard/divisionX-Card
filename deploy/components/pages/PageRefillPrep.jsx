// PageRefillPrep — Dark Theme (native dx-components + dx-* classes)
import { useState, useEffect } from "react"
import {
  AlertTriangle, CheckCircle, X, Monitor,
  Boxes, Package, RefreshCw, Loader2,
} from "lucide-react"
import { fmt, getSkuSeries } from "../shared/helpers"
import { SKU_SERIES_ORDER } from "../shared/constants"
import { KpiCard, SectionTitle } from "../shared/dx-components"

export default function PageRefillPrep({ machines, machineStock, machineAssignments, transfers, stockOut, skus, profile, session, profiles, onAddStockOut, onUpdateStockOut, onDeleteStockOut }) {
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

  // Multi-select ตู้
  const [selectedMachines, setSelectedMachines] = useState(() => new Set(myMachineIds))
  // Reset การเลือกเมื่อเปลี่ยน user (และ sync เมื่อ assignments เปลี่ยน)
  useEffect(() => { setSelectedMachines(new Set(myMachineIds)); setQtyMap({}); /* eslint-disable-next-line */ }, [activeUserId, myMachineIds.join(",")])
  const toggleMachine = (id) => {
    setSelectedMachines(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const lastSync = machineStock.length > 0
    ? machineStock.reduce((latest, s) => { const t = s.synced_at || ""; return t > latest ? t : latest }, "")
    : null

  const machineNameMap = {}
  // ตัด "(chukesXX)" หรือ "(...)" ท้ายชื่อออกเพื่อให้แสดงสั้น
  const stripId = (name) => (name || "").replace(/\s*\([^)]*\)\s*$/, "").trim()
  machines.forEach(m => { machineNameMap[m.machine_id] = stripId(m.name) || m.machine_id })

  // Helper: นับ refill ต่อตู้
  const machineStats = {}
  myMachineIds.forEach(machId => {
    const items = refillItems.filter(r => r.machine_id === machId)
    const totalPacks = items.reduce((a, r) => {
      const sku = skus.find(s => s.sku_id === r.sku_id)
      return a + (r.isBox ? r.refill * (sku?.packs_per_box || 24) : r.refill)
    }, 0)
    machineStats[machId] = { skuCount: items.length, totalPacks }
  })

  // FIFO lot balance ต่อ SKU
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

  const [qtyMap, setQtyMap] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  const canRefill = activeUserId === userId
  const itemKey = (item) => `${item.machine_id}_${item.sku_id}_${item.isBox ? "b" : "p"}`

  const getQty = (r) => { const v = qtyMap[itemKey(r)]; return v === undefined ? r.refill : v }
  const setQty = (r, next) => {
    const max = r.refill
    const v = Math.max(0, Math.min(max, next))
    setQtyMap(prev => ({ ...prev, [itemKey(r)]: v }))
  }

  const handleBatchSubmit = async (items) => {
    const picks = items.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) > 0)
    if (picks.length === 0) { showToast("ไม่มีรายการที่เบิกได้", "error"); return }
    const lotUsage = {}
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
          sku_id: a.r.sku_id,
          lot_number: a.lot_number,
          machine_id: a.r.machine_id,
          quantity_packs: a.packs,
          withdrawn_at: now,
          note: `[${a.qty}${a.r.isBox ? "กล่อง" : "ซอง"}] เบิกจากหน้าเตรียมของเติมตู้ (batch)`,
        })
      }
      const machineIds = [...new Set(picks.map(p => p.machine_id))]
      showToast(`เบิกสำเร็จ ${assignments.length} รายการ → ${machineIds.length} ตู้`)
      setQtyMap({})
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally { setSubmitting(false) }
  }

  // Admin user switcher chips (reused in 2 places)
  const AdminSwitcher = () => !isAdmin || viewableUsers.length === 0 ? null : (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "var(--dx-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>ดูของ</span>
      <div style={{ display: "flex", gap: 4 }}>
        {viewableUsers.map(p => (
          <button key={p.id} onClick={() => setViewUserId(p.id)}
            className={`dx-chip ${activeUserId === p.id ? "dx-chip-active" : ""}`}>
            {p.display_name || p.username || p.email}
          </button>
        ))}
      </div>
    </div>
  )

  // Empty state: ไม่มี user ไหนมี assignment เลย
  if (viewableUsers.length === 0 && !usersWithAssignments.includes(userId)) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <SectionTitle pill="Refill Prep" title="เตรียมของเติมตู้" subtitle="คำนวณจาก VMS เทียบกับสต็อก"/>
        <EmptyBanner icon={<AlertTriangle size={32}/>}
          text="ยังไม่มีการกำหนดตู้ให้ผู้ใช้คนใด กรุณาไปที่ &quot;จัดการผู้ใช้ → กำหนดตู้&quot;"/>
      </div>
    )
  }

  if (myMachineIds.length === 0) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <SectionTitle pill="Refill Prep" title="เตรียมของเติมตู้" subtitle="คำนวณจาก VMS เทียบกับสต็อก" actions={<AdminSwitcher/>}/>
        <EmptyBanner icon={<AlertTriangle size={32}/>}
          text={isAdmin && activeUserId !== userId
            ? `${activeProfile?.display_name || "?"} ยังไม่ได้ถูก assign ตู้`
            : "คุณยังไม่ได้ถูก assign ตู้ กรุณาติดต่อแอดมินเพื่อกำหนดตู้ที่รับผิดชอบ"}/>
      </div>
    )
  }

  // Items จาก ตู้ที่ถูกเลือก — sort series OP→PRB→EB → SKU → machine
  const visibleItems = refillItems
    .filter(r => selectedMachines.has(r.machine_id))
    .sort((a, b) => {
      const sa = SKU_SERIES_ORDER[getSkuSeries(a.sku_id)] ?? 9
      const sb = SKU_SERIES_ORDER[getSkuSeries(b.sku_id)] ?? 9
      return sa - sb
        || (a.sku_id || "").localeCompare(b.sku_id || "")
        || (a.machine_id || "").localeCompare(b.machine_id || "")
    })

  // Merge rows: group by (sku_id, isBox) — 1 row ต่อ SKU+unit ถึงจะมาจากหลายตู้
  // backend ยัง track per-machine (ใน groupedRows[*].items → stock_out แยกตู้)
  const groupedRows = (() => {
    const groupMap = {}
    const order = []
    visibleItems.forEach(r => {
      const key = `${r.sku_id}_${r.isBox ? "b" : "p"}`
      if (!groupMap[key]) {
        groupMap[key] = {
          key, sku_id: r.sku_id, isBox: r.isBox,
          items: [], totalRefill: 0, totalRemain: 0, totalCapacity: 0, slotNums: [],
        }
        order.push(groupMap[key])
      }
      const g = groupMap[key]
      g.items.push(r)
      g.totalRefill   += r.refill
      g.totalRemain   += r.remain
      g.totalCapacity += r.capacity
      g.slotNums.push(...r.slotNums.map(s => `${machineNameMap[r.machine_id]}/${s}`))
    })
    return order
  })()

  const getGroupQty = (g) => g.items.reduce((a, r) => a + getQty(r), 0)

  // ปรับ qty ระดับ group → แจกแบบ waterfall ตามลำดับ item (ต้นทาง machine_id)
  const setGroupQty = (g, newTotal) => {
    let remaining = Math.max(0, Math.min(g.totalRefill, newTotal))
    const updates = {}
    g.items.forEach(item => {
      const taken = Math.min(item.refill, remaining)
      updates[itemKey(item)] = taken
      remaining -= taken
    })
    setQtyMap(prev => ({ ...prev, ...updates }))
  }

  const picks = visibleItems.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) > 0)
  const skipped = visibleItems.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) <= 0).length
  const totalPacksSelected = picks.reduce((a, r) => {
    const sku = skus.find(s => s.sku_id === r.sku_id)
    return a + (r.isBox ? getQty(r) * (sku?.packs_per_box || 24) : getQty(r))
  }, 0)

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && <Toast toast={toast}/>}

      {/* Header */}
      <SectionTitle
        pill={lastSync ? `VMS · ${lastSync.slice(0, 10)} ${lastSync.slice(11, 16)}` : "Refill Prep"}
        title={<>เตรียมของเติมตู้
          {isAdmin && activeUserId !== userId && (
            <span style={{ marginLeft: 10, fontSize: 16, fontWeight: 400, color: "var(--dx-text-muted)" }}>
              · {activeProfile?.display_name || "?"}
            </span>
          )}
        </>}
        subtitle="คำนวณจาก VMS เทียบกับสต็อกของคุณ"
        actions={<AdminSwitcher/>}
      />

      {/* Multi-select ตู้ */}
      <div className="dx-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
              เลือกตู้ที่ต้องการรวมยอดเติม
            </div>
            <div style={{ fontSize: 11, color: "var(--dx-text-muted)", marginTop: 2 }}>
              กดเพื่อเลือก/ยกเลิก — เลือกหลายตู้ได้ · ยอดจะรวมในตารางด้านล่าง
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setSelectedMachines(new Set(myMachineIds))}
              className="dx-btn dx-btn-ghost" style={{ fontSize: 11 }}>
              เลือกทั้งหมด
            </button>
            <button onClick={() => setSelectedMachines(new Set())}
              className="dx-btn dx-btn-ghost" style={{ fontSize: 11 }}>
              ล้าง
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {myMachines.map(m => {
            const stat = machineStats[m.machine_id] || { skuCount: 0, totalPacks: 0 }
            const isSelected = selectedMachines.has(m.machine_id)
            const empty = stat.skuCount === 0
            return (
              <button key={m.machine_id} onClick={() => toggleMachine(m.machine_id)}
                className={`dx-chip ${isSelected ? "dx-chip-active" : ""}`}
                style={{ padding: "9px 14px", opacity: empty ? 0.6 : 1 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Monitor size={13}/>{m.name}
                  {empty
                    ? <CheckCircle size={11} style={{ color: "var(--dx-success)" }}/>
                    : <span className="dx-mono" style={{ opacity: 0.7 }}>({stat.skuCount})</span>
                  }
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* KPI — จากตู้ที่เลือก */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <KpiCard icon={Monitor} label="ตู้ที่เลือก" value={`${selectedMachines.size} / ${myMachines.length} ตู้`} accent="cyan" glow/>
        <KpiCard icon={AlertTriangle} label="ช่องที่ต้องเติม" value={`${visibleItems.length} รายการ`} accent="danger"/>
        <KpiCard icon={Package} label="รวม (ซอง)" value={fmt(totalPacksSelected)} sub="ตาม qty ที่เลือก" accent="cyan"/>
        <KpiCard icon={Boxes} label="สต็อกของฉัน"
          value={fmt(Object.values(myBalMap).reduce((a, v) => a + Math.max(0, v), 0))}
          sub="ซอง รวมทุก SKU" accent="green"/>
      </div>

      {/* Refill table */}
      <div className="dx-card" style={{ padding: 20 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
          สรุปสินค้าที่ต้องเตรียม
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--dx-text-muted)" }}>
            · ตู้ที่เลือก {selectedMachines.size} ตู้
          </span>
        </h2>
        {selectedMachines.size === 0 ? (
          <p style={{ textAlign: "center", color: "var(--dx-warning)", padding: "40px 0", fontSize: 13 }}>
            <AlertTriangle size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}/>
            กรุณาเลือกตู้อย่างน้อย 1 ตู้
          </p>
        ) : visibleItems.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "40px 0", fontSize: 13 }}>
            <CheckCircle size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6, color: "var(--dx-success)" }}/>
            ทุกช่องของตู้ที่เลือกเต็มแล้ว
          </p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                    <Th align="left">SKU</Th>
                    <Th align="left">ตู้</Th>
                    <Th align="right" style={{ whiteSpace: "nowrap" }}>คงเหลือ/ความจุ</Th>
                    <Th align="center" style={{ color: "var(--dx-danger)", fontWeight: 700, whiteSpace: "nowrap" }}>ต้องเติม</Th>
                    <Th align="right" style={{ whiteSpace: "nowrap" }}>สต็อกฉัน</Th>
                    <Th align="center">สถานะ</Th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map(g => {
                    const myBal = myBalMap[g.sku_id] || 0
                    const sku = skus.find(s => s.sku_id === g.sku_id)
                    const refillPacksTotal = g.isBox ? g.totalRefill * (sku?.packs_per_box || 24) : g.totalRefill
                    const enough = myBal >= refillPacksTotal
                    const unit = g.isBox ? "กล่อง" : "ซอง"
                    const qty = getGroupQty(g)
                    const disabled = !canRefill || myBal <= 0
                    const changed = qty !== g.totalRefill
                    return (
                      <tr key={g.key} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                        <td style={{ padding: "11px 10px" }}>
                          <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{g.sku_id}</span>
                        </td>
                        <td style={{ padding: "11px 10px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {g.items.map(it => (
                              <span key={it.machine_id} className="dx-mono"
                                style={{ fontSize: 11, color: "var(--dx-cyan-soft)", whiteSpace: "nowrap" }}>
                                {machineNameMap[it.machine_id]}({it.refill})
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "11px 10px", textAlign: "right", fontSize: 11, color: "var(--dx-text-secondary)", whiteSpace: "nowrap" }} className="dx-mono">
                          {g.totalRemain} / {g.totalCapacity}
                        </td>
                        <td style={{ padding: "11px 10px" }}>
                          {canRefill ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                              <QtyBtn onClick={() => setGroupQty(g, qty - 1)} disabled={disabled || qty <= 0} variant="minus"/>
                              <input type="number" min={0} max={g.totalRefill} value={qty}
                                onChange={e => setGroupQty(g, parseInt(e.target.value) || 0)}
                                disabled={disabled}
                                style={{
                                  width: 56, padding: "5px 4px", textAlign: "center",
                                  fontFamily: "var(--dx-mono)", fontSize: 13, fontWeight: 700,
                                  background: "var(--dx-bg-input)",
                                  border: "1px solid var(--dx-border)",
                                  borderRadius: 8,
                                  color: qty === 0 ? "var(--dx-text-muted)"
                                    : qty < g.totalRefill ? "var(--dx-warning)"
                                    : "var(--dx-danger)",
                                  outline: "none",
                                }}/>
                              <QtyBtn onClick={() => setGroupQty(g, qty + 1)} disabled={disabled || qty >= g.totalRefill} variant="plus"/>
                              <span style={{ fontSize: 10, color: "var(--dx-text-muted)", marginLeft: 2 }}>{unit}</span>
                              {changed && !disabled && (
                                <button type="button" onClick={() => setGroupQty(g, g.totalRefill)}
                                  title={`คืนค่าเดิม (${g.totalRefill})`}
                                  style={{
                                    marginLeft: 4, width: 26, height: 26, padding: 0,
                                    borderRadius: 8, cursor: "pointer",
                                    background: "rgba(0,212,255,0.08)",
                                    border: "1px solid rgba(0,212,255,0.25)",
                                    color: "var(--dx-cyan-soft)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}>
                                  <RefreshCw size={11}/>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--dx-danger)", whiteSpace: "nowrap" }}>
                              {fmt(g.totalRefill)} {unit}
                            </div>
                          )}
                          {canRefill && myBal <= 0 && (
                            <div style={{ textAlign: "center", fontSize: 10, color: "var(--dx-warning)", marginTop: 3 }}>
                              ไม่มีสต็อก
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "11px 10px", textAlign: "right" }}>
                          <span className="dx-mono" style={{ fontSize: 12, fontWeight: 700, color: enough ? "var(--dx-success)" : "var(--dx-warning)" }}>
                            {fmt(myBal)}
                          </span>
                        </td>
                        <td style={{ padding: "11px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <StatusPill enough={enough}/>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Batch withdraw bar */}
            {canRefill && (
              <div style={{
                marginTop: 14, padding: 16,
                background: "linear-gradient(180deg, rgba(0,212,255,0.08) 0%, rgba(0,212,255,0.02) 100%)",
                border: "1px solid var(--dx-border-glow)",
                borderRadius: 12,
                boxShadow: "0 0 20px -8px var(--dx-glow)",
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
              }}>
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    เบิกยอดรวม → {[...new Set(picks.map(p => p.machine_id))].length || selectedMachines.size} ตู้
                  </div>
                  <div className="dx-mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--dx-cyan-bright)", marginTop: 2 }}>
                    {picks.length === 0
                      ? <span style={{ color: "var(--dx-text-muted)", fontWeight: 400 }}>ยังไม่ได้เลือกจำนวน</span>
                      : <>{picks.length} รายการ · รวม <span style={{ color: "var(--dx-cyan)" }}>{fmt(totalPacksSelected)}</span> ซอง</>}
                  </div>
                  {skipped > 0 && (
                    <div style={{ fontSize: 11, color: "var(--dx-warning)", marginTop: 2 }}>
                      ข้าม {skipped} รายการ (ไม่มีสต็อก)
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flex: "0 1 auto" }}>
                  <button onClick={() => setQtyMap({})}
                    disabled={submitting} className="dx-btn dx-btn-ghost">
                    <RefreshCw size={12}/>รีเซ็ตยอด
                  </button>
                  <button onClick={() => handleBatchSubmit(visibleItems)}
                    disabled={submitting || picks.length === 0}
                    className="dx-btn dx-btn-primary"
                    style={{ padding: "10px 20px", fontSize: 13, opacity: (submitting || picks.length === 0) ? 0.5 : 1 }}>
                    {submitting ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>}
                    {submitting ? "กำลังบันทึก..." : "ยืนยันเบิกยอดรวม"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function Th({ children, align = "left", style }) {
  return (
    <th style={{
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

function StatusPill({ enough }) {
  const c = enough
    ? { bg: "rgba(0,255,136,0.1)", text: "var(--dx-success)", border: "rgba(0,255,136,0.25)", label: "พร้อม" }
    : { bg: "rgba(255,200,87,0.1)", text: "var(--dx-warning)", border: "rgba(255,200,87,0.25)", label: "ไม่พอ" }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: "2px 8px", borderRadius: 999,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      whiteSpace: "nowrap", display: "inline-block",
    }}>{c.label}</span>
  )
}

function QtyBtn({ onClick, disabled, variant }) {
  const isPlus = variant === "plus"
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      title={isPlus ? "เพิ่ม" : "ลด"}
      style={{
        width: 28, height: 28, padding: 0, borderRadius: 8,
        border: "1px solid var(--dx-border)",
        background: "var(--dx-bg-elevated)",
        color: "var(--dx-text-secondary)",
        fontSize: 16, fontWeight: 700, lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .15s",
      }}
      onMouseEnter={e => {
        if (disabled) return
        e.currentTarget.style.borderColor = isPlus ? "rgba(0,255,136,0.5)" : "rgba(255,68,102,0.5)"
        e.currentTarget.style.color = isPlus ? "var(--dx-success)" : "var(--dx-danger)"
      }}
      onMouseLeave={e => {
        if (disabled) return
        e.currentTarget.style.borderColor = "var(--dx-border)"
        e.currentTarget.style.color = "var(--dx-text-secondary)"
      }}>
      {isPlus ? "+" : "−"}
    </button>
  )
}

function EmptyBanner({ icon, text }) {
  return (
    <div className="dx-card" style={{
      padding: 32, textAlign: "center",
      borderColor: "rgba(255,200,87,0.25)",
      background: "linear-gradient(180deg, rgba(255,200,87,0.04) 0%, transparent 100%), var(--dx-bg-card)",
    }}>
      <div style={{ color: "var(--dx-warning)", marginBottom: 10, display: "flex", justifyContent: "center" }}>
        {icon}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--dx-warning)" }}>{text}</p>
    </div>
  )
}

function Toast({ toast }) {
  const isError = toast.type === "error"
  return (
    <div style={{
      position: "fixed",
      top: 16, left: 16, right: 16,
      zIndex: 50,
      padding: "12px 16px",
      borderRadius: 12,
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--dx-bg-card)",
      border: `1px solid ${isError ? "rgba(255,68,102,0.35)" : "rgba(0,255,136,0.35)"}`,
      color: isError ? "var(--dx-danger)" : "var(--dx-success)",
      boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)",
      fontSize: 13,
      ...(typeof window !== "undefined" && window.innerWidth >= 640
        ? { left: "auto", right: 16, maxWidth: 360 }
        : {}),
    }}>
      {isError ? <X size={16}/> : <CheckCircle size={16}/>}
      <span>{toast.msg}</span>
    </div>
  )
}
