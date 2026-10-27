-- ============================================================================
-- 迁移：审计日志证书引用保留（2026-10-27）
-- ============================================================================
-- 目的：
--   1. audit_logs 增加 certificate_ref，删除证书后仍可追溯原证书 ID
--   2. certificate_id 外键由 ON DELETE CASCADE 改为 ON DELETE SET NULL
--   3. 回填已有 complaint_ref / certificate_ref，避免旧日志变成孤儿
-- 影响：仅 audit_logs 表结构 + 回填文本引用，不删除任何业务数据。
-- ============================================================================

BEGIN;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS certificate_ref TEXT;

-- 回填在 02-audit-v2 中执行（那里会在回填前临时移除 append-only trigger）

-- 兼容不同来源创建的约束名：遍历并删除指向 certificates 的外键
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'audit_logs'::regclass
      AND contype = 'f'
      AND confrelid = 'certificates'::regclass;

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE audit_logs DROP CONSTRAINT %I', cname);
    END IF;
END $$;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_certificate_id_fkey
    FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE SET NULL;

COMMENT ON COLUMN audit_logs.certificate_ref IS
    '证书 UUID 文本引用：证书删除（certificate_id 置 NULL）后仍可追溯';

COMMIT;
