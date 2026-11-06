-- ============================================================================
-- 迁移：收敛 Prisma Schema 与 SQL Schema 的已知漂移（2026-11-07）
-- ============================================================================

BEGIN;

UPDATE certificates SET search_count = 0 WHERE search_count IS NULL;
ALTER TABLE certificates ALTER COLUMN search_count SET DEFAULT 0;
ALTER TABLE certificates ALTER COLUMN search_count SET NOT NULL;

COMMIT;
