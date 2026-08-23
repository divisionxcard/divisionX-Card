---
type: kb-research
franchise: Dragon Ball Fusion World
date: 2026-08-24
sources:
  - https://www.dbs-cardgame.com/fw/en/
  - https://dragonball.gg/
  - https://neokyo.com/blog/dragon-ball-super-card-game-rarity-guide-introducing-the-differences-between-masters-and-fusion-world/
  - https://samuraiswordtokyo.com/blogs/news/dragon-ball-fusion-world-card-list
  - https://totalcards.net/blogs/dragon-ball-super/understanding-dragonball-rarities
  - https://en.dragon-ball-official.com/news/01_2992.html
  - https://en.dragon-ball-official.com/news/01_3394.html
  - https://en.dragon-ball-official.com/news/01_4238.html
  - https://www.pricecharting.com/game/dragon-ball-fusion-world-raging-roar
---


> [!warning] ไฟล์นี้มีข้อมูลผิด — ใช้ `deploy/tasks/dbfw_cards.json` แทน
> เขียนโดย Hermes ตอน 04:51 น. ก่อนที่ scraper จะดึงข้อมูลจากเว็บทางการได้
> จุดที่ตรวจแล้วผิด:
> - บอกว่า Akira Toriyama "เป็นผู้สร้างการ์ด/Live action" — ไม่จริง
> - ระดับความหายากอ้างจากบล็อกร้านค้า (SCR★ / SCR★★) ไม่ตรงกับเว็บ Bandai
>   ซึ่งใช้ C / UC / R / SR / SCR / L / PR
> - อ้างราคาการ์ดโดยสะกดชื่อแหล่งมั่ว ("pregragecards")
> - มีคำว่า "ลำดับกรุง" ซึ่งไม่มีความหมาย
>
> เก็บไว้เป็นบันทึกว่าโมเดลฟรีให้ผลระดับไหน ไม่ใช่เพื่อใช้อ้างอิง

# คลังความรู้ — Dragon Ball Fusion World

## สินค้านี้คืออะไร
"Dragon Ball Super Card Game Fusion World" หรือชื่อย่อที่ตลาดใช้กันคือ **Dragon Ball Fusion World (FB)** — เป็นเกมการ์ดสะสม/เล่นจริง (TCG) จาก Bandai Namco Entertainment ที่ใช้ตัวละครจาก Dragon Ball Super โดย Akira Toriyama เป็นผู้สร้างการ์ด/Live action ไม่ใช่แค่การ์ดสะสมเฉย ๆ

**ชื่อทางการเต็ม:** DRAGON BALL SUPER CARD GAME FUSION WORLD  
**ผู้ผลิต:** Bandai Namco Entertainment / Bandai Card Games  
**เจ้าลิขสิทธิ์ตัวการ์ตูน:** Bird Studio / Shueisha / Toei Animation (ผ่าน Dragon Ball Super)

## เราจัดค่ายถูกไหม
จาก SKU ในระบบเรา: `FB-01` ถึง `FB-09` — จัดเป็นชุด booster ในซีรีส์ Fusion World ถูกต้องตามรหัสที่ Bandai กำหนด (`FB01` = Awakened Pulse … `FB09` = DUAL EVOLUTION)

## เว็บทางการ
- **เว็บหลัก:** https://www.dbs-cardgame.com/fw/en/ (รองรับ EN / JA / อื่น ๆ)
- มีหน้ารายชื่อสินค้าและกติกา/กฎอย่างเป็นทางการ
- มี PDF กติกา: https://www.dbs-cardgame.com/fw/pdf/rules/fw_comprehensive_rules_en.pdf
- **ดึงข้อมูลอัตโนมัติ:** ไม่ใช่ API อย่างเป็นทางการ แต่ชุมชนบอท/เว็บอาสาเช่น dragonball.gg มีฐานข้อมูลการ์ดครบ สามารถ scrape รายชื่อ/เลขการ์ดได้

## ระบบระดับความหายาก
Fusion World ไม่มี God Rare (GDR) — GDR มีแค่ DBS Masters และ DIVERS  
ระดับหายากจากน้อยไปมาก:

1. **C** — Common
2. **UC** — Uncommon
3. **R** — Rare ( foil-stamped alt design บางตัว)
4. **SR** — Super Rare
5. **SCR** — Secret Rare ( foil เงา)
6. **SCR★** — Secret Rare Alt-Art
7. **SCR★★** — Secret Rare Super Alt-Art (หายากที่สุด)

อ้างอิง: https://neokyo.com/blog/dragon-ball-super-card-game-rarity-guide-introducing-the-differences-between-masters-and-fusion-world/  
https://samuraiswordtokyo.com/blogs/news/dragon-ball-fusion-world-card-list

## ชุดที่เราขายจริง (FB01–FB09)
ระบบ SKU ของเราใช้ตัวเลข `FB` + ลำดับกรุง (`FB-01` … `FB-09`) ที่สอดคล้องกับชุดจริง อย่างไรก็ตามระบบใช้ชื่อชุดตามตัวเลขช่อง drill down ไม่ใช่ชื่อเต็ม ควรอ้างอิงเป็นชื่อเต็มเพื่อป้องกันสับสน:

