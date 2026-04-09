-- ═══════════════════════════════════════════════════════════════
-- Migration 010: แก้ boxes_per_cotton ของ PRB 01 และ PRB 02
-- PRB 01: 1 cotton = 10 กล่อง (เดิมตั้ง 12 ผิด)
-- PRB 02: 1 cotton = 20 กล่อง (เดิมตั้ง 12 ผิด)
-- ═══════════════════════════════════════════════════════════════

UPDATE skus SET boxes_per_cotton = 10 WHERE sku_id = 'PRB 01';
UPDATE skus SET boxes_per_cotton = 20 WHERE sku_id = 'PRB 02';
