-- 补充常用查询字段的数据库索引，提升性能

-- certificates 表：按状态查询（待审列表、仪表盘统计）
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);

-- certificates 表：按经销商查询（经销商证书列表）
CREATE INDEX IF NOT EXISTS idx_certificates_dealer_id ON certificates(dealer_id);

-- certificates 表：按结束日期查询（有效期统计）
CREATE INDEX IF NOT EXISTS idx_certificates_end_date ON certificates(end_date);

-- profiles 表：按角色查询（管理员列表、权限检查）
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- complaints 表：按状态查询（待处理统计）
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- dealers 表：按手机号查询（经销商登录、关联查询）
CREATE INDEX IF NOT EXISTS idx_dealers_phone ON dealers(phone);

-- audit_logs 表：按证书查询（操作历史）
CREATE INDEX IF NOT EXISTS idx_audit_logs_certificate_id ON audit_logs(certificate_id);

-- audit_logs 表：按操作人查询
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
