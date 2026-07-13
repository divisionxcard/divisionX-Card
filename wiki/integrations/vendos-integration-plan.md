---
type: integration-plan
brand: vendos
date: 2026-07-13
status: เฟส A (วางแผน) — รอ credentials + ตัวอย่างหน้าพอร์ทัลเพื่อเริ่มเฟส B
tags: [integration, vendos, new-brand, scraper, multi-brand]
---

# แผนเชื่อมตู้แบรนด์ Vendos เข้าระบบ DivisionX

แบรนด์ที่ 3 (ต่อจาก VMS + WorldWide) · ตู้กำลังจะสั่งซื้อ

## พอร์ทัล
- Login: **https://vendos.one/control_center/login**
- ประเภท: **server-rendered HTML** (asset `/static/control_center/` · vanilla JS/jQuery — ไม่ใช่ SPA)
- → ใช้แพตเทิร์น **WorldWide** ได้เลย: `requests.Session` login → parse `<table>` ด้วย BeautifulSoup (ไม่ต้อง Playwright)
- ต้องการดึง: **สต็อกหน้าตู้ + ยอดขาย**

## สถาปัตยกรรม multi-brand (มีอยู่แล้ว)
- ตาราง `machines` แยกแบรนด์ด้วยคอลัมน์ `brand` (`vms`, `worldwide`, → เพิ่ม `vendos`)
- ตู้แต่ละตัวเก็บรหัสพอร์ทัลใน `machines.config` (JSON) เช่น WW ใช้ `config.machine_id_vendor`
- ข้อมูลลงตารางกลางร่วมกัน: `machine_stock` (สต็อก), `sales` (ยอดขาย) — key ด้วย `machine_id`
- **frontend รวมยอดข้ามแบรนด์อัตโนมัติ** ผ่าน machine_id — ไม่ต้องแก้
- SKU mapping = hardcoded map ต่อ scraper (ดู [[project_sku_mapping_two_scraper_maps]])

## ไฟล์ที่ต้องสร้าง (ลอกจาก WorldWide)
| ไฟล์ | ลอกจาก | หมายเหตุ |
|------|--------|---------|
| `deploy/scraper/vendos_stock_sync.py` | `worldwide_stock_sync.py` | เปลี่ยน login endpoint + table parser ตาม HTML Vendos |
| `deploy/scraper/vendos_sales_api.py` | `worldwide_sales_api.py` | เปลี่ยน sales page + parser |
| `.github/workflows/vendos-stock-sync.yml` | `worldwide-stock-sync.yml` | cron + secrets VENDOS_USERNAME/PASSWORD |
| `.github/workflows/vendos-sync.yml` | `worldwide-sync.yml` | ยอดขาย + backfill inputs |
| `deploy/app/api/vendos-stock-sync/route.js` | `worldwide-stock-sync/route.js` | ปุ่ม "ดึงข้อมูล Vendos" บนเว็บ |

## Secrets ที่ต้องเพิ่ม
- GitHub Secrets: `VENDOS_USERNAME`, `VENDOS_PASSWORD`
- Vercel env (สำหรับปุ่ม manual): เหมือน WW (ใช้ GH_PAT ที่มีอยู่ trigger workflow)

## machines.config schema (ร่าง สำหรับ Vendos)
```json
{
  "brand": "vendos",
  "portal_url": "https://vendos.one",
  "machine_id_vendor": "<รหัสตู้บนพอร์ทัล Vendos>",
  "integration_status": "pending_portal_sample"
}
```

## 📋 ต้องเก็บจากพอร์ทัล (เริ่มเฟส B) — หลัง login ได้
1. **login form**: View Source หน้า login → ชื่อ field (user/pass) + action URL + method
2. **หน้าสต็อกหน้าตู้**: URL + View Source (HTML) + screenshot → ดูโครงตาราง slot/สินค้า/คงเหลือ
3. **หน้ายอดขาย**: URL + View Source + screenshot → ดูโครงรายการขาย/วันเวลา/ราคา
4. **รหัสตู้** ที่พอร์ทัลใช้เรียกแต่ละตู้ (เทียบ `VCM350...` ของ WW)
5. **ชื่อสินค้าบนพอร์ทัล** — เทียบกับ sku_id เรา (One Piece TCG เดิม หรือมีของใหม่)
6. **credentials** → ใส่ GitHub Secrets เท่านั้น (ห้ามพิมพ์ในแชท)

## หลักการสำคัญ
- **ไม่ commit workflow cron ที่เรียก scraper ยังไม่เสร็จ** — จะรันตาม schedule แล้ว FAIL ส่ง Telegram alert หลอก
- สร้าง scraper + ทดสอบ `--dry-run` ให้ผ่านก่อน แล้วค่อยเปิด cron workflow (build+test ในรอบเดียว)

## 🔗 เกี่ยวข้อง
[[project_add_worldwide_machine]] · [[project_ww_machines_status]] · [[project_sku_mapping_two_scraper_maps]] · [[reference_manual_stock_sync_buttons]] · [[reference_supabase_rest_access]] · [[reference_trigger_github_workflow]]
