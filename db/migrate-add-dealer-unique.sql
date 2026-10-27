-- ============================================================================
-- 修复竞态条件：为 dealers 表添加 (phone, company_name) 唯一约束
-- 这样 getOrCreateDealer 可以用 INSERT ... ON CONFLICT 安全地处理并发
-- ============================================================================
-- 安全策略（2026-10-27 修订）：
--   1. 如果重复 dealer 名下有证书，禁止自动删除（避免 ON DELETE CASCADE 丢证书）
--      迁移会直接报错，要求人工把证书重挂到保留的 dealer 后再执行
--   2. 只有确认没有证书引用的重复 dealer 才会被删除
--   3. 最后创建唯一索引
-- ============================================================================

BEGIN;

DO $$
DECLARE
    duplicate_groups INT;
    certificates_on_duplicates INT;
BEGIN
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
        SELECT phone, company_name
        FROM dealers
        GROUP BY phone, company_name
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_groups > 0 THEN
        SELECT COUNT(*) INTO certificates_on_duplicates
        FROM certificates c
        JOIN dealers d ON c.dealer_id = d.id
        JOIN (
            SELECT phone, company_name
            FROM dealers
            GROUP BY phone, company_name
            HAVING COUNT(*) > 1
        ) duplicates
          ON d.phone IS NOT DISTINCT FROM duplicates.phone
         AND d.company_name = duplicates.company_name;

        IF certificates_on_duplicates > 0 THEN
            RAISE EXCEPTION
                '检测到重复 dealer 名下有 % 张证书。为避免级联删除证书，迁移已中止；请先把证书重挂到保留的 dealer，再执行本迁移。',
                certificates_on_duplicates;
        END IF;
    END IF;
END $$;

-- 只删除没有证书引用的重复记录（保留最早创建的）
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY phone, company_name ORDER BY created_at ASC) AS rn
    FROM dealers
)
DELETE FROM dealers d
WHERE d.id IN (SELECT id FROM duplicates WHERE rn > 1)
  AND NOT EXISTS (
      SELECT 1 FROM certificates c WHERE c.dealer_id = d.id
  );

-- 添加唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_dealers_phone_company ON dealers(phone, company_name);

COMMIT;
