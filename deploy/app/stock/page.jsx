import "../globals.css"
import { fetchPublic } from "../../lib/publicPageData"
import { buildStockView } from "../../lib/publicStock"
import StockBrowser from "./StockBrowser"

// หน้าสาธารณะ "เช็กของในตู้" — คนที่กดลิงก์มาจากคอมเมนต์โพสต์ ดูได้ว่าใกล้สาขาไหน
// แล้วตู้นั้นเหลืออะไร กี่ซอง กี่กล่อง (เจ้าของขอ 16 ต.ค. 2026 · worklog 2026-10-16-public-stock-page)
//
// ⚠️ ตัวเลขคือยอด ณ เวลาซิงก์ของแต่ละตู้ (กลางคืน ~00:10 + ที่กดซิงก์ระหว่างวัน) ไม่ใช่สดตอนนี้
//    ห้ามเขียน "เรียลไทม์" ในหน้า — ทุกสาขาโชว์เวลาอัปเดตของตัวเองไว้แทน
// ⚠️ หน้านี้ดึงด้วย service key ฝั่งเซิร์ฟเวอร์ (เหมือน /branches /products) แล้วส่งให้ client component
//    เฉพาะที่ผ่าน lib/publicStock.buildStockView — ไม่มีราคา/ต้นทุน/ชื่อดิบจากหลังบ้านตู้หลุดออกไป
export const metadata = {
  title: "เช็กของในตู้ก่อนไป — DivisionX Card",
  description:
    "ดูว่าตู้ DivisionX Card แต่ละสาขามีการ์ดอะไรเหลือ กี่ซอง กี่กล่อง · One Piece · Pokémon · " +
    "Dragon Ball และอีกหลายค่าย · กดหาสาขาใกล้คุณได้",
  openGraph: {
    title: "เช็กของในตู้ก่อนไป — DivisionX Card",
    description: "ดูว่าตู้แต่ละสาขามีการ์ดอะไรเหลือ กี่ซอง กี่กล่อง · กดหาสาขาใกล้คุณได้",
    type: "website",
    locale: "th_TH",
  },
}

// refetch ทุก 60 วินาที (ISR) — ซิงก์ตู้เสร็จแล้วหน้าเปลี่ยนเองภายใน ~1 นาที
export const revalidate = 60

