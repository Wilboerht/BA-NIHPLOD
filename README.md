# NIHPLOD Brand Authorization & Verification Platform

品牌授权及验证平台：经销商授权管理、提报与终审流程、证书合成与公开防伪查询。

## 技术栈

- **前端/服务端**：Next.js 16（App Router，`proxy.ts` 作为请求前置校验）+ Tailwind CSS 4
- **数据库**：PostgreSQL（运行时使用 `postgres` 原生驱动，`prisma` 仅用于 schema 工具链）
- **文件存储**：本地 `public/uploads`（证书印章）与 `private/uploads`（投诉证据，管理员鉴权后访问），仅适用于常驻磁盘的部署形态
- **邮件**：Resend（未配置时降级为日志输出）

---

## 快速开始

```bash
npm install
cp .env.local.example .env.local   # 填写 DATABASE_URL / AUTH_SECRET / NEXT_PUBLIC_BASE_URL
npm run db:generate                # 生成 Prisma Client（构建前也会自动执行）
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

手工执行单个迁移时，必须使用事务或 `ON_ERROR_STOP=1`（并非所有历史迁移文件都自带 `BEGIN/COMMIT`）：

```bash
sudo -u postgres psql -d ba_nihplod_db -v ON_ERROR_STOP=1 -1 -f db/migrate-20260925-security-fixes.sql
sudo -u postgres psql -d ba_nihplod_db -v ON_ERROR_STOP=1 -1 -f db/migrate-20260926-audit-log-indexes.sql
```

### CSP 与缓存

生产 CSP 使用 nonce，页面必须动态渲染，因此 HTML 不应被 CDN 长期缓存。使用 Cloudflare 时：

- 不要对 HTML 页面设置 Cache Everything；
- 每次发布后 purge `/`、`/verify`、`/admin*`、`/workbench*`、`/reset-password*` 缓存；
- 确认响应头 `script-src` 含 `'nonce-...'` 且不含 `'unsafe-inline'`。

### 时区要求（重要）

证书有效期判断在应用与数据库两侧都会用到日期，必须保持时区一致（默认均为 `Asia/Shanghai`）：

- 应用：在 `.env.local` 配置 `TZ=Asia/Shanghai`
- 前端：配置 `NEXT_PUBLIC_BUSINESS_TIME_ZONE=Asia/Shanghai`
- 数据库：配置 `DB_TIMEZONE=Asia/Shanghai`，连接会通过启动参数自动设置会话时区；建议同时固定实例/数据库时区：

```sql
ALTER DATABASE ba_nihplod_db SET timezone TO 'Asia/Shanghai';
```

---

## 部署

1. 构建：`npm ci && npm run build`（`prebuild` 自动执行 `prisma generate`）
2. 启动：`npm run start`（常驻进程可用 pm2/systemd 管理）
3. **反向代理必须设置 `X-Real-IP $remote_addr`**（应用优先读取该头用于限流），且不要将应用端口直接暴露公网；使用 Cloudflare 时需配置 `real_ip_header CF-Connecting-IP`，应用也会在缺少 X-Real-IP 时优先读取 `CF-Connecting-IP`，并对 `X-Forwarded-For` 取最后一跳
4. 定时任务（建议每日一次），只接受请求头：
   ```bash
   curl -H "x-cron-secret: $CRON_SECRET" https://<域名>/api/cron/update-expired-certificates
   ```

### 迁移部署

当前迁移包含 2026-09-25、2026-09-26、2026-10-27、2026-11-06 系列和 2026-11-07 的限流过期时间、审计搜索索引、Schema 漂移收敛迁移。线上已有 `schema_migrations` 时，不需要再执行 `--mark-applied`，直接按以下顺序：

```bash
# 1. 先备份数据库和上传目录（以 postgres 身份导出，root 直接执行会因角色不存在而失败）
sudo -u postgres pg_dump -Fc -d ba_nihplod_db > /root/db-backups/ba_pre_deploy_$(date +%Y%m%d_%H%M%S).dump

# 2. 先只读查看待执行迁移（不会创建 schema_migrations）
npm run db:migrate:apply -- --dry-run

