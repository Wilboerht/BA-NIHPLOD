-- 搜索性能优化：启用 pg_trgm 扩展并创建 GIN 索引
-- 执行方式：sudo -u postgres psql -d ba_nihplod_db -f db/migrate-pgtrgm-search.sql
-- 影响范围：仅元数据（扩展+索引），不触碰任何数据行，可在线执行

-- 1. 启用三角函数模糊匹配扩展（idempotent）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 经销商公司名 trigram 索引（加速 ILIKE '%keyword%' 和 ILIKE 'keyword%'）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dealers_company_name_trgm
  ON dealers USING gin (company_name gin_trgm_ops);

-- 3. 证书授权范围公司名 trigram 索引（加速 split_part(auth_scope, ' | ', 1) ILIKE ...）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_auth_scope_company_trgm
  ON certificates USING gin (split_part(auth_scope, ' | ', 1) gin_trgm_ops);
