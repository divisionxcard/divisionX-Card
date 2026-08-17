-- 067 · เก็บผลลัพธ์ของโพสต์บนเพจ (ไลก์ · คอมเมนต์ · แชร์) เป็นสแนปช็อตตามเวลา
--
-- ทำไมต้องมี: ทั้งเจ้าของและ AI ตอบไม่ได้เลยว่า "คอนเทนต์แบบไหนเวิร์ก" เพราะระบบเก็บถึงแค่
-- "โพสต์แล้ว" ไม่เคยเก็บว่าโพสต์นั้นได้อะไรกลับมา → ปรับปรุงจากข้อมูลจริงไม่ได้ ได้แต่เดา
--
-- ⚠️ ทำไมเก็บเป็น "สแนปช็อตหลายแถวต่อโพสต์" ไม่ใช่คอลัมน์เดียวในตาราง marketing_content:
--   เอนเกจโตตามเวลา โพสต์เมื่อวานกับโพสต์เดือนก่อนเทียบกันตรง ๆ ไม่ได้
--   เก็บหลายจุดเวลาแล้วจะเทียบ "24 ชม.แรกได้เท่าไหร่" ซึ่งยุติธรรมกับทุกโพสต์
--
-- ⚠️ content_id เป็น null ได้ตั้งใจ — เพจมีโพสต์ที่ทำด้วยมือนอกระบบอยู่แล้ว (3 ชิ้น ณ 17 ส.ค. 2026)
--   ของพวกนั้นก็มีค่าให้เรียนรู้ ถ้าบังคับให้ผูกกับคอนเทนต์ในระบบจะทิ้งข้อมูลไปเปล่า ๆ
--
-- ไม่มี reach/impressions เพราะ Meta ปลด metric พวกนั้นออกจาก Graph API v26 แล้ว
-- (ทดสอบจริง 2026-08-17: post_impressions / post_engaged_users คืน "not a valid insights metric")

create table if not exists post_metrics (
  id            bigserial primary key,
  post_id       text        not null,               -- รหัสโพสต์ฝั่ง Facebook
  content_id    bigint      references marketing_content(id) on delete set null,
  captured_at   timestamptz not null default now(),
  posted_at     timestamptz,                        -- created_time จาก Facebook
  message       text,                               -- ข้อความโพสต์ (เก็บไว้ดูว่าโพสต์ไหน)
  permalink     text,
  reactions     int,                                -- รีแอ็กชันรวมทุกชนิด
  likes         int,
  comments      int,
  shares        int,
  clicks        int,                                -- จาก insights post_clicks (อาจเป็น null)
  video_views   int,
  reactions_by_type jsonb,                          -- แยกชนิด: like/love/haha/...
  age_hours     numeric,                            -- อายุโพสต์ตอนเก็บ — ใช้เทียบข้ามโพสต์
  captured_hour timestamptz not null,               -- captured_at ปัดลงเป็นชั่วโมง (ตัวเก็บส่งมา)
  source        text        not null default 'graph'
);

comment on table post_metrics is
  'สแนปช็อตผลลัพธ์โพสต์เพจ — หนึ่งแถวต่อหนึ่งครั้งที่ไปเก็บ ไม่ทับของเก่า';
comment on column post_metrics.age_hours is
  'อายุโพสต์ (ชม.) ตอนเก็บ — ใช้เทียบโพสต์ต่างวันกันอย่างยุติธรรม เช่นดูเฉพาะช่วง 24 ชม.แรก';
comment on column post_metrics.content_id is
  'ผูกกับ marketing_content ถ้าโพสต์นั้นมาจากระบบ · null = โพสต์ด้วยมือนอกระบบ';

create index if not exists idx_post_metrics_post on post_metrics (post_id, captured_at desc);
create index if not exists idx_post_metrics_content on post_metrics (content_id);

-- กันเก็บซ้ำถี่เกินจำเป็น: หนึ่งโพสต์เก็บได้ครั้งเดียวต่อชั่วโมง
-- (cron ทุก 6 ชม. แต่ถ้ามีคนกดรันมือซ้ำ ๆ จะได้ไม่บวมฟรี)
--
-- ⚠️ ใช้คอลัมน์ captured_hour ที่ตัวเก็บปัดมาให้ ไม่ใช่ date_trunc() ใน index
--    เพราะ date_trunc('hour', timestamptz) เป็น STABLE ไม่ใช่ IMMUTABLE (ผลขึ้นกับ timezone)
--    Postgres จะปฏิเสธตอน create index ว่า "functions in index expression must be marked IMMUTABLE"
create unique index if not exists idx_post_metrics_hourly
  on post_metrics (post_id, captured_hour);
