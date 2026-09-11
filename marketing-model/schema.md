# schema — โครงข้อมูลเข้าและออก

## อินพุต

ทุกฟิลด์เป็น **optional** โดยตั้งใจ — โมดูลต้องไม่พังเมื่อข้อมูลไม่ครบ
ฟิลด์ที่ขาดจะถูกแทนด้วยค่าปริยาย แล้วแจ้งไว้ใน `warnings` ว่าข้อความจะกว้างกว่าที่ควร

| ฟิลด์ | ชนิด | ตัวอย่าง | ผลถ้าไม่ส่ง |
|---|---|---|---|
| `objective` | string | `"หา lead เจ้าของทรัพย์ต้องการเงิน"` | ใช้ `awareness` |
| `audience` | string | `"เจ้าของที่ดินที่ต้องการสภาพคล่อง"` | ใช้กลุ่มปริยายของ objective |
| `offer` | string | `"ประเมินทรัพย์เบื้องต้นฟรี"` | ใช้ประโยคกลาง ๆ |
| `assetType` | string | `"ที่ดินเปล่า"` | ใช้ `other` |
| `province` | string | `"ชลบุรี"` | ใช้คำว่า "พื้นที่ที่ให้บริการ" และไม่มีแท็กจังหวัด |
| `channel` | string | `"Facebook"` | ใช้ `facebook` |
| `tone` | string | `"น่าเชื่อถือ"` | ใช้ `trustworthy` |
| `contentType` | string | `"educate"` | ใช้ `educate` |
| `propertyData` | object | ดูด้านล่าง | ไม่ใส่ตัวเลขใด ๆ ในคอนเทนต์ + เตือนถ้าเป็นคอนเทนต์เปิดตัวทรัพย์ |
| `campaignContext` | object | `{ "campaign": "Q4", "budget": 5000 }` | ไม่มีผล (ส่งต่อเข้า prompt ของ LLM เท่านั้น) |

### การจับคู่ค่าที่พิมพ์อิสระ

ไม่ต้องส่งเป็นรหัส — ระบบจับคู่จากชื่อเต็ม ชื่อย่อ และคำพ้องภาษาไทย/อังกฤษให้
(`"ติ๊กต็อก"` / `"TikTok"` / `"tiktok"` ได้ผลเหมือนกัน) จับคู่ไม่ได้ = ใช้ค่าปริยาย + เตือน

**ค่าที่รองรับ** (เรียกดูจากโค้ดได้ด้วย `getOptions()` เพื่อทำ dropdown โดยไม่ hardcode):

| กลุ่ม | ค่า |
|---|---|
| objective | `lead_owner` · `lead_seller` · `lead_investor` · `awareness` · `education` |
| contentType | `educate` · `case-study` · `property-highlight` · `behind-the-scenes` · `faq` |
| channel | `facebook` · `tiktok` · `line-oa` · `youtube-shorts` · `instagram` |
| tone | `trustworthy` · `professional` · `simple` · `urgent` |
| assetType | `land` · `house` · `condo` · `commercial` · `factory` · `other` |

### `propertyData`

ใส่เท่าที่มี — ระบบหยิบเฉพาะคีย์ที่มีค่าจริงมาประกอบเป็นบรรทัดสเปก
**ไม่มีการเดา ไม่มีการคำนวณต่อ ไม่มีการเติมหน่วยที่ไม่ได้ส่งมา**

```js
{
  areaRai: 5, areaNgan: 2, areaWa: 62, areaSqm: 248,
  price: 12500000,          // ตัวเลขล้วนหรือสตริงมีคอมมาก็ได้ → แปลงเป็น "12.5 ล้านบาท"
  pricePerWa: 85000,
  deedType: "โฉนด (น.ส.4)",
  roadWidth: 12, bedrooms: 3, bathrooms: 2,
  landmark: "นิคมอมตะซิตี้",
  utilities: "ไฟฟ้า น้ำประปาถึงที่"
}
```

คีย์ภาษาไทยก็ใช้ได้ (`ไร่` `งาน` `ตารางวา` `ราคา` `ห้องนอน` `ใกล้` …)

---

## เอาต์พุต

```js
{
  headline: string,               // พาดหัวไทย ≤ ~30 ตัว ใช้ซ้อนบนภาพได้
  caption: string,                // แคปชั่นเต็ม แบ่งย่อหน้าด้วย \n\n ไม่มีแฮชแท็ก
  imagePrompt: string,            // คำสั่งภาษาอังกฤษสำหรับโมเดลสร้างภาพ
  videoScript: string,            // หนึ่งบรรทัด = หนึ่งฉาก
  hashtags: string[],             // ไม่มี # นำหน้า · จำนวนตามช่องทาง (LINE = 0)
  cta: string,
  channelRecommendation: string,  // ภาษาไทย อ่านแล้วเข้าใจเลย
  automationPayload: {
    channel: string,              // รหัสช่องทางที่ resolve แล้ว
    postText: string,             // caption + แฮชแท็ก พร้อมส่งเข้า API โพสต์
    creativeBrief: string,        // บรีฟภาพเต็ม รวมกฎที่ต้องเคารพ
    videoBrief: string,           // สคริปต์ + ความยาวประมาณ + กติกาการถ่าย
    suggestedSchedule?: string    // ช่วงเวลา เช่น "19:00-21:00" (ไม่ใช่ timestamp)
  },
  warnings: string[],             // ข้อความไทยพร้อมแสดง เรียงจากหนักไปเบา
  meta: { ... }                   // นอกสัญญาหลัก — ดูด้านล่าง
}
```

