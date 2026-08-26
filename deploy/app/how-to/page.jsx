import "../globals.css"
import { branchCount } from "../../lib/publicPageData"

export const metadata = {
  title: "วิธีการซื้อ — DivisionX Card",
  description: "วิธีกดตู้ DivisionX Card ง่ายๆ 4 ขั้นตอน · ตู้กดการ์ดเกมอัตโนมัติในห้าง",
}

const VIDEO_URL = "https://xethnqqmpvlpmafvphky.supabase.co/storage/v1/object/public/marketing/how-to-buy.mp4"

const STEPS = [
  { ic: "🃏", title: "เลือกการ์ด", desc: "แตะหน้าจอ เลื่อนเลือกชุด/การ์ดที่ต้องการ — ดูรูปและราคาได้ที่หน้าจอ" },
  { ic: "🛒", title: "ยืนยันรายการ", desc: "เลือกจำนวนซอง/กล่อง ตรวจสอบรายการให้ครบก่อนชำระเงิน" },
  { ic: "📱", title: "ชำระเงิน", desc: "สแกน QR พร้อมเพย์ หรือชำระตามวิธีที่หน้าจอแสดง รอระบบยืนยันการจ่าย" },
  { ic: "📦", title: "รับสินค้า", desc: "รอสินค้าหล่นที่ช่องรับด้านล่าง หยิบได้เลย — เปิดลุ้นการ์ดกันได้เลย!" },
]

// ⚠️ จำนวนสาขาต้องนับจากฐานข้อมูล ห้ามเขียนเลขตายตัว
//    เดิมค้างที่ "11 สาขา" ทั้งที่ของจริงเป็น 12 แล้ว และไม่ตรงกับหน้า /branches
const tips = (n) => [
  { ic: "⏰", t: "เปิดตามเวลาห้าง", d: `กดเองได้ ไม่ต้องต่อคิว${n ? ` ทั้ง ${n} สาขา` : ""}` },
  { ic: "✨", t: "ลุ้นการ์ดหายาก", d: "มีการ์ดระดับแรร์ซ่อนอยู่เพียบ ลุ้นได้ทุกซอง" },
  { ic: "💬", t: "มีปัญหา?", d: "ของไม่ออก/จ่ายเงินแล้วติดขัด ทักไลน์ @divisionxcard ได้เลย" },
]

// ดึงจำนวนสาขาใหม่ทุก 60 วินาที เหมือนหน้า /branches และ /products
export const revalidate = 60

