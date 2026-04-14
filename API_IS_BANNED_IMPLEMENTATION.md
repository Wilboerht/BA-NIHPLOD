# 确保 /api/admin/list 返回 is_banned 字段 - 实施指南

## 📋 需求概述

确保 `/api/admin/list` 端点返回包含 `is_banned` 字段的用户数据，使前端能够正确显示账户禁用状态。

## ✅ 已完成的工作

### 1. 后端 API 端点确认 ✓

**文件**: `app/api/admin/list/route.ts`

该端点使用 `SELECT * FROM profiles` 查询，会返回所有字段**包括 `is_banned`**：

```typescript
// Supabase 模式
const { data, error } = await supabaseAdmin
  .from('profiles')
  .select('*')  // ← 返回所有字段
  .neq('role', 'DEALER')
  .order('role', { ascending: true });

// 本地 PostgreSQL 模式
const result = await sql`
  SELECT * FROM profiles   -- ← 返回所有字段
  WHERE role != 'DEALER'
  ORDER BY role ASC
`;
```

**返回格式示例**:
```json
{
  "data": [
    {
      "id": "xxx",
      "username": "admin1",
      "password_hash": "...",
      "role": "SUPER_ADMIN",
      "is_first_login": false,
      "is_banned": false,      // ← is_banned 字段
      "created_at": "2024-01-01T00:00:00+00:00"
    }
  ]
}
```

### 2. 前端集成确认 ✓

**文件**: `app/workbench/dealers/page.tsx` (行 71-82)

前端正确使用 `is_banned` 字段进行状态映射：

```typescript
// 从 /api/admin/list 获取 profiles
const profilesResp = await fetch('/api/admin/list');
const profiles = profilesResp.ok ? await profilesResp.json().data : [];

// enriched 数据时，从 profile 对象提取 is_banned
const enriched = data.map((d: any) => {
  const profile = profiles.find((p: any) => p.username === d.phone);
  return {
    ...d,
    profile: profile || null,
    isBanned: profile?.is_banned || false,  // ← 映射 is_banned 字段
  };
});
```

### 3. 数据库 Schema 更新 ✓

**文件**: `db/schema.sql` (行 14)

已将 `is_banned` 列添加到 profiles 表定义：

```sql
CREATE TABLE profiles (
    ...
    is_banned BOOLEAN DEFAULT FALSE,  -- ← 已添加
    ...
);
```

### 4. 迁移脚本已准备 ✓

**文件**: `db/migrate-add-is-banned.sql`

用于在现有数据库中添加 `is_banned` 列的迁移脚本：

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
```

## ⚙️ 需要用户执行的步骤

### Step 1: 在 Supabase 中执行迁移脚本

1. 访问 [Supabase 控制面板](https://app.supabase.com)
2. 进入你的项目
3. 点击 **SQL Editor** → **Click "New Query"**
4. 复制以下 SQL（来自 `db/migrate-add-is-banned.sql`）：

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
```

5. 点击 **Run** 执行脚本
6. 验证输出显示"成功"

### Step 2: 确认本地开发环境

如果使用本地 PostgreSQL (`DATABASE_PROVIDER=local`)：

```bash
# 连接到本地 PostgreSQL
psql -d ba_nihplod_db

# 执行迁移脚本内容
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

# 验证列已添加
\d profiles
```

### Step 3: 验证端点返回数据

执行提供的测试脚本验证 `is_banned` 字段：

```bash
# 启动开发服务器（如果未启动）
npm run dev

# 在新终端中运行测试脚本
node scripts/test-admin-list.mjs
```

**预期输出**:
```
✅ 数据包含 is_banned 字段

📊 账户状态统计:
  • 已激活: 3
  • 已禁用: 1
```

### Step 4: 验证前端显示

1. 在浏览器中打开 `/workbench/dealers`
2. 检查被禁用的账户显示为红色背景和删除线（见下方样式部分）
3. 前端应显示"已封禁"状态

## 🎨 前端显示逻辑

