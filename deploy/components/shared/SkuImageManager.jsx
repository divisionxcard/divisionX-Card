import { useState, useRef } from "react"
import { Image as ImageIcon, Upload, Trash2, X, Loader2 } from "lucide-react"
import { uploadSkuImage, deleteSkuImage } from "../../lib/supabase"

const MAX_SIZE = 20 * 1024 * 1024
const ACCEPT = "image/jpeg,image/png,image/webp"
const MAX_DIM = 1024
const QUALITY = 0.9   // WebP/JPG quality

// Resize + convert ผ่าน Canvas
// PNG/WebP (มีโอกาส transparent) → WebP รักษา alpha + เล็กกว่า PNG เยอะ
// JPG → JPG (เดิมไม่ transparent อยู่แล้ว)
async function compressImage(file) {
  const preserveAlpha = file.type === "image/png" || file.type === "image/webp"
  const outType = preserveAlpha ? "image/webp" : "image/jpeg"
  const outExt = preserveAlpha ? "webp" : "jpg"
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!preserveAlpha) {
        ctx.fillStyle = "#ffffff"  // JPG ไม่รองรับ transparent → fill ขาว
        ctx.fillRect(0, 0, w, h)
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"))
          const compressed = new File(
            [blob],
            file.name.replace(/\.\w+$/, `.${outExt}`),
            { type: outType, lastModified: Date.now() }
          )
          resolve(compressed)
        },
        outType,
        QUALITY
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("ไม่สามารถอ่านรูปได้"))
    }
    img.src = url
  })
}

