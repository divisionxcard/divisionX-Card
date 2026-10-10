-- 076 · เลนเทรนด์ใหม่ของตัวเก็บไอเดีย (10 ต.ค. 2026)
--
-- เจ้าของขอให้ระบบหาข่าว/กระแสจากหลายช่องทางให้ทันและอัปเดตเสมอ
-- ทดสอบยิงจริง 8 แหล่งแล้ว (wiki/worklog/2026-10-10-trend-radar.md) ได้ 3 แหล่งใหม่ที่ใช้ได้:
--   official — เว็บทางการของค่าย (วันวางขาย · แบนลิสต์ · อีเวนต์ในไทย · ทัวร์นาเมนต์ TCG+)
--   global   — ชุมชน/สื่อต่างประเทศที่นำหน้าข่าวไทย 2-6 สัปดาห์ (Reddit · Google News EN · TCGplayer)
--   price    — ราคาตลาดพุ่ง/การ์ดมาแรง (card2price.com ← SNKRDUNK)
--
-- ⚠️ ถ้ายังไม่ได้รันไฟล์นี้ ตัวเก็บจะไม่พัง — มันตรวจเจอ CHECK constraint เดิมแล้ว
--    ถอยไปบันทึกเป็น source เดิม (official/global → news · price → internal) และตัด event_date ทิ้ง
--    พร้อมพิมพ์เตือนทุกรอบ · ไอคอนบนหน้าเว็บจึงยังไม่แยกช่องทางจนกว่าจะรัน

alter table marketing_ideas drop constraint if exists marketing_ideas_source_check;
alter table marketing_ideas add constraint marketing_ideas_source_check
  check (source in ('news','youtube','tiktok','internal','comment','manual','official','global','price'));

-- วันของเหตุการณ์ในอนาคต (วันวางขาย · วันงาน) — ไว้เรียงปฏิทินและกันตัวล้างไอเดียเก่าลบทิ้งก่อนถึงวัน
alter table marketing_ideas add column if not exists event_date date;

comment on column marketing_ideas.event_date is
  'วันวางขาย/วันเริ่มงานที่ไอเดียนี้อ้างถึง (null = ไม่ผูกวัน) · ตัวล้างไอเดียเก่าจะไม่ลบของที่ยังไม่ถึงวัน';

create index if not exists idx_marketing_ideas_event_date
  on marketing_ideas (event_date) where event_date is not null;
