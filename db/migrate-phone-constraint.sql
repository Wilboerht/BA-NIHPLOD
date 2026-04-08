-- 迁移脚本：修复 profiles 表的 phone 唯一约束
-- 允许多个 NULL 值（部分唯一索引）

BEGIN;

-- 删除旧的 UNIQUE 约束
ALTER TABLE profiles DROP CONSTRAINT profiles_phone_key;

-- 创建部分唯一索引，只对非 NULL 值强制唯一性
CREATE UNIQUE INDEX profiles_phone_key ON profiles(phone) WHERE phone IS NOT NULL;

COMMIT;
