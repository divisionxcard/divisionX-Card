-- ═══════════════════════════════════════════════════════════════
-- Migration 033: Canonical SKU naming (cross-system identifier)
-- 2026-05-19
--
-- เพิ่ม column canonical_sku + 4 sub-fields ใน skus table
-- เพื่อใช้เป็นชื่อกลางที่ทุกระบบ (DVX/VMS/WW/Excel/อนาคต) ต้อง normalize
-- เข้ามาตรงกัน · ไม่แตะ sku_id เดิม (กัน break FK ทั้งหมด)
--
-- Format: {FRANCHISE}-{SET}-{TYPE}-{LANG}
--   FRANCHISE: OP, DB, PKM, SL, NRT
--   SET: OP01, FB01, ME02, T4W7, SLE3, ...
--   TYPE: PAK (pack), BOX, STD (starter), BDL (bundle), SGL (single card)
--   LANG: EN, JP, KR, CN, TH, ASIA
--
-- ตัวอย่าง:
--   OP-OP08-PAK-EN  · OP-OP08-BOX-EN
--   DB-FB01-PAK-JP
--   NRT-T4W7-BOX-CN
--   PKM-ME04-PAK-EN
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS canonical_sku TEXT,
  ADD COLUMN IF NOT EXISTS franchise     TEXT,
  ADD COLUMN IF NOT EXISTS set_code      TEXT,
  ADD COLUMN IF NOT EXISTS item_type     TEXT,  -- PAK | BOX | STD | BDL | SGL
  ADD COLUMN IF NOT EXISTS language      TEXT;  -- EN | JP | KR | CN | TH | ASIA

-- Unique constraint on canonical_sku (named explicitly · PostgREST friendly)
ALTER TABLE skus
  DROP CONSTRAINT IF EXISTS skus_canonical_sku_key;

ALTER TABLE skus
  ADD CONSTRAINT skus_canonical_sku_key UNIQUE (canonical_sku);

CREATE INDEX IF NOT EXISTS idx_skus_franchise ON skus(franchise);
CREATE INDEX IF NOT EXISTS idx_skus_set_code  ON skus(set_code);
CREATE INDEX IF NOT EXISTS idx_skus_item_type ON skus(item_type);

-- ═══ Mapping table: external system name → canonical SKU ═════
-- ใช้สำหรับ scraper translate ชื่อจาก VMS/WW → canonical
-- ทั้งสะดวก lookup + เก็บ history ชื่อ legacy ที่ admin เคยใช้
CREATE TABLE IF NOT EXISTS sku_aliases (
  id            SERIAL PRIMARY KEY,
  canonical_sku TEXT          NOT NULL,
  source        TEXT          NOT NULL CHECK (source IN ('vms', 'ww', 'admin_report', 'legacy_dvx')),
  external_name TEXT          NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_name)
);

CREATE INDEX IF NOT EXISTS idx_sku_aliases_canonical ON sku_aliases(canonical_sku);
CREATE INDEX IF NOT EXISTS idx_sku_aliases_source    ON sku_aliases(source);

ALTER TABLE sku_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sku_aliases admin read" ON sku_aliases
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "sku_aliases admin write" ON sku_aliases
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

GRANT ALL ON sku_aliases TO service_role;
GRANT USAGE, SELECT ON SEQUENCE sku_aliases_id_seq TO service_role;

-- ═══ Verify ═════════════════════════════════════════════════════
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'skus' AND column_name IN ('canonical_sku', 'franchise', 'set_code', 'item_type', 'language')
ORDER BY column_name;
