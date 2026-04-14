# 证书图片上传功能完整分析

## 🎯 功能设计目的

**为什么要上传证书图片？**

证书系统是一个**数字化授权验证平台**，需要生成官方认可的数字证书供三方使用：
1. **内部管理** - 工作台管理员审核、归档、修改
2. **经销商自用** - 下载证书用于宣传、营销
3. **公众查证** - 通过二维码或证书号验证真伪

---

## 🔄 完整的数据流程

```
                            流程                        技术实现
┌─────────────────────────────────────────────────────────────────┐
│ 1️⃣  证书生成                                                   │
│  目的: 生成官方授权证书的图形                                     │
│  发起: 管理员或审核员                                            │
│  技术: HTML Canvas → PNG 图片 (Data URL)                        │
│  组件: CertificateGenerator.tsx                                 │
│  输出: certImageDataUrl (Data URL 格式)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2️⃣  提交证书数据                                               │
│  目的: 将生成的证书和元数据发送到后端                             │
│  流程:                                                          │
│    a) 点击 "签发授权" 或 "确认修改"                             │
│    b) 提取 Canvas 转为 Data URL                                │
│    c) 准备证书数据: {                                           │
│       platformId, shopName, duration,                           │
│       authorizer, sealImage, certImageDataUrl                   │
│     }                                                           │
│  API: POST /api/certificates                                   │
│  请求体: { action, certData, managerId, certId }               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3️⃣  后端处理和上传                                             │
│  目的: 验证数据、上传图片、保存到数据库                           │
│  步骤:                                                          │
│    a) 身份验证 (确认是管理员)                                    │
│    b) 生成证书编号 (BAVP-YYYY-XXXX)                            │
│    c) 上传证书图片:                                             │
│       - 转换 Data URL → Blob → Buffer                          │
│       - 调用 uploadFile() 函数                                  │
│       - 存储到 Supabase Storage 或本地文件系统                   │
│    d) 获取公开 URL:                                             │
│       - final_image_url = getPublicUrl()                        │
│    e) 保存证书记录:                                             │
│       - INSERT/UPDATE certificates 表                          │
│       - 字段: cert_number, dealer_id, final_image_url,         │
│               status, start_date, end_date, seal_url           │
│  状态转移:                                                      │
│    - create_pending: 状态 = PENDING (待审核, 可无图片)            │
│    - approve_issue: 状态 = ISSUED (已核发, 可无图片)             │
│    - update: 可修改图片和其他信息                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           │ 数据库保存              ↓
           │
      certificates 表
      {
        id: UUID
        cert_number: "BAVP-2026-1234"
        dealer_id: UUID
        final_image_url: "https://storage.../BAVP-2026-1234-timestamp.png"
        seal_url: "" (自定义印章, 可选)
        status: "ISSUED" | "PENDING"
        start_date: "2026-04-14"
        end_date: "2027-04-14"
        auth_scope: "识别码 | 授权范围 | 颁发机构"
        created_at: timestamp
      }
```

---

## 👥 使用方 (谁用这些图片?)

### 1️⃣ **工作台管理员** (SUPER_ADMIN, PROJECT_MANAGER, AUDITOR)

**访问位置**: `/workbench/dealers` 和 `/workbench/certificates`

**操作流程**:
```typescript
// 在经销商管理页面
1. 查看某经销商的证书 → 点击 "查看证书"
2. 弹窗打开证书列表
3. 对每个证书，可以:
   a) 点击 "调阅" → 打开 CertificateGenerator 组件 (view 模式)
   b) 点击 "修改" → 打开 CertificateGenerator 组件 (edit 模式)
   c) 可以下载 PNG / PDF

// 在证书审核工作台
1. 查看所有待审核证书列表
2. 点击 "调阅档案" → 打开证书查看器
3. 可以看到或重新生成证书图片
```

**查看的数据来源**:
```
final_image_url → 从数据库读取 → 在 img 标签中显示 或 CertificateGenerator 中显示
```

**代码位置**: 
- `app/workbench/dealers/page.tsx` (第 456-510 行) - 证书浮窗
- `app/workbench/certificates/page.tsx` - 证书审核工作台

