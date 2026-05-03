-- 修复 user_role 枚举缺失 MANAGER 和 PROJECT_MANAGER 的问题
-- PostgreSQL 不支持直接修改 ENUM，需要重建

BEGIN;

-- 1. 创建新枚举类型
CREATE TYPE user_role_new AS ENUM ('SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER', 'DEALER');

-- 2. 修改表字段类型
ALTER TABLE profiles 
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role TYPE user_role_new 
    USING role::text::user_role_new,
  ALTER COLUMN role SET DEFAULT 'DEALER';

-- 3. 删除旧枚举
DROP TYPE user_role;

-- 4. 新枚举重命名为旧名
ALTER TYPE user_role_new RENAME TO user_role;

COMMIT;

-- 注意：如果 profiles 表中有 role 为 MANAGER 或 PROJECT_MANAGER 的数据，
-- 但由于旧枚举不包含这些值，实际上数据库中不可能存在。
-- 此迁移确保 schema 与代码逻辑一致。
