---
type: index
tags: [knowledge-base, research, hermes]
---

# คลังความรู้การ์ด — คิวงานค้นข้อมูล

โฟลเดอร์นี้เก็บผลการค้นข้อมูลของ **Hermes** สำหรับค่ายการ์ดที่ยังไม่มีคลังความรู้

## แบ่งงานกันยังไง

| ใคร | ทำอะไร | ผลลัพธ์ |
|---|---|---|
| **scraper (Python)** | ดึงข้อมูลการ์ดรายใบจากเว็บทางการ | `deploy/tasks/*.json` |
| **Hermes (คืนนี้)** | ค้นความรู้เชิงสินค้า/ตลาดที่ scraper ดึงไม่ได้ | ไฟล์ `.md` ในโฟลเดอร์นี้ |

ที่ต้องมีทั้งสองอย่างเพราะการ์ดสะสมจีน (Kayou ฯลฯ) ส่วนใหญ่**ไม่มีเว็บรายการการ์ดให้ดึง**
แต่ยังต้องรู้ว่าระดับความหายากมีอะไรบ้าง ตัวไหนคนตามหา ถึงจะเขียนคอนเทนต์ได้

อ้างอิงของที่ทำเสร็จแล้ว: [[opcg_rules]] · [[pkm_cards]] (ดู `deploy/tasks/`)

## คิวงาน — เรียงตามจำนวน SKU ที่ขายจริง

ทำทีละค่าย ค่ายไหนมีไฟล์ `.md` แล้วคือเสร็จแล้ว ให้ข้ามไปตัวถัดไป

| ลำดับ | ค่าย | SKU | ไฟล์ | สถานะ |
|---|---|---|---|---|
| 1 | Dragon Ball Fusion World | 9 | `dragonball.md` | ⬜ |
| 2 | Naruto (Kayou?) | 4 | `naruto.md` | ⬜ |
| 3 | Yu-Gi-Oh | 4 | `yugioh.md` | ⬜ |
| 4 | My Little Pony | 2 | `mlp.md` | ⬜ |
| 5 | Mobile Legends (MLBB) | 1 | `mlbb.md` | ⬜ |
| 6 | Solo Leveling (Union Arena?) | 1 | `solo-leveling.md` | ⬜ |
| 7 | Transformers | 1 | `transformers.md` | ⬜ |

## SKU จริงในระบบ

```
DB    FB 01 … FB 09        Dragonball Fusion World FB-01..09   EN
NRT   NRT Jin - 1, Jin - 2  Naruto Jin01, Jin02                 EN
NRT   NRT Series - 01, 02   Naruto Series 01, 02                CN
YGH   YGH Chaos Origins     Yu-Gi-Oh Chaos Origins              EN
YGH   YGH The Heroes        Yu-Gi-Oh The Heroes                 EN
YGH   YGH The Revals        Yu-Gi-Oh The Rivals                 EN
YGH   YGH UT01              Yu-Gi-Oh UT01                       EN
MLP   MLP BP-01, SEA02      My Little Pony BP-01, SEA02         EN
MLBB  MLBB HOD - 02         MLBB Hand of Destiny 02             EN
SL    SLL UA 51             SOLO Leveling Ua1                   EN
TF    TF Overdrive 01       TF Overdrive 01                     EN
```

⚠️ ชื่อพวกนี้ทีมเราตั้งเอง **อาจจัดค่ายผิด** — เช่น `UT01` อาจไม่ใช่ Yu-Gi-Oh
ถ้าเจอว่าจัดผิดให้เขียนไว้ในไฟล์ชัด ๆ จะได้แก้ทีหลัง

## แต่ละไฟล์ต้องมีอะไร

ดูหัวข้อบังคับใน prompt ของ cron job `ค้นข้อมูลการ์ดค่ายที่ยังไม่มีคลัง`
สรุปคือ: สินค้าคืออะไรจริง ๆ · ใครผลิต · เว็บทางการ · ระดับความหายาก ·
ชุดที่เราขายมีอะไรเด่น · มุมที่ใช้เขียนคอนเทนต์ได้ · ข้อมูลไหนยังขาด

## กฎเหล็ก

- **ห้ามเดา** ไม่รู้ให้เขียนว่าไม่รู้ พร้อมบอกว่าค้นที่ไหนไปแล้วบ้าง
- ทุกข้อเท็จจริงต้องมี URL อ้างอิง
- ห้ามคัดลอกรูปการ์ดมาเก็บ — เก็บได้แค่ข้อความและลิงก์
