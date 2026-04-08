# 印章功能测试指南

## 问题背景
用户反馈：上传的自定义印章在核发/下载后不显示，而是显示默认印章。

## 根本原因
用户上传的自定义印章虽然被渲染到证书 Canvas 上并保存为完整证书图片（final_image_url），但自定义印章的 URL 没有被单独存储。当重新查看、编辑或下载证书时，系统无法恢复用户上传的自定义印章，只能使用模板提供的默认印章（templates.stamp_url）。

## 修复方案
1. **数据库层**：在 certificates 表添加 `seal_url` 字段
2. **API 层**：核发时上传自定义印章，保存 URL 到 seal_url 字段
3. **前端层**：查看/编辑证书时，优先使用 seal_url，降级到 stamp_url

## 测试步骤

### 前置条件
- ✅ 数据库迁移已执行（seal_url 列已添加）
- ✅ 代码已编译（npm run build 成功）
- ✅ 服务器已重启或部署

### 测试 1: 直发证书 + 自定义印章

**目标**：验证直发时，用户上传的自定义印章能被正确保存和使用

**步骤**：
1. 进入 `/workbench/certificates` 或 `/workbench/dealers`
2. 点击"新增证书"或"签发授权书"按钮
3. 在证书编辑器中：
   - 填写基本信息（平台ID、店铺名称、时间段等）
   - 点击"上传印章"，选择一个图片文件（PNG/JPG，推荐 200x200px）
   - 预览中应该显示你上传的印章（而不是默认印章）
4. 点击"签发"/提交按钮
5. 确认"✅ 证书已签发"

**验证过程**：
- 检查数据库：运行 SQL 查询
  ```sql
  SELECT cert_number, seal_url, final_image_url 
  FROM certificates 
  ORDER BY created_at DESC 
  LIMIT 1;
  ```
  应该看到 `seal_url` 包含有效的对象存储 URL（形如 `https://...storage-domain.../seals/...png`）

- 检查存储：打开 Supabase -> Storage -> certificates 存储桶
  应该看到新的 `seals/BAVP-YYYY-XXXX-*.png` 文件

### 测试 2: 查看已签发证书 + 印章恢复

**目标**：验证查看已签发证书时，能读取并显示原上传的自定义印章

**步骤**：
1. 进入 `/workbench/certificates`
2. 找到上一个测试中签发的证书
3. 点击"查看证书"按钮
4. 证书详情界面显示并加载
5. **关键检查**：预览图片中应该显示你上传的自定义印章（不是默认印章）
6. 点击"下载 PNG"按钮
7. 打开下载的 PNG 文件，检查印章图片

**预期结果**：
- ✅ 预览中显示正确的自定义印章
- ✅ 下载的 PNG 文件包含正确的自定义印章
- ✅ 不是模板的默认公章

### 测试 3: 经销商重新上传更改印章

**目标**：验证可以更新印章并重新生成证书

**步骤**：
1. 以经销商身份登录（或访问 `/app/dealer` 面板）
2. 查看自己的授权书
3. 编辑印章信息（如果支持编辑）或创建新的授权申请
4. 上传不同的印章图片
5. 提交/签发
6. 查看新的证书，确认显示了新上传的印章

### 测试 4: 降级到默认印章

**目标**：验证当没有自定义印章时，系统正确降级到模板默认印章

**步骤**：
1. 创建证书时**不上传**印章（点击"跳过"或不操作上传）
2. 签发证书
3. 查看证书
4. **预期**：显示 `/default-seal.svg` 或模板中的 `stamp_url` 印章

**验证**：
- 数据库中该证书的 `seal_url` 为 NULL 或空字符串
- 显示的印章是默认的标准公章

### 测试 5: API 层验证

**目标**：直接测试 API 端点是否正确处理印章

**使用 Postman 或 curl**：

```javascript
// 测试 POST /api/certificates - 核发带自定义印章的证书
POST /api/certificates
Content-Type: application/json

{
  "action": "approve_issue",
  "certData": {
    "platformId": "test-platform",
    "shopName": "测试店铺",
    "scopeText": "品牌官方经销授权",
    "duration": "2024.01.01 - 2025.12.31",
    "authorizer": "测试公司",
    "phone": "13800000000",
    "certImageDataUrl": "data:image/png;base64,iVBORw0KGgo...", // 完整的证书 Canvas 数据
    "sealImage": "data:image/png;base64,iVBORw0KGgo..."  // 上传的自定义印章
  },
  "managerId": "user-id"
}
```

