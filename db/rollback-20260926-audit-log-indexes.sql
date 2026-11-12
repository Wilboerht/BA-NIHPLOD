-- ============================================================================
-- 回滚：审计日志查询索引（2026-09-26）
-- ============================================================================
BEGIN;

DROP INDEX IF EXISTS idx_audit_logs_created_at;

-- 从迁移 ledger 中移除，允许修复后重新执行
DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        DELETE FROM schema_migrations WHERE filename = 'migrate-20260926-audit-log-indexes.sql';
    END IF;
END $$;

COMMIT;
