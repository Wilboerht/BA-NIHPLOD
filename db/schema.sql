-- 品牌授权及验证平台 (BAVP) - PostgreSQL Schema
-- 完整版：包含所有初始设计 + 后续迁移内容
-- 注意：本项目使用自托管 PostgreSQL，RLS 策略在 API 层实现，不在数据库层

-- ============================================================================
-- 1. 枚举类型
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
          'SUPER_ADMIN',
          'AUDITOR'
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
    role user_role DEFAULT 'AUDITOR',
    is_first_login BOOLEAN DEFAULT TRUE,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 部分唯一索引：只对非 NULL 的 phone 强制唯一性（允许多个 NULL）
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON profiles(phone) WHERE phone IS NOT NULL;

-- 2026-05-26: profiles 表添加 email 字段，用于邮件提醒
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2026-09-25: 改密/重置后使旧 JWT 失效（版本号 +1，默认 0 不影响存量会话）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

-- 为已删除用户过滤创建索引
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. 经销商表（支持一个 phone 对应多个主体名称）
-- ============================================================================

CREATE TABLE IF NOT EXISTS dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- profile_id 已废弃：经销商不再关联登录账户
    company_name TEXT NOT NULL,
    phone TEXT,
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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- 2026-10-27: 软删除，保留证书与审计链
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);

-- ============================================================================
-- 6. 打假举报投诉表
-- ============================================================================

CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    channel TEXT,
    evidence_image_url TEXT,          -- 兼容旧数据，已废弃
    evidence_image_urls TEXT[] DEFAULT '{}',
    status complaint_status DEFAULT 'PENDING',
    handler_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    review_note TEXT,
    contact_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- 2026-10-27: 软删除，保留证据与审计链
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);

-- ============================================================================
-- 7. 审核日志表（append-only）
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID REFERENCES certificates(id) ON DELETE SET NULL,
    certificate_ref TEXT,
    -- 2026-09-25: 改为 SET NULL，删除工单后保留审计日志（complaint_ref 保存原工单 ID）
    complaint_id UUID REFERENCES complaints(id) ON DELETE SET NULL,
    complaint_ref TEXT,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    comment TEXT,
    -- 2026-10-27: 审计上下文
    target_type TEXT CHECK (
        target_type IS NULL
        OR target_type IN ('certificate', 'complaint', 'profile', 'file', 'system')
    ),
    target_id UUID,
    target_ref TEXT,
    actor_role TEXT,
    actor_name TEXT,
    request_id TEXT,
    ip TEXT,
    user_agent TEXT,
    "before" JSONB,
    "after" JSONB,
    reason TEXT,
    event_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
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
-- 9.5. 通用行为限流表（用于防刷：投诉提交、验证码发送等）
-- ============================================================================

CREATE TABLE IF NOT EXISTS action_rate_limits (
    key TEXT PRIMARY KEY,
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

-- complaints 表 updated_at 自动更新触发器
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

-- 审计日志只允许追加：禁止 UPDATE/DELETE
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

-- ============================================================================
-- 11. 常用查询索引（性能优化）
-- ============================================================================

-- certificates 表索引
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_dealer_id ON certificates(dealer_id);
CREATE INDEX IF NOT EXISTS idx_certificates_end_date ON certificates(end_date);
CREATE INDEX IF NOT EXISTS idx_certificates_cert_number ON certificates(cert_number);
CREATE INDEX IF NOT EXISTS idx_certificates_status_end_date ON certificates(status, end_date);
CREATE INDEX IF NOT EXISTS idx_certificates_active_status_created
    ON certificates(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificates_deleted_at ON certificates(deleted_at);

-- profiles 表索引
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- complaints 表索引
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_active_status_created
    ON complaints(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_deleted_at ON complaints(deleted_at);

-- dealers 表索引
CREATE INDEX IF NOT EXISTS idx_dealers_phone ON dealers(phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dealers_phone_company ON dealers(phone, company_name);

-- audit_logs 表索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_certificate_id ON audit_logs(certificate_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_complaint_id ON audit_logs(complaint_id);
-- 2026-09-26: 操作日志页按时间倒序分页
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
-- 2026-10-27: 审计 v2 查询索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created
    ON audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
    ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
    ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

-- action_rate_limits 表索引
CREATE INDEX IF NOT EXISTS idx_action_rate_limits_window ON action_rate_limits(window_start);

-- 2026-07-14: 全文搜索性能优化（三角模糊匹配索引）
-- 依赖 pg_trgm 扩展，需先 CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_dealers_company_name_trgm ON dealers USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_certificates_auth_scope_company_trgm ON certificates USING gin (split_part(auth_scope, ' | ', 1) gin_trgm_ops);

-- 2026-07-14: 搜索计数
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS search_count INT DEFAULT 0;

-- ============================================================================
-- 12. 迁移记录表（配合 scripts/apply-migrations.mjs 使用）
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2026-05-26: profiles 表添加 email 字段，用于邮件提醒
-- 注意：email 和 deleted_at 的 ALTER TABLE 已移至 profiles 表创建后

