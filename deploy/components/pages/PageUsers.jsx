// PageUsers — Dark Theme
import { useState, useEffect } from "react"
import {
  Shield, UserPlus, RefreshCw, Loader2, X, CheckCircle,
  Pencil, Trash2, Eye, EyeOff,
} from "lucide-react"
import { StatusDot, SectionTitle } from "../shared/dx-components"

export default function PageUsers({ currentProfile, machines, machineAssignments, allProfiles, onAddAssignment, onRemoveAssignment }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("list")
  const [form, setForm] = useState({ username: "", email: "", display_name: "", password: "", role: "user" })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUsers(data)
    } catch (err) { showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, "error") }
    finally { setLoading(false) }
  }

  useEffect(() => { loadUsers() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, username: form.username.trim().toLowerCase() }
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`เพิ่มผู้ใช้ ${payload.username} สำเร็จ`)
      setForm({ username: "", email: "", display_name: "", password: "", role: "user" })
      setTab("list")
      loadUsers()
    } catch (err) { showToast("เพิ่มไม่สำเร็จ: " + err.message, "error") }
    finally { setSaving(false) }
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return
    if (editingUser.id === currentProfile?.id && editingUser.role !== "admin") {
      showToast("ไม่สามารถลดสิทธิ์ตัวเองได้", "error")
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editingUser.id,
          role: editingUser.role,
          display_name: editingUser.display_name,
          username: editingUser.username?.trim().toLowerCase(),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast("บันทึกสำเร็จ")
      setEditingUser(null)
      loadUsers()
    } catch (err) { showToast("บันทึกไม่สำเร็จ: " + err.message, "error") }
    finally { setSavingEdit(false) }
  }

  const handleDelete = async (userId, email) => {
    setDeleting(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showToast(`ลบผู้ใช้ ${email} สำเร็จ`)
      setConfirmDelete(null)
      loadUsers()
    } catch (err) { showToast("ลบไม่สำเร็จ: " + err.message, "error") }
    finally { setDeleting(false) }
  }

  if (currentProfile?.role !== "admin") {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20, marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,212,255,0.05)",
          border: "1px dashed var(--dx-border-glow)",
          color: "var(--dx-cyan)",
        }}>
          <Shield size={32}/>
        </div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dx-text)" }}>ไม่มีสิทธิ์เข้าถึง</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--dx-text-muted)" }}>เฉพาะ Admin เท่านั้น</p>
      </div>
    )
  }

  const labelStyle = { fontSize: 10, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dx-text-muted)", marginBottom: 6, display: "block" }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 50,
          padding: "12px 16px", borderRadius: 12,
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--dx-bg-card)",
          border: `1px solid ${toast.type === "error" ? "rgba(255,68,102,0.35)" : "rgba(0,255,136,0.35)"}`,
          color: toast.type === "error" ? "var(--dx-danger)" : "var(--dx-success)",
          fontSize: 12,
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)",
        }}>
          {toast.type === "error" ? <X size={14}/> : <CheckCircle size={14}/>}
          {toast.msg}
        </div>
      )}

      <SectionTitle pill="Admin · Users" title="จัดการผู้ใช้งาน" subtitle="เพิ่ม ดู และลบผู้ใช้ในระบบ · กำหนดตู้รับผิดชอบ"/>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[{ id: "list", label: "รายชื่อผู้ใช้" }, { id: "add", label: "เพิ่มผู้ใช้ใหม่", icon: UserPlus }, { id: "assign", label: "กำหนดตู้" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`dx-chip ${tab === t.id ? "dx-chip-active" : ""}`}
            style={{ padding: "9px 14px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {t.icon && <t.icon size={13}/>}
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* User list */}
      {tab === "list" && (
        <div className="dx-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>ผู้ใช้ทั้งหมด</h2>
            <button onClick={loadUsers}
              style={{
                padding: 6, borderRadius: 6, border: "none", cursor: "pointer",
                background: "transparent", color: "var(--dx-text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--dx-bg-elevated)"; e.currentTarget.style.color = "var(--dx-cyan)" }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dx-text-muted)" }}>
              <RefreshCw size={14}/>
            </button>
          </div>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--dx-cyan)" }}/>
            </div>
          ) : users.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--dx-text-muted)", padding: "32px 0", fontSize: 13 }}>ยังไม่มีผู้ใช้งาน</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {users.map(u => {
                const isEditing = editingUser?.id === u.id
                const isSelf = u.id === currentProfile?.id
                return (
                  <div key={u.id} style={{
                    padding: 12, borderRadius: 10,
                    background: "var(--dx-bg-input)",
                    border: "1px solid var(--dx-border)",
                  }}>
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 999,
                            background: "linear-gradient(135deg, #00D4FF, #B794F6)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 700, color: "#0A1628",
                            flexShrink: 0,
                          }}>
                            {(editingUser.display_name || editingUser.username || u.email)[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: "0 0 4px", fontSize: 10, color: "var(--dx-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {u.email}
                            </p>
                            <input value={editingUser.display_name}
                              onChange={e => setEditingUser({ ...editingUser, display_name: e.target.value })}
                              placeholder="ชื่อที่แสดง"
                              className="dx-input" style={{ padding: "6px 10px", fontSize: 12 }}/>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: 11, color: "var(--dx-text-muted)", flexShrink: 0, width: 56 }}>ชื่อผู้ใช้:</label>
                          <input value={editingUser.username || ""}
                            onChange={e => setEditingUser({ ...editingUser, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                            placeholder="username (a-z, 0-9, _)"
                            maxLength={20}
                            autoCapitalize="none" autoCorrect="off" spellCheck={false}
                            className="dx-input dx-mono" style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}/>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: 11, color: "var(--dx-text-muted)", flexShrink: 0 }}>สิทธิ์:</label>
                          <select value={editingUser.role} disabled={isSelf}
                            onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}
                            className="dx-input" style={{ flex: 1, padding: "6px 10px", fontSize: 12, opacity: isSelf ? 0.5 : 1 }}>
                            <option value="user">User — ใช้งานทั่วไป</option>
                            <option value="admin">Admin — จัดการผู้ใช้ได้</option>
                          </select>
                        </div>
                        {isSelf && (
                          <p style={{ margin: 0, fontSize: 10, color: "var(--dx-warning)" }}>
                            ไม่สามารถลดสิทธิ์ตัวเองได้ (ป้องกัน lockout)
                          </p>
                        )}
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => setEditingUser(null)} disabled={savingEdit} className="dx-btn dx-btn-ghost"
                            style={{ padding: "5px 12px", fontSize: 11 }}>
                            ยกเลิก
                          </button>
                          <button onClick={handleSaveEdit} disabled={savingEdit} className="dx-btn dx-btn-primary"
                            style={{ padding: "5px 12px", fontSize: 11, opacity: savingEdit ? 0.5 : 1 }}>
                            {savingEdit ? <Loader2 size={11} className="animate-spin"/> : <CheckCircle size={11}/>}
                            {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 999,
                          background: "linear-gradient(135deg, #00D4FF, #B794F6)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, fontWeight: 700, color: "#0A1628",
                          flexShrink: 0,
                        }}>
                          {(u.display_name || u.email)[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--dx-text)", display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {u.display_name || "—"}
                            </span>
                            {u.username && (
                              <span className="dx-mono" style={{ fontSize: 11, fontWeight: 400, color: "var(--dx-cyan-soft)", flexShrink: 0 }}>
                                @{u.username}
                              </span>
                            )}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.email}
                          </p>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, flexShrink: 0,
                          ...(u.role === "admin"
                            ? { background: "rgba(183,148,246,0.12)", color: "#B794F6", border: "1px solid rgba(183,148,246,0.25)" }
                            : { background: "var(--dx-bg-elevated)", color: "var(--dx-text-muted)", border: "1px solid var(--dx-border)" }
                          ),
                        }}>
                          {u.role === "admin" ? "Admin" : "User"}
                        </span>
                        <button onClick={() => setEditingUser({ id: u.id, username: u.username || "", display_name: u.display_name || "", role: u.role || "user" })}
                          style={{
                            padding: 6, borderRadius: 6, border: "none", cursor: "pointer",
                            background: "transparent", color: "var(--dx-text-muted)",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,212,255,0.1)"; e.currentTarget.style.color = "var(--dx-cyan)" }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dx-text-muted)" }}>
                          <Pencil size={13}/>
                        </button>
                        {!isSelf && (
                          confirmDelete === u.id ? (
                            <div style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                              <button onClick={() => setConfirmDelete(null)}
                                style={{
                                  padding: "4px 10px", fontSize: 10, borderRadius: 6,
                                  border: "1px solid var(--dx-border)",
                                  background: "var(--dx-bg-elevated)", color: "var(--dx-text-secondary)",
                                  cursor: "pointer",
                                }}>ยกเลิก</button>
                              <button onClick={() => handleDelete(u.id, u.email)} disabled={deleting}
                                style={{
                                  padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6,
                                  background: "var(--dx-danger)", color: "#fff", border: "none",
                                  cursor: deleting ? "not-allowed" : "pointer",
                                  opacity: deleting ? 0.5 : 1,
                                }}>
                                {deleting ? "..." : "ลบ"}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(u.id)}
                              style={{
                                padding: 6, borderRadius: 6, border: "none", cursor: "pointer",
                                background: "transparent", color: "var(--dx-text-muted)",
                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,68,102,0.1)"; e.currentTarget.style.color = "var(--dx-danger)" }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dx-text-muted)" }}>
                              <Trash2 size={13}/>
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
        <div className="dx-card" style={{ padding: 20 }}>
          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              <div>
                <label style={labelStyle}>ชื่อผู้ใช้ <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                <input value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                  required minLength={3} maxLength={20}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  placeholder="username (a-z, 0-9, _)" className="dx-input dx-mono"/>
                <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                  ใช้สำหรับ login · 3-20 ตัว · a-z, 0-9, _
                </p>
              </div>
              <div>
                <label style={labelStyle}>อีเมล <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required
                  placeholder="user@example.com" className="dx-input"/>
                <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--dx-text-muted)" }}>
                  ใช้สำหรับ reset รหัสผ่าน
                </p>
              </div>
              <div>
                <label style={labelStyle}>ชื่อที่แสดง</label>
                <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })}
                  placeholder="ชื่อ-นามสกุล หรือ Nickname" className="dx-input"/>
              </div>
              <div>
                <label style={labelStyle}>รหัสผ่าน <span style={{ color: "var(--dx-danger)" }}>*</span></label>
                <div style={{ position: "relative" }}>
                  <input type={showPw ? "text" : "password"} value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    className="dx-input" style={{ paddingRight: 36 }}/>
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    style={{
                      position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "var(--dx-text-muted)", padding: 2,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--dx-text)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--dx-text-muted)"}>
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>สิทธิ์การใช้งาน</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="dx-input">
                  <option value="user">User — ใช้งานทั่วไป</option>
                  <option value="admin">Admin — จัดการผู้ใช้ได้</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={saving} className="dx-btn dx-btn-primary"
              style={{ width: "100%", padding: 12, justifyContent: "center", fontSize: 13, opacity: saving ? 0.5 : 1 }}>
              {saving ? <Loader2 size={15} className="animate-spin"/> : <UserPlus size={15}/>}
              {saving ? "กำลังเพิ่ม..." : "เพิ่มผู้ใช้ใหม่"}
            </button>
          </form>
        </div>
      )}

      {/* Machine Assignments */}
      {tab === "assign" && (
        <div className="dx-card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>
            กำหนดตู้ให้แอดมิน
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: 11, color: "var(--dx-text-muted)" }}>
            ระบุว่าแอดมินคนไหนรับผิดชอบตู้ไหน เพื่อกรองข้อมูลในหน้าเบิกเติมตู้และเคลม
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(machines || []).map(m => {
              const assigned = (machineAssignments || []).filter(a => a.machine_id === m.machine_id)
              const assignedUserIds = assigned.map(a => a.user_id)
              const availableUsers = (allProfiles || []).filter(p => !assignedUserIds.includes(p.id))
              return (
                <div key={m.machine_id} style={{
                  padding: 14, borderRadius: 10,
                  background: "var(--dx-bg-input)",
                  border: "1px solid var(--dx-border)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <StatusDot status={m.status}/>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dx-text)" }}>{m.name}</span>
                    <span className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>
                      ({m.machine_id})
                    </span>
                    {m.location && (
                      <span style={{ fontSize: 10, color: "var(--dx-text-muted)", marginLeft: 2 }}>
                        · {m.location}
                      </span>
                    )}
                  </div>

                  {assigned.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {assigned.map(a => {
                        const prof = (allProfiles || []).find(p => p.id === a.user_id)
                        return (
                          <div key={a.id} style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "5px 10px", borderRadius: 8,
                            background: "rgba(0,212,255,0.1)",
                            border: "1px solid rgba(0,212,255,0.25)",
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--dx-cyan-bright)" }}>
                              {prof?.display_name || prof?.username || prof?.email || "?"}
                            </span>
                            <button onClick={() => onRemoveAssignment(a.id)}
                              style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                color: "var(--dx-cyan-soft)", padding: 0, display: "flex",
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = "var(--dx-danger)"}
                              onMouseLeave={e => e.currentTarget.style.color = "var(--dx-cyan-soft)"}>
                              <X size={12}/>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--dx-text-muted)" }}>
                      ยังไม่มีแอดมินรับผิดชอบ
                    </p>
                  )}

                  {availableUsers.length > 0 && (
                    <select className="dx-input" style={{ width: "auto", padding: "6px 10px", fontSize: 11 }}
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
                        <option key={p.id} value={p.id}>{p.display_name || p.username || p.email}</option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
