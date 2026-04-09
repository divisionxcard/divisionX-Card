-- ═══════════════════════════════════════════════════════════════
-- Migration 009: แก้ quantity_sold สำหรับ box sales ที่ถูกบันทึกเป็น 1
-- ปัญหา: scraper เดิมตั้ง quantity_sold = 1 เสมอ ไม่ว่าจะขายแบบ box หรือ pack
-- แก้ไข: ถ้า product_name_raw มีคำว่า "box" → คูณ quantity_sold ด้วย packs_per_box
-- ═══════════════════════════════════════════════════════════════

UPDATE sales
SET quantity_sold = s.packs_per_box
FROM skus s
WHERE sales.sku_id = s.sku_id
  AND sales.quantity_sold = 1
  AND (
    LOWER(sales.product_name_raw) LIKE '%(box)%'
    OR LOWER(sales.product_name_raw) LIKE '% box'
  );
