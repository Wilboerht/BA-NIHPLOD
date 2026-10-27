import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

/**
 * 数据库迁移执行器
 * - 按文件名顺序执行 db/migrate-*.sql
 * - 已执行文件记录在 schema_migrations 表，重复运行自动跳过
 * - 新迁移文件带 BEGIN/COMMIT；旧文件依赖单次 simple query 的隐式事务。
 *   失败即整体回滚且不会记录（手工 psql 执行时请使用 -1 或 ON_ERROR_STOP=1）
 *
 * 用法：
 *   node scripts/apply-migrations.mjs --dry-run                 # 只列出待执行
 *   node scripts/apply-migrations.mjs                           # 正式执行
 *   node scripts/apply-migrations.mjs --mark-applied=<文件名>    # 基线标记（不执行，仅登记）
 *     - 用于把「已在生产手动执行过」的历史迁移登记进 ledger，可重复传参
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL in .env.local');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const markApplied = process.argv
  .filter((a) => a.startsWith('--mark-applied='))
  .map((a) => a.split('=').slice(1).join('='));
const dbDir = path.resolve(__dirname, '../db');
const files = fs
  .readdirSync(dbDir)
  .filter((f) => /^migrate-.*\.sql$/.test(f))
  .sort();

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const appliedRows = await sql`SELECT filename FROM schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));
  const pending = files.filter((f) => !applied.has(f));

  // 基线标记模式：仅登记，不执行
  if (markApplied.length > 0) {
    for (const name of markApplied) {
      if (!files.includes(name)) {
        console.error(`❌ 迁移文件不存在：${name}`);
        process.exit(1);
      }
      if (applied.has(name)) {
        console.log(`ℹ️  已登记，跳过：${name}`);
        continue;
      }
      await sql`INSERT INTO schema_migrations (filename) VALUES (${name}) ON CONFLICT DO NOTHING`;
      console.log(`📌 已登记（未执行）：${name}`);
    }
    await sql.end();
    process.exit(0);
  }

  if (pending.length === 0) {
    console.log('✅ 无待执行迁移');
    await sql.end();
    process.exit(0);
  }

  console.log(`📋 待执行迁移 ${pending.length} 个：`);
  for (const f of pending) console.log(`   - ${f}`);

  if (dryRun) {
    console.log('\n（dry-run 模式，未执行任何语句）');
    await sql.end();
    process.exit(0);
  }

  for (const f of pending) {
    const content = fs.readFileSync(path.join(dbDir, f), 'utf8');
    process.stdout.write(`▶ 执行 ${f} ... `);
    try {
      await sql.unsafe(content);
      await sql`INSERT INTO schema_migrations (filename) VALUES (${f}) ON CONFLICT DO NOTHING`;
      console.log('✅');
    } catch (err) {
      console.log('❌');
      console.error(`迁移失败，已回滚：${f}`);
      console.error(err instanceof Error ? err.message : err);
      await sql.end();
      process.exit(1);
    }
  }

  console.log('\n✅ 全部迁移执行完成');
} finally {
  await sql.end({ timeout: 3 }).catch(() => {});
}
