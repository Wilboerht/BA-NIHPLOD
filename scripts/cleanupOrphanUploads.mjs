import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

/**
 * 清理 public/uploads 下未被数据库引用的孤立文件
 * - 默认 dry-run，只列出；加 --delete 才真正删除
 * - 跳过最近 N 天内修改的文件（默认 7 天），避免误删正在使用的文件
 * - 引用来源：certificates.seal_url、complaints.evidence_image_url / evidence_image_urls
 *
 * 用法：
 *   node scripts/cleanupOrphanUploads.mjs [--delete] [--min-age-days=7]
 */

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

const shouldDelete = process.argv.includes('--delete');
const minAgeArg = process.argv.find((a) => a.startsWith('--min-age-days='));
const minAgeDays = minAgeArg ? Number(minAgeArg.split('=')[1]) : 7;
const maxAgeMs = Number.isFinite(minAgeDays) && minAgeDays >= 0 ? minAgeDays * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

const uploadsRoot = path.resolve(__dirname, '../public/uploads');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const rootExists = await fs
    .access(uploadsRoot)
    .then(() => true)
    .catch(() => false);
  if (!rootExists) {
    console.log('ℹ️  public/uploads 目录不存在，无需清理');
    await sql.end();
    process.exit(0);
  }

  const refs = new Set();
  const sealRows = await sql`SELECT seal_url AS url FROM certificates WHERE seal_url IS NOT NULL`;
  const complaintRows = await sql`
    SELECT evidence_image_url AS url FROM complaints WHERE evidence_image_url IS NOT NULL
    UNION ALL
    SELECT unnest(evidence_image_urls) AS url FROM complaints
  `;
  for (const row of [...sealRows, ...complaintRows]) {
    if (typeof row.url === 'string' && row.url.startsWith('/uploads/')) {
      refs.add(row.url);
    }
  }

  const files = await walk(uploadsRoot);
  const now = Date.now();
  const orphans = [];

  for (const file of files) {
    const rel = path.relative(uploadsRoot, file).split(path.sep).join('/');
    const url = `/uploads/${rel}`;
    if (refs.has(url)) continue;

    const stat = await fs.stat(file);
    if (now - stat.mtimeMs < maxAgeMs) continue; // 新文件保护期

    orphans.push({ file, rel, size: stat.size });
  }

  const totalBytes = orphans.reduce((sum, o) => sum + o.size, 0);
  console.log(`📦 扫描 ${files.length} 个文件，数据库引用 ${refs.size} 个`);
  console.log(`🧹 孤立文件 ${orphans.length} 个，合计 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  for (const o of orphans.slice(0, 50)) {
    console.log(`   - ${o.rel} (${(o.size / 1024).toFixed(1)} KB)`);
  }
  if (orphans.length > 50) console.log(`   ... 其余 ${orphans.length - 50} 个已省略`);

  if (!shouldDelete) {
    console.log('\n（dry-run 模式，未删除任何文件；确认后加 --delete 执行删除）');
  } else {
    for (const o of orphans) {
      await fs.unlink(o.file).catch((err) => {
        console.error(`删除失败 ${o.rel}:`, err.message);
      });
    }
    console.log(`\n✅ 已删除 ${orphans.length} 个孤立文件`);
  }
} finally {
  await sql.end({ timeout: 3 }).catch(() => {});
}
