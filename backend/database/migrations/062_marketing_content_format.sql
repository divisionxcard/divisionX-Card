-- 062 · เก็บ "รูปแบบโพสต์" ที่ AI ใช้เขียนแต่ละชิ้น
--
-- ทำไมต้องมี:
--   เดิม AI ได้ angle จากตัวเก็บไอเดียซึ่งเป็นข้อความ template เดียวกันหมด
--   (ข่าว One Piece 8 ชิ้นได้ angle เดียวกันเป๊ะ) → แคปชั่นออกมาซ้ำแนวกันจนกระทบเอ็นเกจเมนต์
--   ตอนนี้ระบบสุ่มรูปแบบโพสต์จาก content_voice.json แล้วเลี่ยงอันที่เพิ่งใช้
--   ซึ่งจะเลี่ยงได้ก็ต่อเมื่อ "จำได้" ว่ารอบก่อนใช้อันไหน
--
-- ผลพลอยได้: ภายหลังดูได้ว่ารูปแบบไหนได้ผลดีกว่ากัน (เทียบกับ posted_at + ยอดขาย)
--
-- ปลอดภัยกับของเดิม: เป็น nullable ไม่มี default แถวเก่าจะเป็น NULL เฉย ๆ
-- และโค้ดฝั่ง API ทนกรณียังไม่ได้รัน migration นี้อยู่แล้ว (fallback บันทึกแบบไม่มีคอลัมน์)

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS content_format TEXT;

COMMENT ON COLUMN marketing_content.content_format IS
  'key ของรูปแบบโพสต์ที่ใช้เขียนชิ้นนี้ (news_hook/question/ranking/... ดู deploy/tasks/content_voice.json)';

-- ใช้ค้นย้อนหลังว่ารูปแบบไหนถูกใช้ไปแล้วบ้าง — คิวไม่ยาว แต่ index ราคาถูก
CREATE INDEX IF NOT EXISTS idx_marketing_content_format
  ON marketing_content (content_format)
  WHERE content_format IS NOT NULL;
