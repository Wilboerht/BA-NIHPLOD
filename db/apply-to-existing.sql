-- ============================================================================
-- 已有数据库增量迁移脚本
-- 适用于：已运行过旧版 schema.sql 的 Supabase/PostgreSQL 数据库
-- 执行方式：在 Supabase Dashboard → SQL Editor 中粘贴并运行
-- ============================================================================

-- 0. dealers 表：添加 profile_id 外键字段（关联经销商与用户）
ALTER TABLE dealers
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dealers_profile_id ON dealers(profile_id);

-- 1. profiles 表：添加 is_banned 字段（如果不存在）
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- 2. profiles 表：修复 phone 唯一约束为部分索引（允许多个 NULL）
-- 先尝试删除旧的硬唯一约束（如果存在）
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_phone_key;
-- 创建部分唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON profiles(phone) WHERE phone IS NOT NULL;

-- 3. complaints 表：添加 review_note 字段
ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS review_note TEXT DEFAULT NULL;

-- 4. complaints 表：添加 contact_info 字段
ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS contact_info TEXT DEFAULT NULL;

-- 5. user_role 枚举：确保包含 MANAGER 和 PROJECT_MANAGER
-- PostgreSQL 不支持直接修改 ENUM，需要重建（如果旧枚举缺少值）
DO $$
BEGIN
    -- 检查枚举是否已包含所有需要的值
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'user_role'::regtype 
        AND enumlabel = 'MANAGER'
    ) THEN
        -- 重建枚举类型
        CREATE TYPE user_role_new AS ENUM ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER', 'DEALER');
        ALTER TABLE profiles 
          ALTER COLUMN role DROP DEFAULT,
          ALTER COLUMN role TYPE user_role_new USING role::text::user_role_new,
          ALTER COLUMN role SET DEFAULT 'DEALER';
        DROP TYPE user_role;
        ALTER TYPE user_role_new RENAME TO user_role;
    END IF;
END$$;

-- 6. 安全修复：Token 黑名单表
CREATE TABLE IF NOT EXISTS token_blacklist (
    jti TEXT PRIMARY KEY,
    exp_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_exp_at ON token_blacklist(exp_at);

-- 7. 安全修复：登录限速表
CREATE TABLE IF NOT EXISTS login_rate_limits (
    ip TEXT PRIMARY KEY,
    attempts INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. 安全修复：清理过期黑名单函数
CREATE OR REPLACE FUNCTION cleanup_expired_blacklist()
RETURNS void AS $$
BEGIN
    DELETE FROM token_blacklist WHERE exp_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 9. 通用行为限流表（防刷）
CREATE TABLE IF NOT EXISTS action_rate_limits (
    key TEXT PRIMARY KEY,
    attempts INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_rate_limits_window ON action_rate_limits(window_start);

-- 10. 投诉功能修复：audit_logs 添加投诉关联
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE;

-- 11. 投诉功能修复：complaints 表 updated_at 自动更新触发器
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

-- 12. 性能优化：常用查询索引
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_dealer_id ON certificates(dealer_id);
CREATE INDEX IF NOT EXISTS idx_certificates_end_date ON certificates(end_date);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_dealers_phone ON dealers(phone);
CREATE INDEX IF NOT EXISTS idx_audit_logs_certificate_id ON audit_logs(certificate_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_complaint_id ON audit_logs(complaint_id);

-- 13. 外键修复：统一使用 ON DELETE SET NULL（保留数据完整性）
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_auditor_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_manager_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_handler_id_fkey;

ALTER TABLE certificates ADD CONSTRAINT certificates_auditor_id_fkey
    FOREIGN KEY (auditor_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE certificates ADD CONSTRAINT certificates_manager_id_fkey
    FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE complaints ADD CONSTRAINT complaints_handler_id_fkey
    FOREIGN KEY (handler_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- 14. RLS：确保 action_rate_limits 表启用行级安全
ALTER TABLE action_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage rate limits" ON action_rate_limits;
CREATE POLICY "Service role can manage rate limits" ON action_rate_limits
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
        )
    );

-- ============================================================================
-- 迁移完成验证查询（可选）
-- ============================================================================
SELECT 'profiles.is_banned' as column_name, column_name IS NOT NULL as exists
FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_banned'
UNION ALL
SELECT 'complaints.review_note', column_name IS NOT NULL
FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'review_note'
UNION ALL
SELECT 'complaints.contact_info', column_name IS NOT NULL
FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'contact_info'
UNION ALL
SELECT 'audit_logs.complaint_id', column_name IS NOT NULL
FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'complaint_id'
UNION ALL
SELECT 'action_rate_limits table', table_name IS NOT NULL
FROM information_schema.tables WHERE table_name = 'action_rate_limits';