# 3. 正式执行迁移
npm run db:migrate:apply

# 4. 再构建、重启
npm run build
pm2 restart ba-nihplod-app --update-env
```

如果新环境还没有 `schema_migrations` 且历史上已手工执行过旧迁移，先按实际执行情况登记，再运行 dry-run 确认：

```bash
npm run db:migrate:apply -- \
  --mark-applied=migrate-add-dealer-unique.sql \
  --mark-applied=migrate-pgtrgm-search.sql \
  --mark-applied=migrate-phone-optional.sql \
  --mark-applied=migrate-search-count.sql \
  --mark-applied=migrate-sync-email.sql
```

回滚：`db/rollback-20260926-audit-log-indexes.sql`、`db/rollback-20260925-security-fixes.sql`、`db/rollback-20261106-01-migrations.sql`（先回滚代码，再回滚数据库）。

部署前只读核查脚本：`scripts/pre-deploy-check.sql`。

部署后如果使用 Cloudflare，请 purge 页面缓存，确保旧 HTML 不再携带旧的 Server Action ID。

历史投诉证据迁移（仅当数据库存在旧的 `/uploads/public-uploads/complaints/` 地址时）：

```bash
npm run migrate:evidence-private             # dry-run
npm run migrate:evidence-private -- --apply  # 复制并更新数据库
npm run migrate:evidence-private -- --apply --delete-old
```

---

### 私有证据与配额

- `private/uploads` 存放投诉证据，只能通过管理员接口 `/api/files/complaints/...` 读取；
- `MAX_PRIVATE_UPLOAD_BYTES` 默认 2GB，超出时匿名上传返回 507；
- `UPLOAD_RETENTION_DAYS` 默认 180，供 `cleanup:uploads` 清理已关闭/软删除工单证据；
- `DB_STATEMENT_TIMEOUT_MS` 默认 15000，避免慢查询长期占用连接；
- 历史公开证据可用 `npm run migrate:evidence-private -- --apply --delete-old` 迁移。

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
10 4 * * * cd /var/www/BA-NIHPLOD && npm run cleanup:uploads -- --delete --purge-closed-days=180 >> /var/log/ba-cleanup.log 2>&1
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
- 登录限流：仅统计失败次数、成功清零，5 分钟内最多 5 次失败（按 IP）；同一账号 5 分钟内最多 10 次失败
- 敏感操作限流：创建/删除账号、重置密码、封禁、证书操作、修改密码等
- 行为限流按 key 独立保存过期时间，短窗口清理不会重置 24 小时上传限额
- 账号管理类接口仅限 `SUPER_ADMIN`（`lib/auth.ts#requireSuperAdmin`）
- 证书/投诉删除为软删除：列表移除，业务数据、证据与审计链保留
- 投诉删除（软删除）仅 `SUPER_ADMIN`；审核员只能流转状态
- 待审核证书：审核员可修改本人提交的待审核申请且只能看到本人待审记录；`SUPER_ADMIN` 可修改任意待审核证书并终审/直接签发
- 已签发证书内容不可编辑；修正必须吊销后重新签发
- 证书授权方由服务端固定为 `COMPANY_FULL_NAME`；自定义印章仅 `SUPER_ADMIN` 可提交
- 修改密码后当前设备自动续签新 Token，其他设备的旧 Token 立即失效
- `audit_logs` 为 append-only：数据库 trigger 禁止 UPDATE/DELETE；删除证书改为 `SET NULL` + `certificate_ref`
- 审计日志可通过 `npm run archive:audit` 归档到 JSONL 后再按保留策略清理；归档历史不参与在线查询
- 生产环境 `.env.local` 权限必须为 `600`；不要保留可读的重复 `.env` 配置（`DATABASE_URL` 会泄露数据库密码）
- 上传文件魔数校验 + 路径遍历防护；投诉证据写入 `private/uploads`，仅管理员可通过 `/api/files/complaints/...` 访问
- Nginx 应增加 `location ^~ /uploads/public-uploads/ { return 410; }`，防止旧证据路径继续被公开访问
- 匿名证据默认全局上限 2GB、已关闭/软删除工单证据默认保留 180 天，均可通过环境变量调整
- CSP nonce / HSTS / X-Frame-Options 等安全响应头见 `proxy.ts` 与 `next.config.ts`；生产 `script-src` 不含 `unsafe-inline`