在 dealers 表格中，被禁用的账户展示如下：

```typescript
// 行背景色 - 禁用账户为红色
<tr className={`${dealerGroup.isBanned ? 'bg-rose-50/30' : ''}`}>
  
  {/* 公司名称 - 被禁用时显示删除线 */}
  <td className={`${dealerGroup.isBanned ? 'text-slate-400 line-through decoration-rose-300' : ''}`}>

  {/* 账户状态 - 显示禁用/激活指示 */}
  <td>
    {dealerGroup.isBanned ? (
      <span className="text-rose-500">已封禁</span>
    ) : (
      <span className="text-emerald-600">已激活</span>
    )}
  </td>
</tr>
```

## 🔄 数据流总结

```
┌─────────────────────────────────────────────────────┐
│ 1. Supabase / PostgreSQL                            │
│    profiles 表 (is_banned 列)                        │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│ 2. 后端 API: GET /api/admin/list                   │
│    SELECT * FROM profiles WHERE role != 'DEALER'    │
│    返回: { data: [{ ..., is_banned: true/false }] } │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│ 3. 前端: app/workbench/dealers/page.tsx            │
│    - 获取 profiles                                  │
│    - 提取 profile.is_banned                         │
│    - 映射到 dealer.isBanned                         │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│ 4. 用户界面                                         │
│    显示被禁用账户为红色(bg-rose-50/30)               │
│    显示状态为"已封禁"或"已激活"                      │
└─────────────────────────────────────────────────────┘
```

## 🐛 故障排除

### 问题1: /api/admin/list 返回 500 错误

**检查项**:
- 确认 Supabase/PostgreSQL 连接正常
- 验证 `is_banned` 列已在数据库中创建
- 检查服务器日志获取详细错误信息

```bash
# 查看完整错误
npm run dev 2>&1 | grep -A 5 "admin-list"
```

### 问题2: 前端无法显示禁用状态

**排查步骤**:
1. 打开浏览器开发工具 (F12)
2. 查看 Network 标签中 `/api/admin/list` 的响应
3. 验证响应包含 `is_banned` 字段
4. 检查 Console 标签中是否有 JavaScript 错误

### 问题3: 数据库迁移失败

**常见原因和解决方案**:

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| `Column already exists` | 列已存在 | 使用 `IF NOT EXISTS` 子句（脚本已包含） |
| `Permission denied` | Supabase 权限不足 | 确保使用 Service Role Key 权限 |
| `Connection timeout` | 数据库连接问题 | 检查网络和数据库状态 |

## ✨ 完成检查列表

- [ ] 在 Supabase SQL Editor 中运行迁移脚本
- [ ] 验证本地 PostgreSQL 有 `is_banned` 列（如适用）
- [ ] 运行 `node scripts/test-admin-list.mjs` 验证端点
- [ ] 访问 `/workbench/dealers` 检查前端显示
- [ ] 禁用一个账户测试功能
- [ ] 验证禁用的账户显示为红色且状态为"已封禁"

## 📚 相关文件参考

- **API 端点**: `app/api/admin/list/route.ts`
- **数据库 Schema**: `db/schema.sql`
- **迁移脚本**: `db/migrate-add-is-banned.sql`
- **前端实现**: `app/workbench/dealers/page.tsx` (fetchData 函数)
- **测试脚本**: `scripts/test-admin-list.mjs`
- **禁用用户管理**: `app/api/admin/ban-user/route.ts`

## 🎯 验证命令

```bash
# 测试 is_banned 字段是否返回
curl http://localhost:3000/api/admin/list | \
  python3 -m json.tool | grep -A 2 "is_banned"

# 或使用 PowerShell（Windows）
curl http://localhost:3000/api/admin/list | ConvertFrom-Json | 
  Select-Object -ExpandProperty data | 
  Select-Object -First 1 | 
  Select-Object -Property username, is_banned
```

---

**更新日期**: 2026-04-14  
**状态**: ✅ 准备就绪 - 等待用户执行迁移脚本
