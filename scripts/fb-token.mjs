// แลก Page Access Token แบบไม่มีวันหมดอายุ สำหรับโพสต์ขึ้นเพจอัตโนมัติ
//
// ทำไมต้องมีสคริปต์นี้ — token ที่ก๊อปจาก Graph API Explorer ตรง ๆ อายุแค่ 1-2 ชม.
// พอหมดอายุปุ่มโพสต์จะพังเงียบ ๆ แล้วไม่มีใครรู้ว่าต้องไปทำอะไร
// ต้องแลก 2 ต่อตามเอกสาร Meta:
//   1. user token สั้น → user token ยาว (60 วัน)  ผ่าน /oauth/access_token
//   2. user token ยาว → page token               ผ่าน /me/accounts
//   page token ที่ได้จาก user token ยาว **ไม่มีวันหมดอายุ** (แต่ถูกเพิกถอนได้)
//
// วิธีใช้:
//   node scripts/fb-token.mjs <APP_ID> <APP_SECRET> <SHORT_LIVED_USER_TOKEN>
//
// เอา 3 ค่านั้นมาจากไหน — ดู wiki/marketing/auto-posting-level3-setup.md

const VERSION = process.env.FB_API_VERSION || "v26.0"
const BASE = `https://graph.facebook.com/${VERSION}`

const [appId, appSecret, shortToken] = process.argv.slice(2)
if (!appId || !appSecret || !shortToken) {
  console.error(`
ใช้: node scripts/fb-token.mjs <APP_ID> <APP_SECRET> <SHORT_LIVED_USER_TOKEN>

  APP_ID / APP_SECRET      จาก developers.facebook.com → แอปของคุณ → Settings → Basic
  SHORT_LIVED_USER_TOKEN   จาก Graph API Explorer (กด Generate Access Token)
                           ต้องติ๊กสิทธิ์: pages_show_list, pages_manage_posts,
                                          pages_read_engagement, pages_manage_engagement

ขั้นตอนเต็ม ๆ อยู่ที่ wiki/marketing/auto-posting-level3-setup.md`)
  process.exit(1)
}

const call = async (path, params) => {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url)
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.error) {
    const e = json?.error || {}
    throw new Error(`${e.type || "HTTP " + res.status}: ${e.message || "ไม่ทราบสาเหตุ"}` +
      (e.code ? ` (code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""})` : ""))
  }
  return json
}

try {
  console.log(`[1/3] แลก user token สั้น → ยาว …`)
  const long = await call("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken,
  })
  const userToken = long.access_token
  console.log(`      ได้แล้ว · อายุ ${long.expires_in ? Math.round(long.expires_in / 86400) + " วัน" : "ไม่ระบุ"}`)

  console.log(`[2/3] ดึงรายชื่อเพจที่โพสต์ได้ …`)
  const accounts = await call("/me/accounts", { access_token: userToken, fields: "id,name,access_token,tasks" })
  const pages = accounts.data || []
  if (!pages.length) {
    console.error(`
❌ ไม่พบเพจเลย — สาเหตุที่พบบ่อย:
   · ตอนกด Generate Access Token ไม่ได้ติ๊ก pages_show_list
   · บัญชีที่ล็อกอินไม่ได้เป็นแอดมินของเพจ
   · แอปอยู่โหมด Development แล้วบัญชีนี้ไม่ได้อยู่ในรายชื่อ Admin/Tester ของแอป`)
    process.exit(1)
  }

  console.log(`[3/3] ตรวจว่า page token ไม่มีวันหมดอายุจริง …\n`)
  for (const p of pages) {
    let expiry = "?"
    try {
      const dbg = await call("/debug_token", {
        input_token: p.access_token, access_token: `${appId}|${appSecret}`,
      })
      // expires_at = 0 แปลว่าไม่มีวันหมดอายุ — นี่คือสิ่งที่เราต้องการ
      expiry = dbg.data?.expires_at === 0
        ? "✅ ไม่มีวันหมดอายุ"
        : `⚠️ หมดอายุ ${new Date((dbg.data?.expires_at || 0) * 1000).toLocaleString("th-TH")}`
    } catch (e) { expiry = `เช็กไม่ได้ (${e.message})` }

    const canPost = (p.tasks || []).includes("CREATE_CONTENT")
    console.log(`── ${p.name}`)
    console.log(`   FB_PAGE_ID=${p.id}`)
    console.log(`   FB_PAGE_ACCESS_TOKEN=${p.access_token}`)
    console.log(`   สิทธิ์โพสต์: ${canPost ? "✅ มี" : "❌ ไม่มี (ต้องเป็นแอดมินเพจ)"}   token: ${expiry}\n`)
  }

  console.log(`เอา 2 บรรทัด FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN ของเพจที่ต้องการ`)
  console.log(`  · วางใน deploy/.env.local          → ใช้ตอนรันบนเครื่อง`)
  console.log(`  · ใส่ใน Vercel → Settings → Environment Variables → แล้ว redeploy`)
  console.log(`\n⚠️ token นี้โพสต์ขึ้นเพจได้เลย — อย่า commit ลง git และอย่าส่งให้ใคร`)
} catch (err) {
  console.error(`\n❌ ${err.message}`)
  process.exit(1)
}
