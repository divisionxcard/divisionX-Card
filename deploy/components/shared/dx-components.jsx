// DivisionX Card — Dark Theme Components
//
// ใช้คู่กับ:
// - app/globals.css (CSS classes .dx-*)
// - shared/design-tokens.js (tokens)
// - shared/helpers.js (fmt, fmtB)
//
// หมายเหตุ:
// - Skip Icon namespace จาก Claude Design เพราะ DivisionX ใช้ lucide-react อยู่แล้ว
// - ใช้กับหน้าที่ migrate เป็น dark theme แล้ว (อย่าใช้บนหน้าที่ยัง light theme — contrast จะแปลก)

import { fmt, fmtB, getSkuSeries } from "./helpers"

// re-export helpers for convenience (pages สามารถ import จาก dx-components ได้เลย)
export { fmt, fmtB }
export const seriesOf = getSkuSeries

// ─────────────────────────────────────────────
// Badge — SKU series indicator
// ─────────────────────────────────────────────
export function Badge({ series, children }) {
  return <span className={`dx-badge dx-badge-${series}`}>{children || series}</span>
}

// ─────────────────────────────────────────────
// StatusDot — animated status indicator with glow
// ─────────────────────────────────────────────
export function StatusDot({ status }) {
  const c =
    status === "active" || status === "ok"          ? "var(--dx-success)"
    : status === "low" || status === "warning"      ? "var(--dx-warning)"
    : status === "danger"                           ? "var(--dx-danger)"
    :                                                 "var(--dx-text-muted)"
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        className="dx-pulse"
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: c,
          boxShadow: `0 0 8px ${c}`,
        }}
      />
    </span>
  )
}

// ─────────────────────────────────────────────
// KpiCard — dark theme with accent variants, optional glow, trend
// ─────────────────────────────────────────────
const KPI_ACCENT_COLORS = {
  cyan:    { text: "#4FC3F7", bg: "rgba(79,195,247,0.10)",  border: "rgba(79,195,247,0.25)" },
  success: { text: "#00FF88", bg: "rgba(0,255,136,0.08)",   border: "rgba(0,255,136,0.25)" },
  warning: { text: "#FFC857", bg: "rgba(255,200,87,0.08)",  border: "rgba(255,200,87,0.25)" },
  danger:  { text: "#FF4466", bg: "rgba(255,68,102,0.08)",  border: "rgba(255,68,102,0.25)" },
  purple:  { text: "#B794F6", bg: "rgba(183,148,246,0.08)", border: "rgba(183,148,246,0.25)" },
  green:   { text: "#68D391", bg: "rgba(104,211,145,0.08)", border: "rgba(104,211,145,0.25)" },
}

export function KpiCard({ icon: Icon, label, value, sub, accent = "cyan", glow = false, trend }) {
  const c = KPI_ACCENT_COLORS[accent] || KPI_ACCENT_COLORS.cyan
  return (
    <div className={glow ? "dx-card dx-card-glow" : "dx-card"} style={{ padding: 18, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "var(--dx-text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
            {label}
          </p>
          <p className="dx-mono" style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, color: "var(--dx-text)", lineHeight: 1.1, letterSpacing: -0.5 }}>
            {value}
          </p>
          {sub && <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>{sub}</p>}
        </div>
        {Icon && (
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: c.bg,
            border: `1px solid ${c.border}`,
            color: c.text,
            flexShrink: 0,
          }}>
            <Icon size={18} />
          </div>
        )}
      </div>
      {trend && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span className="dx-mono" style={{ color: trend.positive ? "var(--dx-success)" : "var(--dx-danger)", fontWeight: 600 }}>
            {trend.positive ? "▲" : "▼"} {trend.value}
          </span>
          <span style={{ color: "var(--dx-text-muted)" }}>{trend.label}</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SectionTitle — page header with optional pill + action buttons
// ─────────────────────────────────────────────
export function SectionTitle({ pill, title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
      <div>
        {pill && (
          <div className="dx-pill" style={{ marginBottom: 10 }}>
            <span className="dx-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--dx-cyan)" }} />
            {pill}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--dx-text)", letterSpacing: -0.4 }}>{title}</h1>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dx-text-muted)" }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
// BoosterPH — placeholder graphic สำหรับ SKU card (dashboard)
// ─────────────────────────────────────────────
const BOOSTER_COLORS = { OP: "#4FC3F7", PRB: "#B794F6", EB: "#68D391" }

export function BoosterPH({ sku, series }) {
  const c = BOOSTER_COLORS[series] || "#4FC3F7"
  return (
    <div style={{
      height: 120,
      borderRadius: 12,
      overflow: "hidden",
      position: "relative",
      background: `linear-gradient(135deg, ${c}22 0%, #1A2F52 60%, #0F1F3D 100%)`,
      border: `1px solid ${c}33`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {/* diagonal stripes */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `repeating-linear-gradient(45deg, ${c}0A 0 8px, transparent 8px 16px)`,
      }} />
      {/* glow */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 140,
        height: 140,
        background: `radial-gradient(ellipse, ${c}55 0%, transparent 60%)`,
        transform: "translate(-50%, -50%)",
        filter: "blur(20px)",
      }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <div className="dx-mono" style={{ color: "#fff", fontSize: 20, fontWeight: 800, textShadow: `0 0 12px ${c}` }}>
          {sku}
        </div>
        <div style={{ color: c, fontSize: 9, letterSpacing: 2, marginTop: 2, opacity: 0.9 }}>BOOSTER</div>
      </div>
    </div>
  )
}
