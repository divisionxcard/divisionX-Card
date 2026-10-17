import "../globals.css"

// หน้านโยบายความเป็นส่วนตัว + วิธีขอลบข้อมูล (สาธารณะ · 17 ต.ค. 2026)
//
// ทำไมต้องมี: แอป Meta "DivisionX Card" ต้องเผยแพร่เป็น Live — ตอนอยู่โหมด Development
//   โพสต์ที่ระบบโพสต์ขึ้นเพจ มีแต่คนที่มี role บนแอปมองเห็น (เจ้าของยืนยันด้วยบัญชีอื่น 17 ต.ค. 2026)
//   และการ Live ต้องใส่ URL นโยบายความเป็นส่วนตัว + URL วิธีขอลบข้อมูลในหน้าตั้งค่าแอป
//   → https://division-x-card.vercel.app/privacy และ https://division-x-card.vercel.app/privacy#data-deletion
//   ขั้นตอนฝั่ง Meta อยู่ที่ wiki/marketing/auto-posting-level3-setup.md (ขั้น 8)
//   ⚠️ อย่าเปลี่ยน path /privacy หรือ id="data-deletion" — ลิงก์ทั้งสองถูกบันทึกไว้ในหน้าตั้งค่าแอปของ Meta
//
// ⚠️ ทุกประโยคต้องตรงกับที่ระบบทำจริง (ตรวจโค้ด + ฐานข้อมูล 17 ต.ค. 2026) ห้ามเติมคำสัญญาที่ทำไม่ได้จริง
//    ระบบเปลี่ยนเมื่อไร (เริ่มเก็บข้อมูลลูกค้า · ใส่ตัววิเคราะห์ผู้เข้าชม/พิกเซล · ให้ระบบอ่านคอมเมนต์หรือแชตเพจ
//    · เพิ่มแบบฟอร์ม · เพิ่มผู้ให้บริการ) ต้องแก้หน้านี้ + วันที่มีผลข้างล่างพร้อมกัน
//    ประโยคที่ผูกกับโค้ด:
//      ตำแหน่งจากปุ่ม "หาสาขาใกล้ฉัน" ไม่ส่งไปไหน   → app/stock/StockBrowser.jsx (locate)
//      ไม่มีคุกกี้ / ตัววิเคราะห์ / พิกเซล          → layout.jsx + package.json (ไม่มีสคริปต์ภายนอก)
//      เบราว์เซอร์ผู้ชมต่อแค่ Vercel + Supabase    → วัดด้วยเบราว์เซอร์จริง 17 ต.ค. 2026: /privacy /branches /stock
//                                                ไม่ต่อโฮสต์นอกเลย · /how-to (คลิป) กับ /products (รูป) ต่อ Supabase Storage
//        ⚠️ ไม่มี Google Fonts ในรายการ เพราะ @import ฟอนต์ใน globals.css อยู่หลัง @tailwind
//           เบราว์เซอร์จึงทิ้งบรรทัดนั้น ไม่เคยโหลดจาก fonts.googleapis.com จริง (ทั้งเครื่องนี้และเว็บจริง)
//           ถ้าวันไหนแก้ให้โหลดจาก Google ได้ ต้องเพิ่ม Google Fonts ในหัวข้อ 2 + 3 + ภาษาอังกฤษ
//           (ถ้าเปลี่ยนไปใช้ next/font ฟอนต์จะเสิร์ฟจากเว็บเราเอง ไม่ต้องเพิ่ม)
//      ระบบอ่านแค่ยอดรวมของโพสต์เพจเรา          → app/api/marketing/metrics-collect/route.js
//      ระบบโพสต์ได้แค่ /photos กับ /feed          → lib/facebook.js
//      ประวัติเข้า–ออกระบบเก็บอะไร               → lib/supabase.js (logLoginEvent)
//        ⚠️ login_history มีคอลัมน์ ip_address แต่ไม่เคยถูกเขียน (0 จาก 7,506 แถว · 17 ต.ค. 2026)
//           ถ้าวันไหนเริ่มเก็บ IP ต้องแก้หัวข้อ 2 (ทีมงาน) + ภาษาอังกฤษ
//      รายการขายเก็บคอลัมน์อะไร                  → scraper/*_sales*.py
//      เคลมเก็บอะไร (มีช่องหมายเหตุพิมพ์อิสระ)     → components/pages/PageClaims.jsx
//      ไฟล์สำรองข้อมูล 7 วัน/ครั้ง เก็บ 8 ชุด      → scripts/telegram_sync_bot.py (BACKUP_EVERY_DAYS · BACKUP_KEEP)
//                                                ตารางที่สำรอง → deploy/scripts/backup-tables.js (TABLES)
//      ผู้ช่วย AI ที่เห็นข้อมูลงาน                 → app/api/marketing/content/* (OpenAI · Gemini · Anthropic)
//                                                · agents/*.py (Gemini · Anthropic) · Hermes (OpenAI · โปรเจกต์เปิด data sharing)
//                                                · Claude Code (Anthropic) · ประวัติแชต Hermes อยู่ในเครื่องร้าน (hermes/sessions)
// ⚠️ เบอร์ร้านคือ 093-073-7930 เท่านั้น · ไลน์ @divisionxcard เป็นช่องทางสอบถาม/แจ้งปัญหา ไม่ใช่ช่องส่งข่าว
export const metadata = {
  title: "นโยบายความเป็นส่วนตัว — DivisionX Card",
  description:
    "DivisionX Card ได้ข้อมูลอะไร ใช้ทำอะไร เก็บที่ไหน และขอลบได้อย่างไร · " +
    "Privacy policy and data deletion instructions for the DivisionX Card website and Meta app",
  openGraph: {
    title: "นโยบายความเป็นส่วนตัว — DivisionX Card",
    description: "ข้อมูลที่เราได้รับ ใช้ทำอะไร และวิธีขอลบข้อมูล · Privacy policy",
    type: "website",
    locale: "th_TH",
  },
}

const EFFECTIVE_TH = "17 ต.ค. 2569"
const EFFECTIVE_EN = "17 Oct 2026"
const LINE_URL = "https://lin.ee/9cMKVRm"
const FB_PAGE_URL = "https://www.facebook.com/DivisionXCard"

