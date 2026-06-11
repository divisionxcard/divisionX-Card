---
type: knowledge-base
project: kingpower-aot
status: reference
created: 2026-06-11
tags: [kingpower, aot, rr-system, text-file-spec, pos, tax, reference]
---

# 📚 Knowledge Base — King Power / AOT RR System (สเปคเต็ม)

> เอกสารอ้างอิงสกัดจากชุดคู่มือ KPS (`คู่มือ - พัฒนาโปรแกรม POS สำหรับตู้ Vending/`)
> ใช้คู่กับแผนงาน: [[kingpower-aot-plan]]
> เวอร์ชันสเปค: **AOT RR Text File Format (TH) V9**

---

## 1. สถาปัตยกรรมระบบ AOT RR

```
ตู้/ร้านค้า (Tenant POS)
   ├── RCAgent  ──realtime──►  AOT RC Server  (ขอ RC Code ต่อบิล)
   ├── RCMonitor ──heartbeat──►  AOT RC Server  (Login/Logout)
   └── Text File (ปิดยอดรายวัน) ──upload เว็บ ทอท.──►  AOT RR System
```

- **RCAgent** = library รวมเข้ากับ POS · ขอ **RC Code** (เลขรับรอง 16 หลัก เช่น `0107154048117801`) · ใบเสร็จทุกใบต้องพิมพ์ RC Code · มีให้เป็น **.NET / Java / Android**
- **RCMonitor** = ส่งสถานะเครื่อง ต้องเปิดตลอดเวลาที่ POS เปิด · เจ้าหน้าที่ ทอท. ดูสถานะลงทะเบียนได้
- **3 สถานะ:** ยังไม่ลงทะเบียน / RC Online / RC Offline
  - Offline: เก็บใบเสร็จ local + ออก RC Code เองได้ → พอ Online ส่งอัตโนมัติ

---

## 2. โครงสร้าง Text File รายวัน

### 2.1 กฎรูปแบบไฟล์
- คั่นฟิลด์ด้วย `|` (pipe) · **ห้ามมี `|` ในข้อมูล**
- 1 record = 1 บรรทัด (ขึ้นบรรทัดใหม่)
- ข้อมูลเกินความยาวสูงสุด → ตัดทิ้งส่วนเกิน (เช่น Text(200) ส่ง 215 → เก็บ 200)
- Number(16,2) รูปแบบ `################.##`
- **ชื่อไฟล์:** `Shopcode_Sales_YYYYMMDDHHMMSS.txt` (YYYYMMDD=วันที่ขาย ค.ศ., HHMMSS=เวลาสร้างไฟล์)
- ส่ง **ทุกวันภายใน 9:00 น.** · ห้ามชื่อซ้ำ · แก้ไข = ส่งใหม่ทั้งไฟล์ + ระบุเหตุผล

### 2.2 ห้า Dataset ในไฟล์เดียว
| Dataset | เนื้อหา | จำนวนฟิลด์ |
|---------|---------|-----------|
| `SALESHEADER` | หัวใบเสร็จ | 52 |
| `SALESDETAIL` | รายการสินค้าต่อบรรทัด | 46 |
| `SALESPAYMENT` | การรับชำระแต่ละรายการ | 12 |
| `SUMPAYMENT` | สรุปการรับชำระ/วัน | 8 |
| `SUMSALES` | สรุปยอดขาย/วัน | 10 |

### 2.3 SALESHEADER — ฟิลด์สำคัญ (52 ฟิลด์)
| # | Field | Type | คำอธิบาย |
|---|-------|------|----------|
| 1 | SHOP_CODE | Text(20) | KPS กำหนด |
| 2 | BRANCH_CODE | Text(20) | KPS กำหนด |
| 3 | SALE_NO | Text(20) | เลขที่ใบเสร็จ |
| 4 | POS_NO | Text(20) | **รหัสเครื่อง POS (RD ID) ที่สรรพากรออก** |
| 6 | SALE_STATUS | Num(1) | 1=ขายปกติ, 2=Void |
| 7 | SALE_DATE | Text(10) | YYYY-MM-DD (ค.ศ.) |
| 10 | CREATE_DATE | Text(19) | YYYY-MM-DD HH:MM:SS |
| 11 | TRANS_DATE | Text(19) | เวลา submit transaction |
| 15 | FLIGHT_NO | Text(10) | เลขเที่ยวบิน (duty-free) |
| 17 | NATION_CODE | Text(5) | สัญชาติ |
| 18 | PASSPPORT_NO | Text(50) | เลขพาสปอร์ต |
| 21 | VAT_TYPE | Text(1) | 0=No VAT, 1=With VAT |
| 22 | VAT_RATE | double | อัตรา VAT |
| 23–25 | AMT_EXC/VAT/INC_VAT | Num(16,2) | ราคารวมก่อนหักส่วนลด |
| 27–29 | EXTRA_DISC_* | Num(16,2) | ส่วนลดท้ายใบเสร็จ |
| 30–32 | TOTAL_DISC_* | Num(16,2) | ส่วนลดรวม |
| 35–38 | SERVICE_CHARGE_* | double | ค่าบริการ (type 1/2) |
| 39–41 | NET_EXC/VAT/INC_VAT | double | ราคาสุทธิหลังหักส่วนลด รวม service |
| 43–45 | CANCEL_TAX_INVOICE_* | Text | ข้อมูลใบที่ถูกยกเลิก |
| 46 | VOID_REASON | Text(200) | เหตุผลยกเลิก |
| 51 | RC_CODE | Text(50) | **เลขรับรอง 16 หลักจาก ทอท.** |
| 52 | ROUND | double | ปรับเศษ (+/-), default 0 |

