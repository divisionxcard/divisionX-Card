# ขั้นตอนใช้ Claude Design กับ DivisionX

## 🎯 เป้าหมาย Phase 1
สร้าง design system อัตโนมัติจาก codebase + screenshots ของเรา → ได้ design tokens + component library กลาง

---

## 📋 ก่อนเริ่ม (5 นาที) — เตรียมของ

### 0. 🎨 Brand Reference (สำคัญสุด — อัปก่อน!)

**2 รูปที่คุณส่งมา** (โปสเตอร์ Like & Share + banner Division X Card) — นี่คือ brand identity ต้นแบบ
- Dark navy bg (#0A1628)
- Neon cyan accent (#00D4FF)
- รูปตู้จริง + โลโก้

อัปโหลดทั้ง 2 รูปเข้า Claude Design **ก่อน** screenshot หน้าเว็บ — เพื่อให้ AI เข้าใจทิศทางสี/อารมณ์ก่อน

### 1. ถ่าย Screenshot 6-8 หน้าหลัก

เปิดเว็บ DivisionX (http://localhost:3000 หรือ production) แล้ว screenshot:

**Desktop view (1440px):**
- [ ] PageDashboard (ภาพรวม) — SKU cards grid
- [ ] PageRefillPrep — สรุปรวม **และ** ตู้เดียว (2 รูป)
- [ ] PageSales — KPIs + charts
- [ ] PageStock — list of lots
- [ ] PageMachineStockView — slot grid view

**Mobile view (375px — ใช้ Chrome DevTools → toggle device toolbar):**
- [ ] หน้าเดียวกันทั้ง 5 หน้าข้างต้น — อยากให้ Claude Design เห็นปัญหา responsive

รวม ~12-15 รูป

### 2. เตรียม ZIP ของโค้ด key

```
DivisionX-design-system-input.zip
├── shared/
│   ├── constants.js          (มี SERIES_COLOR, CHART_COLORS)
│   ├── helpers.js
│   ├── KpiCard.jsx           (key component)
│   └── ui.jsx                (Badge, StatusDot)
├── pages/
│   ├── PageDashboard.jsx     (ตัวอย่าง pattern ที่ซับซ้อน)
│   ├── PageRefillPrep.jsx    (ตัวอย่าง mobile-friendly แล้ว)
│   └── PageSales.jsx         (ตัวอย่าง chart-heavy)
├── tailwind.config.js
├── package.json
└── DESIGN_BRIEF.md           (← อ่านตัวนี้ก่อน!)
```

**หรือวิธีง่ายกว่า:** upload repo URL ตรง ๆ ได้ถ้า Claude Design รองรับ GitHub link

---

## 🚀 Step 1: เริ่มที่ claude.ai

1. ไปที่ **https://claude.ai**
2. เลือก Claude Design (น่าจะอยู่ในเมนู New / Labs / Apps)
3. **ต้องใช้ plan Pro / Max / Team / Enterprise** — ถ้ายังไม่มี ต้อง upgrade ก่อน

---

## 🎨 Step 2: Onboarding

เมื่อเริ่ม project ใหม่:

### Prompt (copy ได้เลย)

```
ผมกำลังดูแลแอป "DivisionX Card" — ระบบจัดการตู้ขายการ์ด One Piece
สำหรับแอดมินภายในทีม ภาษาไทย + อังกฤษสำหรับ SKU

Stack: Next.js 14 + React 18 + Tailwind CSS + lucide-react + recharts
Users: เจ้าของธุรกิจ + แอดมินภาคสนาม (ใช้ทั้งเดสก์ท็อปและมือถือ)

🎯 **ผมกำลัง PIVOT จาก light theme → dark theme ใหม่ทั้งระบบ**
ตาม brand ในโปสเตอร์/banner ที่อัปโหลดมา:
- Dark navy background (#0A1628)
- Neon cyan accent (#00D4FF)
- Tech / futuristic / premium feel
- Subtle glow effects บน active elements

ผมอัปโหลด:
1. 2 รูป brand reference (poster + banner)
2. DESIGN_BRIEF.md — สรุป patterns ปัจจุบัน + target palette (dark) + translation guide
3. โค้ด component กลาง (shared/) + ตัวอย่างหน้า (pages/)
4. Screenshot 6 หน้าหลัก (desktop + mobile = 12 รูป) — หน้าตอนนี้ยังเป็น light theme

ขอให้ช่วย:
1. สร้าง dark design system ที่ consistent ครอบคลุม:
   - Color tokens (bg, accent, text, semantic, border, SKU series)
   - Typography scale (ต้อง readable บน dark bg)
   - Shadow + glow tokens (subtle cyan glow)
   - Component primitives (Button, Card, Input, Badge, KpiCard, Modal, Tabs, Toast)

2. Export เป็น:
   - Design tokens (JS file ที่ import เข้า tailwind.config.js ได้)
   - React component library (ใช้ Tailwind classes หรือ inline style ตาม palette ใหม่)

3. ครอบคลุม mobile-first + desktop + **keep print layout เป็น light theme** (ประหยัดหมึก)

4. เก็บ personality: flat, rounded-2xl, color-coded by function — แต่เปลี่ยนจาก warm (orange) เป็น cool (cyan)

อ่าน DESIGN_BRIEF.md ก่อน (section "NEW Brand Color Tokens" คือ target) — แล้วถามผมถ้าต้องการ clarification ครับ
```

---

## 🔁 Step 3: Refine

Claude Design จะสร้าง version แรก — ลองเลย:

**ถ้าชอบอะไรบ้าง:** บอกตรง ๆ — "ชอบ KpiCard variant 2 แต่อยากให้ icon ใหญ่กว่านี้"

**ถ้าไม่ชอบ:** ใช้ inline comment ชี้จุด — "ตรงนี้ contrast ต่ำไป อ่านยาก"

**ถ้าอยาก explore:** "ขอ variant ที่ playful กว่านี้ — ใส่ gradient บนการ์ดได้"

ผลลัพธ์ที่ควรได้ภายใน 30-60 นาที:
- ✅ Color palette + typography + spacing tokens
- ✅ 6-8 base component variants
- ✅ Preview ใน browser เห็นเลย

---

## 📦 Step 4: Export + Integrate

เมื่อพอใจแล้ว:

### 4.1 Export design tokens
- กด Export → เลือก `design-tokens.js` (หรือ JSON)
- คัดลอก content

### 4.2 ส่งให้ผม (Claude Code) ทำต่อ
- ส่งไฟล์ที่ export มา (หรือ paste content)
- บอกว่า "เอา design tokens นี้ไปใส่ shared/design-tokens.js และอัปเดต tailwind.config.js + หน้าที่ใช้สีให้ตรง pattern ใหม่"

ผมจะ:
- สร้าง `deploy/components/shared/design-tokens.js`
- อัปเดต `tailwind.config.js` ให้ extend theme ด้วย tokens
- Refactor หน้าที่มี inconsistency ให้ใช้ token แทน hardcoded class
- Commit + push

---

## 💡 Tips

- **ทำทีละเล็ก** — อย่าพยายามให้ Claude Design ทำ redesign ทั้งแอปใน session เดียว
- **Export บ่อย ๆ** — พอพอใจ component หนึ่ง export ทันที เก็บไว้ได้
- **ส่งกลับมาหาผม** — Design system ที่ได้ยังต้อง implement ในโค้ดจริง ส่วนนี้ผมทำได้เร็วกว่า

---

## 📁 ไฟล์ที่ต้องใช้ (อยู่ใน project แล้ว)

| ไฟล์ | ใช้ทำอะไร |
|------|----------|
| `deploy/docs/DESIGN_BRIEF.md` | อัปโหลดเข้า Claude Design (briefing) |
| `deploy/components/shared/*` | อัปโหลดตัวอย่าง component |
| `deploy/components/pages/Page*.jsx` | อัปโหลดตัวอย่างการใช้จริง (เอา 2-3 หน้าพอ) |
| `deploy/tailwind.config.js` | อัปโหลดด้วย (ถ้ามี custom theme) |