const SUMMARY = [
  { ic: "🌐", t: "เข้าเว็บไซต์", d: "ไม่ต้องสมัคร ไม่มีแบบฟอร์ม ไม่ใช้คุกกี้ ไม่มีตัววิเคราะห์ผู้เข้าชมหรือตัวติดตามโฆษณา" },
  { ic: "📍", t: "หาสาขาใกล้ฉัน", d: "ตำแหน่งของคุณใช้คิดระยะทางในเครื่องคุณเท่านั้น ไม่ส่งมาที่เรา และไม่บันทึก" },
  { ic: "🛒", t: "ซื้อจากตู้", d: "เราได้แค่รายการขาย (สินค้า จำนวน ยอดเงิน เวลา) ไม่มีชื่อ เบอร์โทร หรือข้อมูลบัตร/บัญชีธนาคารของคุณ" },
  { ic: "📘", t: "Facebook", d: "แอปของเราใช้โพสต์และดูสถิติของเพจเราเองเท่านั้น ไม่ได้รับข้อมูลส่วนบุคคลของผู้ใช้ Facebook" },
  { ic: "💬", t: "ทักไลน์หรือโทรหาเรา", d: "เราเห็นเฉพาะสิ่งที่คุณส่งมา ใช้เพื่อช่วยแก้ปัญหา และขอให้ลบได้" },
  { ic: "🤝", t: "ไม่ขายข้อมูล", d: "เราไม่ขายข้อมูลส่วนบุคคล และไม่ส่งต่อให้ใครเอาไปทำการตลาด" },
]

// ผู้ให้บริการที่ข้อมูลผ่าน — เพิ่มบริการใหม่ที่แตะข้อมูลคน (ลูกค้า/ทีมงาน) ต้องเพิ่มที่นี่ + ในส่วนภาษาอังกฤษ
const PROVIDERS = [
  { n: "Supabase", d: "ฐานข้อมูล ระบบล็อกอินของทีมงาน และที่เก็บไฟล์ (รูปสินค้า รูปและคลิปที่ใช้บนเว็บและเพจ)" },
  { n: "Vercel", d: "โฮสต์เว็บไซต์ และบันทึกทางเทคนิคของการเข้าเว็บ" },
  { n: "Meta (Facebook)", d: "เพจของเรา และแอปที่ทีมงานใช้โพสต์ขึ้นเพจ" },
  { n: "LINE", d: "บัญชีทางการ @divisionxcard สำหรับสอบถามและแจ้งปัญหา" },
  { n: "ผู้ให้บริการระบบตู้และรับชำระเงิน", d: "ระบบหน้าตู้ การรับเงิน และรายการขายที่เราดึงมา" },
  { n: "เครื่องมือช่วยงานภายใน", d: "เช่น GitHub (งานอัตโนมัติอย่างการดึงยอดขาย) · Telegram (แจ้งเตือนและสั่งงานของทีมงาน)" },
  // ⚠️ โปรเจกต์ OpenAI "Hermes" เปิด data sharing ไว้ (แลกโควตาฟรี · 15 ต.ค. 2026) → ต้องบอกไว้ในประโยคท้าย
  //    ถ้าปิด data sharing เมื่อไร ลบประโยคนั้น (ทั้งไทยและอังกฤษ) + แก้วันที่มีผล
  {
    n: "ผู้ช่วย AI: OpenAI · Google Gemini · Anthropic (Claude)",
    d: "ช่วยร่างข้อความ ภาพ และเสียงพากย์สำหรับโพสต์และคลิป สรุปยอดขายและสต็อกให้ทีมงาน ดูว่าโพสต์ไหนได้ผล " +
      "และช่วยพัฒนาและดูแลระบบ · ได้รับข้อมูลงาน เช่น สินค้า ยอดขายรวม สต็อก เนื้อหาโพสต์ ยอดรวมของโพสต์บนเพจเรา " +
      "(ถูกใจ คอมเมนต์ แชร์) และข้อความที่ทีมงานสั่งงานผ่านบอท และอาจเห็นข้อมูลบัญชีทีมงานระหว่างดูแลระบบ " +
      "· ระบบของเราไม่ส่งข้อมูลส่วนบุคคลของลูกค้าให้บริการเหล่านี้ " +
      "· สำหรับผู้ช่วย AI ในบอท Telegram ของทีมงาน เราเปิดให้ OpenAI นำข้อมูลที่ส่งไปใช้ปรับปรุงโมเดลของ OpenAI ได้",
  },
]

const RETENTION = [
  { t: "ตำแหน่งจากปุ่มหาสาขาใกล้ฉัน", d: "ไม่เก็บ ใช้ในหน้าเว็บแล้วหายไปเมื่อปิดหน้า" },
  { t: "บันทึกทางเทคนิคของผู้ให้บริการ", d: "ตามระยะเวลาที่ผู้ให้บริการแต่ละรายกำหนด" },
  { t: "รายการขายและเคลม", d: "เก็บไว้ตราบที่ยังจำเป็นต่อการทำบัญชีและดูแลธุรกิจ (ไม่มีข้อมูลที่ระบุตัวผู้ซื้อได้)" },
  {
    t: "สำเนาสำรองข้อมูล",
    d: "สำรองทุก 7 วัน เก็บไว้ 8 ชุดล่าสุด (ราว 2 เดือน) แล้วลบชุดเก่าเอง " +
      "· ข้อมูลที่ลบตามคำขอจะหมดจากสำเนาสำรองเมื่อชุดเก่าถูกลบตามรอบนี้",
  },
  { t: "แชตไลน์", d: "อยู่ในระบบ LINE จนกว่าจะถูกลบ · ขอให้เราลบแชตฝั่งบัญชีร้านได้ เท่าที่ระบบ LINE เปิดให้ทำ" },
  {
    t: "ประวัติการคุยกับบอทของทีมงาน",
    d: "เก็บในเครื่องคอมพิวเตอร์ของร้าน ตอนนี้ยังไม่มีการลบอัตโนมัติ · เราจะลบเมื่อหมดความจำเป็น หรือเมื่อเจ้าของข้อมูลขอ",
  },
  {
    t: "ข้อมูลทีมงาน",
    d: "เก็บตลอดที่บัญชียังใช้งาน · ประวัติการเข้า–ออกระบบตอนนี้ยังไม่มีการลบอัตโนมัติ " +
      "เราจะลบเมื่อหมดความจำเป็น หรือเมื่อเจ้าของข้อมูลขอ",
  },
]