// ⚠️ PostgREST ตัดที่ 1,000 แถวต่อครั้งแบบเงียบ ๆ (ดู skill dvx-db) — ตอนนี้ ~735 ช่อง
//    เพิ่มตู้อีกไม่กี่ตู้ก็เกิน จึงไล่หน้าไว้ก่อน · เรียงตายตัวให้แต่ละหน้าไม่ซ้ำ/ไม่ตกหล่น
async function fetchAllPages(path, label) {
  const PAGE = 1000
  const out = []
  for (let offset = 0; offset < 20 * PAGE; offset += PAGE) {
    const rows = await fetchPublic(`${path}&limit=${PAGE}&offset=${offset}`, label)
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

async function getView() {
  const [machines, stockRows, skuRows] = await Promise.all([
    fetchPublic("machines?status=eq.active&select=machine_id,config", "stock-machines"),
    // ⚠️ select เฉพาะคอลัมน์ที่ใช้ — ห้ามดึง product_name (ชื่อดิบหลังบ้านตู้) / sell_price
    fetchAllPages(
      "machine_stock?select=machine_id,sku_id,unit,remain,is_occupied,synced_at" +
      "&order=machine_id.asc,slot_number.asc,id.asc", "stock-slots"),
    // ⚠️ ห้ามเพิ่ม cost_price / avg_cost / sell_price — RLS กันระดับแถว ไม่ใช่ระดับคอลัมน์ หน้านี้เป็นสาธารณะ
    fetchPublic("skus?select=sku_id,name,franchise,set_code,image_url,image_url_box", "stock-skus"),
  ])
  const { unknownSkus, ...view } = buildStockView({
    machines, stockRows, skuRows,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    now: Date.now(),
  })
  if (unknownSkus.length) {
    console.warn(`[stock] ⚠️ sku_id ในตู้ที่ไม่มีในตาราง skus (ไม่แสดง): ${unknownSkus.join(", ")}`)
  }
  return view
}

const CSS = `
/* ══ พื้นหลังหน้า — ชุดเดียวกับ /branches (ขาว + แสงฟ้าด้านบน + จุดไข่ปลา 12%) ══
   ⚠️ ตัวหนังสือที่วางบนพื้นนี้ตรง ๆ ใช้ #3E4C66 — วัดกรณีแย่สุด (แสงฟ้าเข้มสุด + ทับจุดพอดี) ได้ 5.52:1
      #55647E ของ /branches ใช้ได้แค่ท้ายหน้า (4.66:1) ถ้าอยู่ใต้แสงฟ้าเหลือ 3.82:1 ตกเกณฑ์ 4.5:1 */
.sk-page{min-height:100vh;color:var(--dx-text);font-family:var(--dx-font);
  background-color:#FFFFFF;
  background-image:
    radial-gradient(1200px 500px at 50% -60px, rgba(0,168,222,.20), rgba(0,168,222,0) 70%),
    radial-gradient(circle at 1px 1px, rgba(10,22,40,.12) 1px, transparent 0);
  background-size:100% 100%, 24px 24px;
  background-repeat:no-repeat, repeat;}
.sk-wrap{max-width:760px;margin:0 auto;padding:20px 16px 56px;}
/* ช่องค้นหามีวงแสงตอนโฟกัสของตัวเองแล้ว (ด้านล่าง) — ไม่ใส่ outline ซ้อนอีกชั้น */
.sk-page :is(button,a,summary):focus-visible{outline:2px solid var(--dx-cyan);outline-offset:2px;}

/* ══ หัวหน้า (กรมท่า) — ไม่ใช้รูป: ลูกค้าเปิดจากเน็ตมือถือในห้าง ══
   คอนทราสต์ (วัดบนจุดที่แสงฟ้าสว่างสุด): ขาว 9.34 · ฟ้า #00D4FF 5.28 · #CFE3F7 7.11 · #B8C5E0 5.38 */
.sk-hero{position:relative;border-radius:20px;padding:22px 18px 18px;margin-bottom:14px;
  background:radial-gradient(120% 130% at 50% -20%, rgba(0,212,255,.18), rgba(0,212,255,0) 60%), var(--dx-bg-surface);
  border:1px solid var(--dx-border-strong);}
.sk-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:0 0 20px 20px;
  background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.7;}
.sk-kicker{display:flex;align-items:center;gap:7px;color:#CFE3F7;font-size:12px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;}
.sk-kicker svg{color:var(--dx-cyan);filter:drop-shadow(0 0 6px rgba(0,212,255,.6));}
/* ตัวไทยไม่ถ่างตัวอักษร — ถ่างแล้วสระ/วรรณยุกต์ดูหลุดจากตัวพยัญชนะ */
.sk-kicker-th{letter-spacing:0;font-weight:600;}
.sk-title{font-size:clamp(25px,6.6vw,34px);font-weight:800;letter-spacing:-.3px;line-height:1.35;margin:8px 0 0;}
.sk-title b{color:var(--dx-cyan);text-shadow:0 0 18px rgba(0,212,255,.35);}
.sk-sub{color:var(--dx-text-2);font-size:14.5px;line-height:1.55;margin:4px 0 0;}

.sk-tools{display:grid;gap:10px;margin-top:16px;}
@media(min-width:600px){.sk-tools{grid-template-columns:1fr auto;}}
.sk-search{position:relative;margin:0;}
/* ตัวอักษร 16px — ต่ำกว่านี้ Safari บน iPhone ซูมหน้าเองตอนแตะช่อง */
.sk-search input{display:block;width:100%;height:50px;border-radius:12px;border:1px solid var(--dx-border-strong);
  background:var(--dx-bg-input);color:#fff;font-family:inherit;font-size:16px;padding:0 46px 0 42px;
  -webkit-appearance:none;appearance:none;outline:none;transition:border-color .15s, box-shadow .15s;}
.sk-search input::placeholder{color:#9FB0CE;opacity:1;}
.sk-search input:focus{border-color:var(--dx-cyan);box-shadow:0 0 0 3px rgba(0,212,255,.22);}
.sk-search input::-webkit-search-cancel-button,
.sk-search input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;display:none;}
.sk-search-ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--dx-cyan-soft);pointer-events:none;}
.sk-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:10px;
  display:flex;align-items:center;justify-content:center;background:transparent;border:0;cursor:pointer;
  color:#DCE6F5;font-size:24px;line-height:1;}
.sk-clear:hover{background:rgba(255,255,255,.08);}
.sk-near{height:50px;border-radius:12px;border:0;background:var(--dx-cyan);color:#02263a;font-family:inherit;
  font-size:15px;font-weight:700;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  white-space:nowrap;cursor:pointer;transition:background .15s, box-shadow .15s;}
.sk-near:hover{background:var(--dx-cyan-bright);box-shadow:0 0 18px var(--dx-glow);}
.sk-near:disabled{cursor:progress;opacity:.85;}
.sk-geo{margin:10px 2px 0;font-size:12.5px;line-height:1.55;color:var(--dx-text-2);}
.sk-geo.is-warn{color:#FFD98A;}
.sk-link{background:none;border:0;padding:0;font:inherit;color:var(--dx-cyan-soft);text-decoration:underline;
  text-underline-offset:3px;cursor:pointer;}

/* ══ ข้อความบนพื้นขาว ══ */
.sk-sum{color:#3E4C66;font-size:13.5px;font-weight:600;line-height:1.5;margin:2px 4px 12px;min-height:1.5em;}
.sk-alert{background:#FFF6E0;border:1px solid #F2D58A;color:#5C4400;border-radius:12px;padding:10px 14px;
  font-size:13.5px;line-height:1.5;margin:0 0 12px;}
.sk-empty{background:var(--dx-bg-card);border:1px solid var(--dx-border);border-radius:16px;padding:22px 16px;
  text-align:center;color:var(--dx-text-2);font-size:14px;line-height:1.75;margin:0;}

/* ══ การ์ดสาขา — โครงเดียวกับ /branches (กรมท่า + แถบฟ้าซ้าย + ชิปชั้นสีแดงอ่อน) ══
   คอนทราสต์บนพื้นการ์ด #1A2F52: ขาว 13.4 · #B8C5E0 7.70 · ฟ้า 7.54 · ชั้น #FF8DA1 5.24 · "อาจยังไม่อัปเดต" 7.98
   ⚠️ ไม่ใช้ --dx-text-muted (#7A8BA8) บนการ์ด — ได้แค่ 3.87:1 */
.sk-list{display:grid;gap:12px;}
.sk-card{position:relative;background:var(--dx-bg-card);border:1px solid var(--dx-border);border-radius:16px;
  scroll-margin-top:12px;transition:border-color .15s;}
.sk-card.is-open{border-color:var(--dx-border-strong);}
.sk-head{position:relative;}
.sk-head::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:4px;
  background:linear-gradient(180deg,var(--dx-cyan),var(--dx-cyan-dim));box-shadow:0 0 12px var(--dx-glow);}
.sk-top{padding:16px 16px 0 20px;cursor:pointer;}
.sk-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.sk-name{font-size:17px;font-weight:700;line-height:1.4;margin:0;}
.sk-floor{flex:none;background:rgba(255,90,120,.14);color:#FF8DA1;border:1px solid rgba(255,90,120,.42);
  font-size:12px;font-weight:700;padding:3px 11px;border-radius:999px;white-space:nowrap;margin-top:1px;}
.sk-hint{color:var(--dx-text-2);font-size:13px;line-height:1.5;margin-top:4px;}
.sk-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:8px;font-size:12.5px;
  line-height:1.5;color:var(--dx-text-2);}
.sk-dist{background:var(--dx-cyan-soft);color:#02263a;font-weight:700;border-radius:999px;padding:2px 10px;}
.sk-stale{display:inline-block;margin-top:8px;font-size:12px;line-height:1.5;color:#FFD98A;
  background:rgba(255,200,87,.10);border:1px solid rgba(255,200,87,.28);border-radius:8px;padding:2px 9px;}
.sk-bar{display:flex;gap:8px;padding:12px 16px 16px 20px;}
.sk-toggle{flex:1;min-width:0;min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:10px;
  border-radius:12px;background:var(--dx-bg-elevated);border:1px solid var(--dx-border-strong);color:#fff;
  font-family:inherit;font-size:14.5px;font-weight:700;line-height:1.4;text-align:left;padding:8px 14px;cursor:pointer;
  transition:border-color .15s, box-shadow .15s;}
.sk-toggle:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
.sk-toggle:disabled{cursor:default;color:var(--dx-text-2);font-weight:600;}
.sk-toggle:disabled:hover{border-color:var(--dx-border-strong);box-shadow:none;}
.sk-more{flex:none;color:var(--dx-cyan);font-size:13px;}
.sk-map{flex:none;min-height:46px;display:inline-flex;align-items:center;gap:6px;border-radius:12px;
  border:1px solid rgba(0,212,255,.45);color:var(--dx-cyan);font-size:14px;font-weight:700;padding:8px 13px;
  text-decoration:none;white-space:nowrap;transition:background .15s, box-shadow .15s;}
.sk-map:hover{background:rgba(0,212,255,.08);box-shadow:0 0 14px var(--dx-glow-soft);}

/* ══ รายการสินค้าในตู้ (กางแล้ว) — พื้น surface #132947: #B8C5E0 8.43 · #A9B8D3 7.30 · ฟ้า 8.26 ══ */
.sk-panel{border-top:1px solid var(--dx-border-strong);background:var(--dx-bg-surface);border-radius:0 0 15px 15px;
  padding:4px 12px 12px;}
.sk-panel[hidden]{display:none;}
.sk-grp{margin-top:8px;}
.sk-grp-h{display:flex;align-items:center;gap:8px;margin:0;padding:8px 4px 6px;font-size:13.5px;font-weight:700;color:#DCE6F5;}
.sk-grp-c{margin-left:auto;font-size:12px;font-weight:600;color:var(--dx-text-2);}
.sk-items{list-style:none;margin:0;padding:0;}
.sk-item{display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:10px;padding:7px 4px;
  border-top:1px solid rgba(255,255,255,.06);}
.sk-th{width:48px;height:48px;border-radius:10px;background:#0C1D3A;object-fit:contain;display:block;}
.sk-th-ph{display:flex;align-items:center;justify-content:center;font-size:22px;}
.sk-iname{font-size:14px;line-height:1.45;color:#fff;overflow-wrap:anywhere;}
.sk-boxtag{display:inline-block;padding:0 7px;border-radius:6px;background:#9FDFFF;color:#02263a;
  font-size:11px;font-weight:700;line-height:1.6;vertical-align:1px;white-space:nowrap;}
.sk-qty{white-space:nowrap;text-align:right;font-size:13px;color:var(--dx-text-2);}
.sk-qty b{font-size:18px;font-weight:800;color:var(--dx-cyan);font-variant-numeric:tabular-nums;}
.sk-out{margin-top:10px;border-top:1px solid var(--dx-border-strong);padding-top:2px;}
.sk-out summary{cursor:pointer;padding:9px 4px;font-size:13px;font-weight:600;color:var(--dx-text-2);}
.sk-out-h{padding:9px 4px;font-size:13px;font-weight:600;color:var(--dx-text-2);}
.sk-oitems{list-style:none;margin:0;padding:0 0 4px;}
.sk-oitems li{display:flex;justify-content:space-between;gap:12px;padding:6px 4px;font-size:13px;line-height:1.45;
  color:#A9B8D3;border-top:1px solid rgba(255,255,255,.05);}
.sk-otag{flex:none;font-size:12px;}
.sk-collapse{display:block;width:100%;margin-top:12px;min-height:42px;border-radius:10px;background:transparent;
  border:1px dashed var(--dx-border-strong);color:var(--dx-cyan-soft);font-family:inherit;font-size:13.5px;
  font-weight:600;cursor:pointer;}
.sk-collapse:hover{border-color:var(--dx-border-glow);}

/* ลิงก์ตรง /stock#machine_id — การ์ดเรืองแสงครู่หนึ่งให้รู้ว่าคือสาขาที่ส่งมา */
.sk-flash{animation:sk-flash 2.8s ease-out 1;}
@keyframes sk-flash{
  0%,40%{border-color:var(--dx-cyan);box-shadow:0 0 0 2px rgba(0,212,255,.55),0 0 26px var(--dx-glow);}
  100%{box-shadow:0 0 0 0 rgba(0,212,255,0);}}
@media (prefers-reduced-motion:reduce){.sk-flash{animation:none;border-color:var(--dx-cyan);}}

/* ══ ท้ายหน้า — แบบเดียวกับ /branches ══ */
.sk-note{color:#3E4C66;font-size:12.5px;line-height:1.7;text-align:center;margin:22px 6px 0;}
.sk-foot{text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--dx-border);}
.sk-contact{display:inline-flex;flex-wrap:wrap;gap:10px 14px;justify-content:center;align-items:center;
  font-size:14px;font-weight:600;}
.sk-chip{display:inline-flex;align-items:center;gap:7px;background:var(--dx-bg-surface);
  border:1px solid var(--dx-border-strong);border-radius:999px;padding:8px 15px;color:var(--dx-text);
  text-decoration:none;transition:border-color .15s, box-shadow .15s;}
.sk-chip:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
.sk-line{background:#06C755;color:#fff;border-radius:6px;font-size:11px;font-weight:800;padding:2px 7px;}
.sk-tag{color:#3E4C66;font-size:12px;margin-top:14px;}
`

export default async function StockPage() {
  const view = await getView()
  return (
    // พื้นขาวแบบ /branches — การ์ด/หัวหน้า/ชิปยังเป็นกรมท่าของแบรนด์ (มีพื้นของตัวเอง)
    <main className="sk-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sk-wrap">
        <StockBrowser view={view}>
          <div className="sk-kicker">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" fill="currentColor" />
            </svg>
            DivisionX Card <span className="sk-kicker-th">· ตู้กดการ์ดเกม</span>
          </div>
          <h1 className="sk-title">เช็กของในตู้<b>ก่อนไป</b></h1>
          <p className="sk-sub">ดูว่าสาขาใกล้คุณมีการ์ดอะไรเหลือ กี่ซอง กี่กล่อง</p>
        </StockBrowser>

        <p className="sk-note">
          ตัวเลขคือยอด ณ เวลาอัปเดตของแต่ละสาขา หลังจากนั้นอาจมีคนซื้อไปแล้ว<br />
          อยากเช็กให้ชัวร์ก่อนเดินทาง ทักไลน์ถามได้เลย
        </p>

        <footer className="sk-foot">
          <div className="sk-contact">
            <a className="sk-chip" href="https://lin.ee/9cMKVRm" target="_blank" rel="noopener noreferrer">
              <span className="sk-line">LINE</span> @divisionxcard
            </a>
            <a className="sk-chip" href="tel:0930737930">📞 093-073-7930</a>
          </div>
          <div className="sk-tag">DivisionX Card · ตู้กดการ์ดเกมอัตโนมัติ · <a href="/privacy" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>นโยบายความเป็นส่วนตัว</a></div>
        </footer>
      </div>
    </main>
  )
}
