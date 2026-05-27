-- 迁移：将 dealers.phone 从 NOT NULL 改为可选（NULL）
-- 执行时间：2026-05-27
-- 前置条件：无

-- 1. 放宽 dealers.phone 的非空约束
ALTER TABLE dealers ALTER COLUMN phone DROP NOT NULL;

-- 2. 将已有的空字符串统一转为 NULL（清理历史数据）
UPDATE dealers SET phone = NULL WHERE phone = '';

-- 注意：idx_dealers_phone_company 唯一索引在 PostgreSQL 中天然支持多行 NULL
-- （因为 NULL != NULL），无需重建索引。
