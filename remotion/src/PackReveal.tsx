import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

// คลิปตัวอย่าง: ซองจริงลอยขึ้นมาพร้อมสายฟ้า แล้วขึ้นพาดหัว
//
// อัตลักษณ์แบรนด์ที่ต้องรักษา: ฟ้านีออนไฟฟ้า + สายฟ้า + โครเมียม บนพื้นกรมท่า (ไม่ใช่ดำ-ทอง)
//
// ⚠️ ตัวหนังสือไทยตรงนี้เรนเดอร์ด้วยเบราว์เซอร์จริง (Chromium) จึงสะกดถูก 100% เสมอ
// ต่างจากภาพที่ให้โมเดล AI วาด ซึ่งเคยได้ "กันโหดบาก" กับ "เปิด 24 ซบ."
// ถ้าวันหนึ่งจะย้ายไปให้ AI ทำวิดีโอทั้งคลิป จุดนี้คือสิ่งที่จะเสียไป

export const PackReveal: React.FC<{
  headline: string
  sub: string
  packUrl: string
}> = ({ headline, sub, packUrl }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // สปริงให้ซองเด้งขึ้นมา — ดูมีน้ำหนักกว่าการเลื่อนเชิงเส้น
  const rise = spring({ frame, fps, config: { damping: 14, mass: 0.8 } })
  const packY = interpolate(rise, [0, 1], [260, 0])
  const packScale = interpolate(rise, [0, 1], [0.82, 1])

  // พาดหัวเข้าทีหลังซอง ให้สายตาจับสินค้าก่อน
  const textIn = spring({ frame: frame - 18, fps, config: { damping: 16 } })
  const textY = interpolate(textIn, [0, 1], [40, 0])

  // แสงวาบเป็นจังหวะ — ใช้เป็นชีพจรของคลิป ไม่ให้ภาพนิ่งจนคนเลื่อนผ่าน
  const pulse = 0.5 + 0.5 * Math.sin(frame / 7)

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B1B3A" }}>
      {/* พื้นหลัง: ไล่เฉดกรมท่า + แสงฟ้าจากกลางภาพ */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(0,212,255,0.35), rgba(11,27,58,0) 62%), " +
            "linear-gradient(160deg, #12264F 0%, #0B1B3A 60%, #081428 100%)",
        }}
      />

      {/* สายฟ้าฝั่งซ้าย-ขวา วาดด้วย SVG ไม่ใช่รูป จะได้คมทุกความละเอียด */}
      <AbsoluteFill style={{ opacity: 0.55 + 0.35 * pulse }}>
        <svg width="1080" height="1920" viewBox="0 0 1080 1920">
          <g stroke="#00D4FF" strokeWidth={6} fill="none" strokeLinecap="round">
            <path d="M120 380 L200 700 L140 720 L260 1060" opacity={0.9} />
            <path d="M960 420 L880 740 L950 760 L820 1100" opacity={0.9} />
          </g>
        </svg>
      </AbsoluteFill>

      {/* ซองจริง */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Img
          src={packUrl}
          style={{
            width: 560,
            transform: `translateY(${packY}px) scale(${packScale})`,
            filter: `drop-shadow(0 40px 60px rgba(0,0,0,.65)) drop-shadow(0 0 ${
              24 + 20 * pulse
            }px rgba(0,212,255,.55))`,
          }}
        />
      </AbsoluteFill>

      {/* ข้อความ */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 220,
          transform: `translateY(${textY}px)`,
          opacity: textIn,
        }}
      >
        <div
          style={{
            fontFamily: "Segoe UI, Tahoma, sans-serif",
            fontWeight: 800,
            fontSize: 96,
            color: "#fff",
            textAlign: "center",
            lineHeight: 1.15,
            textShadow: "0 6px 0 rgba(0,0,0,.45), 0 0 40px rgba(0,212,255,.5)",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            fontFamily: "Segoe UI, Tahoma, sans-serif",
            fontSize: 48,
            color: "#9FE8FF",
            marginTop: 24,
          }}
        >
          {sub}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
