# 删除用户失败问题 - 外键约束修复

## 问题描述
删除用户时出现错误：
```
update or delete on table "profiles" violates foreign key constraint 
"certificates_manager_id_fkey" on table "certificates"
```

## 根本原因
`certificates` 表有多个外键约束指向 `profiles` 表：
- `auditor_id` → `profiles(id)` （初审人）
- `manager_id` → `profiles(id)` （终审发证人）

此外还有：
- `audit_logs.actor_id` → `profiles(id)` （审核操作人）
- `complaints.handler_id` → `profiles(id)` （投诉处理人）

数据库默认的外键行为是 **禁止删除** (RESTRICT)，如果有相关记录存在，删除用户会失败。

## 解决方案

### 方案A：修改数据库 schema（推荐）

运行迁移脚本 `db/fix-foreign-keys.sql`：
```bash
# 通过 Supabase 控制台的 SQL Editor 运行此脚本
# 或使用命令：
psql -h $DB_HOST -U postgres -d $DB_NAME -f db/fix-foreign-keys.sql
```

**效果：** 修改所有外键约束为 `ON DELETE SET NULL`
- 删除用户时，相关的证书记录会保留
- 但 `auditor_id`, `manager_id`, `actor_id`, `handler_id` 会被设为 NULL
- 数据不会丢失，用户可以安全删除

### 方案B：使用新的删除用户 API（无需修改 schema）

已创建新 API：`/api/admin/delete-user`

**工作流程：**
1. 清空该用户作为 `auditor_id` 的所有证书引用 → 设为 NULL
2. 清空该用户作为 `manager_id` 的所有证书引用 → 设为 NULL
3. 清空该用户作为 `actor_id` 的所有审核日志引用 → 设为 NULL
4. 清空该用户作为 `handler_id` 的所有投诉引用 → 设为 NULL
5. 然后安全地删除用户

**使用方式：**
已更新 `/app/workbench/users/page.tsx` 的 `deleteUser()` 函数调用新 API。

**优点：**
- 无需修改数据库 schema
- 可以在应用层控制删除逻辑
- 更灵活，可以添加额外的业务逻辑

### 方案C：软删除（最安全）

不修改现有约束，只添加 `is_deleted` 字段：

```sql
ALTER TABLE profiles ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ;
```

然后在查询时过滤 `WHERE is_deleted = FALSE`。

**优点：**
- 保留完整的审计路线
- 可以恢复删除的用户
- 不会孤立数据

**缺点：**
- 代码改动较大，需要更新所有查询

## 建议采取的步骤

1. **立即：** 使用**方案 B（新 API）**
   - API 已创建：`/api/admin/delete-user`
   - UI 已更新：`/app/workbench/users/page.tsx`
   - 无需修改数据库，立即生效

2. **长期：** 实施**方案 A（修改 schema）**
   - 运行 `db/fix-foreign-keys.sql` 脚本
   - 使删除操作更直接，减少中间层复杂性

3. **未来优化：** 考虑**方案 C（软删除）**
   - 如果需要完整的审计跟踪

## 已修改的文件

- ✅ `/app/api/admin/delete-user/route.ts` - 新的安全删除 API
- ✅ `/app/workbench/users/page.tsx` - 更新 deleteUser() 函数
- ✅ `/db/fix-foreign-keys.sql` - 数据库迁移脚本（可选）

## 测试

登录管理员账户后，在 `/workbench/users` 页面点击"删除"按钮应该可以成功删除用户了。
