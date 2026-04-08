# 默认管理员账户配置指南

## 📋 当前默认管理员账户

系统定义了以下默认管理员账户：

### 账户信息

| 名称 | 用户名 | 密码 | 角色 |
|------|--------|------|------|
| Hank Wang | `hank.wang@nihplod.cn` | `hank` | SUPER_ADMIN |
| Walter Li | `walter@nihplod.cn` | `walter123` | SUPER_ADMIN |

## 🔧 管理员账户管理命令

### 1. 查看所有管理员账户
```bash
npm run list:admins
```
这将显示数据库中存在的所有管理员账户，包括：
- 用户名
- 全名
- 角色
- 密码哈希状态
- 创建时间

### 2. 初始化默认管理员账户
```bash
npm run init:admins
```
这将自动创建或更新所有默认管理员账户：
- 如果账户不存在，则创建新账户
- 如果账户已存在，则更新密码和角色
- 所有账户将被标记为已初始化（not first login）

### 3. 创建单个管理员（旧脚本）
```bash
npm run create:admin
```
只创建 `hank.wang@nihplod.cn` 账户。建议使用 `npm run init:admins` 代替。

### 4. 更新单个管理员密码（旧脚本）
```bash
npm run update:admin-password
```
只更新 `hank.wang@nihplod.cn` 的密码。

## ✅ 验证默认管理员配置流程

### 步骤 1: 查看当前管理员
```bash
npm run list:admins
```

**预期输出应显示：**
- ✅ 至少 2 个管理员账户（Hank Wang 和 Walter Li）
- ✅ 所有账户都有密码哈希（不是 NULL）
- ✅ 所有账户的角色都是 SUPER_ADMIN

### 步骤 2: 如果有任何账户缺失或配置不正确
```bash
npm run init:admins
```
这将自动创建/修复所有默认账户。

### 步骤 3: 测试登录
启动开发服务器：
```bash
npm run dev
```

访问 `http://localhost:3000`，使用以下凭证之一登录：
- **账户 1**: `hank.wang@nihplod.cn` / `hank`
- **账户 2**: `walter@nihplod.cn` / `walter123`

## 🔐 密码安全提示

⚠️ **这些是默认账户，仅用于开发和测试！**

在生产环境中：
1. 修改所有默认密码
2. 使用强密码（至少 12 个字符，包含大小写、数字、特殊字符）
3. 定期更换管理员密码
4. 删除不必要的管理员账户

## 📝 添加新的管理员账户

如果需要添加新的管理员账户，编辑 `scripts/initDefaultAdmins.mjs`：

```javascript
const DEFAULT_ADMINS = [
  {
    username: 'new.admin@nihplod.cn',
    password: 'strong_password_here',
    fullName: 'New Admin Name',
    role: 'SUPER_ADMIN'  // 或 'AUDITOR', 'MANAGER'
  },
  // ... 其他账户
];
```

然后运行：
```bash
npm run init:admins
```

## 🐛 故障排除

### 问题：登录失败（"账号或密码错误"）
1. 运行 `npm run list:admins` 检查账户是否存在
2. 检查密码哈希是否为 NULL
3. 如果为 NULL，运行 `npm run init:admins` 重新初始化

### 问题：数据库连接失败
检查 `.env.local` 文件中的以下变量：
- `NEXT_PUBLIC_SUPABASE_URL` - 应该不为空
- `SUPABASE_SERVICE_ROLE_KEY` - 应该不为空

### 问题：删除管理员后无法添加新管理员
检查 `scripts/initDefaultAdmins.mjs` 中的配置是否正确。

## 📚 相关文件

- 脚本文件：
  - `scripts/listAdmins.mjs` - 查看管理员列表
  - `scripts/initDefaultAdmins.mjs` - 初始化默认管理员
  - `scripts/createAdmin.mjs` - 创建单个管理员（旧）
  - `scripts/updateAdminPassword.mjs` - 更新单个管理员密码（旧）

- API 端点：
  - `POST /api/auth/login` - 处理登录请求
  - `POST /api/admin/reset-password` - 管理员重置用户密码
  - `POST /api/admin/delete-user` - 安全删除用户账户

## 🎯 验证检查清单

在进行生产部署前，确保：
- [ ] `npm run list:admins` 显示所有预期的管理员账户
- [ ] 每个管理员账户都有密码哈希（不是 NULL）
- [ ] 所有管理员都能成功登录
- [ ] 登录后可以访问 `/workbench` 页面
- [ ] 侧边栏显示正确的用户名
- [ ] 可以访问所有管理员功能（证书审核、投诉处理等）
