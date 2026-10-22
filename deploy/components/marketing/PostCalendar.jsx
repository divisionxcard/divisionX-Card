"use client"
// ปฏิทินโพสต์ — มุมมองรายเดือนของคอนเทนต์ที่โพสต์แล้ว/จองวันไว้
//
// ทำไมมีตัวกำหนดวันอยู่ในนี้ด้วย ไม่ใช่ปฏิทินอ่านอย่างเดียว:
// ตอนเริ่มทำ เช็กข้อมูลจริงแล้วพบว่า scheduled_at ว่างทั้ง 19 แถว (ไม่มีอะไรเซ็ตมันเลย)
// และมีแค่ 1 ชิ้นที่มี posted_at → ปฏิทินอ่านอย่างเดียวจะได้ตารางเปล่ามี 1 จุด
// ต้องมีทางปักวันก่อน ปฏิทินถึงจะมีอะไรให้แสดง
import { useState, useEffect, useCallback } from "react"
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, ExternalLink,
  Image as ImageIcon, Check, Clock, Inbox,
} from "lucide-react"
import { thaiDay, thaiMonthNow, monthCells, shiftMonth, scheduleAt, thaiTime } from "../../lib/thaiDate"

const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
                  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
const TH_DOW = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]
const PLATFORM_LABEL = { fb: "FB เพจ", line: "LINE OA", ig: "Instagram", tiktok: "TikTok" }
const SLOT_LABEL = { morning: "เช้า", evening: "เย็น" }

// 3 สถานะที่ต่างกันจริงในสายตาเจ้าของ:
//   posted    = ขึ้นเพจไปแล้ว
//   auto      = ถึงเวลาแล้วระบบยิงเอง ไม่ต้องกดอะไร  ← ต้องแยกให้ชัด เพราะ "จองวัน" เฉย ๆ ไม่ยิง
//   scheduled = จองวันไว้ แต่ยังมีอะไรค้างจนระบบจะไม่ยิง (ดู no_auto_reason)
const KIND = {
  posted:    { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "โพสต์แล้ว" },
  auto:      { dot: "bg-violet-500",  chip: "bg-violet-50 text-violet-800 border-violet-200",    label: "โพสต์อัตโนมัติ" },
  scheduled: { dot: "bg-blue-500",    chip: "bg-blue-50 text-blue-800 border-blue-200",          label: "จองเวลาไว้ (ยังไม่ยิงเอง)" },
}

// โพสต์ติดกันใกล้กว่านี้คนตามอ่านไม่ทัน ดูเหมือนสแปม — ตัวเลขเดียวกับที่ Hermes ใช้ (dvx_data.MIN_GAP_MINUTES)
const MIN_GAP_MIN = 45
const DEFAULT_TIME = "10:00"

// เวลาของชิ้นในปฏิทิน (ไทย) — ขึ้นเพจแล้วใช้เวลาที่ขึ้นจริง ยังไม่ขึ้นใช้เวลาที่ตั้งไว้
const timeOf = (it) => thaiTime(it.kind === "posted" ? it.posted_at : it.scheduled_at)

/** ช่องวัน + เวลา + ปุ่มบันทึก
 *  ⚠️ 22 ต.ค. 2026 — เดิมเลือกวันแล้วบันทึกทันที (ตรึง 10:00) · ตอนแอป Meta ยังไม่ Live พลาดไม่เสียหาย
 *     ตอนนี้โพสต์ขึ้นจริงแล้ว เผลอเลือกวันนี้ = ระบบโพสต์ทันทีในรอบถัดไป → ต้องกดบันทึกเองเสมอ */
function ScheduleForm({ day: day0, time: time0, today, busy, onSave, saveLabel = "บันทึก" }) {
  const [day, setDay] = useState(day0 || "")
  const [time, setTime] = useState(time0 || DEFAULT_TIME)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="date" value={day} min={today} disabled={busy}
        onChange={e => setDay(e.target.value)}
        className="flex-1 min-w-[8.5rem] text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 disabled:opacity-50" />
      <input type="time" value={time} step={300} disabled={busy}
        onChange={e => setTime(e.target.value)}
        className="w-[6.5rem] text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 disabled:opacity-50" />
      <button disabled={busy || !day || !time} onClick={() => onSave(day, time)}
        className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-40">
        {busy ? "กำลังบันทึก…" : saveLabel}
      </button>
    </div>
  )
}

