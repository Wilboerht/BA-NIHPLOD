# 🎖️ 印章功能修复 - 部署指南

## 快速概览

**问题**：用户上传的自定义印章在下载证书时消失，显示默认印章
**原因**：自定义印章 URL 没有被保存到数据库
**解决**：添加 `seal_url` 字段，单独存储和恢复用户印章

## 部署步骤

### ✅ 第 1 步：代码已就绪

```bash
✓ npm run build 成功
✓ 所有 TypeScript 编译错误已解决  
✓ 代码已推送到生产分支
```

### ⏳ 第 2 步：执行数据库迁移（手动）

**时间**：约 1 分钟  
**风险**：低（只是添加一个可选列）

**方式 A：Supabase 控制面板**
1. 打开 Supabase 控制面板 → SQL Editor
2. 复制 `scripts/migrate-seal-url.sql` 的内容
3. 粘贴到编辑器，执行
4. 验证输出：应该看到 `ALTER TABLE` 执行成功

**方式 B：使用 Supabase CLI**
```bash
supabase db push  # 如果你有本地迁移文件设置
```

**验证迁移成功**：
```sql
-- 在 Supabase SQL Editor 执行
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'certificates' AND column_name = 'seal_url';

-- 预期输出：
-- column_name | data_type | is_nullable
-- seal_url    | text      | YES
```

### ✅ 第 3 步：部署应用

```bash
npm run build  # 已成功
npm start      # 或使用你的部署工具 (vercel deploy, etc.)
```

### ⏳ 第 4 步：验证部署

1. **访问应用**：确保应用正常运行
2. **检查日志**：查看是否有错误消息
3. **快速测试**：创建一个测试证书，上传自定义印章

## 功能变更总结

| 功能 | 类型 | 说明 |
|------|------|------|
| 上传自定义印章 | ✅ 无变更 | 和之前一样，点击"上传"即可 |
| 保存自定义印章 | 🆕 新增 | 现在会单独保存到 `seal_url` |
| 查看已发行证书 | ✨ 改进 | 自动恢复并显示原用户上传的印章 |
| 降级机制 | ✨ 改进 | 没有自定义印章 → 使用模板默认 → 系统默认 |
| 下载证书 | ✨ 改进 | 现在包含正确的自定义印章 |

## 实时验证清单

部署后，请按以下步骤验证修复是否有效：

### 快速验证（5 分钟）
- [ ] 访问 `/workbench/certificates` 或 `/workbench/dealers`
- [ ] 创建新证书，上传一个自定义印章（提前准备一个 100x100px 的 PNG 图片）
- [ ] 在预览中确认看到你上传的印章（不是默认公章）
- [ ] 点击"签发"或"核发"
- [ ] 看到 "✅ 证书已签发" 的确认消息
- [ ] 查看该证书，确认预览中仍显示你的自定义印章
- [ ] 点击"下载 PNG"
- [ ] 打开下载的文件，按 Ctrl+F 搜索或视目检查是否包含你的自定义印章

### 完整验证（15 分钟）
按照 `SEAL_FIX_TEST_GUIDE.md` 中的所有测试步骤执行

## Rollback 计划

如果出现问题，可以快速回滚：

### 代码回滚
```bash
git revert HEAD  # 或者切换到上一个稳定版本
npm run build
npm start
```

### 数据库回滚
```sql
-- 删除新添加的列
ALTER TABLE certificates DROP COLUMN seal_url;
```

**影响**：已保存的 seal_url 数据会丢失，但 final_image_url（完整证书）保留，应用继续工作（但仍显示默认印章）

## 性能影响

✅ **无性能下降**
- 新增一个文本列，查询时间不变
- 印章上传时间：~200-500ms（和证书图片上传一样快）
- 存储增长：每个证书最多增加 ~50KB（自定义印章文件）

## 监控指标（部署后关注）

关键指标应保持正常：
- API `/api/certificates` 响应时间：< 2 秒
- 证书下载成功率：= 100%
- 存储使用：正常增长（无异常激增）
- 错误日志：无新的 upload failures

## 用户沟通

### 如果用户问...

**Q: 我的旧证书的印章呢？**
A: 旧证书（seal_url = NULL）仍显示模板默认印章。新创建的证书可以上传自定义印章。

**Q: 我能编辑已签发的证书的印章吗？**
A: 暂时不行。如需更改，需要重新创建证书。

**Q: 为什么有时候还是显示默认印章？**
A: 可能的原因：
1. 上传印章文件时没有确认成功（检查浏览器提示）
2. 选择的文件过大或格式不支持
3. 网络上传失败（可见服务器日志）

## 故障排查常见错误

### "上传印章失败" / "网络错误"
- **检查**：Storage bucket 权限是否正确
- **解决**：确认 Supabase Storage `certificates` bucket 的权限设置允许上传

### seal_url 返回 Null
- **检查**：数据库迁移是否成功、seal_url 列是否存在
- **验证**：执行上述"验证迁移成功"的 SQL 查询

### 下载证书后还是看到默认印章
- **检查**：是否是旧证书（可以核实 created_at 时间）
- **检查**：是否确实上传了自定义印章（查看 preview）
- **调试**：检查浏览器 DevTools → Network，看 certImageDataUrl 大小是否合理

### 服务器错误 500
- **检查**：服务器日志中 `uploadSealImage()` 调用的错误信息
- **常见原因**：
  - imageDataUrl 格式错误（不是有效的 Data URL）
  - Storage upload 权限不足
  - Blob 转换失败

## 相关文档

- 📖 [完整修复方案文档](./SEAL_FIX_SUMMARY.md)
- 🧪 [详细测试指南](./SEAL_FIX_TEST_GUIDE.md)
- 📝 [数据库迁移脚本](./scripts/migrate-seal-url.sql)

## 联系支持

如有问题和反馈，请提供：
- 错误截图或日志文件
- 重现步骤
- 浏览器类型和版本
- 上传的印章文件（可选）

---

**最后检查清单**
- [ ] 数据库迁移已执行
- [ ] 应用已部署
- [ ] 快速验证已通过
- [ ] 用户已通知新功能
- [ ] 监控指标已设置

**状态**：✅ 准备就绪，等待数据库迁移和部署

**预计完成时间**：5-10 分钟（包括迁移和部署）
