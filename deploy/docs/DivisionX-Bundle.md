# DivisionX Card — Complete Design Input Bundle

> ไฟล์รวมทุกอย่างที่ Claude Design ต้องใช้: brief + code + config

---

# PART 1: Design Brief

# DivisionX Card — Design Brief
สำหรับอัปโหลดเข้า Claude Design (onboarding → สร้าง design system)

> ## 🚨 PIVOT ครั้งใหญ่ — เปลี่ยนเป็น Dark Theme
>
> **เดิม:** light theme (white bg, soft colors)
> **ใหม่:** **Dark Navy + Neon Cyan** — ตาม brand ที่ใช้อยู่ในโปสเตอร์การตลาด/ตู้จริง
>
> ดู reference image 2 รูป (poster + banner) ที่อัปโหลดมาพร้อมไฟล์นี้ — นั่นคือ brand identity ที่ต้องการ
>
> - Feel: tech / futuristic / premium
> - มี glow effects (cyan border, subtle shine)
> - ตัวอักษรไทยอ่านง่ายบน dark bg
> - Keep: rounded-2xl, flat surfaces + subtle borders, color-coded by function (แต่ palette ใหม่)

## เกี่ยวกับแอป

**DivisionX Card** — ระบบจัดการตู้ขายการ์ด One Piece (vending machine)
- **User base:** เจ้าของธุรกิจ + แอดมินผู้ดูแลตู้ (ผู้ใช้ทั้งหมดคือเจ้าหน้าที่ internal — ไม่ใช่ลูกค้าทั่วไป)
- **Language:** ภาษาไทยเป็นหลัก + ตัวเลข/SKU เป็นอังกฤษ
- **Stack:** Next.js 14 + React 18 + Tailwind CSS + Supabase + recharts + lucide-react
- **Layout:** Sidebar (desktop) / Drawer (mobile) + main content area
- **Device:** ใช้ทั้งมือถือ (เติมตู้ภาคสนาม) และเดสก์ท็อป (รายงาน/วิเคราะห์)

## Design Principles ที่ใช้อยู่

1. **Flat + soft shadows** — `shadow-sm`, `border border-gray-100`
2. **Rounded-2xl** สำหรับ card (227 ครั้งใน 12 หน้า)
3. **Color-coded by function** (ไม่ใช่ random):
   - Blue = ข้อมูลทั่วไป / primary action (เบิก, บันทึก)
   - Orange = refill / vending (สีหลักของแอป)
   - Green = success / ยอดรับเข้า / positive balance
   - Red = error / ลบ / ใกล้หมด / เกินสต็อก
   - Amber = warning / ใกล้หมด (soft) / low stock
   - Purple = premium / cost / analytics
   - Emerald = EB series
4. **Icon-first** — ใช้ lucide-react ทุกหน้า
5. **Thai typography** — default system font (ยังไม่กำหนด font ไทยเฉพาะ)

## 🎨 NEW Brand Color Tokens (dark theme — target)

### Backgrounds
```js
bg: {
  page:      "#0A1628",  // navy ดีปสุด (page bg, behind everything)
  surface:   "#132947",  // panel/sidebar
  card:      "#1A2F52",  // card bg
  elevated:  "#1E3A5F",  // hover / active / modal
  input:     "#0F1F3D",  // input bg (ดีปกว่า card เล็กน้อย)
}
```

### Accent (cyan — แทน orange/blue เดิม)
```js
accent: {
  cyan:       "#00D4FF",  // PRIMARY — buttons, active tabs, CTA
  cyanBright: "#00E5FF",  // glow, hover, highlight
  cyanSoft:   "#4FC3F7",  // secondary hover
  cyanAlpha:  "#00D4FF33", // translucent glow (borders, shine)
}
```

### Text
```js
text: {
  primary:   "#FFFFFF",   // headings, KPI values, important numbers
  secondary: "#B8C5E0",   // body, general content
  muted:     "#7A8BA8",   // labels, subs, meta
  disabled:  "#4A5A7A",
  onAccent:  "#0A1628",   // text บนปุ่ม cyan (dark on light)
}
```

### Semantic
```js
semantic: {
  success:   "#00FF88",   // PROMO ACTIVE dot, confirm, positive
  warning:   "#FFC857",   // low stock (เดิม amber)
  danger:    "#FF4466",   // LIMITED tag, error, destructive
  info:      "#00D4FF",   // = cyan accent (reuse)
}
```

### Borders
```js
border: {
  subtle:  "#1E3A5F",      // card borders, dividers
  strong:  "#2A4472",      // input borders
  glow:    "#00D4FF66",    // cyan glow border (active/hover)
  accent:  "#00D4FF",      // selected state
}
```

### SKU Series (ต้องปรับให้เด่นบน dark — ไม่ใช่สีเดิมแล้ว)
```js
// สีเดิมเข้มเกินไปบน dark bg — ใช้ variant สว่างขึ้น
SERIES_COLOR = {
  OP:  "#4FC3F7",  // One Piece (cyan-light, เข้ากับ brand)
  PRB: "#B794F6",  // Premium Booster (purple-light)
  EB:  "#68D391",  // Extra Booster (green-light)
}
```

### Chart palette (ต้อง vibrant บน dark bg)
```js
CHART_COLORS = ["#00D4FF","#B794F6","#68D391","#FFC857","#FF4466","#4FC3F7"]
```

---

## 📦 OLD Color Tokens (light theme เดิม — reference เพื่อ translate เท่านั้น)

> **หมายเหตุ:** ด้านล่างนี้คือ state ปัจจุบันของโค้ด เพื่อให้เห็นว่าต้องแปลงจากอะไรเป็นอะไร — **ไม่ใช่ target**

Old:
- Brand: orange (primary) / blue (secondary) / red (danger)
- Bg: `bg-white` (card), `bg-gray-50` (page)
- Text: `text-gray-800` / `text-gray-700` / `text-gray-500`

Translation guide:
| Old | New |
|-----|-----|
| `bg-white` | `bg-[#1A2F52]` (card) |
| `bg-gray-50` | `bg-[#0A1628]` (page) |
| `text-gray-800` | `text-white` |
| `text-gray-500` | `text-[#B8C5E0]` |
| `text-gray-400` | `text-[#7A8BA8]` |
| `border-gray-100` | `border-[#1E3A5F]` |
| `bg-orange-500` (primary) | `bg-[#00D4FF]` + `text-[#0A1628]` |
| `bg-blue-600` (action) | `bg-[#00D4FF]` + `text-[#0A1628]` |

## Typography

| Level | Classes |
|-------|---------|
| H1 (page title) | `text-2xl font-bold text-gray-800` |
| H2 (section) | `font-semibold text-gray-700` |
| Body | `text-sm` default |
| Small label | `text-xs text-gray-500` |
| Muted/sub | `text-xs text-gray-400` |
| Mono (SKU/Lot) | `font-mono text-xs font-bold` |
| KPI value | `text-xl sm:text-2xl font-bold text-gray-800` |

## Spacing & Layout

- **Card padding:** `p-5` (large), `p-4` (medium), `p-3` (small/row)
- **Card gap:** `gap-4` (grid), `gap-3` (compact)
- **Page sections:** `space-y-6`
- **Form fields:** `space-y-4`
- **Input padding:** `px-3 py-2 text-sm`
- **Button padding:** `py-2.5` (primary), `py-1.5` (secondary/chip)

## Component Patterns

### KPI Card (ใช้ทุกหน้า)
```jsx
<KpiCard icon={Package} label="สต็อกรวม" value="12,345 ซอง" sub="≈ 515 กล่อง" color="blue"/>
```
- ไอคอนกลมใน colored bg (rounded-xl p-3 bg-{color}-50 text-{color}-600)
- label เล็ก, value ใหญ่, sub เล็กกว่าอีก

### Badge (SKU series)
```jsx
<Badge series="OP"/>   // บลู
<Badge series="PRB"/>  // ม่วง
<Badge series="EB"/>   // เขียว
```

### StatusDot (machine active/inactive)
```jsx
<StatusDot status="active"/>  // green dot
<StatusDot status="inactive"/>  // gray dot
```

### Tabs (sub-navigation)
```jsx
<div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
  <button className="px-4 py-2 rounded-lg ...bg-white shadow text-blue-600">Tab 1</button>
  <button className="px-4 py-2 rounded-lg ...text-gray-500">Tab 2</button>
</div>
```

### Toast (notification)
- Position: fixed top-4 (mobile full-width, desktop sm:max-w-sm sm:right-4)
- Colors: `bg-green-500` (success), `bg-red-500` (error)
- Auto-dismiss 3-3.5s

### Modal (EditStockOutModal, EditStockInModal)
- `fixed inset-0 bg-black/50 z-50` overlay
- `bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto`
- Header + body + footer (3 sections, border-between)

### Inline confirm (delete)
- ใช้ในหลายหน้า: กดปุ่มลบ 1 ครั้ง → แสดง confirm inline (ยกเลิก / ลบ) → กดลบจริง
- Pattern: `bg-red-50 border-red-100` rounded corner

## Pain Points ปัจจุบัน (สิ่งที่อยากให้ Claude Design ช่วย)

