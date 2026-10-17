import "../globals.css"

// หน้าข้อกำหนดการใช้งาน (สาธารณะ · 17 ต.ค. 2026)
//
// ทำไมต้องมี: ช่อง "Terms of Service URL" ในหน้าตั้งค่าแอป Meta "DivisionX Card" เดิมใส่หน้าแรกของ facebook.com
//   ไว้เฉย ๆ (ไม่ใช่ข้อกำหนดของเรา) · เอกสาร Basic Settings ของ Meta นับช่องนี้เป็นช่องบังคับก่อนเผยแพร่แอปเป็น Live
//   → ใส่ https://division-x-card.vercel.app/terms · คู่หน้า /privacy · ขั้นตอนอยู่ที่ wiki/marketing/auto-posting-level3-setup.md (ขั้น 8)
//   ⚠️ อย่าเปลี่ยน path /terms — ลิงก์ถูกบันทึกไว้ในหน้าตั้งค่าแอปของ Meta (ลิงก์เสีย = ผิดนโยบาย Meta)
//
// ⚠️ เขียนเฉพาะข้อเท็จจริงกับเงื่อนไขทั่วไป — ห้ามเติมนโยบายที่เจ้าของยังไม่ได้ตัดสิน
//    (เงื่อนไขคืนเงิน · การรับประกันการ์ดในซอง · ค่าเสียหาย ฯลฯ) ถ้าจะเพิ่มต้องถามเจ้าของก่อน
// ⚠️ เบอร์ร้านคือ 093-073-7930 เท่านั้น · ไลน์ @divisionxcard เป็นช่องทางสอบถาม/แจ้งปัญหา ไม่ใช่ช่องส่งข่าว
export const metadata = {
  title: "ข้อกำหนดการใช้งาน — DivisionX Card",
  description:
    "เงื่อนไขการใช้เว็บไซต์ ตู้กดการ์ด และเพจ Facebook ของ DivisionX Card · Terms of use",
  openGraph: {
    title: "ข้อกำหนดการใช้งาน — DivisionX Card",
    description: "เงื่อนไขการใช้เว็บไซต์ ตู้กดการ์ด และเพจ Facebook · Terms of use",
    type: "website",
    locale: "th_TH",
  },
}

const EFFECTIVE_TH = "17 ต.ค. 2569"
const EFFECTIVE_EN = "17 Oct 2026"
const LINE_URL = "https://lin.ee/9cMKVRm"
const FB_PAGE_URL = "https://www.facebook.com/DivisionXCard"

