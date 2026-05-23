// AIInsightWidget — แสดง insight จาก wiki/ ในหน้า Dashboard
// ดึงข้อมูลผ่าน /api/wiki-insights (อ่าน .md files ที่ agent สร้าง)
import { useState, useEffect } from "react"
import { TrendingDown, TrendingUp, AlertCircle, Sparkles, Loader2, ChevronRight } from "lucide-react"

export default function AIInsightWidget({ limit = 3 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState("losers")

  useEffect(() => {
    let active = true
    fetch(`/api/wiki-insights?limit=${limit}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { if (active) setData(d) })
      .catch(e => { if (active) setError(String(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [limit])

  const fmtPct = (n) => `${n > 0 ? "+" : ""}${Math.round(n)}%`
  const fmtBaht = (n) => new Intl.NumberFormat("th-TH").format(Math.round(n))
  const fmtTimeAgo = (iso) => {
    if (!iso) return "—"
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3600000)
    if (h < 1) return "เพิ่งอัปเดต"
    if (h < 24) return `${h} ชม.ที่แล้ว`
    return `${Math.floor(h / 24)} วันที่แล้ว`
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--dx-muted)" }}>
          <Loader2 size={16} className="dx-spin" />
          <span style={{ fontSize: 13 }}>กำลังโหลด AI Insights...</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ ...cardStyle, borderColor: "rgba(239,68,68,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--dx-danger)" }}>
          <AlertCircle size={16} />
          <span style={{ fontSize: 13 }}>โหลด AI Insights ไม่สำเร็จ: {error || "ไม่มีข้อมูล"}</span>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: "losers",     label: "ขายตก",     icon: TrendingDown, color: "var(--dx-danger)",  items: data.losers },
    { id: "winners",    label: "ขายโต",     icon: TrendingUp,   color: "var(--dx-success)", items: data.winners },
    { id: "low_margin", label: "Margin ต่ำ", icon: AlertCircle,  color: "var(--dx-warning)", items: data.low_margin },
  ]
  const activeTab = tabs.find(t => t.id === tab)

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={18} style={{ color: "var(--dx-accent)" }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>AI Insights</span>
          <span style={{ fontSize: 11, color: "var(--dx-muted)" }}>
            ({fmtTimeAgo(data.summary.last_updated)})
          </span>
        </div>
        <span style={{ fontSize: 11, color: "var(--dx-muted)" }}>
          {data.summary.total_skus} SKU · Net ฿{fmtBaht(data.summary.total_net_revenue_30d)}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid",
              borderColor: tab === t.id ? t.color : "var(--dx-border)",
              background: tab === t.id ? `${t.color.replace("var(--", "").replace(")", "")}15` : "transparent",
              color: tab === t.id ? t.color : "var(--dx-muted)",
              fontSize: 12,
              fontWeight: tab === t.id ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <t.icon size={14} />
            {t.label} ({t.items.length})
          </button>
        ))}
      </div>

      {/* Items list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activeTab.items.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--dx-muted)", fontSize: 13 }}>
            ไม่มีรายการ
          </div>
        ) : activeTab.items.map(item => (
          <div
            key={item.sku_id}
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--dx-border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{item.sku_id}</span>
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: tab === "losers" || (tab === "low_margin" && item.net_margin_pct < 15)
                  ? "var(--dx-danger)"
                  : tab === "winners" ? "var(--dx-success)" : "var(--dx-warning)"
              }}>
                {tab === "low_margin"
                  ? `${item.net_margin_pct.toFixed(1)}%`
                  : fmtPct(item.trend_pct)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--dx-muted)" }}>
              {tab === "low_margin"
                ? `รายได้สุทธิ 30 วัน: ฿${fmtBaht(item.net_revenue_30d)}`
                : `ขาย 30 วัน: ${item.sales_qty_30d} ซอง`}
            </div>
          </div>
        ))}
      </div>

      {/* Footer summary */}
      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: "1px solid var(--dx-border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11, color: "var(--dx-muted)",
      }}>
        <span>Ksher fees 30 วัน: −฿{fmtBaht(data.summary.total_ksher_fees_30d)}</span>
        {data.recent_discrepancies.length > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <AlertCircle size={12} style={{ color: "var(--dx-warning)" }} />
            {data.recent_discrepancies.length} discrepancy report
          </span>
        )}
      </div>
    </div>
  )
}

const cardStyle = {
  background: "var(--dx-surface)",
  border: "1px solid var(--dx-border)",
  borderRadius: 10,
  padding: 16,
}
