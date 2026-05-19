-- ═══════════════════════════════════════════════════════════════
-- Migration 034: Backfill canonical_sku + seed sku_aliases
-- 2026-05-19 (rev 2 — ใช้ชื่อมาตรฐานตาม user กำหนด)
--
-- ⚠ ต้อง apply Migration 033 ก่อน
--
-- canonical_sku = ชื่อมาตรฐาน DvX (พิมพ์เต็มในรูปแบบ "One Piece OP - 01")
-- sku_aliases = mapping จากชื่อเก่า/VMS/WW → canonical_sku
-- ═══════════════════════════════════════════════════════════════

-- ═══ Backfill skus.canonical_sku + sub-fields (Pack เป็น default) ═
-- One Piece OP
UPDATE skus SET canonical_sku='One Piece OP - 01', franchise='OP', set_code='OP01', item_type='PAK', language='EN' WHERE sku_id='OP 01';
UPDATE skus SET canonical_sku='One Piece OP - 02', franchise='OP', set_code='OP02', item_type='PAK', language='EN' WHERE sku_id='OP 02';
UPDATE skus SET canonical_sku='One Piece OP - 03', franchise='OP', set_code='OP03', item_type='PAK', language='EN' WHERE sku_id='OP 03';
UPDATE skus SET canonical_sku='One Piece OP - 04', franchise='OP', set_code='OP04', item_type='PAK', language='EN' WHERE sku_id='OP 04';
UPDATE skus SET canonical_sku='One Piece OP - 05', franchise='OP', set_code='OP05', item_type='PAK', language='EN' WHERE sku_id='OP 05';
UPDATE skus SET canonical_sku='One Piece OP - 06', franchise='OP', set_code='OP06', item_type='PAK', language='EN' WHERE sku_id='OP 06';
UPDATE skus SET canonical_sku='One Piece OP - 07', franchise='OP', set_code='OP07', item_type='PAK', language='EN' WHERE sku_id='OP 07';
UPDATE skus SET canonical_sku='One Piece OP - 08', franchise='OP', set_code='OP08', item_type='PAK', language='EN' WHERE sku_id='OP 08';
UPDATE skus SET canonical_sku='One Piece OP - 09', franchise='OP', set_code='OP09', item_type='PAK', language='EN' WHERE sku_id='OP 09';
UPDATE skus SET canonical_sku='One Piece OP - 10', franchise='OP', set_code='OP10', item_type='PAK', language='EN' WHERE sku_id='OP 10';
UPDATE skus SET canonical_sku='One Piece OP - 11', franchise='OP', set_code='OP11', item_type='PAK', language='EN' WHERE sku_id='OP 11';
UPDATE skus SET canonical_sku='One Piece OP - 12', franchise='OP', set_code='OP12', item_type='PAK', language='EN' WHERE sku_id='OP 12';
UPDATE skus SET canonical_sku='One Piece OP - 13', franchise='OP', set_code='OP13', item_type='PAK', language='EN' WHERE sku_id='OP 13';
UPDATE skus SET canonical_sku='One Piece OP - 14', franchise='OP', set_code='OP14', item_type='PAK', language='EN' WHERE sku_id='OP 14';
UPDATE skus SET canonical_sku='One Piece OP - 15', franchise='OP', set_code='OP15', item_type='PAK', language='EN' WHERE sku_id='OP 15';
-- One Piece EB
UPDATE skus SET canonical_sku='One Piece EB - 01', franchise='OP', set_code='EB01', item_type='PAK', language='EN' WHERE sku_id='EB 01';
UPDATE skus SET canonical_sku='One Piece EB - 02', franchise='OP', set_code='EB02', item_type='PAK', language='EN' WHERE sku_id='EB 02';
UPDATE skus SET canonical_sku='One Piece EB - 03', franchise='OP', set_code='EB03', item_type='PAK', language='EN' WHERE sku_id='EB 03';
UPDATE skus SET canonical_sku='One Piece EB - 04', franchise='OP', set_code='EB04', item_type='PAK', language='EN' WHERE sku_id='EB 04';
-- One Piece PRB
UPDATE skus SET canonical_sku='One Piece PRB - 01', franchise='OP', set_code='PRB01', item_type='PAK', language='EN' WHERE sku_id='PRB 01';
UPDATE skus SET canonical_sku='One Piece PRB - 02', franchise='OP', set_code='PRB02', item_type='PAK', language='EN' WHERE sku_id='PRB 02';
-- Dragonball FB
UPDATE skus SET canonical_sku='Dragonball FB - 01', franchise='DB', set_code='FB01', item_type='PAK', language='EN' WHERE sku_id='FB 01';
UPDATE skus SET canonical_sku='Dragonball FB - 02', franchise='DB', set_code='FB02', item_type='PAK', language='EN' WHERE sku_id='FB 02';
UPDATE skus SET canonical_sku='Dragonball FB - 03', franchise='DB', set_code='FB03', item_type='PAK', language='EN' WHERE sku_id='FB 03';
UPDATE skus SET canonical_sku='Dragonball FB - 04', franchise='DB', set_code='FB04', item_type='PAK', language='EN' WHERE sku_id='FB 04';
UPDATE skus SET canonical_sku='Dragonball FB - 05', franchise='DB', set_code='FB05', item_type='PAK', language='EN' WHERE sku_id='FB 05';
UPDATE skus SET canonical_sku='Dragonball FB - 06', franchise='DB', set_code='FB06', item_type='PAK', language='EN' WHERE sku_id='FB 06';
UPDATE skus SET canonical_sku='Dragonball FB - 07', franchise='DB', set_code='FB07', item_type='PAK', language='EN' WHERE sku_id='FB 07';
UPDATE skus SET canonical_sku='Dragonball FB - 08', franchise='DB', set_code='FB08', item_type='PAK', language='EN' WHERE sku_id='FB 08';
UPDATE skus SET canonical_sku='Dragonball FB - 09', franchise='DB', set_code='FB09', item_type='PAK', language='EN' WHERE sku_id='FB 09';
UPDATE skus SET canonical_sku='Dragonball FB - 10', franchise='DB', set_code='FB10', item_type='PAK', language='EN' WHERE sku_id='FB 10';
UPDATE skus SET canonical_sku='Dragonball FB - 11', franchise='DB', set_code='FB11', item_type='PAK', language='EN' WHERE sku_id='FB 11';
UPDATE skus SET canonical_sku='Dragonball FB - 12', franchise='DB', set_code='FB12', item_type='PAK', language='EN' WHERE sku_id='FB 12';
UPDATE skus SET canonical_sku='Dragonball FB - 13', franchise='DB', set_code='FB13', item_type='PAK', language='EN' WHERE sku_id='FB 13';
UPDATE skus SET canonical_sku='Dragonball FB - 14', franchise='DB', set_code='FB14', item_type='PAK', language='EN' WHERE sku_id='FB 14';
UPDATE skus SET canonical_sku='Dragonball FB - 15', franchise='DB', set_code='FB15', item_type='PAK', language='EN' WHERE sku_id='FB 15';
-- Dragonball UB (B29)
UPDATE skus SET canonical_sku='Dragonball B - 29', franchise='DB', set_code='UB02', item_type='PAK', language='EN' WHERE sku_id='B29';
-- Naruto · SLL · PKM → rename sku_id ด้วย (CASCADE FK propagate)
-- ⚠ Pokemon Dream EX: packs_per_box เปลี่ยนจาก 30 → 10 (admin confirm 2026-05-19)
UPDATE skus SET canonical_sku='Naruto Jin - 1',     franchise='NRT', set_code='JIN01',    item_type='PAK', language='EN', sku_id='NRT Jin - 1'     WHERE sku_id='Naruto Jin1';
UPDATE skus SET canonical_sku='Naruto Series - 01', franchise='NRT', set_code='SERIES01', item_type='PAK', language='CN', sku_id='NRT Series - 01' WHERE sku_id='Naruto Series1';
UPDATE skus SET canonical_sku='Naruto Series - 02', franchise='NRT', set_code='SERIES02', item_type='PAK', language='CN', sku_id='NRT Series - 02' WHERE sku_id='Naruto Series2';
UPDATE skus SET canonical_sku='Solo Leveling UA 51', franchise='SL', set_code='UA51', item_type='PAK', language='EN', sku_id='SLL UA 51' WHERE sku_id='SOLO Leveling';
UPDATE skus SET canonical_sku='Pokemon Dream EX', franchise='PKM', set_code='ME02', item_type='PAK', language='EN', sku_id='PKM Dream EX', packs_per_box=10 WHERE sku_id='POKEMON MAGA EX';
UPDATE skus SET canonical_sku='Pokemon Ninja',    franchise='PKM', set_code='ME04', item_type='PAK', language='EN', sku_id='PKM Ninja'    WHERE sku_id='POKEMON NINJA';