// หน้าตาชุดเดียวกับ /privacy (ขาว + แสงฟ้า + จุดไข่ปลา · การ์ดกรมท่า) ตัดเหลือเท่าที่หน้านี้ใช้
// คอนทราสต์: หัวข้อบนพื้นขาว #0A1628 · บนการ์ด ขาว 13.4 · --dx-text-2 7.70 · ฟ้า 7.54
const CSS = `
.tm-page{min-height:100vh;color:var(--dx-text);font-family:var(--dx-font);background-color:#FFFFFF;
  background-image:radial-gradient(1200px 500px at 50% -60px, rgba(0,168,222,.20), rgba(0,168,222,0) 70%),
    radial-gradient(circle at 1px 1px, rgba(10,22,40,.12) 1px, transparent 0);
  background-size:100% 100%, 24px 24px;background-repeat:no-repeat, repeat;}
.tm-wrap{max-width:760px;margin:0 auto;padding:20px 16px 56px;overflow-wrap:break-word;}
.tm-page a:focus-visible{outline:2px solid var(--dx-cyan);outline-offset:2px;border-radius:6px;}
.tm-page section{scroll-margin-top:12px;}
.tm-hero{position:relative;border-radius:20px;padding:22px 18px 20px;
  background:radial-gradient(120% 130% at 50% -20%, rgba(0,212,255,.18), rgba(0,212,255,0) 60%), var(--dx-bg-surface);
  border:1px solid var(--dx-border-strong);}
.tm-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:0 0 20px 20px;
  background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.7;}
.tm-kicker{display:flex;align-items:center;gap:7px;color:#CFE3F7;font-size:12px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;}
.tm-kicker svg{color:var(--dx-cyan);filter:drop-shadow(0 0 6px rgba(0,212,255,.6));}
.tm-title{font-size:clamp(25px,6.6vw,34px);font-weight:800;letter-spacing:-.3px;line-height:1.35;margin:8px 0 0;}
.tm-title b{color:var(--dx-cyan);font-weight:800;text-shadow:0 0 18px rgba(0,212,255,.35);}
.tm-sub{color:var(--dx-text-2);font-size:14.5px;line-height:1.65;margin:6px 0 0;}
.tm-date{display:inline-block;margin:12px 0 0;font-size:12.5px;font-weight:600;line-height:1.5;color:#CFE3F7;
  background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.28);border-radius:8px;padding:3px 10px;}
.tm-jump{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;}
.tm-jump a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;font-size:14px;
  font-weight:700;background:var(--dx-bg-elevated);border:1px solid var(--dx-border-strong);color:#fff;
  text-decoration:none;transition:border-color .15s, box-shadow .15s;}
.tm-jump a:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
.tm-h2{display:flex;align-items:center;gap:10px;margin:30px 2px 12px;font-size:19px;font-weight:800;line-height:1.4;
  color:#0A1628;}
.tm-n{flex:none;width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;
  background:var(--dx-bg-surface);color:var(--dx-cyan);font-size:15px;font-weight:800;}
.tm-card{position:relative;background:var(--dx-bg-card);border:1px solid var(--dx-border);border-radius:16px;
  padding:16px 16px 16px 20px;}
.tm-card::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:4px;
  background:linear-gradient(180deg,var(--dx-cyan),var(--dx-cyan-dim));box-shadow:0 0 12px var(--dx-glow);}
.tm-h3{margin:16px 0 0;font-size:16px;font-weight:700;line-height:1.5;color:#fff;}
.tm-card > .tm-h3:first-child{margin-top:0;}
.tm-p{margin:8px 0 0;color:var(--dx-text-2);font-size:14.5px;line-height:1.75;}
.tm-card > .tm-p:first-child,.tm-card > .tm-ul:first-child{margin-top:0;}
.tm-h3 + .tm-p{margin-top:4px;}
.tm-card b{color:#fff;font-weight:700;}
.tm-card a{color:var(--dx-cyan);text-decoration:underline;text-underline-offset:3px;}
.tm-ul{list-style:none;margin:8px 0 0;padding:0;}
.tm-ul li{position:relative;padding-left:18px;color:var(--dx-text-2);font-size:14.5px;line-height:1.75;}
.tm-ul li + li{margin-top:6px;}
.tm-ul li::before{content:"";position:absolute;left:3px;top:.72em;width:6px;height:6px;border-radius:50%;
  background:var(--dx-cyan);box-shadow:0 0 8px var(--dx-glow);}
.tm-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
.tm-chip{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 15px;border-radius:999px;
  background:var(--dx-bg-surface);border:1px solid var(--dx-border-strong);color:var(--dx-text);font-size:14px;
  font-weight:600;text-decoration:none;transition:border-color .15s, box-shadow .15s;}
.tm-card a.tm-chip{color:var(--dx-text);text-decoration:none;}
.tm-chip:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
.tm-line{background:#06C755;color:#fff;border-radius:6px;font-size:11px;font-weight:800;padding:2px 7px;}
.tm-foot{text-align:center;margin-top:34px;padding-top:22px;border-top:1px solid var(--dx-border);}
.tm-foot-h{margin:0 0 12px;color:#0A1628;font-size:14.5px;font-weight:700;}
.tm-contact{display:inline-flex;flex-wrap:wrap;gap:10px 14px;justify-content:center;align-items:center;}
.tm-tag{color:#3E4C66;font-size:12px;margin-top:14px;}
.tm-tag a{color:inherit;text-decoration:underline;text-underline-offset:3px;}
.tm-nw{white-space:nowrap;}
`

function ContactChips() {
  return (
    <>
      <a className="tm-chip" href={LINE_URL} target="_blank" rel="noopener noreferrer">
        <span className="tm-line">LINE</span> @divisionxcard
      </a>
      <a className="tm-chip" href="tel:0930737930">📞 093-073-7930</a>
    </>
  )
}

function H2({ id, n, children }) {
  return (
    <h2 className="tm-h2" id={id}>
      {n ? <span className="tm-n" aria-hidden="true">{n}</span> : null}
      <span>{children}</span>
    </h2>
  )
}

