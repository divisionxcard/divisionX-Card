import { useState, useEffect } from "react"
import {
  Shield, UserPlus, RefreshCw, Loader2, X, CheckCircle,
  Pencil, Trash2, Eye, EyeOff,
} from "lucide-react"
import { StatusDot } from "../shared/ui"

export default function PageUsers({ currentProfile, machines, machineAssignments, allProfiles, onAddAssignment, onRemoveAssignment }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState("list")
  const [form,    setForm]    = useState({ email:"", display_name:"", password:"", role:"user" })
  const [showPw,  setShowPw]  = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editingUser, setEditingUser] = useState(null) // { id, display_name, role }
  const [savingEdit, setSavingEdit] = useState(false)

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUsers(data)
    } catch (err) {
      showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res  = await fetch("/api/admin/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`เพิ่มผู้ใช้ ${form.email} สำเร็จ`)
      setForm({ email:"", display_name:"", password:"", role:"user" })
      setTab("list")
      loadUsers()
    } catch (err) {
      showToast("เพิ่มไม่สำเร็จ: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    // กันไม่ให้ admin หลักลดสิทธิ์ตัวเอง (จะถูก lockout)
    if (editingUser.id === currentProfile?.id && editingUser.role !== "admin") {
      showToast("ไม่สามารถลดสิทธิ์ตัวเองได้", "error")
      return
    }
    setSavingEdit(true)
    try {
      const res  = await fetch("/api/admin/users", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          userId:       editingUser.id,
          role:         editingUser.role,
          display_name: editingUser.display_name,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast("บันทึกสำเร็จ")
      setEditingUser(null)
      loadUsers()
    } catch (err) {
      showToast("บันทึกไม่สำเร็จ: " + err.message, "error")
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (userId, email) => {
    setDeleting(true)
    try {
      const res  = await fetch("/api/admin/users", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`ลบผู้ใช้ ${email} สำเร็จ`)
      setConfirmDelete(null)
      loadUsers()
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally {
      setDeleting(false)
    }
  }

  if (currentProfile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Shield size={44} className="mb-3 text-gray-300"/>
        <p className="font-semibold text-gray-500">ไม่มีสิทธิ์เข้าถึง</p>
        <p className="text-sm mt-1">เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-gray-400">เพิ่ม ดู และลบผู้ใช้ในระบบ</p>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm text-white
          ${toast.type==="error" ? "bg-red-500" : "bg-green-500"}`}>
          {toast.type==="error" ? <X size={14}/> : <CheckCircle size={14}/>}
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[{id:"list",label:"รายชื่อผู้ใช้"},{id:"add",label:"เพิ่มผู้ใช้ใหม่"},{id:"assign",label:"กำหนดตู้"}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${tab===t.id ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t.id==="add" && <UserPlus size={14} className="inline mr-1.5"/>}
            {t.label}
          </button>
        ))}
      </div>

      {/* User list */}
      {tab === "list" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">ผู้ใช้ทั้งหมด</h2>
            <button onClick={loadUsers} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-500">
              <RefreshCw size={14}/>
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin text-blue-400"/>
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีผู้ใช้งาน</p>
          ) : (
            <div className="space-y-2">
              {users.map(u => {
                const isEditing = editingUser?.id === u.id
                const isSelf    = u.id === currentProfile?.id
                return (
                  <div key={u.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-blue-600">
                              {(editingUser.display_name || u.email)[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-400 truncate mb-1">{u.email}</p>
                            <input
                              value={editingUser.display_name}
                              onChange={e => setEditingUser({...editingUser, display_name: e.target.value})}
                              placeholder="ชื่อที่แสดง"
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 flex-shrink-0">สิทธิ์:</label>
                          <select
                            value={editingUser.role}
                            onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                            disabled={isSelf}
                            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-400">
                            <option value="user">User — ใช้งานทั่วไป</option>
                            <option value="admin">Admin — จัดการผู้ใช้ได้</option>
                          </select>
                        </div>
                        {isSelf && (
                          <p className="text-xs text-amber-600">ไม่สามารถลดสิทธิ์ตัวเองได้ (ป้องกัน lockout)</p>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingUser(null)} disabled={savingEdit}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-white">
                            ยกเลิก
                          </button>
                          <button onClick={handleSaveEdit} disabled={savingEdit}
                            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                            {savingEdit ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle size={12}/>}
                            {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-blue-600">
                            {(u.display_name || u.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{u.display_name || "—"}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
                          ${u.role==="admin" ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-500"}`}>
                          {u.role==="admin" ? "Admin" : "User"}
                        </span>
                        <button onClick={() => setEditingUser({ id: u.id, display_name: u.display_name || "", role: u.role || "user" })}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 flex-shrink-0">
                          <Pencil size={14}/>
                        </button>
                        {!isSelf && (
                          confirmDelete === u.id ? (
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => setConfirmDelete(null)}
                                className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-white">
                                ยกเลิก
                              </button>
                              <button onClick={() => handleDelete(u.id, u.email)} disabled={deleting}
                                className="px-2 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                                {deleting ? "..." : "ลบ"}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(u.id)}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 flex-shrink-0">
                              <Trash2 size={14}/>
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Add user form */}
      {tab === "add" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">อีเมล <span className="text-red-400">*</span></label>
                <input type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} required
                  placeholder="user@example.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ชื่อที่แสดง</label>
                <input value={form.display_name} onChange={e => setForm({...form,display_name:e.target.value})}
                  placeholder="ชื่อ-นามสกุล หรือ Nickname"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">รหัสผ่าน <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={form.password}
                    onChange={e => setForm({...form,password:e.target.value})} required minLength={6}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 pr-9"/>
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">สิทธิ์การใช้งาน</label>
                <select value={form.role} onChange={e => setForm({...form,role:e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="user">User — ใช้งานทั่วไป</option>
                  <option value="admin">Admin — จัดการผู้ใช้ได้</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin"/> : <UserPlus size={16}/>}
              {saving ? "กำลังเพิ่ม..." : "เพิ่มผู้ใช้ใหม่"}
            </button>
          </form>
        </div>
      )}

      {/* Machine Assignments */}
      {tab === "assign" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">กำหนดตู้ให้แอดมิน</h2>
            <p className="text-xs text-gray-400 mb-4">ระบุว่าแอดมินคนไหนรับผิดชอบตู้ไหน เพื่อกรองข้อมูลในหน้าเบิกเติมตู้และเคลม</p>

            {/* แสดงตามตู้ */}
            <div className="space-y-4">
              {(machines || []).map(m => {
                const assigned = (machineAssignments || []).filter(a => a.machine_id === m.machine_id)
                const assignedUserIds = assigned.map(a => a.user_id)
                const availableUsers = (allProfiles || []).filter(p => !assignedUserIds.includes(p.id))

                return (
                  <div key={m.machine_id} className="p-4 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <StatusDot status={m.status}/>
                      <span className="font-semibold text-gray-800 text-sm">{m.name}</span>
                      <span className="text-xs text-gray-400">({m.machine_id})</span>
                      {m.location && <span className="text-xs text-gray-400 ml-1">· {m.location}</span>}
                    </div>

                    {/* แอดมินที่ assign แล้ว */}
                    {assigned.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {assigned.map(a => {
                          const prof = (allProfiles || []).find(p => p.id === a.user_id)
                          return (
                            <div key={a.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                              <span className="text-xs font-medium text-blue-700">{prof?.display_name || prof?.email || "?"}</span>
                              <button onClick={() => onRemoveAssignment(a.id)}
                                className="text-blue-400 hover:text-red-500">
                                <X size={12}/>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mb-2">ยังไม่มีแอดมินรับผิดชอบ</p>
                    )}

                    {/* เพิ่มแอดมิน */}
                    {availableUsers.length > 0 && (
                      <select
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                        value=""
                        onChange={async (e) => {
                          if (e.target.value) {
                            try {
                              await onAddAssignment({ machine_id: m.machine_id, user_id: e.target.value })
                              showToast(`กำหนดตู้ ${m.name} สำเร็จ`)
                            } catch (err) { showToast("เกิดข้อผิดพลาด: " + err.message, "error") }
                          }
                        }}>
                        <option value="">+ เพิ่มแอดมิน</option>
                        {availableUsers.map(p => (
                          <option key={p.id} value={p.id}>{p.display_name || p.email}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
