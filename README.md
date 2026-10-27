# NIHPLOD Brand Authorization & Verification Platform

品牌授权及验证平台：经销商授权管理、两级审核流、证书合成与公开防伪查询。

## 技术栈

- **前端/服务端**：Next.js 16（App Router，`proxy.ts` 作为请求前置校验）+ Tailwind CSS 4
- **数据库**：PostgreSQL（运行时使用 `postgres` 原生驱动，`prisma` 仅用于 schema 工具链）
- **文件存储**：本地 `public/uploads`（由 `lib/storage.ts` 管理，仅适用于常驻磁盘的部署形态）
- **邮件**：Resend（未配置时降级为日志输出）

---

## 快速开始

```bash
npm install
cp .env.local.example .env.local   # 填写 DATABASE_URL / AUTH_SECRET / NEXT_PUBLIC_BASE_URL
npm run db:generate                # 生成 Prisma Client（lib/prisma.ts 需要，构建前也会自动执行）
psql -d ba_nihplod_db -f db/schema.sql   # 初始化数据库结构
npm run dev
```

> 使用 `docker-compose.yml` 时，数据库名为 `ba_nihplod_db`，宿主机端口为 **5433**；
> 本地直装 PostgreSQL 默认端口为 5432，请按实际环境修改 `DATABASE_URL`。

初始化管理员（可选）：

```bash
# 在 .env.local 中配置 DEFAULT_ADMINS 后执行
npm run init:admins
```

---

## 数据库

- 结构基线：`db/schema.sql`（含索引、触发器与函数）
- 增量迁移：`db/migrate-*.sql`，按文件名日期顺序执行，执行记录写入 `schema_migrations`
- 回滚脚本：`db/rollback-*.sql`
- Prisma schema：`prisma/schema.prisma`（仅用于生成客户端；生产环境禁止 `db:push`，请使用 `db/migrate-*.sql`）

迁移执行器（推荐，自动跳过已应用、失败即回滚且不记录）：

```bash
npm run db:migrate:apply -- --dry-run   # 只列出待执行
npm run db:migrate:apply                # 正式执行
```

> **生产环境禁止**：
> - `npx prisma db push`（可能改动/删除索引、约束、列）
> - 对已有库直接执行整份 `db/schema.sql`（初始化脚本，不是迁移）
> - `db/migrate-add-dealer-unique.sql` 在重复 dealer 名下有证书时会主动中止；请先把证书重挂到保留的 dealer，再执行迁移
>
> 线上变更顺序必须是：**备份 → `db:migrate:apply -- --dry-run` → 正式迁移 → 构建 → 重启**。

也可手动执行单个迁移（新迁移文件均带 BEGIN/COMMIT；手工执行时仍建议使用 `-1` 或 `ON_ERROR_STOP=1`）：

```bash
sudo -u postgres psql -d ba_nihplod_db -v ON_ERROR_STOP=1 -f db/migrate-20260925-security-fixes.sql
sudo -u postgres psql -d ba_nihplod_db -v ON_ERROR_STOP=1 -f db/migrate-20260926-audit-log-indexes.sql
```

### 时区要求（重要）

证书有效期判断在应用与数据库两侧都会用到日期，必须保持时区一致（默认均为 `Asia/Shanghai`）：

- 应用：在 `.env.local` 配置 `TZ=Asia/Shanghai`（如需其他时区同时配置 `DB_TIMEZONE`）
- 数据库：连接会通过启动参数自动设置会话时区；建议同时固定实例/数据库时区：

```sql
ALTER DATABASE ba_nihplod_db SET timezone TO 'Asia/Shanghai';
```

---

## 部署

1. 构建：`npm ci && npm run build`（`prebuild` 自动执行 `prisma generate`）
2. 启动：`npm run start`（常驻进程可用 pm2/systemd 管理）
3. **反向代理必须设置 `X-Real-IP $remote_addr`**（应用优先读取该头用于限流），且不要将应用端口直接暴露公网
4. 定时任务（建议每日一次），两种鉴权方式均可：
   ```bash
   curl -H "x-cron-secret: $CRON_SECRET" https://<域名>/api/cron/update-expired-certificates
   curl "https://<域名>/api/cron/update-expired-certificates?secret=$CRON_SECRET"
   ```

### 迁移部署（2026-09-25 安全加固 + 2026-09-26 审计索引）

先在维护窗口内备份全库并执行迁移，再发布新代码（旧代码不识别 `token_version` 等新列，顺序不能反）：

```bash
pg_dump -Fc -d ba_nihplod_db -f backup_before_deploy.dump

# 首次接入迁移 ledger：把历史上已手动执行过的迁移登记为已应用（仅登记，不执行）
npm run db:migrate:apply -- \
  --mark-applied=migrate-add-dealer-unique.sql \
  --mark-applied=migrate-pgtrgm-search.sql \
  --mark-applied=migrate-phone-optional.sql \
  --mark-applied=migrate-search-count.sql \
  --mark-applied=migrate-sync-email.sql

npm run db:migrate:apply -- --dry-run   # 确认仅剩 2026-09-25 / 2026-09-26 两个待执行
npm run db:migrate:apply                # 实际执行
```

回滚：`db/rollback-20260926-audit-log-indexes.sql`、`db/rollback-20260925-security-fixes.sql`（先回滚代码，再回滚数据库）。

