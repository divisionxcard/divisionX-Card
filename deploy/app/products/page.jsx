import "../globals.css"

export const metadata = {
  title: "สินค้าทั้งหมด — DivisionX Card",
  description: "การ์ดเกมทั้งหมดในตู้ DivisionX Card · One Piece, Pokémon, Yu-Gi-Oh, Dragon Ball และอีกมากมาย",
}

// refetch ทุก 60 วินาที (ISR) — อัปรูป/สินค้าใหม่ใน "จัดการ SKU" แล้วเห็นภายใน ~1 นาที
export const revalidate = 60

// ลำดับ + ชื่อแสดงผลของแต่ละแฟรนไชส์
const FR = [
  { key: "OP",  name: "One Piece",     emoji: "🏴‍☠️" },
  { key: "PKM", name: "Pokémon",       emoji: "⚡" },
  { key: "YGH", name: "Yu-Gi-Oh!",     emoji: "🃏" },
  { key: "DB",  name: "Dragon Ball",   emoji: "🐉" },
  { key: "NRT", name: "Naruto",        emoji: "🍥" },
  { key: "SL",  name: "Solo Leveling", emoji: "⚔️" },
]

async function getSkus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    const res = await fetch(
      `${url}/rest/v1/skus?is_active=eq.true&select=sku_id,name,series,franchise,sell_price,image_url,image_url_box&order=series,sku_id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 60 } }
    )
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export default async function ProductsPage() {
  const skus = await getSkus()

  // จัดกลุ่มตามแฟรนไชส์
  const byFr = {}
  for (const s of skus) (byFr[s.franchise] ||= []).push(s)
  const groups = [
    ...FR.filter((f) => byFr[f.key]?.length).map((f) => ({ ...f, items: byFr[f.key] })),
    ...Object.keys(byFr)
      .filter((k) => !FR.some((f) => f.key === k))
      .map((k) => ({ key: k, name: k, emoji: "🎴", items: byFr[k] })),
  ]

  return (
    <main style={{ minHeight: "100vh", background: "var(--dx-bg-page)", color: "var(--dx-text)", fontFamily: "var(--dx-font)" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .pr-wrap{max-width:1080px;margin:0 auto;padding:28px 16px 60px;}
        .pr-hero{position:relative;text-align:center;padding:28px 16px 24px;border-radius:20px;overflow:hidden;
          background:radial-gradient(120% 130% at 50% -20%, rgba(0,212,255,.18), rgba(0,212,255,0) 60%), var(--dx-bg-surface);
          border:1px solid var(--dx-border-strong);margin-bottom:22px;}
        .pr-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;
          background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.7;}
        .pr-logo{height:50px;width:auto;margin-bottom:10px;filter:drop-shadow(0 0 14px var(--dx-glow));}
        .pr-title{font-size:clamp(23px,5vw,32px);font-weight:800;letter-spacing:-.5px;margin:0;}
        .pr-title b{color:var(--dx-cyan);}
        .pr-sub{color:var(--dx-cyan-soft);font-size:13.5px;margin-top:7px;font-weight:600;}
        .pr-frhead{display:flex;align-items:center;gap:10px;margin:26px 0 14px;}
        .pr-frhead .e{font-size:22px;}
        .pr-frhead h2{font-size:19px;font-weight:700;margin:0;}
        .pr-frhead .c{color:var(--dx-text-muted);font-size:12px;font-weight:600;background:var(--dx-bg-surface);
          border:1px solid var(--dx-border);border-radius:999px;padding:3px 10px;}
        .pr-frhead .ln{flex:1;height:1px;background:var(--dx-border);}
        .pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        @media(min-width:540px){.pr-grid{grid-template-columns:1fr 1fr 1fr;}}
        @media(min-width:820px){.pr-grid{grid-template-columns:1fr 1fr 1fr 1fr;}}
        .pc{background:var(--dx-bg-card);border:1px solid var(--dx-border);border-radius:14px;overflow:hidden;
          transition:border-color .15s, transform .15s;}
        .pc:hover{border-color:var(--dx-border-glow);transform:translateY(-2px);}
        .pc-img{aspect-ratio:1/1;background-color:#0c1d3a;background-position:center;background-size:cover;
          background-repeat:no-repeat;display:flex;align-items:center;justify-content:center;}
        .pc-ph{font-size:34px;opacity:.5;}
        .pc-meta{padding:10px 12px 13px;}
        .pc-name{font-size:12.5px;font-weight:600;line-height:1.35;min-height:34px;}
        .pc-price{color:var(--dx-cyan);font-weight:800;font-size:15px;margin-top:6px;font-family:'Prompt',var(--dx-font);}
        .pc-ask{color:var(--dx-warning);font-weight:600;font-size:12px;margin-top:6px;}
        .pr-note{text-align:center;color:var(--dx-text-muted);font-size:12px;margin-top:8px;}
        .pr-foot{text-align:center;margin-top:34px;padding-top:22px;border-top:1px solid var(--dx-border);}
        .pr-chip{display:inline-flex;align-items:center;gap:7px;background:var(--dx-bg-surface);
          border:1px solid var(--dx-border-strong);border-radius:999px;padding:8px 16px;font-size:14px;font-weight:600;
          text-decoration:none;color:var(--dx-text);transition:border-color .15s, box-shadow .15s;}
        .pr-chip:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
        .pr-line{background:#06C755;color:#fff;border-radius:5px;font-size:11px;font-weight:800;padding:2px 7px;}
        .pr-cta{margin-top:16px;}
      `}} />

      <div className="pr-wrap">
        <header className="pr-hero">
          <img className="pr-logo" src="/logo.png" alt="DivisionX Card" />
          <h1 className="pr-title">สินค้า<b>ทั้งหมด</b></h1>
          <div className="pr-sub">การ์ดเกมในตู้ · {skus.length} รายการ · เปิดตามเวลาห้าง</div>
        </header>

        {groups.length === 0 && (
          <p className="pr-note">กำลังอัปเดตรายการสินค้า · ลองใหม่อีกครั้งนะครับ</p>
        )}

        {groups.map((g) => (
          <section key={g.key}>
            <div className="pr-frhead">
              <span className="e">{g.emoji}</span>
              <h2>{g.name}</h2>
              <span className="c">{g.items.length} แบบ</span>
              <span className="ln" />
            </div>
            <div className="pr-grid">
              {g.items.map((s) => (
                <div className="pc" key={s.sku_id}>
                  <div
                    className="pc-img"
                    style={s.image_url ? { backgroundImage: `url(${s.image_url})` } : undefined}
                  >
                    {!s.image_url && <span className="pc-ph">🎴</span>}
                  </div>
                  <div className="pc-meta">
                    <div className="pc-name">{s.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="pr-note">สินค้าบางรายการมีเฉพาะบางสาขา · แอดไลน์เช็คของก่อนได้</p>

        <footer className="pr-foot">
          <a className="pr-chip" href="https://lin.ee/9cMKVRm" target="_blank" rel="noopener noreferrer">
            <span className="pr-line">LINE</span> แอดรับแจ้งของใหม่ · @Divisionxcard
          </a>
          <div className="pr-cta">
            <a className="pr-chip" href="/branches">📍 ดูสาขาใกล้คุณ</a>
          </div>
        </footer>
      </div>
    </main>
  )
}
