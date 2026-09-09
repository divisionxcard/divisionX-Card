-- 075_video_jobs.sql
-- คิวงานเรนเดอร์วิดีโอสั้น — ที่วางงานให้ "เว็บ" กับ "เครื่องเรนเดอร์" คุยกัน
--
-- ═══ ทำไมต้องมีตารางนี้ ═══
-- โรงงานวิดีโอ (deploy/agents/video/) รันบน GitHub Actions ซึ่งเป็น **คนละเครื่อง**
-- กับเว็บบน Vercel และไม่มีอะไรที่สองฝั่งเห็นร่วมกันเลยนอกจาก DB:
--
--   • Vercel เป็น serverless — เขียนไฟล์ลง filesystem ไม่ได้ และตายทุกครั้งที่จบ request
--     งานที่ใช้เวลา ~5 นาที (TTS อย่างเดียว 3-4 นาที) จึงรันในเว็บไม่ได้อยู่แล้ว
--   • Actions ทำงานเสร็จแล้วเครื่องก็ถูกทิ้ง — ผลลัพธ์ต้องเขียนกลับมาที่ไหนสักที่
--     ไม่งั้นเว็บจะไม่มีทางรู้ว่างานเสร็จหรือพัง
--
-- แถวหนึ่ง = งานหนึ่งชิ้น · เว็บเขียน 'queued' → Actions มาหยิบไปทำแล้วอัปเดตสถานะกลับ
--
-- ═══ ทำไมต้องเก็บ plan ทั้งก้อน (ไม่ใช่แค่ id ชี้ไปที่อื่น) ═══
-- ให้ **เรนเดอร์ซ้ำแล้วได้เหมือนเดิม** — plan คือ input ทั้งหมดของ build_video()
-- ถ้าเก็บแค่ content_id แล้ววันหลังคอนเทนต์ถูกแก้ (caption เปลี่ยน · SKU เปลี่ยน)
-- การเรนเดอร์ซ้ำจะได้คลิปคนละตัวกับที่เคยอนุมัติไป โดยไม่มีใครรู้ว่าต่างตรงไหน
-- เก็บ plan ไว้ทั้งก้อนแล้วมันจะนิ่งตลอดไป และตอนคลิปออกมาแปลก ๆ ก็เปิดดูได้ว่า
-- ตอนนั้นส่งอะไรเข้าไป (สคริปต์ ภาพ เสียง) โดยไม่ต้องเดา
--
-- ⚠️ plan ต้องเป็น contract เดียวกับ deploy/agents/video/README.md เป๊ะ ๆ
--    { project, script, visuals[], headline, voice, style, music, xfade }
--    ห้ามเปลี่ยนชื่อคีย์ฝั่งใดฝั่งหนึ่งเด็ดขาด — งานเก่าที่ค้างคิวจะเรนเดอร์ไม่ออก
--    สองคีย์ที่พังแล้วเจ็บสุด (project, script) ถูกบังคับด้วย CHECK ตอน INSERT แล้ว
--    เหตุผลของแต่ละตัวเขียนไว้ในตัวตาราง — ที่เหลือ jsonb ไม่ได้กันอะไรให้
--
-- ═══ วิธีรัน ═══
-- Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run  (รันซ้ำได้ ไม่พัง)

BEGIN;

