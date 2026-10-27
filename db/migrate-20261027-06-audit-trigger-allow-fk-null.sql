-- ============================================================================
-- 迁移：审计 append-only trigger 允许外键 SET NULL（2026-10-27）
-- ============================================================================
-- 背景：
--   audit_logs.certificate_id / complaint_id 使用 ON DELETE SET NULL。
--   完全禁止 UPDATE 会导致硬删除证书/投诉时 FK 置空失败。
-- 规则：
--   - DELETE 永远禁止
--   - UPDATE 仅允许把 certificate_id / complaint_id 从非空置为 NULL，
--     且其他所有列必须保持不变（用于数据库 FK 动作）
--   - 任何其他 UPDATE 仍然抛错
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'audit_logs is append-only; DELETE is not allowed';
    END IF;

    IF TG_OP = 'UPDATE'
       AND (
           (NEW.certificate_id IS NULL AND OLD.certificate_id IS NOT NULL)
           OR (NEW.complaint_id IS NULL AND OLD.complaint_id IS NOT NULL)
       )
       AND (to_jsonb(NEW) - 'certificate_id' - 'complaint_id')
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - 'certificate_id' - 'complaint_id')
    THEN
        -- 仅允许 FK ON DELETE SET NULL 造成的引用置空
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'audit_logs is append-only; % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

COMMIT;
