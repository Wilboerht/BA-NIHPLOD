-- ============================================================================
-- 迁移：审计日志 v2（2026-10-27）
-- ============================================================================
-- 目的：
--   1. 补齐 target/actor/request/before/after/reason 等审计上下文
--   2. 回填已有日志的 target 与 actor 快照
--   3. 增加查询索引，并把 audit_logs 改为 append-only（禁止 UPDATE/DELETE）
-- 影响：仅 audit_logs 表结构与索引；不删除任何业务数据。
-- 注意：回填必须在创建 append-only 触发器之前执行。
-- ============================================================================

BEGIN;

-- 回填前临时移除 append-only trigger（schema.sql 新建库可能已创建）
DROP TRIGGER IF EXISTS trg_audit_logs_no_mutation ON audit_logs;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_ref TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "before" JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "after" JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_hash TEXT;

-- 文本引用回填：只补空值，不覆盖已有数据
UPDATE audit_logs
SET certificate_ref = certificate_id::text
WHERE certificate_ref IS NULL
  AND certificate_id IS NOT NULL;

UPDATE audit_logs
SET complaint_ref = complaint_id::text
WHERE complaint_ref IS NULL
  AND complaint_id IS NOT NULL;

-- 旧日志没有 target_type：按已有外键回填
UPDATE audit_logs
SET target_type = 'certificate',
    target_id = certificate_id
WHERE target_type IS NULL
  AND certificate_id IS NOT NULL;

UPDATE audit_logs
SET target_type = 'complaint',
    target_id = complaint_id
WHERE target_type IS NULL
  AND complaint_id IS NOT NULL;

-- 旧日志没有 actor 快照：从 profiles 回填当时可得的姓名/角色
UPDATE audit_logs a
SET actor_role = p.role::text,
    actor_name = COALESCE(p.full_name, p.username)
FROM profiles p
WHERE a.actor_id = p.id
  AND (a.actor_role IS NULL OR a.actor_name IS NULL);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'audit_logs_target_type_check'
    ) THEN
        ALTER TABLE audit_logs
            ADD CONSTRAINT audit_logs_target_type_check
            CHECK (
                target_type IS NULL
                OR target_type IN ('certificate', 'complaint', 'profile', 'file', 'system')
            ) NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created
    ON audit_logs(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
    ON audit_logs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
    ON audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id
    ON audit_logs(request_id);

-- 审计日志只允许追加：应用层代码不应 UPDATE/DELETE audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'audit_logs is append-only; DELETE is not allowed';
    END IF;

    -- 允许 FK ON DELETE SET NULL 只把 certificate_id/complaint_id 置空
    IF TG_OP = 'UPDATE'
       AND (
           (NEW.certificate_id IS NULL AND OLD.certificate_id IS NOT NULL)
           OR (NEW.complaint_id IS NULL AND OLD.complaint_id IS NOT NULL)
       )
       AND (to_jsonb(NEW) - 'certificate_id' - 'complaint_id')
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - 'certificate_id' - 'complaint_id')
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'audit_logs is append-only; % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_no_mutation ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_mutation
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_mutation();

COMMENT ON COLUMN audit_logs.target_type IS '目标类型：certificate / complaint / profile / file / system';
COMMENT ON COLUMN audit_logs.target_id IS '目标 UUID（可为空，文件/系统事件可只存 target_ref）';
COMMENT ON COLUMN audit_logs.target_ref IS '目标文本引用（文件路径、系统任务名等）';
COMMENT ON COLUMN audit_logs.actor_role IS '操作人角色快照';
COMMENT ON COLUMN audit_logs.actor_name IS '操作人姓名快照';
COMMENT ON COLUMN audit_logs.request_id IS '请求追踪 ID';
COMMENT ON COLUMN audit_logs.ip IS '客户端 IP（由可信反向代理写入）';
COMMENT ON COLUMN audit_logs.user_agent IS '客户端 User-Agent';
COMMENT ON COLUMN audit_logs.before IS '变更前快照 JSONB';
COMMENT ON COLUMN audit_logs.after IS '变更后快照 JSONB';
COMMENT ON COLUMN audit_logs.reason IS '操作原因（删除/退回/吊销等）';
COMMENT ON COLUMN audit_logs.event_hash IS '事件内容 SHA-256，用于归档校验';

COMMIT;