// พื้นหลัง/หัวหน้า/การ์ดชุดเดียวกับ /stock และ /branches (ขาว + แสงฟ้า + จุดไข่ปลา 12% · การ์ดกรมท่า)
// คอนทราสต์ที่ใช้: หัวข้อบนพื้นขาว #0A1628 · ตัวหนังสือรองบนพื้นขาว #3E4C66 (กรณีแย่สุด 5.52:1 ตามที่ /stock วัดไว้)
//   บนการ์ด #1A2F52: ขาว 13.4 · #B8C5E0 7.70 · ฟ้า 7.54 — ไม่ใช้ --dx-text-muted บนการ์ด (3.87:1)
// ⚠️ สตริงนี้ถึงผู้ชมทุกคน 2 รอบ (ใน <style> + ใน RSC payload) — หมายเหตุให้เขียนไว้ตรงนี้ ไม่ใช่ในสตริง
// ⚠️ Tailwind preflight ล้างสีและขีดเส้นใต้ของ <a> ทิ้ง — ลิงก์ในเนื้อหาจึงต้องใส่สี+ขีดเส้นใต้เอง (.pv-card a)
const CSS = `
.pv-page{min-height:100vh;color:var(--dx-text);font-family:var(--dx-font);background-color:#FFFFFF;
  background-image:radial-gradient(1200px 500px at 50% -60px, rgba(0,168,222,.20), rgba(0,168,222,0) 70%),
    radial-gradient(circle at 1px 1px, rgba(10,22,40,.12) 1px, transparent 0);
  background-size:100% 100%, 24px 24px;background-repeat:no-repeat, repeat;}
.pv-wrap{max-width:760px;margin:0 auto;padding:20px 16px 56px;overflow-wrap:break-word;}
.pv-page a:focus-visible{outline:2px solid var(--dx-cyan);outline-offset:2px;border-radius:6px;}
.pv-page section{scroll-margin-top:12px;}
.pv-hero{position:relative;border-radius:20px;padding:22px 18px 20px;
  background:radial-gradient(120% 130% at 50% -20%, rgba(0,212,255,.18), rgba(0,212,255,0) 60%), var(--dx-bg-surface);
  border:1px solid var(--dx-border-strong);}
.pv-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:0 0 20px 20px;
  background:linear-gradient(90deg,transparent,var(--dx-cyan),transparent);opacity:.7;}
.pv-kicker{display:flex;align-items:center;gap:7px;color:#CFE3F7;font-size:12px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;}
.pv-kicker svg{color:var(--dx-cyan);filter:drop-shadow(0 0 6px rgba(0,212,255,.6));}
.pv-title{font-size:clamp(25px,6.6vw,34px);font-weight:800;letter-spacing:-.3px;line-height:1.35;margin:8px 0 0;}
.pv-title b{color:var(--dx-cyan);font-weight:800;text-shadow:0 0 18px rgba(0,212,255,.35);}
.pv-sub{color:var(--dx-text-2);font-size:14.5px;line-height:1.65;margin:6px 0 0;}
.pv-date{display:inline-block;margin:12px 0 0;font-size:12.5px;font-weight:600;line-height:1.5;color:#CFE3F7;
  background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.28);border-radius:8px;padding:3px 10px;}
.pv-jump{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;}
.pv-jump a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;font-size:14px;
  font-weight:700;background:var(--dx-bg-elevated);border:1px solid var(--dx-border-strong);color:#fff;
  text-decoration:none;transition:border-color .15s, box-shadow .15s, background .15s;}
.pv-jump a:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
.pv-jump a.is-main{background:var(--dx-cyan);border-color:transparent;color:#02263a;}
.pv-jump a.is-main:hover{background:var(--dx-cyan-bright);box-shadow:0 0 18px var(--dx-glow);}
.pv-h2{display:flex;align-items:center;gap:10px;margin:30px 2px 12px;font-size:19px;font-weight:800;line-height:1.4;
  color:#0A1628;}
.pv-n{flex:none;width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;
  background:var(--dx-bg-surface);color:var(--dx-cyan);font-size:15px;font-weight:800;}
.pv-en-tag{font-size:14px;font-weight:600;color:#3E4C66;}
.pv-stack{display:grid;gap:12px;}
.pv-card{position:relative;background:var(--dx-bg-card);border:1px solid var(--dx-border);border-radius:16px;
  padding:16px 16px 16px 20px;}
.pv-card::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:4px;
  background:linear-gradient(180deg,var(--dx-cyan),var(--dx-cyan-dim));box-shadow:0 0 12px var(--dx-glow);}
.pv-h3{display:flex;align-items:flex-start;gap:8px;margin:0;font-size:16px;font-weight:700;line-height:1.5;color:#fff;}
.pv-card > .pv-h3:not(:first-child){margin-top:16px;}
.pv-p{margin:8px 0 0;color:var(--dx-text-2);font-size:14.5px;line-height:1.75;}
.pv-card > .pv-p:first-child,.pv-card > .pv-ul:first-child{margin-top:0;}
.pv-h3 + .pv-p,.pv-h3 + .pv-ul{margin-top:4px;}
.pv-card b{color:#fff;font-weight:700;}
.pv-card a{color:var(--dx-cyan);text-decoration:underline;text-underline-offset:3px;}
.pv-ul{list-style:none;margin:8px 0 0;padding:0;}
.pv-ul li{position:relative;padding-left:18px;color:var(--dx-text-2);font-size:14.5px;line-height:1.75;}
.pv-ul li + li{margin-top:6px;}
.pv-ul li::before{content:"";position:absolute;left:3px;top:.72em;width:6px;height:6px;border-radius:50%;
  background:var(--dx-cyan);box-shadow:0 0 8px var(--dx-glow);}
.pv-sum{list-style:none;margin:0;padding:0;display:grid;gap:14px;}
@media(min-width:640px){.pv-sum{grid-template-columns:1fr 1fr;gap:16px 22px;}}
.pv-sum li{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start;color:var(--dx-text-2);
  font-size:14px;line-height:1.7;}
.pv-sum .i{font-size:20px;line-height:1.25;text-align:center;}
.pv-sum b{display:block;font-size:15px;line-height:1.5;}
.pv-prov{margin:8px 0 0;padding:0;}
.pv-prov > div{display:grid;gap:2px 16px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);}
.pv-prov > div:first-child{border-top:0;padding-top:2px;}
@media(min-width:600px){.pv-prov > div{grid-template-columns:190px 1fr;}}
.pv-prov dt{color:#fff;font-weight:700;font-size:14.5px;line-height:1.6;}
.pv-prov dd{margin:0;color:var(--dx-text-2);font-size:14px;line-height:1.7;}
.pv-del{border-color:var(--dx-border-glow);box-shadow:0 0 0 1px rgba(0,212,255,.12), 0 0 28px -6px var(--dx-glow);}
.pv-steps{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:14px;}
.pv-steps > li{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:start;}
.pv-k{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  background:var(--dx-cyan);color:#02263a;font-size:16px;font-weight:800;box-shadow:0 0 14px var(--dx-glow);}
.pv-st{color:#fff;font-size:15px;font-weight:700;line-height:1.5;padding-top:5px;}
.pv-sd{color:var(--dx-text-2);font-size:14px;line-height:1.7;margin-top:2px;}
.pv-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
.pv-box{margin-top:16px;padding:12px 14px;border-radius:12px;background:var(--dx-bg-surface);
  border:1px solid var(--dx-border-strong);}
.pv-box .pv-p{font-size:14px;}
.pv-en{margin-top:18px;padding-top:14px;border-top:1px dashed var(--dx-border-strong);}
.pv-en-h{margin:0;color:#CFE3F7;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}
.pv-en .pv-p{font-size:14px;}
.pv-chip{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 15px;border-radius:999px;
  background:var(--dx-bg-surface);border:1px solid var(--dx-border-strong);color:var(--dx-text);font-size:14px;
  font-weight:600;text-decoration:none;transition:border-color .15s, box-shadow .15s;}
.pv-card a.pv-chip{color:var(--dx-text);text-decoration:none;}
.pv-chip:hover{border-color:var(--dx-border-glow);box-shadow:0 0 14px var(--dx-glow-soft);}
.pv-line{background:#06C755;color:#fff;border-radius:6px;font-size:11px;font-weight:800;padding:2px 7px;}
.pv-foot{text-align:center;margin-top:34px;padding-top:22px;border-top:1px solid var(--dx-border);}
.pv-foot-h{margin:0 0 12px;color:#0A1628;font-size:14.5px;font-weight:700;}
.pv-contact{display:inline-flex;flex-wrap:wrap;gap:10px 14px;justify-content:center;align-items:center;}
.pv-tag{color:#3E4C66;font-size:12px;margin-top:14px;}
.pv-tag a{color:inherit;text-decoration:underline;text-underline-offset:3px;}
.pv-nw{white-space:nowrap;}
`

