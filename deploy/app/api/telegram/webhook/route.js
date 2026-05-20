// Telegram webhook · receives callback_query (inline button clicks) + commands
// URL: POST /api/telegram/webhook
// Telegram sets webhook via setWebhook → ทุก callback มาที่นี่
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { tgAnswerCallback, tgEditMessage } from "../../../../lib/telegram"

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET // ตั้งตอน setWebhook
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function svc() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(req) {
  // ── Verify Telegram secret token ──
  const secret = req.headers.get("x-telegram-bot-api-secret-token")
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  // ── Callback query (inline button click) ──
  if (body.callback_query) {
    const cb = body.callback_query
    const data = cb.data || ""
    const [action, idStr] = data.split(":")
    const id = parseInt(idStr, 10)
    const fromName = cb.from?.first_name || cb.from?.username || "user"
    const chatId = cb.message?.chat?.id
    const messageId = cb.message?.message_id

    try {
      if (action === "slot_confirm" || action === "slot_flag") {
        const status = action === "slot_confirm" ? "confirmed" : "flagged"
        const note = action === "slot_flag" ? `Flagged via Telegram by ${fromName}` : `Confirmed via Telegram by ${fromName}`
        const { error } = await svc()
          .from("slot_products_history")
          .update({
            review_status: status,
            review_note:   note,
            reviewed_at:   new Date().toISOString(),
          })
          .eq("id", id)
        if (error) throw error

        await tgAnswerCallback({ callbackQueryId: cb.id, text: status === "confirmed" ? "✅ ยืนยันแล้ว" : "🚩 ติดธงเป็น Bug" })
        const badge = status === "confirmed" ? "✅ <b>ยืนยันแล้ว</b>" : "🚩 <b>Bug</b>"
        await tgEditMessage({
          chatId, messageId,
          text: `${cb.message.text || ""}\n\n${badge} โดย ${fromName} · ${new Date().toLocaleString("th-TH")}`,
          parseMode: "HTML",
          replyMarkup: { inline_keyboard: [] }, // ลบปุ่ม
        })
        return NextResponse.json({ ok: true })
      }

      if (action === "ship_resolve") {
        const { error } = await svc()
          .from("ship_fails")
          .update({
            status:      "resolved",
            resolved_at: new Date().toISOString(),
            resolved_note: `Resolved via Telegram by ${fromName}`,
          })
          .eq("id", id)
        if (error) throw error

        await tgAnswerCallback({ callbackQueryId: cb.id, text: "✅ จัดการแล้ว" })
        await tgEditMessage({
          chatId, messageId,
          text: `${cb.message.text || ""}\n\n✅ <b>Resolved</b> โดย ${fromName} · ${new Date().toLocaleString("th-TH")}`,
          parseMode: "HTML",
          replyMarkup: { inline_keyboard: [] },
        })
        return NextResponse.json({ ok: true })
      }

      // unknown action
      await tgAnswerCallback({ callbackQueryId: cb.id, text: "unknown action" })
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.error("[telegram webhook]", e)
      await tgAnswerCallback({ callbackQueryId: cb.id, text: "❌ ผิดพลาด: " + (e.message || ""), alert: true })
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
    }
  }

  // ── /start หรือ message อื่นๆ (ยังไม่ implement Phase 3) ──
  return NextResponse.json({ ok: true })
}
