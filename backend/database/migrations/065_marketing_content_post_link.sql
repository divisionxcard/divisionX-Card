-- 065 · เก็บ "หลักฐานการโพสต์" หลังยิงขึ้นเพจ Facebook อัตโนมัติ
--
-- ทำไมต้องเก็บ post_id ไม่ใช่แค่ posted_at:
--   posted_at บอกได้แค่ "โพสต์ไปแล้ว" แต่ตอบไม่ได้ว่าโพสต์ไหน
--   1) กันโพสต์ซ้ำ — ถ้ามี post_id อยู่แล้วต้องไม่ยิงซ้ำ (Facebook ไม่กันให้)
--   2) เปิดดูของจริงได้จากหน้าเว็บ ไม่ต้องไปไล่หาในเพจ
--   3) อนาคตดึงยอด engagement กลับมา (likes/comments/shares) ต้องใช้ post_id
--
-- post_id ของเพจมีรูปแบบ {page_id}_{post_id} · post_url คือ permalink_url
-- ที่ขอจาก Graph API มาอีกทีหลังโพสต์สำเร็จ (ไม่ประกอบ URL เอง เผื่อรูปแบบเปลี่ยน)
alter table marketing_content
  add column if not exists post_id  text,
  add column if not exists post_url text;

comment on column marketing_content.post_id  is 'id โพสต์จาก Graph API รูปแบบ {page_id}_{post_id} — มีค่านี้แปลว่ายิงขึ้นเพจสำเร็จแล้ว ห้ามยิงซ้ำ';
comment on column marketing_content.post_url is 'permalink_url ที่ขอจาก Graph API หลังโพสต์ — ลิงก์เปิดโพสต์จริงบนเพจ';

-- หาโพสต์จาก id ที่ Facebook คืนมา (เช่นตอน sync ยอด engagement กลับ)
create index if not exists idx_marketing_content_post_id
  on marketing_content (post_id) where post_id is not null;
