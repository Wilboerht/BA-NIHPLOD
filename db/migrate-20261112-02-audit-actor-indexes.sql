-- ============================================================================
-- 迁移：允许审计日志 actor_id 随用户删除置空 + 补齐查询索引（2026-11-12）
-- ============================================================================
-- 说明：
--   1. profiles 硬删除时 audit_logs.actor_id 的 ON DELETE SET NULL 需要
--      触发器放行；原触发器只允许 certificate_id/complaint_id 置空。
--   2. 补齐投诉全文搜索、登录限流清理、列表排序所需索引。
--   3. 清理被唯一约束/复合索引覆盖的冗余索引。
-- 大表说明：
--   CREATE INDEX 在事务内会阻塞写入。生产大表请在低峰期执行，或改用
--   psql 手工执行对应 CREATE INDEX CONCURRENTLY 后再登记本迁移。
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. 审计日志 append-only 触发器：额外允许 actor_id 被 FK 置空
CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'audit_logs is append-only; DELETE is not allowed';
    END IF;

    -- 允许 FK ON DELETE SET NULL 只把 certificate_id/complaint_id/actor_id 置空
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'certificate_id' - 'complaint_id' - 'actor_id')
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - 'certificate_id' - 'complaint_id' - 'actor_id')
       AND (
           (NEW.certificate_id IS NULL AND OLD.certificate_id IS NOT NULL)
           OR (NEW.complaint_id IS NULL AND OLD.complaint_id IS NOT NULL)
           OR (NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL)
       )
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'audit_logs is append-only; % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- 2. 投诉列表搜索（description / channel / contact_info / id）
CREATE INDEX IF NOT EXISTS idx_complaints_description_trgm
    ON complaints USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_complaints_channel_trgm
    ON complaints USING gin (channel gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_complaints_contact_info_trgm
    ON complaints USING gin (contact_info gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_complaints_id_text_trgm
    ON complaints USING gin ((id::text) gin_trgm_ops);

-- 3. 登录限流过期清理
CREATE INDEX IF NOT EXISTS idx_login_rate_limits_window_start
    ON login_rate_limits(window_start);

-- 4. 未筛选列表按创建时间排序
CREATE INDEX IF NOT EXISTS idx_complaints_created_at
    ON complaints(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificates_created_at
    ON certificates(created_at DESC) WHERE deleted_at IS NULL;

-- 5. 清理冗余索引（唯一约束/复合索引已覆盖）
DROP INDEX IF EXISTS idx_certificates_cert_number;
DROP INDEX IF EXISTS idx_dealers_phone;
DROP INDEX IF EXISTS idx_action_rate_limits_window;

COMMIT;
