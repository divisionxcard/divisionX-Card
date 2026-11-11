/** @type {import('next').NextConfig} */
// header ความปลอดภัยพื้นฐานทุกหน้า (ตรวจความปลอดภัย 16 ต.ค. 2026: เดิมไม่มีเลย หน้าล็อกอินถูกฝังใน iframe เว็บอื่นได้)
//   frame-ancestors                 กันเว็บอื่นเอาหน้าเราไปซ้อนหลอกให้กด (clickjacking)
//   nosniff                         กันเบราว์เซอร์เดาชนิดไฟล์เอง
//   Referrer-Policy                 ไม่ส่ง URL เต็มของหน้าหลังบ้านไปให้เว็บภายนอก
//   ⚠️ ไม่ใส่ CSP เต็มรูปแบบ — หน้าเว็บใช้ inline style/script เยอะ ต้องไล่ทดสอบก่อน ไม่งั้นหน้าพัง
// 11 พ.ย. 2026 มินิแอปในบอท Telegram (components/TelegramMiniApp.jsx): แอปมือถือ/Telegram Desktop/Unigram เปิดในหน้าต่างของมันเอง
//   ไม่ติดค่านี้ · แต่ Telegram Web (web.telegram.org) ฝังหน้าเว็บใน iframe → ยอมให้เฉพาะโดเมนนั้นฝัง เว็บอื่นยังฝังไม่ได้เหมือนเดิม ·
//   ถอด X-Frame-Options: DENY ออก เพราะระบุโดเมนที่ยอมไม่ได้ และเบราว์เซอร์ทุกตัวที่รองรับ frame-ancestors ใช้ค่านี้แทนอยู่แล้ว
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors https://web.telegram.org" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
]

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "isv-media.*.r2.cloud*",
      },
      {
        protocol: "https",
        hostname: "*.inboxcorp.co.th",
      },
    ],
    unoptimized: true,
  },
  experimental: {
    // ⚠️ ไฟล์ใน public/ เว็บเสิร์ฟได้ แต่ไม่ถูกแพ็กเข้า serverless function บน Vercel
    //    route ที่อ่านด้วย fs จะเจอ ENOENT เงียบ ๆ ตอนรันจริง ทั้งที่บนเครื่องผ่าน
    //    (15 ก.ย. 2026 · โลโก้ที่แปะทับโปสเตอร์ + รูปตู้จริงที่ใช้เป็นภาพอ้างอิง)
    outputFileTracingIncludes: {
      "/api/marketing/content/image": [
        "./public/logo-white.png",
        "./public/logo-black.png",
        "./public/machine/**/*",
      ],
    },
  },
}
module.exports = nextConfig