### `meta` — ข้อมูลเสริมสำหรับหน้าเว็บ

ไม่อยู่ในสัญญาที่ตกลงกันไว้ แต่มีไว้ให้ UI ทำงานได้โดยไม่ต้องแกะข้อความ

```js
meta: {
  resolved: { objective, contentType, channel, tone, assetType, province },
  subHeadline: string,            // บรรทัดรองบนภาพ
  specs: string|null,             // บรรทัดสเปกที่ประกอบจาก propertyData
  captionQuality: { score: 0-100, checks: string[] },
  channelRanking: [{ id, label, score }],   // ทุกช่องเรียงตามความเหมาะ
  duplicate: { similar, score, match }|null,
  findings: [{ id, severity, where, message, fix }],  // คำเตือนแบบมีโครงสร้าง
  blocking: boolean,              // true = ควรปิดปุ่มโพสต์ไว้ก่อน
  generatedBy: "template"|"llm",
  version: 1
}
```

### ระดับความรุนแรงของคำเตือน

| ระดับ | ความหมาย | หน้าเว็บควรทำอะไร |
|---|---|---|
| `block` | ผิดกฎโฆษณา/กฎหมายชัดเจน | ปิดปุ่มโพสต์ บังคับแก้ก่อน |
| `warn` | ต้องให้คนตรวจก่อน | ขึ้นป้ายเหลือง ให้กดยืนยันได้ |
| `info` | ข้อแนะนำ | แสดงเงียบ ๆ ไม่ขวางทาง |

`warnings` คือ `findings` ที่ถูกจัดรูปเป็นข้อความไทยแล้ว — ถ้าจะทำ UI ละเอียดให้ใช้ `meta.findings`

---

## รหัสคำเตือนทั้งหมด

| id | ระดับ | จับอะไร |
|---|---|---|
| `guaranteed_approval` | block | รับประกันการอนุมัติ |
| `guaranteed_return` | block | รับประกันผลตอบแทน/ราคาในอนาคต |
| `skip_credit_check` | block | สื่อว่าเลี่ยงการตรวจเครดิต |
| `confusable_script` | block | อักษรลาว/เขมร/พม่าปนในข้อความไทย |
| `superlative` | warn | คำขั้นสุดที่พิสูจน์ไม่ได้ |
| `fear_pressure` | warn | ใช้ความกลัว/เส้นตายกดดัน |
| `free_money` | warn | อ้างว่าไม่มีต้นทุนเลย |
| `interest_without_context` | warn | ระบุอัตราดอกเบี้ยโดยไม่บอกหน่วยเวลา |
| `personal_data` | warn | มีข้อมูลระบุตัวบุคคล/เลขเอกสารสิทธิ์ |
| `case_study_consent` | warn | เคสจริงต้องมีความยินยอม + ปิดบังข้อมูล |
| `missing_property_data` | warn | คอนเทนต์เปิดตัวทรัพย์แต่ไม่มีข้อมูลตัวเลข |
| `missing_caveat` | warn | คอนเทนต์กฎหมายไม่มีบรรทัดกำกับ |
| `cta_link_mismatch` | warn | บอกให้กดลิงก์บนช่องที่กดลิงก์ไม่ได้ |
| `duplicate_caption` | warn | ซ้ำกับโพสต์เก่าเกิน 50% |
| `sale_leaseback_cap` | info | แตะเรื่องขายฝาก ซึ่งมีกฎหมายเฉพาะ |
| `loan_license` | info | ถ้อยคำเข้าข่ายเสนอสินเชื่อ |
| `medical_legal_advice` | info | ให้ความเห็นกฎหมายแบบชี้ขาด |
| `caption_too_long` | info | ยาวเกินระยะที่คนอ่านจบบนช่องนั้น |
| `missing_input` / `unmatched_value` | info | อินพุตไม่ครบหรือจับคู่ไม่ได้ |
| `llm_failed` | info | เรียกโมเดลไม่สำเร็จ ใช้เทมเพลตแทน |

---

## ฟังก์ชันที่ export

| ฟังก์ชัน | ใช้ทำอะไร | ฝั่งไหน |
|---|---|---|
| `runMarketingModel(input, opts?)` | สร้างคอนเทนต์ทันที ไม่ต้องต่อเน็ต | เว็บหรือ server ก็ได้ |
| `runMarketingModelWithLLM(input, {generate, parts?})` | ให้ LLM ช่วยเขียน | **server เท่านั้น** |
| `getPrompts(input)` | ประกอบ prompt ทั้งชุดโดยไม่เรียกโมเดล | server |
| `buildReviewPrompt(input, resolved, draft)` | prompt สำหรับให้ AI ตรวจงาน | server |
| `getOptions()` | รายการค่าที่รองรับ ไว้ทำ dropdown | เว็บ |
| `checkDuplicate(caption, recent)` | วัดความซ้ำกับโพสต์เก่า | เว็บหรือ server |
| `canPublish(item, opts)` | ด่านกันโพสต์พลาด | **ต้องเรียกจากทุกทางที่โพสต์ได้** |
| `checkText(text, where)` | ตรวจข้อความใด ๆ กับกฎความเสี่ยง | เว็บหรือ server |
| `splitHeadline(caption)` | ตัดแคปชั่นเป็นพาดหัว/บรรทัดรองแบบไม่ตัดกลางคำไทย | เว็บหรือ server |

`opts` ของ `runMarketingModel`:

```js
{ recentCaptions: ["แคปชั่นเก่า...", { caption: "..." }] }   // ไว้ตรวจความซ้ำ แนะนำ 8 ชิ้นล่าสุด
```
