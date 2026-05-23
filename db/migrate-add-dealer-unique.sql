-- ============================================================================
-- 修复竞态条件：为 dealers 表添加 (phone, company_name) 唯一约束
-- 这样 getOrCreateDealer 可以用 INSERT ... ON CONFLICT 安全地处理并发
-- ============================================================================

-- 先清理可能存在的重复记录（保留最早创建的）
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY phone, company_name ORDER BY created_at ASC) AS rn
    FROM dealers
)
DELETE FROM dealers
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 添加唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_dealers_phone_company ON dealers(phone, company_name);