---

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run lint` | ESLint 检查 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:migrate:apply` | 执行待应用的数据库迁移（支持 `-- --dry-run`） |
| `npm run db:push` | 仅本地临时使用；**生产禁止**，会绕过 SQL 迁移/触发器/手工索引 |
| `npm test` | 纯函数单元测试（校验/日期/魔数/IP/证书状态） |
| `npm run test:e2e` | 端到端冒烟测试（必须显式 `--db` 一次性数据库 + 已启动的服务） |
| `npm run migrate:evidence-private` | 将历史公开投诉证据迁移到 private（默认 dry-run，加 `-- --apply` 执行） |
| `npm run backup:db` | 备份 BA 数据库（需要 `pg_dump`，默认保留 30 天） |
| `npm run backup:uploads` | 备份 BA public/uploads + private 文件 |
| `npm run cleanup:uploads` | 清理未引用文件；加 `-- --delete` 执行。默认保留最近 7 天；`UPLOAD_RETENTION_DAYS` 控制已关闭工单证据保留期 |
| `npm run archive:audit -- --before=YYYY-MM-DD` | 归档指定日期前的审计日志；默认 dry-run，加 `--apply` 写入 JSONL 并删除数据库记录 |
| `npm run list:admins` | 列出管理员账号 |
| `npm run init:admins` | 初始化管理员账号（已存在账号默认跳过，不会重复重置密码/角色） |
| `npm run init:admins -- --reset` | 明确重置 `DEFAULT_ADMINS` 中已存在账号的密码/角色，并写审计日志 |

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

### 主站管理员 SSO 与举报整合

BA 管理员统一由主站（nihplod.cn）SSO 管理，BA 只保留影子账号。详见主站 `docs/sso-deployment.md` §2.11。

- 主站入口：`/api/admin/auth/sso/start?return_to=/workbench`
- BA 回调：`/api/admin/auth/sso/callback`
- 同步 cron：`/api/cron/admin-sso-sync`
- 举报通知重试：`/api/cron/retry-complaint-alerts`
- 举报内部 API：`/api/internal/admin/complaints*`
- 看板内部 API：`/api/internal/admin/dashboard`
- 证据签名 URL：`/api/evidence/complaints/[id]/[index]?exp=&token=`

新增环境变量（详见 `.env.local.example`）：

```env
ADMIN_SSO_ENABLED=false
ADMIN_SSO_CLIENT_ID=ba-admin
ADMIN_SSO_CLIENT_SECRET=...
ADMIN_SSO_REDIRECT_URI=https://ba.nihplod.cn/api/admin/auth/sso/callback
ADMIN_SSO_AUDIENCE=ba-admin
ADMIN_SSO_LOCAL_LOGIN_MODE=all
INTERNAL_API_KEYS='[{"project":"ba","key":"...","secret":"..."}]'
MAIN_SITE_INTERNAL_BASE=http://127.0.0.1:3000
BA_EVIDENCE_TOKEN_SECRET=...
```

本地应急账号：

```bash
npm run init:break-glass
```

按输出把 `BA_BREAK_GLASS_*` 写入 env，并妥善保存一次性打印的密码。

迁移已有 BA 管理员到主站 ID（先绑定，验证 SSO 后再 cutover）：

```bash
cp scripts/admin-sso-mapping.example.json scripts/admin-sso-mapping.json
# 1) 只绑定 external_admin_id，保留本地登录
node scripts/admin-sso-migrate.mjs --mapping scripts/admin-sso-mapping.json
node scripts/admin-sso-migrate.mjs --mapping scripts/admin-sso-mapping.json --apply
# 2) 开启 SSO 并逐个验证；确认后强制切换并撤销旧会话
node scripts/admin-sso-migrate.mjs --mapping scripts/admin-sso-mapping.json --apply --cutover
node scripts/run-cron.mjs /api/cron/admin-sso-sync
```

---

© 2024-2026 NIHPLOD. All rights reserved.
