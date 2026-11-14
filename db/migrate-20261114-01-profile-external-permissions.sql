-- 2026-11-14: sync main-site BA permissions into BA shadow profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS external_permissions TEXT[] NOT NULL DEFAULT '{}';
