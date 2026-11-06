-- ============================================================================
-- 迁移：审计日志与全局搜索 trigram 索引（2026-11-07）
-- ============================================================================
-- 审计日志查询使用多字段 ILIKE '%关键词%'，没有 trigram 索引时会退化为全表扫描。
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_audit_logs_comment_trgm
  ON audit_logs USING gin (comment gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_reason_trgm
  ON audit_logs USING gin (reason gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_ref_trgm
  ON audit_logs USING gin (target_ref gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_certificate_ref_trgm
  ON audit_logs USING gin (certificate_ref gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_complaint_ref_trgm
  ON audit_logs USING gin (complaint_ref gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_trgm
  ON audit_logs USING gin (action gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm
  ON profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_phone_trgm
  ON profiles USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_certificates_cert_number_trgm
  ON certificates USING gin (cert_number gin_trgm_ops);

COMMIT;
