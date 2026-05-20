// Telegram alert helpers · server-side only (uses bot token from env)
// Usage: import { alertSlotChange, alertShipFail, ... } from "../lib/telegram"

const TELEGRAM_BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

const API = (method) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`

// ── Low-level helpers ─────────────────────────────────────────
export async function tgSendMessage({ chatId, text, replyMarkup, parseMode = "HTML", disablePreview = true }) {
  if (!TELEGRAM_BOT_TOKEN) { console.warn("[telegram] TELEGRAM_BOT_TOKEN not set"); return null }
  const body = { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: disablePreview }
  if (replyMarkup) body.reply_markup = replyMarkup
  const res = await fetch(API("sendMessage"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) console.error("[telegram] sendMessage failed:", data)
  return data
}

export async function tgEditMessage({ chatId, messageId, text, replyMarkup, parseMode = "HTML" }) {
  if (!TELEGRAM_BOT_TOKEN) return null
  const body = { chat_id: chatId, message_id: messageId, text, parse_mode: parseMode }
  if (replyMarkup !== undefined) body.reply_markup = replyMarkup
  const res = await fetch(API("editMessageText"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  return await res.json()
}

export async function tgAnswerCallback({ callbackQueryId, text, alert = false }) {
  if (!TELEGRAM_BOT_TOKEN) return null
  const res = await fetch(API("answerCallbackQuery"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: alert }),
  })
  return await res.json()
}

// ── Helpers ─────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c]))
export const ownerChat = () => TELEGRAM_OWNER_CHAT_ID
export const adminChat = () => TELEGRAM_ADMIN_CHAT_ID

// ── High-level alerts ───────────────────────────────────────

// 🔄 Slot product change (Layer 4 + Telegram)
// Sent to Admin group · inline buttons: Confirm | Bug
export async function alertSlotChange({ historyId, machineId, machineName, slotNumber, oldProduct, newProduct, qtyRemain }) {
  const text =
    `🔄 <b>Slot Product เปลี่ยน</b>\n\n` +
    `<b>${esc(machineName || machineId)}</b> · slot <code>${esc(slotNumber)}</code>\n` +
    `จาก: <s>${esc(oldProduct || "—")}</s>\n` +
    `เป็น: <b>${esc(newProduct || "—")}</b>\n` +
    (qtyRemain != null ? `สต็อกเก่าค้าง: <b>${qtyRemain}</b> packs\n` : "") +
    `\n<i>กดยืนยันถ้าตั้งใจ · หรือ Bug ถ้าผิดพลาด</i>`
  const replyMarkup = {
    inline_keyboard: [[
      { text: "✅ ยืนยัน (ตั้งใจ)", callback_data: `slot_confirm:${historyId}` },
      { text: "🚩 Bug",            callback_data: `slot_flag:${historyId}` },
    ]],
  }
  return tgSendMessage({ chatId: adminChat(), text, replyMarkup })
}

// 📦 Ship Fail (WW)
export async function alertShipFail({ shipFailId, machineId, machineName, skuId, qty, orderId, soldAt }) {
  const text =
    `📦 <b>WW Ship Fail</b>\n\n` +
    `<b>${esc(machineName || machineId)}</b>\n` +
    `SKU: <code>${esc(skuId)}</code> × <b>${qty}</b>\n` +
    (orderId ? `Order: <code>${esc(orderId)}</code>\n` : "") +
    (soldAt ? `ขายเมื่อ: ${esc(soldAt)}\n` : "") +
    `\n<i>WW ส่งของไม่สำเร็จ · admin ต้อง claim/refund</i>`
  const replyMarkup = {
    inline_keyboard: [[
      { text: "✅ จัดการแล้ว (resolve)", callback_data: `ship_resolve:${shipFailId}` },
    ]],
  }
  return tgSendMessage({ chatId: adminChat(), text, replyMarkup })
}

// 🚨 Cron scraper failed (sent to Owner)
export async function alertCronFail({ jobName, errorMessage, runUrl }) {
  const text =
    `🚨 <b>Cron Scraper FAIL</b>\n\n` +
    `Job: <code>${esc(jobName)}</code>\n` +
    `Error: ${esc((errorMessage || "").slice(0, 500))}\n` +
    (runUrl ? `\n<a href="${esc(runUrl)}">ดู log บน GitHub</a>` : "")
  return tgSendMessage({ chatId: ownerChat(), text, disablePreview: false })
}

// ⚠️ Stock ต่ำ daily summary (sent to Admin · 9:00 ICT)
export async function alertStockLow({ items }) {
  if (!items || items.length === 0) return null
  const lines = items.map(i =>
    `• <b>${esc(i.machine_name || i.machine_id)}</b> slot <code>${esc(i.slot_number)}</code> · ${esc(i.product_name || i.sku_id)} · เหลือ <b>${i.remain}</b>/${i.max_capacity || "?"}`
  )
  const text =
    `⚠️ <b>Stock หน้าตู้ต่ำ (${items.length} ช่อง)</b>\n\n` +
    lines.slice(0, 25).join("\n") +
    (lines.length > 25 ? `\n\n<i>...และอีก ${lines.length - 25} รายการ</i>` : "")
  return tgSendMessage({ chatId: adminChat(), text })
}
