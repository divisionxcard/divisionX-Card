-- ═══════════════════════════════════════════════════════════════
-- Migration 011: เพิ่ม avg_cost (ต้นทุนเฉลี่ยเคลื่อนที่) ในตาราง skus
-- avg_cost จะถูกอัปเดตเฉพาะตอนรับสินค้าเข้า (stock_in)
-- ไม่เปลี่ยนแปลงตอนเบิกออก (stock_out)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE skus ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

-- คำนวณค่าเริ่มต้นจาก stock_in ที่มีอยู่ (weighted average จากทุก lot)
UPDATE skus s
SET avg_cost = sub.avg
FROM (
  SELECT sku_id,
    CASE WHEN SUM(quantity_packs) > 0
      THEN SUM(total_cost) / SUM(quantity_packs)
      ELSE 0
    END AS avg
  FROM stock_in
  GROUP BY sku_id
) sub
WHERE s.sku_id = sub.sku_id;
