# 证书签发外键约束错误修复

## 错误信息
```
insert or update on table "certificates" violates foreign key constraint 
"certificates_manager_id_fkey" on table "certificates"
```

## 问题分析

**本质原因：** 签发证书时使用的 `manager_id`（当前登录管理员的 ID）在 `profiles` 表中不存在或已被删除。

**可能的原因：**
1. ❌ 当前登录的管理员用户已被删除
2. ❌ sessionStorage 中存储的 user.id 无效
3. ❌ 管理员账户从未正确创建

## 诊断步骤

### 第 1 步：查看当前所有管理员
```bash
npm run list:admins
```

**检查清单：**
- ✅ 是否显示至少 1 个管理员账户？
- ✅ 每个管理员都有密码哈希（不是 NULL）？
- ✅ 当前登录的用户在列表中吗？

### 第 2 步：检查浏览器 sessionStorage

打开浏览器开发工具（F12）→ 应用 → Storage → sessionStorage，查看：
```javascript
{
  "id": "xxx-xxx-xxx",  // 应该是有效的 UUID
  "username": "hank.wang@nihplod.cn",
  "full_name": "Hank Wang",
  "role": "SUPER_ADMIN"
}
```

**检查清单：**
- ✅ `id` 字段是否为有效的 UUID？
- ✅ `role` 是否为管理员角色？
- ✅ 这个 ID 是否出现在 `npm run list:admins` 的输出中？

### 第 3 步：检查浏览器控制台

F12 → 控制台，查看错误消息中是否有 `Manager ID validation failed` 的日志。

## 解决方案

### 方案 A：重新初始化默认管理员（推荐）

```bash
npm run init:admins
```

这会创建或更新所有默认管理员账户：
- `hank.wang@nihplod.cn` / `hank`
- `walter@nihplod.cn` / `walter123`

然后：
1. **退出当前账户**：点击侧边栏用户头像 → 退出
2. **重新登录**：使用上述任一账户登录
3. **重试证书签发**：回到证书页面重新核发

### 方案 B：检查并修复数据库

如果 `npm run init:admins` 不成功，可能是数据库连接问题：

1. **检查 .env.local**
   ```bash
   # .env.local 应该有：
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=xxx
   ```

2. **通过 Supabase 控制台直接查询**
   - 打开 Supabase 项目控制台
   - SQL Editor
   - 运行：
   ```sql
   SELECT id, username, full_name, role, password_hash FROM profiles WHERE role IN ('SUPER_ADMIN', 'AUDITOR', 'MANAGER');
   ```
   - 确认管理员账户存在且有密码哈希

### 方案 C：如果想保留当前管理员（高级）

如果不想重新初始化默认管理员，可以直接在 Supabase 控制台验证：

1. 获取当前登录用户的 ID（从浏览器 sessionStorage）
2. 运行 SQL 查询验证此 ID 是否存在：
   ```sql
   SELECT * FROM profiles WHERE id = 'your-uuid-here';
   ```
3. 如果返回结果为空，说明用户已被删除，需要重新创建或使用其他管理员账户

## 验证修复成功

修复后验证：

1. **运行诊断命令**
   ```bash
   npm run list:admins
   ```
   ✅ 应该显示所有管理员及其密码哈希

2. **重新登录**
   - 确保当前登录的管理员 ID 在列表中
   - 浏览器 sessionStorage 中有有效的 user.id

3. **测试证书签发**
   - 进入 `/workbench/certificates`
   - 选择一个 PENDING 状态的证书
   - 点击"审核通过"
   - ✅ 应该成功（不再出现外键约束错误）

## 预防措施

### 避免删除正在使用的管理员
1. 不要删除当前登录的用户
2. 删除管理员前，确保没有证书正在等待他做最终签发
3. 如果必须删除，先完成所有待审批的证书

### 保持管理员账户健康
```bash
# 定期检查管理员列表
npm run list:admins

# 如果账户缺失或损坏，重新初始化
npm run init:admins
```

## 相关文件修改

已更新的文件：
- ✅ `/app/api/certificates/route.ts` - 添加 manager_id 验证
- ✅ `/app/workbench/certificates/page.tsx` - 添加前端调试日志

这些修改会提供更清晰的错误消息，帮助快速诊断问题。

## 常见问题

### Q: 为什么签发失败但没有明显错误？
**A:** 检查浏览器控制台是否有日志 `Manager ID validation failed`，这表示当前用户不在数据库中。

### Q: 重新初始化后是否需要重启开发服务器？
**A:** 不需要。只需在浏览器中重新登录即可。如果还是有问题，可以重启 `npm run dev`。

### Q: 我能删除 hank.wang 管理员吗？
**A:** 可以，但确保：
1. 没有待审批的证书
2. 你有其他管理员账户可用
3. 在 `scripts/initDefaultAdmins.mjs` 中移除该账户信息

---

需要进一步帮助？检查：
1. 浏览器控制台（F12）的错误日志
2. API 响应体中的具体错误信息
3. `npm run list:admins` 的输出