**预期响应**：
```json
{
  "success": true,
  "data": {
    "cert_number": "BAVP-2024-XXXX",
    "final_image_url": "https://...storage.../certificates/BAVP-2024-XXXX-*.png",
    "seal_url": "https://...storage.../seals/BAVP-2024-XXXX-*.png"
  }
}
```

两个 URL 都应该存在且有效。

## 故障排查

### 问题 1: 上传印章后预览中仍显示默认印章
- 检查浏览器控制台是否有 JS 错误
- 检查 `sealImage` 状态是否被正确更新（在 CertificateGenerator.tsx 中添加 console.log）
- 检查 Canvas 是否通过 `loadImage` 正确加载了印章图片

### 问题 2: cert.seal_url 返回 undefined
- 检查数据库是否成功执行了迁移（列是否存在）
- 检查 API 是否成功调用了 `uploadSealImage()` 函数
- 查看服务器日志中是否有上传失败的错误信息

### 问题 3: seal_url 列存在但始终为 NULL
- 检查 `uploadSealImage()` 函数是否正确处理了 Data URL
- 检查 Supabase Storage 权限是否允许上传到 `certificates` 存储桶的 `seals` 文件夹
- 检查 sealImage 数据是否被正确传递到 API（POST body 中检查 certData.sealImage）

### 问题 4: 下载证书时显示的还是默认印章
- 确认 CertificateGenerator 加载现有证书时，`sealImage` 被正确设置为 `cert.seal_url`（优先级）
- 检查 Canvas renderCertificate 中 `sealImg` 变量是否正确（在代码中添加 console.log）
- 验证 Canvas 最终调用 `toDataURL()` 前，印章确实被绘制了

## 成功标志

✅ **所有以下条件都满足**：
1. 直发证书时，自定义印章被正确渲染到证书图片中
2. seal_url 字段被保存到数据库
3. 查看证书时，seal_url 优先于 stamp_url 被使用
4. 下载的证书文件包含用户上传的自定义印章
5. Canvas 预览和最终下载结果一致

## 代码修改汇总

**数据库层** (`db/schema.sql`)：
- 添加 `seal_url TEXT` 列到 certificates 表

**API 层** (`app/api/certificates/route.ts`)：
- 新增 `uploadSealImage()` 函数，用于上传自定义印章
- 在 approve_issue 流程中调用 `uploadSealImage()` 并保存 URL

**前端层**：
- `app/workbench/certificates/page.tsx`：优先使用 cert.seal_url
- `components/DealerModalPanel.tsx`：优先使用 cert.seal_url
- `app/workbench/dealers/page.tsx`：优先使用 cert.seal_url
- `components/DealerModalPanel.tsx` Certificate 接口：添加 seal_url?: string

**类型定义**：
- 在所有 Certificate TypeScript 接口中添加可选的 `seal_url` 字段

## 下一步行动

1. **立即执行**：
   - 在 Supabase SQL Editor 中执行 `scripts/migrate-seal-url.sql`
   - 确认迁移成功（验证步骤见上文）
   - 重新部署或重启应用

2. **执行测试**（按顺序）：
   - 测试 1（直发 + 自定义印章）
   - 测试 2（查看 + 印章恢复）
   - 测试 3（更新印章）
   - 测试 4（降级到默认）
   - 测试 5（API 验证）

3. **收集反馈**：
   - 记录任何错误或异常行为
   - 验证最终下载结果
   - 确保不影响其他功能（RLS、权限等）

## 附录：关键代码段

### uploadSealImage 函数（API）
位置：`app/api/certificates/route.ts` 第 95-134 行

负责：
- 检查印章数据是否为 Data URL 或 URL
- 将印章上传到 Supabase Storage(`seals/` 文件夹)
- 返回公开 URL 供保存到数据库

### sealImage 优先级逻辑
位置：`app/workbench/certificates/page.tsx` 第 230/256 行

```typescript
sealImage: cert.seal_url || (cert.templates as any)?.stamp_url || "/default-seal.svg"
```

优先级：
1. cert.seal_url（用户上传的自定义印章）
2. cert.templates.stamp_url（模板默认印章）
3. "/default-seal.svg"（系统默认印章）

---

**最后更新**：2024 年
**状态**：✅ 修复已实施，待测试
**维护人**：系统
