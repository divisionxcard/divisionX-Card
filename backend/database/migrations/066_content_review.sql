-- 066 · ที่เก็บผลตรวจคอนเทนต์จาก AI ผู้ตรวจ (Hermes) ก่อนถึงมือคนอนุมัติ
--
-- ทำไมต้องมี: ทุกวันนี้คอนเทนต์ที่ AI เขียนเสร็จจะไปนอนรอที่สถานะ pending
-- แล้วเจ้าของต้องอ่านเองทุกชิ้นตั้งแต่ต้นจนจบ (ค้างอยู่ 11 ชิ้น โพสต์จริงได้ 1)
-- ให้ผู้ตรวจอ่านก่อนแล้วสรุปว่า "ผ่าน / ควรแก้ตรงไหน" จะช่วยให้คนตัดสินใจได้เร็วขึ้นมาก
--
-- เก็บแยกจาก reject_reason เดิม เพราะคนละความหมาย:
--   reject_reason  = คนตัดสินแล้วว่าไม่เอา (จบ)
--   review_*       = AI เสนอความเห็น คนยังไม่ตัดสิน (ยังไปต่อได้)

alter table marketing_content
  add column if not exists review_verdict  text,        -- pass | fix | drop
  add column if not exists review_notes    text,        -- เหตุผล + จุดที่ควรแก้ (ภาษาไทย)
  add column if not exists reviewed_at     timestamptz,
  add column if not exists reviewed_by     text,        -- ชื่อผู้ตรวจ เช่น 'hermes'
  add column if not exists revision_count  int not null default 0;

comment on column marketing_content.review_verdict is
  'ผลตรวจจาก AI ผู้ตรวจ: pass = โพสต์ได้เลย · fix = ควรแก้ก่อน · drop = ไม่ควรใช้ชิ้นนี้ · null = ยังไม่ตรวจ';
comment on column marketing_content.review_notes is
  'สิ่งที่ผู้ตรวจเห็น — ต้องชี้จุดที่แก้ได้จริง ไม่ใช่คำติทั่วไป';
comment on column marketing_content.revision_count is
  'ถูกส่งกลับไปให้เขียนใหม่กี่รอบแล้ว — กันวนไม่รู้จบ';

-- ดึงเฉพาะชิ้นที่ยังไม่ได้ตรวจได้เร็ว (ตัวตรวจวิ่งเป็นรอบ ๆ)
create index if not exists idx_marketing_content_unreviewed
  on marketing_content (status, reviewed_at)
  where review_verdict is null;
