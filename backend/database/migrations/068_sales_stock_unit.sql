-- 068 · แยก "ขายยกกล่อง" ออกจาก "ขายทีละซอง"
--
-- ปัญหา: ตอนนี้บอกไม่ได้ว่ารายการขายไหนเป็นกล่องไหนเป็นซอง
--   sku_id เดียวกันใช้ทั้งสองแบบ — "One Piece OP - 16" กับ "One Piece OP - 16 Box"
--   ต่างเป็น sku_id = 'OP 16' เหมือนกัน
--   ข้อมูลมีอยู่แล้วใน product_name_raw (คำว่า Box ต่อท้าย) แต่ไม่มีใครดึงมาใช้
--   → รายงานทุกตัวเอากล่องกับซองมาบวกกันตรง ๆ และ MCP ก็ตอบแอดมินไม่ได้
--
-- ทำไมไม่ใส่ที่ตาราง skus:
--   format เป็นคุณสมบัติของ "ช่องที่ขาย" ไม่ใช่ของ "ตัวสินค้า"
--   SKU เดียวขายทั้งกล่องและซองพร้อมกันในตู้เดียว ถ้าใส่ที่ skus จะเลือกได้ค่าเดียว
--   แล้วอีกแบบหายไปเลย
--
-- หมายเหตุสำคัญเรื่องความหมายของ quantity_sold:
--   รายการที่เป็นกล่อง บันทึก quantity_sold เป็น "จำนวนซองในกล่อง" (24 หรือ 10)
--   ไม่ใช่ "1 กล่อง" — ตรวจแล้วสม่ำเสมอทุกแบรนด์ (vms · worldwide · payif)
--   ดังนั้นยอดซองรวมและยอดเงินรวมที่มีอยู่เดิม **ถูกต้องอยู่แล้ว**
--   คอลัมน์นี้เพิ่มเพื่อให้ "แยกดู" ได้ ไม่ได้มาแก้ตัวเลขที่ผิด
--
-- ⚠️ ข้อยกเว้นที่ต้องซ่อมแยกต่างหาก (ไม่รวมใน migration นี้):
--   ชื่อ 'PRB - 02 (ฺBox)' (มีอักขระ U+0E3A หลงมาก่อนคำว่า Box) 31 รายการบนตู้ vms
--   บันทึก quantity_sold = 1 แทนที่จะเป็น 10 → ยอดซองขาดไป 279 ซอง (ยอดเงินถูก)
--   ต้องให้เจ้าของยืนยันก่อนแก้ เพราะแตะข้อมูลย้อนหลัง

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pack';

ALTER TABLE machine_stock
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pack';

-- จำกัดค่าให้เหลือสองแบบ กันสะกดเพี้ยนในอนาคต
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_unit_check;
ALTER TABLE sales
  ADD CONSTRAINT sales_unit_check CHECK (unit IN ('pack', 'box'));

ALTER TABLE machine_stock
  DROP CONSTRAINT IF EXISTS machine_stock_unit_check;
ALTER TABLE machine_stock
  ADD CONSTRAINT machine_stock_unit_check CHECK (unit IN ('pack', 'box'));

COMMENT ON COLUMN sales.unit IS
  'รูปแบบที่ขาย: pack = ซองเดี่ยว · box = ยกกล่อง '
  '(quantity_sold ของ box คือจำนวนซองในกล่อง ไม่ใช่จำนวนกล่อง)';
COMMENT ON COLUMN machine_stock.unit IS
  'รูปแบบสินค้าในช่องนี้: pack = ซองเดี่ยว · box = ยกกล่อง';

-- ── เติมข้อมูลย้อนหลังจากชื่อสินค้าดิบ ──
-- ครอบคลุมทุกแบบที่เจอจริงในฐานข้อมูล 185 ชื่อ:
--   "... Box" · "... (Box)" · "... BOX" · "... Box PRO" · "PRO ... Box"
--   รวมถึง "PRB - 02 (ฺBox)" ที่มีอักขระไทยหลงมา — ILIKE '%box%' จับได้หมด
UPDATE sales
   SET unit = 'box'
 WHERE product_name_raw ILIKE '%box%'
   AND unit <> 'box';

UPDATE machine_stock
   SET unit = 'box'
 WHERE product_name ILIKE '%box%'
   AND unit <> 'box';

-- กรองด้วย unit บ่อย ทั้งในรายงานและ MCP
CREATE INDEX IF NOT EXISTS idx_sales_unit_sold_at ON sales (unit, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_stock_unit ON machine_stock (machine_id, unit);

-- ── ผลจริงหลังรัน (22 ส.ค. 2026) ──
-- SELECT unit, count(*) AS รายการ, sum(quantity_sold) AS ซอง, sum(grand_total) AS บาท
--   FROM sales GROUP BY unit;
--
--   sales         : box 582 · pack 28,239   (รวม 28,821)
--   machine_stock : box 115 · pack 619      (รวม 734)
--
-- ตรวจแล้วไม่มีแถวไหนที่ unit ขัดกับชื่อสินค้าเลยสักแถว และ CHECK ปฏิเสธค่านอกเหนือ
-- pack/box ได้จริง (ทดสอบด้วยการ PATCH เป็น 'carton' → 400 unit_check)
