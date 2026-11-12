import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

if (existsSync(envPath)) {
  const envContent = await fs.readFile(envPath, 'utf8');
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

const beforeArg = process.argv.find((arg) => arg.startsWith('--before='));
const before = beforeArg ? beforeArg.slice('--before='.length) : '';
if (!before || Number.isNaN(Date.parse(before))) {
  console.error('❌ 必须传入 --before=YYYY-MM-DD');
  process.exit(1);
}

const batchArg = process.argv.find((arg) => arg.startsWith('--batch='));
const batchRaw = Number(batchArg?.slice('--batch='.length) || 1000);
const batchSize = Number.isFinite(batchRaw)
  ? Math.min(Math.max(Math.trunc(batchRaw), 1), 5000)
  : 1000;
const apply = process.argv.includes('--apply');
const archiveDir = path.resolve(
  process.env.AUDIT_ARCHIVE_DIR || path.join(process.cwd(), 'audit-archives')
);

const sql = postgres(databaseUrl, { max: 1 });

async function writeBatch(rows, outputPath) {
  const lines = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fs.appendFile(outputPath, lines, 'utf8');
}

try {
  const beforeDate = new Date(before);
  const countRows = await sql`
    SELECT COUNT(*)::int AS count
    FROM audit_logs
    WHERE created_at < ${beforeDate}
      AND action <> 'AUDIT_ARCHIVE'
  `;
  const total = Number(countRows[0]?.count ?? 0);
  console.log(`待归档审计日志：${total} 条（created_at < ${beforeDate.toISOString()}）`);

  if (!apply) {
    console.log('（dry-run：未写入归档文件，也未删除数据库记录；确认后加 --apply）');
    await sql.end();
    process.exit(0);
  }

  await fs.mkdir(archiveDir, { recursive: true });
  const outputPath = path.join(
    archiveDir,
    `audit-logs-before-${beforeDate.toISOString().replace(/[:.]/g, '-')}.jsonl`
  );
  await fs.writeFile(outputPath, '', { encoding: 'utf8', mode: 0o600 });
  // 归档含 IP/User-Agent，确保仅当前用户可读（mode 仅对新建文件生效）
  await fs.chmod(outputPath, 0o600).catch(() => {});

  let archived = 0;
  while (true) {
    const rows = await sql`
      SELECT * FROM audit_logs
      WHERE created_at < ${beforeDate}
        AND action <> 'AUDIT_ARCHIVE'
      ORDER BY created_at ASC
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) break;

    await writeBatch(rows, outputPath);
    const ids = rows.map((row) => row.id);

    await sql.begin(async (tx) => {
      await tx`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_mutation`;
      await tx`DELETE FROM audit_logs WHERE id = ANY(${ids})`;
      await tx`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_mutation`;
      await tx`
        INSERT INTO audit_logs (
          target_type, target_ref, actor_role, actor_name, action, comment, after
        ) VALUES (
          'system', 'archiveAuditLogs', 'SYSTEM', 'archiveAuditLogs',
          'AUDIT_ARCHIVE',
          ${`归档并删除 ${rows.length} 条 ${beforeDate.toISOString()} 之前的审计日志`},
          ${JSON.stringify({ count: rows.length, before: beforeDate.toISOString(), file: outputPath })}::jsonb
        )
      `;
    });

    archived += rows.length;
    console.log(`已归档并删除 ${archived}/${total}`);
  }

  console.log(`完成：归档文件 ${outputPath}`);
} finally {
  await sql.end({ timeout: 3 }).catch(() => {});
}
