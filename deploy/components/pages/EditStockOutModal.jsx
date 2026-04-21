// EditStockOutModal — Dark Theme
import { useState } from "react"
import { X, CheckCircle, Loader2 } from "lucide-react"
import { fmt, sortSkus } from "../shared/helpers"

// แกะ prefix จาก note: "[Nกล่อง] xxx" หรือ "[Nซอง] xxx"
const parseNotePrefix = (noteStr, fallbackPacks) => {
  const s = noteStr || ""
  const m = s.match(/^\[(\d+)(กล่อง|ซอง)\]\s*/)
  if (m) {
    return {
      unit: m[2] === "กล่อง" ? "box" : "pack",
      quantity: parseInt(m[1]) || 1,
      clean: s.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, ""),
    }
  }
  return { unit: "pack", quantity: fallbackPacks || 0, clean: s }
}

export default function EditStockOutModal({ record, skus, machines, onSave, onClose }) {
  const initSku = skus.find(s => s.sku_id === record.sku_id)
  const init = parseNotePrefix(record.note, record.quantity_packs, initSku?.packs_per_box || 24)
  const initDateTime = (record.withdrawn_at || "").slice(0, 16)

  const [form, setForm] = useState({
    sku_id:       record.sku_id || "OP 01",
    lot_number:   record.lot_number || "",
    machine_id:   record.machine_id || "",
    unit:         init.unit,
    quantity:     String(init.quantity),
    withdrawn_at: initDateTime,
    note:         init.clean,
  })
  const [saving, setSaving] = useState(false)

  const sku = skus.find(s => s.sku_id === form.sku_id)
  const qty = parseInt(form.quantity) || 0
  const ppb = sku?.packs_per_box || 24
  const packs = form.unit === "box" ? qty * ppb : qty
  const canSave = form.sku_id && form.machine_id && qty > 0 && form.withdrawn_at

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const unitLabel = form.unit === "box" ? "กล่อง" : "ซอง"
      const newNote = `[${qty}${unitLabel}]${form.note ? ` ${form.note}` : ""}`
      await onSave(record.id, {
        sku_id:         form.sku_id,
        lot_number:     form.lot_number || null,
        machine_id:     form.machine_id,
        quantity_packs: packs,
        withdrawn_at:   `${form.withdrawn_at}:00`,
        note:           newNote,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--dx-bg-card)",
        borderRadius: 16,
        width: "100%", maxWidth: 440, maxHeight: "90vh",
        overflow: "auto",
        border: "1px solid var(--dx-border-glow)",
        boxShadow: "0 30px 60px -10px rgba(0,0,0,0.7), 0 0 40px -10px var(--dx-glow)",
        fontFamily: "var(--dx-font)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: 20, borderBottom: "1px solid var(--dx-border)",
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--dx-text)" }}>
            แก้ไขรายการเบิก
          </h2>
          <button onClick={onClose} style={{
            padding: 6, borderRadius: 8, border: "none", cursor: "pointer",
            background: "transparent", color: "var(--dx-text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--dx-bg-elevated)"; e.currentTarget.style.color = "var(--dx-text)" }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dx-text-muted)" }}>
            <X size={16}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>สินค้า (SKU)</label>
            <select value={form.sku_id} onChange={e => setForm({ ...form, sku_id: e.target.value })} className="dx-input">
              {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Lot</label>
              <input value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })}
                placeholder="(ไม่ระบุ)"
                className="dx-input dx-mono"/>
            </div>
            <div>
              <label style={labelStyle}>ตู้</label>
              <select value={form.machine_id} onChange={e => setForm({ ...form, machine_id: e.target.value })} className="dx-input">
                {(machines || []).map(m => <option key={m.machine_id} value={m.machine_id}>{m.name || m.machine_id}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>หน่วย</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="dx-input">
                <option value="pack">ซอง (Pack)</option>
                <option value="box">กล่อง (Box)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>จำนวน</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                className="dx-input dx-mono" style={{ fontWeight: 700 }}/>
            </div>
          </div>

          {qty > 0 && (
            <div style={{
              padding: 12, borderRadius: 10, textAlign: "center",
              background: "linear-gradient(180deg, rgba(0,212,255,0.08) 0%, transparent 100%)",
              border: "1px solid var(--dx-border-glow)",
            }}>
              <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                จำนวนรวม
              </p>
              <p className="dx-mono" style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: "var(--dx-cyan-bright)" }}>
                {fmt(packs)} ซอง
                {form.unit === "box" && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--dx-text-muted)", fontWeight: 500 }}>
                    ({qty} × {ppb})
                  </span>
                )}
              </p>
            </div>
          )}

          <div>
            <label style={labelStyle}>วันเวลาที่เบิก</label>
            <input type="datetime-local" value={form.withdrawn_at} onChange={e => setForm({ ...form, withdrawn_at: e.target.value })}
              className="dx-input"/>
          </div>

          <div>
            <label style={labelStyle}>หมายเหตุ</label>
            <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              placeholder="(ไม่ระบุ)" className="dx-input"/>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 10, padding: 20,
          borderTop: "1px solid var(--dx-border)",
        }}>
          <button onClick={onClose} className="dx-btn dx-btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 10 }}>
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving || !canSave}
            className="dx-btn dx-btn-primary"
            style={{
              flex: 1, justifyContent: "center", padding: 10,
              opacity: (saving || !canSave) ? 0.5 : 1,
              cursor: (saving || !canSave) ? "not-allowed" : "pointer",
            }}>
            {saving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>}
            {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </div>
  )
}
