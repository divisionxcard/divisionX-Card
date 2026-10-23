// ย่อวิดีโอในเบราว์เซอร์ก่อนอัปโหลด — Storage ของโปรเจกต์รับไม่เกิน 50 MB ต่อไฟล์ (ทดสอบ 23 ต.ค. 2026: 60 MB → 413)
// คลิปมือถือ 1 นาทีมัก 100–400 MB → ย่อเหลือ ≤ ~44 MB ด้วย WebCodecs (การ์ดจอของเครื่องผู้ใช้ทำ ไม่ต้องส่งไฟล์ใหญ่ออกไปไหน)
//
// mediabunny@1.61.2 (MPL-2.0) · โหลดเฉพาะตอนต้องย่อ (dynamic import) — หน้าห้องตัดต่อไม่หนักขึ้นตอนเปิด
// ขนาดภาพ: ไม่เกินที่คลุมจอ 1080×1920 ได้ (ไม่ขยาย) — เท่ากับที่เครื่องเรนเดอร์ย่ออยู่แล้ว (hf_timeline._prep_video)
// ล้ม (เบราว์เซอร์เก่า / ไฟล์ HEVC ที่เครื่องถอดรหัสไม่ได้) = โยน error ภาษาไทยให้ผู้ใช้ย่อเองจากมือถือ

export const TARGET_BYTES = 44 * 1024 * 1024

export function canCompress() {
  return typeof window !== "undefined" && typeof window.VideoEncoder === "function" && typeof window.VideoDecoder === "function"
}

export async function compressVideo(file, onProgress = () => {}) {
  if (!canCompress()) throw new Error("เบราว์เซอร์นี้ย่อวิดีโอเองไม่ได้ — ใช้ Chrome/Edge รุ่นใหม่ หรือย่อไฟล์จากมือถือก่อน")
  const M = await import("mediabunny")
  const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS })
  const vt = await input.getPrimaryVideoTrack()
  if (!vt) throw new Error("ไฟล์นี้ไม่มีภาพวิดีโอ")
  const dur = await input.computeDuration()
  if (!(dur > 0)) throw new Error("อ่านความยาววิดีโอไม่ได้")

  const w0 = vt.displayWidth, h0 = vt.displayHeight
  const k = Math.min(1, Math.max(1080 / w0, 1920 / h0))
  const width = Math.max(2, Math.round((w0 * k) / 2) * 2)
  const height = Math.max(2, Math.round((h0 * k) / 2) * 2)
  // งบบิต: ขนาดเป้าหมาย ÷ ความยาว (เผื่อหัวไฟล์ 6%) − เสียง · เพดาน 8 Mbps · ต่ำสุด 0.8 Mbps (คลิปยาวมาก = ภาพหยาบลง)
  const audioBits = 128_000
  const videoBits = Math.max(800_000, Math.min(8_000_000, Math.floor((TARGET_BYTES * 8 * 0.94) / dur - audioBits)))

  const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: "in-memory" }), target: new M.BufferTarget() })
  const conv = await M.Conversion.init({
    input, output,
    video: { width, height, fit: "fill", codec: "avc", bitrate: videoBits, frameRate: 30, forceTranscode: true },
    audio: { bitrate: audioBits },
  })
  if (!conv.isValid) {
    const why = conv.discardedTracks.map(d => d.reason).join(", ")
    throw new Error(`ย่อไฟล์นี้ในเบราว์เซอร์ไม่ได้ (${why || "ไม่รองรับ"}) — ส่งออกจากมือถือเป็น 1080p แล้วอัปใหม่`)
  }
  conv.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)))
  await conv.execute()
  const buf = output.target.buffer
  if (!buf) throw new Error("ย่อไฟล์ไม่สำเร็จ")
  const base = file.name.replace(/\.[^.]+$/, "")
  return new File([buf], `${base}-small.mp4`, { type: "video/mp4" })
}
