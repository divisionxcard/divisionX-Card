"use client"
// มินิแอปในบอท Telegram (11 พ.ย. 2026 · เจ้าของขอปุ่ม "เปิดหน้าเว็บ" แบบเดียวกับบอท AssetX)
// กดปุ่มเมนูในแชตบอท → Telegram เปิดเว็บนี้ในหน้าต่างของมันเอง → ล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านตามปกติ (ไม่ใช้ข้อมูลบัญชี Telegram)
// ตั้งปุ่มด้วย scripts/set_telegram_web_button.py
// โหลดสคริปต์ของ Telegram เฉพาะตอนเปิดจากในแอป Telegram — คนเปิดเว็บปกติ (ลูกค้าหน้า /stock) ไม่โหลดอะไรเพิ่ม
//   ready()                  บอก Telegram ว่าหน้าพร้อม (เลิกโชว์ตัวโหลด)
//   expand()                 บนมือถือมินิแอปเปิดมาครึ่งจอ → ขยายเต็มความสูง
//   disableVerticalSwipes()  ปัดลงในหน้าเว็บ = เลื่อนหน้า ไม่ใช่ปิดมินิแอป (Bot API 7.7+)
import { useEffect } from "react"

const SDK = "https://telegram.org/js/telegram-web-app.js"
const FLAG = "dvx_tg_miniapp"

function launchedFromTelegram() {
  try {
    // Telegram แนบ #tgWebAppData=…&tgWebAppPlatform=… มากับลิงก์ตอนเปิด · เปลี่ยนหน้าในเว็บแล้ว hash หาย → จำไว้ในแท็บนี้
    if (/[#&]tgWebApp(Data|Platform|Version)=/.test(window.location.hash)) {
      sessionStorage.setItem(FLAG, "1")
      return true
    }
    return Boolean(window.TelegramWebviewProxy) || sessionStorage.getItem(FLAG) === "1"
  } catch {
    return false
  }
}

export default function TelegramMiniApp() {
  useEffect(() => {
    if (!launchedFromTelegram()) return
    const start = () => {
      const tg = window.Telegram && window.Telegram.WebApp
      if (!tg) return
      tg.ready()
      tg.expand()
      if (tg.isVersionAtLeast && tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes()
    }
    if (window.Telegram && window.Telegram.WebApp) {
      start()
      return
    }
    const s = document.createElement("script")
    s.src = SDK
    s.async = true
    s.onload = start
    document.head.appendChild(s)
  }, [])
  return null
}
