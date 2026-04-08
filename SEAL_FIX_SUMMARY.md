# 印章功能修复方案 - 完整文档

## 问题陈述

**用户反馈**："为什么我上传的印章到核发之后下载看到的是默认的章，并不是我上传的章？"

**表现**：
- 创建证书时，用户成功上传一个自定义印章
- 在 Canvas 预览中，看到正确显示的自定义印章
- 点击签发/核发后，证书被保存到数据库
- 下载或重新查看该证书时，显示的是**模板默认的公章**，而不是用户上传的自定义印章

## 根本原因分析

### 数据流追踪

```
用户上传印章 sealImage (File)
    ↓
CertificateGenerator 读取为 Data URL (base64)
    ↓
sealImage 状态被设置为 Data URL
    ↓
Canvas 调用 loadImage(sealImage) 加载印章图片 ✓
    ↓
Canvas 绘制所有内容，包括印章 ✓
    ↓
handleSubmit() 调用 canvas.toDataURL("image/png") ✓ 
    → certImageDataUrl (完整证书图片，含印章)
    ↓
POST /api/certificates 
    certData {
      certImageDataUrl: "data:image/png;base64,...", // 完整证书
      sealImage: "data:image/png;base64,..."         // 原始上传的印章
    }
    ↓
API 接收到两个 Data URL ✓
    ↓
uploadCertificateImage(certImageDataUrl) 
    → 保存完整证书到 Storage
    → final_image_url ✓
    ↓
❌ 问题：sealImage 这个 Data URL 没有被单独保存
    ↓
数据库保存：
  final_image_url: "https://...storage.../BAVP-2024-XXXX.png" ✓
  seal_url: NULL ❌ （没有字段！原设计没有考虑）
  ↓
下载/查看时：
  Code: sealImage = cert.templates?.stamp_url || "/default-seal.svg"
  ↓
❌ 读取模板的默认印章，用户的自定义印章丢失！
```

### 为什么是这个设计？

1. **不完全实现**：
   - API 接收了 sealImage（用户上传的自定义印章的 Data URL）
   - 但 certificates 表中**没有字段来存储它**
   - sealImage 只在本次 Canvas 渲染中使用，之后就丢失了

2. **降级逻辑不完整**：
   - 设想是：如果用户上传了自定义印章，就用自定义的；否则用模板的
   - 但实现只有后半部分：`templates.stamp_url || "/default-seal.svg"`
   - 没有地方条件保存自定义印章的 URL

3. **数据库设计遗漏**：
   - templates 表有 `stamp_url`（模板默认印章）
   - certificates 表有 `final_image_url`（完整证书图片）
   - 但**没有字段单独跟踪用户自定义印章**

## 修复方案

### 1. 数据库层修改

**添加 seal_url 字段到 certificates 表**

```sql
ALTER TABLE certificates 
ADD COLUMN seal_url TEXT DEFAULT NULL;
```

**意义**：
- final_image_url：完整的证书图片（已渲染了印章）
- seal_url：**NEW** 用户上传的自定义印章 URL（用于重新编辑时恢复）

### 2. API 层修改

**新增 uploadSealImage() 函数**

位置：`app/api/certificates/route.ts` 第 95-134 行

功能：
```typescript
async function uploadSealImage(
  supabaseAdmin: any,
  certNumber: string,
  sealImageDataUrl: string
): Promise<string> {
  // 1. 检查是否有印章数据
  // 2. 如果是 Data URL（用户上传），转换为 Blob 上传到存储
  // 3. 返回公开 URL
  // 4. 如果是已有 URL（模板默认），直接返回
  // 5. 失败时返回空字符串（降级处理）
}
```

**修改 approve_issue 流程**

在核发时同时上传印章：

```typescript
// 直接签发flow
if (certData.sealImage) {
  sealUrl = await uploadSealImage(supabaseAdmin, certNumber, certData.sealImage);
}

const { data: newCert } = await supabaseAdmin.from('certificates').insert({
  // ... 其他字段 ...
  final_image_url: finalImageUrl,  // 完整证书图片
  seal_url: sealUrl,               // NEW 用户印章 URL
  // ... 其他字段 ...
});

// PENDING → ISSUED flow
if (certId && certData?.certImageDataUrl) {
  const finalImageUrl = await uploadCertificateImage(...);
  let sealUrl = '';
  if (certData.sealImage) {
    sealUrl = await uploadSealImage(...);  // NEW 上传印章
  }
  
  await supabaseAdmin.from('certificates').update({ 
    final_image_url: finalImageUrl,
    seal_url: sealUrl  // NEW 保存印章 URL
  }).eq('id', certId);
}
```

### 3. 前端层修改

**优先级逻辑**

在查看/编辑证书时，加载印章时使用优先级：

