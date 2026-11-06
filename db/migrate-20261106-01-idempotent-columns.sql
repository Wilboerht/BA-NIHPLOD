-- ============================================================================
-- 迁移：幂等补齐 profiles 字段并补证书生效期索引（2026-11-06）
-- ============================================================================
-- 线上库通常已存在这些列；本迁移用于新库/旧库兜底。
-- ============================================================================

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
    ON profiles(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_status_start_end
    ON certificates(status, start_date, end_date)
    WHERE deleted_at IS NULL;

COMMIT;
