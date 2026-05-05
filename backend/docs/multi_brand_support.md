# Multi-Brand Vending Machine Support — Planning Notes

> **สถานะ:** Draft · ยังไม่ implement · เก็บเป็น reference เมื่อพร้อม
> **บริบท:** ปัจจุบันระบบ tightly coupled กับ VMS (vms.inboxcorp.co.th) · เตรียมรองรับตู้ยี่ห้ออื่นที่ใช้ protocol ต่าง

---

## ข้อมูลที่ต้องรู้ก่อนเริ่ม implement

| คำถาม | สำคัญเพราะ |
|---|---|
| ยี่ห้อตู้ + รุ่น | research API spec |
| Protocol สื่อสาร | REST / WebSocket / MQTT / proprietary / serial |
| มี API doc มั้ย | ขอจากผู้ผลิตก่อน · ไม่งั้น reverse engineer ลำบาก |
| Authentication | API key / OAuth / cert / VPN / IP whitelist |
| Push vs Pull model | VMS = pull (เราเรียก) · ตู้ใหม่อาจ push (ตู้ส่งให้เรา) |
| จำนวนตู้ที่จะรองรับ | กระทบ scale · concurrent connections |
| Slot model | กี่ slot · box vs pack · price config ฝั่งไหน |
| Sales reporting | real-time / daily batch / on-demand |
| Stock dispense format | per pack · per box · custom unit |

---

## สิ่งที่ต้องเปลี่ยนใน System

### 1. Database schema

```sql
-- machines table: เพิ่ม brand + config
ALTER TABLE machines ADD COLUMN brand TEXT NOT NULL DEFAULT 'vms'
  CHECK (brand IN ('vms', 'newbrand'));  -- ขยายตามที่เพิ่ม

ALTER TABLE machines ADD COLUMN config JSONB NOT NULL DEFAULT '{}';
-- config schema per brand:
-- vms:      { "kiosk_record_id": 4, "tabs": 1 }
-- newbrand: { "endpoint": "https://...", "device_id": "...", "auth_type": "..." }

-- (อาจ) สร้างตาราง brand_credentials แยก เก็บ secret
CREATE TABLE IF NOT EXISTS brand_credentials (
  brand        TEXT PRIMARY KEY,
  api_base     TEXT,
  username     TEXT,
  password     TEXT,         -- encrypted (use Supabase Vault หรือ env var)
  token_cache  TEXT,
  token_expires_at TIMESTAMPTZ
);
```

### 2. Code structure

```
deploy/scraper/
├── connectors/
│   ├── __init__.py
│   ├── base.py              # abstract: BaseConnector
│   ├── vms/
│   │   ├── __init__.py
│   │   ├── auth.py          # login() - VMS specific
│   │   ├── sales.py         # fetch_sales() - VMS specific  
│   │   ├── stock.py         # fetch_slots() - VMS specific
│   │   └── mappers.py       # map_product_to_sku, PACKS_PER_BOX
│   └── newbrand/
│       ├── __init__.py
│       ├── auth.py
│       ├── sales.py
│       └── stock.py
├── sync_router.py           # main entry · routes by machines.brand
├── vms_sales_api.py         # legacy · ย้ายเป็น wrapper
└── vms_stock_sync.py        # legacy · ย้ายเป็น wrapper
```

### 3. BaseConnector interface

```python
# connectors/base.py
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Dict

class BaseConnector(ABC):
    """Interface ที่ทุก brand connector ต้อง implement"""

    def __init__(self, machine_id: str, config: dict, credentials: dict):
        self.machine_id = machine_id
        self.config = config
        self.credentials = credentials

    @abstractmethod
    def fetch_sales(self, date_from: datetime, date_to: datetime) -> List[Dict]:
        """
        คืน list of sale records (normalized format):
        {
            "transaction_id": str,
            "sale_key": str,           # unique
            "sku_id": str,             # mapped to DivisionX SKU
            "machine_id": str,
            "quantity_sold": int,      # in packs
            "grand_total": float,      # in baht
            "sold_at": datetime,
            "product_name_raw": str    # original from device
        }
        """
        pass

    @abstractmethod
    def fetch_stock(self) -> List[Dict]:
        """
        คืน list of slot records (normalized):
        {
            "machine_id": str,
            "slot_number": str,
            "product_id": str | None,
            "product_name": str | None,
            "sku_id": str | None,      # mapped
            "remain": int,             # in packs (after box conversion)
            "max_capacity": int,
            "is_occupied": bool,
            "status": str
        }
        """
        pass
```

### 4. Sync router

```python
# sync_router.py
from connectors.vms import VmsConnector
from connectors.newbrand import NewBrandConnector

CONNECTORS = {
    "vms": VmsConnector,
    "newbrand": NewBrandConnector,
}

def sync_all_machines():
    machines = db.query("SELECT * FROM machines WHERE status='active'")
    for m in machines:
        ConnectorClass = CONNECTORS.get(m["brand"])
        if not ConnectorClass:
            log.warning(f"Unknown brand {m['brand']} for {m['machine_id']}")
            continue
        creds = get_credentials(m["brand"])
        c = ConnectorClass(m["machine_id"], m["config"], creds)
        try:
            sales = c.fetch_sales(date_from=yesterday, date_to=now)
            stock = c.fetch_stock()
            save_to_supabase(sales, stock)
        except Exception as e:
            log.error(f"Sync failed {m['machine_id']}: {e}")
            # เก็บใน sync_errors table · ส่ง alert
```

