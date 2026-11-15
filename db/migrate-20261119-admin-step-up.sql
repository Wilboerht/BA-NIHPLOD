-- BA 工作台高风险操作二次验证（主站 TOTP ticket）
CREATE TABLE IF NOT EXISTS admin_step_up_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash TEXT NOT NULL UNIQUE,
  profile_id UUID NOT NULL,
  external_admin_id TEXT,
  action TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  return_to TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_step_up_requests_expires
  ON admin_step_up_requests (expires_at);

CREATE TABLE IF NOT EXISTS admin_step_up_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  ticket_jti TEXT NOT NULL UNIQUE,
  profile_id UUID NOT NULL,
  external_admin_id TEXT,
  action TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_step_up_grants_expires
  ON admin_step_up_grants (expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_step_up_grants_profile_expires
  ON admin_step_up_grants (profile_id, expires_at);
