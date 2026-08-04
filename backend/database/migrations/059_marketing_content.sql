-- 059_marketing_content.sql
-- คิวคอนเทนต์การตลาด — ย้ายจากไฟล์ deploy/tasks/*.json ลง DB
--
-- ทำไมต้องลง DB: หน้า /marketing ต้องอ่าน/เขียนพร้อมกันหลายที่ และ Vercel
-- เป็น serverless (filesystem อ่านอย่างเดียว) เขียนกลับไฟล์ JSON ไม่ได้
--
-- flow: draft → pending (AI ร่างเสร็จ รออนุมัติ) → approved → scheduled → posted
--                                                → rejected (พร้อมเหตุผล)

create table if not exists marketing_content (
  id            bigserial primary key,

  status        text not null default 'pending'
                check (status in ('draft','pending','approved','scheduled','posted','rejected')),
  platform      text not null default 'fb',       -- fb | line | ig | tiktok
  caption       text not null,
  media_url     text,
  media_type    text check (media_type in ('image','video','none')),

  -- ตารางเวลาโพสต์
  slot          text check (slot in ('morning','evening')),
  scheduled_at  timestamptz,
  posted_at     timestamptz,

  -- ที่มาของร่าง — โชว์เป็นบรรทัด "💡 จาก:" บนการ์ด ให้ตัดสินใจได้ใน 2 วินาที
  source_reason text,
  source_sku    text references skus(sku_id),

  -- เหตุผลที่ทิ้ง — ป้อนกลับให้ prompt รอบหน้า ไม่ให้ AI เสนอแบบเดิมซ้ำ
  reject_reason text,

  created_by    text not null default 'ai' check (created_by in ('ai','human')),
  approved_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table marketing_content is
  'คิวคอนเทนต์การตลาด · หน้า /marketing โซน A ใช้ตัวนี้ · แทน deploy/tasks/content_*.json';
comment on column marketing_content.source_reason is
  'เหตุผลที่ AI เสนอชิ้นนี้ เช่น "OP-13 ยอดขาย +32% ใน 7 วัน"';
comment on column marketing_content.reject_reason is
  'เหตุผลที่คนกดทิ้ง — ใช้ป้อนกลับ prompt รอบถัดไป';

-- คิวรออนุมัติเป็น query ที่เรียกบ่อยสุด (ทุกครั้งที่เปิดหน้า)
create index if not exists idx_marketing_content_status
  on marketing_content (status, created_at desc);
create index if not exists idx_marketing_content_scheduled
  on marketing_content (scheduled_at) where status in ('approved','scheduled');

-- updated_at อัตโนมัติ
create or replace function trg_marketing_content_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists marketing_content_updated_at on marketing_content;
create trigger marketing_content_updated_at
  before update on marketing_content
  for each row execute function trg_marketing_content_updated_at();

-- RLS: ปิดตายฝั่ง client — เข้าถึงผ่าน API route (service key + requireAdmin) เท่านั้น
-- เพราะหน้านี้เห็นข้อมูลการตลาดที่ไม่ควรหลุดออก anon key
alter table marketing_content enable row level security;
