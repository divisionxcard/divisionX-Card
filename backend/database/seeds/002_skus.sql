-- =============================================================
-- Seed: ข้อมูล SKU ทั้งหมด 21 รายการ
-- OP 01–15: packs_per_box = 12
-- PRB 01–02: packs_per_box = 10  ⚠️
-- EB 01–04:  packs_per_box = 12
-- boxes_per_cotton = 12 ทุก SKU
-- =============================================================

INSERT INTO skus (sku_id, name, series, packs_per_box, boxes_per_cotton, sell_price, cost_price) VALUES
  -- One Piece Card Game OP Series
  ('OP 01',  'One Piece Card Game OP-01', 'OP', 12, 12, 0, 0),
  ('OP 02',  'One Piece Card Game OP-02', 'OP', 12, 12, 0, 0),
  ('OP 03',  'One Piece Card Game OP-03', 'OP', 12, 12, 0, 0),
  ('OP 04',  'One Piece Card Game OP-04', 'OP', 12, 12, 0, 0),
  ('OP 05',  'One Piece Card Game OP-05', 'OP', 12, 12, 0, 0),
  ('OP 06',  'One Piece Card Game OP-06', 'OP', 12, 12, 0, 0),
  ('OP 07',  'One Piece Card Game OP-07', 'OP', 12, 12, 0, 0),
  ('OP 08',  'One Piece Card Game OP-08', 'OP', 12, 12, 0, 0),
  ('OP 09',  'One Piece Card Game OP-09', 'OP', 12, 12, 0, 0),
  ('OP 10',  'One Piece Card Game OP-10', 'OP', 12, 12, 0, 0),
  ('OP 11',  'One Piece Card Game OP-11', 'OP', 12, 12, 0, 0),
  ('OP 12',  'One Piece Card Game OP-12', 'OP', 12, 12, 0, 0),
  ('OP 13',  'One Piece Card Game OP-13', 'OP', 12, 12, 0, 0),
  ('OP 14',  'One Piece Card Game OP-14', 'OP', 12, 12, 0, 0),
  ('OP 15',  'One Piece Card Game OP-15', 'OP', 12, 12, 0, 0),

  -- One Piece Premium Booster (packs_per_box = 10 ⚠️)
  ('PRB 01', 'One Piece Premium Booster 01', 'PRB', 10, 12, 0, 0),
  ('PRB 02', 'One Piece Premium Booster 02', 'PRB', 10, 12, 0, 0),

  -- One Piece Extra Booster
  ('EB 01',  'One Piece Extra Booster 01', 'EB', 12, 12, 0, 0),
  ('EB 02',  'One Piece Extra Booster 02', 'EB', 12, 12, 0, 0),
  ('EB 03',  'One Piece Extra Booster 03', 'EB', 12, 12, 0, 0),
  ('EB 04',  'One Piece Extra Booster 04', 'EB', 12, 12, 0, 0)
ON CONFLICT (sku_id) DO NOTHING;

-- หมายเหตุ: อัปเดต sell_price และ cost_price ตามราคาจริงหลัง seed
