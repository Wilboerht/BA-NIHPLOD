-- ============================================================================
-- 迁移：证书/投诉软删除（2026-10-27）
-- ============================================================================
-- 目的：
--   1. certificates / complaints 增加 deleted_at、deleted_by
--   2. 删除接口改为软删除，保留业务数据、证据与审计链
--   3. 增加活跃数据列表索引
-- 影响：仅新增列/索引，不修改、不删除任何现有行。
-- ============================================================================

BEGIN;

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS deleted_by UUID;

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_certificates_active_status_created
    ON certificates(status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_deleted_at
    ON certificates(deleted_at);

CREATE INDEX IF NOT EXISTS idx_complaints_active_status_created
    ON complaints(status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_deleted_at
    ON complaints(deleted_at);

COMMENT ON COLUMN certificates.deleted_at IS '软删除时间：非空表示已从管理列表移除，数据与审计保留';
COMMENT ON COLUMN certificates.deleted_by IS '执行软删除的管理员 ID（快照，不做外键级联）';
COMMENT ON COLUMN complaints.deleted_at IS '软删除时间：非空表示已从管理列表移除，证据与审计保留';
COMMENT ON COLUMN complaints.deleted_by IS '执行软删除的管理员 ID（快照，不做外键级联）';

COMMIT;
