import { useState, useRef } from "react"
import { Image as ImageIcon, Upload, Trash2, X, Loader2 } from "lucide-react"
import { uploadSkuImage, deleteSkuImage } from "../../lib/supabase"

const MAX_SIZE = 2 * 1024 * 1024
const ACCEPT = "image/jpeg,image/png,image/webp"

export default function SkuImageManager({ sku, onChange }) {
  const [open, setOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef(null)

  const close = () => {
    setOpen(false)
    setSelectedFile(null)
    setPreviewUrl(null)
    setError("")
  }

  const onPick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!ACCEPT.includes(f.type)) {
      setError("รองรับเฉพาะ JPG / PNG / WebP")
      return
    }
    if (f.size > MAX_SIZE) {
      setError(`ไฟล์ใหญ่เกิน 2MB (ปัจจุบัน ${(f.size / 1024 / 1024).toFixed(2)}MB)`)
      return
    }
    setError("")
    setSelectedFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const onSave = async () => {
    if (!selectedFile) return
    setSaving(true)
    setError("")
    try {
      const newUrl = await uploadSkuImage(sku.sku_id, selectedFile, sku.image_url)
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
                  JPG / PNG / WebP · ไม่เกิน 2MB
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
              overflow: "hidden", marginBottom: 14,
            }}>
              {displayUrl ? (
                <img src={displayUrl} alt={sku.sku_id}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}/>
              ) : (
                <div style={{ textAlign: "center", color: "var(--dx-text-muted)" }}>
                  <ImageIcon size={48} style={{ opacity: 0.4, marginBottom: 8 }}/>
                  <p style={{ margin: 0, fontSize: 12 }}>ยังไม่มีรูป</p>
                </div>
              )}
            </div>

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
                disabled={saving || deleting}
                className="dx-btn dx-btn-ghost"
                style={{ flex: 1, minWidth: 130, padding: 10, fontSize: 12, justifyContent: "center" }}>
                <Upload size={14}/> เลือกรูป{sku.image_url ? "ใหม่" : ""}
              </button>

              {selectedFile && (
                <button onClick={onSave} disabled={saving || deleting}
                  className="dx-btn dx-btn-primary"
                  style={{ flex: 1, minWidth: 130, padding: 10, fontSize: 12, justifyContent: "center" }}>
                  {saving ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                  {saving ? "กำลังอัปโหลด..." : "บันทึก"}
                </button>
              )}

              {sku.image_url && !selectedFile && (
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
