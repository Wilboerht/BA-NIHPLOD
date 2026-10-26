-- ============================================================================
-- 回滚：安全加固（2026-09-25）
-- ============================================================================
-- 执行方式：
--   sudo -u postgres psql -d <db> -v ON_ERROR_STOP=1 -1 -f db/rollback-20260925-security-fixes.sql
-- 注意：回滚会删除 token_version / complaint_ref 两列及其数据。
--       先回滚代码再回滚数据库，避免旧代码访问新列。
-- ============================================================================

BEGIN;

-- 1. 还原 audit_logs 外键为 ON DELETE CASCADE
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_complaint_id_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_complaint_id_fkey
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;

ALTER TABLE audit_logs DROP COLUMN IF EXISTS complaint_ref;

-- 2. 删除 profiles.token_version
ALTER TABLE profiles DROP COLUMN IF EXISTS token_version;

COMMIT;
