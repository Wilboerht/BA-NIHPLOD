-- ============================================================================
-- 部署前只读核查脚本（安全加固 2026-09-25）
-- ============================================================================
-- 用途：在维护窗口执行迁移前，确认线上 schema 与仓库文档一致，并留存数据基线。
-- 执行方式（只读，不会修改任何数据）：
--   sudo -u postgres psql -d ba_nihplod_db -f scripts/pre-deploy-check.sql
-- ============================================================================

\echo '== 1. 数据基线（迁移前后应保持一致，cron 正式执行除外） =='
SELECT 'certificates_total' AS metric, COUNT(*)::text AS value FROM certificates
UNION ALL
SELECT 'certificates_issued_invalid', COUNT(*)::text FROM certificates WHERE status = 'ISSUED' AND end_date < CURRENT_DATE
UNION ALL
SELECT 'certificates_by_status', string_agg(status::text || ':' || cnt, ', ' ORDER BY status::text)
  FROM (SELECT status, COUNT(*) AS cnt FROM certificates GROUP BY status) s
UNION ALL
SELECT 'complaints_total', COUNT(*)::text FROM complaints
UNION ALL
SELECT 'profiles_total', COUNT(*)::text FROM profiles
UNION ALL
SELECT 'profiles_active', COUNT(*)::text FROM profiles WHERE deleted_at IS NULL
UNION ALL
SELECT 'audit_logs_total', COUNT(*)::text FROM audit_logs
UNION ALL
SELECT 'dealers_total', COUNT(*)::text FROM dealers;

\echo '== 2. schema 核查：audit_logs.complaint_id 外键的删除规则（应为 n = SET NULL） =='
SELECT conname AS constraint_name, confdeltype AS delete_rule
FROM pg_constraint
WHERE conrelid = 'audit_logs'::regclass AND contype = 'f' AND confrelid = 'complaints'::regclass;

\echo '== 3. schema 核查：新列是否存在（迁移前应为 0 行） =='
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE (table_name = 'audit_logs' AND column_name = 'complaint_ref')
   OR (table_name = 'profiles' AND column_name = 'token_version');

\echo '== 4. 证书编号抽样（迁移前后应完全一致） =='
(SELECT cert_number, status::text, start_date, end_date FROM certificates ORDER BY created_at ASC LIMIT 3)
UNION ALL
(SELECT cert_number, status::text, start_date, end_date FROM certificates ORDER BY created_at DESC LIMIT 3);

\echo '== 5. 潜在重复经销商（应为 0 行） =='
SELECT phone, company_name, COUNT(*) AS cnt
FROM dealers
GROUP BY phone, company_name
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 20;

\echo '== 6. 必查索引（应全部存在） =='
SELECT indexname FROM pg_indexes
WHERE indexname IN (
  'idx_dealers_phone_company',
  'idx_dealers_company_name_trgm',
  'idx_certificates_status_end_date',
  'idx_certificates_cert_number'
)
ORDER BY indexname;

\echo '== 7. pg_trgm 扩展（模糊搜索依赖） =='
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
