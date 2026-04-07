# 🚀 คู่มือ Upload ขึ้น GitHub + Deploy บน Vercel

> ไม่ต้องใช้ Terminal! ทำทั้งหมดผ่าน GUI ได้เลย

---

## ขั้นตอนที่ 1 — ติดตั้ง GitHub Desktop

1. ไปที่ **https://desktop.github.com**
2. คลิก **Download for your OS** แล้วติดตั้ง
3. เปิดโปรแกรม แล้ว Sign in ด้วย GitHub Account ของคุณ

---

## ขั้นตอนที่ 2 — สร้าง Repository ใหม่บน GitHub

1. ไปที่ **https://github.com/new**
2. ตั้งชื่อ Repository: `divisionx-card`
3. เลือก **Public** (Vercel ฟรีรองรับ Public repo)
4. **อย่า** เลือก Add README (ไม่ต้อง)
5. คลิก **Create repository**

---

## ขั้นตอนที่ 3 — เพิ่มไฟล์โปรเจคด้วย GitHub Desktop

1. เปิด **GitHub Desktop**
2. คลิก **File → Add Local Repository...**
3. เลือกโฟลเดอร์ **`deploy`** ที่ได้รับมา (โฟลเดอร์นี้)
4. ถ้าถามว่า "initialize a new repository?" → คลิก **Initialize Repository**
5. ด้านซ้ายจะเห็นไฟล์ทั้งหมดที่รอ commit → ใส่ข้อความใน **Summary**: `Initial commit`
6. คลิก **Commit to main**
7. คลิก **Publish repository** → เลือก repo ที่สร้างไว้ → คลิก **Publish**

---

## ขั้นตอนที่ 4 — Deploy บน Vercel

1. ไปที่ **https://vercel.com** → Sign up / Login ด้วย GitHub
2. คลิก **Add New → Project**
3. เลือก **Import Git Repository** → เลือก `divisionx-card`
4. ตั้งค่า:
   - **Framework Preset**: Next.js (ตรวจจับอัตโนมัติ)
   - **Root Directory**: `.` (ปล่อยว่าง)
   - ไม่ต้องใส่ Environment Variables
5. คลิก **Deploy** → รอประมาณ 1-2 นาที
6. Vercel จะให้ URL เช่น `https://divisionx-card.vercel.app` 🎉

---

## ✅ สรุปไฟล์ในโปรเจค

```
deploy/
├── app/
│   ├── globals.css       ← Tailwind CSS
│   ├── layout.jsx        ← HTML wrapper
│   └── page.jsx          ← หน้าหลัก
├── components/
│   └── DivisionXApp.jsx  ← แอปทั้งหมด
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
└── tailwind.config.js
```

---

## 🔄 การอัปเดตในอนาคต

เมื่อแก้ไขโค้ดแล้วต้องการ deploy ใหม่:
1. แก้ไขไฟล์ที่ต้องการ
2. เปิด GitHub Desktop → เห็นการเปลี่ยนแปลง → ใส่ Summary → Commit → Push
3. Vercel จะ deploy อัตโนมัติทันที ✨
