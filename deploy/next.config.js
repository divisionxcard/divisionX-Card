/** @type {import('next').NextConfig} */
// header ความปลอดภัยพื้นฐานทุกหน้า (ตรวจความปลอดภัย 16 ต.ค. 2026: เดิมไม่มีเลย หน้าล็อกอินถูกฝังใน iframe เว็บอื่นได้)
//   frame-ancestors/X-Frame-Options  กันเว็บอื่นเอาหน้าเราไปซ้อนหลอกให้กด (clickjacking)
//   nosniff                         กันเบราว์เซอร์เดาชนิดไฟล์เอง
//   Referrer-Policy                 ไม่ส่ง URL เต็มของหน้าหลังบ้านไปให้เว็บภายนอก
//   ⚠️ ไม่ใส่ CSP เต็มรูปแบบ — หน้าเว็บใช้ inline style/script เยอะ ต้องไล่ทดสอบก่อน ไม่งั้นหน้าพัง
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
