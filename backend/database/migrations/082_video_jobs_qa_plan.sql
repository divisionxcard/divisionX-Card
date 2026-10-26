-- 082_video_jobs_qa_plan.sql
-- คิววิดีโอ: ด่านตรวจหลังเรนเดอร์ + ขั้นดูแผนก่อนเรนเดอร์ (26 ต.ค. 2026)
--
-- ═══ ทำไม ═══
-- เจ้าของถอดแนวคิดจากคลิป "ระบบทำวีดีโอ" (OpenMontage) แล้วเลือกนำมาใช้ 2 ข้อ:
--   1) "เรนเดอร์เสร็จ ≠ งานเสร็จ" — ตรวจไฟล์/ภาพ/โลโก้/เสียง/ซับ/ตามบรีฟ ก่อนปิดงาน (deploy/agents/video/qa.py)
--      → คอลัมน์ qa เก็บรายงาน { level: pass|warn|fail, checks: [...], sheet_url } ให้หน้า /video แสดง
--   2) "วางแผนก่อนสร้าง · AI เสนอ คนอนุมัติ" — ระบบเขียนแผน (บท ฉาก หน้าตา พื้นหลัง ค่าใช้จ่าย) ให้ดูก่อน
--      ยังไม่จ่ายอะไร · กดอนุมัติแล้วค่อยเรนเดอร์ → สถานะใหม่ 'planned' = แผนพร้อม รอคนอนุมัติ
--
-- ลำดับสถานะ:
--   ดูแผนก่อน:  queued (plan.stage=plan) → rendering (กำลังวางแผน) → planned → [อนุมัติ] queued → rendering → done|failed
--   ทำเลย:      queued → rendering → done|failed  (เหมือนเดิม)
--
-- ⚠️ โค้ดรองรับก่อนรันไฟล์นี้แล้ว: ไม่มีคอลัมน์ qa = ปิดงานแบบเดิม (รายงานอยู่ใน log ของ Actions)
--    แต่ปุ่ม "ดูแผนก่อน" ต้องมีสถานะ planned — ยังไม่รัน = ขั้นวางแผนจบด้วย failed พร้อมข้อความให้รันไฟล์นี้
--
-- ═══ วิธีรัน ═══
-- Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run  (รันซ้ำได้ ไม่พัง)

BEGIN;

alter table video_jobs add column if not exists qa jsonb;

comment on column video_jobs.qa is
  'รายงานด่านตรวจหลังเรนเดอร์ (agents/video/qa.py) · level pass|warn|fail · fail = ไม่ผูกคลิปเข้าคอนเทนต์อัตโนมัติ';

-- CHECK ของ status ประกาศไว้ตอน create table (075) โดยไม่ได้ตั้งชื่อ — ชื่อที่ Postgres ตั้งให้เดาไม่ได้แน่นอน
-- จึงลบทุก CHECK ของตารางนี้ที่พูดถึง status แล้วสร้างใหม่ชื่อตายตัว
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'video_jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table video_jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table video_jobs add constraint video_jobs_status_check
  check (status in ('queued', 'rendering', 'planned', 'done', 'failed'));

COMMIT;

-- ตรวจผล:
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'video_jobs'::regclass and conname = 'video_jobs_status_check';
--   select column_name from information_schema.columns where table_name = 'video_jobs' and column_name = 'qa';
