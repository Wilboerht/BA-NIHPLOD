-- ============================================================================
-- 迁移：证书自定义印章字段（2026-10-27 纳管）
-- ============================================================================
-- 说明：
--   scripts/migrate-seal-url.sql 是历史一次性脚本，未纳入 schema_migrations。
--   本迁移使用 IF NOT EXISTS，已有列时安全跳过，并登记到迁移 ledger。
-- ============================================================================

BEGIN;

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS seal_url TEXT DEFAULT NULL;

COMMENT ON COLUMN certificates.seal_url IS
    '用户上传的自定义印章 URL；为空时使用默认公章/模板印章';

COMMIT;