### 2.4 SALESDETAIL — ฟิลด์สำคัญ (46 ฟิลด์)
| # | Field | คำอธิบาย |
|---|-------|----------|
| 8 | SEQ | ลำดับรายการ |
| 9–10 | AOT_PRODUCT_CATE_CODE/NAME | กลุ่มสินค้าของ ทอท. |
| 12–13 | PROD_SERV_CODE/NAME | รหัส + ชื่อสินค้า (อังกฤษ) |
| 16 | PROD_SERV_QTY | จำนวนขาย |
| 18 | UNIT_CODE | Text(4) เช่น 0012=Each |
| 19–20 | AOT_PRICE_EXC/INC_VAT | ราคาที่ ทอท. อนุมัติ |
| 28–36 | UNIT_AMT_* / UNIT_NET_* | ราคา/ส่วนลด/สุทธิ ต่อหน่วย |
| 37–45 | TOTAL_AMT_* / TOTAL_NET_* | ราคา/ส่วนลด/สุทธิ รวมทุกชิ้น |
| 46 | TOTAL_DISPLAY_AMT | ราคาที่แสดงบนใบเสร็จจริง |

### 2.5 SALESPAYMENT (12) / SUMPAYMENT (8)
- **PAY_TYPE:** 1=Cash, 2=Traveler Cheque, 3=Credit Card, 4=Coupon/Voucher, 5=Suvarnabhumi Card, 6=Prepaid Card, **7=QR Payment**
- CURRENCY_CODE, RATE (exchange rate), AMOUNT (สกุลเงิน), BAHT_AMT (บาท)

### 2.6 SUMSALES (10) — สรุปวัน
- SALE_HEADER_AMT, NET_SALE_HEADER_*, SALE_DTL_AMT, NET_SALE_DTL_AMT, PAYMENT_AMT

