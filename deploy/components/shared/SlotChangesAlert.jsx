// SlotChangesAlert — banner + modal for recent slot product changes
// Layer 4 ของ slot-change resilience
import { useState, useEffect } from "react"
import { AlertTriangle, X, ArrowRight, RefreshCw, Loader2 } from "lucide-react"
import { getRecentSlotChanges } from "../../lib/supabase"

export default function SlotChangesAlert({ days = 7 }) {
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getRecentSlotChanges(days)
      setChanges(data || [])
    } catch (e) {
      console.error("slot changes load failed", e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [days])

  if (loading || changes.length === 0) return null  // ไม่แสดง banner ถ้าไม่มี change

  const formatDT = (iso) => {
    if (!iso) return "-"
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{
          width: "100%", padding: "10px 14px", borderRadius: 8,
          background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)",
          color: "var(--dx-warning)", fontSize: 12,
          display: "flex", alignItems: "center", gap: 8,
          cursor: "pointer",
        }}>
        <AlertTriangle size={14}/>
        <span style={{ fontWeight: 600 }}>พบ slot product เปลี่ยน {changes.length} รายการ ในช่วง {days} วันล่าสุด</span>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.8 }}>คลิกดูรายละเอียด →</span>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--dx-bg-card)", borderRadius: 14,
            border: "1px solid var(--dx-border)",
            width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottom: "1px solid var(--dx-border)" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--dx-text)" }}>
                  Slot Product Changes (ช่วง {days} วันล่าสุด)
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
                  ตู้ admin เปลี่ยนสินค้าใน slot · DvX scraper ตรวจอัตโนมัติทุกวัน 00:05 น.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={load} className="dx-btn dx-btn-ghost" style={{ padding: "6px 10px", fontSize: 11 }} title="Refresh">
                  <RefreshCw size={12}/>
                </button>
                <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--dx-text-muted)" }}>
                  <X size={18}/>
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: 30 }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: "var(--dx-text-muted)" }}/>
                </div>
              ) : changes.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--dx-text-muted)", fontSize: 12 }}>
                  ไม่มี slot changes ในช่วงนี้
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--dx-bg-input)", color: "var(--dx-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      <th style={{ padding: "10px 12px", textAlign: "left" }}>เวลาเปลี่ยน</th>
                      <th style={{ padding: "10px 12px", textAlign: "left" }}>ตู้</th>
                      <th style={{ padding: "10px 12px", textAlign: "center" }}>Slot</th>
                      <th style={{ padding: "10px 12px", textAlign: "left" }}>จากสินค้า</th>
                      <th style={{ padding: "10px 12px", textAlign: "center" }}>→</th>
                      <th style={{ padding: "10px 12px", textAlign: "left" }}>เป็นสินค้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c, idx) => (
                      <tr key={idx} style={{ borderTop: "1px solid var(--dx-border)" }}>
                        <td style={{ padding: "10px 12px", color: "var(--dx-text-secondary)" }}>{formatDT(c.changed_at)}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "var(--dx-mono)" }}>{c.machine_id}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: "var(--dx-mono)", color: "var(--dx-cyan-soft)" }}>{c.slot_number}</td>
                        <td style={{ padding: "10px 12px", fontSize: 11 }}>
                          <div style={{ color: "var(--dx-text-secondary)" }}>{c.old_product_name || "—"}</div>
                          {c.old_sku_id && <div style={{ fontSize: 9, color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>{c.old_sku_id}</div>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--dx-warning)" }}>
                          <ArrowRight size={14}/>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 11 }}>
                          <div style={{ color: "var(--dx-success)" }}>{c.new_product_name || "—"}</div>
                          {c.new_sku_id && <div style={{ fontSize: 9, color: "var(--dx-text-muted)", fontFamily: "var(--dx-mono)" }}>{c.new_sku_id}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
