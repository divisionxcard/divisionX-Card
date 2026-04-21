// PageStock — Dark Theme (includes SkuManager inline)
import { useState } from "react"
import {
  Search, RefreshCw, PlusCircle, Pencil, Trash2, Loader2, X, CheckCircle, Clock,
} from "lucide-react"
import { fmt, fmtB, today, sortSkus, sortByDateThenSku, convertToPacks } from "../shared/helpers"
import { Badge, SectionTitle } from "../shared/dx-components"
import EditStockInModal from "./EditStockInModal"

function genLotNumber() {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "")
  const hm = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0")
  return `LOT-${ymd}-${hm}`
}

export default function PageStock({ stockIn, stockBalance, onAddStockIn, onUpdateStockIn, onDeleteStockIn, skus, onAddSku, onDeactivateSku, onRecalcAvgCost }) {
  const [tab, setTab] = useState("balance")
  const [search, setSearch] = useState("")
  const [seriesSel, setSeriesSel] = useState("ทั้งหมด")
  const [saving, setSaving] = useState(false)
  const [recalcSku, setRecalcSku] = useState("")
  const nowDate = () => new Date().toISOString().slice(0, 10)
  const [lotFilter, setLotFilter] = useState("all")
  const [lotDate, setLotDate] = useState(nowDate())
  const [lotMonth, setLotMonth] = useState(nowDate().slice(0, 7))
  const [lotYear, setLotYear] = useState(nowDate().slice(0, 4))
  const [historySkuIn, setHistorySkuIn] = useState("")
  const [lotSkuFilter, setLotSkuFilter] = useState("")

  const [form, setForm] = useState({
    lot_number: genLotNumber(),
    sku_id: "OP 01",
    source: "",
    purchased_at: today(),
    unit: "box",
    quantity: "1",
    unit_cost: "",
    note: "",
  })
  const [toast, setToast] = useState(null)
  const [editRecord, setEditRecord] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  const handleDelete = async (id) => {
    setDeleting(true)
    try {
      await onDeleteStockIn(id)
      setDeleteId(null)
      showToast("ลบข้อมูลสำเร็จ")
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
    finally { setDeleting(false) }
  }

  const filterLots = (list) => {
    const sorted = [...list].sort((a, b) => sortByDateThenSku(a, b, "purchased_at"))
    if (lotFilter === "day") return sorted.filter(r => (r.purchased_at || r.created_at || "").slice(0, 10) === lotDate)
    if (lotFilter === "month") return sorted.filter(r => (r.purchased_at || r.created_at || "").slice(0, 7) === lotMonth)
    if (lotFilter === "year") return sorted.filter(r => (r.purchased_at || r.created_at || "").slice(0, 4) === lotYear)
    return sorted
  }

  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in: parseFloat(r.total_in) || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance: parseFloat(r.balance) || 0,
  }]))

  const filtered = skus
    .filter(s => s.sku_id.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => seriesSel === "ทั้งหมด" || s.series === seriesSel)

  const sku = skus.find(s => s.sku_id === form.sku_id)
  const qty = parseInt(form.quantity) || 0
  const packs = convertToPacks(qty, form.unit, sku)
  const unitCost = parseFloat(form.unit_cost) || 0
  const totalCost = qty * unitCost
  const costPerPack = packs > 0 ? totalCost / packs : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.lot_number || !form.source || !form.quantity || !form.unit_cost) {
      showToast("กรุณากรอกข้อมูลให้ครบถ้วน (เลขที่ Lot, Supplier, จำนวน, ราคาต้นทุน)", "error"); return
    }
    try {
      setSaving(true)
      await onAddStockIn({
        lot_number: form.lot_number,
        sku_id: form.sku_id,
        source: form.source,
        unit: form.unit,
        quantity: qty,
        quantity_packs: packs,
        unit_cost: unitCost,
        total_cost: totalCost,
        purchased_at: form.purchased_at,
        note: form.note,
      })
      showToast(`บันทึกสำเร็จ: Lot ${form.lot_number} — ${packs} ซอง (${form.sku_id})`)
      setForm({
        lot_number: genLotNumber(), sku_id: form.sku_id, source: form.source,
        purchased_at: today(), unit: form.unit, quantity: "1", unit_cost: "", note: "",
      })
    } catch (err) { showToast("เกิดข้อผิดพลาด: " + err.message, "error") }
    finally { setSaving(false) }
  }

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  // Lot filter bar (reused in addin + history tabs)
  const LotFilterBar = () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[{ v: "all", l: "ทั้งหมด" }, { v: "day", l: "รายวัน" }, { v: "month", l: "รายเดือน" }, { v: "year", l: "รายปี" }].map(t => (
          <button key={t.v} onClick={() => setLotFilter(t.v)}
            className={`dx-chip ${lotFilter === t.v ? "dx-chip-active" : ""}`}
            style={{ padding: "5px 10px", fontSize: 11 }}>
            {t.l}
          </button>
        ))}
      </div>
      {lotFilter === "day" && (
        <input type="date" value={lotDate} onChange={e => setLotDate(e.target.value)}
          className="dx-input" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}/>
      )}
      {lotFilter === "month" && (
        <input type="month" value={lotMonth} onChange={e => setLotMonth(e.target.value)}
          className="dx-input" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}/>
      )}
      {lotFilter === "year" && (
        <select value={lotYear} onChange={e => setLotYear(e.target.value)}
          className="dx-input" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}>
          {[...new Set(stockIn.map(r => (r.purchased_at || r.created_at || "").slice(0, 4)).filter(Boolean))].sort().reverse()
            .map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
    </div>
  )

  const tabs = [
    { key: "balance", label: "สต็อกคงเหลือ" },
    { key: "addin", label: "รับสินค้าเข้า" },
    { key: "history", label: "ประวัติการรับ" },
    { key: "lothistory", label: "ประวัติ Lot" },
    { key: "skus", label: "จัดการ SKU" },
  ]

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionTitle
        pill="Stock Ops"
        title="จัดการสต็อกสินค้า"
        subtitle="บันทึกรับเข้า · ตรวจสอบ Lot · แก้ไข SKU"
        actions={
          <>
            <select value={recalcSku} onChange={e => setRecalcSku(e.target.value)}
              className="dx-input" style={{ width: "auto", padding: "7px 10px", fontSize: 11, borderColor: "rgba(183,148,246,0.3)" }}>
              <option value="">— เลือก SKU —</option>
              {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
            </select>
            <button onClick={async () => {
              if (!recalcSku) { alert("กรุณาเลือก SKU ก่อน"); return }
              if (!confirm(`คำนวณต้นทุนเฉลี่ยใหม่สำหรับ ${recalcSku}?`)) return
              await onRecalcAvgCost(recalcSku)
              alert(`คำนวณต้นทุน ${recalcSku} ใหม่เรียบร้อยแล้ว`)
              setRecalcSku("")
            }} disabled={!recalcSku}
              style={{
                padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                background: "rgba(183,148,246,0.08)", color: "#B794F6",
                border: "1px solid rgba(183,148,246,0.25)",
                cursor: recalcSku ? "pointer" : "not-allowed",
                opacity: recalcSku ? 1 : 0.4,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
              <RefreshCw size={12}/> คำนวณต้นทุนใหม่
            </button>
          </>
        }
      />

      {editRecord && (
        <EditStockInModal
          record={editRecord} skus={skus}
          onSave={async (id, data) => { await onUpdateStockIn(id, data); setEditRecord(null) }}
          onClose={() => setEditRecord(null)}
        />
      )}

      {toast && <Toast toast={toast}/>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--dx-border)", flexWrap: "wrap" }}>
        {tabs.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            className={`dx-tab ${tab === t.key ? "dx-tab-active" : ""}`}>
            {t.label}
          </div>
        ))}
      </div>

      {/* ── Tab: Balance ── */}
      {tab === "balance" && (
        <div className="dx-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--dx-text-muted)", pointerEvents: "none" }}/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหา SKU..." className="dx-input" style={{ paddingLeft: 36 }}/>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["ทั้งหมด", "OP", "PRB", "EB"].map(s => (
                <button key={s} onClick={() => setSeriesSel(s)}
                  className={`dx-chip ${seriesSel === s ? "dx-chip-active" : ""}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                  <Th align="left">SKU</Th>
                  <Th align="left">ชื่อสินค้า</Th>
                  <Th align="center">Series</Th>
                  <Th align="right">รับเข้า (ซอง)</Th>
                  <Th align="right">เบิกออก (ซอง)</Th>
                  <Th align="right">คงเหลือ</Th>
                  <Th align="center">สถานะ</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const b = balMap[s.sku_id] || { total_in: 0, total_out: 0, balance: 0 }
                  const low = b.balance < 24
                  const empty = b.balance === 0
                  return (
                    <tr key={s.sku_id} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                      <td className="dx-mono" style={{ padding: "11px 10px", fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{s.sku_id}</td>
                      <td style={{ padding: "11px 10px", fontSize: 11, color: "var(--dx-text-secondary)" }}>{s.name}</td>
                      <td style={{ padding: "11px 10px", textAlign: "center" }}><Badge series={s.series}/></td>
                      <td className="dx-mono" style={{ padding: "11px 10px", textAlign: "right", fontSize: 12, fontWeight: 500, color: "var(--dx-cyan-soft)" }}>
                        +{fmt(b.total_in)}
                      </td>
                      <td className="dx-mono" style={{ padding: "11px 10px", textAlign: "right", fontSize: 12, fontWeight: 500, color: "var(--dx-warning)" }}>
                        -{fmt(b.total_out)}
                      </td>
                      <td className="dx-mono" style={{
                        padding: "11px 10px", textAlign: "right", fontSize: 13, fontWeight: 700,
                        color: empty ? "var(--dx-danger)" : low ? "var(--dx-warning)" : "var(--dx-text)",
                      }}>
                        {fmt(b.balance)}
                      </td>
                      <td style={{ padding: "11px 10px", textAlign: "center" }}>
                        {empty
                          ? <StatusPill color="danger">หมด</StatusPill>
                          : low ? <StatusPill color="warning">ใกล้หมด</StatusPill>
                          : <StatusPill color="success">ปกติ</StatusPill>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Add Stock In ── */}
      {tab === "addin" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
          {/* Form */}
          <div className="dx-card" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
              บันทึกรับซื้อสินค้าเข้าสต็อก
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 11, color: "var(--dx-text-muted)" }}>
              บันทึกแต่ละครั้งที่ซื้อสินค้าเข้ามา พร้อมระบุ Lot และต้นทุน
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>เลขที่ Lot <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                  <input value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })}
                    placeholder="LOT-YYYYMMDD-HHMM" className="dx-input dx-mono"/>
                </div>
                <div>
                  <label style={labelStyle}>วันที่ซื้อ <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                  <input type="date" value={form.purchased_at} onChange={e => setForm({ ...form, purchased_at: e.target.value })} className="dx-input"/>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Supplier / แหล่งที่มา <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}
                  placeholder="เช่น ตัวแทนจำหน่าย A, Bandai Thailand" className="dx-input"/>
              </div>

              <div>
                <label style={labelStyle}>สินค้า (SKU) <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                <select value={form.sku_id} onChange={e => setForm({ ...form, sku_id: e.target.value })} className="dx-input">
                  {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>หน่วยที่ซื้อ</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="dx-input">
                    <option value="pack">ซอง (Pack)</option>
                    <option value="box">กล่อง (Box)</option>
                    <option value="cotton">Cotton</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>จำนวน <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                  <input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="dx-input dx-mono" style={{ fontWeight: 700 }}/>
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  ราคาต้นทุนต่อ{form.unit === "pack" ? "ซอง" : form.unit === "box" ? "กล่อง" : "Cotton"} (บาท)
                  <span style={{ color: "var(--dx-danger)" }}> *</span>
                </label>
                <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })}
                  placeholder="0.00" className="dx-input dx-mono"/>
              </div>

              {qty > 0 && unitCost > 0 && (
                <div style={{
                  padding: 14, borderRadius: 12,
                  background: "linear-gradient(180deg, rgba(0,212,255,0.08) 0%, transparent 100%)",
                  border: "1px solid var(--dx-border-glow)",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "var(--dx-cyan-bright)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    สรุปต้นทุน Lot นี้
                  </p>
                  <Row label="จำนวนซองรวม" value={`${fmt(packs)} ซอง`} valueColor="var(--dx-cyan-bright)"/>
                  <Row label="ต้นทุนต่อซอง" value={fmtB(costPerPack.toFixed(2))} valueColor="#B794F6"/>
                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--dx-border)" }}>
                    <Row label="มูลค่ารวม Lot" value={fmtB(totalCost)} valueColor="var(--dx-text)" bold/>
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>หมายเหตุ</label>
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="ไม่บังคับ เช่น ส่วนลด, โปรโมชัน" className="dx-input"/>
              </div>

              <button type="submit" disabled={saving} className="dx-btn dx-btn-primary"
                style={{ width: "100%", padding: 12, fontSize: 13, justifyContent: "center", opacity: saving ? 0.5 : 1 }}>
                {saving ? <Loader2 size={15} className="animate-spin"/> : <PlusCircle size={15}/>}
                {saving ? "กำลังบันทึก..." : "บันทึกรับสินค้าเข้าสต็อก"}
              </button>
            </form>
          </div>

          {/* Lot history sidebar */}
          <div className="dx-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>ประวัติ Lot ล่าสุด</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <select value={lotSkuFilter} onChange={e => setLotSkuFilter(e.target.value)}
                  className="dx-input" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}>
                  <option value="">ทุก SKU</option>
                  {skus.filter(s => s.is_active !== false).sort((a, b) => {
                    const order = { OP: 1, EB: 2, PRB: 3 }
                    return (order[a.series] || 9) - (order[b.series] || 9) || a.sku_id.localeCompare(b.sku_id)
                  }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
                </select>
                <LotFilterBar/>
              </div>
            </div>

            {(() => {
              const byDate = filterLots(stockIn)
              const filteredLots = lotSkuFilter ? byDate.filter(r => r.sku_id === lotSkuFilter) : byDate
              return filteredLots.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--dx-text-muted)", padding: "24px 0", textAlign: "center" }}>
                  ยังไม่มีประวัติการรับสินค้า{lotFilter !== "all" ? "ในช่วงที่เลือก" : ""}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
                  {filteredLots.map((r, i) => {
                    const s = skus.find(sk => sk.sku_id === r.sku_id)
                    const cpp = r.quantity_packs > 0 ? r.total_cost / r.quantity_packs : 0
                    const isConfirmingDelete = deleteId === r.id
                    return (
                      <div key={i} style={{
                        padding: 12, borderRadius: 10,
                        background: "var(--dx-bg-input)",
                        border: "1px solid var(--dx-border)",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span className="dx-mono" style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                                background: "rgba(0,212,255,0.08)", color: "var(--dx-cyan-soft)",
                                border: "1px solid rgba(0,212,255,0.15)",
                              }}>{r.lot_number || "—"}</span>
                              <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{r.sku_id}</span>
                              <Badge series={s?.series || "OP"}/>
                            </div>
                            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>{r.source}</p>
                            <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                              <Clock size={10}/> {r.purchased_at?.slice(0, 10)}
                            </p>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <p className="dx-mono" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--dx-cyan-bright)" }}>
                              +{fmt(r.quantity_packs)} ซอง
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                              {fmt(r.quantity)} {r.unit}
                            </p>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 6 }}>
                              <IconBtn onClick={() => setEditRecord(r)} variant="info" title="แก้ไข"><Pencil size={11}/></IconBtn>
                              <IconBtn onClick={() => setDeleteId(r.id)} variant="danger" title="ลบ"><Trash2 size={11}/></IconBtn>
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--dx-border)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, textAlign: "center" }}>
                          <MiniStat label={`ต้นทุน/${r.unit}`} value={fmtB(r.unit_cost)}/>
                          <MiniStat label="ต้นทุน/ซอง" value={fmtB(cpp.toFixed(2))} color="#B794F6"/>
                          <MiniStat label="มูลค่า Lot" value={fmtB(r.total_cost)} color="var(--dx-text)"/>
                        </div>

                        {r.note && (
                          <p style={{ margin: "6px 0 0", fontSize: 10, color: "var(--dx-text-muted)", fontStyle: "italic" }}>
                            "{r.note}"
                          </p>
                        )}

                        {isConfirmingDelete && (
                          <div style={{
                            marginTop: 10, paddingTop: 10,
                            borderTop: "1px solid rgba(255,68,102,0.2)",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            background: "rgba(255,68,102,0.06)",
                            marginLeft: -12, marginRight: -12, marginBottom: -12,
                            padding: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
                          }}>
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "var(--dx-danger)" }}>
                              ยืนยันลบ Lot นี้?
                            </p>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setDeleteId(null)} className="dx-btn dx-btn-ghost"
                                style={{ padding: "4px 10px", fontSize: 11 }}>ยกเลิก</button>
                              <button onClick={() => handleDelete(r.id)} disabled={deleting}
                                style={{
                                  padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6,
                                  cursor: deleting ? "not-allowed" : "pointer",
                                  background: "var(--dx-danger)", color: "#fff", border: "none",
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  opacity: deleting ? 0.5 : 1,
                                }}>
                                {deleting ? <Loader2 size={10} className="animate-spin"/> : <Trash2 size={10}/>}
                                ลบ
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Tab: History ── */}
      {tab === "history" && (
        <div className="dx-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>ประวัติรับซื้อสินค้า</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <select value={historySkuIn} onChange={e => setHistorySkuIn(e.target.value)}
                className="dx-input" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}>
                <option value="">ทุก SKU</option>
                {skus.filter(s => s.is_active !== false).sort((a, b) => {
                  const order = { OP: 1, EB: 2, PRB: 3 }
                  return (order[a.series] || 9) - (order[b.series] || 9) || a.sku_id.localeCompare(b.sku_id)
                }).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id}</option>)}
              </select>
              <LotFilterBar/>
            </div>
          </div>

          {(() => {
            const byDate = filterLots(stockIn)
            const filteredHistory = historySkuIn ? byDate.filter(r => r.sku_id === historySkuIn) : byDate
            return filteredHistory.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--dx-text-muted)", padding: "24px 0", textAlign: "center" }}>
                ยังไม่มีประวัติการรับสินค้า{lotFilter !== "all" ? "ในช่วงที่เลือก" : ""}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                      {["วันที่", "เลขที่ Lot", "SKU", "Supplier", "หน่วย", "จำนวน", "ซอง", "ต้นทุน/หน่วย", "ต้นทุน/ซอง", "มูลค่า Lot", "หมายเหตุ", "ผู้บันทึก"].map(h => (
                        <Th key={h} align={["จำนวน", "ซอง", "ต้นทุน/หน่วย", "ต้นทุน/ซอง", "มูลค่า Lot"].includes(h) ? "right" : "left"} style={{ whiteSpace: "nowrap" }}>
                          {h}
                        </Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((r, i) => {
                      const cpp = r.quantity_packs > 0 ? r.total_cost / r.quantity_packs : 0
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                          <td className="dx-mono" style={{ padding: "8px 8px", fontSize: 11, color: "var(--dx-text-muted)", whiteSpace: "nowrap" }}>{r.purchased_at?.slice(0, 10)}</td>
                          <td className="dx-mono" style={{ padding: "8px 8px", fontSize: 11, fontWeight: 700, color: "var(--dx-cyan-soft)" }}>{r.lot_number || "—"}</td>
                          <td className="dx-mono" style={{ padding: "8px 8px", fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{r.sku_id}</td>
                          <td style={{ padding: "8px 8px", fontSize: 11, color: "var(--dx-text-secondary)" }}>{r.source}</td>
                          <td style={{ padding: "8px 8px", fontSize: 11, color: "var(--dx-text-muted)" }}>{r.unit}</td>
                          <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, fontWeight: 500, color: "var(--dx-text-secondary)" }}>{fmt(r.quantity)}</td>
                          <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--dx-cyan-bright)" }}>+{fmt(r.quantity_packs)}</td>
                          <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, color: "var(--dx-text-secondary)" }}>{fmtB(r.unit_cost)}</td>
                          <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, fontWeight: 500, color: "#B794F6" }}>{fmtB(cpp.toFixed(2))}</td>
                          <td className="dx-mono" style={{ padding: "8px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--dx-text)" }}>{fmtB(r.total_cost)}</td>
                          <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--dx-text-muted)" }}>{r.note || "—"}</td>
                          <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--dx-text-muted)", whiteSpace: "nowrap" }}>{r.created_by || "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Tab: Depleted Lot history ── */}
      {tab === "lothistory" && (() => {
        const skuTotalOutMap = Object.fromEntries(stockBalance.map(b => [b.sku_id, parseFloat(b.total_out) || 0]))
        const stockInBySku = {}
        stockIn.forEach(r => {
          if (!stockInBySku[r.sku_id]) stockInBySku[r.sku_id] = []
          stockInBySku[r.sku_id].push(r)
        })
        const depletedLots = []
        Object.entries(stockInBySku).forEach(([skuId, lots]) => {
          const sorted = [...lots].sort((a, b) => (a.purchased_at || "").localeCompare(b.purchased_at || "") || (a.id || 0) - (b.id || 0))
          let remainOut = skuTotalOutMap[skuId] || 0
          sorted.forEach(lot => {
            const used = Math.min(lot.quantity_packs || 0, remainOut)
            remainOut -= used
            if ((lot.quantity_packs || 0) - used <= 0) depletedLots.push(lot)
          })
        })
        depletedLots.sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || ""))
        const filteredLots = depletedLots.filter(lot => {
          const sku = skus.find(s => s.sku_id === lot.sku_id)
          if (seriesSel !== "ทั้งหมด" && sku?.series !== seriesSel) return false
          if (search && !lot.sku_id.toLowerCase().includes(search.toLowerCase()) && !(lot.lot_number || "").toLowerCase().includes(search.toLowerCase())) return false
          return true
        })
        const totalValue = filteredLots.reduce((a, r) => a + (parseFloat(r.total_cost) || 0), 0)
        const totalPacks = filteredLots.reduce((a, r) => a + (r.quantity_packs || 0), 0)
        return (
          <div className="dx-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>ประวัติ Lot ที่ใช้หมดแล้ว</h2>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
                  {filteredLots.length} Lot · มูลค่ารวม <span className="dx-mono" style={{ color: "var(--dx-text-secondary)" }}>{fmtB(totalValue)}</span>
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <div style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--dx-text-muted)" }}/>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="ค้นหา Lot / SKU..." className="dx-input"
                    style={{ paddingLeft: 32, padding: "5px 10px 5px 32px", fontSize: 11, width: "auto" }}/>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["ทั้งหมด", "OP", "PRB", "EB"].map(s => (
                    <button key={s} onClick={() => setSeriesSel(s)}
                      className={`dx-chip ${seriesSel === s ? "dx-chip-active" : ""}`}
                      style={{ padding: "5px 10px", fontSize: 11 }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredLots.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "40px 0", fontSize: 13 }}>
                ยังไม่มี Lot ที่ใช้หมด
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--dx-border-strong)" }}>
                      <Th align="left">Lot</Th>
                      <Th align="left">SKU</Th>
                      <Th align="left">วันที่รับ</Th>
                      <Th align="left">แหล่งที่มา</Th>
                      <Th align="right">จำนวน</Th>
                      <Th align="right">ต้นทุน/ซอง</Th>
                      <Th align="right">มูลค่า Lot</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLots.map((lot, i) => {
                      const cpp = (lot.quantity_packs || 0) > 0 ? (parseFloat(lot.total_cost) || 0) / lot.quantity_packs : 0
                      const sku = skus.find(s => s.sku_id === lot.sku_id)
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--dx-border)" }}>
                          <td style={{ padding: "10px 8px" }}>
                            <span className="dx-mono" style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                              background: "var(--dx-bg-elevated)", color: "var(--dx-text-muted)",
                            }}>{lot.lot_number || "—"}</span>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Badge series={sku?.series || "OP"}/>
                              <span className="dx-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--dx-text)" }}>{lot.sku_id}</span>
                            </span>
                          </td>
                          <td className="dx-mono" style={{ padding: "10px 8px", fontSize: 11, color: "var(--dx-text-muted)" }}>
                            {lot.purchased_at?.slice(0, 10) || "—"}
                          </td>
                          <td style={{ padding: "10px 8px", fontSize: 11, color: "var(--dx-text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lot.source || "—"}
                          </td>
                          <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", fontSize: 11, color: "var(--dx-text-secondary)" }}>
                            {fmt(lot.quantity_packs)} ซอง
                          </td>
                          <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", fontSize: 11, fontWeight: 500, color: "#B794F6" }}>
                            {fmtB(cpp.toFixed(2))}
                          </td>
                          <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--dx-text)" }}>
                            {fmtB(lot.total_cost)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--dx-bg-elevated)", fontWeight: 600 }}>
                      <td colSpan={4} style={{ padding: "10px 8px", fontSize: 11, color: "var(--dx-text-secondary)" }}>
                        รวม {filteredLots.length} Lot
                      </td>
                      <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", fontSize: 11, color: "var(--dx-text-secondary)" }}>
                        {fmt(totalPacks)} ซอง
                      </td>
                      <td/>
                      <td className="dx-mono" style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--dx-text)" }}>
                        {fmtB(totalValue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Tab: Manage SKUs ── */}
      {tab === "skus" && (
        <SkuManager skus={skus} onAddSku={onAddSku} onDeactivateSku={onDeactivateSku} showToast={showToast}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SkuManager (sub-component — inline because only used by PageStock)
// ─────────────────────────────────────────────
function SkuManager({ skus, onAddSku, onDeactivateSku, showToast }) {
  const [saving, setSaving] = useState(false)
  const [deactId, setDeactId] = useState(null)
  const [deacting, setDeacting] = useState(false)
  const [form, setForm] = useState({
    sku_id: "", name: "", series: "OP",
    packs_per_box: "24", boxes_per_cotton: "12",
    sell_price: "", cost_price: "",
  })

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.sku_id || !form.name) return
    setSaving(true)
    try {
      await onAddSku({
        sku_id: form.sku_id.trim().toUpperCase(),
        name: form.name.trim(),
        series: form.series,
        packs_per_box: parseInt(form.packs_per_box) || 24,
        boxes_per_cotton: parseInt(form.boxes_per_cotton) || 12,
        sell_price: parseFloat(form.sell_price) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        is_active: true,
      })
      showToast(`เพิ่ม SKU ${form.sku_id} สำเร็จ`)
      setForm({ sku_id: "", name: "", series: "OP", packs_per_box: "12", boxes_per_cotton: "12", sell_price: "", cost_price: "" })
    } catch (err) { showToast("เพิ่มไม่สำเร็จ: " + err.message, "error") }
    finally { setSaving(false) }
  }

  const handleDeactivate = async (skuId) => {
    setDeacting(true)
    try {
      await onDeactivateSku(skuId)
      setDeactId(null)
      showToast(`ปิดใช้งาน ${skuId} สำเร็จ`)
    } catch (err) { showToast("เกิดข้อผิดพลาด: " + err.message, "error") }
    finally { setDeacting(false) }
  }

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 }}>
      <div className="dx-card" style={{ padding: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>เพิ่ม SKU ใหม่</h2>
        <p style={{ margin: "0 0 14px", fontSize: 11, color: "var(--dx-text-muted)" }}>
          เพิ่มสินค้าใหม่เข้าระบบ ก่อนจะบันทึกรับสต็อกได้
        </p>
        <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>รหัส SKU <span style={{ color: "var(--dx-danger)" }}>*</span></label>
              <input value={form.sku_id} onChange={e => setForm({ ...form, sku_id: e.target.value })}
                placeholder="เช่น OP 16" className="dx-input dx-mono"/>
            </div>
            <div>
              <label style={labelStyle}>Series <span style={{ color: "var(--dx-danger)" }}>*</span></label>
              <select value={form.series} onChange={e => setForm({ ...form, series: e.target.value })} className="dx-input">
                <option value="OP">OP — One Piece</option>
                <option value="PRB">PRB — Premium Booster</option>
                <option value="EB">EB — Extra Booster</option>
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>ชื่อสินค้า <span style={{ color: "var(--dx-danger)" }}>*</span></label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น One Piece OP-16" className="dx-input"/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>ซอง/กล่อง</label>
              <input type="number" min="1" value={form.packs_per_box} onChange={e => setForm({ ...form, packs_per_box: e.target.value })}
                className="dx-input dx-mono"/>
              <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>OP/EB=24, PRB=10</p>
            </div>
            <div>
              <label style={labelStyle}>กล่อง/Cotton</label>
              <input type="number" min="1" value={form.boxes_per_cotton} onChange={e => setForm({ ...form, boxes_per_cotton: e.target.value })}
                className="dx-input dx-mono"/>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>ราคาขาย/ซอง (บาท)</label>
              <input type="number" min="0" step="0.01" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })}
                placeholder="0.00" className="dx-input dx-mono"/>
            </div>
            <div>
              <label style={labelStyle}>ต้นทุน/ซอง (บาท)</label>
              <input type="number" min="0" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })}
                placeholder="0.00" className="dx-input dx-mono"/>
            </div>
          </div>
          <button type="submit" disabled={saving || !form.sku_id || !form.name} className="dx-btn dx-btn-primary"
            style={{ width: "100%", padding: 12, fontSize: 13, justifyContent: "center", opacity: (saving || !form.sku_id || !form.name) ? 0.5 : 1 }}>
            {saving ? <Loader2 size={15} className="animate-spin"/> : <PlusCircle size={15}/>}
            {saving ? "กำลังบันทึก..." : "เพิ่ม SKU ใหม่"}
          </button>
        </form>
      </div>

      <div className="dx-card" style={{ padding: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
          SKU ที่ใช้งานอยู่ ({skus.length})
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
          {skus.map(s => (
            <div key={s.sku_id} style={{
              padding: 12, borderRadius: 10,
              background: "var(--dx-bg-input)",
              border: "1px solid var(--dx-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="dx-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--dx-text)" }}>{s.sku_id}</span>
                    <Badge series={s.series}/>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--dx-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                    {s.packs_per_box} ซอง/กล่อง · ขาย <span className="dx-mono">{fmtB(s.sell_price)}</span> · ต้นทุน <span className="dx-mono">{fmtB(s.cost_price)}</span>
                  </p>
                </div>
                <IconBtn onClick={() => setDeactId(s.sku_id)} variant="danger" title="ปิดใช้งาน"><Trash2 size={12}/></IconBtn>
              </div>
              {deactId === s.sku_id && (
                <div style={{
                  marginTop: 10, paddingTop: 10,
                  borderTop: "1px solid rgba(255,68,102,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(255,68,102,0.06)",
                  marginLeft: -12, marginRight: -12, marginBottom: -12,
                  padding: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
                }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "var(--dx-danger)" }}>
                    ปิดใช้งาน {s.sku_id}?
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setDeactId(null)} className="dx-btn dx-btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 11 }}>ยกเลิก</button>
                    <button onClick={() => handleDeactivate(s.sku_id)} disabled={deacting}
                      style={{
                        padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6,
                        background: "var(--dx-danger)", color: "#fff", border: "none",
                        cursor: deacting ? "not-allowed" : "pointer",
                        display: "inline-flex", alignItems: "center", gap: 4,
                        opacity: deacting ? 0.5 : 1,
                      }}>
                      {deacting ? <Loader2 size={10} className="animate-spin"/> : <Trash2 size={10}/>}
                      ปิด
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
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
      padding: "10px 10px", textAlign: align,
      fontSize: 10, fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase",
      color: "var(--dx-text-muted)",
      ...style,
    }}>
      {children}
    </th>
  )
}

function StatusPill({ children, color }) {
  const c = {
    success: { bg: "rgba(0,255,136,0.1)", text: "var(--dx-success)", border: "rgba(0,255,136,0.25)" },
    warning: { bg: "rgba(255,200,87,0.1)", text: "var(--dx-warning)", border: "rgba(255,200,87,0.25)" },
    danger:  { bg: "rgba(255,68,102,0.1)", text: "var(--dx-danger)",  border: "rgba(255,68,102,0.25)" },
  }[color]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>{children}</span>
  )
}

function IconBtn({ children, onClick, title, variant }) {
  const variants = {
    info:   { bg: "rgba(0,212,255,0.1)",  color: "var(--dx-cyan-bright)", hover: "rgba(0,212,255,0.2)" },
    danger: { bg: "rgba(255,68,102,0.1)", color: "var(--dx-danger)",       hover: "rgba(255,68,102,0.2)" },
  }
  const v = variants[variant] || variants.info
  return (
    <button onClick={onClick} title={title}
      style={{
        padding: 6, borderRadius: 6, border: "none", cursor: "pointer",
        background: v.bg, color: v.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background .15s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = v.hover}
      onMouseLeave={e => e.currentTarget.style.background = v.bg}>
      {children}
    </button>
  )
}

function Row({ label, value, valueColor, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "var(--dx-text-muted)" }}>{label}</span>
      <span className="dx-mono" style={{ fontWeight: bold ? 700 : 600, color: valueColor || "var(--dx-text)" }}>
        {value}
      </span>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 9, color: "var(--dx-text-muted)" }}>{label}</p>
      <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 700, color: color || "var(--dx-cyan-soft)" }}>
        {value}
      </p>
    </div>
  )
}

function Toast({ toast }) {
  const isError = toast.type === "error"
  return (
    <div style={{
      position: "fixed", top: 16, left: 16, right: 16, zIndex: 50,
      padding: "12px 16px", borderRadius: 12,
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
