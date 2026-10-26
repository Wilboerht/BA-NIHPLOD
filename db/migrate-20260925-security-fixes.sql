-- ============================================================================
-- 迁移：安全加固（2026-09-25）
-- ============================================================================
-- 内容：
--   1. audit_logs 增加 complaint_ref，并将 complaint_id 外键改为 ON DELETE SET NULL
--      → 支持删除投诉工单时保留审计日志
--   2. profiles 增加 token_version，用于改密/重置后立即使旧 JWT 失效
--      （默认 0，与旧 Token 缺省版本一致，平滑过渡、不影响存量会话）
-- 执行方式（必须使用事务，失败自动回滚）：
--   sudo -u postgres psql -d <db> -v ON_ERROR_STOP=1 -1 -f db/migrate-20260925-security-fixes.sql
-- 回滚：db/rollback-20260925-security-fixes.sql
-- 影响范围：仅 audit_logs / profiles 两张表，不触碰 certificates / dealers
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. audit_logs.complaint_ref + FK 改为 SET NULL
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS complaint_ref TEXT;

-- 兼容不同来源创建的约束名：遍历并删除指向 complaints 的外键
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'audit_logs'::regclass
      AND contype = 'f'
      AND confrelid = 'complaints'::regclass;

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE audit_logs DROP CONSTRAINT %I', cname);
    END IF;
END $$;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_complaint_id_fkey
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL;

COMMENT ON COLUMN audit_logs.complaint_ref IS '投诉工单 UUID 文本引用：工单删除（complaint_id 置 NULL）后仍可追溯';

-- ---------------------------------------------------------------------------
-- 2. profiles.token_version
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.token_version IS 'JWT 版本号；修改/重置密码时 +1，旧版本 Token 立即失效';

COMMIT;
