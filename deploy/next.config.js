/** @type {import('next').NextConfig} */
const nextConfig = {
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