create table if not exists video_jobs (
  id               uuid primary key default gen_random_uuid(),

  -- ชื่อโฟลเดอร์งาน (.video-work/<project>) และเป็น key ของไฟล์ใน storage ด้วย
  project          text not null,

  -- ไฟล์แผนทั้งก้อนตาม contract ของ deploy/agents/video/
  plan             jsonb not null,

  status           text not null default 'queued'
                   check (status in ('queued','rendering','done','failed')),

  -- ผลลัพธ์ — ว่างจนกว่างานจะจบ
  video_url        text,
  duration_seconds numeric,
  error            text,

  -- ผูกกับคอนเทนต์ที่อนุมัติแล้ว · nullable เพราะยิงเรนเดอร์เปล่า ๆ เพื่อทดลองก็ได้
  --
  -- ⚠️ ตั้งใจเป็น bigint ไม่ใช่ uuid — marketing_content.id เป็น bigserial มาตั้งแต่
  --    migration 059 ถ้าประกาศเป็น uuid ตรงนี้ Postgres จะฟ้อง type mismatch
  --    ตั้งแต่ตอน CREATE TABLE (foreign key constraint cannot be implemented)
  content_id       bigint references marketing_content(id) on delete set null,

  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- ── กันค่าที่ต้องตรงกันสองที่ หลุดจากกันแบบเงียบ ๆ ──
  -- build_video() อ่านชื่องานจาก plan.get("project") **ไม่ได้อ่านคอลัมน์นี้**
  -- ถ้าคอลัมน์เป็น 'op17-intro' แต่ในแผนไม่มีคีย์ project ตัวเรนเดอร์จะไปเขียนที่
  -- .video-work/clip/ แล้วอัปโหลดคนละ key กับที่แถวนี้บอกไว้ — คลิปมีอยู่จริงแต่หาไม่เจอ
  -- และไม่มีอะไรฟ้องสักบรรทัด บังคับให้ตรงกันตั้งแต่ INSERT จะเห็นตั้งแต่ตอนสั่งงาน
  --
  -- ⚠️ ต้อง coalesce ก่อนเทียบ — plan->>'project' ของแผนที่ไม่มีคีย์นี้คืน NULL
  --    และ "NULL = project" ให้ผล NULL ซึ่ง CHECK ถือว่า **ผ่าน** (กับดักคลาสสิกของ SQL
  --    ที่ทำให้ constraint กลายเป็นของประดับ ไม่ได้กันอะไรเลย)
  constraint video_jobs_plan_project_check
    check (coalesce(plan->>'project', '') = project),

  -- script คือคีย์เดียวที่ build_video() อ่านแบบ plan["script"] ตรง ๆ ไม่มีค่า default
  -- แผนที่ขาดคีย์นี้ = แถวที่ "เข้าคิวได้ แต่ไม่มีวันเรนเดอร์สำเร็จ" ซึ่งคือคิวโกหก
  -- (กว่าจะรู้ก็ตอน runner หยิบไปแล้วตาย KeyError อีกหลายนาทีให้หลัง)
  -- ⚠️ SQL เช็กได้แค่ว่ามีข้อความ · สคริปต์ที่มีแต่ emoji/แฮชแท็กจะถูก sanitize ทิ้งจนว่าง
  --    แล้วไปตายที่ ValueError("สคริปต์ว่าง") ตอนเรนเดอร์แทน ชั้นนั้น SQL มองไม่เห็น
  constraint video_jobs_plan_script_check
    check (length(btrim(coalesce(plan->>'script', ''))) > 0)
);

comment on table video_jobs is
  'คิวงานเรนเดอร์วิดีโอสั้น · เว็บ (Vercel) เขียนงานเข้า → GitHub Actions หยิบไปเรนเดอร์แล้วอัปเดตผลกลับ';
comment on column video_jobs.project is
  'ชื่อโฟลเดอร์งาน เช่น op17-intro · ใช้เป็น key ของไฟล์ใน storage ด้วย '
  '· ไม่ unique โดยตั้งใจ — เรนเดอร์ซ้ำชื่อเดิมได้ (เก็บเป็นประวัติคนละแถว) '
  'แต่ไฟล์ใน storage จะถูกทับ ถ้าอยากเก็บคลิปเก่าไว้ ให้ใส่ id ลงใน path ตอนอัปโหลด';
comment on column video_jobs.plan is
  'ไฟล์แผนทั้งก้อน { project, script, visuals[], headline, voice, style, music, xfade } '
  '· เก็บไว้เพื่อเรนเดอร์ซ้ำให้ได้ผลเหมือนเดิม แม้คอนเทนต์ต้นทางจะถูกแก้ไปแล้ว '
  '· build_video() ยังรับคีย์เสริมที่ไม่ได้อยู่ในเอกสาร (tts_model, whisper, sub_chars, '
  'sub_size, headline_seconds) ใส่เพิ่มมาได้ jsonb ไม่ได้ห้าม และ CHECK ก็ไม่ได้กัน';