// ชิปติดต่อ — ชุดเดียวกับท้ายหน้า /stock · ใช้ทั้งในหัวข้อขอลบข้อมูลและท้ายหน้า
function ContactChips() {
  return (
    <>
      <a className="pv-chip" href={LINE_URL} target="_blank" rel="noopener noreferrer">
        <span className="pv-line">LINE</span> @divisionxcard
      </a>
      <a className="pv-chip" href="tel:0930737930">📞 093-073-7930</a>
    </>
  )
}

function H2({ id, n, children }) {
  return (
    <h2 className="pv-h2" id={id}>
      {n ? <span className="pv-n" aria-hidden="true">{n}</span> : null}
      <span>{children}</span>
    </h2>
  )
}

export default function PrivacyPage() {
  return (
    <main className="pv-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pv-wrap">
        <header className="pv-hero">
          <div className="pv-kicker">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z" fill="currentColor" />
            </svg>
            DivisionX Card · Privacy Policy
          </div>
          <h1 className="pv-title">นโยบาย<b>ความเป็นส่วนตัว</b></h1>
          <p className="pv-sub">
            เว็บไซต์ ตู้กดการ์ด และเพจ Facebook ของเราได้ข้อมูลอะไรบ้าง เอาไปใช้ทำอะไร เก็บไว้ที่ไหน และขอลบได้อย่างไร
          </p>
          <p className="pv-date">มีผลตั้งแต่ {EFFECTIVE_TH} · <span lang="en">Effective {EFFECTIVE_EN}</span></p>
          <nav className="pv-jump" aria-label="ไปที่หัวข้อ">
            <a className="is-main" href="#data-deletion">ขอลบข้อมูล</a>
            <a href="#summary">สรุปสั้น&nbsp;ๆ</a>
            <a href="#english" lang="en">English</a>
          </nav>
        </header>

        <section id="summary" aria-labelledby="summary-h">
          <H2 id="summary-h">สรุปสั้น&nbsp;ๆ</H2>
          <div className="pv-card">
            <ul className="pv-sum">
              {SUMMARY.map((s) => (
                <li key={s.t}>
                  <span className="i" aria-hidden="true">{s.ic}</span>
                  <span><b>{s.t}</b>{s.d}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="scope" aria-labelledby="scope-h">
          <H2 id="scope-h" n="1">นโยบายนี้ครอบคลุมอะไร</H2>
          <div className="pv-card">
            <p className="pv-p">
              <b>DivisionX Card</b> (“เรา”) ให้บริการตู้กดการ์ดเกมอัตโนมัติในห้างสรรพสินค้าในประเทศไทย
              นโยบายนี้อธิบายว่าเราได้ข้อมูลอะไร ใช้ทำอะไร และดูแลอย่างไร ใน
            </p>
            <ul className="pv-ul">
              <li>เว็บไซต์ <b className="pv-nw">division-x-card.vercel.app</b> — หน้าสาขา เช็กของในตู้ วิธีการซื้อ สินค้า และหน้านี้</li>
              <li>การซื้อสินค้าจากตู้ของเรา</li>
              <li>การติดต่อเราทางไลน์ <b>@divisionxcard</b> และโทรศัพท์ <b className="pv-nw">093-073-7930</b></li>
              <li>
                เพจ Facebook <a href={FB_PAGE_URL} target="_blank" rel="noopener noreferrer">Division X Card</a>{" "}
                และแอป <b>DivisionX Card</b> บน Meta ที่เราใช้โพสต์ขึ้นเพจของเราเอง
              </li>
              <li>ระบบงานภายในที่ทีมงานของเราล็อกอินเข้าใช้</li>
            </ul>
          </div>
        </section>

        <section id="data" aria-labelledby="data-h">
          <H2 id="data-h" n="2">ข้อมูลที่เราได้รับ และนำไปใช้ทำอะไร</H2>
          <div className="pv-stack">
            <div className="pv-card">
              <h3 className="pv-h3"><span aria-hidden="true">🌐</span>เมื่อคุณเข้าเว็บไซต์</h3>
              <ul className="pv-ul">
                <li>ไม่ต้องสมัครสมาชิก และไม่มีแบบฟอร์มให้กรอกข้อมูลส่วนตัว</li>
                <li>
                  หน้าเว็บสาธารณะไม่ใช้คุกกี้ ไม่มีเครื่องมือวิเคราะห์ผู้เข้าชม (เช่น Google Analytics)
                  และไม่มีตัวติดตามโฆษณา (เช่น Facebook Pixel)
                </li>
                <li>
                  ตามปกติของการเปิดเว็บ เบราว์เซอร์ของคุณจะเชื่อมต่อกับผู้ให้บริการที่เราใช้ ได้แก่ Vercel (โฮสต์เว็บไซต์)
                  และในบางหน้า Supabase (ที่เก็บรูปสินค้าและคลิป) ผู้ให้บริการเหล่านี้จะเห็นข้อมูลทางเทคนิค
                  เช่น หมายเลข IP ชนิดเบราว์เซอร์ และหน้าที่เปิด และอาจบันทึกไว้ตามนโยบายของตัวเองเพื่อให้บริการและรักษาความปลอดภัย
                  — ระบบของเราไม่ได้นำข้อมูลนี้มาเก็บในฐานข้อมูลของเรา
                </li>
              </ul>
            </div>

            <div className="pv-card">
              <h3 className="pv-h3"><span aria-hidden="true">📍</span>ปุ่ม “หาสาขาใกล้ฉัน”</h3>
              <ul className="pv-ul">
                <li>ปุ่มนี้อยู่ในหน้าเช็กของในตู้ เบราว์เซอร์จะขออนุญาตใช้ตำแหน่ง เฉพาะตอนที่คุณกดปุ่มเท่านั้น</li>
                <li>ตำแหน่งใช้คำนวณระยะทางไปแต่ละสาขาในเครื่องของคุณเท่านั้น ไม่ถูกส่งมาที่เรา และไม่ถูกบันทึก</li>
                <li>ไม่อนุญาตก็ใช้หน้าเว็บได้ตามปกติ ดูรายชื่อสาขาและค้นหาสินค้าเองได้</li>
                <li>
                  ปุ่ม “นำทาง” เปิด Google Maps โดยส่งไปแค่ชื่อสาขา ไม่ได้ส่งตำแหน่งของคุณ
                  (เมื่อเปิดแล้วเป็นไปตามนโยบายของ Google)
                </li>
              </ul>
            </div>

            <div className="pv-card">
              <h3 className="pv-h3"><span aria-hidden="true">🛒</span>เมื่อคุณซื้อสินค้าจากตู้</h3>
              <ul className="pv-ul">
                <li>
                  การชำระเงินที่หน้าตู้ (เช่น สแกน QR พร้อมเพย์) ดำเนินการผ่านผู้ให้บริการระบบตู้และผู้ให้บริการรับชำระเงิน
                  ตามนโยบายของผู้ให้บริการนั้น
                </li>
                <li>
                  ระบบของเราดึงรายการขายมาเก็บเพื่อทำบัญชี ดูยอดขาย และเตรียมสินค้าไปเติมตู้ — มีแค่เลขที่รายการ ตู้ สินค้า
                  จำนวน ยอดเงิน และเวลา
                </li>
                <li>ไม่มีชื่อ เบอร์โทร อีเมล หรือข้อมูลบัตร/บัญชีธนาคารของผู้ซื้อ</li>
              </ul>
            </div>

            <div className="pv-card">
              <h3 className="pv-h3"><span aria-hidden="true">💬</span>เมื่อคุณติดต่อเรา ทางไลน์หรือโทรศัพท์</h3>
              <ul className="pv-ul">
                <li>
                  เราเห็นข้อมูลที่คุณส่งมาเอง เช่น ชื่อและรูปโปรไฟล์ไลน์ ข้อความ รูปภาพอย่างสลิปการชำระเงิน
                  (ซึ่งอาจมีชื่อและเลขบัญชีบางส่วน) เบอร์ที่โทรเข้ามา และถ้าต้องคืนเงินด้วยการโอน
                  ก็มีเลขบัญชีหรือพร้อมเพย์ที่คุณให้มา
                </li>
                <li>ใช้เพื่อตอบคำถาม ตรวจสอบการชำระเงิน แก้ปัญหา และคืนเงิน เช่น สินค้าไม่ออก หรือจ่ายเงินแล้วติดขัด</li>
                <li>แชตไลน์อยู่ในระบบ LINE Official Account ของ LINE ไม่ได้ถูกนำเข้าฐานข้อมูลของเรา</li>
                <li>
                  ถ้ามีการเคลมหรือคืนเงิน ระบบของเราบันทึกแค่วันที่ ตู้ สินค้า จำนวน ยอดคืนเงิน สาเหตุ
                  และหมายเหตุของทีมงาน (ไม่บันทึกชื่อ เบอร์โทร หรือเลขบัญชีของผู้ซื้อ)
                </li>
              </ul>
            </div>

            <div className="pv-card">
              <h3 className="pv-h3"><span aria-hidden="true">📘</span>Facebook และแอปของเราบน Meta</h3>
              <ul className="pv-ul">
                <li>
                  แอป <b>DivisionX Card</b> มีไว้ให้ทีมงานของเราใช้กับเพจ <b>Division X Card</b> ของเราเองเท่านั้น
                  เพื่อ (1) โพสต์รูปและข้อความขึ้นเพจ และ (2) อ่านโพสต์ของเพจเราพร้อมยอดรวมของแต่ละโพสต์ — จำนวนถูกใจ
                  คอมเมนต์ รีแอ็กชัน แชร์ คลิก และยอดดูวิดีโอ — เพื่อให้ทีมงานและผู้ช่วย AI ของทีมงาน
                  ดูว่าคอนเทนต์ไหนได้ผล
                </li>
                <li>
                  แอปนี้ไม่มีปุ่ม “เข้าสู่ระบบด้วย Facebook” ให้คนทั่วไป ไม่ดึงรายชื่อคนที่กดถูกใจหรือคอมเมนต์
                  ไม่ดึงข้อความคอมเมนต์หรือแชตของเพจ จึงไม่ได้รับข้อมูลส่วนบุคคลของผู้ใช้ Facebook
                </li>
                <li>
                  สิ่งที่คุณทำบนเพจ (กดถูกใจ คอมเมนต์ ส่งข้อความ) อยู่บน Facebook ตามนโยบายของ Meta
                  แอดมินเพจของเราเห็นได้ผ่าน Facebook ตามปกติ และคุณแก้ไขหรือลบเองได้บน Facebook
                </li>
              </ul>
            </div>

            <div className="pv-card">
              <h3 className="pv-h3"><span aria-hidden="true">👥</span>ทีมงานของเรา (ระบบงานภายใน)</h3>
              <ul className="pv-ul">
                <li>บัญชีทีมงานสร้างโดยผู้ดูแลระบบเท่านั้น สมัครเองไม่ได้ เก็บอีเมล ชื่อผู้ใช้ ชื่อที่แสดง และบทบาท</li>
                <li>
                  บันทึกการเข้า–ออกระบบ (เวลา และชนิดเบราว์เซอร์/อุปกรณ์) และชื่อผู้ทำรายการในงานต่าง&nbsp;ๆ
                  เช่น ผู้เติมสินค้า ผู้อนุมัติโพสต์
                </li>
                <li>การล็อกอินจำไว้ในพื้นที่จัดเก็บของเบราว์เซอร์เครื่องนั้น (localStorage) จนกว่าจะออกจากระบบ</li>
                <li>
                  ถ้าทีมงานสั่งงานผ่านบอท Telegram หรือผู้ช่วย AI: ชื่อและรหัสผู้ใช้ Telegram กับข้อความที่สั่ง
                  (รวมข้อความเสียง) จะผ่าน Telegram และผู้ให้บริการ AI (หัวข้อ 3)
                  และประวัติการคุยกับผู้ช่วย AI เก็บไว้ในเครื่องคอมพิวเตอร์ของร้าน
                </li>
                <li>
                  ใช้เพื่อยืนยันตัวตน กำหนดสิทธิ์ ตรวจสอบย้อนหลัง และรักษาความปลอดภัย · ผู้ให้บริการระบบล็อกอิน (Supabase)
                  อาจบันทึกหมายเลข IP ไว้ในบันทึกความปลอดภัยของระบบด้วย
                </li>
              </ul>
            </div>

            <div className="pv-card">
              <h3 className="pv-h3"><span aria-hidden="true">⚖️</span>ฐานทางกฎหมายที่เราใช้ (PDPA)</h3>
              <ul className="pv-ul">
                <li>ตอบคำถาม แก้ปัญหา และคืนเงินให้คุณ — เพื่อปฏิบัติตามสัญญาซื้อขายกับคุณ หรือทำตามที่คุณขอ</li>
                <li>
                  รายการขายและเคลม — เพื่อปฏิบัติตามกฎหมาย (บัญชีและภาษี)
                  และเพื่อประโยชน์โดยชอบด้วยกฎหมายในการดูแลธุรกิจ
                </li>
                <li>
                  บัญชีทีมงานและประวัติการเข้าระบบ — เพื่อการทำงานตามที่ตกลงกับทีมงาน
                  และเพื่อประโยชน์โดยชอบด้วยกฎหมายด้านความปลอดภัยของระบบ
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="storage" aria-labelledby="storage-h">
          <H2 id="storage-h" n="3">เก็บไว้ที่ไหน และใครเข้าถึงได้</H2>
          <div className="pv-card">
            <p className="pv-p">
              ข้อมูลในระบบของเรา (รายการขาย เคลม บัญชีทีมงาน) เก็บในฐานข้อมูล Supabase
              ซึ่งตั้งสิทธิ์ให้เข้าถึงได้เฉพาะบัญชีทีมงาน ตามบทบาทของแต่ละคน — ส่วนที่เปิดให้ทุกคนดู
              มีแค่ข้อมูลบนหน้าเว็บสาธารณะ (สาขา รายการสินค้า และจำนวนสินค้าในตู้) กับรูปและคลิปที่ใช้บนเว็บและเพจ
              · ไฟล์สำรองข้อมูลเก็บในเครื่องคอมพิวเตอร์ของร้าน
            </p>
            <h3 className="pv-h3">ผู้ให้บริการที่เราใช้</h3>
            <dl className="pv-prov">
              {PROVIDERS.map((p) => (
                <div key={p.n}>
                  <dt>{p.n}</dt>
                  <dd>{p.d}</dd>
                </div>
              ))}
            </dl>
            <ul className="pv-ul">
              <li>ผู้ให้บริการแต่ละรายมีนโยบายความเป็นส่วนตัวของตัวเอง และอาจเก็บข้อมูลบนเซิร์ฟเวอร์นอกประเทศไทย</li>
              <li>เราไม่ขายข้อมูลส่วนบุคคล และไม่ส่งต่อให้ใครนำไปทำการตลาด</li>
              <li>
                นอกจากส่งให้ผู้ให้บริการข้างต้นเพื่อให้บริการแก่เรา เราจะเปิดเผยข้อมูลเฉพาะเมื่อกฎหมายกำหนด
                หรือหน่วยงานที่มีอำนาจตามกฎหมายสั่ง
              </li>
            </ul>
          </div>
        </section>

        <section id="retention" aria-labelledby="retention-h">
          <H2 id="retention-h" n="4">เก็บไว้นานแค่ไหน</H2>
          <div className="pv-card">
            <ul className="pv-ul">
              {RETENTION.map((r) => (
                <li key={r.t}><b>{r.t}</b> — {r.d}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="rights" aria-labelledby="rights-h">
          <H2 id="rights-h" n="5">สิทธิของคุณ</H2>
          <div className="pv-card">
            <p className="pv-p">ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) คุณมีสิทธิ</p>
            <ul className="pv-ul">
              <li>ขอดู ขอสำเนา หรือขอให้ส่งต่อข้อมูลส่วนบุคคลของคุณที่อยู่กับเรา</li>
              <li>ขอแก้ไขข้อมูลที่ไม่ถูกต้อง</li>
              <li>ขอลบ ขอระงับการใช้ หรือคัดค้านการใช้ข้อมูล</li>
              <li>ถอนความยินยอม ในกรณีที่เราใช้ข้อมูลโดยอาศัยความยินยอมของคุณ</li>
              <li>ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) หากเห็นว่าเราไม่ปฏิบัติตามกฎหมาย</li>
            </ul>
            <p className="pv-p">ใช้สิทธิได้ทางช่องทางเดียวกับการขอลบข้อมูล<span className="pv-nw">ด้านล่าง</span></p>
          </div>
        </section>

        {/* ⚠️ id="data-deletion" คือ URL ที่ใส่ไว้ในหน้าตั้งค่าแอป Meta (Data deletion instructions URL) — ห้ามเปลี่ยน
            มีภาษาอังกฤษในการ์ดเดียวกันด้วย เพราะคนตรวจของ Meta กดลิงก์นี้แล้วตกมาที่หัวข้อนี้ตรง ๆ */}
        <section id="data-deletion" aria-labelledby="data-deletion-h">
          <H2 id="data-deletion-h" n="6">
            ขอลบข้อมูล <span className="pv-en-tag" lang="en">· Data deletion</span>
          </H2>
          <div className="pv-card pv-del">
            <p className="pv-p">
              ระบบของเรา รวมถึงแอป <b>DivisionX Card</b> บน Facebook <b>ไม่ได้เก็บข้อมูลส่วนบุคคลของผู้ใช้ Facebook
              หรือผู้เข้าชมหน้าเว็บสาธารณะ</b> ถ้าคุณต้องการให้ลบข้อมูลเกี่ยวกับคุณที่อาจอยู่กับเรา เช่น แชตไลน์กับร้าน
              รายการเคลมหรือคืนเงินของคุณ หรือบัญชีทีมงาน ทำได้ 3 ขั้นตอน
            </p>
            <ol className="pv-steps">
              <li>
                <span className="pv-k" aria-hidden="true">1</span>
                <div>
                  <div className="pv-st">ติดต่อเรา แล้วบอกว่า “ขอลบข้อมูล”</div>
                  <div className="pv-sd">ทักไลน์ @divisionxcard หรือโทร <span className="pv-nw">093-073-7930</span></div>
                  <div className="pv-acts"><ContactChips /></div>
                </div>
              </li>
              <li>
                <span className="pv-k" aria-hidden="true">2</span>
                <div>
                  <div className="pv-st">บอกข้อมูลที่ช่วยให้เราหาเจอ</div>
                  <div className="pv-sd">
                    เช่น ชื่อไลน์ที่ใช้ทักร้าน วันที่ เวลา และสาขาที่ซื้อหรือแจ้งปัญหา
                    · ถ้าเป็นบัญชีทีมงาน ให้แจ้งชื่อผู้ใช้ที่ใช้ล็อกอิน · เราอาจถามเพิ่มเพื่อยืนยันว่าเป็นเจ้าของข้อมูลจริง
                  </div>
                </div>
              </li>
              <li>
                <span className="pv-k" aria-hidden="true">3</span>
                <div>
                  <div className="pv-st">เราลบให้ และแจ้งกลับภายใน 30 วัน</div>
                  <div className="pv-sd">
                    แจ้งผลทางช่องทางที่คุณติดต่อมา ถ้ามีข้อมูลส่วนใดที่กฎหมายกำหนดให้ต้องเก็บไว้
                    เราจะแจ้งให้ทราบว่าเก็บอะไรไว้และเพราะอะไร · สำเนาสำรองข้อมูลที่มีข้อมูลนั้นจะหมดไปตามรอบลบชุดเก่า
                    (ราว 2 เดือน)
                  </div>
                </div>
              </li>
            </ol>
            <div className="pv-box">
              <h3 className="pv-h3"><span aria-hidden="true">📘</span>ข้อมูลบน Facebook</h3>
              <p className="pv-p">
                คอมเมนต์ ข้อความ หรือการกดถูกใจบนเพจของเรา คุณลบเองได้บน Facebook (ระบบของเราไม่ได้เก็บสำเนาไว้)
                · ถ้าคุณเคยให้สิทธิ์แอป DivisionX Card กับบัญชี Facebook ของคุณ (ปกติมีเฉพาะทีมงานของเรา)
                ถอนสิทธิ์ได้ที่ การตั้งค่าและความเป็นส่วนตัว → การตั้งค่า → การผสานการทำงานทางธุรกิจ
                (Business integrations) หรือ แอพและเว็บไซต์ (Apps and websites) → เลือก DivisionX Card แล้วกดลบออก
              </p>
            </div>
            <div className="pv-en" lang="en">
              <p className="pv-en-h">In English</p>
              <p className="pv-p">
                Our systems, including the <b>DivisionX Card</b> Meta app, do not store personal data of Facebook users
                or visitors to our public pages. To ask us to delete any data about you that we may hold (for example LINE chats
                with our shop, your claim or refund records, or a staff account), message LINE @divisionxcard or call{" "}
                <span className="pv-nw">093-073-7930</span> (<span className="pv-nw">+66 93 073 7930</span>) and say
                “delete my data”, with details that help us find it (your LINE name, and the date, time and branch).
                We may ask a few questions to confirm the data is yours, then we delete it and confirm within 30 days.
                Backup copies that contain it expire as old backups are removed (about 2 months).
              </p>
              <p className="pv-p">
                Comments, messages and reactions you left on our Facebook Page can be deleted by you on Facebook; our
                system keeps no copies. If you ever granted the DivisionX Card app access to your Facebook account
                (normally only our staff), remove it at Settings &amp; privacy → Settings → Business integrations (or
                Apps and websites) → DivisionX Card → Remove.
              </p>
            </div>
          </div>
        </section>

        <section id="changes" aria-labelledby="changes-h">
          <H2 id="changes-h" n="7">การเปลี่ยนแปลงนโยบายนี้</H2>
          <div className="pv-card">
            <p className="pv-p">
              ถ้าเราเปลี่ยนวิธีใช้ข้อมูล เช่น เพิ่มฟีเจอร์ใหม่บนเว็บไซต์หรือแอป เราจะแก้ไขหน้านี้และวันที่มีผล<span className="pv-nw">ด้านบน</span>
            </p>
          </div>
        </section>

        <section id="english" aria-labelledby="english-h" lang="en">
          <H2 id="english-h">English summary</H2>
          <div className="pv-card">
            <p className="pv-p">A short English version of the Thai policy above. Effective {EFFECTIVE_EN}.</p>

            <h3 className="pv-h3">Who we are</h3>
            <p className="pv-p">
              DivisionX Card runs automated trading-card vending machines in shopping malls in Thailand. This policy
              covers our website (<span className="pv-nw">division-x-card.vercel.app</span>), purchases at our machines,
              contacting us by LINE or phone, our Facebook Page “Division X Card” with our Meta app “DivisionX Card”,
              and the internal system our staff sign in to.
            </p>

            <h3 className="pv-h3">What we collect and why</h3>
            <ul className="pv-ul">
              <li>
                <b>Website:</b> no sign-up and no forms. Public pages use no cookies, no visitor analytics and no
                advertising trackers. When your browser loads a page, our providers (Vercel, and on some pages Supabase
                for product images and video) receive standard technical data such as your IP address, browser type and
                the page requested, and may log it under their own policies. Our system does not store it.
              </li>
              <li>
                <b>“Find branches near me”:</b> your location is requested only when you tap the button, is used on
                your device to sort branches by distance, and is never sent to us or stored.
              </li>
              <li>
                <b>Machine purchases:</b> payment is handled by the machine-system and payment providers. We keep only
                sales records (transaction number, machine, product, quantity, amount, time), with no names, phone
                numbers or card/bank details.
              </li>
              <li>
                <b>Contacting us:</b> we see what you send on LINE (name, profile picture, messages, photos such as
                payment slips, which may show your name and part of your account number, and the bank or PromptPay
                account you give us for a transfer refund) or the number you call from, and use it to check the payment
                and solve your issue, such as a refund. LINE chats stay on LINE’s platform. For a claim or refund we record only the date, machine, product, quantity, refund amount,
                reason and a staff note (no buyer name, phone or bank account).
              </li>
              <li>
                <b>Facebook:</b> our Meta app is used only by our staff, to publish posts to our own Page and to read
                our own posts with total counts (likes, comments, reactions, shares, clicks, video views), which our
                staff and their AI assistants use to see what content works. It offers no Facebook Login to the public
                and does not read who reacted or commented, comment text or Page messages, so it receives no personal
                data of Facebook users.
              </li>
              <li>
                <b>Staff:</b> email, username, display name, role, sign-in and sign-out times with browser type, and who
                carried out each task. Staff commands sent through our Telegram bots or AI assistants (Telegram name and
                user ID, message text including voice messages) pass through Telegram and the AI providers listed below,
                and the AI assistant’s chat history is kept on the shop’s computer.
              </li>
            </ul>

            <h3 className="pv-h3">Legal basis (PDPA)</h3>
            <p className="pv-p">
              Answering questions, solving problems and refunds: performing our sales contract with you, or acting on
              your request. Sales and
              claim records: legal obligations (accounting and tax) and our legitimate interest in running the
              business. Staff accounts and sign-in history: our working arrangement with staff and our legitimate
              interest in system security.
            </p>

            <h3 className="pv-h3">Where it is stored and who can see it</h3>
            <p className="pv-p">
              Our data is stored in Supabase, and only staff accounts can access it, according to their role; the
              public website shows only branch details, the product list and machine stock counts, plus the images
              and clips used on the site and Page. Backup files are kept on the shop’s computer. Providers that handle
              data for us: Supabase, Vercel, Meta, LINE, the machine-system and payment providers, internal tools such
              as GitHub and Telegram, and AI assistants (OpenAI, Google Gemini and Anthropic (Claude)) that help draft
              post text, images and voice-overs, summarise sales and stock for staff, show which posts work and help
              maintain the system. The AI assistants receive work data such as products, total sales, stock, post
              content, our Page’s post totals and the commands staff send to our bots, and may see staff account data
              while helping maintain the system; our system sends them no customer personal data. For the AI
              assistant in our staff Telegram bot, we let OpenAI use the data it receives to improve its models.
              Providers may store data outside Thailand. We do not sell personal data or share it for
              anyone’s marketing. Apart from sending it to these providers so they can serve us, we disclose it only
              when the law requires or a competent authority orders it.
            </p>

            <h3 className="pv-h3">How long we keep it</h3>
            <p className="pv-p">
              Location: not kept. Provider logs: as each provider sets. Sales and claim records: as long as needed for
              accounting and running the business. Backups: taken every 7 days, the latest 8 kept (about 2 months),
              older ones deleted automatically. LINE chats: on LINE until deleted. Staff chat history with our bots:
              kept on the shop’s computer, not yet deleted automatically; removed when no longer needed or on
              request. Staff data: while the account is in
              use; sign-in history is not yet deleted automatically, and we remove it when no longer needed or on
              request.
            </p>

            <h3 className="pv-h3">Your rights</h3>
            <p className="pv-p">
              Under Thailand’s Personal Data Protection Act (PDPA) you can ask to access, copy, correct or delete your
              data, restrict or object to its use, withdraw consent, and complain to the Office of the Personal Data
              Protection Committee (PDPC). To request deletion, see <a href="#data-deletion">Data deletion</a> above.
            </p>

            <h3 className="pv-h3">Changes and contact</h3>
            <p className="pv-p">
              If we change how we use data, we will update this page and its effective date. Contact: LINE
              @divisionxcard or phone <span className="pv-nw">093-073-7930</span>{" "}
              (<span className="pv-nw">+66 93 073 7930</span>).
            </p>
          </div>
        </section>

        <footer className="pv-foot">
          <p className="pv-foot-h">ติดต่อเรื่องข้อมูลส่วนบุคคล · <span lang="en">Contact</span></p>
          <div className="pv-contact"><ContactChips /></div>
          <div className="pv-tag">
            DivisionX Card · ตู้กดการ์ดเกมอัตโนมัติ · <a href="/branches">ดูสาขาที่ให้บริการ</a>
            {" · "}<a href="/terms" className="pv-nw">ข้อกำหนดการใช้งาน</a>
          </div>
        </footer>
      </div>
    </main>
  )
}