```typescript
// 优先级：用户上传的 > 模板默认的 > 系统默认 > 降级
sealImage: cert.seal_url || (cert.templates as any)?.stamp_url || "/default-seal.svg"
```

**修改位置**：
- `app/workbench/certificates/page.tsx` (查看已发行/已过期证书)
- `components/DealerModalPanel.tsx` (经销商查看自己的证书)
- `app/workbench/dealers/page.tsx` (管理员查看经销商的证书)

**TypeScript 类型**

在 Certificate 接口中添加可选字段：

```typescript
interface Certificate {
  // ... 其他字段 ...
  final_image_url?: string;
  seal_url?: string;  // NEW
  // ... 其他字段 ...
}
```

**数据库查询**

修改 select 语句以包含新字段：

```typescript
.select('*, dealers(...), templates(...), seal_url')
//                                                    ^^^^^^^^ NEW
```

## 修复覆盖范围

### 文件修改清单

| 文件 | 行号 | 修改内容 |
|------|------|---------|
| db/schema.sql | 52 | ADD COLUMN seal_url TEXT |
| app/api/certificates/route.ts | 95-134 | ADD uploadSealImage() function |
| app/api/certificates/route.ts | 245-247 | saveSealUrl in approve_issue |
| app/api/certificates/route.ts | 265-275 | saveSealUrl in PENDING→ISSUED |
| app/workbench/certificates/page.tsx | 43 | ADD seal_url to select |
| app/workbench/certificates/page.tsx | 230, 256 | USE cert.seal_url with fallback |
| components/DealerModalPanel.tsx | 18-32 | ADD seal_url to Certificate interface |
| components/DealerModalPanel.tsx | 150, 236 | USE cert.seal_url with fallback |
| app/workbench/dealers/page.tsx | 402 | ADD seal_url to select |
| app/workbench/dealers/page.tsx | 547 | USE cert.seal_url with fallback |

### 新增文件

- `scripts/migrate-seal-url.sql` - 数据库迁移脚本
- `SEAL_FIX_TEST_GUIDE.md` - 完整测试指南

## 验证清单

### 构建验证
- ✅ `npm run build` 成功 (13.3s)
- ✅ 无 TypeScript 编译错误
- ✅ 无类型检查错误

### 数据库验证
- ⏳ 需要执行 SQL 迁移（手动在 Supabase 执行）
- ⏳ 验证 seal_url 列已创建

### 功能测试
- ⏳ 直发 + 自定义印章（测试 1）
- ⏳ 查看已发行证书显示自定义印章（测试 2）
- ⏳ 没有自定义印章时降级到默认（测试 4）

## 与现有系统的兼容性

### 不破坏现有功能
- ✓ RLS policies 不需要改动
- ✓ 现有证书 seal_url 为 NULL，自动降级到 stamp_url（向后兼容）
- ✓ 不影响登录、验证、下载等其他功能
- ✓ Storage permissions 无需改动（已有 write 权限）

### 存储优化
- seals/ 文件夹每个证书最多 1 个 seal 文件
- 与现有 certificates/ 文件夹分开管理
- 便于后续清理或备份

## 下一步

1. **立即行动**
   - 在 Supabase SQL Editor 执行 `scripts/migrate-seal-url.sql`
   - 验证迁移成功

2. **部署**
   - 部署已修改的代码（已构建成功）
   - 重启或重新部署应用

3. **测试**
   - 按 `SEAL_FIX_TEST_GUIDE.md` 中的步骤执行测试
   - 记录任何问题或异常

4. **验收**
   - 用户确认初次上传的自定义印章现在能正确显示
   - 下载证书文件验证印章已包含
   - 没有其他功能受影响

## 常见问题

**Q: 覆盖现有的旧证书吗？**
A: 不覆盖。旧证书的 seal_url 为 NULL，查看时自动降级到 templates.stamp_url（就和现在一样）。

**Q: 用户能上传多个印章吗？**
A: 不能。一个证书对应一个 seal_url。如果想更新印章，需要重新创建证书。

**Q: 上传失败会怎样？**
A: uploadSealImage() 失败时返回空字符串，seal_url 为 NULL，自动降级到默认印章。证书仍能保存，不影响签发。

**Q: 存储容量会增加多少？**
A: 每个自定义印章通常 10-50KB，比完整证书( >100KB)少很多。存储压力不大。

**Q: 能删除一个证书的印章吗？**
A: 目前代码中没有删除接口。如需删除，需要在 API 中添加 PUT/PATCH 端点来清空 seal_url。

---

**修复状态**：✅ **已实施**
**代码编译**：✅ **成功**（npm run build）
**数据库迁移**：⏳ **待执行**（需要手动 SQL）
**功能测试**：⏳ **待执行**（按测试指南）
**生产就绪**：⏳ **待验收**

