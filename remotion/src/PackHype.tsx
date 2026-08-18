import {
  AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, random,
  spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion"

// คลิปแนวไวรัล — ใช้ฟุตเทจกดตู้จริงเป็นแกน ไม่ใช่ซองลอยกลางจอ
//
// ทำไมถึงต้องรื้อจากตัวแรก: ตัวแรกซองลอยขึ้นเฉย ๆ สายฟ้าไม่ขยับ จังหวะเดียวตลอด 6 วินาที
// บนฟีดที่คนเลื่อนผ่านทุก 1-2 วินาที คลิปแบบนั้นไม่มีอะไรฉุดให้หยุดดู
//
// หลักที่ใช้: เปลี่ยนภาพทุก ~1.5 วินาที · มีแรงกระแทกตอนตัด · ข้อความขึ้นทีละคำ
// ของจริง (ฟุตเทจ + ซองจริง) เป็นพระเอก ส่วนกราฟิกเป็นตัวเสริมเท่านั้น

const NAVY = "#0B1B3A"
const NEON = "#00D4FF"
const FONT = "Segoe UI, Tahoma, sans-serif"

/** สั่นกล้องช่วงสั้น ๆ หลังจังหวะกระแทก — ทำให้การตัดรู้สึกมีน้ำหนัก */
const useShake = (startFrame: number, strength = 14, decay = 12) => {
  const frame = useCurrentFrame()
  const t = frame - startFrame
  if (t < 0 || t > decay * 2) return { x: 0, y: 0 }
  const fade = Math.max(0, 1 - t / (decay * 2))
  return {
    x: (random(`sx${frame}`) - 0.5) * strength * fade,
    y: (random(`sy${frame}`) - 0.5) * strength * fade,
  }
}

/** ข้อความขึ้นทีละคำ — สายตาจับได้ทันแม้คลิปสั้น ต่างจากขึ้นทั้งประโยคพร้อมกัน */
const WordReveal: React.FC<{ text: string; from: number; size: number; color?: string }> = ({
  text, from, size, color = "#fff",
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <div style={{ display: "flex", gap: size * 0.22, flexWrap: "wrap", justifyContent: "center" }}>
      {text.split(" ").map((w, i) => {
        const s = spring({ frame: frame - from - i * 4, fps, config: { damping: 12, mass: 0.5 } })
        return (
          <span
            key={i}
            style={{
              fontFamily: FONT, fontWeight: 800, fontSize: size, color,
              transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px) scale(${interpolate(s, [0, 1], [0.7, 1])})`,
              opacity: s,
              textShadow: "0 4px 0 rgba(0,0,0,.5), 0 0 28px rgba(0,212,255,.55)",
              whiteSpace: "nowrap",
            }}
          >
            {w}
          </span>
        )
      })}
    </div>
  )
}

/** แสงกวาดผ่านซอง — ทำให้ภาพนิ่งดูมีชีวิตโดยไม่ต้องขยับตัวสินค้า */
const LightSweep: React.FC<{ from: number; duration: number }> = ({ from, duration }) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame - from, [0, duration], [-40, 140], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(105deg, transparent ${p - 18}%, rgba(255,255,255,.55) ${p}%, transparent ${p + 18}%)`,
        mixBlendMode: "screen",
      }}
    />
  )
}

/** แฟลชขาวตอนตัดภาพ — ซ่อนรอยต่อและสร้างจังหวะ */
const Flash: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame()
  const o = interpolate(frame - at, [0, 3, 9], [0, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return <AbsoluteFill style={{ backgroundColor: "#fff", opacity: o }} />
}

export const PackHype: React.FC<{
  headline: string
  sub: string
  cta: string
  packUrl: string
  footage: string
}> = ({ headline, sub, cta, packUrl, footage }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const shake = useShake(52, 16)

  // ซูมเข้าช้า ๆ ตลอดคลิป — กันภาพนิ่งสนิทซึ่งเป็นสาเหตุที่คนเลื่อนผ่าน
  const push = interpolate(frame, [0, durationInFrames], [1.06, 1.18])
  const packIn = spring({ frame: frame - 52, fps, config: { damping: 11, mass: 0.7 } })

  return (
    <AbsoluteFill style={{ backgroundColor: NAVY }}>
      {/* ── ช่วงที่ 1 (0-1.8 วิ) ฟุตเทจกดตู้จริง — เปิดด้วยของจริงเสมอ ── */}
      <Sequence durationInFrames={54}>
        <AbsoluteFill style={{ transform: `scale(${push})` }}>
          <OffthreadVideo src={staticFile(footage)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(11,27,58,.25) 0%, rgba(11,27,58,.85) 78%)" }} />
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 200 }}>
          <WordReveal text={sub} from={8} size={54} color={NEON} />
        </AbsoluteFill>
      </Sequence>

      {/* ── ช่วงที่ 2 (1.8-4.2 วิ) ซองจริงกระแทกเข้ามา ── */}
      <Sequence from={52}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 44%, rgba(0,212,255,.42), ${NAVY} 62%)`,
            transform: `translate(${shake.x}px, ${shake.y}px)`,
          }}
        >
          {/* เส้นแสงพุ่งออกจากกลาง — ทิศทางเดียวกับซองที่กระแทกลงมา */}
          <AbsoluteFill style={{ opacity: 0.5 }}>
            <svg width="100%" height="100%" viewBox="0 0 720 1280">
              {Array.from({ length: 14 }).map((_, i) => {
                const a = (i / 14) * Math.PI * 2
                const len = 260 + random(`r${i}`) * 320
                return (
                  <line
                    key={i}
                    x1={360 + Math.cos(a) * 150} y1={560 + Math.sin(a) * 150}
                    x2={360 + Math.cos(a) * len} y2={560 + Math.sin(a) * len}
                    stroke={NEON} strokeWidth={3} opacity={0.5 + 0.5 * random(`o${i}`)}
                  />
                )
              })}
            </svg>
          </AbsoluteFill>

          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: 160 }}>
            <div style={{ position: "relative" }}>
              <Img
                src={packUrl}
                style={{
                  width: 420,
                  transform: `translateY(${interpolate(packIn, [0, 1], [-420, 0])}px) rotate(${interpolate(packIn, [0, 1], [-14, -3])}deg) scale(${interpolate(packIn, [0, 1], [1.25, 1])})`,
                  filter: "drop-shadow(0 40px 60px rgba(0,0,0,.7)) drop-shadow(0 0 30px rgba(0,212,255,.6))",
                }}
              />
              <LightSweep from={70} duration={40} />
            </div>
          </AbsoluteFill>

          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 260 }}>
            <WordReveal text={headline} from={72} size={82} />
          </AbsoluteFill>
        </AbsoluteFill>
        <Flash at={0} />
      </Sequence>

      {/* ── ช่วงที่ 3 (4.2 วิ-จบ) ปิดท้ายด้วย CTA คาดแถบ ── */}
      <Sequence from={126}>
        <AbsoluteFill style={{ transform: `scale(${push})` }}>
          <OffthreadVideo src={staticFile(footage)} muted startFrom={120}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(11,27,58,.55), rgba(11,27,58,.92))" }} />
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <WordReveal text={cta} from={6} size={72} />
          <div style={{ marginTop: 34, height: 6, width: 220, background: NEON, borderRadius: 3, opacity: 0.9 }} />
        </AbsoluteFill>
        <Flash at={0} />
      </Sequence>
    </AbsoluteFill>
  )
}
