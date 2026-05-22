# DivisionX Wiki

ระบบ knowledge base สำหรับโปรเจค DivisionX Card — เก็บข้อมูลเชิงลึกที่ database เก็บไม่ได้ เช่น สมมติฐาน, pattern, audit trail, และรายงานการกระทบยอด

## วิธีเปิดใน Obsidian (ครั้งแรก)

1. เปิดโปรแกรม **Obsidian**
2. กด **"Open folder as vault"**
3. เลือกโฟลเดอร์นี้ (`c:\Projects\divisionX Card\wiki`)
4. กด **Trust author and enable plugins**

## โครงสร้าง

```
wiki/
├── _index.md              ← หน้าหลัก เริ่มอ่านที่นี่
├── README.md              ← ไฟล์นี้
├── skus/                  ← ข้อมูล SKU แต่ละตัว (21 รายการ)
├── machines/              ← ข้อมูลตู้แต่ละตู้ (4 ตู้)
├── discrepancies/         ← รายงานข้อมูลที่ไม่ตรงกัน
└── closes/                ← รายงานปิดบัญชีรายเดือน
```

## กฎสำคัญ

- **ไฟล์ทุกไฟล์เขียนโดย LLM agent** — ห้ามแก้มือ ยกเว้นกรณีที่ agent เขียนผิด
- ถ้าจะแก้มือ → commit message ต้องระบุ `manual:`
- ใช้ `[[backlinks]]` เชื่อมโยงระหว่างไฟล์เสมอ
- ใช้ frontmatter (YAML) ทุกไฟล์เพื่อให้ Dataview query ได้

## Plugin ที่แนะนำติดตั้ง

หลังเปิด vault → Settings → Community plugins → Browse:

- **Dataview** — query .md files เหมือน SQL
- **Templater** — สร้างไฟล์จาก template
- **Tag Wrangler** — จัดการ tag

## คำสั่ง Git สำหรับ wiki

```bash
# Pull ล่าสุดจาก agent
git pull

# ถ้าแก้มือ
git add wiki/
git commit -m "manual: แก้ typo ใน OP01"
git push
```
