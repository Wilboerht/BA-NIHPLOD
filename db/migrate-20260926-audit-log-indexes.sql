-- ============================================================================
-- 迁移：审计日志查询索引（2026-09-26）
-- ============================================================================
-- 背景：新增「系统操作日志」页面按 created_at DESC 分页，原表只有外键索引，
--       数据量增大后排序会退化。
-- 执行方式：
--   sudo -u postgres psql -d <db> -v ON_ERROR_STOP=1 -f db/migrate-20260926-audit-log-indexes.sql
-- 回滚：db/rollback-20260926-audit-log-indexes.sql
-- 影响范围：仅新增索引，不触碰任何数据行；幂等，可重复执行。
-- 注意：普通 CREATE INDEX 建索引期间会短暂阻塞写入；audit_logs 目前数据量小，
--       若未来行数很大，请在业务低峰执行或手动改用 CONCURRENTLY 单独执行。
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs(created_at DESC);

COMMIT;
