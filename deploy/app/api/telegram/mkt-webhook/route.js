// Webhook บอทการตลาด (แยกจากบอท admin) — รับคำสั่งแล้วยิง workflow
// URL: POST /api/telegram/mkt-webhook
// ตั้ง webhook: setWebhook ของบอท TELEGRAM_MKT + secret_token = TELEGRAM_MKT_WEBHOOK_SECRET
//
// รองรับ: /digest (หรือ "สรุป") → สั่งรัน weekly-sales-digest.yml → digest เด้งเข้าแชท
import { NextResponse } from "next/server"

const SECRET = process.env.TELEGRAM_MKT_WEBHOOK_SECRET
const MKT_TOKEN = process.env.TELEGRAM_MKT_BOT_TOKEN
const ALLOWED_CHAT = process.env.TELEGRAM_MKT_CHAT_ID
const GH_PAT = process.env.GH_PAT
const REPO = "divisionxcard/divisionX-Card"

async function tgReply(chatId, text) {
  if (!MKT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${MKT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {})
}

// ── แผงปุ่มกลุ่ม DVX_Admin (30 ต.ค. 2026) — เจ้าของขอปุ่มด้านล่างช่องพิมพ์แบบห้อง DVX_Owner ไว้เปิดหน้าเว็บยอดขาย
//    (แอดมินบางคนไม่รู้จักหน้าเว็บ) · ปุ่มแผงล่าง (reply keyboard) ของ Telegram เปิด URL เองไม่ได้ในกลุ่ม —
//    กดแล้วส่งข้อความ WEB_BUTTON_TEXT เข้ากลุ่ม → ที่นี่ตอบด้วยปุ่มลิงก์ (inline url) ให้กดเปิดเว็บ
//    ⚠️ บอทเปิด privacy mode อยู่ — กดปุ่มปกติ client ส่งเป็น "ตอบกลับ" ข้อความที่มีแผงปุ่ม จึงได้รับอยู่แล้ว ·
//       ตั้งบอทเป็นแอดมินกลุ่มไว้ด้วย (30 ต.ค.) เผื่อกดตอนกำลังตอบข้อความคนอื่น · /web@ · /panel@ ได้รับเสมอ
//    ⚠️ กลุ่มธรรมดา (type group) ถ้าถูกอัปเป็น supergroup id จะเปลี่ยน → แก้ TELEGRAM_DVX_ADMIN_CHAT_ID แล้ว /panel ใหม่
//    ไม่จำกัดห้อง: คำตอบมีแค่ลิงก์เว็บสาธารณะ (เข้าได้ต้องล็อกอิน) ไม่มีข้อมูลธุรกิจ
const SITE = (process.env.DVX_BASE_URL || "https://division-x-card.vercel.app").replace(/\/$/, "")
const WEB_BUTTON_TEXT = "🌐 เปิดหน้าเว็บยอดขาย"
const WEB_LINK = { inline_keyboard: [[{ text: "📊 ดูยอดขายบนหน้าเว็บ", url: `${SITE}/?page=sales` }]] }
const PANEL_KEYBOARD = { keyboard: [[{ text: WEB_BUTTON_TEXT }]], resize_keyboard: true, is_persistent: true }

async function tgSend(chatId, text, markup, replyTo) {
  if (!MKT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${MKT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
      ...(markup ? { reply_markup: markup } : {}),
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    }),
  }).catch(() => {})
}

async function dispatch(workflow) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" },
      body: JSON.stringify({ ref: "main" }),
    }
  )
  return res.status === 204
}

export async function POST(req) {
  // verify Telegram secret token (กัน endpoint โดนยิงมั่ว)
  // ⚠️ ปฏิเสธเสมอเมื่อไม่ได้ตั้ง secret (fail closed) — เดิม "ไม่ได้ตั้ง = ไม่ตรวจ"
  if (!SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  // ข้อความที่ถูกแก้ไขไม่ทำอะไร — เดิมแก้ "สรุป" แล้วสั่ง workflow ซ้ำ · แก้ข้อความปุ่มแล้วบอทตอบซ้ำ
  if (body.edited_message && !body.message) return NextResponse.json({ ok: true })
  const msg = body.message
  const chatId = msg?.chat?.id
  const text = (msg?.text || "").trim().toLowerCase()
  if (!msg || !chatId) return NextResponse.json({ ok: true })

  // แผงปุ่มกลุ่ม — ก่อนด่านจำกัดห้อง (ดูหมายเหตุที่ WEB_BUTTON_TEXT) · เฉพาะข้อความใหม่ (แก้ข้อความเก่าไม่ตอบซ้ำ)
  const raw = body.message ? (msg.text || "").trim() : ""
  const cmd = raw.split(/\s+/)[0].toLowerCase()
  if (raw === WEB_BUTTON_TEXT || cmd === "/web" || cmd === "/web@dvx_marketing_bot") {
    await tgSend(chatId, "📊 กดปุ่มด้านล่างเพื่อเปิดหน้ายอดขาย\n<i>ล็อกอินด้วยชื่อผู้ใช้ (username) · ยังไม่มีบัญชีแจ้งเจ้าของ</i>",
      WEB_LINK, msg.message_id)
    return NextResponse.json({ ok: true })
  }
  if (cmd === "/panel" || cmd === "/panel@dvx_marketing_bot") {
    await tgSend(chatId, "🎛 แผงปุ่มพร้อมใช้ — กด <b>" + WEB_BUTTON_TEXT + "</b> ด้านล่างช่องพิมพ์ได้เลย", PANEL_KEYBOARD)
    return NextResponse.json({ ok: true })
  }

  // security: อนุญาตเฉพาะแชทการตลาดเท่านั้น
  // ปิดไว้ก่อน (fail closed) — ไม่ได้ตั้ง TELEGRAM_MKT_CHAT_ID = ไม่รับคำสั่งจากใครเลย (เดิมเปิดให้ทุกห้อง)
  if (!ALLOWED_CHAT || String(chatId) !== String(ALLOWED_CHAT)) {
    return NextResponse.json({ ok: true })
  }

  const isDigestCmd =
    text === "/digest" || text.startsWith("/digest") ||
    text === "/report" || text === "สรุป" || text === "สรุปยอด"

  if (isDigestCmd) {
    if (!GH_PAT) {
      await tgReply(chatId, "❌ ยังไม่ได้ตั้ง GH_PAT ใน Vercel")
      return NextResponse.json({ ok: true })
    }
    const ok = await dispatch("weekly-sales-digest.yml")
    await tgReply(
      chatId,
      ok
        ? "🔄 กำลังสรุปยอดขาย... รอสักครู่ (~1 นาที) เดี๋ยวสรุปเข้ามาครับ 📊"
        : "❌ สั่งรันไม่สำเร็จ ลองใหม่อีกครั้ง"
    )
    return NextResponse.json({ ok: true })
  }

  if (text === "/start" || text === "/help") {
    await tgReply(chatId, "พิมพ์ <b>/digest</b> เพื่อขอสรุปยอดขายตอนนี้ 🎴")
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