---

### 2️⃣ **经销商用户** (DEALER)

**访问位置**: 首页 (`/`) → 经销商浮动模态框

**操作流程**:
```typescript
1. 登录为经销商 (使用手机号)
2. 首页模态框自动打开
3. 显示自己名下的所有证书
4. 对每个证书可以:
   a) 点击 "查看/下载" → 显示证书高清图片
   b) 右键保存图片 或 点击下载按钮 → 保存为 PNG
```

**查看的数据来源**:
```
GET /api/dealer/certificates → 获取该经销商的证书列表
response.final_image_url → 在浏览器中显示或下载
```

**代码位置**: 
- `app/page.tsx` (经销商模态框) - 需查看具体代码
- `app/api/dealer/certificates/route.ts` - API 端点

---

### 3️⃣ **公众用户** (任何人)

**访问位置**: `/verify?cert=BAVP-YYYY-XXXX` (通过二维码扫描)

**使用场景**: 
- 消费者扫描证书上的二维码 → 跳转到验证页面
- 或者直接输入证书编号验证

**操作流程**:
```typescript
1. 访问 /verify?cert=BAVP-2026-1234
2. 后端查询证书信息 (GET /api/certificates/verify)
3. 显示证书详情:
   a) 证书号、经销商名称、电话
   b) 有效期、授权范围
   c) 证书是否有效
4. 如果 final_image_url 存在:
   - 显示证书高清预览
   - 提供下载按钮 → 点击下载为 PNG
5. 如果 final_image_url 为空:
   - 显示 "证书图片暂未生成"
```

**查看的数据来源**:
```
GET /api/certificates/verify?cert=证书编号
response.data.final_image_url → 显示或下载
```

**代码位置**: 
- `app/verify/page.tsx` - 验证页面（服务端）
- `app/verify/verify-content.tsx` - 验证页面内容（客户端）
- `app/api/certificates/verify/route.ts` - 验证 API 端点

---

## 📊 存储架构

### 存储位置

```
┌────────────────────────────────────────┐
│ 数据库: Supabase PostgreSQL            │
├────────────────────────────────────────┤
│ certificates 表                        │
│ ├─ final_image_url: 公开 URL 或空      │
│ ├─ seal_url: 自定义印章 URL 或空       │
│ └─ ...其他证书元数据                   │
├────────────────────────────────────────┤
│ dealers 表                             │
│ ├─ company_name                        │
│ ├─ phone                               │
│ └─ ...                                 │
├────────────────────────────────────────┤
│ profiles 表                            │
│ ├─ username, full_name                 │
│ └─ ...                                 │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 文件存储: 二选一                       │
├────────────────────────────────────────┤
│ 选项 A: Supabase Storage               │
│ ├─ Bucket: "certificates"             │
│ ├─ 路径: certificates/{certNum}.png    │
│ └─ URL: https://*.supabase.co/...     │
├────────────────────────────────────────┤
│ 选项 B: 本地文件系统                  │
│ ├─ 路径: public/uploads/certificates/  │
│ └─ URL: /uploads/certificates/...     │
└────────────────────────────────────────┘
```

### 双擎适配逻辑

```typescript
// lib/storage.ts

if (STORAGE_PROVIDER === 'local') {
  // 方案 A: 本地文件系统
  // 保存到 public/uploads/certificates/
  // 返回 URL: /uploads/certificates/filename.png
} else {
  // 方案 B: Supabase Storage
  // 保存到 Supabase 的 certificates 桶
  // 返回 URL: https://xxx.supabase.co/storage/v1/object/public/certificates/filename.png
}
```

---

## ⚠️ 上传失败的容错机制

### 为什么图片上传可以失败而系统继续运行？

**因为图片只是辅助信息，不是核心业务数据**

