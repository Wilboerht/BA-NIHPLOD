-- Migration: Add is_banned column to profiles table
-- 此脚本用于更新 Supabase 或本地 PostgreSQL 中现存的 profiles 表

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- 验证列已添加
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'is_banned';