export default function TermsPage() {
  return (
    <main className="tm-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="tm-wrap">
        <header className="tm-hero">
          <div className="tm-kicker">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" fill="currentColor" />
            </svg>
            DivisionX Card · Terms of Use
          </div>
          <h1 className="tm-title">ข้อกำหนด<b>การใช้งาน</b></h1>
          <p className="tm-sub">เงื่อนไขการใช้เว็บไซต์ ตู้กดการ์ด และเพจ Facebook ของ DivisionX Card</p>
          <p className="tm-date">มีผลตั้งแต่ {EFFECTIVE_TH} · <span lang="en">Effective {EFFECTIVE_EN}</span></p>
          <nav className="tm-jump" aria-label="ไปที่หัวข้อ">
            <a href="#buying">ซื้อจากตู้ / แจ้งปัญหา</a>
            <a href="#english" lang="en">English</a>
            <a href="/privacy">นโยบายความเป็นส่วนตัว</a>
          </nav>
        </header>

        <section id="scope" aria-labelledby="scope-h">
          <H2 id="scope-h" n="1">ข้อกำหนดนี้ใช้กับอะไร</H2>
          <div className="tm-card">
            <p className="tm-p">
              <b>DivisionX Card</b> (“เรา”) ให้บริการตู้กดการ์ดเกมอัตโนมัติในห้างสรรพสินค้าในประเทศไทย
              ข้อกำหนดนี้ใช้กับ
            </p>
            <ul className="tm-ul">
              <li>เว็บไซต์ <b className="tm-nw">division-x-card.vercel.app</b> — หน้าสาขา เช็กของในตู้ วิธีการซื้อ และสินค้า</li>
              <li>การซื้อสินค้าจากตู้ของเรา</li>
              <li>
                เพจ Facebook <a href={FB_PAGE_URL} target="_blank" rel="noopener noreferrer">Division X Card</a>{" "}
                และแอป <b>DivisionX Card</b> บน Meta
              </li>
            </ul>
            <p className="tm-p">เมื่อใช้เว็บไซต์หรือซื้อสินค้าจากตู้ ถือว่าคุณรับทราบข้อกำหนดนี้</p>
          </div>
        </section>

        <section id="website" aria-labelledby="website-h">
          <H2 id="website-h" n="2">ข้อมูลบนเว็บไซต์</H2>
          <div className="tm-card">
            <ul className="tm-ul">
              <li>ใช้ได้ฟรี ไม่ต้องสมัครสมาชิก</li>
              <li>
                จำนวนสินค้าในตู้เป็นยอด ณ เวลาที่ระบบอัปเดตล่าสุด ซึ่งแสดงไว้ในแต่ละสาขา ไม่ใช่ยอด ณ ขณะนี้
                — ของอาจหมดก่อนคุณไปถึง
              </li>
              <li>
                เว็บไซต์ไม่ได้แสดงราคาขาย สินค้าและราคาที่ซื้อได้จริงดูที่หน้าจอตู้ ณ เวลาที่ซื้อ
                · ราคาการ์ดที่พูดถึงในโพสต์ของเพจ (เช่น ราคาตลาด) เป็นข้อมูลอ้างอิงจากแหล่งภายนอก ไม่ใช่ราคาขายของเรา
              </li>
              <li>เวลาให้บริการเป็นไปตามเวลาเปิด–ปิดของห้างแต่ละแห่ง</li>
              <li>เราพยายามให้ข้อมูลถูกต้องและเป็นปัจจุบัน แต่อาจคลาดเคลื่อนได้ ถ้าเจอข้อมูลผิด แจ้งเราได้</li>
            </ul>
          </div>
        </section>

        <section id="buying" aria-labelledby="buying-h">
          <H2 id="buying-h" n="3">การซื้อสินค้าจากตู้</H2>
          <div className="tm-card">
            <ul className="tm-ul">
              <li>
                เลือกสินค้าและชำระเงินที่หน้าจอตู้ การชำระเงินดำเนินการผ่านผู้ให้บริการระบบตู้และผู้ให้บริการรับชำระเงิน
              </li>
              <li>ก่อนยืนยันการชำระ ตรวจสินค้าและยอดเงินบนหน้าจอให้ถูกต้อง</li>
              <li>
                ถ้าชำระเงินแล้วสินค้าไม่ออก ออกไม่ครบ หรือได้สินค้าไม่ตรงกับที่เลือก ติดต่อเราทางไลน์หรือโทร
                พร้อมแจ้งวัน เวลา สาขา และหลักฐานการชำระเงิน (เช่น สลิป) เราจะตรวจสอบกับระบบตู้และช่วยแก้ไข
              </li>
            </ul>
            <div className="tm-acts"><ContactChips /></div>
          </div>
        </section>

        <section id="ip" aria-labelledby="ip-h">
          <H2 id="ip-h" n="4">การ์ด ภาพ และเครื่องหมายการค้า</H2>
          <div className="tm-card">
            <ul className="tm-ul">
              <li>
                ชื่อเกม ตัวละคร ภาพการ์ด และภาพบรรจุภัณฑ์ เป็นลิขสิทธิ์และเครื่องหมายการค้าของเจ้าของแต่ละราย
                เราใช้เพื่อแสดงสินค้าที่วางขายในตู้
              </li>
              <li>ชื่อและโลโก้ DivisionX Card เป็นของเรา ห้ามนำไปใช้ในทางที่ทำให้เข้าใจผิดว่าเป็นเรา</li>
            </ul>
          </div>
        </section>

        <section id="facebook" aria-labelledby="facebook-h">
          <H2 id="facebook-h" n="5">เพจ Facebook และแอป DivisionX Card</H2>
          <div className="tm-card">
            <ul className="tm-ul">
              <li>
                แอป <b>DivisionX Card</b> บน Meta เป็นเครื่องมือภายในที่ทีมงานของเราใช้โพสต์และดูสถิติของเพจ
                Division X Card เท่านั้น ไม่ได้เปิดให้บุคคลทั่วไปเชื่อมต่อบัญชีหรือใช้งาน
              </li>
              <li>
                การคอมเมนต์และส่งข้อความบนเพจเป็นไปตามข้อกำหนดของ Facebook
                เราอาจซ่อนหรือลบความคิดเห็นที่เป็นสแปมหรือหลอกลวง
              </li>
            </ul>
          </div>
        </section>

        <section id="other" aria-labelledby="other-h">
          <H2 id="other-h" n="6">เรื่องอื่น&nbsp;ๆ</H2>
          <div className="tm-card">
            <h3 className="tm-h3">ลิงก์ไปบริการอื่น</h3>
            <p className="tm-p">
              เมื่อกดลิงก์ไป Google Maps, LINE หรือ Facebook การใช้บริการเหล่านั้นเป็นไปตามข้อกำหนดและนโยบาย
              ของผู้ให้บริการแต่ละราย
            </p>
            <h3 className="tm-h3">ข้อมูลส่วนบุคคล</h3>
            <p className="tm-p">
              ดู<a href="/privacy">นโยบายความเป็นส่วนตัว</a> ว่าเราได้ข้อมูลอะไร ใช้ทำอะไร และขอลบได้อย่างไร
            </p>
            <h3 className="tm-h3">การเปลี่ยนแปลง</h3>
            <p className="tm-p">ถ้าเราปรับข้อกำหนดนี้ จะแก้ไขหน้านี้และวันที่มีผล<span className="tm-nw">ด้านบน</span></p>
            <h3 className="tm-h3">กฎหมายที่ใช้</h3>
            <p className="tm-p">ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย</p>
          </div>
        </section>

        <section id="english" aria-labelledby="english-h" lang="en">
          <H2 id="english-h">English summary</H2>
          <div className="tm-card">
            <p className="tm-p">
              DivisionX Card runs automated trading-card vending machines in shopping malls in Thailand. These terms
              cover our website (<span className="tm-nw">division-x-card.vercel.app</span>), purchases at our machines,
              our Facebook Page “Division X Card” and our Meta app “DivisionX Card”. By using the website or buying
              from our machines you acknowledge these terms. Effective {EFFECTIVE_EN}.
            </p>
            <ul className="tm-ul">
              <li>
                <b>Website:</b> free, no sign-up. Stock counts are as of each branch’s last update shown on the page,
                not live. The website shows no selling prices; the product and price on the machine screen at the time
                of purchase apply. Card prices mentioned in our Page posts (such as market prices) are reference
                figures from outside sources, not our selling prices. Opening hours follow each mall.
              </li>
              <li>
                <b>Buying:</b> you choose and pay on the machine screen; payment is processed by the machine-system and
                payment providers. If you paid but the product did not come out, came out short or was not the item you
                chose, contact
                us on LINE @divisionxcard or call <span className="tm-nw">093-073-7930</span>{" "}
                (<span className="tm-nw">+66 93 073 7930</span>) with the date, time, branch and proof of payment, and
                we will check with the machine system and help.
              </li>
              <li>
                <b>Trademarks:</b> game names, characters, card and package images belong to their respective owners
                and are shown to present the products in our machines. The DivisionX Card name and logo are ours.
              </li>
              <li>
                <b>Meta app:</b> “DivisionX Card” is an internal tool our staff use to post to and read statistics of
                our own Page; it is not offered to the public. Comments and messages on the Page follow Facebook’s
                terms; we may hide or remove spam or scam comments.
              </li>
              <li>
                <b>Other:</b> third-party services (Google Maps, LINE, Facebook) follow their own terms. Personal data:
                see our <a href="/privacy">Privacy Policy</a>. We will update this page and its date if these terms
                change. Governed by Thai law.
              </li>
            </ul>
          </div>
        </section>

        <footer className="tm-foot">
          <p className="tm-foot-h">ติดต่อเรา · <span lang="en">Contact</span></p>
          <div className="tm-contact"><ContactChips /></div>
          <div className="tm-tag">
            DivisionX Card · ตู้กดการ์ดเกมอัตโนมัติ · <a href="/branches">ดูสาขาที่ให้บริการ</a>
            {" · "}<a href="/privacy" className="tm-nw">นโยบายความเป็นส่วนตัว</a>
          </div>
        </footer>
      </div>
    </main>
  )
}
