---
type: project
project: kingpower-aot
status: planning
created: 2026-06-11
tags: [kingpower, aot, airport, pos, rr-system, vending, compliance]
---

# แผนผังงาน — โปรเจคลงตู้ที่สนามบิน (King Power / AOT RR)

> ที่มา: King Power สุวรรณภูมิ (KPS) แจ้งให้เราดำเนินการตามชุดเอกสาร "คู่มือ - พัฒนาโปรแกรม POS สำหรับตู้ Vending"
> เป้าหมาย: ลงตู้ขายในพื้นที่สนามบิน → ต้องเชื่อมระบบขายเข้ากับ **AOT Revenue Reconciliation (AOT RR)**
> เอกสารต้นทาง: `คู่มือ - พัฒนาโปรแกรม POS สำหรับตู้ Vending/` (อ่านสรุปไว้ที่ [[#สรุปข้อกำหนดย่อ]])

---

## 🗺️ แผนผังงานหลัก (Master Workflow)

```mermaid
flowchart TD
    START([เริ่มโปรเจค]) --> P0

    subgraph P0["เฟส 0 · ตัดสินใจเชิงกลยุทธ์"]
        D0{"ตู้ vending ฝัง RCAgent<br/>ได้เองไหม?"}
        D0 -->|"ทำเอง"| A0a["พัฒนา integration เอง<br/>(.NET / Java / Android)"]
        D0 -->|"จ้าง"| A0b["ใช้ POS Supplier ที่ผ่าน AOT แล้ว<br/>Idea POS / เจ้าพระยาคอมพิวเทค /<br/>DTOTAL / CMPOS"]
    end

    P0 --> P1 & P2 & P3

    subgraph P1["เฟส 1 · เอกสาร + ภาษี (สรรพากร)"]
        direction TB
        T1["ขอเอกสารจาก KPS<br/>สัญญาเช่า + หนังสือยินยอม + แผนผัง"] --> T2["จดทะเบียนสาขา ภ.พ.09<br/>(ก่อนเปิด ≥ 15 วัน)"]
        T2 --> T3["ยื่น ภ.พ.06 ขอใช้เครื่อง POS<br/>ออกใบกำกับภาษีอย่างย่อ ม.86/6"]
        T3 --> T4["สรรพากรอนุมัติ ~1 เดือน<br/>ออกเลขเครื่อง RD ID = POS_NO"]
        T4 --> T5["เจ้าหน้าที่ติดสติ๊กเกอร์ที่ตู้<br/>+ ส่ง ค.ก.2 + เลขเครื่องให้ KPS"]
    end

    subgraph P2["เฟส 2 · พัฒนาระบบ POS"]
        direction TB
        DV1["integrate RCAgent<br/>(ขอ RC Code ต่อรายการ realtime)"] --> DV2["integrate RCMonitor<br/>(heartbeat Login/Logout)"]
        DV2 --> DV3["พิมพ์/แสดงใบเสร็จ<br/>ที่มี RC Code 16 หลัก"]
        DV3 --> DV4["Generate Text File 5 ชุด<br/>HEADER/DETAIL/PAYMENT/SUMPAY/SUMSALES"]
        DV4 --> DV5["รองรับ Offline mode<br/>(เก็บ local → ส่งเมื่อ online)"]
    end

    subgraph P3["เฟส 3 · ขออนุมัติราคาสินค้า (KPS CAC)"]
        direction TB
        PR1["เตรียมราคา · ห้ามเกินตลาด 20%<br/>+ ราคาอ้างอิงห้าง/โรงแรมชั้นนำ"] --> PR2["ส่ง Text File สินค้า<br/>(TxnType 1=ใหม่)"]
        PR2 --> PR3["KPS อนุมัติผ่าน Web<br/>(ส่งล่วงหน้า ≥ 15 วันทำการ)"]
    end

    P1 --> GATE
    P2 --> GATE
    P3 --> GATE

    subgraph P4["เฟส 4 · ทดสอบ (Gate ต้องผ่านเรียง)"]
        direction TB
        GATE["self-test ตามแบบฟอร์ม<br/>+ แนบหลักฐาน"] --> Q7{"ทอท. ตรวจเอกสาร<br/>7 วัน"}
        Q7 -->|"ไม่ผ่าน"| GATE
        Q7 -->|"ผ่าน"| SIT["SIT Test<br/>online cloud + IT ทอท. (MS Teams)"]
        SIT -->|"ไม่ผ่าน"| SIT
        SIT -->|"ผ่าน"| UAT["UAT Test<br/>onsite หน้าร้านจริง + พาณิชย์ท่าฯ"]
        UAT -->|"ไม่ผ่าน"| UAT
    end

    P4 --> GOLIVE

    subgraph P5["เฟส 5 · เปิดขายจริง + ดำเนินงาน"]
        direction TB
        GOLIVE["ต่อ Production Server"] --> OP1["ขายจริง · พิมพ์ใบเสร็จ + RC Code<br/>+ ส่ง realtime ทุกบิล"]
        OP1 --> OP2["ส่ง Text File รายวัน<br/>ภายใน 9:00 น. วันถัดไป"]
        OP2 --> OP3["ยืนยันยอดทาง email ทุกวัน<br/>+ รับตรวจราคาทุกสัปดาห์"]
    end

    P5 --> DONE([เปิดให้บริการเต็มรูปแบบ])

    classDef decision fill:#fff3cd,stroke:#d39e00,color:#000
    classDef gate fill:#f8d7da,stroke:#c82333,color:#000
    class D0,Q7 decision
    class GATE,SIT,UAT gate
```

---

## ⛓️ ลำดับการพึ่งพา (Critical Path)

```mermaid
flowchart LR
    A["KPS ให้เอกสาร<br/>สัญญา/ยินยอม"] --> B["ภ.พ.09<br/>จดสาขา"]
    B --> C["ภ.พ.06<br/>ขอ POS"]
    C --> D["ได้ RD ID<br/>(POS_NO)"]
    D --> E["ทดสอบ SIT/UAT<br/>ต้องมี POS_NO จริง"]
    F["พัฒนา RCAgent<br/>+ Text File"] --> E
    G["อนุมัติราคา KPS"] --> H["UAT ขายจริง"]
    E --> H
    H --> I["Production<br/>Go-live"]

    classDef crit fill:#f8d7da,stroke:#c82333,color:#000
    class D,E,H crit
```

> **คอขวด (สีแดง):** การได้ **RD ID จากสรรพากร** กั้นการทดสอบ — เริ่มงานภาษีให้เร็วที่สุดเพราะกินเวลา ~1 เดือนและขึ้นกับหน่วยงานราชการ ทำคู่ขนานกับการพัฒนาได้

---

## 📅 Timeline โดยประมาณ (Gantt)

```mermaid
gantt
    title แผนเวลาโดยประมาณ (เริ่มนับจากวันตัดสินใจ)
    dateFormat YYYY-MM-DD
    axisFormat สัปดาห์ %U

    section ตัดสินใจ
    เลือก build vs outsource         :d0, 2026-06-15, 1w

    section เอกสาร/ภาษี
    ขอเอกสารจาก KPS                  :t1, after d0, 1w
    จดสาขา ภ.พ.09                    :t2, after t1, 2w
    ขอ POS ภ.พ.06 + รออนุมัติ        :t3, after t2, 4w
    ติดสติ๊กเกอร์ + ส่ง ค.ก.2 ให้ KPS  :t4, after t3, 1w

    section พัฒนา
    integrate RCAgent/RCMonitor      :dv1, after d0, 4w
    Generate Text File 5 ชุด          :dv2, after dv1, 3w
    Offline mode + ใบเสร็จ RC Code    :dv3, after dv2, 2w

    section ราคา
    เตรียม + ขออนุมัติราคา KPS        :pr1, after t1, 3w

    section ทดสอบ
    self-test + ทอท.ตรวจ 7 วัน        :qa1, after dv3, 2w
    SIT Test                         :sit, after qa1, 2w
    UAT Test (ต้องมี RD ID)          :uat, after sit, 2w

    section เปิดขาย
    Go-live Production               :go, after uat, 1w
```

> ⏱️ **รวมประมาณ 3–4 เดือน** ถ้าทำเอง · จะเร็วขึ้นมากถ้าใช้ POS supplier ที่ผ่าน AOT แล้ว (ข้ามงานพัฒนา RCAgent)

---

## 🔀 จุดตัดสินใจหลัก: ทำเอง vs จ้าง

```mermaid
flowchart TD
    Q{"แพลตฟอร์มตู้ปัจจุบัน<br/>(WorldWide / VMS InboxCorp)<br/>เปิดให้ฝัง RCAgent / มี API ไหม?"}
    Q -->|"ได้ + มีทีมพัฒนา"| BUILD["ทำเอง<br/>✅ คุมระบบเอง ต้นทุนระยะยาวต่ำ<br/>❌ ใช้เวลานาน · ต้องผ่าน SIT/UAT เอง"]
    Q -->|"ไม่ได้ / ไม่อยากเสี่ยง"| BUY["จ้าง POS Supplier ที่ผ่าน AOT<br/>✅ เร็ว · ผ่านการรับรองแล้ว<br/>❌ ค่าใช้จ่าย/เดือน · ผูกกับ vendor"]
    BUILD --> CHK["ต้องเช็ค: controller ตู้รัน .NET/Java/Android ได้ไหม +<br/>ออกใบกำกับภาษีอย่างย่อต่อบิลได้ไหม"]
    BUY --> CONTACT["ติดต่อ: Idea POS / เจ้าพระยาคอมพิวเทค /<br/>DTOTAL / CMPOS"]
```

---

## ✅ Checklist รวม

### เฟส 1 — เอกสาร/ภาษี
- [ ] ขอจาก KPS: สัญญาเช่า KPS–AOT, สัญญา KPS–เรา, หนังสือยินยอมใช้สถานที่, แผนผังที่ตั้ง, เลขที่
- [ ] จดทะเบียนสาขา **ภ.พ.09** (5 ชุด) ที่สรรพากรพื้นที่สำนักงานใหญ่ — ก่อนเปิด ≥15 วัน
- [ ] ยื่น **ภ.พ.06** (+ ภ.พ.01, ภ.พ.09, หนังสือรับรองบริษัท, คู่มือ POS, แผนผังโปรแกรม/การวางเครื่อง, ตัวอย่างใบกำกับภาษีอย่างย่อ)
- [ ] รับ **RD ID (POS_NO)** จากสรรพากร
- [ ] เจ้าหน้าที่ติดสติ๊กเกอร์ที่ตู้
- [ ] ส่ง **ค.ก.2** + รายละเอียดเลขเครื่องให้ KPS

### เฟส 2 — พัฒนา
- [ ] integrate **RCAgent** (ขอ RC Code realtime ต่อบิล)
- [ ] integrate **RCMonitor** (heartbeat, เปิดตลอดเวลา)
- [ ] ใบเสร็จ/ใบกำกับภาษีอย่างย่อ พิมพ์ **RC Code 16 หลัก**
- [ ] Generate **Text File 5 ชุด** (pipe-delimited, ชื่อ `Shopcode_Sales_YYYYMMDDHHMMSS.txt`)
- [ ] ตรวจกฎ: `SALE_HEADER_AMT == SALE_DTL_AMT`, void = ยอดติดลบ
- [ ] รองรับ **Offline** (เก็บ local → ส่งเมื่อ online)

### เฟส 3 — ราคา (KPS CAC)
- [ ] ทำราคา ≤ ตลาด +20% + เตรียมราคาอ้างอิง (ห้าง/โรงแรมชั้นนำ กทม.)
- [ ] ส่ง Text File สินค้า (Product Code ห้ามซ้ำ, ชื่ออังกฤษ) — ล่วงหน้า ≥15 วันทำการ
- [ ] รับผลอนุมัติผ่าน Web

### เฟส 4 — ทดสอบ
- [ ] self-test ตามแบบฟอร์ม + แนบหลักฐาน → ทอท. ตรวจ 7 วัน
- [ ] ผ่าน **SIT** (online, IT ทอท.)
- [ ] ผ่าน **UAT** (onsite, พาณิชย์ท่าฯ)

### เฟส 5 — ดำเนินงานต่อเนื่อง
- [ ] ส่ง Text File รายวันภายใน 9:00 น.
- [ ] ยืนยันยอดทาง email ทุกวัน · วันไม่มีขายแจ้งเป็นลายลักษณ์อักษร
- [ ] รับตรวจราคารายสัปดาห์ · ส่งรายได้รับรองผู้สอบบัญชี (45 วัน) · งบการเงิน (5 เดือน)

---

## 📌 สรุปข้อกำหนดย่อ
- **2 ส่วนคู่กัน:** Realtime (RCAgent/RCMonitor) + Text File รายวัน (5 datasets)
- **Text File:** pipe `|` คั่น, 1 record/บรรทัด, ส่งภายใน 9:00 น. วันถัดไป
- **ทดสอบเป็น gate:** เอกสาร(7วัน) → SIT → UAT → Production
- **ต่างจากระบบเดิม:** ปัจจุบันดึงยอดจาก VMS/WorldWide · อันนี้ตู้ต้องเป็น POS ออกใบกำกับภาษีเอง

## ☎️ ผู้ติดต่อ
- **ICT (ทดสอบ Text File):** คุณธงชัย 02-134-8888 ต่อ 2017 · thongchai_j@kingpower.com
- **ICT เพิ่มเติม:** คุณธเนศ ต่อ 2071 · คุณศรัณญู ต่อ 2074
- **การตลาด KPS (เอกสารจดทะเบียน):** คุณปานทิพย์ ต่อ 7715 · คุณนพดล ต่อ 7711
- **ตรวจสอบรายได้:** คุณทรงพล (ผจก.) ต่อ 7744 · สาขาสุวรรณภูมิ ต่อ 7750/7743

## 🔗 เกี่ยวข้อง
- ตู้ปัจจุบัน: [[wwv05]] (WorldWide) · [[chukes01]] (VMS) — แพลตฟอร์มที่ต้องเช็คว่าฝัง RCAgent ได้ไหม
