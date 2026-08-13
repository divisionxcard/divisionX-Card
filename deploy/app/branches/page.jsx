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
        .bx-hero{position:relative;text-align:center;padding:0;border-radius:20px;overflow:hidden;
          background:radial-gradient(120% 130% at 50% -20%, rgba(0,212,255,.18), rgba(0,212,255,0) 60%), var(--dx-bg-surface);
          border:1px solid var(--dx-border-strong);margin-bottom:24px;}
        .bx-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;
          background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.7;}

        /* ══ แบนเนอร์ที่เจ้าของออกแบบเอง — ใช้ทุกขนาดจอ ══
           ภาพมีตัวหนังสือฝังอยู่ในตัว (พาดหัว/ไอคอน/เบอร์ติดต่อ) จึงมาแทนบล็อกข้อความทั้งก้อน
           ⚠️ บนมือถือตัวหนังสือในภาพเล็กมาก — ภาพ 1.99:1 ย่อลงกล่องกว้าง 354px เหลือ 26%
           พาดหัวเหลือ ~16px · บรรทัดเล็กเหลือ ~8px และซูมไม่ได้เพราะเป็นภาพ
           เดิมจึงซ่อนภาพบนจอ <720px แล้วโชว์ข้อความ HTML แทน
           แต่เจ้าของเห็นตัวเลขแล้วเลือกให้โชว์ภาพทุกจอ (2026-08-13) — คงไว้ตามนั้น
           ถ้าจะให้อ่านออกบนมือถือจริง ต้องมีภาพเวอร์ชันมือถือแยก (อัตราส่วน ~1.2:1 ตัวหนังสือใหญ่ขึ้น ~4 เท่า) */
        .bx-hero-img{display:block;width:100%;height:auto;}
        /* บล็อกข้อความไม่แสดงให้เห็นแล้วทุกจอ แต่ต้องคงไว้ใน DOM
           ⚠️ ซ่อนด้วย clip ไม่ใช่ display:none — display:none จะทำให้ <h1> หายจากที่ Google อ่าน
           = เสีย SEO ของหน้าสาธารณะ (ตัวหนังสือที่ฝังในภาพ Google อ่านไม่ออก)
           + จำนวนสาขาในบล็อกนี้นับจากฐานข้อมูลจริง ต่างจากในภาพที่เป็นเลขตายตัว */
        .bx-hero-text{position:absolute;width:1px;height:1px;padding:0;margin:-1px;
          overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
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
        /* ชั้น = ข้อมูลที่ลูกค้าต้องอ่านให้ชัดที่สุดตอนยืนอยู่ในห้าง จึงแยกสีออกจากฟ้าของแบรนด์
           ⚠️ ห้ามใช้ --dx-danger (#FF4466) ตรง ๆ — วัดแล้วคอนทราสต์บนพื้นการ์ดกรมท่าได้แค่ ~3.6:1
           ต่ำกว่าเกณฑ์อ่านง่าย 4.5:1 · ใช้แดงอ่อนกว่าเพื่อให้ยังอ่านออกบนพื้นเข้ม */
        .bx-floor{flex:none;background:rgba(255,90,120,.14);color:#FF8DA1;border:1px solid rgba(255,90,120,.42);
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
          {/* แบนเนอร์ — ตัวหนังสือฝังในภาพ จึงต้องใส่ alt ให้ครบความหมาย
              ไม่ใช้ next/image เพราะหน้านี้เป็น static + ISR ภาพเดียวคงที่ ไม่ได้อะไรเพิ่ม
              srcSet: มือถือกล่องกว้างแค่ 354px ถ้าส่งไฟล์ 1339px ไปคือจ่าย 252 KB เพื่อแสดง 354px
              ตัว 800w (105 KB) พอสำหรับจอ DPR2 → ประหยัด 147 KB บนเน็ตในห้าง
              sizes อิงสูตรกล่องจริง: min(1080, 100vw) − 36 (padding ของ .bx-wrap ข้างละ 18) */}
          <img className="bx-hero-img" src="/branches-hero.jpg"
            srcSet="/branches-hero-800.jpg 800w, /branches-hero.jpg 1339w"
            sizes="(min-width:1116px) 1044px, calc(100vw - 36px)"
            width="1339" height="674"
            alt="DivisionX Card — สาขาที่พร้อมให้บริการ · ตู้กดการ์ดเกมอัตโนมัติ เปิดตามเวลาห้าง" />

          {/* บล็อกข้อความ — ไม่แสดงให้เห็นแล้วทุกจอ (แบนเนอร์มีข้อความในตัว)
              แต่ต้องคงไว้ใน DOM ให้ Google อ่าน · เก็บเฉพาะตัวที่มีค่าต่อ SEO
              เคยมี <img> โลโก้อยู่ตรงนี้ด้วย — เอาออกแล้วเพราะไม่มีใครเห็น
              แต่ยังโหลด 25 KB ทุกครั้ง และ alt ก็ไม่ได้บอกอะไรเกินกว่า <h1> กับ <title> */}
          <div className="bx-hero-text">
            <h1 className="bx-title">สาขาที่<b>พร้อมให้บริการ</b></h1>
            <div className="bx-sub">ตู้กดการ์ดเกมอัตโนมัติ · เปิดตามเวลาห้าง</div>
            <div className="bx-tag">รวดเร็ว · ปลอดภัย · ทันสมัย · {BRANCHES.length} สาขาในห้างชั้นนำ</div>
          </div>
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
