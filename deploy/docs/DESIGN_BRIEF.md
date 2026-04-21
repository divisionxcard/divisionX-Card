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