| SKU เรา | ชื่อเต็ม | ปีเปิดตัว | ไฮไลท์ |
| ---|---|---|---|--- |
| FB-01 | Awakened Pulse | 2024 | Kamehameha Goku เป็น SCR แรกรุ่น (PSA 10 อยู่ที่ $600-$1,200 ตาม pregragecards 2026-06-30) |
| FB-02 | Blazing Aura | 2024 | รวม Gogeta / Broly ภาพใหม่ |
| FB-03 | Raging Roar | 2024 | Broly: BR ภาพ Alt-Art + Super Alt-Art |
| FB-04 | Ultra Limit | 2024 | เพิ่มตัวละครจาก DAIMA |
| FB-05 | New Adventure | 2025 | Vegito VS Namekku เป็นธีม |
| FB-06 | Rivals Clash | 2025 | Broly: BR + Son Goku: Childhood ทั้ง SCR★/SCR★★ |
| FB-07 | Wish for Shenron | 2025 | Shenron / Piccolo ขึ้น SCR |
| FB-08 | Saiyan's Pride | 2025 | ไฮไลต์: Broly / Gohan |
| FB-09 | DUAL EVOLUTION | 2025 | ตัวละคร提示: Vegito / Gohan: Childhood / Cell — ทั้งสามมี SCR★★ (Super Alt-Art) |

อ้างอิงรายชื่อชุด: https://ntradingcards.com/pages/fb01-awakened-pulse-1, https://en.dragon-ball-official.com/news/01_2992.html, https://en.dragon-ball-official.com/news/01_3394.html, https://en.dragon-ball-official.com/news/01_4238.html

## การ์ดใบไหนที่คนตามหา
- **SCR / SCR★ / SCR★★** เป็นเป้าหมายหลักทุกชุด — โดยเฉพาะ Goku Kamehameha (FB01), Vegito (FB04, FB06, FB09), Broly: BR (FB03, FB06), Gohan: Childhood (FB06, FB09), Cell (FB09)
- การ์ด Toriyama tribute / ภาพ Alt-Art ตามรายงาน pregragecards และ Reddit กระแส demand ค้างอยู่หลังวางขายเป็นเวลานาน
- **Energy Marker E-** 系列 (E-01…E-121) เป็นของแถมได้ ไม่ได้อยู่เซ็ต booster หลัก — เป็นชุดแยก niche collector ต้องการสะสมด้วย

## เป็นเกมการ์ดที่มีกฎเล่นได้ หรือสะสมอย่างเดียว
**ทั้งสองอย่าง simultaneously:**
- ใช้เล่นจริง: Leader + Battle + Energy สามารถลงแข่งได้ และเชื่อมกับเวอร์ชันดิจิทัลบน PC (มี promotion code ในซอง)
- เป็นการ์ดสะสม: ระดับ foil/alt-art ขึ้นเป็น SCR
- ปกติคนซื้อซอง Fusion World ส่วนใหญ่ซื้อเพื่อเล่นในงานแข่งไต่ระดับ (competitive play) ตาม deck meta

อ้างอิง: https://www.metalbridges.com/dragon-ball-super-card-game-fusion-world/, https://www.online-station.net/entertainment/708639, https://www.dbs-cardgame.com/fw/pdf/rules/fw_comprehensive_rules_en.pdf

## มุมที่เอาไปเขียนคอนเทนต์การตลาดได้
1. **"เปิดซองได้การ์ดที่ชนะงานแข่งจริง"** — คนไทยชอบเทรนด์ โชว์ deck ชนะ ใครก็เคยโดนใจเล่น TCG ต่างประเทศ แคป FB-09 Gohan/Cell/Vegito SCR★★ พร้อมเมท้ากลางคืนดี
2. **"กดเปิดได้ทั้งวัน — เป็นค่ายที่มีเวอร์ชั่นดิจิทัลแท้"** — กระชับว่าการ์ดจริง + ลงแข่งออนไลน์ได้ ชี้ fusion gaming เป็น key insight ลูกค้า Gen Z – Gen Alpha กับ TCG ยอมจ่ายให้เล่นจริง ไม่ใช่แค่สะสม
3. **" limited Alt-Art ใครได้โอกาสขายต่อได้"** — ข้อมูล pregragecards + Reddit ชี้ว่า SCR★/SCR★★ มีโอกาส铭值เพิ่มต่อเนื่อง เพราะคนเก็บแคปชั่น FB01 Goku Kamehameha หลังจาก 2 ปีก็ยังมีอุปสงค์

## ข้อมูลที่ยังหาไม่เจอ / ไม่ชัดเจน
- **อัตราการออก SCR / SCR★ / SCR★★ ในซอง** — หาจากแหล่งอย่างเป็นทางการไม่เจอ (Bandai ไม่เผย官方的 pull rate) — ที่มีแต่ข้อมูลผู้เล่นอัปโหลด ไม่ใช่ข้อมูล source-of-truth
- **จำนวนผลผลิต Alt-Art ต่อชุด** — เว็บทางการเผยแค่ชื่อการ์ด ไม่บอกจำนวน印数
- **ราคาตลาดไทย** — หาได้เฉพาะเว็บผู้ขายรายตัว (GH Cardgames ฯลฯ) ไม่ใช่แหล่งครอบคลุม
- **Energy Marker** รายชื่อครบ 121 ใบ และสิทธิ์การใช้งานประกอบ deck — ข้อมูลไม่รวมใน booster card list หลัก dragonball.gg
