-- 修复外键约束，支持级联删除或设置为NULL
-- 这个脚本改造外键以便安全删除用户

-- 1. 删除原有的外键约束（如果存在）
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_auditor_id_fkey;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_manager_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_handler_id_fkey;

-- 2. 重新创建外键约束，允许级联删除（或设置为NULL）
-- 选项A：级联删除（当删除用户时，相关的证书也被删除）- 谨慎使用！
-- ALTER TABLE certificates ADD CONSTRAINT certificates_auditor_id_fkey 
--   FOREIGN KEY (auditor_id) REFERENCES profiles(id) ON DELETE CASCADE;
-- ALTER TABLE certificates ADD CONSTRAINT certificates_manager_id_fkey 
--   FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE CASCADE;
-- ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey 
--   FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
-- ALTER TABLE complaints ADD CONSTRAINT complaints_handler_id_fkey 
--   FOREIGN KEY (handler_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 选项B：设置为NULL（保留证书，但清空对应的审核人/发证人）- 推荐！
ALTER TABLE certificates ADD CONSTRAINT certificates_auditor_id_fkey 
  FOREIGN KEY (auditor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE certificates ADD CONSTRAINT certificates_manager_id_fkey 
  FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey 
  FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE complaints ADD CONSTRAINT complaints_handler_id_fkey 
  FOREIGN KEY (handler_id) REFERENCES profiles(id) ON DELETE SET NULL;
