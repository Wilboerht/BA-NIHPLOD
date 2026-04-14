# 🚀 快速部署指南

## 5 分钟快速开始

### 开发环境 (Supabase)

```bash
# 1. 安装依赖
npm install

# 2. 配置 .env.local (使用你的 Supabase 密钥)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxxx

# 3. 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

---

### 生产环境 (本地 PostgreSQL)

#### 方案 A: Linux 服务器

```bash
# 1. 在服务器上安装 Node.js 和 PostgreSQL
sudo apt-get update
sudo apt-get install nodejs postgresql postgresql-contrib

# 2. 创建数据库
sudo -u postgres psql
postgres=# CREATE DATABASE ba_db;
postgres=# CREATE USER ba_user WITH PASSWORD 'your_password';
postgres=# ALTER ROLE ba_user SET client_encoding TO 'utf8';
postgres=# ALTER ROLE ba_user SET default_transaction_isolation TO 'read committed';
postgres=# ALTER ROLE ba_user SET default_transaction_deferrable TO on;
postgres=# ALTER ROLE ba_user SET default_transaction_deferrable TO on;
postgres=# GRANT ALL PRIVILEGES ON DATABASE ba_db TO ba_user;
postgres=# \q

# 3. 初始化数据库结构
sudo -u postgres psql -d ba_db -f db/schema.sql

# 4. 进入项目目录
cd /home/user/ba.nihplod.cn

# 5. 配置 .env.production
DATABASE_PROVIDER=local
DATABASE_URL=postgresql://ba_user:your_password@localhost:5432/ba_db

# 6. 安装依赖、编译、启动
npm ci
npm run build
npm run start

# 7. (推荐) 使用 PM2 守护进程
pm2 start "npm run start" --name "ba-production"
pm2 startup
pm2 save
```

#### 方案 B: Windows 服务器

```powershell
# 1. 确保已安装 Node.js 和 PostgreSQL
# 从 https://nodejs.org 和 https://postgresql.org 下载安装

# 2. 打开 PostgreSQL 命令行
psql -U postgres

# 在 psql 中执行:
postgres=# CREATE DATABASE ba_db;
postgres=# CREATE USER ba_user WITH PASSWORD 'your_password';
postgres=# GRANT ALL PRIVILEGES ON DATABASE ba_db TO ba_user;
postgres=# \q

# 3. 初始化数据库
psql -U postgres -d ba_db -f db/schema.sql

# 4. 进入项目目录
cd path\to\ba.nihplod.cn

# 5. 配置 .env.production
# 编辑 .env.production 文件
DATABASE_PROVIDER=local
DATABASE_URL=postgresql://ba_user:your_password@localhost:5432/ba_db

# 6. 安装、编译、启动
npm ci
npm run build
npm start

# 7. (推荐) 使用 Windows 任务计划程序设置自启
# 或使用 NSSM (Non-Sucking Service Manager) 创建 Windows 服务
nssm install ba-service "npm start"
nssm start ba-service
```

---

## 🔧 环境变量速参

### 完整的 .env.production 配置

```bash
# ===== 数据库配置 =====
DATABASE_PROVIDER=local
DATABASE_URL=postgresql://ba_user:password@localhost:5432/ba_db

# ===== 可选: Supabase (仅在需要桥接模式时) =====
# NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxxx
# SUPABASE_SERVICE_ROLE_KEY=xxxxxx

# ===== Next.js 配置 =====
# NODE_ENV=production (npm run start 时自动设置)
```

---

## ✅ 部署检查清单

### 部署前检查

```bash
# 1. 数据库连接测试
psql postgresql://ba_user:password@localhost:5432/ba_db -c "SELECT 1"
# 应该输出: 1

# 2. 编译测试
npm run build
# 应该输出: ✓ Compiled successfully in X.Xs

# 3. 检查文件夹权限
chmod -R 755 /path/to/ba.nihplod.cn/public/uploads
# 确保 public/uploads 文件夹存在且可写

# 4. 启动测试
npm run start
# 应该显示: Ready in X.Xs
```

### 部署后验证

```bash
# 1. 登录功能
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"admin","password":"admin"}'
# 应该返回: {"success":true, "token":"..."}

