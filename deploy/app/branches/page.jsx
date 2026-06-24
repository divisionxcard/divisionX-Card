import "../globals.css"

export const metadata = {
  title: "สาขาที่พร้อมให้บริการ — DivisionX Card",
  description: "ตู้กดการ์ดเกมอัตโนมัติ DivisionX Card · 11 สาขาในห้างชั้นนำ · เปิด 24 ชม.",
}

// 11 สาขา (เรียงตามที่แอดมินกำหนด) · maps = คำค้น Google Maps
const BRANCHES = [
  { name: "เดอะมอลล์บางแค", floor: "ชั้น 3", hint: "ตรงข้าม Harborland", maps: "เดอะมอลล์ บางแค" },
  { name: "เซ็นทรัลพระราม 2", floor: "ชั้น 4", hint: "หน้าจุดขายป๊อบคอร์น ชั้นโรงหนัง", maps: "เซ็นทรัล พระราม 2" },
  { name: "เซ็นทรัลชลบุรี", floor: "ชั้น 4", hint: "หน้าลิฟต์ ชั้นโรงหนัง", maps: "เซ็นทรัล ชลบุรี" },
  { name: "เซ็นทรัลพระราม 9", floor: "ชั้น 7", hint: "ด้านข้างร้าน โอ้กะจู้", maps: "เซ็นทรัล พระราม 9" },
  { name: "เซ็นทรัลรามอินทรา", floor: "ชั้น 3", hint: "ติดบันไดเลื่อนทางขึ้น บริเวณแถวร้าน AKA", maps: "เซ็นทรัล รามอินทรา" },
  { name: "เดอะมอลล์บางกะปิ", floor: "ชั้น 3", hint: "ก่อนถึงฟิตเนสเฟิร์ส", maps: "เดอะมอลล์ บางกะปิ" },
  { name: "เซ็นทรัลศาลายา", floor: "ชั้น 3", hint: "หน้าลิฟต์ หลัง HACHIBAN RAMEN", maps: "เซ็นทรัล ศาลายา" },
  { name: "เซ็นทรัลเวสต์เกต", floor: "ชั้น 2", hint: "หน้าห้องน้ำ ข้าง Super Sport", maps: "เซ็นทรัล เวสต์เกต" },
  { name: "ซีคอนบางแค", floor: "ชั้น 4", hint: "ด้านหลัง MK", maps: "ซีคอนสแควร์ บางแค" },
  { name: "เซ็นทรัลพระราม 2", floor: "ชั้น G", hint: "ติดบันไดเลื่อน หน้า BreadTalk", maps: "เซ็นทรัล พระราม 2" },
  { name: "เซ็นทรัลเวสต์วิลล์", floor: "ชั้น 1", hint: "ฝั่งลานจอดรถ", maps: "เซ็นทรัล เวสต์วิลล์" },
]

const mapHref = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

export default function BranchesPage() {
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
        .bx-count{color:var(--dx-text-muted);font-size:12px;margin-top:14px;}
      `}} />

      <div className="bx-wrap">
        {/* Hero */}
        <header className="bx-hero">
          <img className="bx-logo" src="/logo.png" alt="DivisionX Card" />
          <h1 className="bx-title">สาขาที่<b>พร้อมให้บริการ</b></h1>
          <div className="bx-sub">ตู้กดการ์ดเกมอัตโนมัติ · เปิด 24 ชม.</div>
          <div className="bx-tag">รวดเร็ว · ปลอดภัย · ทันสมัย · {BRANCHES.length} สาขาในห้างชั้นนำ</div>
        </header>

        {/* Branches */}
        <div className="bx-grid">
          {BRANCHES.map((b, i) => (
            <div className="bx-card" key={i}>
              <div className="bx-row">
                <div className="bx-name">📍 {b.name}</div>
                <span className="bx-floor">{b.floor}</span>
              </div>
              <div className="bx-hint">{b.hint}</div>
              <a className="bx-btn" href={mapHref(b.maps)} target="_blank" rel="noopener noreferrer">
                🧭 นำทาง Google Maps
              </a>
            </div>
          ))}
        </div>

        {/* Footer / contact */}
        <footer className="bx-foot">
          <div className="bx-contact">
            <span className="bx-chip"><span className="bx-line">LINE</span> @Divisionxcard</span>
            <span className="bx-chip">📞 <a href="tel:0863863219">086-386-3219</a></span>
          </div>
          <div className="bx-count">DivisionX Card · ตู้กดการ์ดเกมอัตโนมัติ</div>
        </footer>
      </div>
    </main>
  )
}
