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
}
module.exports = nextConfig
