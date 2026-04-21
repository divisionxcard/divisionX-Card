"use client"
import { useEffect } from "react"
import PageDashboardDX from "../../components/pages/PageDashboardDX"
import { MOCK_STOCK_IN, MOCK_STOCK_OUT, MOCK_STOCK_BALANCE, MOCK_SKUS } from "./mock-data"

export default function PreviewDarkPage() {
  // เปิด dark theme เฉพาะหน้านี้ — ไม่กระทบหน้าอื่น
  useEffect(() => {
    document.body.classList.add("dx-theme")
    return () => { document.body.classList.remove("dx-theme") }
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "var(--dx-bg-page)" }}>
      {/* Simple shell — ไม่มี sidebar เต็มรูปแบบเหมือน production */}
      <header style={{
        height: 56,
        background: "var(--dx-bg-surface)",
        borderBottom: "1px solid var(--dx-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 16,
      }}>
        <div style={{
          color: "var(--dx-cyan)",
          filter: "drop-shadow(0 0 8px var(--dx-glow))",
          fontWeight: 800, fontSize: 18, letterSpacing: 1,
          fontFamily: "var(--dx-mono)",
        }}>
          DX
        </div>
        <div style={{ fontSize: 13, color: "var(--dx-text-secondary)" }}>
          <span style={{ color: "var(--dx-text-muted)" }}>Preview · </span>
          <span style={{ color: "var(--dx-text)", fontWeight: 500 }}>Dashboard (Dark Theme)</span>
        </div>
        <div style={{ flex: 1 }}/>
        <a href="/" className="dx-btn dx-btn-ghost" style={{ textDecoration: "none" }}>
          ← กลับหน้าจริง (light theme)
        </a>
        <a href="/design-system" className="dx-btn dx-btn-secondary" style={{ textDecoration: "none" }}>
          Design System →
        </a>
      </header>

      <PageDashboardDX
        stockIn={MOCK_STOCK_IN}
        stockOut={MOCK_STOCK_OUT}
        stockBalance={MOCK_STOCK_BALANCE}
        skus={MOCK_SKUS}
      />
    </div>
  )
}
