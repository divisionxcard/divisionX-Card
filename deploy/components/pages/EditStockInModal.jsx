// EditStockInModal — Dark Theme
import { useState } from "react"
import { X, CheckCircle, Loader2 } from "lucide-react"
import { fmt, fmtB, today, sortSkus, convertToPacks } from "../shared/helpers"

export default function EditStockInModal({ record, onSave, onClose, skus }) {
  const [form, setForm] = useState({
    lot_number:   record.lot_number || "",
    purchased_at: record.purchased_at?.slice(0, 10) || today(),
    source:       record.source || "",
    sku_id:       record.sku_id || "OP 01",
    unit:         record.unit || "box",
    quantity:     String(record.quantity || 1),
    unit_cost:    String(record.unit_cost || ""),
    note:         record.note || "",
  })
  const [saving, setSaving] = useState(false)

  const sku = skus.find(s => s.sku_id === form.sku_id)
  const qty = parseInt(form.quantity) || 0
  const packs = convertToPacks(qty, form.unit, sku)
  const unitCost = parseFloat(form.unit_cost) || 0
  const totalCost = qty * unitCost
  const cpp = packs > 0 ? totalCost / packs : 0
  const canSave = form.lot_number && form.source && qty && unitCost

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(record.id, {
        lot_number:     form.lot_number,
        purchased_at:   form.purchased_at,
        source:         form.source,
        sku_id:         form.sku_id,
        unit:           form.unit,
        quantity:       qty,
        quantity_packs: packs,
        unit_cost:      unitCost,
        total_cost:     totalCost,
        note:           form.note,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--dx-bg-card)", borderRadius: 16,
        width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto",
        border: "1px solid var(--dx-border-glow)",
        boxShadow: "0 30px 60px -10px rgba(0,0,0,0.7), 0 0 40px -10px var(--dx-glow)",
        fontFamily: "var(--dx-font)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottom: "1px solid var(--dx-border)" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--dx-text)" }}>
            แก้ไขข้อมูลการรับสินค้า
          </h2>
          <button onClick={onClose}
            style={{ padding: 6, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "var(--dx-text-muted)", display: "flex" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--dx-bg-elevated)"; e.currentTarget.style.color = "var(--dx-text)" }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dx-text-muted)" }}>
            <X size={16}/>
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>เลขที่ Lot</label>
              <input value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })}
                className="dx-input dx-mono"/>
            </div>
            <div>
              <label style={labelStyle}>วันที่ซื้อ</label>
              <input type="date" value={form.purchased_at} onChange={e => setForm({ ...form, purchased_at: e.target.value })} className="dx-input"/>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Supplier</label>
            <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="dx-input"/>
          </div>

          <div>
            <label style={labelStyle}>สินค้า (SKU)</label>
            <select value={form.sku_id} onChange={e => setForm({ ...form, sku_id: e.target.value })} className="dx-input">
              {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>หน่วย</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="dx-input">
                <option value="pack">ซอง (Pack)</option>
                <option value="box">กล่อง (Box)</option>
                <option value="cotton">Cotton</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>จำนวน</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                className="dx-input dx-mono" style={{ fontWeight: 700 }}/>
            </div>
          </div>

          <div>
            <label style={labelStyle}>ราคาต้นทุนต่อหน่วย (บาท)</label>
            <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })}
              className="dx-input dx-mono"/>
          </div>

          {qty > 0 && unitCost > 0 && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: "linear-gradient(180deg, rgba(0,212,255,0.08) 0%, transparent 100%)",
              border: "1px solid var(--dx-border-glow)",
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "center",
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)" }}>ซองรวม</p>
                <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700, color: "var(--dx-cyan-bright)" }}>
                  {fmt(packs)}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)" }}>ต้นทุน/ซอง</p>
                <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700, color: "#B794F6" }}>
                  {fmtB(cpp.toFixed(2))}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: "var(--dx-text-muted)" }}>มูลค่ารวม</p>
                <p className="dx-mono" style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700, color: "var(--dx-text)" }}>
                  {fmtB(totalCost)}
                </p>
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>หมายเหตุ</label>
            <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="dx-input"/>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, padding: 20, borderTop: "1px solid var(--dx-border)" }}>
          <button onClick={onClose} className="dx-btn dx-btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 10 }}>
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving || !canSave} className="dx-btn dx-btn-primary"
            style={{ flex: 1, justifyContent: "center", padding: 10, opacity: (saving || !canSave) ? 0.5 : 1, cursor: (saving || !canSave) ? "not-allowed" : "pointer" }}>
            {saving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>}
            {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </div>
  )
}
