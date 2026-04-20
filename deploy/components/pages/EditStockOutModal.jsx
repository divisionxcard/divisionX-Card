import { useState } from "react"
import { X, CheckCircle, Loader2 } from "lucide-react"
import { fmt } from "../shared/helpers"
import { sortSkus } from "../shared/helpers"

// แกะ prefix จาก note: "[Nกล่อง] xxx" หรือ "[Nซอง] xxx"
const parseNotePrefix = (noteStr, fallbackPacks, packsPerBox) => {
  const s = noteStr || ""
  const m = s.match(/^\[(\d+)(กล่อง|ซอง)\]\s*/)
  if (m) {
    return {
      unit: m[2] === "กล่อง" ? "box" : "pack",
      quantity: parseInt(m[1]) || 1,
      clean: s.replace(/^\[\d+(กล่อง|ซอง)\]\s*/, ""),
    }
  }
  // fallback: ถือเป็น ซอง ตาม quantity_packs
  return { unit: "pack", quantity: fallbackPacks || 0, clean: s }
}

export default function EditStockOutModal({ record, skus, machines, onSave, onClose }) {
  const initSku = skus.find(s => s.sku_id === record.sku_id)
  const init = parseNotePrefix(record.note, record.quantity_packs, initSku?.packs_per_box || 24)

  // datetime-local input ต้อง YYYY-MM-DDTHH:mm (ไม่เอา seconds/timezone)
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

  const handleSave = async () => {
    if (!form.sku_id || !form.machine_id || !qty || !form.withdrawn_at) return
    setSaving(true)
    try {
      const unitLabel = form.unit === "box" ? "กล่อง" : "ซอง"
      const newNote = `[${qty}${unitLabel}]${form.note ? ` ${form.note}` : ""}`
      await onSave(record.id, {
        sku_id:        form.sku_id,
        lot_number:    form.lot_number || null,
        machine_id:    form.machine_id,
        quantity_packs: packs,
        withdrawn_at:  `${form.withdrawn_at}:00`,
        note:          newNote,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">แก้ไขรายการเบิก</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU)</label>
            <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
              {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Lot</label>
              <input value={form.lot_number} onChange={e => setForm({...form, lot_number:e.target.value})}
                placeholder="(ไม่ระบุ)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-200"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ตู้</label>
              <select value={form.machine_id} onChange={e => setForm({...form, machine_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                {(machines || []).map(m => <option key={m.machine_id} value={m.machine_id}>{m.name || m.machine_id}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">หน่วย</label>
              <select value={form.unit} onChange={e => setForm({...form, unit:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="pack">ซอง (Pack)</option>
                <option value="box">กล่อง (Box)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
            </div>
          </div>
          {qty > 0 && (
            <div className="p-3 bg-orange-50 rounded-xl text-center">
              <p className="text-xs text-gray-500">จำนวนรวม</p>
              <p className="text-sm font-bold text-orange-700">{fmt(packs)} ซอง {form.unit === "box" && <span className="text-xs text-gray-500">({qty} × {ppb})</span>}</p>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันเวลาที่เบิก</label>
            <input type="datetime-local" value={form.withdrawn_at} onChange={e => setForm({...form, withdrawn_at:e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
            <input value={form.note} onChange={e => setForm({...form, note:e.target.value})}
              placeholder="(ไม่ระบุ)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"/>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving || !form.sku_id || !form.machine_id || !qty || !form.withdrawn_at}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin"/> : <CheckCircle size={15}/>}
            {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </div>
  )
}
