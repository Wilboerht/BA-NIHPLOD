-- 2026-05-26: 将现有管理员的 username（邮箱格式）同步到空的 email 字段
-- 用于修复邮件通知查询不到收件人的问题

UPDATE profiles
SET email = username
WHERE email IS NULL
  AND username IS NOT NULL
  AND username LIKE '%@%';
