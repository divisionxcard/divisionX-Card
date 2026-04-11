-- =============================================================
-- Migration 018: Create login_history table
-- ตาราง: บันทึกประวัติการเข้า-ออกระบบ (Audit Trail)
-- =============================================================

CREATE TABLE IF NOT EXISTS login_history (
  id            SERIAL PRIMARY KEY,
  user_id       UUID,
  email         VARCHAR(200),
  display_name  VARCHAR(100),
  action        VARCHAR(20)  NOT NULL DEFAULT 'login'
                CHECK (action IN ('login', 'logout')),
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_history_user_id    ON login_history(user_id);
CREATE INDEX idx_login_history_created_at ON login_history(created_at DESC);

COMMENT ON TABLE  login_history              IS 'บันทึกประวัติการเข้า-ออกระบบ';
COMMENT ON COLUMN login_history.user_id     IS 'Supabase Auth user ID';
COMMENT ON COLUMN login_history.action      IS 'login หรือ logout';
COMMENT ON COLUMN login_history.ip_address  IS 'IP Address ของผู้ใช้';
COMMENT ON COLUMN login_history.user_agent  IS 'Browser User Agent';