comment on column video_jobs.status is
  'queued = รอเครื่องมาหยิบ · rendering = Actions กำลังทำอยู่ · done = มี video_url แล้ว · failed = ดู error';
comment on column video_jobs.video_url is
  'URL คลิปที่เรนเดอร์เสร็จ (Supabase Storage) · null ตราบใดที่ยังไม่ done';
comment on column video_jobs.duration_seconds is
  'ความยาวคลิปจริงที่ build_video() คืนมา — ไม่ใช่ค่าที่ประมาณจากความยาวสคริปต์';
comment on column video_jobs.error is
  'ข้อความ error ตอนเรนเดอร์พัง · เก็บไว้อ่านบนเว็บ จะได้ไม่ต้องเปิด log ของ Actions';
comment on column video_jobs.content_id is
  'marketing_content.id (bigint) ที่คลิปนี้ถูกสร้างขึ้นเพื่อใช้ · null = เรนเดอร์เดี่ยว ไม่ได้ผูกกับคอนเทนต์';

-- ตัวเรนเดอร์ถามคำถามเดียวทุกครั้งที่ตื่นมา: "มีงานค้างคิวไหม เอาตัวเก่าสุดก่อน"
-- partial index ทำให้ index เล็กตลอดไป — งานที่จบแล้ว (ซึ่งจะเป็นส่วนใหญ่) ไม่ถูกนับ
create index if not exists idx_video_jobs_queued
  on video_jobs (created_at)
  where status = 'queued';

-- ⚠️ ตอนหยิบงานต้อง **ล็อกแถว** ไม่ใช่ select มาแล้วค่อย update เฉย ๆ
--    workflow ถูกกดมือซ้อนกับรอบตั้งเวลาได้ สองเครื่องจะหยิบแถวเดียวกันไปทำพร้อมกัน
--    แล้วจ่ายค่า TTS สองรอบ ไฟล์ทับกันเอง โดยไม่มี error โผล่มาสักตัว:
--
--      update video_jobs set status = 'rendering'
--       where id = (select id from video_jobs
--                    where status = 'queued'
--                    order by created_at
--                      for update skip locked
--                    limit 1)
--      returning *;

-- งานค้าง 'rendering' ตลอดกาลคือความเงียบที่อันตรายที่สุดของคิวนี้ — runner ถูก cancel
-- ชนเพดาน 6 ชม. หรือเครื่องถูกทิ้งกลางคัน แถวนั้นจะไม่มีใครแตะอีกเลย และ index ของคิว
-- ข้างบนก็มองไม่เห็นเพราะกรองเฉพาะ 'queued' → เว็บขึ้น "กำลังเรนเดอร์" ค้างไปตลอด
-- trigger updated_at ข้างล่างคือสิ่งที่ทำให้ตอบได้ว่า "ค้างมานานแค่ไหน" · index นี้ทำให้ถามได้ถูก
-- (query ปลดล็อกอยู่ท้ายไฟล์ — ควรมีคนหรือ workflow ถามคำถามนี้เป็นระยะ ไม่งั้นไม่มีใครรู้)
create index if not exists idx_video_jobs_stuck
  on video_jobs (updated_at)
  where status = 'rendering';

-- หน้าเว็บถามกลับทาง: คอนเทนต์ชิ้นนี้มีคลิปแล้วหรือยัง / เรนเดอร์ล่าสุดเป็นยังไง
create index if not exists idx_video_jobs_content
  on video_jobs (content_id, created_at desc)
  where content_id is not null;

-- updated_at อัตโนมัติ — สถานะเปลี่ยนหลายทอด (queued → rendering → done/failed)
-- ถ้าปล่อยให้ฝั่งที่อัปเดตเป็นคนใส่เอง วันไหนลืมก็จะดูไม่ออกว่างานค้างมานานแค่ไหน
create or replace function trg_video_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists video_jobs_updated_at on video_jobs;
create trigger video_jobs_updated_at
  before update on video_jobs
  for each row execute function trg_video_jobs_updated_at();

