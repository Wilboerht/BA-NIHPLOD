# 经销商-账户关联设计文档

## 核心问题

同一经销商可能拥有多个店铺名称，但它们应该共用一个账户（基于手机号）。

### 示例
```
dealer records:
- ID: 1, name: "用来测试的门店", phone: "11111111111"
- ID: 2, name: "dsfsffsfdsfdsfsa", phone: "11111111111"
- ID: 3, name: "2121212121212", phone: "2121212121212"

profiles:
- ID: a, username: "11111111111", full_name: "用来测试的门店"
- ID: b, username: "2121212121212", full_name: "2121212121212"

关联关系：
❌ WRONG: dealers.name ↔ profiles.full_name (导致同 phone 的多个dealer本应一致，却因名字不同显示不同状态)
✅ RIGHT: dealers.phone ↔ profiles.username (同一 phone 自动关联到同一 profile)
```

## 关键规则

### 1. 数据表设计

**dealers 表：**
- `id`: 唯一经销商ID
- `company_name`: 门店名称（可变，同 phone 可能有多个）
- `phone`: 手机号（关键字段，唯一标识账户）
- 其他字段...

**profiles 表：**
- `id`: 账户ID
- `username`: **手机号**（关键！这是与 dealers.phone 的唯一关联）
- `full_name`: 当前的门店名称（可选，用于显示）
- `phone`: 手机号（冗余，便于查询）
- `role`: 角色（DEALER / AUDITOR / ...）
- 其他字段...

### 2. 关联规则

```typescript
// ✅ 正确：按手机号关联
const profile = profiles.find(p => p.username === dealer.phone);

// ❌ 错误：按公司名称关联（已废弃）
const profile = profiles.find(p => p.full_name === dealer.company_name);
```

### 3. 使用场景

#### 3.1 [经销商列表] /workbench/dealers

```typescript
// 步骤1：按 phone 分组经销商
const dealersByPhone = groupBy(dealers, d => d.phone);

// 步骤2：为每组查询对应的 profile
dealersByPhone.forEach(([phone, dealerList]) => {
  const profile = profiles.find(p => p.username === phone);
  // 所有 dealerList 共用这个 profile
});
```

**显示效果：**
```
门店名称               | 登录账号    | 账户状态
用来测试的门店        | 11111111111 | ✓ 已激活
dsfsffsfdsfdsfsa      | 11111111111 | ✓ 已激活  ← 同状态！
2121212121212         | 2121212121212| ⏳ 待开启
```

#### 3.2 [证书审核] POST /api/certificates (approve_issue)

```typescript
// 关键：创建 profile 时使用 username = phone
const { data: newProfile } = await supabaseAdmin
  .from('profiles')
  .insert({
    username: certData.phone,  // ← 关键！
    full_name: certData.shopName,
    phone: certData.phone,
    password_hash: hashedPassword,
    role: 'DEALER',
    is_first_login: true
  });

// 如果 profile 已存在，仅更新密码（保留 is_first_login）
if (existingProfile) {
  await supabaseAdmin
    .from('profiles')
    .update({ password_hash: hashedPassword })
    .eq('username', phone);
}
```

#### 3.3 [登录验证] POST /api/auth/login

```typescript
// 用户输入的 username 就是手机号
const { data: profile } = await supabaseAdmin
  .from('profiles')
  .select('*')
  .eq('username', username)  // username = phone
  .single();

// 自动效果：同 phone 的所有 dealer 都可以用该 profile 登录
```

## 维护指南

### ⚠️ 常见错误及修复

**错误1：新增 dealer 后，账户状态显示为"待开启"**
- 原因：新 dealer 的 phone 没有对应的 profile，或 profile 的 username 不是该 phone
- 修复：运行 `node scripts/fixDealerProfileConsistency.mjs`

**错误2：同一 phone 的多个 dealer 显示不同的账户状态**
- 原因：使用了 `dealers.company_name ↔ profiles.full_name` 的旧关联方式
- 修复：确保所有查询都使用 `dealers.phone ↔ profiles.username`

**错误3：Account 标注的 full_name 与实际门店名称不一致**
- 原因：新增 dealer 但未更新 profile.full_name
- 修复：运行 `node scripts/fixDealerProfileConsistency.mjs --update-names`

### 验证和修复脚本

**验证数据一致性：**
```bash
node scripts/validateDealerProfileConsistency.mjs
```

输出：
- 所有 dealer-profile 的关联情况
- 问题列表（缺失 profile、不匹配等）

**自动修复：**
```bash
node scripts/fixDealerProfileConsistency.mjs
```

功能：
- 为孤立 phone 创建 profile
- 更新 profile.full_name 为最新 dealer 名称
- 确保 username = phone 的一致性

**验证修复结果：**
```bash
node scripts/validateDealerProfileConsistency.mjs
```

## 代码审查清单

提交代码涉及 dealer/profile 关联时，检查：

- [ ] 查询 profile 时使用 `username` 字段，值来自 `dealer.phone`
- [ ] 不使用 `full_name` 作为关联键
- [ ] 创建 profile 时 `username = phone`
- [ ] 更新 profile 时保留原有的 `is_first_login` 状态
- [ ] 在代码中添加注释说明"按 phone 关联"的设计
- [ ] 如果改动了数据表结构，更新本文档

## 相关文件

| 文件 | 说明 |
|-----|------|
| `app/workbench/dealers/page.tsx` | 经销商列表（按 phone 分组） |
| `app/api/certificates/route.ts` | 证书审核（创建 profile） |
| `app/api/auth/login/route.ts` | 登录验证（username = phone） |
| `scripts/validateDealerProfileConsistency.mjs` | 验证脚本 |
| `scripts/fixDealerProfileConsistency.mjs` | 修复脚本 |

## 联系方式

如有疑问，请参考相关源代码中的详细注释。