-- ═══ Seed sku_aliases: VMS variants → canonical ════════════════
-- ทุก variants ที่เคยเจอจริงใน machine_stock map ไป canonical (Pack)
INSERT INTO sku_aliases (canonical_sku, source, external_name) VALUES
  -- One Piece Pack (caps mixed)
  ('One Piece OP - 01', 'vms', 'ONE PIECE OP - 01'),
  ('One Piece OP - 02', 'vms', 'ONE PIECE OP - 02'),
  ('One Piece OP - 03', 'vms', 'ONE PIECE OP - 03'),
  ('One Piece OP - 04', 'vms', 'ONE PIECE OP - 04'),
  ('One Piece OP - 05', 'vms', 'ONE PIECE OP - 05'),
  ('One Piece OP - 06', 'vms', 'ONE PIECE OP - 06'),
  ('One Piece OP - 07', 'vms', 'ONE PIECE OP - 07'),
  ('One Piece OP - 08', 'vms', 'ONE PIECE OP - 08'),
  ('One Piece OP - 09', 'vms', 'ONE PIECE OP - 09'),
  ('One Piece OP - 10', 'vms', 'One Piece OP - 10'),
  ('One Piece OP - 11', 'vms', 'One Piece OP - 11'),
  ('One Piece OP - 12', 'vms', 'One Piece OP - 12'),
  ('One Piece OP - 13', 'vms', 'One Piece OP - 13'),
  ('One Piece OP - 14', 'vms', 'One Piece OP - 14'),
  ('One Piece OP - 15', 'vms', 'One Piece OP - 15'),
  -- One Piece Box (มี dash issue + PRO suffix)
  ('One Piece OP - 08', 'vms', 'One Piece OP - 08 Box'),
  ('One Piece OP - 09', 'vms', 'One Piece OP - 09 Box'),
  ('One Piece OP - 10', 'vms', 'One Piece OP 10 Box'),
  ('One Piece OP - 11', 'vms', 'One Piece OP 11 Box'),
  ('One Piece OP - 13', 'vms', 'One Piece OP - 13 Box'),
  ('One Piece OP - 13', 'vms', 'One Piece OP - 13 Box PRO'),
  ('One Piece OP - 15', 'vms', 'One Piece OP - 15 Box'),
  -- EB
  ('One Piece EB - 01', 'vms', 'One Piece EB - 01'),
  ('One Piece EB - 02', 'vms', 'One Piece EB - 02'),
  ('One Piece EB - 03', 'vms', 'One Piece EB - 03'),
  ('One Piece EB - 04', 'vms', 'One Piece EB - 04'),
  -- PRB
  ('One Piece PRB - 01', 'vms', 'One Piece PRB - 01'),
  ('One Piece PRB - 01', 'vms', 'One Piece PRB - 01 Box'),
  ('One Piece PRB - 02', 'vms', 'One Piece PRB - 02'),
  ('One Piece PRB - 02', 'vms', 'One Piece PRB - 02 Box'),
  -- Dragonball FB (2 variants)
  ('Dragonball FB - 01', 'vms', 'Dragon Ball FB 01'),
  ('Dragonball FB - 01', 'vms', 'FB 01'),
  ('Dragonball FB - 02', 'vms', 'Dragon Ball FB 02'),
  ('Dragonball FB - 02', 'vms', 'FB 02'),
  ('Dragonball FB - 03', 'vms', 'FB 03'),
  ('Dragonball FB - 04', 'vms', 'FB 04'),
  ('Dragonball FB - 05', 'vms', 'FB 05'),
  ('Dragonball FB - 08', 'vms', 'FB 08'),
  ('Dragonball FB - 09', 'vms', 'FB 09'),
  -- Naruto (canonical = ชื่อเต็ม)
  ('Naruto Series - 01', 'vms', 'Naruto Series1'),
  ('Naruto Series - 02', 'vms', 'Naruto Series2'),
  ('Naruto Jin - 1',     'vms', 'Naruto Jin1'),
  -- Pokemon
  ('Pokemon Dream EX', 'vms', 'POKEMON MAGA EX'),
  ('Pokemon Ninja',    'vms', 'POKEMON NINJA'),
  -- Solo Leveling
  ('Solo Leveling UA 51', 'vms', 'SOLO Leveling')
