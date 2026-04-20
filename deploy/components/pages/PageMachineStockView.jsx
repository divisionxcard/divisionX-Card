import { useState } from "react"
import {
  RefreshCw, ArrowUpCircle, CheckCircle, AlertTriangle, Monitor, Package,
  ChevronUp, ChevronDown,
} from "lucide-react"
import { CHART_COLORS } from "../shared/constants"
import { fmt } from "../shared/helpers"

export default function PageMachineStockView({ machines, machineStock, skus, onRefresh }) {
  const [selectedMachine, setSelectedMachine] = useState("all")
  const [sortBy, setSortBy] = useState("slot") // slot, sku, remain
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [showSkuDetail, setShowSkuDetail] = useState(false)
  const [showRefill, setShowRefill] = useState(false)

  // ── Export รายงานเติมสินค้า ──
  // สร้างข้อมูลรายงานเติมสินค้า (ใช้แสดง inline)
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
      return { machId, mInfo, list,
        totalBox: list.filter(r => r.isBox).reduce((a, r) => a + r.refill, 0),
        totalPack: list.filter(r => !r.isBox).reduce((a, r) => a + r.refill, 0),
      }
    })
  }

  const triggerStockSync = async () => {
    try {
      setSyncing(true)
      setSyncMsg(null)
      const res = await fetch("/api/stock-sync", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg({ type:"success", msg:"กำลังดึงข้อมูลสต็อกหน้าตู้... รอสักครู่แล้วกด Refresh" })
        setTimeout(() => onRefresh?.(), 30000)
      } else {
        setSyncMsg({ type:"error", msg: data.error || "เกิดข้อผิดพลาด" })
      }
    } catch (err) { setSyncMsg({ type:"error", msg: err.message }) }
    finally { setSyncing(false) }
  }

  // Map VMS machine_id → machine name
  const machineNames = {}
  machines.forEach(m => { machineNames[m.machine_id] = m })
  // fallback สำหรับ machine_id ที่ไม่ได้อยู่ในตาราง machines
  ;["chukes01","chukes02","chukes03","chukes04"].forEach(id => {
    if (!machineNames[id]) machineNames[id] = { name: id, location: "" }
  })

  // จัดกลุ่มตามตู้
  const grouped = {}
  machineStock.forEach(s => {
    if (!grouped[s.machine_id]) grouped[s.machine_id] = []
    grouped[s.machine_id].push(s)
  })

  const machineIds = selectedMachine === "all"
    ? Object.keys(grouped).sort()
    : [selectedMachine].filter(id => grouped[id])

  // สรุป SKU ต่อตู้
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

  // เวลาที่ sync ล่าสุด
  const lastSync = machineStock.length > 0
    ? machineStock.reduce((latest, s) => {
        const t = s.synced_at || ""
        return t > latest ? t : latest
      }, "")
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">สต็อกหน้าตู้ (VMS)</h1>
          <p className="text-sm text-gray-400">
            ข้อมูลคงเหลือจริงที่หน้าตู้ขาย ดึงจากระบบ VMS
            {lastSync && <span className="ml-2">· อัปเดตล่าสุด: {lastSync.slice(0,10)} {lastSync.slice(11,16)}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={triggerStockSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""}/>
            {syncing ? "กำลังดึง..." : "ดึงข้อมูล VMS"}
          </button>
          {machineStock.length > 0 && (
            <button onClick={() => setShowRefill(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${showRefill ? "bg-orange-600 text-white" : "bg-orange-500 text-white hover:bg-orange-600"}`}>
              <ArrowUpCircle size={14}/>
              {showRefill ? "ปิดรายงาน" : "รายงานเติมสินค้า"}
            </button>
          )}
          <select value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">ทุกตู้</option>
            {Object.keys(grouped).sort().map(id => (
              <option key={id} value={id}>{machineNames[id]?.name || id}</option>
            ))}
          </select>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"slot",l:"ตามช่อง"},{v:"sku",l:"ตาม SKU"},{v:"remain",l:"คงเหลือ"}].map(t => (
              <button key={t.v} onClick={() => setSortBy(t.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {syncMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${syncMsg.type==="success"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {syncMsg.type==="success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          {syncMsg.msg}
          {syncMsg.type==="success" && <button onClick={() => { onRefresh?.(); setSyncMsg(null) }} className="ml-auto text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700">Refresh</button>}
        </div>
      )}

      {/* ── รายงานเติมสินค้า (inline) ── */}
      {showRefill && machineStock.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-orange-200 shadow-sm p-5 print:border-0 print:shadow-none print:p-0" id="refill-report">
          <div className="flex items-center justify-between mb-4 print:hidden">
            <h2 className="text-lg font-bold text-orange-700">รายงานเติมสินค้า</h2>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">
              Print / Save PDF
            </button>
          </div>
          {getRefillData().filter(d => d.list.length > 0).map(({ machId, mInfo, list, totalBox, totalPack }) => (
            <div key={machId} className="mb-6 refill-machine">
              <div className="hidden print:block text-center mb-2">
                <p className="font-bold text-sm">DivisionX Card — รายงานเติมสินค้า</p>
                <p className="text-xs">{new Date().toLocaleDateString("th-TH", {year:"numeric",month:"long",day:"numeric"})} เวลา {new Date().toLocaleTimeString("th-TH", {hour:"2-digit",minute:"2-digit"})} น.</p>
              </div>
              <h3 className="font-bold text-gray-800 text-sm border-b-2 border-gray-800 pb-1 mb-2">
                {mInfo.name || machId} — {mInfo.location || ""}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-2 py-1.5 text-left">SKU</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-left">สินค้า</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center">ประเภท</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-center">ช่อง</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-right">คงเหลือ</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-right">ความจุ</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-right font-bold text-red-600">ต้องเติม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(r => {
                      const unit = r.isBox ? "กล่อง" : "ซอง"
                      return (
                        <tr key={r.sku_id + (r.isBox?"b":"p")} className={r.refill === 0 ? "bg-green-50" : ""}>
                          <td className="border border-gray-300 px-2 py-1 font-mono font-bold">{r.sku_id}</td>
                          <td className="border border-gray-300 px-2 py-1">{r.name}</td>
                          <td className="border border-gray-300 px-2 py-1 text-center">{unit}</td>
                          <td className="border border-gray-300 px-2 py-1 text-center">{r.slots}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right">{r.remain}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right">{r.capacity}</td>
                          <td className={`border border-gray-300 px-2 py-1 text-right font-bold ${r.refill > 0 ? "text-red-600" : "text-green-600"}`}>
                            {r.refill > 0 ? `${r.refill} ${unit}` : "เต็ม"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 font-bold">
                      <td colSpan={4} className="border border-gray-300 px-2 py-1.5">รวมต้องเติม</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right">{list.reduce((a,r)=>a+r.remain,0)}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right">{list.reduce((a,r)=>a+r.capacity,0)}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right text-red-600">
                        {totalBox > 0 ? `${totalBox} กล่อง` : ""}{totalBox>0&&totalPack>0?" / ":""}{totalPack > 0 ? `${totalPack} ซอง` : ""}{totalBox===0&&totalPack===0?"เต็ม":""}
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <Monitor size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-500 font-medium">ยังไม่มีข้อมูลสต็อกหน้าตู้</p>
          <p className="text-gray-400 text-sm mt-1">ข้อมูลจะปรากฏหลังเชื่อมต่อ VMS API และดึงข้อมูลครั้งแรก</p>
          <div className="mt-4 p-4 bg-amber-50 rounded-xl text-left max-w-md mx-auto">
            <p className="text-xs text-amber-700 font-medium mb-1">รอดำเนินการ:</p>
            <p className="text-xs text-amber-600">ขออนุญาตใช้ API จาก VMS InboxCorp</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── สรุปยอดรวม SKU ทุกตู้ ── */}
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
            const grandCapacity = allSkuList.reduce((a, r) => a + r.capacity, 0)
            const allMachineIds = Object.keys(grouped).sort()

            // คำนวณยอดกล่อง+ซองต่อตู้ (แยกจาก product_name: "Box" vs "Pack")
            const machTotals = {}
            allMachineIds.forEach(id => {
              let totalPacks = 0, totalBoxes = 0
              machineStock.filter(s => s.machine_id === id && s.is_occupied && s.product_name).forEach(s => {
                const name = (s.product_name || "").toLowerCase()
                const isBox = name.includes("(box)") || name.includes("box")
                if (isBox) totalBoxes += s.remain || 0
                else       totalPacks += s.remain || 0
              })
              machTotals[id] = { packs: totalPacks, boxes: totalBoxes }
            })
            // รวม grand total
            const grandPacks = Object.values(machTotals).reduce((a, t) => a + t.packs, 0)
            const grandBoxes = Object.values(machTotals).reduce((a, t) => a + t.boxes, 0)

            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header — สรุปยอดรวม + ปุ่มแสดงรายละเอียด */}
                <button onClick={() => setShowSkuDetail(v => !v)}
                  className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="text-left">
                    <h2 className="font-semibold text-gray-700">สรุปยอดรวมทุกตู้</h2>
                    <p className="text-xs text-gray-400">{allSkuList.length} SKU · {fmt(grandRemain)} ซอง · {allMachineIds.length} ตู้</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* ยอดรวมแต่ละตู้ */}
                    <div className="hidden sm:flex items-center gap-3">
                      {allMachineIds.map((id, i) => (
                        <div key={id} className="text-center">
                          <p className="text-xs text-gray-400">{machineNames[id]?.name || id}</p>
                          <div className="flex gap-1 justify-center mt-0.5">
                            <span className="text-xs font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{fmt(machTotals[id].boxes)} กล่อง</span>
                            <span className="text-xs font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{fmt(machTotals[id].packs)} ซอง</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* ยอดรวมทั้งหมด 4 ตู้ */}
                    <div className="text-right border-l border-gray-200 pl-4">
                      <div className="flex gap-2">
                        <span className="text-sm font-bold text-red-600">{fmt(grandBoxes)} <span className="text-xs font-normal">กล่อง</span></span>
                        <span className="text-sm font-bold text-blue-600">{fmt(grandPacks)} <span className="text-xs font-normal">ซอง</span></span>
                      </div>
                    </div>
                    {showSkuDetail ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                  </div>
                </button>

                {/* ตาราง SKU — ซ่อน/แสดง */}
                {showSkuDetail && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-2 px-4 text-xs text-gray-400 font-medium">SKU</th>
                        <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">สินค้า</th>
                        {allMachineIds.map(id => (
                          <th key={id} className="text-center py-2 px-2 text-xs text-gray-400 font-medium">{machineNames[id]?.name || id}</th>
                        ))}
                        <th className="text-right py-2 px-2 text-xs text-red-500 font-medium">รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allSkuList.map(r => {
                        const isBox = (r.product_name || "").toLowerCase().includes("box")
                        return (
                          <tr key={r.sku_id + (isBox ? "_box" : "_pack")} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 px-4 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                            <td className="py-2 px-2 text-xs text-gray-500 truncate max-w-[120px]">{r.product_name}</td>
                            {allMachineIds.map(id => {
                              const val = r.perMachine[id] || 0
                              return (
                                <td key={id} className={`py-2 px-2 text-center text-xs font-medium ${val === 0 ? "text-gray-300" : val < 5 ? "text-amber-600" : "text-gray-700"}`}>
                                  {val > 0 ? fmt(val) : "-"}
                                </td>
                              )
                            })}
                            <td className={`py-2 px-2 text-right font-bold ${isBox ? "text-red-600" : "text-blue-600"}`}>
                              {fmt(r.remain)} {isBox ? "กล่อง" : "ซอง"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={2} className="py-2.5 px-4 text-xs text-gray-500">รวมทั้งหมด</td>
                        {allMachineIds.map(id => (
                          <td key={id} className="py-2.5 px-2 text-center text-xs">
                            <span className="text-red-600 font-bold">{fmt(machTotals[id].boxes)}</span>
                            <span className="text-gray-400 mx-0.5">/</span>
                            <span className="text-blue-600 font-bold">{fmt(machTotals[id].packs)}</span>
                          </td>
                        ))}
                        <td className="py-2.5 px-2 text-right">
                          <span className="text-red-700 font-bold">{fmt(grandBoxes)} กล่อง</span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="text-blue-700 font-bold">{fmt(grandPacks)} ซอง</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                )}
              </div>
            )
          })()}

          {machineIds.map((machId, mi) => {
            const slots = grouped[machId] || []
            const mInfo = machineNames[machId] || { name: machId, location: "" }
            const totalRemain = slots.reduce((a, s) => a + (s.remain || 0), 0)
            const totalCapacity = slots.reduce((a, s) => a + (s.max_capacity || 0), 0)
            const pct = totalCapacity > 0 ? ((totalRemain / totalCapacity) * 100).toFixed(1) : 0
            const skuSummary = summarizeBySku(slots)
            const activeSlots = slots.filter(s => s.product_name && s.remain !== null)

            return (
              <div key={machId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{backgroundColor: CHART_COLORS[mi % CHART_COLORS.length]}}/>
                      <div>
                        <p className="font-semibold text-gray-800">{mInfo.name || machId}</p>
                        <p className="text-xs text-gray-400">{mInfo.location} · {activeSlots.length} ช่อง · {skuSummary.length} SKU</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-800">{pct}%</p>
                      <p className="text-xs text-gray-400">{fmt(totalRemain)}/{fmt(totalCapacity)}</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full transition-all ${parseFloat(pct) < 30 ? "bg-red-400" : parseFloat(pct) < 60 ? "bg-amber-400" : "bg-green-400"}`}
                      style={{width:`${pct}%`}}/>
                  </div>
                </div>

                {/* SKU Summary */}
                {sortBy !== "slot" ? (
                  <div className="p-5">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3">สรุปตาม SKU</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-2 text-xs text-gray-400 font-medium">SKU</th>
                            <th className="text-left py-2 text-xs text-gray-400 font-medium">สินค้า</th>
                            <th className="text-center py-2 text-xs text-gray-400 font-medium">ช่อง</th>
                            <th className="text-right py-2 text-xs text-gray-400 font-medium">ซอง</th>
                            <th className="text-right py-2 text-xs text-purple-400 font-medium">กล่อง</th>
                            <th className="text-right py-2 text-xs text-gray-400 font-medium">ความจุ</th>
                            <th className="py-2 px-2 text-xs text-gray-400 font-medium w-24">สัดส่วน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {skuSummary.map(r => {
                            const sku = skus.find(s => s.sku_id === r.sku_id)
                            const skuPct = r.capacity > 0 ? (r.remain / r.capacity * 100) : 0
                            return (
                              <tr key={r.sku_id} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-2 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                                <td className="py-2 text-xs text-gray-500 truncate max-w-[150px]">{r.product_name}</td>
                                <td className="py-2 text-center text-xs text-gray-500">{r.slots}</td>
                                <td className={`py-2 text-right font-bold text-sm ${r.remain === 0 ? "text-red-500" : r.remain < 5 ? "text-amber-600" : "text-green-600"}`}>
                                  {fmt(r.remain)}
                                </td>
                                <td className="py-2 text-right text-xs text-purple-600 font-medium">
                                  {(() => { const ppb = (skus.find(s=>s.sku_id===r.sku_id)?.packs_per_box)||24; const b=Math.floor(r.remain/ppb); const p=r.remain%ppb; return b>0?`${b}${p>0?`+${p}ซอง`:""}`:r.remain>0?`${r.remain}ซอง`:"-" })()}
                                </td>
                                <td className="py-2 text-right text-xs text-gray-400">{fmt(r.capacity)}</td>
                                <td className="py-2 px-2">
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${skuPct < 30 ? "bg-red-400" : skuPct < 60 ? "bg-amber-400" : "bg-green-400"}`}
                                      style={{width:`${skuPct}%`}}/>
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
                  /* Slot view — VMS style */
                  <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-3">
                      {slots.map(s => {
                        const isEmpty = !s.product_name
                        const isZero = s.remain === 0 && !isEmpty
                        // หา SKU เพื่อใช้ image_url จากตาราง skus (เหมือนหน้าภาพรวม)
                        const matchedSku = skus.find(sk => sk.sku_id === s.sku_id)
                        const imgUrl = matchedSku?.image_url || null
                        return (
                          <div key={s.slot_number} className={`rounded-xl border overflow-hidden transition-all ${isEmpty ? "bg-gray-50 border-gray-200 opacity-40" : isZero ? "bg-red-50 border-red-200" : "bg-white border-blue-100 hover:border-blue-300 hover:shadow-sm"}`}>
                            {/* Slot number */}
                            <div className={`text-center py-1 text-xs font-mono font-bold ${isEmpty ? "text-gray-400" : "text-blue-500"}`}>
                              {s.slot_number}
                            </div>

                            {isEmpty ? (
                              <div className="px-2 pb-3 text-center">
                                <div className="w-full h-20 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                                  <Package size={20} className="text-gray-300"/>
                                </div>
                                <p className="text-xs text-gray-400">ไม่มีสินค้า</p>
                              </div>
                            ) : (
                              <div className="px-2 pb-2.5">
                                {/* Product image — ใช้รูปจาก skus table เหมือนหน้าภาพรวม */}
                                {imgUrl ? (
                                  <div className="w-full h-24 rounded-lg overflow-hidden bg-gray-50 mb-2 flex items-center justify-center">
                                    <img src={imgUrl} alt={s.product_name}
                                      className="h-full w-auto object-contain p-1"
                                      loading="lazy"
                                      onError={e => { e.target.onerror=null; e.target.style.display='none' }}/>
                                  </div>
                                ) : (
                                  <div className="w-full h-24 rounded-lg bg-gradient-to-b from-blue-50 to-white flex items-center justify-center mb-2">
                                    <Package size={24} className="text-blue-200"/>
                                  </div>
                                )}

                                {/* Product name */}
                                <p className="text-xs font-medium text-gray-700 truncate" title={s.product_name}>
                                  {s.product_name}
                                </p>

                                {/* คงเหลือ */}
                                <p className="text-xs text-gray-400 mt-1">คงเหลือ</p>
                                <div className={`mt-1 flex items-center justify-center gap-0 rounded-lg border ${isZero ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
                                  <span className={`py-1.5 px-3 text-sm font-bold text-center w-full ${isZero ? "text-red-500" : s.remain <= 3 ? "text-amber-600" : "text-gray-800"}`}>
                                    {s.remain}
                                  </span>
                                </div>

                                {/* ความจุ */}
                                <p className="text-center text-xs text-blue-500 mt-1.5">
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