1. **Dark theme ใหม่ทั้งระบบ** — ตาม brand (ดู reference images) แต่ต้องไม่เสียความอ่านง่าย/ accessibility
2. **Neon glow effects** — cyan border glow บน active state, KPI value, card hover (ดู poster image)
3. **Mobile responsive ยังไม่ครบ** — มี `sm:/md:` breakpoints แค่ 39 จุดในทั้งแอป (ต้อง thumb-friendly มากขึ้น)
4. **Tables แน่นเกินไปบนมือถือ** — หลายหน้ามี 6-8 columns ต้อง scroll horizontal
5. **Empty state เรียบเกินไป** — แค่ text "ยังไม่มีข้อมูล" ไม่มี illustration หรือ CTA
6. **Print layout** (`PageMachineStockView` → รายงานเติมสินค้า) — **ต้อง keep light theme** (หมึกพิมพ์ประหยัด) ไม่ใช่ dark
7. **Inconsistency เล็ก ๆ** — บางหน้าใช้ `rounded-xl` บางหน้า `rounded-2xl` · padding `p-4` vs `p-5` สลับไป-มา

## ขอบเขต Claude Design

**เป้าหมาย:** สร้าง design system ที่:
- Export เป็น design tokens (JSON/JS) นำไปใส่ `shared/design-tokens.js` ได้
- มี component library กลาง (Button, Card, Input, Modal, Badge, KpiCard) เป็น React component + Tailwind
- ครอบคลุม variant มือถือ + เดสก์ท็อป + print
- รองรับ dark mode (optional)

**สิ่งที่จะไปต่อหลังได้ design system แล้ว:**
1. Mockup หน้ามือถือ PageDashboard / PageSales / PageRefillPrep
2. ทำ print template ใบงานเติมสินค้าให้สวยขึ้น
3. Empty state illustration
4. New feature mockups (audit log, proxy refill mode)

---

# PART 2: Stack Config

## tailwind.config.js
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
}
```

## package.json (dependencies)
```json
{
  "name": "divisionx-card",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7",
    "lucide-react": "^0.383.0",
    "@supabase/supabase-js": "^2.43.4"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3"
  }
}
```

---

# PART 3: Shared Components (กลาง)

## shared/constants.js
```js
// ─────────────────────────────────────────────
// STATIC SKU DATA (ราคา/ต้นทุน)
// ─────────────────────────────────────────────
export const SKUS = [
  { sku_id:"OP 01",  name:"One Piece OP-01",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 02",  name:"One Piece OP-02",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 03",  name:"One Piece OP-03",    series:"OP",  packs_per_box:24, sell_price:60,  cost_price:42 },
  { sku_id:"OP 04",  name:"One Piece OP-04",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 05",  name:"One Piece OP-05",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 06",  name:"One Piece OP-06",    series:"OP",  packs_per_box:24, sell_price:65,  cost_price:45 },
  { sku_id:"OP 07",  name:"One Piece OP-07",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 08",  name:"One Piece OP-08",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 09",  name:"One Piece OP-09",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 10",  name:"One Piece OP-10",    series:"OP",  packs_per_box:24, sell_price:70,  cost_price:48 },
  { sku_id:"OP 11",  name:"One Piece OP-11",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 12",  name:"One Piece OP-12",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 13",  name:"One Piece OP-13",    series:"OP",  packs_per_box:24, sell_price:75,  cost_price:52 },
  { sku_id:"OP 14",  name:"One Piece OP-14",    series:"OP",  packs_per_box:24, sell_price:80,  cost_price:55 },
  { sku_id:"OP 15",  name:"One Piece OP-15",    series:"OP",  packs_per_box:24, sell_price:80,  cost_price:55 },
  { sku_id:"PRB 01", name:"Premium Booster 01", series:"PRB", packs_per_box:10, boxes_per_cotton:10, sell_price:150, cost_price:110 },
  { sku_id:"PRB 02", name:"Premium Booster 02", series:"PRB", packs_per_box:10, boxes_per_cotton:20, sell_price:180, cost_price:130 },
  { sku_id:"EB 01",  name:"Extra Booster 01",   series:"EB",  packs_per_box:24, sell_price:120, cost_price:85  },
  { sku_id:"EB 02",  name:"Extra Booster 02",   series:"EB",  packs_per_box:24, sell_price:120, cost_price:85  },
  { sku_id:"EB 03",  name:"Extra Booster 03",   series:"EB",  packs_per_box:24, sell_price:130, cost_price:90  },
  { sku_id:"EB 04",  name:"Extra Booster 04",   series:"EB",  packs_per_box:24, sell_price:130, cost_price:90  },
]

export const SERIES_COLOR = { OP: "#3b82f6", PRB: "#8b5cf6", EB: "#10b981" }
export const CHART_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4"]

export const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

export const SKU_SERIES_ORDER = { OP: 0, EB: 1, PRB: 2 }

export const UNIT_LABEL = { pack: "ซอง", box: "กล่อง", cotton: "Cotton" }
```

## shared/helpers.js
```js
import { THAI_MONTHS, SKU_SERIES_ORDER } from "./constants"

export const fmt   = (n) => (n ?? 0).toLocaleString("th-TH")
export const fmtB  = (n) => `฿${(n ?? 0).toLocaleString("th-TH")}`
export const today = () => new Date().toISOString().slice(0, 10)

export const getSkuSeries = (skuId) => {
  if (!skuId) return "ZZ"
  if (skuId.startsWith("OP"))  return "OP"
  if (skuId.startsWith("PRB")) return "PRB"
  if (skuId.startsWith("EB"))  return "EB"
  return "ZZ"
}

export const sortSkus = (list) => [...list].sort((a, b) => {
  const sa = SKU_SERIES_ORDER[getSkuSeries(a.sku_id)] ?? 9
  const sb = SKU_SERIES_ORDER[getSkuSeries(b.sku_id)] ?? 9
  if (sa !== sb) return sa - sb
  return (a.sku_id || "").localeCompare(b.sku_id || "")
})

// เรียง: วันที่ล่าสุดก่อน → แล้วตาม Series (OP→PRB→EB) → แล้วตาม SKU ID
export const sortByDateThenSku = (a, b, dateField) => {
  const dateA = a[dateField] || a.created_at || ""
  const dateB = b[dateField] || b.created_at || ""
  const dateCmp = dateB.localeCompare(dateA)
  if (dateCmp !== 0) return dateCmp
  const seriesA = SKU_SERIES_ORDER[getSkuSeries(a.sku_id)] ?? 9
  const seriesB = SKU_SERIES_ORDER[getSkuSeries(b.sku_id)] ?? 9
  if (seriesA !== seriesB) return seriesA - seriesB
  return (a.sku_id || "").localeCompare(b.sku_id || "")
}

// แสดงจำนวนเป็น "X กล่อง Y ซอง" (ซ่อน 0 กล่อง / 0 ซอง)
export const fmtBoxPack = (packs, ppb) => {
  if (!packs || packs === 0) return "0 ซอง"
  const boxes = Math.floor(packs / ppb)
  const rem   = packs % ppb
  if (boxes === 0) return `${fmt(rem)} ซอง`
  if (rem   === 0) return `${fmt(boxes)} กล่อง`
  return `${fmt(boxes)} กล่อง ${rem} ซอง`
}

export function getLastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

export function fmtDayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00")
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]}`
}

export function convertToPacks(qty, unit, sku) {
  if (unit === "pack")   return qty
  if (unit === "box")    return qty * sku.packs_per_box
  if (unit === "cotton") return qty * (sku.boxes_per_cotton || 12) * sku.packs_per_box
  return qty
}
```

## shared/KpiCard.jsx
```jsx
export default function KpiCard({ icon: Icon, label, value, sub, color }) {
  const bg = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    amber:  "bg-amber-50 text-amber-600",
    red:    "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex gap-4 items-start">
      <div className={`rounded-xl p-3 ${bg[color]}`}><Icon size={22}/></div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-gray-800 break-all">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
```

## shared/ui.jsx
```jsx
export function Badge({ series }) {
  const c = { OP:"bg-blue-100 text-blue-700", PRB:"bg-purple-100 text-purple-700", EB:"bg-emerald-100 text-emerald-700" }
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c[series] ?? "bg-gray-100 text-gray-600"}`}>{series}</span>
}

export function StatusDot({ status }) {
  return <span className={`inline-block w-2 h-2 rounded-full mr-1 ${status==="active"?"bg-green-500":"bg-gray-400"}`}/>
}
```

---

# PART 4: Sample Pages (เลือกมา 4 หน้า ตัวแทน pattern ต่างกัน)

## pages/PageDashboard.jsx — หน้าซับซ้อน KPI grid + SKU cards
```jsx
import { useState } from "react"
import {
  Package, AlertTriangle, Layers, TrendingUp, Search, Clock,
} from "lucide-react"
import { UNIT_LABEL } from "../shared/constants"
import { fmt, fmtB, fmtBoxPack } from "../shared/helpers"
import KpiCard from "../shared/KpiCard"
import { Badge } from "../shared/ui"

