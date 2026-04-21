"use client"
import { useEffect } from "react"
import {
  Plus, RefreshCw, Filter, AlertTriangle, Package, Layers, TrendingUp,
  Search, Download,
} from "lucide-react"
import { Badge, StatusDot, KpiCard } from "../../components/shared/dx-components"

export default function DesignSystemPage() {
  // เปิด dark theme เฉพาะหน้านี้
  useEffect(() => {
    document.body.classList.add("dx-theme")
    return () => { document.body.classList.remove("dx-theme") }
  }, [])

  return (
    <div style={{ background: "var(--dx-bg-page)", color: "var(--dx-text)", minHeight: "100vh", fontFamily: "var(--dx-font)", padding: 36 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }}>
        <div>
          <div className="dx-pill" style={{ marginBottom: 10 }}>
            <span className="dx-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--dx-cyan)" }}/>
            v1.0 · Dev Only
          </div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: -0.8 }}>DivisionX · Design System</h1>
          <p style={{ fontSize: 13, color: "var(--dx-text-muted)", marginTop: 6 }}>
            Dark Navy + Neon Cyan · ระบบจัดการสต็อกตู้การ์ด One Piece
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/preview-dark" className="dx-btn dx-btn-secondary" style={{ textDecoration: "none" }}>Dashboard Preview →</a>
          <a href="/" className="dx-btn dx-btn-ghost" style={{ textDecoration: "none" }}>← หน้าจริง</a>
        </div>
      </div>

      {/* 01 · Color Palette */}
      <DSRow title="01 · Color Palette" subtitle="Dark Navy (base) + Neon Cyan (signal)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <ColorSwatch hex="#0A1628" label="BG · Page"/>
          <ColorSwatch hex="#0D1E38" label="BG · Sidebar"/>
          <ColorSwatch hex="#132947" label="BG · Surface"/>
          <ColorSwatch hex="#1A2F52" label="BG · Card"/>
          <ColorSwatch hex="#1E3A5F" label="BG · Elevated"/>
          <ColorSwatch hex="#0F1F3D" label="BG · Input"/>
        </div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <ColorSwatch hex="#00D4FF" label="Cyan · Signal" glow/>
          <ColorSwatch hex="#00E5FF" label="Cyan · Bright"/>
          <ColorSwatch hex="#4FC3F7" label="Cyan · Soft"/>
          <ColorSwatch hex="#00FF88" label="Success"/>
          <ColorSwatch hex="#FFC857" label="Warning"/>
          <ColorSwatch hex="#FF4466" label="Danger"/>
        </div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <ColorSwatch hex="#4FC3F7" label="Series · OP"/>
          <ColorSwatch hex="#B794F6" label="Series · PRB"/>
          <ColorSwatch hex="#68D391" label="Series · EB"/>
          <ColorSwatch hex="#FFFFFF" label="Text · Primary" dark/>
          <ColorSwatch hex="#B8C5E0" label="Text · Secondary"/>
          <ColorSwatch hex="#7A8BA8" label="Text · Muted"/>
        </div>
      </DSRow>

      {/* 02 · Typography */}
      <DSRow title="02 · Typography" subtitle="IBM Plex Sans Thai (UI) + JetBrains Mono (numeric)">
        <div className="dx-card" style={{ padding: 28 }}>
          <TypeSpec size={40} weight={700} label="Display · 40/700" sample="ระบบจัดการสต็อก"/>
          <TypeSpec size={24} weight={700} label="H1 · 24/700" sample="ภาพรวมสต็อกสินค้า"/>
          <TypeSpec size={16} weight={600} label="H2 · 16/600" sample="สต็อกคงเหลือแยกตาม SKU"/>
          <TypeSpec size={13} weight={500} label="Body · 13/500" sample="เลือกเบิกเป็น กล่อง หรือ ซอง ระบบจะคำนวณจำนวนซองให้อัตโนมัติ"/>
          <TypeSpec size={11} weight={500} label="Caption · 11/500" sample="ต่ำกว่า 24 ซอง" muted/>
          <TypeSpec size={28} weight={700} label="Numeric XL · Mono" sample="฿3,298,990.15" mono/>
          <TypeSpec size={16} weight={700} label="Numeric M · Mono" sample="9,420 ซอง · 57 Lot" mono/>
        </div>
      </DSRow>

      {/* 03 · Core Components */}
      <DSRow title="03 · Core Components" subtitle="Buttons · Inputs · Badges · Chips · Pills">
        <div className="dx-card" style={{ padding: 24 }}>
          <DSSub>Buttons</DSSub>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <button className="dx-btn dx-btn-primary"><Plus size={13}/>Primary Action</button>
            <button className="dx-btn dx-btn-secondary"><RefreshCw size={13}/>Secondary</button>
            <button className="dx-btn dx-btn-ghost"><Filter size={13}/>Ghost</button>
            <button className="dx-btn" style={{ background: "rgba(255,68,102,0.1)", border: "1px solid rgba(255,68,102,0.35)", color: "var(--dx-danger)" }}>
              <AlertTriangle size={13}/>Destructive
            </button>
          </div>

          <DSSub>Series Badges</DSSub>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <Badge series="OP"/><Badge series="PRB"/><Badge series="EB"/>
          </div>

          <DSSub>Chips · Filter</DSSub>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            <button className="dx-chip dx-chip-active">ทั้งหมด</button>
            <button className="dx-chip">OP <span className="dx-mono" style={{ opacity: 0.6, marginLeft: 4 }}>15</span></button>
            <button className="dx-chip">PRB <span className="dx-mono" style={{ opacity: 0.6, marginLeft: 4 }}>2</span></button>
            <button className="dx-chip">EB <span className="dx-mono" style={{ opacity: 0.6, marginLeft: 4 }}>4</span></button>
          </div>

          <DSSub>Input · Search</DSSub>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--dx-text-muted)" }}/>
              <input className="dx-input" style={{ paddingLeft: 36 }} placeholder="ค้นหา SKU..." defaultValue="OP 13"/>
            </div>
            <input className="dx-input" placeholder="คลิกเพื่อโฟกัส..."/>
          </div>

          <DSSub>Pills · Status</DSSub>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="dx-pill">
              <span className="dx-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--dx-cyan)" }}/>
              Live Inventory
            </span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(0,255,136,0.1)", color: "var(--dx-success)", border: "1px solid rgba(0,255,136,0.25)", fontWeight: 600 }}>
              ✓ ปกติ
            </span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(255,200,87,0.1)", color: "var(--dx-warning)", border: "1px solid rgba(255,200,87,0.25)", fontWeight: 600 }}>
              ⚠ ใกล้หมด
            </span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(255,68,102,0.1)", color: "var(--dx-danger)", border: "1px solid rgba(255,68,102,0.25)", fontWeight: 600 }}>
              ✕ หมด
            </span>
            <StatusDot status="ok"/> <span style={{ fontSize: 12, color: "var(--dx-text-secondary)" }}>Active</span>
            <StatusDot status="low"/> <span style={{ fontSize: 12, color: "var(--dx-text-secondary)" }}>Warning</span>
            <StatusDot status="danger"/> <span style={{ fontSize: 12, color: "var(--dx-text-secondary)" }}>Danger</span>
          </div>
        </div>
      </DSRow>

      {/* 04 · KPI Cards */}
      <DSRow title="04 · Data Display · KPI Cards" subtitle="6 accent variants + optional glow + trend">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
          <KpiCard icon={Package} label="สต็อกรวม" value="9,420" sub="ซอง" accent="cyan" glow trend={{ positive: true, value: "+248", label: "วัน" }}/>
          <KpiCard icon={AlertTriangle} label="ใกล้หมด" value="3 SKU" sub="ต่ำกว่า 24" accent="warning"/>
          <KpiCard icon={Layers} label="Lot" value="57" sub="รายการ" accent="green"/>
          <KpiCard icon={TrendingUp} label="มูลค่า" value="฿3.29M" sub="ต้นทุน" accent="purple"/>
        </div>
      </DSRow>

      {/* 05 · Radius / Shadow / Spacing */}
      <DSRow title="05 · Radius · Glow · Spacing" subtitle="Foundational tokens">
        <div className="dx-card" style={{ padding: 24 }}>
          <DSSub>Border Radius</DSSub>
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            {[[6,"sm · 6"],[10,"md · 10"],[16,"lg · 16"],[24,"xl · 24"]].map(([r, l]) => (
              <div key={r} style={{ textAlign: "center" }}>
                <div style={{ width: 72, height: 72, borderRadius: r, background: "var(--dx-bg-elevated)", border: "1px solid var(--dx-border-strong)", marginBottom: 6 }}/>
                <div className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>{l}</div>
              </div>
            ))}
          </div>

          <DSSub>Glow Intensity</DSSub>
          <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              { l: "None",    s: "none",                                                            b: "1px solid var(--dx-border)" },
              { l: "Soft",    s: "0 0 16px -4px rgba(0,212,255,0.25)",                              b: "1px solid rgba(0,212,255,0.25)" },
              { l: "Medium",  s: "0 0 20px -4px rgba(0,212,255,0.45)",                              b: "1px solid var(--dx-cyan)" },
              { l: "Intense", s: "0 0 28px rgba(0,212,255,0.7), 0 0 0 1px var(--dx-cyan)",           b: "1px solid var(--dx-cyan)" },
            ].map(g => (
              <div key={g.l} style={{ textAlign: "center" }}>
                <div style={{ width: 72, height: 72, borderRadius: 10, background: "var(--dx-bg-card)", boxShadow: g.s, border: g.b, marginBottom: 6 }}/>
                <div className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)" }}>{g.l}</div>
              </div>
            ))}
          </div>

          <DSSub>Spacing Scale · 4pt</DSSub>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            {[4, 8, 12, 16, 24, 32, 48].map(n => (
              <div key={n} style={{ textAlign: "center" }}>
                <div style={{ width: n, height: 48, background: "linear-gradient(180deg, var(--dx-cyan) 0%, var(--dx-cyan-dim) 100%)", borderRadius: 2 }}/>
                <div className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)", marginTop: 4 }}>{n}</div>
              </div>
            ))}
          </div>
        </div>
      </DSRow>
    </div>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function DSRow({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--dx-text-muted)", marginTop: 3 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function DSSub({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
      color: "var(--dx-text-muted)", textTransform: "uppercase", marginBottom: 10,
    }}>
      {children}
    </div>
  )
}

function ColorSwatch({ hex, label, glow, dark }) {
  return (
    <div>
      <div style={{
        height: 78, borderRadius: 10,
        background: hex,
        border: dark ? "1px solid var(--dx-border)" : "1px solid rgba(255,255,255,0.04)",
        boxShadow: glow ? `0 0 20px ${hex}66` : "none",
        marginBottom: 6, position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", bottom: 4, right: 6,
          fontFamily: "var(--dx-mono)", fontSize: 9,
          color: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
        }}>
          {hex}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--dx-text-secondary)", fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function TypeSpec({ size, weight, label, sample, muted, mono }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "180px 1fr",
      gap: 24, alignItems: "baseline",
      padding: "14px 0",
      borderBottom: "1px dashed var(--dx-border)",
    }}>
      <div className="dx-mono" style={{ fontSize: 10, color: "var(--dx-text-muted)", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{
        fontSize: size, fontWeight: weight,
        color: muted ? "var(--dx-text-muted)" : "var(--dx-text)",
        fontFamily: mono ? "var(--dx-mono)" : "inherit",
        lineHeight: 1.2,
      }}>
        {sample}
      </div>
    </div>
  )
}