ON CONFLICT (source, external_name) DO NOTHING;

-- WW wwv01: shorter format with "ซอง"/"BOX"
INSERT INTO sku_aliases (canonical_sku, source, external_name) VALUES
  ('One Piece OP - 01', 'ww', 'OP 01 ซอง'),
  ('One Piece OP - 02', 'ww', 'OP 02 ซอง'),
  ('One Piece OP - 03', 'ww', 'OP 03 ซอง'),
  ('One Piece OP - 04', 'ww', 'OP 04 ซอง'),
  ('One Piece OP - 05', 'ww', 'OP 05 ซอง'),
  ('One Piece OP - 06', 'ww', 'OP 06 ซอง'),
  ('One Piece OP - 07', 'ww', 'OP 07 ซอง'),
  ('One Piece OP - 08', 'ww', 'OP 08 ซอง'),
  ('One Piece OP - 08', 'ww', 'OP 08 BOX'),
  ('One Piece OP - 09', 'ww', 'OP 09 ซอง'),
  ('One Piece OP - 09', 'ww', 'OP 09 BOX'),
  ('One Piece OP - 10', 'ww', 'OP 10 ซอง'),
  ('One Piece OP - 10', 'ww', 'OP 10 BOX'),
  ('One Piece OP - 11', 'ww', 'OP 11 ซอง'),
  ('One Piece OP - 11', 'ww', 'OP 11 BOX'),
  ('One Piece OP - 12', 'ww', 'OP 12 ซอง'),
  ('One Piece OP - 13', 'ww', 'OP 13 ซอง'),
  ('One Piece OP - 13', 'ww', 'OP 13 BOX'),
  ('One Piece OP - 14', 'ww', 'OP 14 ซอง'),
  ('One Piece OP - 15', 'ww', 'OP 15 ซอง'),
  ('One Piece OP - 15', 'ww', 'OP 15 BOX'),
  ('One Piece EB - 01', 'ww', 'EB 01 ซอง'),
  ('One Piece EB - 02', 'ww', 'EB 02 ซอง'),
  ('One Piece EB - 03', 'ww', 'EB 03 ซอง'),
  ('One Piece EB - 04', 'ww', 'EB 04 ซอง'),
  ('One Piece PRB - 01', 'ww', 'PRB 01 ซอง'),
  ('One Piece PRB - 01', 'ww', 'PRB 01 BOX'),
  ('One Piece PRB - 02', 'ww', 'PRB 02 ซอง'),
  ('One Piece PRB - 02', 'ww', 'PRB 02 BOX')
ON CONFLICT (source, external_name) DO NOTHING;

-- ═══ Verify ═════════════════════════════════════════════════════
SELECT canonical_sku, sku_id, franchise, set_code, item_type
FROM skus WHERE canonical_sku IS NOT NULL ORDER BY franchise, set_code;

SELECT source, COUNT(*) AS alias_count FROM sku_aliases GROUP BY source;
