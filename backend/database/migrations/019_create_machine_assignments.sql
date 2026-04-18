-- 019: สร้างตาราง machine_assignments (ผูกแอดมินกับตู้ที่รับผิดชอบ)
CREATE TABLE IF NOT EXISTS machine_assignments (
  id            SERIAL PRIMARY KEY,
  machine_id    VARCHAR(50)  NOT NULL REFERENCES machines(machine_id),
  user_id       UUID         NOT NULL,
  assigned_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(machine_id, user_id)
);

-- Index สำหรับ query ตู้ของ user
CREATE INDEX IF NOT EXISTS idx_machine_assignments_user
  ON machine_assignments(user_id) WHERE is_active = TRUE;

-- RLS
ALTER TABLE machine_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "machine_assignments_select" ON machine_assignments
  FOR SELECT USING (TRUE);

CREATE POLICY "machine_assignments_insert" ON machine_assignments
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "machine_assignments_update" ON machine_assignments
  FOR UPDATE USING (TRUE);

CREATE POLICY "machine_assignments_delete" ON machine_assignments
  FOR DELETE USING (TRUE);
