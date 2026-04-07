import "./globals.css"

export const metadata = {
  title: "DivisionX Card — ระบบจัดการสต็อก",
  description: "ระบบจัดการสต็อกและวิเคราะห์ยอดขาย One Piece Card Game",
}

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
