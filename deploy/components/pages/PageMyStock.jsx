// PageMyStock — Dark Theme
import { useState } from "react"
import { X, CheckCircle, Package, PlusCircle, Wallet, Loader2, Trash2 } from "lucide-react"
import { fmt, fmtB, fmtBoxPack, getSkuSeries } from "../shared/helpers"
import { SKU_SERIES_ORDER } from "../shared/constants"
import { Badge, KpiCard, SectionTitle } from "../shared/dx-components"

export default function PageMyStock({ transfers, stockOut, stockIn = [], skus, profile, session, profiles, machines, machineAssignments, onDeleteTransfer }) {
  const [tab, setTab] = useState("balance")
  const isAdmin = profile?.role === "admin"
  const userId = session?.user?.id

  const [deleteTransferId, setDeleteTransferId] = useState(null)
  const [deletingTransfer, setDeletingTransfer] = useState(false)
  const [toast, setToast] = useState(null)
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const handleDeleteTransfer = async (id) => {
    setDeletingTransfer(true)
    try {
      await onDeleteTransfer(id)
      setDeleteTransferId(null)
      showToast("ลบสำเร็จ — คืนสต็อกหลักแล้ว")
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
    finally { setDeletingTransfer(false) }
  }

  // Admin สามารถเลือกดูสต็อกของคนอื่นได้
  const usersWithTransfers = [...new Set(transfers.map(t => t.to_user_id))]
  const viewableUsers = (profiles || []).filter(p => usersWithTransfers.includes(p.id))
  const [viewUserId, setViewUserId] = useState("")
  const defaultUserId = usersWithTransfers.includes(userId) ? userId : (viewableUsers[0]?.id || userId)
  const activeUserId = isAdmin ? (viewUserId || defaultUserId) : userId
  const activeProfile = (profiles || []).find(p => p.id === activeUserId)

  const userAssignments = (machineAssignments || []).filter(a => a.user_id === activeUserId && a.is_active)
  const userMachines = (machines || []).filter(m => userAssignments.some(a => a.machine_id === m.machine_id))

  const myTransfers = transfers.filter(t => t.to_user_id === activeUserId)
  const myStockOut = stockOut.filter(so => so.withdrawn_by_user_id === activeUserId)

  const balanceMap = {}
  myTransfers.forEach(t => {
    if (!balanceMap[t.sku_id]) balanceMap[t.sku_id] = { received: 0, withdrawn: 0 }
    balanceMap[t.sku_id].received += t.quantity_packs || 0
  })
  myStockOut.forEach(so => {
    if (!balanceMap[so.sku_id]) balanceMap[so.sku_id] = { received: 0, withdrawn: 0 }
    balanceMap[so.sku_id].withdrawn += so.quantity_packs || 0
  })

  // Sort: series (OP→PRB→EB) → balance น้อยสุดขึ้นก่อน → sku_id
  const balanceList = Object.entries(balanceMap).map(([sku_id, v]) => ({
    sku_id,
    name: skus.find(s => s.sku_id === sku_id)?.name || sku_id,
    series: getSkuSeries(sku_id),
    received: v.received,
    withdrawn: v.withdrawn,
    balance: v.received - v.withdrawn,
    packs_per_box: skus.find(s => s.sku_id === sku_id)?.packs_per_box || 24,
  }))
    .filter(r => r.received > 0 || r.withdrawn > 0)
    .sort((a, b) => {
      const sa = SKU_SERIES_ORDER[a.series] ?? 9
      const sb = SKU_SERIES_ORDER[b.series] ?? 9
      return sa - sb
        || a.balance - b.balance
        || (a.sku_id || "").localeCompare(b.sku_id || "")
    })

  const totalBalance = balanceList.reduce((a, r) => a + r.balance, 0)
  const totalReceived = balanceList.reduce((a, r) => a + r.received, 0)

  // ต้นทุนต่อซองของแต่ละ lot (จาก stock_in จริง ไม่ใช่ avg_cost)
  const lotCostAgg = {}
  stockIn.forEach(r => {
    const key = `${r.sku_id}__${r.lot_number || ""}`
    if (!lotCostAgg[key]) lotCostAgg[key] = { packs: 0, cost: 0 }
    lotCostAgg[key].packs += parseFloat(r.quantity_packs) || 0
    lotCostAgg[key].cost  += parseFloat(r.total_cost)     || 0
  })
  const cppOf = (sku_id, lot_number) => {
    const info = lotCostAgg[`${sku_id}__${lot_number || ""}`]
    return info && info.packs > 0 ? info.cost / info.packs : 0
  }

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

  // มูลค่าคงเหลือรวมของ user นี้ = Σ(lotBalance × cost_per_pack ของ lot นั้น)
  const totalRemainingValue = balanceList.reduce((sum, r) => {
    const activeLots = getMyLotBalance(r.sku_id).filter(l => l.lotBalance > 0)
    return sum + activeLots.reduce((a, l) => a + l.lotBalance * cppOf(r.sku_id, l.lot_number), 0)
  }, 0)

  // Admin-only: มูลค่าคงเหลือรวมของ user ทุกคน (FIFO ต่อ user ต่อ SKU)
  const grandRemainingValue = isAdmin ? usersWithTransfers.reduce((grand, uid) => {
    const uTransfers = transfers.filter(t => t.to_user_id === uid)
    const uStockOut  = stockOut.filter(so => so.withdrawn_by_user_id === uid)
    const uSkus = [...new Set(uTransfers.map(t => t.sku_id))]
    return grand + uSkus.reduce((sumSku, skuId) => {
      const lotMap = {}
      uTransfers.filter(t => t.sku_id === skuId && t.lot_number).forEach(t => {
        if (!lotMap[t.lot_number]) lotMap[t.lot_number] = { lot_number: t.lot_number, quantity_packs: 0, transferred_at: t.transferred_at }
        lotMap[t.lot_number].quantity_packs += t.quantity_packs || 0
      })
      const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.transferred_at) - new Date(b.transferred_at))
      const totalOut = uStockOut.filter(so => so.sku_id === skuId).reduce((a, so) => a + (so.quantity_packs || 0), 0)
      let remainOut = totalOut
      return sumSku + lotsArr.reduce((s, lot) => {
        const used = Math.min(lot.quantity_packs, remainOut)
        remainOut -= used
        const lotBalance = lot.quantity_packs - used
        return s + lotBalance * cppOf(skuId, lot.lot_number)
      }, 0)
    }, 0)
  }, 0) : 0

  const tabs = [
    { v: "balance",     l: "ยอดคงเหลือ" },
    { v: "history_in",  l: "ประวัติรับเข้า" },
    { v: "history_out", l: "ประวัติเบิกออก" },
  ]

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && <Toast toast={toast}/>}

      <SectionTitle
        pill="My Stock"
        title={isAdmin && activeUserId !== userId
          ? `สต็อกของ ${activeProfile?.display_name || "?"}`
          : "สต็อกของฉัน"}
        subtitle="สินค้าที่ได้รับแจกจ่ายมา และประวัติการเบิกออก"
        actions={
          isAdmin && viewableUsers.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--dx-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>ดูสต็อก</span>
              <div style={{ display: "flex", gap: 4 }}>
                {viewableUsers.map(p => (
                  <button key={p.id} onClick={() => setViewUserId(p.id)}
                    className={`dx-chip ${activeUserId === p.id ? "dx-chip-active" : ""}`}>
                    {p.display_name || p.username || p.email}
                  </button>
                ))}
              </div>
            </div>
          ) : null
        }
      />

      {/* ตู้ที่รับผิดชอบ */}
      {userMachines.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
            ตู้ที่รับผิดชอบ
          </span>
          {userMachines.map(m => (
            <span key={m.machine_id} style={{
              padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500,
              background: "rgba(0,212,255,0.08)", color: "var(--dx-cyan-soft)",
              border: "1px solid rgba(0,212,255,0.2)",
            }}>
              {m.name}
            </span>
          ))}
        </div>
      )}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <KpiCard icon={Package}     label="สต็อกคงเหลือ (ซอง)" value={fmt(totalBalance)} accent="cyan" glow/>
        {isAdmin && (
          <KpiCard icon={Wallet} label="มูลค่าคงเหลือรวมทุก User" value={fmtB(grandRemainingValue)} sub="ทุกแอดมินรวมกัน" accent="warning"/>
        )}
        <KpiCard icon={PlusCircle}  label="รับเข้าทั้งหมด (ซอง)" value={fmt(totalReceived)} accent="success"/>
        <KpiCard icon={Wallet} label="มูลค่าคงเหลือ" value={fmtB(totalRemainingValue)} sub="ต้นทุนจริงของ Lot ที่ถือ" accent="purple"/>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--dx-border)" }}>
        {tabs.map(t => (
          <div key={t.v} onClick={() => setTab(t.v)}
            className={`dx-tab ${tab === t.v ? "dx-tab-active" : ""}`}>
            {t.l}
          </div>
        ))}
      </div>

      {/* Tab: ยอดคงเหลือ */}
      {tab === "balance" && (
        <div className="dx-card" style={{ padding: 20 }}>
          {balanceList.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "40px 0", fontSize: 13 }}>
              ยังไม่มีสินค้าในสต็อก
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {balanceList.map(r => {
                const lots = getMyLotBalance(r.sku_id)
                const activeLots = lots.filter(l => l.lotBalance > 0)
                const pct = r.received > 0 ? (r.balance / r.received * 100) : 0
                const isLow = r.balance < 24
                const balColor = r.balance === 0 ? "var(--dx-danger)"
                  : isLow ? "var(--dx-warning)"
                  : "var(--dx-cyan-bright)"
                return (
                  <div key={r.sku_id} style={{
                    padding: 14, borderRadius: 12,
                    background: "var(--dx-bg-input)",
                    border: "1px solid var(--dx-border)",
                    transition: "border-color .15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--dx-border-strong)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--dx-border)"}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Badge series={r.series}/>
                        <span className="dx-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>{r.sku_id}</span>
                        <span style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>{r.name}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p className="dx-mono" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: balColor, lineHeight: 1.1 }}>
                          {fmt(r.balance)}
                          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--dx-text-muted)", marginLeft: 4 }}>ซอง</span>
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                          {fmtBoxPack(r.balance, r.packs_per_box)}
                        </p>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "var(--dx-bg-page)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.min(100, pct)}%`,
                          background: isLow
                            ? "var(--dx-warning)"
                            : "linear-gradient(90deg, var(--dx-cyan), var(--dx-cyan-bright))",
                          boxShadow: isLow ? "none" : "0 0 6px var(--dx-glow)",
                        }}/>
                      </div>
                      <span className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>
                        {fmt(r.balance)}/{fmt(r.received)}
                      </span>
                    </div>
                    {activeLots.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {activeLots.map(l => (
                          <span key={l.lot_number} className="dx-mono" style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 999,
                            background: "rgba(0,212,255,0.08)",
                            color: "var(--dx-cyan-soft)",
                            border: "1px solid rgba(0,212,255,0.2)",
                          }}>
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
        <div className="dx-card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            ประวัติรับสินค้าจากสต็อกหลัก ({myTransfers.length})
          </h2>
          {myTransfers.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "40px 0", fontSize: 13 }}>
              ยังไม่มีประวัติ
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                    <Th align="left">วันที่</Th>
                    <Th align="left">SKU</Th>
                    <Th align="left">Lot</Th>
                    <Th align="right">จำนวน</Th>
                    <Th align="left">ผู้แจกจ่าย</Th>
                    <Th align="left">หมายเหตุ</Th>
                    {isAdmin && onDeleteTransfer && <Th align="center" style={{ width: 112 }}>จัดการ</Th>}
                  </tr>
                </thead>
                <tbody>
                  {[...myTransfers].sort((a, b) => (b.transferred_at || "").localeCompare(a.transferred_at || "")).map(t => {
                    const isConfirming = deleteTransferId === t.id
                    return (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                        <Td muted mono>{(t.transferred_at || "").slice(0, 10)}</Td>
                        <Td><span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{t.sku_id}</span></Td>
                        <Td muted mono>{t.lot_number || "-"}</Td>
                        <Td align="right">
                          <span className="dx-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--dx-success)" }}>
                            +{fmt(t.quantity_packs)} ซอง
                          </span>
                        </Td>
                        <Td muted>{t.created_by || "-"}</Td>
                        <Td muted>{t.note || "-"}</Td>
                        {isAdmin && onDeleteTransfer && (
                          <Td align="center">
                            {isConfirming ? (
                              <div style={{ display: "inline-flex", gap: 4 }}>
                                <button onClick={() => setDeleteTransferId(null)} disabled={deletingTransfer}
                                  style={{
                                    padding: "3px 8px", fontSize: 10, borderRadius: 6,
                                    border: "1px solid var(--dx-border)",
                                    background: "var(--dx-bg-elevated)", color: "var(--dx-text-secondary)",
                                    cursor: "pointer",
                                  }}>ยกเลิก</button>
                                <button onClick={() => handleDeleteTransfer(t.id)} disabled={deletingTransfer}
                                  style={{
                                    padding: "3px 8px", fontSize: 10, borderRadius: 6, border: "none",
                                    background: "var(--dx-danger)", color: "#fff",
                                    cursor: deletingTransfer ? "not-allowed" : "pointer",
                                    display: "inline-flex", alignItems: "center", gap: 3,
                                  }}>
                                  {deletingTransfer ? <Loader2 size={9} className="animate-spin"/> : <Trash2 size={9}/>}
                                  ลบ
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteTransferId(t.id)} title="ลบและคืนกลับสต็อกหลัก"
                                style={{
                                  padding: 5, borderRadius: 6, border: "none", cursor: "pointer",
                                  background: "rgba(255,68,102,0.1)", color: "var(--dx-danger)",
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,68,102,0.2)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,68,102,0.1)"}>
                                <Trash2 size={11}/>
                              </button>
                            )}
                          </Td>
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
        <div className="dx-card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            ประวัติเบิกไปเติมตู้ ({myStockOut.length})
          </h2>
          {myStockOut.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "40px 0", fontSize: 13 }}>
              ยังไม่มีประวัติ
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                    <Th align="left">วันที่</Th>
                    <Th align="left">SKU</Th>
                    <Th align="left">Lot</Th>
                    <Th align="left">ตู้ปลายทาง</Th>
                    <Th align="right">จำนวน</Th>
                    <Th align="left">หมายเหตุ</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...myStockOut].sort((a, b) => (b.withdrawn_at || "").localeCompare(a.withdrawn_at || "")).map(so => (
                    <tr key={so.id} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                      <Td muted mono>{(so.withdrawn_at || "").slice(0, 10)}</Td>
                      <Td><span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{so.sku_id}</span></Td>
                      <Td muted mono>{so.lot_number || "-"}</Td>
                      <Td>{so.machine_id}</Td>
                      <Td align="right">
                        <span className="dx-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--dx-danger)" }}>
                          -{fmt(so.quantity_packs)} ซอง
                        </span>
                      </Td>
                      <Td muted>{so.note || "-"}</Td>
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

function Td({ children, align = "left", muted, mono, style }) {
  return (
    <td className={mono ? "dx-mono" : undefined} style={{
      padding: "11px 10px",
      textAlign: align,
      fontSize: 11,
      color: muted ? "var(--dx-text-muted)" : "var(--dx-text-secondary)",
      ...style,
    }}>
      {children}
    </td>
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