export default async function HowToPage() {
  const TIPS = tips(await branchCount())
  return (
    <main style={{ minHeight: "100vh", background: "var(--dx-bg-page)", color: "var(--dx-text)", fontFamily: "var(--dx-font)" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .ht-wrap{max-width:760px;margin:0 auto;padding:28px 18px 60px;}
        .ht-hero{position:relative;text-align:center;padding:30px 16px 26px;border-radius:20px;overflow:hidden;
          background:radial-gradient(120% 130% at 50% -20%, rgba(0,212,255,.18), rgba(0,212,255,0) 60%), var(--dx-bg-surface);
          border:1px solid var(--dx-border-strong);margin-bottom:26px;}
        .ht-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;
          background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.7;}
        .ht-logo{height:52px;width:auto;margin-bottom:12px;filter:drop-shadow(0 0 14px var(--dx-glow));}
        .ht-title{font-size:clamp(24px,5vw,34px);font-weight:800;letter-spacing:-.5px;margin:0;}
        .ht-title b{color:var(--dx-cyan);}
        .ht-sub{color:var(--dx-cyan-soft);font-size:14px;margin-top:8px;font-weight:600;}
        .ht-steps{display:flex;flex-direction:column;gap:14px;}
        .ht-bottom{display:flex;flex-direction:column;align-items:center;gap:18px;margin-top:26px;}
        .ht-video{width:230px;max-width:78%;border-radius:18px;overflow:hidden;
          border:1px solid var(--dx-border-glow);box-shadow:0 0 28px var(--dx-glow-soft);background:#000;}
        .ht-video video{width:100%;display:block;aspect-ratio:9/16;background:#000;object-fit:cover;}
        .ht-vcap{text-align:center;color:var(--dx-text-muted);font-size:11.5px;padding:8px 6px;background:var(--dx-bg-surface);}
        .ht-tipswrap{width:100%;display:flex;flex-direction:column;}
        @media(min-width:600px){
          .ht-bottom{flex-direction:row;align-items:flex-start;}
          .ht-video{flex:0 0 42%;width:auto;max-width:300px;}
          .ht-tipswrap{flex:1;width:auto;}
        }
        .ht-step{position:relative;display:flex;gap:16px;align-items:flex-start;
          background:var(--dx-bg-card);border:1px solid var(--dx-border);border-radius:16px;padding:18px 18px 18px 16px;}
        .ht-step::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:4px;
          background:linear-gradient(180deg,var(--dx-cyan),var(--dx-cyan-dim));box-shadow:0 0 12px var(--dx-glow);}
        .ht-num{flex:none;width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;
          font-size:20px;font-weight:800;color:#02263a;background:var(--dx-cyan);box-shadow:0 0 16px var(--dx-glow);}
        .ht-body{flex:1;}
        .ht-h{font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px;}
        .ht-d{color:var(--dx-text-muted);font-size:13.5px;margin-top:6px;line-height:1.5;}
        .ht-sec{font-size:13px;color:var(--dx-cyan-soft);font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:12px;}
        .ht-tips{display:flex;flex-direction:column;gap:12px;flex:1;}
        .ht-tip{background:var(--dx-bg-surface);border:1px solid var(--dx-border);border-radius:14px;padding:16px;}
        .ht-tip .i{font-size:24px;}
        .ht-tip .tt{font-weight:700;font-size:14.5px;margin-top:8px;}
        .ht-tip .td{color:var(--dx-text-muted);font-size:12.5px;margin-top:5px;line-height:1.45;}
        .ht-cta{margin-top:30px;text-align:center;}
        .ht-btn{display:inline-flex;align-items:center;gap:8px;background:var(--dx-cyan);color:#02263a;font-weight:700;
          font-size:15px;text-decoration:none;padding:12px 22px;border-radius:12px;transition:background .15s, box-shadow .15s;}
        .ht-btn:hover{background:var(--dx-cyan-bright);box-shadow:0 0 18px var(--dx-glow);}
        .ht-foot{text-align:center;margin-top:34px;padding-top:22px;border-top:1px solid var(--dx-border);}
        .ht-chip{display:inline-flex;align-items:center;gap:7px;background:var(--dx-bg-surface);
          border:1px solid var(--dx-border-strong);border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600;margin:0 5px;}
        .ht-chip a{color:var(--dx-cyan-soft);text-decoration:none;}
        .ht-line{background:#06C755;color:#fff;border-radius:6px;font-size:11px;font-weight:800;padding:2px 7px;}
        a.ht-chip{text-decoration:none;color:var(--dx-text);transition:border-color .15s, box-shadow .15s;cursor:pointer;}
        a.ht-chip:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
      `}} />

      <div className="ht-wrap">
        <header className="ht-hero">
          <img className="ht-logo" src="/logo-white.png" alt="DivisionX Card" />
          <h1 className="ht-title">วิธีการ<b>ซื้อ</b></h1>
          <div className="ht-sub">กดตู้ง่ายๆ แค่ 4 ขั้นตอน · ไม่ต้องต่อคิว</div>
        </header>

        <div className="ht-steps">
          {STEPS.map((s, i) => (
            <div className="ht-step" key={i}>
              <div className="ht-num">{i + 1}</div>
              <div className="ht-body">
                <div className="ht-h"><span>{s.ic}</span>{s.title}</div>
                <div className="ht-d">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="ht-bottom">
          <div className="ht-video">
            <video src={VIDEO_URL} autoPlay muted loop playsInline controls preload="metadata" />
            <div className="ht-vcap">▶ คลิปวิธีกดตู้ · 15 วิ</div>
          </div>
          <div className="ht-tipswrap">
            <div className="ht-sec">เกร็ดน่ารู้</div>
            <div className="ht-tips">
              {TIPS.map((t, i) => (
                <div className="ht-tip" key={i}>
                  <div className="i">{t.ic}</div>
                  <div className="tt">{t.t}</div>
                  <div className="td">{t.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ht-cta">
          <a className="ht-btn" href="/branches">📍 ดูสาขาใกล้คุณ</a>
        </div>

        <footer className="ht-foot">
          <a className="ht-chip" href="https://lin.ee/9cMKVRm" target="_blank" rel="noopener noreferrer"><span className="ht-line">LINE</span> @divisionxcard</a>
          <span className="ht-chip">📞 <a href="tel:0863863219">086-386-3219</a></span>
        </footer>
      </div>
    </main>
  )
}