-- ── RLS ── ตารางใหม่ต้องเปิดเอง ไม่ได้ถูกครอบโดย migration 069
-- (069 ไล่เปิดตามรายชื่อตารางที่มีอยู่ตอนนั้น ตารางที่สร้างทีหลังจึงเปิดโล่ง)
-- ต้องครบ 3 อย่างตามแม่แบบใน 074 — ที่ลืมกันบ่อยคือ REVOKE บรรทัดล่างสุด
alter table public.video_jobs enable row level security;

-- หมายเหตุความกว้างของ policy: ตัวนี้เปิดให้ "คนที่ล็อกอินแล้วทุกคน" อ่าน/เขียน/ลบได้หมด
-- ตามแม่แบบใน 074 ซึ่งกว้างกว่าตารางพี่น้องในโดเมนเดียวกัน — marketing_content (059)
-- เปิด RLS แล้ว **ไม่สร้าง policy เลย** เพราะให้เข้าผ่าน API route (service key + requireAdmin)
-- ทางเดียว ถ้าคิวนี้จะเข้าผ่าน API route เหมือนกัน policy นี้ก็ตัดทิ้งได้และควรตัด
-- (เข้าคิวได้ = สั่งจ่ายเครดิต TTS กับเวลา Actions ได้ ไม่ใช่สิทธิ์ที่ user ธรรมดาต้องมี)
--
-- ⚠️ ถ้าจะตัด ต้องรู้ก่อนว่าหน้าเว็บอ่านตารางนี้ทางไหน — ตัด policy แล้วฝั่ง client ที่ยิงตรง
--    ด้วย session ของผู้ใช้จะได้ 200 พร้อมลิสต์ว่าง ไม่ใช่ error (กับดักที่ 074 เขียนไว้)
drop policy if exists authenticated_full_access on public.video_jobs;
create policy authenticated_full_access on public.video_jobs
  for all
  to authenticated
  using (true)
  with check (true);

-- ปิดสิทธิ์ตั้งแต่ระดับ GRANT — RLS + ไม่มี policy จะคืน 200 ว่าง ๆ (ไม่ใช่ error)
-- เหลือด่านชั้นเดียว ส่วน REVOKE ทำให้ anon โดน 401/403 ไปเลย
-- ⚠️ ไม่กระทบตัวเรนเดอร์: GitHub Actions และ API route ใช้ service key ซึ่งข้าม RLS อยู่แล้ว
revoke all on public.video_jobs from anon;

COMMIT;

-- ═══ Verify ═══
-- 1. ต้องไม่มี anon เหลืออยู่ (คืน 0 แถว)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'video_jobs' and grantee = 'anon';

-- 2. ยืนยันอีกชั้นด้วยตัวเฝ้าของโปรเจกต์ — ต้องขึ้น 🟢 บล็อก ทั้งอ่านและลบ
--    (มันไล่ตารางจาก OpenAPI spec เอง ไม่ได้ใช้รายชื่อตายตัว ตารางใหม่จึงถูกตรวจอัตโนมัติ)
--    py deploy/scraper/rls_check.py

select status, count(*) from video_jobs group by status;

-- 3. งานที่ค้าง rendering — ต้องคืน 0 แถว ถ้ามีคือ runner ตายกลางคัน ไม่ใช่ "ยังทำอยู่"
--    (คลิปหนึ่งตัวใช้ ~5 นาที เกินหนึ่งชั่วโมงคือตายแน่นอน)
select id, project, updated_at, now() - updated_at as "ค้างมานาน"
from video_jobs
where status = 'rendering' and updated_at < now() - interval '1 hour';

-- ปลดล็อกด้วยการคืนเข้าคิว — ต่อเหตุไว้ใน error ด้วย ไม่งั้นงานที่ตายซ้ำ ๆ จะดูเหมือน
-- งานปกติที่แค่รอคิว แล้ววนตายเงียบ ๆ ไปเรื่อย ๆ โดยไม่มีใครเห็นว่ามันเคยพังมาก่อน:
--   update video_jobs
--      set status = 'queued',
--          error  = coalesce(error || E'\n', '') || 'requeued ' || now()::text
--                   || ' — ค้าง rendering เกิน 1 ชม. (runner น่าจะตายกลางคัน)'
--    where status = 'rendering' and updated_at < now() - interval '1 hour';
