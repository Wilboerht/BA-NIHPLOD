-- ============================================================================
-- 迁移：清理重复索引（2026-11-06）
-- ============================================================================
-- 历史原因同时使用过 prisma db push 和 db/schema.sql，产生多组同字段索引。
-- 本迁移只删除 Prisma 旧命名的一组非唯一索引，保留 schema.sql 管理的索引
-- 以及所有唯一约束/唯一索引。
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS certificates_cert_number_idx;
DROP INDEX IF EXISTS certificates_dealer_id_idx;
DROP INDEX IF EXISTS certificates_end_date_idx;
DROP INDEX IF EXISTS certificates_status_idx;
DROP INDEX IF EXISTS certificates_status_end_date_idx;

DROP INDEX IF EXISTS dealers_phone_idx;

DROP INDEX IF EXISTS complaints_status_idx;

DROP INDEX IF EXISTS audit_logs_actor_id_idx;
DROP INDEX IF EXISTS audit_logs_certificate_id_idx;
DROP INDEX IF EXISTS audit_logs_complaint_id_idx;

COMMIT;
