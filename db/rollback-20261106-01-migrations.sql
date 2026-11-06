-- ============================================================================
-- 回滚：2026-11-06 迁移
-- ============================================================================
-- 注意：profiles.email/deleted_at/token_version 已存在于线上库，不能安全删除。
-- 本回滚只恢复索引部分。
-- ============================================================================

BEGIN;

-- 恢复被清理掉的 Prisma 旧索引（仅在确有回滚需要时使用）
CREATE INDEX IF NOT EXISTS certificates_cert_number_idx ON certificates(cert_number);
CREATE INDEX IF NOT EXISTS certificates_dealer_id_idx ON certificates(dealer_id);
CREATE INDEX IF NOT EXISTS certificates_end_date_idx ON certificates(end_date);
CREATE INDEX IF NOT EXISTS certificates_status_idx ON certificates(status);
CREATE INDEX IF NOT EXISTS certificates_status_end_date_idx ON certificates(status, end_date);
CREATE INDEX IF NOT EXISTS dealers_phone_idx ON dealers(phone);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints(status);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_certificate_id_idx ON audit_logs(certificate_id);
CREATE INDEX IF NOT EXISTS audit_logs_complaint_id_idx ON audit_logs(complaint_id);

DROP INDEX IF EXISTS idx_certificates_status_start_end;

COMMIT;