export default function PageDashboard({ stockIn, stockOut, stockBalance, skus }) {
  const [expandedSku, setExpandedSku] = useState(null)
  const [seriesSel,   setSeriesSel]   = useState("ทั้งหมด")
  const [search,      setSearch]      = useState("")

  // Balance map from view
  const balMap = Object.fromEntries(stockBalance.map(r => [r.sku_id, {
    total_in:  parseFloat(r.total_in)  || 0,
    total_out: parseFloat(r.total_out) || 0,
    balance:   parseFloat(r.balance)   || 0,
  }]))

  const totalPacks     = stockBalance.reduce((a, r) => a + (parseFloat(r.balance) || 0), 0)
  const lowStock       = skus.filter(s => (balMap[s.sku_id]?.balance || 0) < 24)
  const totalLotValue  = stockIn.reduce((a, r) => a + (parseFloat(r.total_cost) || 0), 0)

  // Lots grouped by SKU (sorted newest first)
  const lotsMap = {}
  stockIn.forEach(r => {
    if (!lotsMap[r.sku_id]) lotsMap[r.sku_id] = []
    lotsMap[r.sku_id].push(r)
  })
  Object.values(lotsMap).forEach(arr =>
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  )

  const SERIES_ORDER = { OP: 0, EB: 1, PRB: 2 }
  const filtered = skus
    .filter(s => s.sku_id.toLowerCase().includes(search.toLowerCase()) ||
                 s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => seriesSel === "ทั้งหมด" || s.series === seriesSel)
    .sort((a, b) => (SERIES_ORDER[a.series] ?? 9) - (SERIES_ORDER[b.series] ?? 9) || a.sku_id.localeCompare(b.sku_id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">ภาพรวมสต็อกสินค้า</h1>
        <p className="text-sm text-gray-400">สต็อกคงเหลือแยกตาม SKU พร้อมประวัติ Lot ต้นทุน</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Package}       label="สต็อกรวม"      value={`${fmt(totalPacks)} ซอง`}    sub={`≈ ${fmt(Math.floor(totalPacks / 12))} กล่อง`} color="blue"/>
        <KpiCard icon={AlertTriangle} label="ใกล้หมด"       value={`${lowStock.length} SKU`}   sub="ต่ำกว่า 24 ซอง"    color="amber"/>
        <KpiCard icon={Layers}        label="Lot ทั้งหมด"   value={`${stockIn.length} Lot`}     sub="รายการรับเข้า"    color="green"/>
        <KpiCard icon={TrendingUp}    label="มูลค่าซื้อรวม" value={fmtB(totalLotValue)}         sub="ต้นทุนสะสมทั้งหมด" color="purple"/>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา SKU..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"/>
        </div>
        <div className="flex gap-1">
          {["ทั้งหมด","OP","PRB","EB"].map(s => (
            <button key={s} onClick={() => setSeriesSel(s)}
              className={`px-3 py-2 text-xs rounded-lg font-medium transition-all ${seriesSel===s?"bg-blue-600 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* SKU Cards — Visual Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered.map(s => {
          const b          = balMap[s.sku_id] || { balance:0, total_in:0, total_out:0 }
          const low        = b.balance < 24
          const lots       = lotsMap[s.sku_id] || []
          const isExpanded = expandedSku === s.sku_id

          // Moving Average Cost (ต้นทุนเฉลี่ยเคลื่อนที่ — ตรึงไว้จนกว่าจะรับของใหม่)
          const avgCpp = s.avg_cost || 0

          // แปลงหน่วยแสดงผล
          const balCotton = Math.floor(b.balance / (12 * s.packs_per_box))
          const balBoxes  = Math.floor((b.balance % (12 * s.packs_per_box)) / s.packs_per_box)
          const balPacks  = b.balance % s.packs_per_box

          // สีของ series
          const seriesBg = { OP: "from-blue-500 to-blue-600", PRB: "from-purple-500 to-purple-600", EB: "from-emerald-500 to-emerald-600" }
          const seriesBgLight = { OP: "from-blue-50 to-blue-100", PRB: "from-purple-50 to-purple-100", EB: "from-emerald-50 to-emerald-100" }

          // Progress
          const maxPacks = lots.reduce((a, r) => a + (r.quantity_packs || 0), 0) || 1
          const pctRemain = Math.min(100, (b.balance / maxPacks) * 100)

          return (
            <div key={s.sku_id} className="flex flex-col">
              {/* Card */}
              <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md cursor-pointer
                ${low && b.balance > 0 ? "border-amber-300 ring-1 ring-amber-100" : b.balance === 0 ? "border-red-300 ring-1 ring-red-100" : "border-gray-100"}`}
                onClick={() => setExpandedSku(isExpanded ? null : s.sku_id)}>

                {/* Image area */}
                <div className={`relative h-32 bg-gradient-to-br ${seriesBgLight[s.series] || "from-gray-50 to-gray-100"} flex items-center justify-center overflow-hidden`}>
                  {s.image_url ? (
                    <img src={s.image_url} alt={s.sku_id}
                      className="h-full w-full object-contain p-2"
                      onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
                  ) : null}
                  <div className={`${s.image_url ? 'hidden' : 'flex'} w-16 h-16 rounded-2xl bg-gradient-to-br ${seriesBg[s.series] || "from-gray-400 to-gray-500"} items-center justify-center shadow-lg`}>
                    <span className="text-white font-black text-xs leading-tight text-center">{s.sku_id}</span>
                  </div>
                  {/* Status badge */}
                  {b.balance === 0 && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">หมด</div>
                  )}
                  {low && b.balance > 0 && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">ใกล้หมด</div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge series={s.series}/>
                    <span className="font-mono text-xs font-bold text-gray-700">{s.sku_id}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-3" title={s.name}>{s.name}</p>

                  {/* Stock display */}
                  <div className="space-y-1.5">
                    {balCotton > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Cotton</span>
                        <span className="text-sm font-bold text-gray-800">{fmt(balCotton)}</span>
                      </div>
                    )}
                    {balBoxes > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">กล่อง</span>
                        <span className="text-sm font-bold text-gray-800">{fmt(balBoxes)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">ซอง</span>
                      <span className={`text-sm font-bold ${b.balance === 0 ? "text-red-500" : low ? "text-amber-600" : "text-gray-800"}`}>
                        {balCotton > 0 || balBoxes > 0 ? fmt(balPacks) : fmt(b.balance)}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400">รวม</span>
                      <span className={`text-xs font-semibold ${b.balance === 0 ? "text-red-500" : low ? "text-amber-600" : "text-blue-600"}`}>
                        {fmt(b.balance)} ซอง
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${b.balance === 0 ? "bg-red-400" : low ? "bg-amber-400" : "bg-green-400"}`}
                      style={{width:`${pctRemain}%`}}/>
                  </div>

                  {/* Cost */}
                  {avgCpp > 0 && (
                    <p className="text-xs text-purple-500 mt-1.5 text-center">ต้นทุน {fmtB(avgCpp.toFixed(2))}/ซอง</p>
                  )}
                </div>
              </div>

              {/* Expanded Lot detail — below card */}
              {isExpanded && (
                <div className="mt-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden col-span-full">
                  {/* Summary bar */}
                  <div className="px-4 py-3 bg-gray-50 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span className="font-semibold text-gray-600">{s.sku_id} — {s.name}</span>
                    <span className="text-blue-600 font-medium">
                      รับเข้า: {fmtBoxPack(b.total_in, s.packs_per_box)}
                    </span>
                    <span className="text-orange-500 font-medium">
                      เบิกออก: {fmtBoxPack(b.total_out, s.packs_per_box)}
                    </span>
                    {avgCpp > 0 && (
                      <span className="text-purple-600 font-medium">ต้นทุน: {fmtB(avgCpp.toFixed(2))}/ซอง</span>
                    )}
                    <span className="text-gray-500">{lots.length} Lot</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {lots.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูลการรับสินค้า</p>
                    ) : (() => {
                      const activeLots = []
                      const depletedLots = []
                      // FIFO: กระจาย stock_out ทั้งหมดของ SKU ลง lot เรียงจากเก่าสุด
                      const skuTotalOut = stockOut.filter(r => r.sku_id === s.sku_id).reduce((a, r) => a + (r.quantity_packs || 0), 0)
                      const lotsForFifo = [...lots].sort((a, b) => (a.purchased_at || "").localeCompare(b.purchased_at || "") || (a.id || 0) - (b.id || 0))
                      let remainOut = skuTotalOut
                      const fifoBalMap = new Map()
                      lotsForFifo.forEach(lot => {
                        const usedFromLot = Math.min(lot.quantity_packs || 0, remainOut)
                        remainOut -= usedFromLot
                        fifoBalMap.set(lot.id, { lotWithdrawn: usedFromLot, lotBalance: (lot.quantity_packs || 0) - usedFromLot })
                      })
                      lots.forEach(lot => {
                        const fifo = fifoBalMap.get(lot.id) || { lotWithdrawn: 0, lotBalance: lot.quantity_packs || 0 }
                        const lotWithdrawn = fifo.lotWithdrawn
                        const lotBalance = fifo.lotBalance
                        const lotOuts = stockOut.filter(r => r.lot_number === lot.lot_number)
                        const lastOut = lotOuts.length > 0 ? lotOuts.sort((a,b) => (b.withdrawn_at||"").localeCompare(a.withdrawn_at||""))[0] : null
                        const entry = { lot, lotWithdrawn, lotBalance, lastOut }
                        if (lotBalance <= 0) depletedLots.push(entry)
                        else activeLots.push(entry)
                      })
                      return (
                        <>
                          {/* Lot ที่ยังมีสต็อก */}
                          {activeLots.map(({ lot, lotWithdrawn, lotBalance }, i) => {
                            const cpp = (lot.quantity_packs || 0) > 0 ? (parseFloat(lot.total_cost) || 0) / lot.quantity_packs : 0
                            return (
                              <div key={i} className="p-3 rounded-xl border bg-gray-50 border-gray-100">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{lot.lot_number || "ไม่ระบุ"}</span>
                                      <span className="text-xs text-gray-500">{lot.source}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock size={10}/> {lot.purchased_at?.slice(0,10)}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-green-600">{fmtBoxPack(lotBalance, s.packs_per_box)}</p>
                                    <p className="text-xs text-gray-400">{fmt(lotBalance)} ซอง</p>
                                  </div>
                                </div>
                                {lot.quantity_packs > 0 && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                      <div className="h-1.5 rounded-full bg-green-400 transition-all" style={{width:`${Math.max(0,(lotBalance/lot.quantity_packs)*100)}%`}}/>
                                    </div>
                                    <span className="text-xs text-gray-400">{fmt(lotWithdrawn)}/{fmt(lot.quantity_packs)}</span>
                                  </div>
                                )}
                                <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                                  <div>
                                    <p className="text-xs text-gray-400">รับเข้า</p>
                                    <p className="text-xs font-bold text-blue-600">+{fmt(lot.quantity)} {UNIT_LABEL[lot.unit] || lot.unit}</p>
                                    <p className="text-xs text-blue-400">= {fmt(lot.quantity_packs)} ซอง</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">ต้นทุน/ซอง</p>
                                    <p className="text-xs font-bold text-purple-600">{fmtB(cpp.toFixed(2))}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400">มูลค่า Lot</p>
                                    <p className="text-xs font-bold text-gray-800">{fmtB(lot.total_cost)}</p>
                                  </div>
                                </div>
                                {lot.note && <p className="text-xs text-gray-400 mt-1.5 italic">"{lot.note}"</p>}
                              </div>
                            )
                          })}

                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

## pages/PageRefillPrep.jsx — mobile-friendly แล้ว (ใช้เป็น reference)
```jsx
import { useState, useEffect } from "react"
import {
  AlertTriangle, CheckCircle, X, ClipboardList, Clock, Monitor,
  Boxes, Package, RefreshCw, Loader2,
} from "lucide-react"
import { fmt } from "../shared/helpers"
import KpiCard from "../shared/KpiCard"
import PageMachineHistory from "./PageMachineHistory"

export default function PageRefillPrep({ machines, machineStock, machineAssignments, transfers, stockOut, skus, profile, session, profiles, onAddStockOut, onUpdateStockOut, onDeleteStockOut }) {
  const userId = session?.user?.id
  const isAdmin = profile?.role === "admin"

  // Admin เลือก user ที่จะดู — ถ้าตัวเองไม่มี assignment ให้ default เป็นคนที่มี
  const usersWithAssignments = [...new Set((machineAssignments || []).filter(a => a.is_active).map(a => a.user_id))]
  const viewableUsers = (profiles || []).filter(p => usersWithAssignments.includes(p.id))
  const [viewUserId, setViewUserId] = useState("")
  const defaultUserId = usersWithAssignments.includes(userId) ? userId : (viewableUsers[0]?.id || userId)
  const activeUserId = isAdmin ? (viewUserId || defaultUserId) : userId
  const activeProfile = (profiles || []).find(p => p.id === activeUserId)

  // ตู้ที่ active user รับผิดชอบ
  const myMachineIds = (machineAssignments || []).filter(a => a.user_id === activeUserId && a.is_active).map(a => a.machine_id)
  const myMachines = machines.filter(m => myMachineIds.includes(m.machine_id))

  // สต็อกของ active user (per SKU)
  const myTransfers = transfers.filter(t => t.to_user_id === activeUserId)
  const myStockOut = stockOut.filter(so => so.withdrawn_by_user_id === activeUserId)
  const myBalMap = {}
  myTransfers.forEach(t => { myBalMap[t.sku_id] = (myBalMap[t.sku_id] || 0) + (t.quantity_packs || 0) })
  myStockOut.forEach(so => { myBalMap[so.sku_id] = (myBalMap[so.sku_id] || 0) - (so.quantity_packs || 0) })

  // สร้างรายการเติมตู้จากข้อมูล VMS
  const refillItems = []
  myMachineIds.forEach(machId => {
    const slots = machineStock.filter(s => s.machine_id === machId && s.product_name && s.is_occupied)
    const skuRefill = {}
    slots.forEach(s => {
      const refill = Math.max(0, (s.max_capacity || 0) - (s.remain || 0))
      if (refill === 0) return
      const name = s.product_name || ""
      const isBox = name.toLowerCase().includes("box")
      const key = `${machId}_${s.sku_id || name}_${isBox ? "box" : "pack"}`
      if (!skuRefill[key]) skuRefill[key] = { machine_id: machId, sku_id: s.sku_id || "", product_name: name, isBox, refill: 0, remain: 0, capacity: 0, slotNums: [] }
      skuRefill[key].refill += refill
      skuRefill[key].remain += s.remain || 0
      skuRefill[key].capacity += s.max_capacity || 0
      skuRefill[key].slotNums.push(s.slot_number)
    })
    Object.values(skuRefill).forEach(r => refillItems.push(r))
  })

  // Tab เลือกตู้ — "all" หรือ machine_id
  const [activeTab, setActiveTab] = useState("all")
  // Reset tab เมื่อสลับ user (กัน tab ชี้ไปตู้ที่ user ใหม่ไม่มี)
  useEffect(() => { setActiveTab("all") }, [activeUserId])

  // group by SKU (สรุปรวม)
  const skuSummary = {}
  refillItems.forEach(r => {
    const key = `${r.sku_id}_${r.isBox ? "box" : "pack"}`
    if (!skuSummary[key]) skuSummary[key] = { sku_id: r.sku_id, product_name: r.product_name, isBox: r.isBox, totalRefill: 0, machines: [] }
    skuSummary[key].totalRefill += r.refill
    skuSummary[key].machines.push({ machine_id: r.machine_id, refill: r.refill })
  })
  const summaryList = Object.values(skuSummary).sort((a, b) => (a.sku_id || "").localeCompare(b.sku_id || ""))

  const lastSync = machineStock.length > 0
    ? machineStock.reduce((latest, s) => { const t = s.synced_at || ""; return t > latest ? t : latest }, "")
    : null

  const machineNameMap = {}
  machines.forEach(m => { machineNameMap[m.machine_id] = m.name || m.machine_id })

  // Helper: นับ refill ต่อตู้ (จำนวน SKU + รวมซอง)
  const machineStats = {}
  myMachineIds.forEach(machId => {
    const items = refillItems.filter(r => r.machine_id === machId)
    const totalPacks = items.reduce((a, r) => {
      const sku = skus.find(s => s.sku_id === r.sku_id)
      return a + (r.isBox ? r.refill * (sku?.packs_per_box || 24) : r.refill)
    }, 0)
    machineStats[machId] = { skuCount: items.length, totalPacks }
  })

  // ── Refill action: FIFO lot balance ต่อ SKU ของ active user ──
  const getSubLots = (skuId) => {
    const lotMap = {}
    myTransfers.filter(t => t.sku_id === skuId && t.lot_number).forEach(t => {
      if (!lotMap[t.lot_number]) lotMap[t.lot_number] = { lot_number: t.lot_number, quantity_packs: 0, transferred_at: t.transferred_at }
      lotMap[t.lot_number].quantity_packs += t.quantity_packs || 0
    })
    const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.transferred_at) - new Date(b.transferred_at))
    const totalOut = myStockOut.filter(so => so.sku_id === skuId).reduce((a, so) => a + (so.quantity_packs || 0), 0)
    let remainOut = totalOut
    return lotsArr.map(r => {
      const used = Math.min(r.quantity_packs, remainOut)
      remainOut -= used
      return { ...r, lotBalance: r.quantity_packs - used }
    })
  }

  const [qtyMap,      setQtyMap]      = useState({})
  const [submitting,  setSubmitting]  = useState(false)
  const [toast,       setToast]       = useState(null)
  const [subView,     setSubView]     = useState("prep") // "prep" | "history"

  // reset subView เมื่อสลับ tab/user
  useEffect(() => { setSubView("prep") }, [activeTab, activeUserId])

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3500) }

  // ห้าม admin เบิกแทน user คนอื่น — เบิกได้เฉพาะตัวเอง
  const canRefill = activeUserId === userId

  const itemKey = (item) => `${item.machine_id}_${item.sku_id}_${item.isBox?"b":"p"}`

  // Reset qtyMap เมื่อสลับ tab/user — default = r.refill (ยอดที่ตู้ต้องการเสมอ ไม่เกี่ยวกับสต็อกฉัน)
  useEffect(() => {
    if (activeTab === "all") { setQtyMap({}); return }
    const q = {}
    refillItems.filter(r => r.machine_id === activeTab).forEach(r => {
      q[itemKey(r)] = r.refill
    })
    setQtyMap(q)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeUserId])

  const getQty = (r) => {
    const v = qtyMap[itemKey(r)]
    return v === undefined ? r.refill : v
  }
  const setQty = (r, next) => {
    const max = r.refill
    const v = Math.max(0, Math.min(max, next))
    setQtyMap(prev => ({ ...prev, [itemKey(r)]: v }))
  }

  const handleBatchSubmit = async (items) => {
    // ข้ามแถวไม่มีสต็อก อัตโนมัติ
    const picks = items.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) > 0)
    if (picks.length === 0) { showToast("ไม่มีรายการที่เบิกได้","error"); return }

    // FIFO lot assignment + validate
    const lotUsage = {} // key: sku_id_lot → packs ที่ใช้ไปแล้วใน batch นี้
    const assignments = []
    for (const r of picks) {
      const qty = getQty(r)
      const sku = skus.find(s => s.sku_id === r.sku_id)
      const packs = r.isBox ? qty * (sku?.packs_per_box || 24) : qty
      const lots = getSubLots(r.sku_id)
      const lot = lots.find(l => {
        const k = `${r.sku_id}_${l.lot_number}`
        return (l.lotBalance - (lotUsage[k] || 0)) >= packs
      })
      if (!lot) {
        showToast(`${r.sku_id}: Lot เดียวไม่พอ ${fmt(packs)} ซอง — ลดจำนวนหรือเบิกแยก`, "error")
        return
      }
      lotUsage[`${r.sku_id}_${lot.lot_number}`] = (lotUsage[`${r.sku_id}_${lot.lot_number}`] || 0) + packs
      assignments.push({ r, qty, packs, lot_number: lot.lot_number })
    }

    try {
      setSubmitting(true)
      const now = new Date().toISOString()
      for (const a of assignments) {
        await onAddStockOut({
          sku_id:        a.r.sku_id,
          lot_number:    a.lot_number,
          machine_id:    a.r.machine_id,
          quantity_packs: a.packs,
          withdrawn_at:  now,
          note:          `[${a.qty}${a.r.isBox ? "กล่อง" : "ซอง"}] เบิกจากหน้าเตรียมของเติมตู้ (batch)`,
        })
      }
      showToast(`เบิกสำเร็จ ${assignments.length} รายการ → ${machineNameMap[picks[0].machine_id]}`)
      setQtyMap({})
    } catch (err) {
      showToast("เกิดข้อผิดพลาด: " + err.message, "error")
    } finally {
      setSubmitting(false)
    }
  }

  // Empty state: ไม่มี user ไหนมี assignment เลย
  if (viewableUsers.length === 0 && !usersWithAssignments.includes(userId)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">เตรียมของเติมตู้</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertTriangle size={32} className="text-amber-400 mx-auto mb-2"/>
          <p className="text-sm text-amber-700">ยังไม่มีการกำหนดตู้ให้ผู้ใช้คนใด กรุณาไปที่ "จัดการผู้ใช้ → กำหนดตู้"</p>
        </div>
      </div>
    )
  }

  if (myMachineIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">เตรียมของเติมตู้</h1>
        {/* Admin switcher */}
        {isAdmin && viewableUsers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">ดูของ:</span>
            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
              {viewableUsers.map(p => (
                <button key={p.id} onClick={() => setViewUserId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeUserId === p.id ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                  {p.display_name || p.email}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertTriangle size={32} className="text-amber-400 mx-auto mb-2"/>
          <p className="text-sm text-amber-700">
            {isAdmin && activeUserId !== userId
              ? `${activeProfile?.display_name || "?"} ยังไม่ได้ถูก assign ตู้`
              : "คุณยังไม่ได้ถูก assign ตู้ กรุณาติดต่อแอดมินเพื่อกำหนดตู้ที่รับผิดชอบ"}
          </p>
        </div>
      </div>
    )
  }

  // Active items ตาม tab
  const activeItems = activeTab === "all" ? refillItems : refillItems.filter(r => r.machine_id === activeTab)
  const activeMachine = activeTab !== "all" ? machines.find(m => m.machine_id === activeTab) : null

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error"?<X size={16}/>:<CheckCircle size={16}/>} {toast.msg}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            เตรียมของเติมตู้
            {isAdmin && activeUserId !== userId && (
              <span className="ml-2 text-base font-normal text-gray-500">· {activeProfile?.display_name || "?"}</span>
            )}
          </h1>
          <p className="text-sm text-gray-400">
            คำนวณจาก VMS เทียบกับสต็อก
            {lastSync && <span className="ml-2">· VMS: {lastSync.slice(0,10)} {lastSync.slice(11,16)}</span>}
          </p>
        </div>
        {/* Admin switcher */}
        {isAdmin && viewableUsers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">ดูของ:</span>
            <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
              {viewableUsers.map(p => (
                <button key={p.id} onClick={() => setViewUserId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeUserId === p.id ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                  {p.display_name || p.email}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tab เลือกตู้ */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab("all")}
          className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${activeTab === "all" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
          <span className="flex items-center gap-1.5">
            <ClipboardList size={14}/>
            สรุปรวม
            <span className="text-xs text-gray-400">({refillItems.length})</span>
          </span>
        </button>
        {myMachines.map(m => {
          const stat = machineStats[m.machine_id] || { skuCount: 0, totalPacks: 0 }
          const isActive = activeTab === m.machine_id
          const empty = stat.skuCount === 0
          return (
            <button key={m.machine_id} onClick={() => setActiveTab(m.machine_id)} disabled={empty}
              className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                ${isActive ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
              <span className="flex items-center gap-1.5">
                <Monitor size={14}/>
                {m.name}
                {empty
                  ? <span className="text-xs text-green-600">✓</span>
                  : <span className={`text-xs ${isActive ? "text-orange-500" : "text-gray-400"}`}>({stat.skuCount})</span>
                }
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === "all" ? (
        /* ── สรุปรวมทุกตู้ ── */
        <>
          {/* KPI รวม */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard icon={AlertTriangle} label="ต้องเติม (SKU)" value={summaryList.length} color="red"/>
            <KpiCard icon={Package} label="ตู้รับผิดชอบ" value={`${myMachines.length} ตู้`} color="blue"/>
            <KpiCard icon={Boxes} label="SKU ที่ฉันมี" value={`${Object.values(myBalMap).filter(v => v > 0).length} SKU`} color="purple"/>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3 text-sm">สรุปสินค้าที่ต้องเตรียมทั้งหมด</h2>
            {summaryList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">✓ ตู้ทุกช่องเต็มแล้ว</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                      <th className="text-right py-2 text-xs text-gray-400">ต้องเติม</th>
                      <th className="text-right py-2 text-xs text-gray-400">สต็อกของฉัน</th>
                      <th className="text-center py-2 text-xs text-gray-400">สถานะ</th>
                      <th className="text-left py-2 text-xs text-gray-400 pl-4">ตู้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryList.map(r => {
                      const myBal = myBalMap[r.sku_id] || 0
                      const sku = skus.find(s => s.sku_id === r.sku_id)
                      const refillPacks = r.isBox ? r.totalRefill * (sku?.packs_per_box || 24) : r.totalRefill
                      const enough = myBal >= refillPacks
                      const unit = r.isBox ? "กล่อง" : "ซอง"
                      return (
                        <tr key={r.sku_id + (r.isBox?"b":"p")} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2.5"><span className="font-mono text-xs font-bold text-gray-700">{r.sku_id}</span></td>
                          <td className="py-2.5 text-right text-sm font-bold text-red-600">{fmt(r.totalRefill)} {unit}</td>
                          <td className="py-2.5 text-right text-sm">
                            <span className={`font-bold ${enough ? "text-green-600" : "text-amber-600"}`}>{fmt(myBal)} ซอง</span>
                          </td>
                          <td className="py-2.5 text-center">
                            {enough
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">พร้อม</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">ไม่พอ</span>}
                          </td>
                          <td className="py-2.5 text-xs text-gray-500 pl-4">
                            {r.machines.map(m => (
                              <span key={m.machine_id} className="inline-block mr-1.5 mb-0.5 px-1.5 py-0.5 bg-gray-100 rounded">
                                {machineNameMap[m.machine_id]}({m.refill})
                              </span>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── ตู้เดียว ── */
        <>
          {/* Sub-tab: เตรียมของ / ประวัติการเบิก */}
          <div className="flex gap-1 border-b-2 border-gray-100">
            <button onClick={() => setSubView("prep")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-all
                ${subView === "prep" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <span className="flex items-center gap-1.5"><ClipboardList size={14}/>เตรียมของ</span>
            </button>
            <button onClick={() => setSubView("history")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-all
                ${subView === "history" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <span className="flex items-center gap-1.5"><Clock size={14}/>ประวัติการเบิก</span>
            </button>
          </div>

          {subView === "history" ? (
            <PageMachineHistory machine={activeMachine} stockOut={stockOut} skus={skus} hideHeader
              machines={machines} session={session} profile={profile}
              onUpdateStockOut={onUpdateStockOut} onDeleteStockOut={onDeleteStockOut}/>
          ) : (<>
          {/* KPI ของตู้นี้ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard icon={Monitor} label="ตู้" value={activeMachine?.name || activeTab}
              sub={activeMachine?.location || ""} color="orange"/>
            <KpiCard icon={AlertTriangle} label="ช่องที่ต้องเติม" value={`${activeItems.length} SKU`} color="red"/>
            <KpiCard icon={Package} label="รวม (ซอง)" value={fmt(machineStats[activeTab]?.totalPacks || 0)} color="blue"/>
            <KpiCard icon={Boxes} label="สต็อกของฉัน"
              value={fmt(Object.values(myBalMap).reduce((a,v) => a + Math.max(0,v), 0))}
              sub="ซอง รวมทุก SKU" color="green"/>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700 text-sm">
                รายการเติม — {activeMachine?.name}
              </h2>
              {activeMachine?.location && <span className="text-xs text-gray-400">{activeMachine.location}</span>}
            </div>
            {activeItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">✓ ตู้นี้ทุกช่องเต็มแล้ว</p>
            ) : (() => {
              const sortedItems = [...activeItems].sort((a,b) => (a.sku_id||"").localeCompare(b.sku_id||""))
              // รวมสรุปต่อ batch — นับเฉพาะแถวที่มีสต็อกและ qty > 0
              const picks = sortedItems.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) > 0)
              const skipped = sortedItems.filter(r => getQty(r) > 0 && (myBalMap[r.sku_id] || 0) <= 0).length
              const totalPacks = picks.reduce((a, r) => {
                const sku = skus.find(s => s.sku_id === r.sku_id)
                return a + (r.isBox ? getQty(r) * (sku?.packs_per_box || 24) : getQty(r))
              }, 0)
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                          <th className="text-left py-2 text-xs text-gray-400">ช่อง</th>
                          <th className="text-right py-2 text-xs text-gray-400">คงเหลือ/ความจุ</th>
                          <th className="text-center py-2 text-xs text-gray-400 font-bold text-red-500">ต้องเติม</th>
                          <th className="text-right py-2 text-xs text-gray-400">สต็อกฉัน</th>
                          <th className="text-center py-2 text-xs text-gray-400">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedItems.map(r => {
                          const myBal = myBalMap[r.sku_id] || 0
                          const sku = skus.find(s => s.sku_id === r.sku_id)
                          const refillPacks = r.isBox ? r.refill * (sku?.packs_per_box || 24) : r.refill
                          const enough = myBal >= refillPacks
                          const unit = r.isBox ? "กล่อง" : "ซอง"
                          const key = itemKey(r)
                          const qty = getQty(r)
                          const disabled = !canRefill || myBal <= 0
                          const changed = qty !== r.refill

                          return (
                            <tr key={key} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2.5"><span className="font-mono text-xs font-bold">{r.sku_id}</span></td>
                              <td className="py-2.5 text-xs text-gray-500">{r.slotNums.join(", ")}</td>
                              <td className="py-2.5 text-right text-xs text-gray-600">{r.remain} / {r.capacity}</td>
                              <td className="py-2.5">
                                {canRefill ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button type="button" onClick={() => setQty(r, qty - 1)} disabled={disabled || qty <= 0}
                                      title="ลด" aria-label="ลด"
                                      className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-base leading-none flex items-center justify-center">−</button>
                                    <input type="number" min="0" max={r.refill}
                                      value={qty}
                                      onChange={e => setQty(r, parseInt(e.target.value) || 0)}
                                      disabled={disabled}
                                      className={`w-12 text-center font-bold text-sm border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed ${qty === 0 ? "text-gray-400 bg-gray-50" : qty < r.refill ? "text-amber-600" : "text-red-600"}`}/>
                                    <button type="button" onClick={() => setQty(r, qty + 1)} disabled={disabled || qty >= r.refill}
                                      title="เพิ่ม" aria-label="เพิ่ม"
                                      className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:text-green-600 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-base leading-none flex items-center justify-center">+</button>
                                    <span className="text-xs text-gray-500 ml-0.5">{unit}</span>
                                    {changed && !disabled && (
                                      <button type="button" onClick={() => setQty(r, r.refill)}
                                        title={`คืนค่าเดิม (${r.refill})`} aria-label="คืนค่าเดิม"
                                        className="w-7 h-7 ml-0.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center">
                                        <RefreshCw size={12}/>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-right text-sm font-bold text-red-600">{fmt(r.refill)} {unit}</div>
                                )}
                                {canRefill && myBal <= 0 && <div className="text-center text-[10px] text-amber-600 mt-1">ไม่มีสต็อก</div>}
                              </td>
                              <td className="py-2.5 text-right text-sm">
                                <span className={`font-bold ${enough ? "text-green-600" : "text-amber-600"}`}>{fmt(myBal)}</span>
                              </td>
                              <td className="py-2.5 text-center">
                                {enough
                                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">พร้อม</span>
                                  : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">ไม่พอ</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {canRefill && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4 bg-orange-50 rounded-xl border border-orange-200">
                      <div className="text-sm">
                        <div className="text-xs text-gray-500">สรุปเบิก → <b>{activeMachine?.name}</b></div>
                        <div className="font-bold text-orange-700">
                          {picks.length === 0
                            ? <span className="text-gray-400 font-normal">ยังไม่ได้เลือกจำนวน</span>
                            : <>{picks.length} SKU · รวม <span className="text-orange-600">{fmt(totalPacks)}</span> ซอง</>}
                        </div>
                        {skipped > 0 && (
                          <div className="text-[11px] text-amber-600 mt-0.5">ข้าม {skipped} SKU (ไม่มีสต็อก)</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => {
                          const q = {}
                          sortedItems.forEach(r => { q[itemKey(r)] = r.refill })
                          setQtyMap(q)
                        }} disabled={submitting}
                          className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                          รีเซ็ตยอด
                        </button>
                        <button onClick={() => handleBatchSubmit(sortedItems)}
                          disabled={submitting || picks.length === 0}
                          className="px-5 py-2 text-sm rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 font-semibold flex items-center gap-1.5 shadow-sm">
                          {submitting ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>}
                          {submitting ? "กำลังบันทึก..." : "ยืนยันเบิกทั้งหมด"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
          </>)}
        </>
      )}
    </div>
  )
}
```

## pages/PageSales.jsx — chart-heavy
```jsx
import { useState } from "react"
import {
  CheckCircle, AlertTriangle, RefreshCw, X, Loader2, ShoppingCart,
  ChevronUp, ChevronDown,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts"
import { CHART_COLORS } from "../shared/constants"
import { fmt, fmtB, getLastNDays, fmtDayLabel, today } from "../shared/helpers"
import { Badge } from "../shared/ui"

// ─────────────────────────────────────────────
// SALES: SKU × Machine breakdown
// ─────────────────────────────────────────────
function SalesSkuByMachine({ sales, machines, skus }) {
  const [expandedMachine, setExpandedMachine] = useState(null)
  const [sortBy, setSortBy] = useState("rev") // rev, qty
  const [dateFilter, setDateFilter] = useState("all") // all, daily
  const [selectedDate, setSelectedDate] = useState(today())

  // วันที่ที่มีข้อมูล (สำหรับ quick nav)
  const availDates = [...new Set(sales.map(r => r.sold_at).filter(Boolean))].sort().reverse()

  // กรองตามวัน
  const filteredSales = dateFilter === "daily"
    ? sales.filter(r => r.sold_at === selectedDate)
    : sales

  // สร้าง map: machine → sku → { packQty, boxQty, rev }
  // packQty = จำนวนซองจากการขายแบบซองเท่านั้น (ไม่รวมกล่อง)
  // boxQty  = จำนวนกล่องจากการขายแบบกล่อง
  const machineSkuMap = {}
  machines.forEach(m => { machineSkuMap[m.machine_id] = {} })
  filteredSales.forEach(r => {
    if (!machineSkuMap[r.machine_id]) machineSkuMap[r.machine_id] = {}
    if (!machineSkuMap[r.machine_id][r.sku_id]) machineSkuMap[r.machine_id][r.sku_id] = { packQty:0, boxQty:0, rev:0 }
    const raw = (r.product_name_raw || "").toLowerCase()
    const isBox = raw.includes("(box)") || raw.split(/\s+/).includes("box")
    if (isBox) {
      machineSkuMap[r.machine_id][r.sku_id].boxQty += 1
    } else {
      machineSkuMap[r.machine_id][r.sku_id].packQty += r.quantity_sold || 0
    }
    machineSkuMap[r.machine_id][r.sku_id].rev += r.revenue || 0
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-700">
          รายการขายแยก SKU ต่อตู้
          {dateFilter === "daily" && <span className="text-sm font-normal text-gray-400 ml-2">({fmtDayLabel(selectedDate)})</span>}
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          {/* ตัวกรองวัน */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"all",l:"ทั้งหมด"},{v:"daily",l:"รายวัน"}].map(t => (
              <button key={t.v} onClick={() => setDateFilter(t.v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${dateFilter===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
          {dateFilter === "daily" && (
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"/>
          )}
          {/* เรียงลำดับ */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"rev",l:"ยอดขาย"},{v:"qty",l:"จำนวน"}].map(t => (
              <button key={t.v} onClick={() => setSortBy(t.v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${sortBy===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {machines.map((m, mi) => {
          const skuData = machineSkuMap[m.machine_id] || {}
          const skuList = Object.entries(skuData)
            .map(([skuId, v]) => {
              const s = skus.find(sk => sk.sku_id === skuId)
              return { sku_id: skuId, series: s?.series || "OP", name: s?.name || skuId, ...v }
            })
            .sort((a, b) => sortBy === "rev" ? b.rev - a.rev : b.qty - a.qty)
          const machineTotal = skuList.reduce((a, r) => a + r.rev, 0)
          const machineTotalPack = skuList.reduce((a, r) => a + r.packQty, 0)
          const machineTotalBox = skuList.reduce((a, r) => a + r.boxQty, 0)
          const machineTxn = new Set(filteredSales.filter(r => r.machine_id === m.machine_id).map(r => r.transaction_id).filter(Boolean)).size
          const isExpanded = expandedMachine === m.machine_id

          return (
            <div key={m.machine_id} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* Machine header */}
              <button onClick={() => setExpandedMachine(isExpanded ? null : m.machine_id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: CHART_COLORS[mi]}}/>
                  <div className="text-left">
                    <p className="font-semibold text-sm text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.location} · {skuList.length} SKU</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{fmtB(machineTotal)}</p>
                    <p className="text-xs text-gray-400">{fmt(machineTxn)} ธุรกรรม · {machineTotalBox > 0 ? `${fmt(machineTotalBox)} กล่อง · ` : ""}{fmt(machineTotalPack)} ซอง</p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                </div>
              </button>

              {/* SKU list */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {skuList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">ไม่มีข้อมูลการขาย</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left py-2 px-4 text-xs text-gray-400 font-medium">#</th>
                            <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">SKU</th>
                            <th className="text-left py-2 px-2 text-xs text-gray-400 font-medium">ชื่อสินค้า</th>
                            <th className="text-center py-2 px-2 text-xs text-gray-400 font-medium">Series</th>
                            <th className="text-right py-2 px-2 text-xs text-red-400 font-medium">กล่องที่ขาย</th>
                            <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium">ซองที่ขาย</th>
                            <th className="text-right py-2 px-2 text-xs text-gray-400 font-medium">ยอดขาย</th>
                            <th className="py-2 px-4 text-xs text-gray-400 font-medium w-24">สัดส่วน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {skuList.map((r, i) => {
                            const maxVal = skuList[0]?.[sortBy] || 1
                            const pct = (r[sortBy] / maxVal) * 100
                            return (
                              <tr key={r.sku_id} className={`border-b border-gray-50 hover:bg-gray-50 ${i < 3 ? "bg-yellow-50/30" : ""}`}>
                                <td className="py-2 px-4 text-center">
                                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":<span className="text-gray-400 text-xs">{i+1}</span>}
                                </td>
                                <td className="py-2 px-2 font-mono text-xs font-bold text-gray-700">{r.sku_id}</td>
                                <td className="py-2 px-2 text-xs text-gray-500 truncate max-w-[120px]">{r.name}</td>
                                <td className="py-2 px-2 text-center"><Badge series={r.series}/></td>
                                <td className="py-2 px-2 text-right font-medium text-red-500">{r.boxQty > 0 ? fmt(r.boxQty) : "-"}</td>
                                <td className="py-2 px-2 text-right font-medium text-blue-600">{r.packQty > 0 ? fmt(r.packQty) : "-"}</td>
                                <td className="py-2 px-2 text-right font-semibold text-green-600">{fmtB(r.rev)}</td>
                                <td className="py-2 px-4">
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{width:`${pct}%`}}/>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={4} className="py-2 px-4 text-xs text-gray-500">รวม {m.name}</td>
                            <td className="py-2 px-2 text-right text-red-600 text-xs">{fmt(machineTotalBox)} กล่อง</td>
                            <td className="py-2 px-2 text-right text-blue-700 text-xs">{fmt(machineTotalPack)} ซอง</td>
                            <td className="py-2 px-2 text-right text-green-700 text-xs">{fmtB(machineTotal)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PageSales({ machines, sales, skus, claims, onRefresh }) {
  const [viewMode, setViewMode]   = useState("daily")
  const [machineSel, setMachineSel] = useState("all")
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState(null)

  const triggerSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch("/api/vms-sync", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg({ type:"success", text:"สั่งดึงข้อมูลย้อนหลัง 3 วันสำเร็จ — รอประมาณ 2-3 นาที แล้วกด refresh" })
      } else {
        setSyncMsg({ type:"error", text: data.error || "เกิดข้อผิดพลาด" })
      }
    } catch (err) {
      setSyncMsg({ type:"error", text: err.message })
    } finally {
      setSyncing(false)
    }
  }

  const filtered = machineSel === "all" ? sales : sales.filter(r => r.machine_id === machineSel)

  // Last 7 days chart per machine
  const last7 = getLastNDays(7)
  const dailyData = last7.map(d => {
    const row = { day: fmtDayLabel(d) }
    machines.forEach(m => {
      const rows = sales.filter(r => r.sold_at === d && r.machine_id === m.machine_id)
      row[m.name] = rows.reduce((a, r) => a + r.revenue, 0)
    })
    return row
  })

  const totalRev = filtered.reduce((a, r) => a + r.revenue, 0)
  const totalQty = filtered.reduce((a, r) => a + r.quantity_sold, 0)
  const totalTxn = new Set(filtered.map(r => r.transaction_id).filter(Boolean)).size
  const dayCount = Math.max(1, [...new Set(filtered.map(r => r.sold_at))].length)

  // Top SKUs
  const skuMap = {}
  filtered.forEach(r => {
    if (!skuMap[r.sku_id]) skuMap[r.sku_id] = { qty:0, rev:0 }
    skuMap[r.sku_id].qty += r.quantity_sold
    skuMap[r.sku_id].rev += r.revenue
  })
  const topSkus = Object.entries(skuMap)
    .sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
    .map(([id, v]) => ({ sku_id: id, ...v }))

  // Profit estimate (หักยอดคืนเงินจากเคลม)
  const totalRefund = (claims || []).reduce((a, c) => a + (parseFloat(c.refund_amount) || 0), 0)
  const profit = filtered.reduce((a, r) => {
    const s = skus.find(sk => sk.sku_id === r.sku_id)
    const cost = (s?.avg_cost || s?.cost_price || 0) * (r.quantity_sold || 0)
    return a + (r.revenue || 0) - cost
  }, 0) - totalRefund

  return (
    <div className="space-y-6">
      {/* Sync message */}
      {syncMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${syncMsg.type==="success"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>
          {syncMsg.type==="success" ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
          <span className="flex-1">{syncMsg.text}</span>
          {syncMsg.type==="success" && (
            <button onClick={onRefresh} className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 flex items-center gap-1">
              <RefreshCw size={12}/> Refresh
            </button>
          )}
          <button onClick={() => setSyncMsg(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">ยอดขาย (30 วันล่าสุด)</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {/* ปุ่มดึงข้อมูล VMS */}
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {syncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            {syncing ? "กำลังสั่ง..." : "ดึงข้อมูล VMS"}
          </button>
          <select value={machineSel} onChange={e => setMachineSel(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">ทุกตู้</option>
            {machines.map(m => <option key={m.machine_id} value={m.machine_id}>{m.name}</option>)}
          </select>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{v:"daily",l:"รายวัน"},{v:"stacked",l:"สะสม"}].map(t => (
              <button key={t.v} onClick={() => setViewMode(t.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <ShoppingCart size={40} className="text-gray-300 mx-auto mb-3"/>
          <p className="text-gray-400 text-sm">ยังไม่มีข้อมูลยอดขาย</p>
          <p className="text-gray-300 text-xs mt-1">ข้อมูลจะปรากฏหลัง VMS Scraper ทำงานครั้งแรก</p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">ยอดขายรวม (30 วัน)</p>
              <p className="text-xl font-bold text-green-600 mt-1">{fmtB(totalRev)}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">จำนวนธุรกรรม</p>
              <p className="text-xl font-bold text-indigo-600 mt-1">{fmt(totalTxn)} <span className="text-sm font-normal text-gray-400">ครั้ง</span></p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">จำนวนซองที่ขาย</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{fmt(totalQty)} ซอง</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">เฉลี่ยต่อวัน</p>
              <p className="text-xl font-bold text-purple-600 mt-1">{fmtB(Math.round(totalRev/dayCount))}</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 shadow-sm">
              <p className="text-xs text-gray-400">กำไรโดยประมาณ</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{fmtB(profit)}</p>
            </div>
          </div>

          {/* Daily Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย 7 วันล่าสุด แยกตู้ (บาท)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyData} margin={{top:0,right:10,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="day" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:11}} tickFormatter={v => fmt(v)}/>
                <Tooltip formatter={v => fmtB(v)}/>
                <Legend/>
                {machines.map((m, i) => (
                  <Bar key={m.machine_id} dataKey={m.name} fill={CHART_COLORS[i]}
                    radius={viewMode==="stacked" ? [0,0,0,0] : [4,4,0,0]}
                    stackId={viewMode==="stacked" ? "a" : undefined}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top SKUs */}
          {topSkus.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Top SKU ยอดขายสูงสุด</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topSkus} layout="vertical" margin={{top:0,right:30,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11}} tickFormatter={v => fmt(v)}/>
                  <YAxis type="category" dataKey="sku_id" width={60} tick={{fontSize:11}}/>
                  <Tooltip formatter={(v, n) => [n==="rev" ? fmtB(v) : fmt(v), n==="rev"?"รายรับ":"ซอง"]}/>
                  <Bar dataKey="rev" name="rev" fill="#3b82f6" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* รายการขายแยก SKU ต่อตู้ */}
          <SalesSkuByMachine sales={filtered} machines={machines} skus={skus}/>
        </>
      )}
    </div>
  )
}
```

## pages/PageMyStock.jsx — table + CRUD
```jsx
import { useState } from "react"
import {
  X, CheckCircle, Package, PlusCircle, MinusCircle, Loader2, Trash2,
} from "lucide-react"
import { fmt, fmtBoxPack, sortSkus, getSkuSeries } from "../shared/helpers"
import KpiCard from "../shared/KpiCard"
import { Badge } from "../shared/ui"

export default function PageMyStock({ transfers, stockOut, skus, profile, session, profiles, machines, machineAssignments, onDeleteTransfer }) {
  const [tab, setTab] = useState("balance") // balance, history_in, history_out
  const isAdmin = profile?.role === "admin"
  const userId = session?.user?.id

  const [deleteTransferId, setDeleteTransferId] = useState(null)
  const [deletingTransfer, setDeletingTransfer] = useState(false)
  const [toast, setToast] = useState(null)
  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(() => setToast(null), 3000) }
  const handleDeleteTransfer = async (id) => {
    setDeletingTransfer(true)
    try {
      await onDeleteTransfer(id)
      setDeleteTransferId(null)
      showToast("ลบสำเร็จ — คืนสต็อกหลักแล้ว")
    } catch (err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error")
    } finally { setDeletingTransfer(false) }
  }

  // Admin สามารถเลือกดูสต็อกของคนอื่นได้
  const usersWithTransfers = [...new Set(transfers.map(t => t.to_user_id))]
  const viewableUsers = (profiles || []).filter(p => usersWithTransfers.includes(p.id))
  const [viewUserId, setViewUserId] = useState("")
  // ถ้ายังไม่ได้เลือก → ใช้ตัวเอง (ถ้ามี transfers) หรือคนแรกที่มี
  const defaultUserId = usersWithTransfers.includes(userId) ? userId : (viewableUsers[0]?.id || userId)
  const activeUserId = isAdmin ? (viewUserId || defaultUserId) : userId
  const activeProfile = (profiles || []).find(p => p.id === activeUserId)

  // ตู้ที่ activeUser รับผิดชอบ
  const userAssignments = (machineAssignments || []).filter(a => a.user_id === activeUserId && a.is_active)
  const userMachines = (machines || []).filter(m => userAssignments.some(a => a.machine_id === m.machine_id))

  // สต็อกของ activeUser: transfers ที่ได้รับ - stock_out ที่เบิกออก
  const myTransfers = transfers.filter(t => t.to_user_id === activeUserId)
  const myStockOut = stockOut.filter(so => so.withdrawn_by_user_id === activeUserId)

  // คำนวณยอดคงเหลือต่อ SKU
  const balanceMap = {}
  myTransfers.forEach(t => {
    if (!balanceMap[t.sku_id]) balanceMap[t.sku_id] = { received: 0, withdrawn: 0 }
    balanceMap[t.sku_id].received += t.quantity_packs || 0
  })
  myStockOut.forEach(so => {
    if (!balanceMap[so.sku_id]) balanceMap[so.sku_id] = { received: 0, withdrawn: 0 }
    balanceMap[so.sku_id].withdrawn += so.quantity_packs || 0
  })

  const balanceList = sortSkus(
    Object.entries(balanceMap).map(([sku_id, v]) => ({
      sku_id,
      name: skus.find(s => s.sku_id === sku_id)?.name || sku_id,
      series: getSkuSeries(sku_id),
      received: v.received,
      withdrawn: v.withdrawn,
      balance: v.received - v.withdrawn,
      packs_per_box: skus.find(s => s.sku_id === sku_id)?.packs_per_box || 24,
    }))
  ).filter(r => r.received > 0 || r.withdrawn > 0)

  const totalBalance = balanceList.reduce((a, r) => a + r.balance, 0)
  const totalReceived = balanceList.reduce((a, r) => a + r.received, 0)

  // Lot balance (FIFO)
  const getMyLotBalance = (skuId) => {
    const lotMap = {}
    myTransfers.filter(t => t.sku_id === skuId && t.lot_number).forEach(t => {
      if (!lotMap[t.lot_number]) lotMap[t.lot_number] = { lot_number: t.lot_number, quantity_packs: 0, transferred_at: t.transferred_at }
      lotMap[t.lot_number].quantity_packs += t.quantity_packs || 0
    })
    const lotsArr = Object.values(lotMap).sort((a, b) => new Date(a.transferred_at) - new Date(b.transferred_at))
    const totalOut = myStockOut.filter(so => so.sku_id === skuId).reduce((a, so) => a + (so.quantity_packs || 0), 0)
    let remainOut = totalOut
    return lotsArr.map(r => {
      const used = Math.min(r.quantity_packs, remainOut)
      remainOut -= used
      return { ...r, lotBalance: r.quantity_packs - used }
    })
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm flex items-center gap-2 ${toast.type==="error"?"bg-red-500":"bg-green-500"}`}>
          {toast.type==="error" ? <X size={16}/> : <CheckCircle size={16}/>} {toast.msg}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isAdmin && activeUserId !== userId ? `สต็อกของ ${activeProfile?.display_name || "?"}` : "สต็อกของฉัน"}
          </h1>
          <p className="text-sm text-gray-400">สินค้าที่ได้รับแจกจ่ายมา และประวัติการเบิกออก</p>
        </div>
        {/* Admin: เลือกดูสต็อกของแต่ละคน */}
        {isAdmin && viewableUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">ดูสต็อกของ:</span>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {viewableUsers.map(p => (
                <button key={p.id} onClick={() => setViewUserId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeUserId === p.id ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
                  {p.display_name || p.email}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ตู้ที่รับผิดชอบ */}
      {userMachines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-400 self-center">ตู้ที่รับผิดชอบ:</span>
          {userMachines.map(m => (
            <span key={m.machine_id} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
              {m.name}
            </span>
          ))}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={Package} label="สต็อกคงเหลือ (ซอง)" value={fmt(totalBalance)} color="blue"/>
        <KpiCard icon={PlusCircle} label="รับเข้าทั้งหมด (ซอง)" value={fmt(totalReceived)} color="green"/>
        <KpiCard icon={MinusCircle} label="SKU ที่ถือ" value={`${balanceList.filter(r => r.balance > 0).length} รายการ`} color="purple"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{v:"balance",l:"ยอดคงเหลือ"},{v:"history_in",l:"ประวัติรับเข้า"},{v:"history_out",l:"ประวัติเบิกออก"}].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab===t.v?"bg-white shadow text-blue-600":"text-gray-500"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Tab: ยอดคงเหลือ */}
      {tab === "balance" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {balanceList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีสินค้าในสต็อก</p>
          ) : (
            <div className="space-y-3">
              {balanceList.map(r => {
                const lots = getMyLotBalance(r.sku_id)
                const pct = r.received > 0 ? (r.balance / r.received * 100) : 0
                return (
                  <div key={r.sku_id} className="p-4 rounded-xl border border-gray-100 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge series={r.series}/>
                        <span className="font-mono text-sm font-bold text-gray-800">{r.sku_id}</span>
                        <span className="text-xs text-gray-400">{r.name}</span>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${r.balance < 24 ? "text-amber-600" : "text-green-600"}`}>
                          {fmt(r.balance)} <span className="text-xs font-normal">ซอง</span>
                        </p>
                        <p className="text-xs text-gray-400">{fmtBoxPack(r.balance, r.packs_per_box)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${r.balance < 24 ? "bg-amber-400" : "bg-green-400"}`}
                          style={{width:`${Math.min(100, pct)}%`}}/>
                      </div>
                      <span className="text-xs text-gray-400">{fmt(r.balance)}/{fmt(r.received)}</span>
                    </div>
                    {/* Lot breakdown */}
                    {lots.filter(l => l.lotBalance > 0).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lots.filter(l => l.lotBalance > 0).map(l => (
                          <span key={l.lot_number} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono">
                            {l.lot_number}: {fmt(l.lotBalance)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: ประวัติรับเข้า */}
      {tab === "history_in" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ประวัติรับสินค้าจากสต็อกหลัก ({myTransfers.length})</h2>
          {myTransfers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีประวัติ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs text-gray-400">วันที่</th>
                    <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                    <th className="text-left py-2 text-xs text-gray-400">Lot</th>
                    <th className="text-right py-2 text-xs text-gray-400">จำนวน</th>
                    <th className="text-left py-2 text-xs text-gray-400">ผู้แจกจ่าย</th>
                    <th className="text-left py-2 text-xs text-gray-400">หมายเหตุ</th>
                    {onDeleteTransfer && <th className="text-center py-2 text-xs text-gray-400 w-28">จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...myTransfers].sort((a,b) => (b.transferred_at||"").localeCompare(a.transferred_at||"")).map(t => {
                    const isConfirming = deleteTransferId === t.id
                    return (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 text-xs text-gray-600">{(t.transferred_at||"").slice(0,10)}</td>
                        <td className="py-2"><span className="font-mono text-xs font-bold">{t.sku_id}</span></td>
                        <td className="py-2 text-xs text-gray-500">{t.lot_number || "-"}</td>
                        <td className="py-2 text-right text-xs font-semibold text-green-600">+{fmt(t.quantity_packs)} ซอง</td>
                        <td className="py-2 text-xs text-gray-500">{t.created_by || "-"}</td>
                        <td className="py-2 text-xs text-gray-400">{t.note || "-"}</td>
                        {onDeleteTransfer && (
                          <td className="py-2 text-center">
                            {isConfirming ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => setDeleteTransferId(null)} disabled={deletingTransfer}
                                  className="px-2 py-0.5 text-[10px] rounded border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50">
                                  ยกเลิก
                                </button>
                                <button onClick={() => handleDeleteTransfer(t.id)} disabled={deletingTransfer}
                                  className="px-2 py-0.5 text-[10px] rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                                  {deletingTransfer ? <Loader2 size={9} className="animate-spin"/> : <Trash2 size={9}/>}
                                  ลบ
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteTransferId(t.id)} title="ลบและคืนกลับสต็อกหลัก"
                                className="p-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200">
                                <Trash2 size={12}/>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: ประวัติเบิกออก */}
      {tab === "history_out" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ประวัติเบิกไปเติมตู้ ({myStockOut.length})</h2>
          {myStockOut.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีประวัติ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs text-gray-400">วันที่</th>
                    <th className="text-left py-2 text-xs text-gray-400">SKU</th>
                    <th className="text-left py-2 text-xs text-gray-400">Lot</th>
                    <th className="text-left py-2 text-xs text-gray-400">ตู้ปลายทาง</th>
                    <th className="text-right py-2 text-xs text-gray-400">จำนวน</th>
                    <th className="text-left py-2 text-xs text-gray-400">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...myStockOut].sort((a,b) => (b.withdrawn_at||"").localeCompare(a.withdrawn_at||"")).map(so => (
                    <tr key={so.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-xs text-gray-600">{(so.withdrawn_at||"").slice(0,10)}</td>
                      <td className="py-2"><span className="font-mono text-xs font-bold">{so.sku_id}</span></td>
                      <td className="py-2 text-xs text-gray-500">{so.lot_number || "-"}</td>
                      <td className="py-2 text-xs text-gray-700">{so.machine_id}</td>
                      <td className="py-2 text-right text-xs font-semibold text-red-600">-{fmt(so.quantity_packs)} ซอง</td>
                      <td className="py-2 text-xs text-gray-400">{so.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```