export default function PostCalendar({ api, onPreview }) {
  const today = thaiDay(new Date())
  const [month, setMonth] = useState(thaiMonthNow())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [detail, setDetail] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async (mo) => {
    setLoading(true); setErr("")
    try { setData(await api(`calendar?month=${mo}`)) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load(month) }, [load, month])

  /** ปักวันเวลา / ย้าย / เอาออก — PATCH เดิมรับ scheduled_at อยู่แล้ว ไม่ต้องมี route ใหม่
   *  คืน true เมื่อบันทึกจริง (ผู้เรียกใช้ตัดสินว่าจะปิดหน้าต่างไหม) */
  async function setDate(id, day, time) {
    const iso = scheduleAt(day, time)
    if (iso) {
      // เวลาที่ผ่านมาแล้ว = ระบบโพสต์ขึ้นเพจในรอบถัดไป (ไม่เกิน 15 นาที) — ให้ยืนยันก่อน ไม่บล็อก
      // (เจ้าของอาจตั้งใจ "โพสต์เลย" · Hermes ถูกห้ามตั้งย้อนหลังเพราะมันวางแผน ไม่ได้กดเอง)
      if (new Date(iso) <= new Date() &&
          !window.confirm(`${day} ${time} น. ผ่านมาแล้ว — ระบบจะโพสต์ขึ้นเพจภายใน 15 นาทีหลังบันทึก\n\nยืนยันไหม`)) {
        return false
      }
      // ใกล้โพสต์อื่นที่วางไว้ในเดือนนี้เกินไป — กติกาเดียวกับ Hermes แต่คนกดเองให้ยืนยันแทนการบล็อก
      const near = Object.values(days).flat()
        .filter(o => o.id !== id && o.kind !== "posted" && o.scheduled_at &&
                     Math.abs(new Date(o.scheduled_at) - new Date(iso)) < MIN_GAP_MIN * 60000)
      if (near.length && !window.confirm(
        `ใกล้โพสต์ที่วางไว้แล้วเกินไป (ห่างไม่ถึง ${MIN_GAP_MIN} นาที): ` +
        near.map(o => `#${o.id} ${timeOf(o)} น.`).join(" · ") + "\n\nยืนยันเวลานี้ไหม")) {
        return false
      }
    }
    setBusyId(id)
    try {
      await api("content", { method: "PATCH", body: JSON.stringify({ id, scheduled_at: iso }) })
      await load(month)
      return true
    } catch (e) { setErr(e.message); return false } finally { setBusyId(null) }
  }

  const cells = monthCells(month)
  const days = data?.days || {}
  const [yy, mm] = month.split("-").map(Number)

  return (
    <section>
      {/* ── หัวปฏิทิน ── */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <CalendarIcon size={16} className="text-blue-600" /> ปฏิทินโพสต์
        </h2>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))}
            className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-gray-500
                       flex items-center justify-center hover:bg-gray-50">
            <ChevronLeft size={15} />
          </button>
          <span className="px-2 text-sm font-semibold text-gray-800 min-w-[9rem] text-center">
            {TH_MONTH[mm - 1]} {yy + 543}
          </span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))}
            className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-gray-500
                       flex items-center justify-center hover:bg-gray-50">
            <ChevronRight size={15} />
          </button>
          {month !== today.slice(0, 7) && (
            <button onClick={() => setMonth(today.slice(0, 7))}
              className="ml-1 px-2 py-1 rounded-lg text-xs text-blue-600 hover:bg-blue-50">
              เดือนนี้
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 ml-auto text-xs text-gray-500">
          {Object.entries(KIND).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${v.dot}`} /> {v.label}
              {data && <span className="text-gray-400">{data.counts?.[k] ?? 0}</span>}
            </span>
          ))}
          {loading && <span className="text-gray-400">กำลังโหลด…</span>}
        </div>
      </div>

      {err && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{err}</div>
      )}

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        {/* ── ตารางเดือน ── */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {TH_DOW.map(d => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              // เรียงตามเวลาในวัน — พอตั้งเวลาได้ ชิ้นเช้าต้องอยู่บนชิ้นเย็น
              const items = day ? [...(days[day] || [])].sort((a, b) => (timeOf(a) || "").localeCompare(timeOf(b) || "")) : []
              const isToday = day === today
              return (
                <div key={i}
                  className={`min-h-[92px] border-r border-b border-gray-50 p-1.5 last:border-r-0
                              ${!day ? "bg-gray-50/60" : ""}`}>
                  {day && (
                    <>
                      <div className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday ? "bg-blue-600 text-white font-semibold" : "text-gray-400"}`}>
                        {Number(day.slice(-2))}
                      </div>
                      <div className="space-y-1">
                        {items.slice(0, 3).map(it => (
                          <button key={it.id} onClick={() => setDetail(it)}
                            title={it.caption?.slice(0, 120)}
                            className={`block w-full text-left px-1.5 py-1 rounded-md border text-[11px]
                                        leading-tight truncate ${KIND[it.kind].chip}`}>
                            {timeOf(it) ? `${timeOf(it)} · ` : it.slot ? `${SLOT_LABEL[it.slot]} · ` : ""}
                            {(it.caption || "").replace(/\s+/g, " ").slice(0, 40) || `#${it.id}`}
                          </button>
                        ))}
                        {items.length > 3 && (
                          <p className="text-[10px] text-gray-400 pl-1">+ อีก {items.length - 3}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── ยังไม่ได้กำหนดวัน ──
            ปฏิทินจะว่างตลอดถ้าไม่มีทางปักวัน — กล่องนี้คือทางนั้น */}
        <div className="w-full xl:w-72 xl:shrink-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <Inbox size={15} className="text-gray-400" /> ยังไม่ได้กำหนดวัน
            {data && (
              <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs">
                {data.counts?.unscheduled ?? 0}
              </span>
            )}
          </h3>

          {!data ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-400">กำลังโหลด…</div>
          ) : (data.unscheduled || []).length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-500">
              ปักวันครบทุกชิ้นแล้ว
            </div>
          ) : (
            <div className="space-y-2">
              {data.unscheduled.map(it => (
                <div key={it.id} className="bg-white rounded-xl border border-gray-100 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {PLATFORM_LABEL[it.platform] || it.platform}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${it.status === "approved"
                      ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {it.status === "approved" ? "อนุมัติแล้ว" : "รออนุมัติ"}
                    </span>
                    <span className="text-gray-300 ml-auto">#{it.id}</span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-1.5">
                    {(it.caption || "").replace(/\s+/g, " ").slice(0, 90)}
                  </p>
                  {/* ช่อง date/time ของเบราว์เซอร์โชว์รูปแบบตาม locale เครื่อง (บางเครื่องเป็น mm/dd/yyyy)
                      ใส่ป้ายกำกับไว้ ไม่งั้นคนไม่รู้ว่าช่องนี้คืออะไร */}
                  <label className="block text-[10px] text-gray-400 mb-0.5">เลือกวันและเวลาที่จะโพสต์ (เวลาไทย)</label>
                  <ScheduleForm today={today} busy={busyId === it.id} saveLabel="ตั้งเวลา"
                    onSave={(d, t) => setDate(it.id, d, t)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── รายละเอียดโพสต์ ── */}
      {detail && (
        <div onClick={() => setDetail(null)}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-auto">
            <div className="flex items-center gap-2 p-4 border-b border-gray-100">
              <span className={`w-2 h-2 rounded-full ${KIND[detail.kind].dot}`} />
              <span className="text-sm font-semibold text-gray-800">{KIND[detail.kind].label}</span>
              <span className="text-xs text-gray-400">
                {PLATFORM_LABEL[detail.platform] || detail.platform} · #{detail.id}
              </span>
              <button onClick={() => setDetail(null)}
                className="ml-auto w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500
                           flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="p-4">
              {detail.media_url && (
                <img src={detail.media_url} alt=""
                  onClick={() => onPreview?.(detail.media_url)}
                  className="w-full rounded-xl border border-gray-100 mb-3 cursor-zoom-in" />
              )}
              {/* บอกให้ชัดว่าชิ้นนี้จะยิงเองหรือไม่ยิง — คำถามแรกของคนเปิดดูคือ "ต้องกดอะไรอีกไหม" */}
              {detail.kind === "auto" && (
                <div className="mb-3 text-xs rounded-lg border border-violet-200 bg-violet-50 text-violet-800 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock size={13} /> ระบบจะโพสต์ขึ้นเพจเองเมื่อถึงเวลา — ไม่ต้องกดอะไรอีก
                  </div>
                  <p className="mt-1 opacity-90">
                    {new Date(detail.scheduled_at).toLocaleString("th-TH", {
                      dateStyle: "full", timeStyle: "short", timeZone: "Asia/Bangkok",
                    })} · ตรวจคิวทุก 15 นาที จึงอาจคลาดได้ไม่เกิน 15 นาที
                  </p>
                </div>
              )}
              {detail.kind === "scheduled" && detail.no_auto_reason && (
                <div className="mb-3 text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock size={13} /> จองวันไว้แล้ว แต่ระบบจะยังไม่โพสต์เอง
                  </div>
                  <p className="mt-1 opacity-90">{detail.no_auto_reason}</p>
                </div>
              )}

              <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.caption}</p>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {detail.post_url && (
                  <a href={detail.post_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">
                    <ExternalLink size={14} /> เปิดโพสต์จริง
                  </a>
                )}
                {/* ⚠ ต้องรับทั้ง scheduled และ auto — ตอนเพิ่ม kind "auto" เกือบทำให้ปุ่มเลื่อน/เอาวันออก
                    หายไปจากชิ้นที่ตั้งเวลาไว้แล้ว ซึ่งเป็นชิ้นที่ต้องแก้วันบ่อยที่สุด */}
                {(detail.kind === "scheduled" || detail.kind === "auto") && (
                  <div className="w-full space-y-2">
                    <label className="block text-[11px] text-gray-400">เลื่อนวันหรือเวลาโพสต์ (เวลาไทย)</label>
                    <ScheduleForm key={detail.id} today={today} busy={busyId === detail.id}
                      day={thaiDay(detail.scheduled_at)} time={thaiTime(detail.scheduled_at)}
                      saveLabel="บันทึกเวลาใหม่"
                      onSave={(d, t) => setDate(detail.id, d, t).then(ok => ok && setDetail(null))} />
                    <button onClick={() => setDate(detail.id, null).then(ok => ok && setDetail(null))}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm">
                      เอาวันเวลาออก
                    </button>
                  </div>
                )}
                {detail.posted_at && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Check size={13} /> โพสต์เมื่อ{" "}
                    {new Date(detail.posted_at).toLocaleString("th-TH", {
                      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
