// PageSlots — Admin self-service slot management UI
// Layer 5 ของ slot-change resilience
import { useEffect, useMemo, useState } from "react"
import {
  Monitor, RefreshCw, History, Edit3, CheckCircle, Flag, X,
  AlertTriangle, Loader2, ArrowRight, Save, Repeat, Printer,
  ChevronDown, ChevronUp,
} from "lucide-react"
import { SectionTitle } from "../shared/dx-components"
import {
  getActiveSlotMappings, getSlotHistory, getRecentSlotChanges,
  recordSlotChangeManual, reviewSlotChange, reconcileSlotChange, undoReconcile,
  swapSlots,
} from "../../lib/supabase"

const STATUS_BADGE = {
  pending:   { color: "var(--dx-warning)", bg: "rgba(245,158,11,0.12)", label: "รอ review" },
  confirmed: { color: "var(--dx-success)", bg: "rgba(34,197,94,0.12)",  label: "ยืนยันแล้ว" },
  flagged:   { color: "var(--dx-danger)",  bg: "rgba(239,68,68,0.12)",  label: "ติดธง" },
}

const DISPOSITION_LABELS = {
  returned:             { label: "คืนกลาง",     color: "var(--dx-success)", icon: "↩" },
  transferred_to_admin: { label: "แอดมินถือ",  color: "var(--dx-cyan-soft)", icon: "👤" },
  moved_to_machine:     { label: "ตู้อื่น",     color: "var(--dx-warning)", icon: "→" },
  lost:                 { label: "สูญหาย/เคลม", color: "var(--dx-danger)",  icon: "✕" },
  unknown:              { label: "ไม่ทราบ",    color: "var(--dx-text-muted)", icon: "?" },
}

