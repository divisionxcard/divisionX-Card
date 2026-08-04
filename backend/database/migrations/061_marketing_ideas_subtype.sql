-- 061_marketing_ideas_subtype.sql
-- เพิ่ม subtype ให้ marketing_ideas — ใช้คัดไอเดียให้ "ไม่ซ้ำประเภท"
--
-- ปัญหาที่แก้: ตอนคัด 3 ชิ้นต่อช่องทาง ถ้าเรียงตามคะแนนล้วน ๆ
-- ช่องทาง internal จะได้ "SKU มาแรง" ทั้ง 3 อัน (คะแนนสูงสุดหมด)
-- ส่วน "SKU ยอดตก" ที่ควรได้คอนเทนต์ดันจะไม่มีวันโผล่ขึ้นมาเลย
--
-- subtype ทำให้คัดแบบวนประเภทได้ (มาแรง 1 · ยอดตก 1 · ของใกล้หมด 1)
-- และใช้กับช่องทางอื่นด้วย — ข่าว 3 ชิ้นจะมาจาก 3 คำค้นต่างกัน ไม่ใช่คำค้นเดียว

alter table marketing_ideas
  add column if not exists subtype text;

comment on column marketing_ideas.subtype is
  'ประเภทย่อยในช่องทางเดียวกัน — internal: hot_sku|falling_sku|restock|machine_drop · '
  'news/tiktok: คำค้นที่ใช้ · youtube: ชื่อช่อง · ใช้คัดไอเดียให้ไม่ซ้ำประเภท';

-- คัดตามช่องทาง+ประเภท → index ครอบให้ครบ
create index if not exists idx_marketing_ideas_pick
  on marketing_ideas (status, source, subtype, score desc);

-- ── backfill ของเดิม จาก prefix ของ external_key ที่ตัวเก็บเขียนไว้ ──
update marketing_ideas set subtype = 'hot_sku'
  where subtype is null and external_key like 'hot:%';
update marketing_ideas set subtype = 'falling_sku'
  where subtype is null and external_key like 'fall:%';
update marketing_ideas set subtype = 'restock'
  where subtype is null and external_key like 'restock:%';
update marketing_ideas set subtype = 'machine_drop'
  where subtype is null and external_key like 'mdrop:%';

-- ข่าว/TikTok เดิมเก็บคำค้นไว้ใน source_label รูปแบบ "<ที่มา> · <คำค้น>"
update marketing_ideas
   set subtype = split_part(source_label, ' · ', 2)
 where subtype is null
   and source in ('news', 'tiktok')
   and source_label like '%' || ' · ' || '%';

-- ที่เหลือ (วางลิงก์เอง ฯลฯ) ให้ใช้ช่องทางเป็นประเภทไปก่อน
update marketing_ideas set subtype = source where subtype is null;
