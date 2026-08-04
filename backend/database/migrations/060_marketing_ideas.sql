-- 060_marketing_ideas.sql
-- สถานี 1 · ระบบหาไอเดียคอนเทนต์ — ของที่ AI ไปหามาวางบนโต๊ะให้เลือกทุกเช้า
--
-- flow: new (AI เก็บมา) → picked (คนกด "เริ่มทำคอนเทนต์" → สร้าง marketing_content)
--                       → dismissed (พร้อมเหตุผล ป้อนกลับให้ตัวเก็บรอบหน้า)
--
-- แหล่งข้อมูล (ทดสอบแล้วว่าดึงได้จริงโดยไม่ต้องมี API key):
--   news     — Google News RSS ภาษาไทย (ข่าว/เทรนด์วงการการ์ด)
--   youtube  — YouTube channel RSS (คลิปใหม่ของช่องที่เราตาม)
--   internal — สัญญาณจากข้อมูลขายของเราเอง (SKU มาแรง/ตก · ของใกล้หมด)
--   comment  — เสียงลูกค้าจาก FB/YT (เฟส 3 · ต้องขอ permission Meta ก่อน)

create table if not exists marketing_ideas (
  id            bigserial primary key,

  status        text not null default 'new'
                check (status in ('new','picked','dismissed')),
  source        text not null
                check (source in ('news','youtube','internal','comment','manual')),
  source_label  text,                    -- "Google News" · ชื่อช่อง YouTube · "ยอดขาย 7 วัน"

  title         text not null,
  summary       text,
  url           text,

  -- angle = มุมที่เสนอให้เอาไปทำคอนเทนต์ · relevance = ทำไมเรื่องนี้เกี่ยวกับเรา
  -- สองอันนี้คือสิ่งที่ทำให้ "สแกนแล้วตัดสินใจได้เร็ว" ไม่ต้องอ่านข่าวเต็ม
  angle         text,
  relevance     text,
  score         numeric not null default 0,   -- คะแนนความเกี่ยว ใช้เรียงลำดับ
  related_sku   text references skus(sku_id),

  -- ถ้ากด "เริ่มทำคอนเทนต์" แล้ว จะชี้ไปที่ร่างที่สร้างขึ้น
  content_id    bigint references marketing_content(id) on delete set null,
  dismiss_reason text,

  -- กันเก็บซ้ำข้ามรอบ (url ของข่าว/คลิป หรือ สัญญาณภายใน+วันที่)
  external_key  text not null unique,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table marketing_ideas is
  'สถานี 1 · ไอเดียคอนเทนต์ที่ AI เก็บมาให้เลือก · หน้า /marketing โซนไอเดีย';
comment on column marketing_ideas.angle is
  'มุมที่เสนอให้ทำ เช่น "เกาะกระแส Pop-Up Store — ชวนคนมาเปิดซองที่ตู้"';
comment on column marketing_ideas.external_key is
  'กันซ้ำข้ามรอบเก็บ — url ของข่าว/คลิป หรือ signal-key+วันที่ สำหรับสัญญาณภายใน';

-- คิวไอเดียใหม่เรียงตามคะแนน = query ที่เปิดหน้าแล้วเรียกทุกครั้ง
create index if not exists idx_marketing_ideas_status
  on marketing_ideas (status, score desc, created_at desc);

create or replace function trg_marketing_ideas_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists marketing_ideas_updated_at on marketing_ideas;
create trigger marketing_ideas_updated_at
  before update on marketing_ideas
  for each row execute function trg_marketing_ideas_updated_at();

-- RLS ปิดตายเหมือน marketing_content — เข้าผ่าน API route (service key + requireAdmin)
alter table marketing_ideas enable row level security;

-- โยงกลับจากคอนเทนต์ไปหาไอเดียต้นทาง (ไว้ดูว่าโพสต์นี้มาจากไอเดียไหน)
alter table marketing_content
  add column if not exists idea_id bigint references marketing_ideas(id) on delete set null;
