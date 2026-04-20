import { useState } from "react"
import { CheckCircle, AlertTriangle, Trash2 } from "lucide-react"
import { fmtB, sortSkus } from "../shared/helpers"

export default function PageClaims({ machines, skus, claims, onAddClaim, onConfirmClaim, onDeleteClaim, machineAssignments, session }) {
  // กรองตู้ตาม assignment (ถ้ามี)
  const userId = session?.user?.id
  const myAssignments = (machineAssignments || []).filter(a => a.user_id === userId && a.is_active)
  const hasAssignment = myAssignments.length > 0
  const myMachines = hasAssignment ? machines.filter(m => myAssignments.some(a => a.machine_id === m.machine_id)) : machines
  const myClaims = hasAssignment ? claims.filter(c => myAssignments.some(a => a.machine_id === c.machine_id)) : claims
  const [form, setForm] = useState({
    machine_id:"", sku_id:"", quantity:"1", refund_amount:"",
    product_status:"returned", reason:"สินค้าไม่ตก", note:"",
    claimed_at: new Date().toISOString().slice(0,10),
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3000) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.machine_id) { showToast("กรุณาเลือกตู้","error"); return }
    if (!form.sku_id)     { showToast("กรุณาเลือกสินค้า","error"); return }
    if (form.product_status !== "lost" && (!form.refund_amount || parseFloat(form.refund_amount) <= 0)) { showToast("กรุณาระบุยอดคืนเงิน","error"); return }
    if (!form.claimed_at) { showToast("กรุณาระบุวันที่เคลม","error"); return }
    try {
      setSaving(true)
      await onAddClaim({
        machine_id:     form.machine_id,
        sku_id:         form.sku_id,
        quantity:       parseInt(form.quantity) || 1,
        refund_amount:  parseFloat(form.refund_amount) || 0,
        product_status: form.product_status,
        reason:         form.reason || null,
        note:           form.note || null,
        claimed_at:     form.claimed_at,
      })
      showToast(`บันทึกเคลมสำเร็จ: ${form.sku_id} → ${form.product_status === "returned" ? "คืนสต็อก" : "ตัดชำรุด"}`)
      setForm(f => ({...f, machine_id:"", sku_id:"", quantity:"1", refund_amount:"", note:"", claimed_at: new Date().toISOString().slice(0,10) }))
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await onDeleteClaim(id)
      setDeleteId(null)
      showToast("ลบรายการเคลมสำเร็จ")
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
  }

  const handleConfirm = async (claim) => {
    try {
      setConfirming(true)
      await onConfirmClaim(claim)
      setConfirmId(null)
      showToast(`ยืนยันเคลมสำเร็จ: ${claim.sku_id} ${claim.quantity} ซอง`)
    } catch (err) { showToast("ยืนยันไม่สำเร็จ: " + err.message, "error") }
    finally { setConfirming(false) }
  }

  // สรุป (ใช้ myClaims ที่กรองตามตู้ที่ assign แล้ว)
  const totalRefund  = myClaims.reduce((a, r) => a + (parseFloat(r.refund_amount) || 0), 0)
  const totalReturned = myClaims.filter(r => r.product_status === "returned").length
  const totalDamaged  = myClaims.filter(r => r.product_status === "damaged").length
  const totalLost     = myClaims.filter(r => r.product_status === "lost").length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">เคลม / คืนเงิน</h1>

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${toast.type==="success"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {toast.type==="success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <p className="text-xs text-gray-400">เคลมทั้งหมด</p>
          <p className="text-xl font-bold text-red-600">{myClaims.length} รายการ</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <p className="text-xs text-gray-400">ยอดคืนเงินรวม</p>
          <p className="text-xl font-bold text-red-600">{fmtB(totalRefund)}</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <p className="text-xs text-gray-400">สถานะสินค้า</p>
          <p className="text-sm font-medium text-gray-700 mt-1">
            <span className="text-green-600">{totalReturned} คืนสต็อก</span>
            {" · "}
            <span className="text-red-500">{totalDamaged} ชำรุด</span>
            {totalLost > 0 && <>{" · "}<span className="text-orange-500">{totalLost} สูญหาย</span></>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ฟอร์มบันทึกเคลม */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">บันทึกเคลม</h2>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs text-gray-500 mb-1">วันที่เคลม</label>
              <input type="date" value={form.claimed_at} onChange={e => setForm({...form, claimed_at:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">ตู้ที่เกิดปัญหา</label>
              <select value={form.machine_id} onChange={e => setForm({...form, machine_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="" disabled>— เลือกตู้ —</option>
                {myMachines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name} ({m.machine_id})</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">สินค้า (SKU)</label>
              <select value={form.sku_id} onChange={e => setForm({...form, sku_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="" disabled>— เลือกสินค้า —</option>
                {sortSkus(skus).map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">จำนวน (ซอง)</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ยอดคืนเงิน (฿)</label>
                <input type="number" min="0" step="0.01" value={form.refund_amount} onChange={e => setForm({...form, refund_amount:e.target.value})}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">สาเหตุ</label>
              <select value={form.reason} onChange={e => setForm({...form, reason:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="สินค้าไม่ตก">สินค้าไม่ตก</option>
                <option value="ตกผิดช่อง">ตกผิดช่อง</option>
                <option value="ตู้ปล่อยเกิน">ตู้ปล่อยเกิน (สินค้าตกเกินจำนวน)</option>
                <option value="เครื่องค้าง">เครื่องค้าง</option>
                <option value="สินค้าชำรุด">สินค้าชำรุด</option>
                <option value="อื่นๆ">อื่นๆ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">สถานะสินค้า</label>
              <div className="grid grid-cols-2 gap-2">
                {[{v:"returned",l:"คืนสต็อก",desc:"สภาพดี นำกลับมาขายได้",color:"green"},{v:"damaged",l:"ชำรุด",desc:"เสียหาย ขายต่อไม่ได้",color:"red"},{v:"lost",l:"สูญหาย",desc:"ตู้ปล่อยเกิน ไม่ได้คืน",color:"orange"}].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setForm({...form, product_status:opt.v})}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${form.product_status===opt.v ? `border-${opt.color}-400 bg-${opt.color}-50` : "border-gray-200 hover:border-gray-300"}`}>
                    <p className={`text-sm font-semibold ${form.product_status===opt.v ? `text-${opt.color}-700` : "text-gray-700"}`}>{opt.l}</p>
                    <p className="text-xs text-gray-400">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
              <input type="text" value={form.note} onChange={e => setForm({...form, note:e.target.value})}
                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"/>
            </div>

            <button type="submit" disabled={saving}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-all">
              {saving ? "กำลังบันทึก..." : "บันทึกเคลม"}
            </button>
          </form>
        </div>

        {/* ประวัติเคลม */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ประวัติเคลม ({myClaims.length} รายการ)</h2>
          {myClaims.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีรายการเคลม</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs text-gray-400">วันที่</th>
                    <th className="text-left py-2 text-xs text-gray-400">ตู้</th>
                    <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                    <th className="text-right py-2 text-xs text-gray-400">จำนวน</th>
                    <th className="text-right py-2 text-xs text-gray-400">คืนเงิน</th>
                    <th className="text-center py-2 text-xs text-gray-400">สาเหตุ</th>
                    <th className="text-center py-2 text-xs text-gray-400">สถานะ</th>
                    <th className="text-center py-2 text-xs text-gray-400">ยืนยัน</th>
                    <th className="text-left py-2 text-xs text-gray-400">ผู้บันทึก</th>
                    <th className="py-2 text-xs text-gray-400"></th>
                  </tr>
                </thead>
                <tbody>
                  {myClaims.map(c => {
                    const m = machines.find(m => m.machine_id === c.machine_id)
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 text-xs text-gray-600">{c.claimed_at}</td>
                        <td className="py-2.5 text-xs text-gray-700 font-medium">{m?.name || c.machine_id}</td>
                        <td className="py-2.5">
                          <span className="font-mono text-xs font-bold text-gray-700">{c.sku_id}</span>
                        </td>
                        <td className="py-2.5 text-right text-xs text-gray-700">{c.quantity} ซอง</td>
                        <td className="py-2.5 text-right text-xs font-semibold text-red-600">{fmtB(c.refund_amount)}</td>
                        <td className="py-2.5 text-center">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.reason}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            c.product_status === "returned" ? "bg-green-100 text-green-700"
                            : c.product_status === "lost" ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                          }`}>
                            {c.product_status === "returned" ? "คืนสต็อก" : c.product_status === "lost" ? "สูญหาย" : "ชำรุด"}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {c.confirm_status === "confirmed" ? (
                            <span className="text-xs text-green-600 font-medium">ตัดสต็อกแล้ว</span>
                          ) : c.confirm_status === "pending" ? (
                            confirmId === c.id ? (
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => handleConfirm(c)} disabled={confirming}
                                  className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                                  {confirming ? "..." : "ยืนยันตัดสต็อก"}
                                </button>
                                <button onClick={() => setConfirmId(null)} className="text-xs text-gray-400 px-1">ยกเลิก</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmId(c.id)}
                                className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-medium hover:bg-amber-200">
                                รอยืนยัน
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{c.created_by || "—"}</td>
                        <td className="py-2.5 text-right">
                          {deleteId === c.id ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 font-medium">ลบ</button>
                              <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400">ยกเลิก</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteId(c.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14}/></button>
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
      </div>
    </div>
  )
}
