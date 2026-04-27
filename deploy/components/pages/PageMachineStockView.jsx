// PageMachineStockView — Dark Theme
import { useState } from "react"
import {
  RefreshCw, ArrowUpCircle, CheckCircle, AlertTriangle, Monitor, Package,
  ChevronUp, ChevronDown,
} from "lucide-react"
import { CHART_COLORS } from "../shared/constants"
import { fmt } from "../shared/helpers"
import { SectionTitle } from "../shared/dx-components"

export default function PageMachineStockView({ machines, machineStock, skus, onRefresh }) {
  const [selectedMachine, setSelectedMachine] = useState("all")
  const [sortBy, setSortBy] = useState("slot")
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [showSkuDetail, setShowSkuDetail] = useState(false)
  const [showRefill, setShowRefill] = useState(false)

  const triggerStockSync = async () => {
    try {
      setSyncing(true); setSyncMsg(null)
      const res = await fetch("/api/stock-sync", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg({ type: "success", msg: "กำลังดึงข้อมูลสต็อกหน้าตู้... รอสักครู่แล้วกด Refresh" })
        setTimeout(() => onRefresh?.(), 30000)
      } else {
        setSyncMsg({ type: "error", msg: data.error || "เกิดข้อผิดพลาด" })
      }
    } catch (err) { setSyncMsg({ type: "error", msg: err.message }) }
    finally { setSyncing(false) }
  }

  const machineNames = {}
  machines.forEach(m => { machineNames[m.machine_id] = m })
  ;["chukes01", "chukes02", "chukes03", "chukes04"].forEach(id => {
    if (!machineNames[id]) machineNames[id] = { name: id, location: "" }
  })

  const grouped = {}
  machineStock.forEach(s => {
    if (!grouped[s.machine_id]) grouped[s.machine_id] = []
    grouped[s.machine_id].push(s)
  })

  const machineIds = selectedMachine === "all"
    ? Object.keys(grouped).sort()
    : [selectedMachine].filter(id => grouped[id])

  const summarizeBySku = (slots) => {
    const map = {}
    slots.forEach(s => {
      const skuId = s.sku_id || s.product_name || "ไม่ระบุ"
      if (!map[skuId]) map[skuId] = { sku_id: skuId, product_name: s.product_name, remain: 0, capacity: 0, slots: 0 }
      map[skuId].remain += s.remain || 0
      map[skuId].capacity += s.max_capacity || 0
      map[skuId].slots += 1
    })
    return Object.values(map).sort((a, b) => sortBy === "remain" ? b.remain - a.remain : a.sku_id.localeCompare(b.sku_id))
  }

  const lastSync = machineStock.length > 0
    ? machineStock.reduce((latest, s) => { const t = s.synced_at || ""; return t > latest ? t : latest }, "")
    : null

  // Stale = sync เก่ากว่า 24 ชม. → เตือน · กันกรณี sync ตายเงียบ (เช่น VMS API เปลี่ยน)
  const lastSyncMs = lastSync ? new Date(lastSync).getTime() : 0
  const staleHours = lastSync ? (Date.now() - lastSyncMs) / 3_600_000 : 0
  const isStale = lastSync && staleHours > 24

  // Refill report data
  const getRefillData = () => {
    const machIds = selectedMachine === "all"
      ? Object.keys(grouped).sort()
      : [selectedMachine].filter(id => grouped[id])
    return machIds.map(machId => {
      const slots = grouped[machId] || []
      const mInfo = machineNames[machId] || { name: machId, location: "" }
      const skuRefill = {}
      slots.filter(s => s.product_name && s.is_occupied).forEach(s => {
        const name = s.product_name || ""
        const isBox = name.toLowerCase().includes("box")
        const key = (s.sku_id || name) + (isBox ? "_box" : "_pack")
        const refill = Math.max(0, (s.max_capacity || 0) - (s.remain || 0))
        if (!skuRefill[key]) skuRefill[key] = { sku_id: s.sku_id || "", name, isBox, refill: 0, remain: 0, capacity: 0, slots: 0, slotNums: [] }
        skuRefill[key].refill += refill
        skuRefill[key].remain += s.remain || 0
        skuRefill[key].capacity += s.max_capacity || 0
        skuRefill[key].slots += 1
        if (refill > 0) skuRefill[key].slotNums.push(s.slot_number)
      })
      const list = Object.values(skuRefill).sort((a, b) => a.sku_id.localeCompare(b.sku_id))
      return {
        machId, mInfo, list,
        totalBox: list.filter(r => r.isBox).reduce((a, r) => a + r.refill, 0),
        totalPack: list.filter(r => !r.isBox).reduce((a, r) => a + r.refill, 0),
      }
    })
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle
        pill={lastSync ? `VMS · ${lastSync.slice(0, 10)} ${lastSync.slice(11, 16)}` : "VMS · Live"}
        title="สต็อกหน้าตู้ (VMS)"
        subtitle="ข้อมูลคงเหลือจริงที่หน้าตู้ขาย ดึงจากระบบ VMS"
        actions={
          <>
            <button onClick={triggerStockSync} disabled={syncing} className="dx-btn dx-btn-primary"
              style={{ opacity: syncing ? 0.5 : 1, cursor: syncing ? "not-allowed" : "pointer" }}>
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""}/>
              {syncing ? "กำลังดึง..." : "ดึงข้อมูล VMS"}
            </button>
            {machineStock.length > 0 && (
              <button onClick={() => setShowRefill(v => !v)}
                className={`dx-btn ${showRefill ? "dx-btn-secondary" : "dx-btn-ghost"}`}>
                <ArrowUpCircle size={13}/>
                {showRefill ? "ปิดรายงาน" : "รายงานเติมสินค้า"}
              </button>
            )}
            <select value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)}
              className="dx-input" style={{ width: "auto", padding: "9px 12px", fontSize: 12 }}>
              <option value="all">ทุกตู้</option>
              {Object.keys(grouped).sort().map(id => (
                <option key={id} value={id}>{machineNames[id]?.name || id}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ v: "slot", l: "ตามช่อง" }, { v: "sku", l: "ตาม SKU" }, { v: "remain", l: "คงเหลือ" }].map(t => (
                <button key={t.v} onClick={() => setSortBy(t.v)}
                  className={`dx-chip ${sortBy === t.v ? "dx-chip-active" : ""}`}
                  style={{ padding: "6px 10px", fontSize: 11 }}>
                  {t.l}
                </button>
              ))}
            </div>
          </>
        }
      />

      {isStale && !syncMsg && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, fontSize: 12,
          background: "rgba(255,200,87,0.08)",
          border: "1px solid rgba(255,200,87,0.3)",
          color: "var(--dx-warning)",
        }}>
          <AlertTriangle size={16}/>
          <span>
            ข้อมูลสต็อกหน้าตู้เก่ากว่า {Math.floor(staleHours)} ชม. — sync อาจมีปัญหา
            กดปุ่ม "ดึงข้อมูล VMS" เพื่อ refresh · ถ้ายังเก่าหลัง sync แจ้งทีมเทคโนโลยี
          </span>
        </div>
      )}

      {syncMsg && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, fontSize: 12,
          background: syncMsg.type === "success" ? "rgba(0,255,136,0.08)" : "rgba(255,68,102,0.08)",
          border: `1px solid ${syncMsg.type === "success" ? "rgba(0,255,136,0.25)" : "rgba(255,68,102,0.25)"}`,
          color: syncMsg.type === "success" ? "var(--dx-success)" : "var(--dx-danger)",
        }}>
          {syncMsg.type === "success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          <span>{syncMsg.msg}</span>
          {syncMsg.type === "success" && (
            <button onClick={() => { onRefresh?.(); setSyncMsg(null) }}
              style={{
                marginLeft: "auto", padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: "var(--dx-success)", color: "#0A1628", border: "none", cursor: "pointer",
              }}>Refresh</button>
          )}
        </div>
      )}

      {/* Refill Report (inline, print = light theme) */}
      {showRefill && machineStock.length > 0 && (
        <div id="refill-report" style={{
          background: "var(--dx-bg-card)",
          border: "2px solid rgba(255,200,87,0.3)",
          borderRadius: 16, padding: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }} className="print:hidden">
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--dx-warning)" }}>รายงานเติมสินค้า</h2>
            <button onClick={() => window.print()} className="dx-btn dx-btn-primary">
              Print / Save PDF
            </button>
          </div>
          {getRefillData().filter(d => d.list.length > 0).map(({ machId, mInfo, list, totalBox, totalPack }) => (
            <div key={machId} className="refill-machine" style={{ marginBottom: 24 }}>
              <div className="hidden print:block" style={{ textAlign: "center", marginBottom: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>DivisionX Card — รายงานเติมสินค้า</p>
                <p style={{ margin: 0, fontSize: 11 }}>
                  {new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}
                  {" เวลา "}{new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}{" น."}
                </p>
              </div>
              <h3 style={{
                margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "var(--dx-text)",
                borderBottom: "2px solid var(--dx-border-strong)", paddingBottom: 4,
              }}>
                {mInfo.name || machId} — {mInfo.location || ""}
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "var(--dx-bg-elevated)" }}>
                      {["SKU", "สินค้า", "ประเภท", "ช่อง", "คงเหลือ", "ความจุ", "ต้องเติม"].map((h, i) => (
                        <th key={h} style={{
                          padding: "6px 10px", fontWeight: 600,
                          textAlign: ["คงเหลือ", "ความจุ", "ต้องเติม"].includes(h) ? "right" : i === 2 || i === 3 ? "center" : "left",
                          color: h === "ต้องเติม" ? "var(--dx-danger)" : "var(--dx-text-secondary)",
                          border: "1px solid var(--dx-border)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(r => {
                      const unit = r.isBox ? "กล่อง" : "ซอง"
                      const full = r.refill === 0
                      return (
                        <tr key={r.sku_id + (r.isBox ? "b" : "p")}
                          style={{ background: full ? "rgba(0,255,136,0.04)" : "transparent" }}>
                          <td className="dx-mono" style={{ padding: "5px 10px", fontWeight: 700, color: "var(--dx-text)", border: "1px solid var(--dx-border)" }}>{r.sku_id}</td>
                          <td style={{ padding: "5px 10px", color: "var(--dx-text-secondary)", border: "1px solid var(--dx-border)" }}>{r.name}</td>
                          <td style={{ padding: "5px 10px", textAlign: "center", color: "var(--dx-text-secondary)", border: "1px solid var(--dx-border)" }}>{unit}</td>
                          <td style={{ padding: "5px 10px", textAlign: "center", color: "var(--dx-text-secondary)", border: "1px solid var(--dx-border)" }}>{r.slots}</td>
                          <td className="dx-mono" style={{ padding: "5px 10px", textAlign: "right", color: "var(--dx-text-secondary)", border: "1px solid var(--dx-border)" }}>{r.remain}</td>
                          <td className="dx-mono" style={{ padding: "5px 10px", textAlign: "right", color: "var(--dx-text-secondary)", border: "1px solid var(--dx-border)" }}>{r.capacity}</td>
                          <td className="dx-mono" style={{
                            padding: "5px 10px", textAlign: "right", fontWeight: 700,
                            color: full ? "var(--dx-success)" : "var(--dx-danger)",
                            border: "1px solid var(--dx-border)",
                          }}>
                            {full ? "เต็ม" : `${r.refill} ${unit}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "rgba(0,212,255,0.08)", fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: "6px 10px", color: "var(--dx-text)", border: "1px solid var(--dx-border)" }}>รวมต้องเติม</td>
                      <td className="dx-mono" style={{ padding: "6px 10px", textAlign: "right", color: "var(--dx-text)", border: "1px solid var(--dx-border)" }}>
                        {list.reduce((a, r) => a + r.remain, 0)}
                      </td>
                      <td className="dx-mono" style={{ padding: "6px 10px", textAlign: "right", color: "var(--dx-text)", border: "1px solid var(--dx-border)" }}>
                        {list.reduce((a, r) => a + r.capacity, 0)}
                      </td>
                      <td className="dx-mono" style={{
                        padding: "6px 10px", textAlign: "right", color: "var(--dx-danger)",
                        border: "1px solid var(--dx-border)",
                      }}>
                        {totalBox > 0 ? `${totalBox} กล่อง` : ""}
                        {totalBox > 0 && totalPack > 0 ? " / " : ""}
                        {totalPack > 0 ? `${totalPack} ซอง` : ""}
                        {totalBox === 0 && totalPack === 0 ? "เต็ม" : ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRefill ? null : machineStock.length === 0 ? (
        <div className="dx-card" style={{ padding: 60, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,212,255,0.05)",
            border: "1px dashed var(--dx-border-glow)",
            color: "var(--dx-cyan)",
          }}>
            <Monitor size={28}/>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dx-text)" }}>ยังไม่มีข้อมูลสต็อกหน้าตู้</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
            ข้อมูลจะปรากฏหลังเชื่อมต่อ VMS API และดึงข้อมูลครั้งแรก
          </p>
          <div style={{
            marginTop: 16, padding: 14, borderRadius: 10, textAlign: "left", maxWidth: 380, margin: "16px auto 0",
            background: "rgba(255,200,87,0.05)",
            border: "1px solid rgba(255,200,87,0.2)",
          }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--dx-warning)" }}>รอดำเนินการ:</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-warning)" }}>ขออนุญาตใช้ API จาก VMS InboxCorp</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Grand Summary */}
          {selectedMachine === "all" && (() => {
            const allSkuMap = {}
            machineStock.filter(s => s.product_name && s.is_occupied).forEach(s => {
              const skuId = s.sku_id || s.product_name || "ไม่ระบุ"
              if (!allSkuMap[skuId]) allSkuMap[skuId] = { sku_id: skuId, product_name: s.product_name, remain: 0, capacity: 0, perMachine: {} }
              allSkuMap[skuId].remain += s.remain || 0
              allSkuMap[skuId].capacity += s.max_capacity || 0
              if (!allSkuMap[skuId].perMachine[s.machine_id]) allSkuMap[skuId].perMachine[s.machine_id] = 0
              allSkuMap[skuId].perMachine[s.machine_id] += s.remain || 0
            })
            const allSkuList = Object.values(allSkuMap).sort((a, b) => b.remain - a.remain)
            const grandRemain = allSkuList.reduce((a, r) => a + r.remain, 0)
            const allMachineIds = Object.keys(grouped).sort()

            const machTotals = {}
            allMachineIds.forEach(id => {
              let totalPacks = 0, totalBoxes = 0
              machineStock.filter(s => s.machine_id === id && s.is_occupied && s.product_name).forEach(s => {
                const name = (s.product_name || "").toLowerCase()
                const isBox = name.includes("(box)") || name.includes("box")
                if (isBox) totalBoxes += s.remain || 0
                else totalPacks += s.remain || 0
              })
              machTotals[id] = { packs: totalPacks, boxes: totalBoxes }
            })
            const grandPacks = Object.values(machTotals).reduce((a, t) => a + t.packs, 0)
            const grandBoxes = Object.values(machTotals).reduce((a, t) => a + t.boxes, 0)

            return (
              <div className="dx-card" style={{ padding: 0, overflow: "hidden" }}>
                <button onClick={() => setShowSkuDetail(v => !v)}
                  style={{
                    width: "100%", padding: 20,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "transparent", border: "none", cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background .15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ textAlign: "left" }}>
                    <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>สรุปยอดรวมทุกตู้</h2>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
                      {allSkuList.length} SKU · {fmt(grandRemain)} ซอง · {allMachineIds.length} ตู้
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div className="hidden sm:flex" style={{ alignItems: "center", gap: 10 }}>
                      {allMachineIds.map((id, i) => (
                        <div key={id} style={{ textAlign: "center" }}>
                          <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)" }}>
                            {machineNames[id]?.name || id}
                          </p>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 2 }}>
                            <span className="dx-mono" style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                              background: "rgba(255,68,102,0.08)", color: "var(--dx-danger)",
                            }}>{fmt(machTotals[id].boxes)} กล่อง</span>
                            <span className="dx-mono" style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                              background: "rgba(0,212,255,0.08)", color: "var(--dx-cyan-soft)",
                            }}>{fmt(machTotals[id].packs)} ซอง</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: "right", borderLeft: "1px solid var(--dx-border)", paddingLeft: 14 }}>
                      <div className="dx-mono" style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dx-danger)" }}>
                          {fmt(grandBoxes)} <span style={{ fontSize: 10, fontWeight: 500 }}>กล่อง</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dx-cyan-bright)" }}>
                          {fmt(grandPacks)} <span style={{ fontSize: 10, fontWeight: 500 }}>ซอง</span>
                        </span>
                      </div>
                    </div>
                    {showSkuDetail ? <ChevronUp size={14} style={{ color: "var(--dx-text-muted)" }}/> : <ChevronDown size={14} style={{ color: "var(--dx-text-muted)" }}/>}
                  </div>
                </button>

                {showSkuDetail && (
                  <div style={{ borderTop: "1px solid var(--dx-border)", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--dx-bg-elevated)" }}>
                          <Th align="left">SKU</Th>
                          <Th align="left">สินค้า</Th>
                          {allMachineIds.map(id => <Th key={id} align="center">{machineNames[id]?.name || id}</Th>)}
                          <Th align="right" style={{ color: "var(--dx-danger)" }}>รวม</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {allSkuList.map(r => {
                          const isBox = (r.product_name || "").toLowerCase().includes("box")
                          return (
                            <tr key={r.sku_id + (isBox ? "_box" : "_pack")} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                              <td className="dx-mono" style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{r.sku_id}</td>
                              <td style={{ padding: "8px 8px", fontSize: 11, color: "var(--dx-text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.product_name}
                              </td>
                              {allMachineIds.map(id => {
                                const val = r.perMachine[id] || 0
                                return (
                                  <td key={id} className="dx-mono" style={{
                                    padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 500,
                                    color: val === 0 ? "var(--dx-text-disabled)" : val < 5 ? "var(--dx-warning)" : "var(--dx-text-secondary)",
                                  }}>
                                    {val > 0 ? fmt(val) : "-"}
                                  </td>
                                )
                              })}
                              <td className="dx-mono" style={{
                                padding: "8px 8px", textAlign: "right", fontWeight: 700,
                                color: isBox ? "var(--dx-danger)" : "var(--dx-cyan-bright)",
                              }}>
                                {fmt(r.remain)} {isBox ? "กล่อง" : "ซอง"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "var(--dx-bg-elevated)", fontWeight: 700 }}>
                          <td colSpan={2} style={{ padding: "10px 12px", fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>
                            รวมทั้งหมด
                          </td>
                          {allMachineIds.map(id => (
                            <td key={id} className="dx-mono" style={{ padding: "10px 8px", textAlign: "center", fontSize: 10 }}>
                              <span style={{ color: "var(--dx-danger)", fontWeight: 700 }}>{fmt(machTotals[id].boxes)}</span>
                              <span style={{ color: "var(--dx-text-muted)", margin: "0 3px" }}>/</span>
                              <span style={{ color: "var(--dx-cyan-bright)", fontWeight: 700 }}>{fmt(machTotals[id].packs)}</span>
                            </td>
                          ))}
                          <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right" }}>
                            <span style={{ color: "var(--dx-danger)", fontWeight: 700 }}>{fmt(grandBoxes)} กล่อง</span>
                            <span style={{ color: "var(--dx-text-muted)", margin: "0 4px" }}>/</span>
                            <span style={{ color: "var(--dx-cyan-bright)", fontWeight: 700 }}>{fmt(grandPacks)} ซอง</span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Per-machine cards */}
          {machineIds.map((machId, mi) => {
            const slots = grouped[machId] || []
            const mInfo = machineNames[machId] || { name: machId, location: "" }
            const totalRemain = slots.reduce((a, s) => a + (s.remain || 0), 0)
            const totalCapacity = slots.reduce((a, s) => a + (s.max_capacity || 0), 0)
            const pct = totalCapacity > 0 ? ((totalRemain / totalCapacity) * 100).toFixed(1) : 0
            const skuSummary = summarizeBySku(slots)
            const activeSlots = slots.filter(s => s.product_name && s.remain !== null)
            const pctNum = parseFloat(pct)
            const progressColor = pctNum < 30 ? "var(--dx-danger)" : pctNum < 60 ? "var(--dx-warning)" : "var(--dx-success)"
            const progressGlow = pctNum >= 60 ? "0 0 8px var(--dx-glow)" : "none"

            return (
              <div key={machId} className="dx-card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: 20, borderBottom: "1px solid var(--dx-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: 999,
                        background: CHART_COLORS[mi % CHART_COLORS.length],
                        boxShadow: `0 0 8px ${CHART_COLORS[mi % CHART_COLORS.length]}`,
                      }}/>
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dx-text)" }}>
                          {mInfo.name || machId}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
                          {mInfo.location} · {activeSlots.length} ช่อง · {skuSummary.length} SKU
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="dx-mono" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--dx-text)" }}>
                        {pct}%
                      </p>
                      <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
                        {fmt(totalRemain)}/{fmt(totalCapacity)}
                      </p>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, height: 6, background: "var(--dx-bg-input)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: pctNum >= 60
                        ? "linear-gradient(90deg, var(--dx-cyan), var(--dx-cyan-bright))"
                        : progressColor,
                      boxShadow: progressGlow,
                    }}/>
                  </div>
                </div>

                {sortBy !== "slot" ? (
                  <div style={{ padding: 20 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 600, color: "var(--dx-text-secondary)" }}>
                      สรุปตาม SKU
                    </h3>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                            <Th align="left">SKU</Th>
                            <Th align="left">สินค้า</Th>
                            <Th align="center">ช่อง</Th>
                            <Th align="right">ซอง</Th>
                            <Th align="right" style={{ color: "#B794F6" }}>กล่อง</Th>
                            <Th align="right">ความจุ</Th>
                            <Th align="left" style={{ width: 96 }}>สัดส่วน</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {skuSummary.map(r => {
                            const skuPct = r.capacity > 0 ? (r.remain / r.capacity * 100) : 0
                            const pColor = skuPct < 30 ? "var(--dx-danger)" : skuPct < 60 ? "var(--dx-warning)" : "var(--dx-success)"
                            const remColor = r.remain === 0 ? "var(--dx-danger)"
                              : r.remain < 5 ? "var(--dx-warning)"
                              : "var(--dx-success)"
                            return (
                              <tr key={r.sku_id} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                                <td className="dx-mono" style={{ padding: "8px 8px", fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{r.sku_id}</td>
                                <td style={{ padding: "8px 8px", fontSize: 11, color: "var(--dx-text-muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {r.product_name}
                                </td>
                                <td style={{ padding: "8px 8px", textAlign: "center", fontSize: 11, color: "var(--dx-text-muted)" }}>{r.slots}</td>
                                <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: remColor }}>
                                  {fmt(r.remain)}
                                </td>
                                <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, fontWeight: 500, color: "#B794F6" }}>
                                  {(() => {
                                    const ppb = (skus.find(s => s.sku_id === r.sku_id)?.packs_per_box) || 24
                                    const b = Math.floor(r.remain / ppb); const p = r.remain % ppb
                                    return b > 0 ? `${b}${p > 0 ? `+${p}ซอง` : ""}` : r.remain > 0 ? `${r.remain}ซอง` : "-"
                                  })()}
                                </td>
                                <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, color: "var(--dx-text-muted)" }}>
                                  {fmt(r.capacity)}
                                </td>
                                <td style={{ padding: "8px 8px" }}>
                                  <div style={{ height: 3, background: "var(--dx-bg-input)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${skuPct}%`, background: pColor }}/>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 20 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                      {slots.map(s => {
                        const isEmpty = !s.product_name
                        const isZero = s.remain === 0 && !isEmpty
                        const matchedSku = skus.find(sk => sk.sku_id === s.sku_id)
                        const imgUrl = matchedSku?.image_url || null
                        return (
                          <div key={s.slot_number} style={{
                            borderRadius: 10, overflow: "hidden",
                            background: isEmpty ? "rgba(255,255,255,0.02)"
                              : isZero ? "rgba(255,68,102,0.05)"
                              : "var(--dx-bg-input)",
                            border: isEmpty ? "1px solid var(--dx-border)"
                              : isZero ? "1px solid rgba(255,68,102,0.25)"
                              : "1px solid var(--dx-border)",
                            opacity: isEmpty ? 0.4 : 1,
                            transition: "all .15s",
                          }}>
                            <div className="dx-mono" style={{
                              textAlign: "center", padding: "4px 0",
                              fontSize: 10, fontWeight: 700,
                              color: isEmpty ? "var(--dx-text-muted)" : "var(--dx-cyan-soft)",
                            }}>
                              {s.slot_number}
                            </div>
                            {isEmpty ? (
                              <div style={{ padding: "0 8px 10px", textAlign: "center" }}>
                                <div style={{
                                  height: 56, background: "var(--dx-bg-page)", borderRadius: 6,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  marginBottom: 6,
                                }}>
                                  <Package size={18} style={{ color: "var(--dx-text-disabled)" }}/>
                                </div>
                                <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)" }}>ไม่มีสินค้า</p>
                              </div>
                            ) : (
                              <div style={{ padding: "0 8px 8px" }}>
                                {imgUrl ? (
                                  <div style={{
                                    height: 76, borderRadius: 6, overflow: "hidden", marginBottom: 6,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: "var(--dx-bg-page)",
                                  }}>
                                    <img src={imgUrl} alt={s.product_name}
                                      style={{ height: "100%", width: "auto", objectFit: "contain", padding: 4 }}
                                      loading="lazy"
                                      onError={e => { e.target.onerror = null; e.target.style.display = "none" }}/>
                                  </div>
                                ) : (
                                  <div style={{
                                    height: 76, borderRadius: 6, marginBottom: 6,
                                    background: "linear-gradient(180deg, rgba(0,212,255,0.08) 0%, transparent 100%)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}>
                                    <Package size={24} style={{ color: "rgba(0,212,255,0.3)" }}/>
                                  </div>
                                )}
                                <p style={{
                                  margin: 0, fontSize: 10, fontWeight: 500, color: "var(--dx-text-secondary)",
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                }} title={s.product_name}>
                                  {s.product_name}
                                </p>
                                <p style={{ margin: "4px 0 2px", fontSize: 9, color: "var(--dx-text-muted)" }}>คงเหลือ</p>
                                <div style={{
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  borderRadius: 6,
                                  background: isZero ? "rgba(255,68,102,0.1)" : "var(--dx-bg-page)",
                                  border: `1px solid ${isZero ? "rgba(255,68,102,0.2)" : "var(--dx-border)"}`,
                                }}>
                                  <span className="dx-mono" style={{
                                    padding: "5px 0", fontSize: 13, fontWeight: 700,
                                    color: isZero ? "var(--dx-danger)"
                                      : s.remain <= 3 ? "var(--dx-warning)"
                                      : "var(--dx-cyan-bright)",
                                  }}>
                                    {s.remain}
                                  </span>
                                </div>
                                <p style={{ margin: "4px 0 0", textAlign: "center", fontSize: 9, color: "var(--dx-cyan-soft)" }}>
                                  ความจุ: {s.max_capacity}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Th({ children, align = "left", style }) {
  return (
    <th style={{
      padding: "8px 8px", textAlign: align,
      fontSize: 10, fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase",
      color: "var(--dx-text-muted)",
      ...style,
    }}>
      {children}
    </th>
  )
}
