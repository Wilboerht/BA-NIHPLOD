# 📋 服务器部署检查清单

## 🔍 检查时间：2026年4月14日

---

## ✅ 已完成（双引擎支持完整）

### 数据库适配层
- [x] `lib/db.ts` - 15个方法完整支持 PostgreSQL + Supabase 双引擎
  - `findProfileForLogin()` ✓
  - `getProfileById()` ✓
  - `checkIsAdmin()` ✓
  - `getDealersByProfileId()` ✓
  - `getDealerById()` ✓
  - `getAllDealers()` ✓
  - `getCertificatesByDealerId()` ✓
  - `getPendingCertificates()` ✓
  - `getActiveIssuedCertificatesCount()` ✓
  - `getAllComplaints()` ✓
  - `getPendingComplaints()` ✓
  - `getPendingComplaintsCount()` ✓
  - `getDashboardStats()` ✓

### 存储适配层
- [x] `lib/storage.ts` - 支持本地/Supabase 切换
  - `uploadFile()` ✓
  - `getPublicUrl()` ✓

### API 路由（无硬编码 Supabase）
- [x] `/api/db/dealers`
- [x] `/api/db/dealers/[dealerId]/certificates`
- [x] `/api/db/profiles/[profileId]/dealers`
- [x] `/api/db/certificates/pending`
- [x] `/api/db/complaints`
- [x] `/api/db/stats`

### 组件迁移
- [x] `components/DealerPanel.tsx` - 使用 `/api/db/*`
- [x] `app/workbench/dealers/page.tsx` - 使用 `/api/db/*`

---

## ⚠️ 需要修复（仍硬编码 Supabase）

### 🔴 高优先级 - API 路由（生产环境必须修复）

#### 1. `app/api/auth/complete-first-login/route.ts`
**问题**：直接创建 Supabase 客户端
```typescript
const supabaseAdmin = createClient(...) // 仅 Supabase
await supabaseAdmin.from("profiles").update(...)
```
**修复**：使用 `lib/db.ts` 的适配方法

#### 2. `app/api/auth/change-password/route.ts`
**问题**：直接创建 Supabase 客户端
**修复**：添加本地 PostgreSQL 支持

#### 3. `app/api/admin/ban-user/route.ts`
**问题**：使用 `createAdminClient()`、`checkIsAdmin()` 硬编码 Supabase
**修复**：使用 `lib/db.ts` 的 `checkIsAdmin()`

#### 4. `app/api/dealer/certificates/route.ts`
**问题**：完整 API 路由使用 Supabase 客户端
**修复**：改用 `/api/db/*` 端点或使用 lib/db.ts

---

### 🔴 中优先级 - 页面和组件（生产环境应迁移）

#### 5. `app/workbench/layout.tsx`
**问题**：导入并使用 `supabase` 客户端
```typescript
import { supabase } from "@/lib/supabase";
```
**修复**：改用 sessionStorage 管理用户会话，或创建 `/api/auth/session` 端点

#### 6. `app/workbench/complaints/page.tsx`
**问题**：导入并使用 `supabase` 客户端
**修复**：迁移至 API 端点 `/api/db/complaints`

---

### 🟡 低优先级 - 服务器操作（需要改进但可短期使用）

#### 7. `app/actions.ts`
**问题**：`submitComplaintAction()` 仅支持 Supabase
```typescript
const supabaseAdmin = createClient(...) 
await supabaseAdmin.from('complaints').insert(...)
```
**修复**：添加本地数据库支持，或创建 `/api/complaints/submit` 端点

---

### 🟡 配置和脚本（开发/初始化用，生产可选）

#### 已识别的 Supabase 依赖
- `lib/supabase.ts` - 客户端库（可保留用于某些场景）
- `lib/supabase-admin.ts` - 仅 Supabase 操作
- `scripts/*` - 初始化脚本（仅开发用）

---

## 📝 环境变量配置

### 开发环境（Supabase 模式）
```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://yzrsdpitnajpmqgykcaa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
# 不设置 DATABASE_PROVIDER，或显式设置
# DATABASE_PROVIDER=supabase
```

### 生产环境（纯 PostgreSQL 模式）
```bash
# 服务器 .env.local
DATABASE_PROVIDER=local
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
# 不需要 Supabase 变量
```

---

## ✨ 修复优先级和时间估算

| 优先级 | 文件 | 工作量 | 影响范围 |
|------|------|--------|---------|
| 🔴 P0 | `app/api/auth/complete-first-login/route.ts` | 10 分钟 | 首次登录功能 |
| 🔴 P0 | `app/api/admin/ban-user/route.ts` | 15 分钟 | 管理功能 |
| 🔴 P0 | `app/api/dealer/certificates/route.ts` | 20 分钟 | 经销商证书查看 |
| 🟡 P1 | `app/workbench/layout.tsx` | 20 分钟 | 工作台认证 |
| 🟡 P1 | `app/workbench/complaints/page.tsx` | 15 分钟 | 投诉管理页面 |
| 🟡 P2 | `app/api/auth/change-password/route.ts` | 15 分钟 | 密码修改功能 |
| 🟡 P2 | `app/actions.ts` | 20 分钟 | 投诉提交功能 |

**总时间估算**：~115 分钟（约 2 小时）

---

## 🚀 修复步骤

1. ✅ 创建 `/api/db/sessions` 端点（用于 workbench 认证）
2. ⏳ 修复 `app/api/auth/complete-first-login/route.ts`
3. ⏳ 修复 `app/api/admin/ban-user/route.ts`
4. ⏳ 重构 `app/api/dealer/certificates/route.ts`
5. ⏳ 迁移 `app/workbench/layout.tsx` 到 sessionStorage + `/api/db/sessions`
6. ⏳ 迁移 `app/workbench/complaints/page.tsx` 到 `/api/db/complaints`
7. ⏳ 修复 `app/api/auth/change-password/route.ts`
8. ⏳ 改进 `app/actions.ts` 的 `submitComplaintAction()`
9. ✅ 最终编译和测试

---

## 📌 关键要点

- ✅ 所有 **API 路由** 必须支持双引擎或不依赖 Supabase
- ✅ 所有 **页面和组件** 应通过 API 获取数据
- ⚠️ 避免在客户端导入 `@supabase/supabase-js`
- ⚠️ 避免在 API 路由中创建 Supabase 客户端
- ✅ 使用 `lib/db.ts` 和 `lib/storage.ts` 作为唯一的数据访问入口
