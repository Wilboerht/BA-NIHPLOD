-- 安全修复迁移脚本
-- 执行时间：2026-05-11

-- 1. Token 黑名单表（用于安全注销）
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti TEXT PRIMARY KEY,
  exp_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_exp_at ON token_blacklist(exp_at);

-- 2. 登录限速表（持久化登录尝试记录）
CREATE TABLE IF NOT EXISTS login_rate_limits (
  ip TEXT PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 清理函数：删除已过期的黑名单记录
CREATE OR REPLACE FUNCTION cleanup_expired_blacklist()
RETURNS void AS $$
BEGIN
  DELETE FROM token_blacklist WHERE exp_at < NOW();
END;
$$ LANGUAGE plpgsql;
