-- ============================================================================
-- 迁移：行为限流记录增加独立过期时间（2026-11-07）
-- ============================================================================
-- 背景：所有限流 key 共用一张表，但窗口长度不同（1 分钟 / 5 分钟 / 24 小时）。
-- 旧清理逻辑按当前请求窗口删除记录，会把更长窗口的计数提前清空。
-- 本迁移为每行保存 expires_at，清理只删除真正过期的记录。
-- ============================================================================

BEGIN;

ALTER TABLE action_rate_limits ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE action_rate_limits SET expires_at = NOW() WHERE expires_at IS NULL;
ALTER TABLE action_rate_limits ALTER COLUMN expires_at SET DEFAULT NOW();
ALTER TABLE action_rate_limits ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_rate_limits_expires ON action_rate_limits(expires_at);

COMMIT;
