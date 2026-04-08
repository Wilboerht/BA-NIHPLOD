# 📦 Supabase Storage Buckets 设置指南

## 问题描述

在核发证书时出现错误：
```
Failed to upload certificate image: Error [StorageApiError]: Bucket not found
Failed to upload seal image: Error [StorageApiError]: Bucket not found
```

**原因**：Supabase Storage 中的 `certificates` bucket 未被创建。

---

## 解决方案

### 步骤 1：运行初始化脚本

```bash
# 从项目根目录运行
node scripts/initStorageBuckets.mjs
```

**应该看到的输出**：
```
🚀 初始化 Supabase Storage Buckets...

📋 检查现有 buckets...
   找到 0 个现有 bucket: (无)

📦 创建 certificates bucket...
✅ certificates bucket 创建成功

🔐 验证 bucket 访问权限...
✅ bucket 访问权限正常

📝 配置信息：
   Supabase URL: https://xxx.supabase.co
   Storage Bucket: certificates
   Public: true (支持 getPublicUrl 生成公开链接)
   File Size Limit: 50MB

✨ Supabase Storage Buckets 初始化完成！
   现在可以上传证书图片和签章了。
```

---

## 验证设置

运行脚本后，可以在 Supabase 控制台验证：

1. **打开 Supabase 项目**：https://app.supabase.com
2. **导航到 Storage**：左侧菜单 → Storage
3. **检查 buckets**：应该看到名为 `certificates` 的 bucket
4. **检查权限**：bucket 应该是 **Public** 状态

---

## 手动创建（如果脚本失败）

如果脚本执行失败，可以手动创建：

### 方式 A：Supabase 控制台
1. 打开 https://app.supabase.com
2. 选择你的项目
3. 左侧菜单 → **Storage**
4. 点击 **+ Create a new bucket**
5. **Bucket name**: `certificates`
6. **Make it public**: 打开开关 ✓
7. 点击 **Create Bucket**

### 方式 B：Supabase CLI
```bash
supabase storage buckets create certificates --public
```

---

## 验证证书核发

设置完成后，重新尝试核发证书：

1. 访问 `http://localhost:3000/workbench/certificates`
2. 点击"核发证书"或选择待审核的证书
3. 上传证书图片和签章
4. 点击"签发"或"核发"
5. 应该看到：
   ```
   ✅ 证书已签发
   ```
6. 检查浏览器控制台（F12），不应该再出现 `Bucket not found` 错误

---

## 常见问题

### Q: 运行脚本时出现 "Missing Supabase configuration" 错误
**A**: 检查 `.env.local` 文件：
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx
```

两个变量都需要正确设置

### Q: bucket 创建成功但上传仍然失败
**A**: 检查 bucket 的**公开权限**：
- Supabase 控制台 → Storage → certificates
- 确认右侧显示 **Public bucket**
- 如果是 Private，点击"Make public"

### Q: Service Role Key 权限不足
**A**: 确保使用的是 **Service Role Key** 而不是 anon key：
- .env.local 中 `SUPABASE_SERVICE_ROLE_KEY` 应该以 `eyJxxxx` 开头
- 不应该使用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 数据库配置

bucket 初始化完成后，`certificates` 表中的 URL 字段已准备好接收图片 URL：

| 字段 | 类型 | 说明 |
|------|------|------|
| `final_image_url` | text | 证书最终渲染图片的公开 URL |
| `seal_url` | text | 用户上传的自定义签章的公开 URL（新增） |

这些 URL 通过 `supabaseAdmin.storage.from('certificates').getPublicUrl()` 自动生成。

---

## 后续部署

设置完 storage bucket 后，就可以：

1. ✅ 核发证书并上传图片
2. ✅ 保存用户的自定义印章
3. ✅ 生成可下载的证书 PNG
4. ✅ 通过公开链接分享证书

---

## 支持

如果遇到其他问题，请检查：

- `/workbench/certificates` 页面的浏览器控制台（F12）
- 应用日志：`npm run dev` 的终端输出
- Supabase 项目日志：https://app.supabase.com → Logs

