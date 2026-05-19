-- 品牌授权及验证平台 (BAVP) - Supabase / PostgreSQL Schema
-- 完整版：包含所有初始设计 + 后续迁移内容

-- ============================================================================
-- 1. 枚举类型
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
          'SUPER_ADMIN',
          'AUDITOR',
          'MANAGER',
          'PROJECT_MANAGER',
          'DEALER'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificate_status') THEN
        CREATE TYPE certificate_status AS ENUM (
          'PENDING',
          'ISSUED',
          'REJECTED',
          'EXPIRED',
          'REVOKED'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'complaint_status') THEN
        CREATE TYPE complaint_status AS ENUM (
          'PENDING',
          'INVESTIGATING',
          'RESOLVED',
          'REJECTED'
        );
    END IF;
END$$;

-- ============================================================================
-- 2. 用户档案表
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE,
    full_name TEXT,
    phone TEXT,
    password_hash TEXT,
    role user_role DEFAULT 'DEALER',
    is_first_login BOOLEAN DEFAULT TRUE,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 部分唯一索引：只对非 NULL 的 phone 强制唯一性（允许多个 NULL）
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON profiles(phone) WHERE phone IS NOT NULL;

-- ============================================================================
-- 3. 经销商表（支持一个 phone 对应多个主体名称）
-- ============================================================================

CREATE TABLE IF NOT EXISTS dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. 证书模板表
-- ============================================================================

CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    background_url TEXT NOT NULL,
    stamp_url TEXT,
    config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. 证书表
-- ============================================================================

CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_number TEXT UNIQUE NOT NULL,
    dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE NOT NULL,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    auth_scope TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status certificate_status DEFAULT 'PENDING',
    final_image_url TEXT,
    seal_url TEXT,
    auditor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. 审核日志表
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID REFERENCES certificates(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. 打假举报投诉表
-- ============================================================================

CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    channel TEXT,
    evidence_image_url TEXT,
    status complaint_status DEFAULT 'PENDING',
    handler_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    review_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. Token 黑名单表（用于安全注销）
-- ============================================================================

CREATE TABLE IF NOT EXISTS token_blacklist (
    jti TEXT PRIMARY KEY,
    exp_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_exp_at ON token_blacklist(exp_at);

-- ============================================================================
-- 9. 登录限速表（持久化登录尝试记录）
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_rate_limits (
    ip TEXT PRIMARY KEY,
    attempts INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. 辅助函数
-- ============================================================================

-- 清理已过期的黑名单记录
CREATE OR REPLACE FUNCTION cleanup_expired_blacklist()
RETURNS void AS $$
BEGIN
  DELETE FROM token_blacklist WHERE exp_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. 常用查询索引（性能优化）
-- ============================================================================

-- certificates 表索引
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_dealer_id ON certificates(dealer_id);
CREATE INDEX IF NOT EXISTS idx_certificates_end_date ON certificates(end_date);

-- profiles 表索引
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- complaints 表索引
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- dealers 表索引
CREATE INDEX IF NOT EXISTS idx_dealers_phone ON dealers(phone);

-- audit_logs 表索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_certificate_id ON audit_logs(certificate_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);

-- ============================================================================
-- 12. Row Level Security (RLS)
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- profiles 表：管理员可以查看所有用户，经销商只能查看自己
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
      )
    );

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- dealers 表策略
DROP POLICY IF EXISTS "Dealers can view all dealers" ON dealers;
CREATE POLICY "Dealers can view all dealers" ON dealers
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can manage dealers" ON dealers;
CREATE POLICY "Only admins can manage dealers" ON dealers
    FOR INSERT USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
      )
    );

DROP POLICY IF EXISTS "Only admins can update dealers" ON dealers;
CREATE POLICY "Only admins can update dealers" ON dealers
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
      )
    );

-- certificates 表策略
DROP POLICY IF EXISTS "Dealers can view own certificates" ON certificates;
CREATE POLICY "Dealers can view own certificates" ON certificates
    FOR SELECT USING (
      auth.uid() IN (
        SELECT profile_id FROM dealers WHERE id = certificates.dealer_id
      )
    );

DROP POLICY IF EXISTS "Public can view issued certificates" ON certificates;
CREATE POLICY "Public can view issued certificates" ON certificates
    FOR SELECT USING (status = 'ISSUED');

DROP POLICY IF EXISTS "Admins can manage all certificates" ON certificates;
CREATE POLICY "Admins can manage all certificates" ON certificates
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
      )
    );

-- templates 表策略
DROP POLICY IF EXISTS "Templates are public for reading" ON templates;
CREATE POLICY "Templates are public for reading" ON templates
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only super admins can manage templates" ON templates;
CREATE POLICY "Only super admins can manage templates" ON templates
    FOR INSERT USING (
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
      )
    );

DROP POLICY IF EXISTS "Only super admins can update templates" ON templates;
CREATE POLICY "Only super admins can update templates" ON templates
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
      )
    );

-- audit_logs 表策略
DROP POLICY IF EXISTS "Only admins can view audit logs" ON audit_logs;
CREATE POLICY "Only admins can view audit logs" ON audit_logs
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
      )
    );

DROP POLICY IF EXISTS "Only admins can create audit logs" ON audit_logs;
CREATE POLICY "Only admins can create audit logs" ON audit_logs
    FOR INSERT USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
      )
    );

-- complaints 表策略
DROP POLICY IF EXISTS "Public can insert complaints" ON complaints;
CREATE POLICY "Public can insert complaints" ON complaints
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage complaints" ON complaints;
CREATE POLICY "Admins can manage complaints" ON complaints
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER')
      )
    );
