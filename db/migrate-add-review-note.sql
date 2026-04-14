-- Migration: Add review_note column to complaints table
-- 此脚本用于更新 Supabase 或本地 PostgreSQL 中现存的 complaints 表

ALTER TABLE complaints 
ADD COLUMN IF NOT EXISTS review_note TEXT DEFAULT NULL;

-- 验证列已添加
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'complaints' AND column_name = 'review_note';