const fmtSize = (bytes) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(0)}KB`
  : `${(bytes / 1024 / 1024).toFixed(2)}MB`

export default function SkuImageManager({ sku, onChange }) {
  const [open, setOpen] = useState(false)
  const [origFile, setOrigFile] = useState(null)
  const [compressedFile, setCompressedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [compressing, setCompressing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef(null)

  const close = () => {
    setOpen(false)
    setOrigFile(null)
    setCompressedFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setError("")
  }

  const onPick = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!ACCEPT.includes(f.type)) {
      setError("รองรับเฉพาะ JPG / PNG / WebP")
      return
    }
    if (f.size > MAX_SIZE) {
      setError(`ไฟล์ใหญ่เกิน 20MB (ปัจจุบัน ${fmtSize(f.size)})`)
      return
    }
    setError("")
    setOrigFile(f)
    setCompressing(true)
    try {
      const compressed = await compressImage(f)
      setCompressedFile(compressed)
      setPreviewUrl(URL.createObjectURL(compressed))
    } catch (err) {
      setError(err.message || "บีบอัดไม่สำเร็จ")
      setOrigFile(null)
    } finally {
      setCompressing(false)
    }
  }

  const onSave = async () => {
    if (!compressedFile) return
    setSaving(true)
    setError("")
    try {
      const newUrl = await uploadSkuImage(sku.sku_id, compressedFile, sku.image_url)
      onChange?.(sku.sku_id, newUrl)
      close()
    } catch (err) {
      setError(err.message || "อัปโหลดไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!confirm(`ลบรูปของ ${sku.sku_id}?`)) return
    setDeleting(true)
    setError("")
    try {
      await deleteSkuImage(sku.sku_id, sku.image_url)
      onChange?.(sku.sku_id, null)
      close()
    } catch (err) {
      setError(err.message || "ลบไม่สำเร็จ")
    } finally {
      setDeleting(false)
    }
  }

  const displayUrl = previewUrl || sku.image_url

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={sku.image_url ? "เปลี่ยน/ลบรูป" : "อัปโหลดรูป"}
        style={{
          width: 44, height: 44, flexShrink: 0,
          borderRadius: 8, overflow: "hidden",
          background: "var(--dx-bg-input)",
          border: "1px solid var(--dx-border)",
          cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {sku.image_url ? (
          <img src={sku.image_url} alt={sku.sku_id}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
        ) : (
          <ImageIcon size={18} color="var(--dx-text-muted)"/>
        )}
      </button>

      {open && (
        <div onClick={close} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--dx-bg-card)", borderRadius: 14,
            border: "1px solid var(--dx-border)",
            width: "100%", maxWidth: 440, padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--dx-text)" }}>
                  รูปสินค้า {sku.sku_id}
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--dx-text-muted)" }}>
                  JPG / PNG / WebP · ไม่เกิน 20MB · ระบบบีบอัดให้อัตโนมัติ
                </p>
              </div>
              <button onClick={close} style={{
                background: "transparent", border: "none", cursor: "pointer", padding: 4,
                color: "var(--dx-text-muted)",
              }}><X size={18}/></button>
            </div>

            <div style={{
              width: "100%", aspectRatio: "1 / 1", maxHeight: 280,
              background: "var(--dx-bg-input)",
              borderRadius: 10, border: "1px solid var(--dx-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", marginBottom: 10, position: "relative",
            }}>
              {compressing ? (
                <div style={{ textAlign: "center", color: "var(--dx-text-muted)" }}>
                  <Loader2 size={32} className="animate-spin" style={{ marginBottom: 8 }}/>
                  <p style={{ margin: 0, fontSize: 12 }}>กำลังบีบอัด...</p>
                </div>
              ) : displayUrl ? (
                <img src={displayUrl} alt={sku.sku_id}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}/>
              ) : (
                <div style={{ textAlign: "center", color: "var(--dx-text-muted)" }}>
                  <ImageIcon size={48} style={{ opacity: 0.4, marginBottom: 8 }}/>
                  <p style={{ margin: 0, fontSize: 12 }}>ยังไม่มีรูป</p>
                </div>
              )}
            </div>

            {origFile && compressedFile && !compressing && (
              <p style={{ margin: "0 0 10px", fontSize: 10, color: "var(--dx-text-muted)", textAlign: "center" }}>
                บีบอัด: <span className="dx-mono">{fmtSize(origFile.size)} → {fmtSize(compressedFile.size)}</span>
                {" "}({Math.round((1 - compressedFile.size / origFile.size) * 100)}% เล็กลง)
              </p>
            )}

            {error && (
              <div style={{
                padding: "8px 12px", marginBottom: 12, borderRadius: 8,
                background: "rgba(255,68,102,0.1)", color: "var(--dx-danger)",
                fontSize: 11, border: "1px solid rgba(255,68,102,0.3)",
              }}>{error}</div>
            )}

            <input ref={fileRef} type="file" accept={ACCEPT} onChange={onPick}
              style={{ display: "none" }}/>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => fileRef.current?.click()}
                disabled={saving || deleting || compressing}
                className="dx-btn dx-btn-ghost"
                style={{ flex: 1, minWidth: 130, padding: 10, fontSize: 12, justifyContent: "center" }}>
                <Upload size={14}/> เลือกรูป{sku.image_url ? "ใหม่" : ""}
              </button>

              {compressedFile && (
                <button onClick={onSave} disabled={saving || deleting || compressing}
                  className="dx-btn dx-btn-primary"
                  style={{ flex: 1, minWidth: 130, padding: 10, fontSize: 12, justifyContent: "center" }}>
                  {saving ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                  {saving ? "กำลังอัปโหลด..." : "บันทึก"}
                </button>
              )}

              {sku.image_url && !compressedFile && !compressing && (
                <button onClick={onDelete} disabled={saving || deleting}
                  style={{
                    flex: 1, minWidth: 130, padding: 10, fontSize: 12,
                    borderRadius: 8, border: "1px solid rgba(255,68,102,0.4)",
                    background: "transparent", color: "var(--dx-danger)",
                    cursor: "pointer", display: "inline-flex",
                    alignItems: "center", justifyContent: "center", gap: 6,
                    fontWeight: 600,
                  }}>
                  {deleting ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                  {deleting ? "กำลังลบ..." : "ลบรูป"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