### 5. Webhook (ถ้า newbrand เป็น push)

```javascript
// deploy/app/api/webhooks/[brand]/route.js
export async function POST(request, { params }) {
  const { brand } = params  // dynamic segment · "newbrand"

  // 1. Verify signature (HMAC / token)
  const sig = request.headers.get("x-signature")
  if (!verifySignature(sig, body, getSecret(brand))) {
    return new Response("Unauthorized", { status: 401 })
  }

  // 2. Parse + normalize per brand
  const body = await request.json()
  const normalized = normalizeWebhook(brand, body)

  // 3. Insert into DB (sales / machine_stock)
  await supabase.from("sales").upsert(normalized.sales)
  await supabase.from("machine_stock").upsert(normalized.stock)

  return new Response("OK")
}
```

---

## ประเด็นต้องระวัง

### Mapping issues

⚠ **product_name → sku_id** — VMS ใช้ regex `op\s*[-–]\s*(\d+)` · brand อื่นอาจใช้รูปแบบอื่น
- ทำเป็น per-brand mapper · หรือ DB lookup table `(brand, product_id) → sku_id`

⚠ **Box vs Pack detection** — VMS เจอ "Box" ใน product_name · brand อื่นอาจมี field `unit_type` หรือ slot config แยก
- BaseConnector จัดการ conversion · คืน `remain` เป็น packs เสมอ

⚠ **PACKS_PER_BOX** — DivisionX มี `skus.packs_per_box` (24 OP/EB · 10 PRB) · ใช้ตัวเลขนี้กลาง · ไม่ embed ใน connector

### Data integrity

⚠ **sale_key uniqueness** — ปัจจุบัน `{txn_id}-{counter}` (VMS) · ตู้ใหม่ต้อง ensure unique
- prefix ด้วย brand: `{brand}_{txn_id}-{counter}`

⚠ **Idempotency** — webhook อาจส่งซ้ำ · upsert by sale_key

⚠ **Timezone** — เก็บ UTC ใน DB · convert เป็น Asia/Bangkok ตอนแสดง · brand ใหม่ส่งมาใน TZ อะไร ต้องตรวจ

### Authentication

⚠ **Credentials storage** — อย่า hardcode · ใช้ env var หรือ Supabase Vault
- VMS ปัจจุบัน: env (SUPABASE_URL, etc.)
- ตู้ใหม่: เพิ่ม env หรือ DB-backed config table

⚠ **Token refresh** — ถ้า token expire · auto refresh · cache `token_expires_at`

### Operational

⚠ **Alert on sync failure** — ปัจจุบันเช็คใน workflow log · ปรับให้ส่ง LINE/email ถ้า fail

⚠ **Per-machine schedule** — VMS รวมทุกตู้ใน 1 cron · ตู้ใหม่อาจต้อง separate cron (ถ้า rate limit ต่าง)

---

## Phase plan (เมื่อพร้อมเริ่ม)

| # | Phase | งาน | ระยะ |
|---|---|---|---|
| 1 | Research | อ่าน API doc · curl ทดสอบ · เก็บ sample response | 1-2 day |
| 2 | POC | เขียน 1 function ดึง stock จาก 1 ตู้ทดสอบ · save to JSON | 1 day |
| 3 | Schema | migration: machines.brand + config + brand_credentials | 0.5 day |
| 4 | Refactor | ย้าย VMS code → connectors/vms/ · ทดสอบไม่ regression | 1 day |
| 5 | Implement | เขียน connectors/newbrand/ ทั้ง sales + stock | 2-3 day |
| 6 | Test | machine ทดสอบ · sync · verify ใน Dashboard | 1 day |
| 7 | Deploy | เพิ่ม cron · webhook route · doc admin | 0.5 day |
| **รวม** | | | **~7-10 day work** |

---

## Files ที่ต้องแก้/เพิ่ม (checklist)

- [ ] `backend/database/migrations/` — เพิ่ม migration brand + config
- [ ] `deploy/scraper/connectors/base.py` — interface
- [ ] `deploy/scraper/connectors/vms/` — refactor VMS code มา
- [ ] `deploy/scraper/connectors/newbrand/` — implement ใหม่
- [ ] `deploy/scraper/sync_router.py` — main entry
- [ ] `.github/workflows/vms-sync.yml` — เปลี่ยนเรียก sync_router
- [ ] `.github/workflows/vms-stock-sync.yml` — เช่นกัน
- [ ] `deploy/app/api/webhooks/[brand]/route.js` — ถ้า push model
- [ ] `deploy/components/pages/PageMachineStockView.jsx` — รองรับ multi-brand display (ถ้า slot model ต่าง)
- [ ] `deploy/components/pages/PageUsers.jsx` หรือ admin page — UI add/edit machine + brand + config
- [ ] env vars — เพิ่ม credentials brand ใหม่
- [ ] CLAUDE.md — update เพิ่ม instruction multi-brand

---

## Reference (ตอนนี้)

- VMS API base: `https://vms.inboxcorp.co.th`
- VMS sales endpoint: `/report/sales/`
- VMS stock endpoint: `/internal/v1/slots/{tab}?kiosk_record_id={id}`
- VMS PACKS_PER_BOX: `deploy/scraper/vms_sales_api.py:19-25`
- Schema sales: `deploy/supabase/schema.sql:57-68`
- Schema machines: `deploy/supabase/schema.sql:1-8` (เดาจาก migration)

---

**อัปเดต:** 2026-05-06 · pre-implementation notes  
**Author:** ทีมเทค + Claude (cutoff session)