部署前只读核查脚本：`scripts/pre-deploy-check.sql`。

---

## 备份（生产必做）

BA 当前是单机 PostgreSQL + 本地文件，**必须同时备份数据库和文件，并复制到异地**：

```bash
chmod 700 scripts/backup-ba-db.sh scripts/backup-ba-uploads.sh

# 数据库：/root/db-backups/ba_nihplod_db_*.dump + sha256
npm run backup:db

# 文件：public/uploads + private（证书图/PDF/证据/签名/TSA）
npm run backup:uploads
```

建议 crontab：

```cron
40 3 * * * cd /var/www/BA-NIHPLOD && npm run backup:db >> /var/log/ba-db-backup.log 2>&1
50 3 * * * cd /var/www/BA-NIHPLOD && npm run backup:uploads >> /var/log/ba-uploads-backup.log 2>&1
```

注意：

- 备份脚本默认读取 `/var/www/BA-NIHPLOD/.env.local` 的 `DATABASE_URL`；
- 备份文件默认 600，保留 30 天；
- 可设置 `BA_OFFSITE_TARGET=user@backup-host:/backup/ba/`，脚本会通过 `rsync` 自动复制到异地；
- **只备份在同一块磁盘不算备份**，必须 rsync/scp 到另一台机器、NAS 或你的电脑；
- 每季度至少做一次恢复演练，确认 `pg_restore` 和文件解压可用：

```bash
createdb -h 127.0.0.1 -U postgres ba_nihplod_restore_test
pg_restore -h 127.0.0.1 -U postgres -d ba_nihplod_restore_test \
  /root/db-backups/ba_nihplod_db_YYYYMMDD_HHMMSS.dump
psql -h 127.0.0.1 -U postgres -d ba_nihplod_restore_test \
  -c "SELECT count(*) FROM certificates;"
```

- 异地副本示例（不要只留在同盘）：

```bash
rsync -av /root/db-backups/ user@backup-host:/backup/ba/db/
rsync -av /var/backups/ba/ user@backup-host:/backup/ba/files/
```

## 安全机制

- JWT（HttpOnly Cookie，8 小时）签名校验 + 数据库二次校验（存在性、封禁状态、令牌版本）
- 首次登录必须在服务端完成改密；`is_first_login=true` 时仅放行 `/api/auth/me` 与 `/api/auth/change-password`
- 修改/重置密码后，`profiles.token_version` +1，旧 Token 立即失效（与时钟无关）
- 角色变更/封禁也会 `token_version` +1，旧会话立即失效
- 登录限流：仅统计失败次数、成功清零，5 分钟内最多 5 次失败（按 IP）
- 敏感操作限流：创建/删除账号、重置密码、封禁、证书操作、修改密码等
- 账号管理类接口仅限 `SUPER_ADMIN`（`lib/auth.ts#requireSuperAdmin`）
- 证书/投诉删除为软删除：列表移除，业务数据、证据与审计链保留
- 投诉删除（软删除）仅 `SUPER_ADMIN`；审核员只能流转状态
- 已签发证书内容不可编辑；修正必须吊销后重新签发
- 证书授权方由服务端固定为 `COMPANY_FULL_NAME`；自定义印章仅 `SUPER_ADMIN` 可提交
- `audit_logs` 为 append-only：数据库 trigger 禁止 UPDATE/DELETE；删除证书改为 `SET NULL` + `certificate_ref`
- 生产环境 `.env.local` 权限必须为 `600`；不要保留可读的重复 `.env` 配置（`DATABASE_URL` 会泄露数据库密码）
- 上传文件魔数校验 + 路径遍历防护；投诉证据仅接受站内 `/uploads/` 地址
- CSP / HSTS / X-Frame-Options 等安全响应头见 `next.config.ts`

---

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run lint` | ESLint 检查 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:migrate:apply` | 执行待应用的数据库迁移（支持 `-- --dry-run`） |
| `npm run db:push` | 仅本地临时使用；**生产禁止**，会绕过 SQL 迁移/触发器/手工索引 |
| `npm run test:e2e` | 端到端冒烟测试（必须显式 `--db` 一次性数据库 + 已启动的服务） |
| `npm run backup:db` | 备份 BA 数据库（需要 `pg_dump`，默认保留 30 天） |
| `npm run backup:uploads` | 备份 BA public/uploads + private 文件 |
| `npm run cleanup:uploads` | 清理未被引用的上传文件（默认 dry-run，加 `-- --delete` 执行；软删除投诉证据仍被引用） |
| `npm run list:admins` | 列出管理员账号 |
| `npm run init:admins` | 初始化管理员账号 |

### 冒烟测试示例

```bash
# 1. 启动服务（一次性库 + 固定 cron 密钥 + AUTH_SECRET）
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sql_test \
AUTH_SECRET=test-auth-secret-at-least-32-characters-long \
CRON_SECRET=test-cron-secret \
npm run start -- -p 3999

# 2. 另开终端执行（必须显式 --db；会清空目标库业务表，仅限本地一次性库）
npm run test:e2e -- --base http://127.0.0.1:3999 \
  --db postgresql://postgres@127.0.0.1:55432/sql_test \
  --cron-secret=test-cron-secret
```

---

© 2024-2026 NIHPLOD. All rights reserved.
