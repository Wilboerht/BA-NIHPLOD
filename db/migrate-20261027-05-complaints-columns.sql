-- ============================================================================
-- 迁移：补齐 complaints 历史缺列（2026-10-27）
-- ============================================================================
-- 背景：
--   db/schema.sql 的 CREATE TABLE IF NOT EXISTS 不会给旧表补列；
--   旧库只执行 db/migrate-* 时可能缺 evidence_image_urls / handler_id /
--   review_note / contact_info。本迁移全部使用 IF NOT EXISTS，不删数据。
-- ============================================================================

BEGIN;

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS evidence_image_urls TEXT[] DEFAULT '{}';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS handler_id UUID;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS contact_info TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'complaints_handler_id_fkey'
    ) THEN
        ALTER TABLE complaints
            ADD CONSTRAINT complaints_handler_id_fkey
            FOREIGN KEY (handler_id) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMIT;
