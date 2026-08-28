-- 070_ai_credit_readings.sql
-- เก็บ "ยอดเครดิตคงเหลือที่อ่านจากหน้า OpenAI" เพื่อคำนวณยอดคงเหลือปัจจุบัน
--
-- ═══ ทำไมต้องเก็บเอง ═══
-- OpenAI **ไม่เปิดให้อ่านยอดคงเหลือผ่าน API เลย** — ทดสอบยิงจริง 28 ส.ค. 2026:
--
--   GET /dashboard/billing/credit_grants
--     → 403 "must be made with a session key (that is, it can only be made from the browser)"
--   GET /v1/organization/costs
--     → 403 "Missing scopes: api.usage.read"   (ใช้ได้ถ้าเป็น Admin key)
--
-- อ่านได้แค่ "ใช้ไปเท่าไหร่" ไม่ใช่ "เหลือเท่าไหร่" ยอดคงเหลือจึงต้องคำนวณเอา
--
-- ═══ วิธีคิด ═══
--   คงเหลือ = ยอดที่เจ้าของอ่านจากหน้า OpenAI ณ เวลาหนึ่ง − ค่าใช้จ่ายตั้งแต่เวลานั้น
--
-- ⚠️ ตั้งใจเก็บเป็น "ยอดที่อ่านได้ ณ เวลานั้น" ไม่ใช่ "ยอดที่เติม"
--    เพราะยอดอ่านได้มันแก้ตัวเองทุกครั้งที่บันทึกใหม่ — ครอบคลุมทั้งการเติมเงิน
--    เครดิตแถม เงินคืน และ auto-recharge โดยไม่ต้องรู้ว่าเกิดอะไรขึ้นระหว่างทาง
--    ถ้าเก็บเป็น "ยอดเติม" จะต้องบันทึกให้ครบทุกรายการ ขาดรายการเดียวเลขก็ผิดตลอดไป
--
-- เก็บเป็นประวัติ ไม่ใช่แถวเดียวอัปเดตทับ — จะได้ย้อนดูได้ว่าเดือนไหนใช้ไปเท่าไหร่
-- และถ้าเลขเพี้ยนก็เห็นว่าเพี้ยนตั้งแต่การบันทึกครั้งไหน
--
-- ═══ วิธีรัน ═══
-- Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run  (รันซ้ำได้ ไม่พัง)

BEGIN;

create table if not exists ai_credit_readings (
  id           bigserial primary key,

  provider     text not null default 'openai'
               check (provider in ('openai')),

  -- ยอดคงเหลือที่เห็นบนหน้า platform.openai.com ณ เวลา read_at (หน่วย USD)
  balance_usd  numeric(12,4) not null check (balance_usd >= 0),
  read_at      timestamptz  not null default now(),

  note         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz  not null default now()
);

comment on table ai_credit_readings is
  'ยอดเครดิต OpenAI ที่เจ้าของอ่านจากหน้าเว็บมาบันทึกไว้ · คงเหลือปัจจุบัน = ยอดนี้ − costs API ตั้งแต่ read_at';
comment on column ai_credit_readings.balance_usd is
  'ยอดคงเหลือ ณ read_at (USD) — อ่านจาก platform.openai.com → Billing เท่านั้น API อ่านไม่ได้';
comment on column ai_credit_readings.read_at is
  'เวลาที่อ่านยอดมา · ใช้เป็น start_time ของ /v1/organization/costs';

-- อ่านแถวล่าสุดของ provider คือ query เดียวที่ใช้จริง
create index if not exists idx_ai_credit_readings_latest
  on ai_credit_readings (provider, read_at desc);

-- ── RLS ── ตารางใหม่ต้องเปิดเอง ไม่ได้ถูกครอบโดย migration 069
-- (069 ไล่เปิดตามรายชื่อตารางที่มีอยู่ตอนนั้น ตารางที่สร้างทีหลังจึงเปิดโล่ง)
alter table public.ai_credit_readings enable row level security;

drop policy if exists authenticated_full_access on public.ai_credit_readings;
create policy authenticated_full_access on public.ai_credit_readings
  for all
  to authenticated
  using (true)
  with check (true);

COMMIT;

-- ═══ ต้องทำเพิ่มนอก SQL ═══
--
-- 1. สร้าง Admin key ที่ platform.openai.com → Settings → API keys → Admin keys
--    (คนละตัวกับ key ปกติ · ตัว sk-proj- ที่ใช้อยู่ไม่มีสิทธิ์ api.usage.read)
--
-- 2. ใส่ค่าเป็น OPENAI_ADMIN_KEY ทั้งใน deploy/.env.local และ Vercel → Settings →
--    Environment Variables (ไม่ใส่ฝั่ง Vercel = หน้าเว็บจริงจะขึ้นว่ายังไม่ได้ตั้งค่า)
--
-- 3. เข้าหน้า /marketing แล้วกดที่ป้ายเครดิตบนหัวหน้า เพื่อบันทึกยอดคงเหลือครั้งแรก
