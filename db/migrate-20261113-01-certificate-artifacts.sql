-- Certificate artifacts + internal API idempotency
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS artifact_status TEXT NOT NULL DEFAULT 'MISSING',
  ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS template_version TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certificates_artifact_status_check'
  ) THEN
    ALTER TABLE certificates
      ADD CONSTRAINT certificates_artifact_status_check
      CHECK (artifact_status IN ('MISSING', 'RENDERING', 'READY', 'FAILED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS certificate_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('png', 'pdf')),
  variant TEXT NOT NULL CHECK (variant IN ('ISSUED', 'REVOKED', 'EXPIRED', 'PREVIEW')),
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  template_version TEXT NOT NULL,
  template_sha256 TEXT,
  seal_sha256 TEXT,
  source TEXT NOT NULL DEFAULT 'issue'
    CHECK (source IN ('issue', 'backfill', 'lazy', 'revoke', 'expire')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (certificate_id, format, variant, template_version)
);

CREATE INDEX IF NOT EXISTS idx_certificate_artifacts_cert_created
  ON certificate_artifacts(certificate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificate_artifacts_variant_created
  ON certificate_artifacts(variant, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificate_artifacts_sha256
  ON certificate_artifacts(sha256);

CREATE TABLE IF NOT EXISTS internal_request_idempotency (
  key TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_external_id TEXT,
  request_hash TEXT NOT NULL,
  response_code INTEGER NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_internal_idempotency_expires
  ON internal_request_idempotency(expires_at);
