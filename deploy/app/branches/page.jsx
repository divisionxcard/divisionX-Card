import "../globals.css"

export const metadata = {
  title: "สาขาที่พร้อมให้บริการ — DivisionX Card",
  description: "ตู้กดการ์ดเกมอัตโนมัติ DivisionX Card · หลายสาขาในห้างชั้นนำ · เปิดตามเวลาห้าง",
}

// refetch ทุก 60 วินาที (ISR) — เพิ่มตู้ใหม่ (ใส่ config.branch) แล้วสาขาขึ้นเองภายใน ~1 นาที
export const revalidate = 60

// ดึงสาขาจาก machines table (config.branch) — data-driven ไม่ต้องแก้โค้ดตอนเพิ่มตู้
async function getBranches() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    const res = await fetch(
      `${url}/rest/v1/machines?status=eq.active&select=machine_id,config`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 60 } }
    )
    if (!res.ok) return []
    const rows = await res.json()
    return rows
      .map((m) => m.config?.branch)
      .filter((b) => b && b.public)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  } catch {
    return []
  }
}

const mapHref = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

export default async function BranchesPage() {
  const BRANCHES = await getBranches()
  return (
    <main style={{ minHeight: "100vh", background: "var(--dx-bg-page)", color: "var(--dx-text)", fontFamily: "var(--dx-font)" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .bx-wrap{max-width:1080px;margin:0 auto;padding:28px 18px 60px;}
        .bx-hero{position:relative;text-align:center;padding:30px 16px 26px;border-radius:20px;overflow:hidden;
          background:radial-gradient(120% 130% at 50% -20%, rgba(0,212,255,.18), rgba(0,212,255,0) 60%), var(--dx-bg-surface);
          border:1px solid var(--dx-border-strong);margin-bottom:24px;}
        .bx-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;
          background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.7;}
        .bx-logo{height:54px;width:auto;margin-bottom:12px;filter:drop-shadow(0 0 14px var(--dx-glow));}
        .bx-title{font-size:clamp(24px,5vw,34px);font-weight:800;letter-spacing:-.5px;margin:0;}
        .bx-title b{color:var(--dx-cyan);}
        .bx-sub{color:var(--dx-cyan-soft);font-size:14px;margin-top:8px;font-weight:600;}
        .bx-tag{color:var(--dx-text-muted);font-size:12.5px;margin-top:6px;}
        .bx-grid{display:grid;grid-template-columns:1fr;gap:14px;}
        @media(min-width:640px){.bx-grid{grid-template-columns:1fr 1fr;}}
        @media(min-width:920px){.bx-grid{grid-template-columns:1fr 1fr 1fr;}}
        .bx-card{position:relative;background:var(--dx-bg-card);border:1px solid var(--dx-border);
          border-radius:16px;padding:18px 18px 16px 22px;display:flex;flex-direction:column;
          transition:border-color .15s, transform .15s;}
        .bx-card::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:4px;
          background:linear-gradient(180deg,var(--dx-cyan),var(--dx-cyan-dim));box-shadow:0 0 12px var(--dx-glow);}
        .bx-card:hover{border-color:var(--dx-border-glow);transform:translateY(-2px);}
        .bx-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
        .bx-name{font-size:17px;font-weight:700;line-height:1.3;}
        .bx-floor{flex:none;background:var(--dx-glow-soft);color:var(--dx-cyan);border:1px solid var(--dx-border-glow);
          font-size:12px;font-weight:700;padding:3px 11px;border-radius:999px;white-space:nowrap;}
        .bx-hint{color:var(--dx-text-muted);font-size:13px;margin-top:8px;line-height:1.45;flex:1;}
        .bx-btn{margin-top:14px;display:inline-flex;align-items:center;justify-content:center;gap:7px;
          background:var(--dx-cyan);color:#02263a;font-weight:700;font-size:14px;text-decoration:none;
          padding:10px 14px;border-radius:11px;transition:background .15s, box-shadow .15s;}
        .bx-btn:hover{background:var(--dx-cyan-bright);box-shadow:0 0 18px var(--dx-glow);}
        .bx-foot{text-align:center;margin-top:34px;padding-top:22px;border-top:1px solid var(--dx-border);}
        .bx-contact{display:inline-flex;flex-wrap:wrap;gap:10px 18px;justify-content:center;align-items:center;
          color:var(--dx-text);font-size:14px;font-weight:600;}
        .bx-contact a{color:var(--dx-cyan-soft);text-decoration:none;}
        .bx-chip{display:inline-flex;align-items:center;gap:7px;background:var(--dx-bg-surface);
          border:1px solid var(--dx-border-strong);border-radius:999px;padding:7px 14px;}
        .bx-line{background:#06C755;color:#fff;border-radius:6px;font-size:11px;font-weight:800;padding:2px 7px;}
        a.bx-chip{text-decoration:none;color:var(--dx-text);transition:border-color .15s, box-shadow .15s;cursor:pointer;}
        a.bx-chip:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
        .bx-count{color:var(--dx-text-muted);font-size:12px;margin-top:14px;}
      `}} />

      <div className="bx-wrap">
        {/* Hero */}
        <header className="bx-hero">
          <img className="bx-logo" src="/logo.png" alt="DivisionX Card" />
          <h1 className="bx-title">สาขาที่<b>พร้อมให้บริการ</b></h1>
          <div className="bx-sub">ตู้กดการ์ดเกมอัตโนมัติ · เปิดตามเวลาห้าง</div>
          <div className="bx-tag">รวดเร็ว · ปลอดภัย · ทันสมัย · {BRANCHES.length} สาขาในห้างชั้นนำ</div>
        </header>

        {/* Branches */}
        <div className="bx-grid">
          {BRANCHES.map((b, i) => (
            <div className="bx-card" key={i}>
              <div className="bx-row">
                <div className="bx-name">📍 {b.display_name}</div>
                {b.floor ? <span className="bx-floor">{b.floor}</span> : null}
              </div>
              {b.landmark ? <div className="bx-hint">{b.landmark}</div> : <div className="bx-hint" />}
              <a className="bx-btn" href={mapHref(b.maps || b.display_name)} target="_blank" rel="noopener noreferrer">
                🧭 นำทาง Google Maps
              </a>
            </div>
          ))}
        </div>

        {/* Footer / contact */}
        <footer className="bx-foot">
          <div className="bx-contact">
            <a className="bx-chip" href="https://lin.ee/9cMKVRm" target="_blank" rel="noopener noreferrer"><span className="bx-line">LINE</span> @Divisionxcard</a>
            <span className="bx-chip">📞 <a href="tel:0863863219">086-386-3219</a></span>
          </div>
          <div className="bx-count">DivisionX Card · ตู้กดการ์ดเกมอัตโนมัติ</div>
        </footer>
      </div>
    </main>
  )
}