### 2.7 กฎตรวจสอบสำคัญ (Validation)
1. `**` = ทอท. กำหนด · `*` = กรณีออกใบมือ ให้ POS_NO = `XXXX-SHOP_CODE`
2. ยกเลิกใบเสร็จ → ส่งทั้งใบปกติ (STATUS=1) **และ** ใบ Void (STATUS=2) · ใบ Void ใส่ยอด**ติดลบทุกฟิลด์** + กรอก CANCEL_TAX_INVOICE_*
3. ผลรวม SALESDETAIL ของแต่ละบิล = ยอดบิลใน SALESHEADER
4. **`SALE_HEADER_AMT` (SUMSALES#4) ต้อง = `SALE_DTL_AMT` (SUMSALES#8)**

---

## 3. ขั้นตอนทดสอบ (Gate เรียงลำดับ)

| ขั้น | รายละเอียด | ผู้ร่วม |
|-----|-----------|--------|
| self-test | ทดสอบทุกฟังก์ชันตามแบบฟอร์ม + แนบหลักฐาน | เราเอง |
| ตรวจเอกสาร | ทอท. ตรวจ **7 วัน** | ทอท. |
| **SIT Test** | online ผ่าน cloud จำลอง · เน้นฟังก์ชัน POS+RCAgent | IT ทอท. (MS Teams) |
| **UAT Test** | onsite หน้าร้านจริง ผ่าน QA Server · เน้นการขาย+ใบเสร็จ | พาณิชย์ท่าฯ |
| Production | ผ่าน UAT → ต่อ Production server | — |

เอกสารคู่มือพัฒนา/ทดสอบ (SharePoint KingPower) มี: คู่มือเชื่อมต่อแยก OS, รายละเอียดตัวแปรให้ RCAgent, โครงสร้าง Text File, แบบฟอร์มบันทึกผลทดสอบ, ตัวอย่างยกเลิกใบเสร็จ

---

## 4. งานภาษี (กรมสรรพากร) — ~1 เดือน

**จดทะเบียนสาขา (ภ.พ.09):** ยื่นที่สรรพากรพื้นที่สำนักงานใหญ่ · ก่อนเปิด ≥15 วัน · 5 ชุด + บัตร ปชช.กรรมการ, ทะเบียนบ้าน, แผนที่, สัญญาเช่า KPS–AOT + KPS–เรา + หนังสือยินยอม (ฉบับจริง), รูปถ่าย, หนังสือรับรองบริษัท (≤6 เดือน)

**ขอใช้เครื่อง POS (ภ.พ.06):** ออกใบกำกับภาษีอย่างย่อ ม.86/6 · มี checkbox "ร้านค้าย่อยในห้องผู้โดยสารขาออก สนามบินนานาชาติ" · แนบ ภ.พ.01, ภ.พ.09, หนังสือรับรอง, คู่มือ POS, แผนผังโปรแกรม, แผนผังวางเครื่อง, ตัวอย่างใบกำกับภาษีอย่างย่อ

**ผลลัพธ์:** สรรพากรออก **เลขรหัสประจำเครื่อง (RD ID = POS_NO)** → เจ้าหน้าที่มาติดสติ๊กเกอร์ → ส่ง **ค.ก.2** + เลขเครื่องให้ KPS

> 💡 จดสาขา + จด POS ทำวันเดียวกันได้ (ดุลพินิจเจ้าหน้าที่) · สำนักงานใหญ่ กทม. → สรรพากรสมุทรปราการมาติดสติ๊กเกอร์ตู้สนามบิน

---

## 5. ขออนุมัติราคาสินค้า (KPS — ฝ่าย CAC)

**กฎราคา:** ส่งล่วงหน้า **≥15 วันทำการ** · ราคาห้ามเกินตลาด **20%** (อ้างอิงห้าง/โรงแรมชั้นนำ กทม.) · ห้ามขายก่อนอนุมัติ · ตรวจราคา**ทุกสัปดาห์** · น้ำเปล่า 600ml **≤10 บาท** · ห้ามกัญชา/กระท่อม · ห้ามทับซ้อนสัมปทานอื่น

**Text File สินค้า** (pipe คั่น, ปิดท้าย pipe 5 ตัว):
```
Shop Code|Product Category Code|Product Code|Product Name|Shop Brand Code|Bar Code|Transaction Type|VAT Type|VAT|Unit Code|Request Date|Price Ex.VAT|Price Inc.VAT|Start Date|End Date|Reference Price|Reference Place|Reference Date|||||
```
ตัวอย่าง:
```
0901078|5NKA|001001||0001|Nestlé Pure Life Water 600 ml.|1|1|7.00|0012|2026-06-15|9.35|10.00|2026-07-01 00:00:00|2028-03-31 23:59:59|25.00|Coffee Beans by Dao – Siam Paragon|2026-06-15|||||
```
- **Transaction Type:** 1=สินค้าใหม่, 2=ปรับราคา, 3=ยกเลิก
- **VAT Type:** 1=มี VAT, 2=ไม่มี · VAT=`7.00`
- **Product Name = อังกฤษเท่านั้น** · **Product Code ห้ามซ้ำ / ห้ามใช้ซ้ำหลังยกเลิก / ห้ามเปลี่ยนชื่อ**
- Unit Code: 0012=Each, 0011=Dish, 0014=Glass (KPS กำหนด)
- Product Category Code: KPS กำหนด (เช่น 5xxx = Food & Beverages — มีตารางหมวดละเอียดในเอกสาร 03)

---

## 6. ภาระต่อเนื่องหลังเปิดขาย
- ส่ง Text File รายวันภายใน **9:00 น.** วันถัดไป
- **ยืนยันยอดขายทาง email ทุกวัน** (KPS ส่งยอดมาให้ตอบกลับ)
- วันไม่มีขาย/ส่งไม่ได้ → แจ้ง KPS เป็นลายลักษณ์อักษร
- ส่งรายได้ที่**ผู้สอบบัญชีรับรอง** (มาตรฐาน 805) ภายใน **45 วัน** สิ้นปีปฏิทิน
- ส่ง**งบการเงิน**ภายใน **5 เดือน** สิ้นรอบบัญชี

---

## 7. POS Supplier ที่ผ่าน AOT สุวรรณภูมิแล้ว (ทางเลือกจ้าง)
| Supplier | ผู้ติดต่อ | เบอร์ |
|----------|----------|------|
| Idea POS | คุณพูลทวี | 091-808-3506 |
| เจ้าพระยาคอมพิวเทค | คุณสุรพล | 02-801-3843-6, 081-810-5168 |
| DTOTAL | คุณพรศักดิ์ | 02-149-3979, 086-388-2270 |
| CMPOS | คุณแมนสวง | 081-860-3253 |

## 8. ผู้ติดต่อ KPS
- **ICT ทดสอบ Text File:** คุณธงชัย ต่อ 2017 (thongchai_j) · คุณธเนศ ต่อ 2071 (tanate_t) · คุณศรัณญู ต่อ 2074 (sarunyu_m)
- **การตลาด (เอกสารจดทะเบียน):** คุณปานทิพย์ ต่อ 7715 · คุณนพดล ต่อ 7711 · คุณพัทรียา ต่อ 7714
- **ตรวจสอบรายได้:** คุณทรงพล (ผจก.) ต่อ 7744 · สุวรรณภูมิ: คุณณฐาภัทร ต่อ 7750, คุณนิตยา ต่อ 7743
- เบอร์กลาง KPS: 02-134-8888

## 🔗 เกี่ยวข้อง
[[kingpower-aot-plan]] · [[wwv05]] · [[chukes01]]
