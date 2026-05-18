-- 维权申诉功能深度修复迁移脚本
-- 执行时间：2026-05-18

-- 1. 投诉表添加投诉人联系方式
ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS contact_info TEXT DEFAULT NULL;

-- 2. 审核日志表添加投诉工单关联（支持证书和投诉两种审计对象）
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE;

-- 3. 通用行为限流表（用于防刷：投诉提交、验证码发送等）
CREATE TABLE IF NOT EXISTS action_rate_limits (
    key TEXT PRIMARY KEY,
    attempts INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_rate_limits_window ON action_rate_limits(window_start);

-- 4. complaints 表 updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_complaints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON complaints;
CREATE TRIGGER trg_complaints_updated_at
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION update_complaints_updated_at();

-- 5. audit_logs 表 RLS 策略更新（投诉审计日志）
-- 注意：如果之前未运行过 schema.sql，以下策略可能已存在，使用 IF NOT EXISTS 避免报错
DO $$
BEGIN
    -- 允许管理员查看所有审计日志（已存在的策略无需重复创建）
    -- 已有策略 "Only admins can view audit logs" 覆盖 SELECT
    -- 已有策略 "Only admins can create audit logs" 覆盖 INSERT
    -- complaint_id 添加后现有策略仍然适用
END $$;
