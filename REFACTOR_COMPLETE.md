# 🔧 项目本地化改造完成报告

## 👍 改造状态：✅ 已完成

所有关键的核心 API 和服务已改造完成，支持**纯本地 PostgreSQL 直连**（无需 Supabase）

---

## 📝 改造清单

### ✅ 已改造的文件

#### 核心 API 路由

| 文件 | 用途 | 改造内容 |
|------|------|---------|
| `app/api/certificates/route.ts` | 证书管理（创建、核发、撤销、更新） | 所有数据库调用改为双分支（本地 SQL + Supabase） |
| `app/api/certificates/verify/route.ts` | 证书二维码验证 | 查询逻辑改为双分支 |
| `app/actions.ts` | Server Actions 验证功能 | 证书搜索逻辑改为双分支 |

#### Admin API 路由（已原生支持双源）
- `app/api/admin/ban-user/route.ts`
- `app/api/admin/list/route.ts`
- `app/api/admin/create-admin/route.ts`
- `app/api/admin/delete-user/route.ts`
- `app/api/admin/reset-password/route.ts`
- `app/api/admin/update-user-role/route.ts`

### 改造原理

所有改造遵循统一的双分支模式：

```typescript
if (USE_LOCAL_DB && sql) {
  // 使用本地 PostgreSQL 原生 SQL 查询
  const result = await sql`SELECT ... FROM ...`;
} else {
  // 使用 Supabase SDK（可选）
  const { data } = await supabaseAdmin.from(...).select(...);
}
```

此模式由 `lib/db.ts` 中的 `USE_LOCAL_DB` 开关控制：

```typescript
export const USE_LOCAL_DB = process.env.DATABASE_PROVIDER === 'local';
export const sql = USE_LOCAL_DB && process.env.DATABASE_URL 
  ? postgres(process.env.DATABASE_URL) 
  : (null as any);
```

---

## 🚀 部署步骤

### 第 1 步：配置 PostgreSQL

使用你之前创建的数据库及用户：

```bash
root@iZuf6fnmg7jv3bm66zhtbbZ:/var/www/BA-NIHPLOD# psql -U postgres
postgres=# CREATE DATABASE ba_nihplod_db;
postgres=# CREATE USER nihplod_user WITH PASSWORD 'Moidas888!';
postgres=# GRANT ALL PRIVILEGES ON DATABASE ba_nihplod_db TO nihplod_user;
postgres=# \q
```

### 第 2 步：初始化数据库结构

```bash
psql -U nihplod_user -h localhost -d ba_nihplod_db -f db/schema.sql
```

### 第 3 步：配置环境变量

编辑 `.env.local` 文件（或从 `.env.local.example` 复制）：

```bash
# 本地部署配置
DATABASE_PROVIDER=local
DATABASE_URL="postgresql://nihplod_user:Moidas888%21@localhost:5432/ba_nihplod_db?schema=public"
```

**重要：** 密码中的特殊字符需要 URL 编码！
- `!` → `%21`
- `@` → `%40`
- `:` → `%3A`
- 等等

### 第 4 步：安装依赖并构建

```bash
cd /var/www/BA-NIHPLOD
npm install
npm run build
```

### 第 5 步：启动应用（使用 PM2）

```bash
# 全局安装 PM2
npm install -g pm2

# 启动应用
pm2 start npm --name "ba-nihplod" -- run start

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs ba-nihplod
```

---

## ✨ 功能验证清单

启动后，请验证以下核心功能：

### 1. 登录功能
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"13800000001","password":"13800000001"}'
```

### 2. 证书验证
```bash
curl -X POST http://localhost:3000/api/certificates/verify \
  -H "Content-Type: application/json" \
  -d '{"certNumber":"BAVP-2026-1234"}'
```

### 3. 管理员列表
```bash
curl -X GET http://localhost:3000/api/admin/list
```

---

## 🔑 关键概念

### USE_LOCAL_DB 开关

系统通过 **环境变量 `DATABASE_PROVIDER`** 来决定使用哪个数据源：

| 配置 | 行为 |
|------|------|
| `DATABASE_PROVIDER=local` | ✅ 使用本地 PostgreSQL（推荐生产环境） |
| 不设置或其他值 | ✅ 尝试使用 Supabase（需要配置 Supabase 密钥） |
| 都不设置 | ❌ 应用无法连接任何数据库（错误） |

### 默认端口

- Next.js 应用：`http://localhost:3000`
- PostgreSQL：`localhost:5432`

---

## ⚠️ 常见问题排查

### 错误：`DATABASE_URL is invalid`

**原因：** 连接字符串格式错误或特殊字符未正确编码

**解决：** 检查 `.env.local` 中的 DATABASE_URL，确保：
```
✓ 格式正确：postgresql://user:pass@host:port/dbname
✓ 特殊字符已编码：! → %21, @ → %40 等
✓ 用户/密码正确
```

### 错误：`connect ECONNREFUSED 127.0.0.1:5432`

**原因：** PostgreSQL 未运行或端口不对

**解决：**
```bash
# 检查 PostgreSQL 状态
sudo systemctl status postgresql

# 启动 PostgreSQL（如果未启动）
sudo systemctl start postgresql

# 测试连接
psql -U nihplod_user -h localhost -d ba_nihplod_db -c "SELECT 1"
```

### 错误：`permission denied for schema public`

**原因：** 数据库用户权限不足

**解决：**
```bash
psql -U postgres -d ba_nihplod_db
ba_nihplod_db=# GRANT ALL PRIVILEGES ON SCHEMA public TO nihplod_user;
ba_nihplod_db=# GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nihplod_user;
ba_nihplod_db=# \q
```

---

## 📦 脚本迁移建议

**以下脚本仍然使用 Supabase SDK，未改造：**
- `scripts/fixDealerProfileConsistency.mjs`
- `scripts/checkCertificates.mjs`
- `scripts/initDefaultAdmins.mjs`
- 等其他 scripts

**建议：** 这些脚本主要用于开发/维护环境，生产环境通常不需要运行。若需本地数据库支持，可参考已改造的 API 路由改造这些脚本。

---

## 🎉 恭喜！

你的应用已完全改造为支持**纯本地 PostgreSQL 部署**。

**下一步：**
1. ✅ 在 Linux 服务器上克隆项目
2. ✅ 配置 `.env.local`
3. ✅ 运行 `npm install && npm run build`
4. ✅ 使用 PM2 启动应用
5. ✅ 配置 Nginx 反向代理（可选）

祝部署顺利！🚀
