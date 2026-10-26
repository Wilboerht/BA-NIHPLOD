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
- Prisma schema：`prisma/schema.prisma`（执行 `npm run db:push` 前请确认与迁移一致）

迁移执行器（推荐，自动跳过已应用、失败即回滚且不记录）：

```bash
npm run db:migrate:apply -- --dry-run   # 只列出待执行
npm run db:migrate:apply                # 正式执行
```

也可手动执行单个迁移（文件内部自带 BEGIN/COMMIT，配合 ON_ERROR_STOP 失败整体回滚）：

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

## 安全机制

- JWT（HttpOnly Cookie，8 小时）签名校验 + 数据库二次校验（存在性、封禁状态、令牌版本）
- 修改/重置密码后，`profiles.token_version` +1，旧 Token 立即失效（与时钟无关）
- 登录限流：仅统计失败次数、成功清零，5 分钟内最多 5 次失败（按 IP）
- 敏感操作限流：创建/删除账号、重置密码、封禁、证书操作等
- 账号管理类接口仅限 `SUPER_ADMIN`（`lib/auth.ts#requireSuperAdmin`）
- 上传文件魔数校验 + 路径遍历防护；投诉证据仅接受站内 `/uploads/` 地址
- CSP / HSTS / X-Frame-Options 等安全响应头见 `next.config.ts`

---

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run lint` | ESLint 检查 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:migrate:apply` | 执行待应用的数据库迁移（支持 `-- --dry-run`） |
| `npm run db:push` | Prisma 同步 schema（谨慎使用，需与迁移保持一致） |
| `npm run test:e2e` | 端到端冒烟测试（需一次性数据库 + 已启动的服务） |
| `npm run cleanup:uploads` | 清理未被引用的上传文件（默认 dry-run，加 `-- --delete` 执行） |
| `npm run list:admins` | 列出管理员账号 |
| `npm run init:admins` | 初始化管理员账号 |

### 冒烟测试示例

```bash
# 1. 启动服务（一次性库 + 固定 cron 密钥）
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sql_test CRON_SECRET=test-cron-secret npm run start -- -p 3999

# 2. 另开终端执行（会清空目标库业务表，仅限本地一次性库）
npm run test:e2e -- --base http://127.0.0.1:3999 --db postgresql://postgres@127.0.0.1:55432/sql_test --cron-secret=test-cron-secret
```

---

© 2024-2026 NIHPLOD. All rights reserved.
