-- 品牌授权及验证平台 (BAVP) - Supabase / PostgreSQL Schema

-- 1. 用户角色与档案
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'AUDITOR', 'DEALER');

CREATE TABLE profiles (
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
CREATE UNIQUE INDEX profiles_phone_key ON profiles(phone) WHERE phone IS NOT NULL;

-- 2. 经销商表（支持一个 phone 对应多个主体名称）
CREATE TABLE dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,  -- 主体/公司名称
    phone TEXT NOT NULL,  -- 电话号码（非唯一，允许同一phone有多条记录）
    contact_person TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：加快按 phone 查询
CREATE INDEX dealers_phone_idx ON dealers(phone);

-- 3. 证书模板表
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    background_url TEXT NOT NULL, -- 留白模板图片路径
    stamp_url TEXT, -- 默认公章图片路径
    config JSONB, -- 存储文字填充坐标 (name_x, name_y, id_x, id_y, date_x, date_y, stamp_x, stamp_y, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE certificate_status AS ENUM ('PENDING', 'ISSUED', 'REJECTED', 'EXPIRED', 'REVOKED');

CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_number TEXT UNIQUE NOT NULL, -- 授权编号 如 BAVP-2024-XXXX
    dealer_id UUID REFERENCES dealers(id) NOT NULL,
    template_id UUID REFERENCES templates(id),
    auth_scope TEXT, -- 授权范围
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status certificate_status DEFAULT 'PENDING',
    final_image_url TEXT, -- 生成后的证书图片存储路径
    seal_url TEXT, -- 用户上传的自定义印章 URL（核发时保存，下载时优先使用）
    auditor_id UUID REFERENCES profiles(id), -- 初审人
    manager_id UUID REFERENCES profiles(id), -- 终审发证人
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 审核日志
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID REFERENCES certificates(id),
    actor_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL, -- 'SUBMIT', 'AUDIT_CONFIRM', 'ISSUE', 'REJECT'
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) 策略示例
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 经销商只能看到自己的证书
CREATE POLICY "Dealers can view own certificates" ON certificates
    FOR SELECT USING (auth.uid() IN (SELECT profile_id FROM dealers WHERE id = certificates.dealer_id));

-- 所有用户（访客）可以按编号查看到已签发的证书
CREATE POLICY "Public can view issued certificates" ON certificates
    FOR SELECT USING (status = 'ISSUED');

-- 管理员可以查看所有
CREATE POLICY "Admins can do everything" ON certificates
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR')));

-- Dealers 表 RLS 策略
CREATE POLICY "Dealers can view all dealers" ON dealers
    FOR SELECT USING (true); -- 允许所有用户查看（用于签发时查询）

CREATE POLICY "Only admins can manage dealers" ON dealers
    FOR INSERT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR')));

CREATE POLICY "Only admins can update dealers" ON dealers
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR')));

-- Templates 表 RLS 策略
CREATE POLICY "Templates are public for reading" ON templates
    FOR SELECT USING (true);

CREATE POLICY "Only admins can manage templates" ON templates
    FOR INSERT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN')));

CREATE POLICY "Only admins can update templates" ON templates
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN')));

-- Audit Logs 表 RLS 策略
CREATE POLICY "Only admins can view audit logs" ON audit_logs
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR')));

CREATE POLICY "Only admins can create audit logs" ON audit_logs
    FOR INSERT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR')));

-- 6. 打假举报投诉表 (Complaints)
CREATE TYPE complaint_status AS ENUM ('PENDING', 'INVESTIGATING', 'RESOLVED', 'REJECTED');

CREATE TABLE complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL, -- 涉嫌侵权描述
    channel TEXT, -- 涉事渠道/店铺
    evidence_image_url TEXT, -- 证据图片路径
    status complaint_status DEFAULT 'PENDING',
    handler_id UUID REFERENCES profiles(id), -- 处理此举报的法务/审核人
    review_note TEXT, -- 审核备注
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 举报投诉的 RLS 策略
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- 允许任何人（包含访客）提交打假投诉
CREATE POLICY "Public can insert complaints" ON complaints
    FOR INSERT WITH CHECK (true);

-- 仅管理员可查看和管理打假投诉
CREATE POLICY "Admins can manage complaints" ON complaints
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'AUDITOR')));
