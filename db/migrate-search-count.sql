-- 搜索计数功能：certificates 表新增 search_count 列
-- 执行方式：sudo -u postgres psql -d ba_nihplod_db -f db/migrate-search-count.sql
-- 影响范围：仅新增列（默认值 0），不修改现有数据

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS search_count INT DEFAULT 0;
