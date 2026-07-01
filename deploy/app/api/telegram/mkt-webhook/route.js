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
  if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const msg = body.message || body.edited_message
  const chatId = msg?.chat?.id
  const text = (msg?.text || "").trim().toLowerCase()
  if (!msg || !chatId) return NextResponse.json({ ok: true })

  // security: อนุญาตเฉพาะแชทการตลาดเท่านั้น
  if (ALLOWED_CHAT && String(chatId) !== String(ALLOWED_CHAT)) {
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
