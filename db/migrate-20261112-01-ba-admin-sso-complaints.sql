-- BA 管理员 SSO + 主站举报整合
-- 2026-11-12

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS external_admin_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS external_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS external_token_version INT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS main_totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_external_admin_id_key
  ON profiles(external_admin_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_auth_source_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_auth_source_check
      CHECK (auth_source IN ('local', 'sso'));
  END IF;
END $$;

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS handled_by_external_admin_id TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS handled_by_name TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS handled_by_email TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS main_alerted_at TIMESTAMPTZ;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS main_alert_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS main_alert_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_complaints_handled_by_external_admin_id
  ON complaints(handled_by_external_admin_id);
CREATE INDEX IF NOT EXISTS idx_complaints_main_alert_pending
  ON complaints(created_at) WHERE main_alerted_at IS NULL;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_source TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_external_id TEXT;