# 2. 数据查询
curl http://localhost:3000/api/db/stats
# 应该返回: {"total_users":..., "total_dealers":...}

# 3. 文件上传
curl -F "file=@test.jpg" http://localhost:3000/api/upload
# 应该返回: {"url":"/uploads/..."}

# 4. 检查数据库日志
tail -f /var/log/postgresql/postgresql.log
# 应该看到定期的数据库连接
```

---

## 🔄 从 Supabase 迁移到 PostgreSQL

如果你已经在 Supabase 运行，想要迁移到本地 PostgreSQL:

```bash
# 1. 导出 Supabase 数据库备份
# 在 Supabase Dashboard → Database → Backups 中下载 .sql 文件

# 2. 将数据导入本地 PostgreSQL
psql -U postgres -d ba_db -f backup.sql

# 3. 更新 .env 变量
DATABASE_PROVIDER=local
DATABASE_URL=postgresql://ba_user:password@localhost:5432/ba_db

# 4. 重启应用
npm run build
npm run start
```

---

## 🚨 故障排除

### 问题: "Connection refused"

```bash
# 原因: PostgreSQL 未运行或数据库 URL 错误

# 解决:
# 1. 检查 PostgreSQL 状态
sudo systemctl status postgresql  # Linux
get-service postgresql | Select-Object Status  # Windows PowerShell

# 2. 启动 PostgreSQL
sudo systemctl start postgresql  # Linux
Start-Service postgresql  # Windows PowerShell

# 3. 检查 DATABASE_URL 格式
# 格式: postgresql://user:password@host:port/database
echo $DATABASE_URL
```

### 问题: "Permission denied" 写入文件

```bash
# 原因: /public/uploads 文件夹权限不足

# 解决:
mkdir -p /path/to/ba.nihplod.cn/public/uploads
chmod 755 /path/to/ba.nihplod.cn/public/uploads
chown -R www-data:www-data /path/to/ba.nihplod.cn  # 如果用 www-data 用户运行
```

### 问题: "ENOENT: no such file or directory"

```bash
# 原因: 某些需要的目录不存在

# 解决:
mkdir -p public/uploads
mkdir -p .next
npm run build
```

### 问题: "Database does not exist"

```bash
# 原因: 数据库未初始化

# 解决:
# 1. 创建数据库
sudo -u postgres createdb ba_db -U ba_user

# 2. 初始化结构
psql -U ba_user -d ba_db -f db/schema.sql

# 3. 验证表存在
psql -U ba_user -d ba_db -c "\dt"
# 应该看到: profiles, dealers, certificates, complaints 等表
```

---

## 📊 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| Node.js | 18.0+ | 20.x LTS |
| PostgreSQL | 12 | 15+ |
| 内存 | 512MB | 2GB+ |
| 磁盘 | 500MB | 10GB+ |
| CPU | 1 核 | 2 核+ |

---

## 🔒 生产环境最佳实践

```bash
# 1. 使用反向代理 (Nginx)
# 示例: /etc/nginx/sites-available/ba.nihplod.cn
server {
    listen 80;
    server_name ba.nihplod.cn;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # 文件上传路径
    location /uploads {
        alias /path/to/ba.nihplod.cn/public/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# 2. 启用 HTTPS (Let's Encrypt)
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d ba.nihplod.cn
```

```bash
# 3. 数据库备份定时任务
# 添加到 crontab: crontab -e
0 2 * * * pg_dump -U ba_user ba_db | gzip > /backup/ba_db_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz

# 保留最近 7 天的备份
0 3 * * * find /backup -name "ba_db_*.sql.gz" -mtime +7 -delete
```

```bash
# 4. 监控日志
# 使用 PM2 监控
pm2 monit
pm2 logs ba-production

# 使用 systemd 日志 (Linux)
journalctl -u ba-service -f
```

---

## 📞 支持

遇到问题? 检查这些文件获取更多帮助:
- [DEPLOYMENT_READY.md](../DEPLOYMENT_READY.md) - 完整部署就绪报告
- [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md) - 生产环境检查清单
- [AGENTS.md](../AGENTS.md) - 项目说明
- [README.md](../README.md) - 快速开始指南

---

**祝部署顺利!** 🎉

更新于: 2024-01-09  
状态: ✅ Production Ready