```typescript
// app/api/certificates/route.ts

// 流程 1: 审核员提报
if (action === 'create_pending') {
  try {
    finalImageUrl = await uploadCertificateImage(...);
  } catch (uploadErr) {
    console.warn('证书图片上传失败，但继续提报:', uploadErr.message);
    finalImageUrl = '';  // ← 允许为空！
  }
  // 即使上传失败，仍然继续保存证书记录到数据库
  INSERT certificates { final_image_url: '' }  // ← 空值允许
}

// 流程 2: 项目负责人核发
if (action === 'approve_issue') {
  try {
    finalImageUrl = await uploadCertificateImage(...);
  } catch (uploadErr) {
    console.warn('证书图片上传失败，但继续核发（经销商可后续生成）:', uploadErr.message);
    // 不中断，继续前进
  }
  INSERT certificates { final_image_url: finalImageUrl || '' }  // ← 可为空
}
```

### 后续补救方案

当 `final_image_url` 为空时，用户可以：

**管理员**:
- 回到工作台
- 点击证书的 "修改" 按钮
- 重新生成图片
- 点击 "确认修改" 上传

**经销商**:
- 在模态框中再次生成图片
- 下载使用

**公众**:
- 看到 "证书图片暂未生成"
- 但仍能看到证书信息 (编号、有效期、经销商等)

---

## 🏗️ 完整的代码架构

```
证书图片上传系统架构

┌─────────────────────────────────┐
│ 前端: 生成层                    │
├─────────────────────────────────┤
│ components/certificate/          │
│ └─ CertificateGenerator.tsx      │
│    ├─ renderCertificate()       │
│    │  (HTML Canvas → PNG DataURL)│
│    │                            │
│    └─ handleIssueSubmit()       │
│       (POST /api/certificates)  │
└──────────────┬──────────────────┘
               │ certImageDataUrl (Data URL)
               ↓
┌─────────────────────────────────┐
│ 后端: 处理/存储/验证层          │
├─────────────────────────────────┤
│ app/api/certificates/route.ts   │
│ ├─ POST 处理三个 action:        │
│ │  ├─ create_pending           │
│ │  ├─ approve_issue            │
│ │  └─ update_certificate       │
│ │                              │
│ ├─ uploadCertificateImage()    │
│ │  (Data URL → Blob → Buffer)  │
│ │                              │
│ └─ uploadFile()                │
│    (存储层)                     │
└──────────────┬──────────────────┘
               │ final_image_url (公开 URL)
               ↓
┌─────────────────────────────────┐
│ 存储: Supabase Storage/本地    │
├─────────────────────────────────┤
│ certificates/                   │
│ └─ BAVP-2026-1234-timestamp.png │
│    (500KB - 2MB PNG)            │
└──────────────┬──────────────────┘
               │
               ↓
┌─────────────────────────────────┐
│ 数据库: 元数据                   │
├─────────────────────────────────┤
│ certificates 表                 │
│ ├─ final_image_url (URL)        │
│ ├─ seal_url (URL)               │
│ └─ ...                          │
└──────────────┬──────────────────┘
               │
    ┌──────────┴──────────┐
    ↓                     ↓
┌──────────┐      ┌─────────────┐
│ 管理员   │      │ 经销商/公众 │
│ 工作台   │      │ 验证页面    │
└──────────┘      └─────────────┘
```

---

## 📝 关键 API 端点

| 端点 | 方法 | 功能 | 调用者 |
|------|------|------|--------|
| `/api/certificates` | POST | 提报/核发/修改证书 | 管理员、审核员 |
| `/api/certificates/verify` | POST | 验证证书真伪 | 公众、门诊 |
| `/api/dealer/certificates` | GET | 获取经销商证书列表 | 经销商 |
| `/api/db/dealers/[dealerId]/certificates` | GET | 获取经销商的证书（供管理员查看）| 管理员 |

---

## 🎯 总结

| 问题 | 答案 |
|------|------|
| **为什么有图片上传?** | 生成和保存官方数字证书，供多方使用 |
| **上传之后呢?** | 生成公开 URL，存储到数据库的 `final_image_url` 字段，供后续查看和下载 |
| **谁用了?** | 三类人: (1) 工作台管理员审核/修改, (2) 经销商下载宣传, (3) 公众通过二维码验证 |
| **为什么允许失败?** | 图片只是辅助展示，核心业务数据仍然保存，用户可后续补救 |
| **当前网络错误怎么办?** | 可改用 `STORAGE_PROVIDER=local` 使用本地文件系统 |

