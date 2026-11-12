import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

/**
 * 数据库迁移执行器
 * - 历史无日期迁移按内置 LEGACY_ORDER 优先执行，其余按文件名排序
 * - 已执行文件记录在 schema_migrations（含 sha256 checksum），重复运行自动跳过
 * - 文件内容变化会告警，但不会自动重跑
 * - 无显式 BEGIN/COMMIT 的迁移与 ledger 写入放在同一事务中
 * - 执行期间持有 advisory lock，避免并发迁移
 * - 失败即回滚且不会记录（手工 psql 执行时请使用 -1 或 ON_ERROR_STOP=1）
 *
 * 用法：
 *   node scripts/apply-migrations.mjs --dry-run                 # 只列出待执行
 *   node scripts/apply-migrations.mjs                           # 正式执行
 *   node scripts/apply-migrations.mjs --mark-applied=<文件名>    # 基线标记（不执行，仅登记）
 *     - 用于把「已在生产手动执行过」的历史迁移登记进 ledger，可重复传参
 *     - 标记后本次运行直接结束，不会继续执行其他待迁移文件
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

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  console.error('❌ Missing DATABASE_URL in .env.local');
  process.exit(1);
}
// 剔除 Prisma 专用参数，避免 postgres.js 启动连接时报 unknown parameter
let databaseUrl = rawDatabaseUrl;
try {
  const parsed = new URL(rawDatabaseUrl);
  parsed.searchParams.delete('schema');
  databaseUrl = parsed.toString();
} catch {
  // 保留原始值，让 postgres.js 给出更具体的错误
}

const dryRun = process.argv.includes('--dry-run');
const markApplied = process.argv
  .filter((a) => a.startsWith('--mark-applied='))
  .map((a) => a.split('=').slice(1).join('='));
const dbDir = path.resolve(__dirname, '../db');

// 历史迁移没有日期前缀，必须显式排在所有带日期迁移之前，
// 否则 migrate-20261107-03 会在 migrate-search-count.sql 之前执行而报错。
const LEGACY_ORDER = [
  'migrate-add-dealer-unique.sql',
  'migrate-pgtrgm-search.sql',
  'migrate-phone-optional.sql',
  'migrate-search-count.sql',
  'migrate-sync-email.sql',
];

function migrationSortKey(name) {
  const legacyIndex = LEGACY_ORDER.indexOf(name);
  if (legacyIndex !== -1) {
    return `0:${String(legacyIndex).padStart(4, '0')}:${name}`;
  }
  return `1:${name}`;
}

const files = fs
  .readdirSync(dbDir)
  .filter((f) => /^migrate-.*\.sql$/.test(f))
  .sort((a, b) => migrationSortKey(a).localeCompare(migrationSortKey(b)));

const unmanaged = files.filter(
  (f) => !LEGACY_ORDER.includes(f) && !/^migrate-\d{8}-/.test(f)
);
if (unmanaged.length > 0) {
  console.warn(`ℹ️  以下迁移没有日期前缀，将排在所有带日期迁移之后：${unmanaged.join(', ')}`);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

function fileChecksum(filename) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(dbDir, filename)))
    .digest('hex');
}

try {
  if (dryRun && markApplied.length > 0) {
    console.error('❌ --dry-run 不能与 --mark-applied 同时使用');
    process.exit(1);
  }

  // 防止多个进程同时执行迁移（会话级 advisory lock）
  await sql`SELECT pg_advisory_lock(hashtext('ba-schema-migrations'))`;

  // dry-run 必须只读：不能为了读取 ledger 而创建表
  if (!dryRun) {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum   TEXT
      )
    `;
    // 兼容历史 ledger（没有 checksum 列）
    await sql`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`;
  }

  const ledgerCheck = await sql`SELECT to_regclass('public.schema_migrations') AS name`;
  const hasLedger = Boolean(ledgerCheck[0]?.name);
  if (!hasLedger) {
    console.warn('ℹ️  schema_migrations 不存在；dry-run 将把全部迁移视为待执行');
  }

  const checksumColumnRows = hasLedger
    ? await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'schema_migrations'
          AND column_name = 'checksum'
        LIMIT 1
      `
    : [];
  const hasChecksumColumn = checksumColumnRows.length > 0;

  const appliedRows = hasLedger
    ? hasChecksumColumn
      ? await sql`SELECT filename, checksum FROM schema_migrations`
      : (await sql`SELECT filename FROM schema_migrations`).map((row) => ({
          filename: row.filename,
          checksum: null,
        }))
    : [];
  const applied = new Set(appliedRows.map((r) => r.filename));
  const pending = files.filter((f) => !applied.has(f));

  // 已应用文件内容变化告警（不自动重跑），并为历史记录回填 checksum
  for (const row of appliedRows) {
    if (!files.includes(row.filename)) continue;
    const current = fileChecksum(row.filename);
    if (row.checksum && row.checksum !== current) {
      console.warn(`⚠️  迁移文件在应用后被修改：${row.filename}（不会自动重跑）`);
    }
    if (!dryRun && hasChecksumColumn && !row.checksum) {
      await sql`
        UPDATE schema_migrations SET checksum = ${current}
        WHERE filename = ${row.filename} AND checksum IS NULL
      `;
    }
  }

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
      await sql`
        INSERT INTO schema_migrations (filename, checksum)
        VALUES (${name}, ${fileChecksum(name)})
        ON CONFLICT (filename) DO NOTHING
      `;
      console.log(`📌 已登记（未执行）：${name}`);
    }
    console.log('ℹ️  --mark-applied 模式已结束，未执行其他待迁移文件');
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
    const checksum = fileChecksum(f);
    const hasExplicitTx = /(^|\n)\s*(BEGIN|START\s+TRANSACTION)\s*;/i.test(content);
    process.stdout.write(`▶ 执行 ${f} ... `);
    try {
      if (hasExplicitTx) {
        await sql.unsafe(content);
        await sql`
          INSERT INTO schema_migrations (filename, checksum)
          VALUES (${f}, ${checksum})
          ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum
        `;
      } else {
        // 迁移与 ledger 记录同事务，避免出现「已执行但未登记」
        await sql.begin(async (tx) => {
          await tx.unsafe(content);
          await tx`
            INSERT INTO schema_migrations (filename, checksum)
            VALUES (${f}, ${checksum})
            ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum
          `;
        });
      }
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