export default function PageSlots({ machines = [], skus = [], allProfiles = [], machineStock = [] }) {
  const [active, setActive] = useState([])
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMachine, setSelectedMachine] = useState("all")
  const [historyModal, setHistoryModal] = useState(null)   // { machine_id, slot_number }
  const [manualModal, setManualModal] = useState(null)     // { machine_id, slot_number, current }
  const [reconcileModal, setReconcileModal] = useState(null) // change event object
  const [swapModal, setSwapModal] = useState(false)
  const [expandedMachines, setExpandedMachines] = useState(() => new Set())  // default collapse · กด header เพื่อ expand
  // From-to date filter สำหรับ Review + Export PDF · default = 30 วันที่แล้ว → วันนี้
  const todayISO = () => new Date().toISOString().slice(0, 10)
  const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(daysAgoISO(30))
  const [toDate,   setToDate]   = useState(todayISO())
  // คำนวณ days ที่ต้องดึงจาก DB ตาม fromDate
  const reviewDays = useMemo(() => {
    const diff = Math.ceil((Date.now() - new Date(fromDate + "T00:00:00").getTime()) / 86400000)
    return Math.max(1, diff + 1)  // +1 กัน timezone offset
  }, [fromDate])

  // map: "machine_id::slot_number" → { remain, max_capacity, sku_id } จาก machineStock
  const stockBySlot = useMemo(() => {
    const m = {}
    for (const s of machineStock || []) {
      m[`${s.machine_id}::${s.slot_number}`] = s
    }
    return m
  }, [machineStock])

  const machineNames = useMemo(() => {
    const m = {}
    machines.forEach(x => { m[x.machine_id] = x.name || x.machine_id })
    return m
  }, [machines])

  const load = async () => {
    setLoading(true)
    try {
      const [a, c] = await Promise.all([
        getActiveSlotMappings(),
        getRecentSlotChanges(reviewDays, { includeReviewed: true }),
      ])
      setActive(a)
      setChanges(c)
    } catch (e) {
      console.error("load slots failed", e)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [reviewDays])

  const machineIds = useMemo(() => {
    const ids = [...new Set(active.map(r => r.machine_id))].sort()
    return selectedMachine === "all" ? ids : [selectedMachine].filter(id => ids.includes(id))
  }, [active, selectedMachine])

  const slotsByMachine = useMemo(() => {
    const m = {}
    active.forEach(r => {
      if (!m[r.machine_id]) m[r.machine_id] = []
      m[r.machine_id].push(r)
    })
    Object.values(m).forEach(arr => arr.sort((a, b) => (a.slot_number || "").localeCompare(b.slot_number || "", undefined, { numeric: true })))
    return m
  }, [active])

  const pendingCount = changes.filter(c => c.review_status === "pending").length

  // filter changes โดย from-to date · ใช้ทั้งใน table และ Export PDF
  const filteredChanges = useMemo(() => {
    const fromMs = new Date(fromDate + "T00:00:00").getTime()
    const toMs   = new Date(toDate + "T23:59:59").getTime()
    return changes.filter(c => {
      const t = new Date(c.changed_at).getTime()
      return t >= fromMs && t <= toMs && (selectedMachine === "all" || c.machine_id === selectedMachine)
    })
  }, [changes, fromDate, toDate, selectedMachine])

  // Export PDF · รายการเปลี่ยนสินค้าในตู้ · ช่วงวันที่เลือกได้ · มีลายเซ็น
  const handlePrintSlotChanges = () => {
    if (filteredChanges.length === 0) return
    try { _doPrintSlotChanges() }
    catch (err) {
      console.error("Export PDF failed:", err)
      alert(`Export PDF ล้มเหลว: ${err.message}`)
    }
  }

  const _doPrintSlotChanges = () => {
    const today = new Date()
    const genDateStr = today.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
    const genTimeStr = today.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    const fmtDate = (iso) => new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
    const rangeStr = fromDate === toDate ? fmtDate(fromDate + "T00:00:00") : `${fmtDate(fromDate + "T00:00:00")} — ${fmtDate(toDate + "T00:00:00")}`

    const rows = filteredChanges.map(c => {
      const tStr = new Date(c.changed_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
      const machineName = machineNames[c.machine_id] || c.machine_id
      const oldSku = c.old_sku_id || "—"
      const oldName = c.old_product_name || "—"
      const oldQty = c.pending_qty != null ? `${c.pending_qty}` : "—"
      const newSku = c.new_sku_id || "—"
      const newName = c.new_product_name || "—"
      // จำนวนหลังเปลี่ยน:
      // 1) preferred · initial_qty/capacity ที่ snapshot ตอน effective_from (แม่นยำ)
      // 2) fallback · machine_stock ปัจจุบัน ถ้า slot ยังเป็น sku เดิม (สำหรับ record เก่าก่อน migration 041)
      let newQty = "—"
      if (c.new_initial_qty != null || c.new_initial_capacity != null) {
        newQty = `${c.new_initial_qty ?? "—"} / ${c.new_initial_capacity ?? "—"}`
      } else {
        const cur = stockBySlot[`${c.machine_id}::${c.slot_number}`]
        if (cur && (cur.sku_id === c.new_sku_id || cur.product_name === c.new_product_name)) {
          newQty = `${cur.remain ?? "—"} / ${cur.max_capacity ?? "—"} *`
        }
      }
      return `<tr>
        <td>${tStr}</td>
        <td>${machineName}<div style="font-size:9px;color:#666">ช่อง ${c.slot_number}</div></td>
        <td><b style="font-family:monospace">${oldSku}</b><div style="font-size:9px">${oldName}</div></td>
        <td style="text-align:right;font-family:monospace">${oldQty}</td>
        <td><b style="font-family:monospace">${newSku}</b><div style="font-size:9px">${newName}</div></td>
        <td style="text-align:right;font-family:monospace">${newQty}</td>
      </tr>`
    }).join("")

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>รายการเปลี่ยนสินค้าในตู้ · ${rangeStr}</title>
<style>
  /* margin: 0 บน @page → browser ไม่มีพื้นที่วาง header/footer auto · ใช้ padding ที่ body แทน */
  @page { size: A4 portrait; margin: 0; }
  body { font-family: Tahoma, "Sarabun", "Noto Sans Thai", "Leelawadee UI", sans-serif; color: #000; margin: 0; padding: 10mm; }
  .header { text-align: center; margin-bottom: 10px; }
  .header h1 { margin: 0; font-size: 15px; }
  .header .sub { font-size: 11px; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 5px 6px; border: 1px solid #999; vertical-align: top; }
  thead tr { background: #f0f0f0; }
  thead th { font-weight: 700; text-align: left; }
  .footer { display: flex; justify-content: space-between; font-size: 11px; margin-top: 10px; padding-top: 6px; border-top: 1px solid #999; }
  .signatures { margin-top: 30px; display: flex; justify-content: space-between; gap: 60px; page-break-inside: avoid; }
  .sig-block { flex: 1; text-align: center; }
  .sig-line { padding: 22px 12px 4px; border-bottom: 1px solid #000; font-weight: 700; font-size: 12px; min-height: 22px; }
  .sig-label { margin-top: 4px; font-size: 11px; font-weight: 700; }
  .sig-date { margin-top: 4px; font-size: 10px; color: #444; }
  .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 20px; background: #00d4ff; color: #000; border: none; border-radius: 6px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  @media print { .print-btn { display: none; } }
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
<div class="header">
  <h1>รายการเปลี่ยนสินค้าในตู้ — DivisionX Card</h1>
  <div class="sub">ช่วงวันที่: ${rangeStr} · จัดทำเอกสาร: ${genDateStr} เวลา ${genTimeStr} น.</div>
</div>
<table>
  <thead><tr>
    <th>วันที่/เวลา</th>
    <th>ตู้ / ช่อง</th>
    <th>สินค้าเดิม</th>
    <th style="text-align:right">จำนวนก่อน</th>
    <th>สินค้าใหม่</th>
    <th style="text-align:right">จำนวนหลัง<div style="font-weight:400;font-size:9px">(คงเหลือ/ความจุ)</div></th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <span>รวมรายการเปลี่ยน: ${filteredChanges.length} รายการ</span>
  <span style="color:#666">หมายเหตุ: "จำนวนหลัง" = ตอนเริ่ม period (snapshot ตอนเปลี่ยน) · ค่าที่มี * คือสต็อกปัจจุบัน (fallback record เก่าก่อน migration 041)</span>
</div>
<div class="signatures">
  <div class="sig-block">
    <div class="sig-line">&nbsp;</div>
    <div class="sig-label">ผู้เปลี่ยนสินค้า / ลงชื่อ</div>
    <div class="sig-date">วันที่ ........../........../..........</div>
  </div>
  <div class="sig-block">
    <div class="sig-line">&nbsp;</div>
    <div class="sig-label">ผู้ตรวจสอบ / ลงชื่อ</div>
    <div class="sig-date">วันที่ ........../........../..........</div>
  </div>
</div>
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));</script>
</body></html>`

    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const printWin = window.open(url, "_blank")
    if (!printWin) {
      const a = document.createElement("a")
      a.href = url
      a.download = `slot-changes-${fromDate}_${toDate}.html`
      a.click()
      alert("Popup ถูก block · ดาวน์โหลด HTML ให้แทน")
      return
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const onReview = async (historyId, status) => {
    let note = null
    if (status === "flagged") {
      note = prompt("ระบุเหตุผล/รายละเอียดของปัญหา:")
      if (note === null) return
    }
    try {
      await reviewSlotChange(historyId, status, note)
      await load()
    } catch (e) { alert("Review ล้มเหลว: " + e.message) }
  }

  const onUndoReconcile = async (historyId) => {
    if (!confirm("ย้อน reconcile? · stock movement ที่สร้างจะถูกลบ · แล้ว reconcile ใหม่ได้")) return
    try {
      await undoReconcile(historyId)
      await load()
    } catch (e) { alert("ย้อน reconcile ล้มเหลว: " + e.message) }
  }

  return (
    <>
      <SectionTitle
        title="จัดการ Slot ของตู้"
        subtitle="ดู mapping ปัจจุบัน · บันทึกการเปลี่ยนสินค้าด้วยตนเอง · review การเปลี่ยนแปลงที่ scraper ตรวจพบ"
        actions={
          <>
            <select value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)}
              className="dx-input" style={{ minWidth: 140 }}>
              <option value="all">ทุกตู้</option>
              {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name || m.machine_id}</option>)}
            </select>
            <button onClick={() => setSwapModal(true)} className="dx-btn dx-btn-ghost">
              <Repeat size={14}/>สลับ Slot
            </button>
            <button onClick={load} className="dx-btn dx-btn-ghost" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
              Refresh
            </button>
          </>
        }
      />

      {/* Pending changes alert */}
      {pendingCount > 0 && (
        <div style={{
          padding: "12px 14px", borderRadius: 8,
          background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)",
          color: "var(--dx-warning)", fontSize: 12, marginBottom: 16,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={14}/>
          <span style={{ fontWeight: 600 }}>มี {pendingCount} การเปลี่ยนแปลงที่รอ review</span>
          <span style={{ opacity: 0.8 }}>· เลื่อนลงไปดูตาราง "Recent Changes"</span>
        </div>
      )}

      {/* Active slot mappings per machine */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--dx-text-muted)" }}/>
        </div>
      ) : machineIds.length === 0 ? (
        <div className="dx-card" style={{ padding: 30, textAlign: "center", color: "var(--dx-text-muted)", fontSize: 12 }}>
          ยังไม่มีข้อมูล mapping ช่อง · รอ scraper รันรอบถัดไป
        </div>
      ) : machineIds.map(mid => {
        const isExpanded = expandedMachines.has(mid)
        const toggle = () => {
          setExpandedMachines(prev => {
            const next = new Set(prev)
            if (next.has(mid)) next.delete(mid); else next.add(mid)
            return next
          })
        }
        return (
        <div key={mid} className="dx-card" style={{ marginBottom: 16, padding: 16 }}>
          <button onClick={toggle} type="button"
            style={{
              all: "unset", cursor: "pointer", width: "100%",
              display: "flex", alignItems: "center", gap: 8,
              marginBottom: isExpanded ? 12 : 0,
            }}>
            <Monitor size={14} style={{ color: "var(--dx-cyan-soft)" }}/>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>
              {machineNames[mid] || mid}
            </h3>
            <span style={{ fontSize: 10, color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>{mid}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--dx-text-muted)" }}>
              {(slotsByMachine[mid] || []).length} slots
            </span>
            {isExpanded
              ? <ChevronUp size={14} style={{ color: "var(--dx-text-muted)" }}/>
              : <ChevronDown size={14} style={{ color: "var(--dx-text-muted)" }}/>}
          </button>
          {isExpanded && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 60 }}>ช่อง</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>สินค้าปัจจุบัน</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", width: 120 }}>SKU</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", width: 140 }}>เริ่มขายเมื่อ</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(slotsByMachine[mid] || []).map(s => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--dx-border)" }}>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "var(--dx-mono)", color: "var(--dx-cyan-soft)" }}>{s.slot_number}</td>
                    <td style={{ padding: "8px 10px" }}>{s.product_name || "—"}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "var(--dx-mono)", fontSize: 11, color: "var(--dx-text-secondary)" }}>{s.sku_id || "—"}</td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--dx-text-muted)" }}>
                      {s.effective_from ? new Date(s.effective_from).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <button onClick={() => setHistoryModal({ machine_id: mid, slot_number: s.slot_number })}
                        className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>
                        <History size={11}/>ประวัติ
                      </button>
                      <button onClick={() => setManualModal({ machine_id: mid, slot_number: s.slot_number, current: s })}
                        className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>
                        <Edit3 size={11}/>เปลี่ยน
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )
      })}

      {/* Recent changes review */}
      <div className="dx-card" style={{ marginTop: 24, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>
            การเปลี่ยนแปลงล่าสุด (Review)
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>ช่วงวันที่:</span>
            <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)}
              className="dx-input" style={{ fontSize: 11, padding: "5px 8px", width: "auto" }}/>
            <span style={{ fontSize: 11, color: "var(--dx-text-muted)" }}>→</span>
            <input type="date" value={toDate} min={fromDate} max={todayISO()} onChange={e => setToDate(e.target.value)}
              className="dx-input" style={{ fontSize: 11, padding: "5px 8px", width: "auto" }}/>
            <button
              type="button"
              onClick={handlePrintSlotChanges}
              disabled={filteredChanges.length === 0}
              className="dx-btn dx-btn-ghost"
              style={{ fontSize: 11, opacity: filteredChanges.length === 0 ? 0.5 : 1 }}
              title="พิมพ์ / บันทึก PDF">
              <Printer size={12}/> Export PDF
            </button>
          </div>
        </div>
        {filteredChanges.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--dx-text-muted)", fontSize: 12 }}>
            ไม่มีการเปลี่ยนแปลงในช่วงนี้
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>เวลา</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>ตู้ / ช่อง</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>จาก → เป็น</th>
                  <th style={{ padding: "8px 10px", textAlign: "center" }}>Review</th>
                  <th style={{ padding: "8px 10px", textAlign: "center" }}>สินค้าเก่าไปไหน</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredChanges.map((c, idx) => {
                  const badge = STATUS_BADGE[c.review_status] || STATUS_BADGE.pending
                  return (
                    <tr key={`${c.history_id}-${idx}`} style={{ borderTop: "1px solid var(--dx-border)" }}>
                      <td style={{ padding: "8px 10px", color: "var(--dx-text-secondary)" }}>
                        {new Date(c.changed_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontFamily: "var(--dx-mono)", fontSize: 11 }}>{machineNames[c.machine_id] || c.machine_id}</div>
                        <div style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>ช่อง {c.slot_number}</div>
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: 11 }}>
                        <span style={{ color: "var(--dx-text-secondary)" }}>{c.old_product_name || "—"}</span>
                        <ArrowRight size={11} style={{ margin: "0 6px", color: "var(--dx-warning)", verticalAlign: "middle" }}/>
                        <span style={{ color: "var(--dx-success)" }}>{c.new_product_name || "—"}</span>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                        {c.review_note && <div style={{ fontSize: 9, color: "var(--dx-text-muted)", marginTop: 2 }}>{c.review_note}</div>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        {c.disposition ? (() => {
                          const d = DISPOSITION_LABELS[c.disposition] || DISPOSITION_LABELS.unknown
                          return (
                            <>
                              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, color: d.color, background: "var(--dx-bg-input)" }}>
                                {d.icon} {d.label}
                              </span>
                              {c.disposition_target?.qty != null && (
                                <div style={{ fontSize: 9, color: "var(--dx-text-muted)", marginTop: 2 }}>{c.disposition_target.qty} packs</div>
                              )}
                            </>
                          )
                        })() : (
                          <span style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>
                            {c.pending_qty != null ? `${c.pending_qty} packs · ` : ""}ยังไม่ reconcile
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        {c.review_status === "pending" && (
                          <>
                            <button onClick={() => onReview(c.history_id, "confirmed")}
                              className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11, color: "var(--dx-success)", marginRight: 4 }}>
                              <CheckCircle size={11}/>ตั้งใจ
                            </button>
                            <button onClick={() => onReview(c.history_id, "flagged")}
                              className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 11, color: "var(--dx-danger)" }}>
                              <Flag size={11}/>Bug
                            </button>
                          </>
                        )}
                        {c.review_status !== "pending" && !c.disposition && (
                          <button onClick={() => setReconcileModal(c)}
                            className="dx-btn dx-btn-primary" style={{ padding: "4px 8px", fontSize: 11 }}>
                            <Repeat size={11}/>Reconcile
                          </button>
                        )}
                        {c.review_status !== "pending" && c.disposition && (
                          <button onClick={() => onUndoReconcile(c.history_id)}
                            className="dx-btn dx-btn-ghost" style={{ padding: "4px 8px", fontSize: 10, color: "var(--dx-text-muted)" }}>
                            ↶ ย้อน
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History modal */}
      {historyModal && (
        <HistoryModal {...historyModal} machineName={machineNames[historyModal.machine_id]} onClose={() => setHistoryModal(null)}/>
      )}
      {/* Manual change modal */}
      {manualModal && (
        <ManualChangeModal {...manualModal} machineName={machineNames[manualModal.machine_id]} skus={skus}
          onClose={() => setManualModal(null)}
          onSaved={async () => { setManualModal(null); await load() }}/>
      )}
      {/* Reconcile modal (Layer 6) */}
      {reconcileModal && (
        <ReconcileModal change={reconcileModal} machineName={machineNames[reconcileModal.machine_id]}
          machines={machines} allProfiles={allProfiles}
          onClose={() => setReconcileModal(null)}
          onSaved={async () => { setReconcileModal(null); await load() }}/>
      )}
      {/* Slot Swap modal (Phase 2) */}
      {swapModal && (
        <SwapSlotModal machines={machines} slotsByMachine={slotsByMachine}
          defaultMachineId={selectedMachine !== "all" ? selectedMachine : ""}
          onClose={() => setSwapModal(false)}
          onSaved={async () => { setSwapModal(false); await load() }}/>
      )}
    </>
  )
}

// ── History modal ──────────────────────────────────────────────
function HistoryModal({ machine_id, slot_number, machineName, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    (async () => {
      try { setRows(await getSlotHistory(machine_id, slot_number)) }
      finally { setLoading(false) }
    })()
  }, [machine_id, slot_number])

  return (
    <ModalShell title={`ประวัติช่อง ${slot_number}`} subtitle={`${machineName || machine_id} · ช่อง ${slot_number}`} onClose={onClose}>
      {loading ? <Loader2 size={20} className="animate-spin" style={{ color: "var(--dx-text-muted)" }}/>
       : rows.length === 0 ? <div style={{ textAlign: "center", color: "var(--dx-text-muted)", fontSize: 12, padding: 20 }}>ไม่มีประวัติ</div>
       : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>ตั้งแต่</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>ถึง</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>สินค้า</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>ที่มา</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--dx-border)" }}>
                <td style={{ padding: "8px 10px", color: "var(--dx-text-secondary)" }}>
                  {r.effective_from ? new Date(r.effective_from).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </td>
                <td style={{ padding: "8px 10px", color: r.effective_to ? "var(--dx-text-secondary)" : "var(--dx-success)" }}>
                  {r.effective_to ? new Date(r.effective_to).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "active"}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <div>{r.product_name || "—"}</div>
                  {r.sku_id && <div style={{ fontSize: 9, color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>{r.sku_id}</div>}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--dx-text-muted)" }}>{r.detected_by || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
       )}
    </ModalShell>
  )
}

// ── Manual change modal ────────────────────────────────────────
function ManualChangeModal({ machine_id, slot_number, current, machineName, skus, onClose, onSaved }) {
  const [skuId, setSkuId] = useState("")
  const [productName, setProductName] = useState("")
  const [initialQty, setInitialQty] = useState("")
  const [initialCapacity, setInitialCapacity] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const selectedSku = useMemo(() => skus.find(s => s.sku_id === skuId), [skus, skuId])
  const canonicalName = selectedSku?.canonical_sku || selectedSku?.name || selectedSku?.sku_id || ""
  // อัพเดทชื่อทุกครั้งที่เปลี่ยน SKU (ไม่ guard !productName) → ค่าจะตรงกับ Naming Contract เสมอ
  useEffect(() => {
    if (selectedSku) setProductName(canonicalName)
  }, [skuId])

  const save = async () => {
    if (!skuId && !productName) { setErr("กรุณาเลือก SKU หรือกรอกชื่อสินค้า"); return }
    try {
      setSaving(true); setErr(null)
      await recordSlotChangeManual({
        machine_id, slot_number,
        new_sku_id:      skuId || null,
        new_product_id:  null,                // ไม่ทราบจาก UI (จะ sync จาก scraper รอบถัดไป)
        new_product_name: productName || canonicalName || skuId,
        initial_qty:      initialQty === "" ? null : Number(initialQty),
        initial_capacity: initialCapacity === "" ? null : Number(initialCapacity),
        note: note || null,
      })
      onSaved?.()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={`เปลี่ยนสินค้าช่อง ${slot_number}`} subtitle={`${machineName || machine_id} · ช่อง ${slot_number}`} onClose={onClose}>
      <div style={{ marginBottom: 12, padding: 10, background: "var(--dx-bg-input)", borderRadius: 6, fontSize: 11 }}>
        <div style={{ color: "var(--dx-text-muted)", marginBottom: 2 }}>สินค้าปัจจุบัน</div>
        <div style={{ color: "var(--dx-text)" }}>{current?.product_name || "—"} {current?.sku_id && <span style={{ color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>({current.sku_id})</span>}</div>
      </div>

      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>SKU ใหม่</label>
      <select value={skuId} onChange={e => setSkuId(e.target.value)} className="dx-input" style={{ width: "100%", marginBottom: 10 }}>
        <option value="">— เลือก SKU —</option>
        {skus.filter(s => s.is_active !== false).map(s => (
          <option key={s.sku_id} value={s.sku_id}>{s.sku_id} · {s.canonical_sku || s.name}</option>
        ))}
      </select>

      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>
        <span>ชื่อมาตรฐาน (canonical) — ใช้แสดงบนตู้ VMS</span>
        {selectedSku && productName !== canonicalName && (
          <button type="button" onClick={() => setProductName(canonicalName)}
            style={{ background: "transparent", border: "none", color: "var(--dx-cyan-soft)", fontSize: 10, cursor: "pointer", padding: 0 }}>
            ↺ reset เป็นค่ามาตรฐาน
          </button>
        )}
      </label>
      <input value={productName} onChange={e => setProductName(e.target.value)} className="dx-input"
        placeholder="เลือก SKU ด้านบนเพื่อให้ระบบเติมชื่อมาตรฐานอัตโนมัติ"
        style={{
          width: "100%", marginBottom: 4,
          ...(selectedSku && productName !== canonicalName ? { borderColor: "var(--dx-warning)" } : {})
        }}/>
      <div style={{ fontSize: 10, color: "var(--dx-text-muted)", marginBottom: 10 }}>
        {selectedSku && productName === canonicalName
          ? "✓ ตรงกับ Naming Contract (canonical_sku)"
          : selectedSku && productName !== canonicalName
            ? "⚠ ค่าไม่ตรงกับ canonical · admin VMS ต้องตั้งชื่อบนตู้ให้เหมือนช่องนี้"
            : "ระบบจะเติมจาก SKU ที่เลือก · อิง Naming Contract"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>
            จำนวนเริ่ม (ซอง/กล่อง) <span style={{ color: "var(--dx-text-muted)", fontWeight: 400 }}>· optional</span>
          </label>
          <input type="number" min="0" value={initialQty} onChange={e => setInitialQty(e.target.value)}
            className="dx-input" placeholder="เช่น 12"
            style={{ width: "100%" }}/>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>
            ความจุของช่อง <span style={{ color: "var(--dx-text-muted)", fontWeight: 400 }}>· optional</span>
          </label>
          <input type="number" min="0" value={initialCapacity} onChange={e => setInitialCapacity(e.target.value)}
            className="dx-input" placeholder="เช่น 12"
            style={{ width: "100%" }}/>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--dx-text-muted)", marginBottom: 14 }}>
        ใช้ในรายงาน Export PDF "จำนวนหลัง" · ถ้าไม่ระบุ ระบบจะรอ VMS sync อัพเดทให้
      </div>

      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>หมายเหตุ (optional)</label>
      <textarea value={note} onChange={e => setNote(e.target.value)} className="dx-input" rows={2}
        placeholder="เช่น เปลี่ยนเพราะของหมด · ทดลองวางสินค้าใหม่"
        style={{ width: "100%", marginBottom: 14, resize: "vertical" }}/>

      {err && <div style={{ color: "var(--dx-danger)", fontSize: 11, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} className="dx-btn dx-btn-ghost" disabled={saving}>ยกเลิก</button>
        <button onClick={save} className="dx-btn dx-btn-primary" disabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
          บันทึก
        </button>
      </div>
    </ModalShell>
  )
}

// ── Reconcile modal (Layer 6) ─────────────────────────────────
function ReconcileModal({ change, machineName, machines, allProfiles, onClose, onSaved }) {
  const [disposition, setDisposition] = useState("returned")
  const [qty, setQty] = useState(change?.pending_qty ?? "")
  const [targetMachineId, setTargetMachineId] = useState("")
  const [targetSlotNumber, setTargetSlotNumber] = useState("")
  const [targetAdminId, setTargetAdminId] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const adminProfiles = useMemo(
    () => (allProfiles || []).filter(p => p.role === "admin" || p.role === "owner"),
    [allProfiles]
  )
  const otherMachines = useMemo(
    () => (machines || []).filter(m => m.machine_id !== change?.machine_id),
    [machines, change]
  )

  const save = async () => {
    setErr(null)
    const finalQty = parseInt(qty, 10) || 0
    if (disposition !== "unknown" && finalQty <= 0) { setErr("ระบุจำนวนที่มากกว่า 0"); return }
    if (disposition === "transferred_to_admin" && !targetAdminId) { setErr("เลือกแอดมินที่ถือไว้"); return }
    if (disposition === "moved_to_machine" && !targetMachineId) { setErr("เลือกตู้ปลายทาง"); return }
    try {
      setSaving(true)
      await reconcileSlotChange(change.history_id, {
        disposition, qty: finalQty,
        targetMachineId:    disposition === "moved_to_machine" ? targetMachineId : null,
        targetSlotNumber:   disposition === "moved_to_machine" ? (targetSlotNumber || null) : null,
        targetAdminId:      disposition === "transferred_to_admin" ? targetAdminId : null,
        note:               note || null,
      })
      onSaved?.()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell
      title={`Reconcile · สินค้าเก่าไปไหน?`}
      subtitle={`${machineName || change.machine_id} · ช่อง ${change.slot_number} · ${change.old_product_name || "—"}`}
      onClose={onClose}
    >
      <div style={{ marginBottom: 14, padding: 10, background: "var(--dx-bg-input)", borderRadius: 6, fontSize: 11 }}>
        <div style={{ color: "var(--dx-text-muted)", marginBottom: 4 }}>การเปลี่ยน</div>
        <div>
          <s style={{ color: "var(--dx-text-secondary)" }}>{change.old_product_name || "—"}</s>
          <ArrowRight size={11} style={{ margin: "0 6px", color: "var(--dx-warning)", verticalAlign: "middle" }}/>
          <b style={{ color: "var(--dx-success)" }}>{change.new_product_name || "—"}</b>
        </div>
        <div style={{ marginTop: 6, color: "var(--dx-text-muted)" }}>
          จำนวนที่ตรวจพบในช่องตอนเปลี่ยน: <b>{change.pending_qty ?? "—"}</b> packs
        </div>
      </div>

      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>
        สินค้าเก่า ({change.old_product_name}) ไปที่ไหน?
      </label>
      <select value={disposition} onChange={e => setDisposition(e.target.value)} className="dx-input"
        style={{ width: "100%", marginBottom: 12 }}>
        <option value="returned">↩ คืนเข้าสต็อกกลาง (สินค้ายังอยู่ดี · นำกลับเข้ากลาง)</option>
        <option value="transferred_to_admin">👤 แอดมินถือไว้ (โอนเข้าสต็อกย่อยของแอดมิน)</option>
        <option value="lost">✕ สูญหาย/เคลม (สินค้าหายหรือเสียหาย)</option>
        <option value="unknown">? ไม่ทราบ · ปิด review เฉยๆ (ไม่สร้าง stock movement)</option>
      </select>

      {disposition !== "unknown" && (
        <>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>จำนวน (packs)</label>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} className="dx-input"
            placeholder={`default ${change.pending_qty ?? 0}`}
            style={{ width: "100%", marginBottom: 12 }}/>
        </>
      )}

      {disposition === "transferred_to_admin" && (
        <>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>แอดมินที่ถือไว้</label>
          <select value={targetAdminId} onChange={e => setTargetAdminId(e.target.value)} className="dx-input"
            style={{ width: "100%", marginBottom: 12 }}>
            <option value="">— เลือกแอดมิน —</option>
            {adminProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name || p.username || p.email} ({p.role})</option>
            ))}
          </select>
        </>
      )}

      {disposition === "moved_to_machine" && (
        <>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>ตู้ปลายทาง</label>
          <select value={targetMachineId} onChange={e => setTargetMachineId(e.target.value)} className="dx-input"
            style={{ width: "100%", marginBottom: 8 }}>
            <option value="">— เลือกตู้ —</option>
            {otherMachines.map(m => (
              <option key={m.machine_id} value={m.machine_id}>{m.name || m.machine_id}</option>
            ))}
          </select>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>ช่องปลายทาง (optional)</label>
          <input value={targetSlotNumber} onChange={e => setTargetSlotNumber(e.target.value)} className="dx-input"
            placeholder="เช่น 015" style={{ width: "100%", marginBottom: 12 }}/>
        </>
      )}

      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>หมายเหตุ (optional)</label>
      <textarea value={note} onChange={e => setNote(e.target.value)} className="dx-input" rows={2}
        placeholder="เช่น คืนกลางครบทุก pack · ไม่ชำรุด"
        style={{ width: "100%", marginBottom: 14, resize: "vertical" }}/>

      {err && <div style={{ color: "var(--dx-danger)", fontSize: 11, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} className="dx-btn dx-btn-ghost" disabled={saving}>ยกเลิก</button>
        <button onClick={save} className="dx-btn dx-btn-primary" disabled={saving}>
          {saving ? <Loader2 size={12} className="animate-spin"/> : <Repeat size={12}/>}
          บันทึก
        </button>
      </div>
    </ModalShell>
  )
}

// ── Slot Swap modal (Phase 2) ─────────────────────────────────
function SwapSlotModal({ machines, slotsByMachine, defaultMachineId, onClose, onSaved }) {
  const [machineId, setMachineId] = useState(defaultMachineId || "")
  const [slotA, setSlotA] = useState("")
  const [slotB, setSlotB] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const slots = useMemo(() => slotsByMachine?.[machineId] || [], [slotsByMachine, machineId])
  const rowA = useMemo(() => slots.find(s => s.slot_number === slotA), [slots, slotA])
  const rowB = useMemo(() => slots.find(s => s.slot_number === slotB), [slots, slotB])

  const save = async () => {
    setErr(null)
    if (!machineId) { setErr("เลือกตู้"); return }
    if (!slotA || !slotB) { setErr("เลือก 2 ช่อง"); return }
    if (slotA === slotB) { setErr("เลือก 2 ช่องที่ต่างกัน"); return }
    if (!confirm(`สลับ ${rowA?.product_name || slotA} ↔ ${rowB?.product_name || slotB}?`)) return
    try {
      setSaving(true)
      await swapSlots(machineId, slotA, slotB)
      onSaved?.()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="🔄 สลับสินค้าระหว่าง 2 ช่อง" subtitle="ภายในตู้เดียวกัน · ไม่มี stock movement" onClose={onClose}>
      <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>ตู้</label>
      <select value={machineId} onChange={e => { setMachineId(e.target.value); setSlotA(""); setSlotB("") }}
        className="dx-input" style={{ width: "100%", marginBottom: 12 }}>
        <option value="">— เลือกตู้ —</option>
        {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name || m.machine_id}</option>)}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "end", marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>ช่อง A</label>
          <select value={slotA} onChange={e => setSlotA(e.target.value)} className="dx-input" style={{ width: "100%" }} disabled={!machineId}>
            <option value="">— เลือก —</option>
            {slots.filter(s => s.slot_number !== slotB).map(s => (
              <option key={s.slot_number} value={s.slot_number}>
                {s.slot_number} · {s.product_name || "—"}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 18, paddingBottom: 8, color: "var(--dx-warning)" }}>⇄</div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--dx-text-muted)", marginBottom: 4 }}>ช่อง B</label>
          <select value={slotB} onChange={e => setSlotB(e.target.value)} className="dx-input" style={{ width: "100%" }} disabled={!machineId}>
            <option value="">— เลือก —</option>
            {slots.filter(s => s.slot_number !== slotA).map(s => (
              <option key={s.slot_number} value={s.slot_number}>
                {s.slot_number} · {s.product_name || "—"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rowA && rowB && (
        <div style={{ marginBottom: 14, padding: 10, background: "var(--dx-bg-input)", borderRadius: 6, fontSize: 11 }}>
          <div style={{ color: "var(--dx-text-muted)", marginBottom: 6, fontWeight: 600 }}>Preview หลังสลับ</div>
          <div>ช่อง <b>{slotA}</b>: <s>{rowA.product_name}</s> → <b style={{ color: "var(--dx-success)" }}>{rowB.product_name}</b></div>
          <div style={{ marginTop: 4 }}>ช่อง <b>{slotB}</b>: <s>{rowB.product_name}</s> → <b style={{ color: "var(--dx-success)" }}>{rowA.product_name}</b></div>
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--dx-text-muted)" }}>
            ⓘ ไม่กระทบ stock_balance · scraper รอบถัดไปจะ sync machine_stock อัตโนมัติ
          </div>
        </div>
      )}

      {err && <div style={{ color: "var(--dx-danger)", fontSize: 11, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} className="dx-btn dx-btn-ghost" disabled={saving}>ยกเลิก</button>
        <button onClick={save} className="dx-btn dx-btn-primary" disabled={saving || !slotA || !slotB}>
          {saving ? <Loader2 size={12} className="animate-spin"/> : <Repeat size={12}/>}
          สลับ
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared modal shell ─────────────────────────────────────────
function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--dx-bg-card)", borderRadius: 14, border: "1px solid var(--dx-border)",
        width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottom: "1px solid var(--dx-border)" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--dx-text)" }}>{title}</h3>
            {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--dx-text-muted)" }}>
            <X size={18}/>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}
