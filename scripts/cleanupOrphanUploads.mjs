import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

/**
 * 清理 public/uploads 与 private/uploads 下未被数据库引用的文件。
 * - 默认 dry-run，只列出；加 --delete 才真正删除
 * - 默认跳过最近 7 天修改的文件，避免误删正在使用的文件
 * - --purge-closed-days=N 可清理超过 N 天且已解决/已驳回/软删除工单的证据
 *
 * 用法：
 *   node scripts/cleanupOrphanUploads.mjs [--delete] [--min-age-days=7]
 *   node scripts/cleanupOrphanUploads.mjs --delete --purge-closed-days=180
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

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const shouldDelete = process.argv.includes('--delete');
const minAgeDays = Number(argValue('min-age-days', '7'));
const maxAgeMs = Number.isFinite(minAgeDays) && minAgeDays >= 0
  ? minAgeDays * 24 * 60 * 60 * 1000
  : 7 * 24 * 60 * 60 * 1000;
const purgeClosedDays = Number(argValue('purge-closed-days', process.env.UPLOAD_RETENTION_DAYS || '0'));
const canPurgeClosed = Number.isFinite(purgeClosedDays) && purgeClosedDays > 0;

const publicRoot = path.resolve(
  process.env.PUBLIC_UPLOAD_ROOT || path.join(process.cwd(), 'public', 'uploads')
);
const privateRoot = path.resolve(
  process.env.PRIVATE_UPLOAD_ROOT || path.join(process.cwd(), 'private', 'uploads')
);

async function walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

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

const PRIVATE_EVIDENCE_PATTERN = /^complaints\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|gif|webp)$/i;

function resolveInside(root, relative) {
  const resolved = path.resolve(root, relative);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

function urlToFilePath(url) {
  if (typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) {
    return resolveInside(publicRoot, url.slice('/uploads/'.length));
  }
  if (url.startsWith('/api/files/')) {
    const relative = url.slice('/api/files/'.length);
    if (!PRIVATE_EVIDENCE_PATTERN.test(relative)) return null;
    return resolveInside(privateRoot, relative);
  }
  return null;
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const refs = new Set();

  const certificateRows = await sql`
    SELECT seal_url AS url FROM certificates WHERE seal_url IS NOT NULL
    UNION ALL
    SELECT final_image_url AS url FROM certificates WHERE final_image_url IS NOT NULL
  `;
  const complaintRows = await sql`
    SELECT id, evidence_image_url AS url FROM complaints WHERE evidence_image_url IS NOT NULL
    UNION ALL
    SELECT id, unnest(evidence_image_urls) AS url FROM complaints
  `;
  const templateRows = await sql`
    SELECT background_url AS url FROM templates WHERE background_url IS NOT NULL
    UNION ALL
    SELECT stamp_url AS url FROM templates WHERE stamp_url IS NOT NULL
  `;

  const urlOwners = new Map();
  for (const row of [...certificateRows, ...templateRows]) {
    const file = urlToFilePath(row.url);
    if (file) refs.add(file);
  }
  for (const row of complaintRows) {
    const file = urlToFilePath(row.url);
    if (!file) continue;
    refs.add(file);
    if (!urlOwners.has(file)) urlOwners.set(file, new Set());
    urlOwners.get(file).add(row.id);
  }

  // 1) 清理未被引用的陈旧文件
  const files = [...(await walk(publicRoot)), ...(await walk(privateRoot))];
  const now = Date.now();
  const orphans = [];

  for (const file of files) {
    if (refs.has(path.resolve(file))) continue;
    const stat = await fs.stat(file);
    if (now - stat.mtimeMs < maxAgeMs) continue;
    orphans.push({ file, size: stat.size });
  }

  console.log(`📦 扫描 ${files.length} 个文件，数据库引用 ${refs.size} 个`);
  console.log(`🧹 未被引用的陈旧文件 ${orphans.length} 个`);
  for (const o of orphans.slice(0, 50)) {
    console.log(`   - ${path.relative(process.cwd(), o.file)} (${(o.size / 1024).toFixed(1)} KB)`);
  }
  if (orphans.length > 50) console.log(`   ... 其余 ${orphans.length - 50} 个已省略`);

  if (shouldDelete) {
    for (const o of orphans) {
      await fs.unlink(o.file).catch((err) => {
        console.error(`删除失败 ${o.file}:`, err.message);
      });
    }
    console.log(`✅ 已删除 ${orphans.length} 个未引用文件`);
  } else {
    console.log('\n（dry-run：未删除任何文件；确认后加 --delete 执行）');
  }

  // 2) 可选：清理已关闭/软删除工单的过期证据
  if (canPurgeClosed) {
    const rows = await sql`
      SELECT id, evidence_image_url, evidence_image_urls
      FROM complaints
      WHERE (deleted_at IS NOT NULL OR status IN ('RESOLVED', 'REJECTED'))
        AND updated_at < NOW() - make_interval(days => ${purgeClosedDays})
      ORDER BY updated_at ASC
      LIMIT 200
    `;

    console.log(`\n🗂️ 可清理的已关闭工单 ${rows.length} 条（超过 ${purgeClosedDays} 天）`);

    for (const row of rows) {
      const urls = [
        ...(row.evidence_image_url ? [row.evidence_image_url] : []),
        ...(Array.isArray(row.evidence_image_urls) ? row.evidence_image_urls : []),
      ].filter((url) => typeof url === 'string');

      console.log(`   - 工单 ${row.id}: ${urls.length} 个证据`);
      if (!shouldDelete) continue;

      for (const url of new Set(urls)) {
        const file = urlToFilePath(url);
        if (!file) continue;
        const owners = urlOwners.get(file);
        if (owners) {
          owners.delete(row.id);
          if (owners.size > 0) {
            console.log(`   - 文件仍被其他工单引用，跳过删除: ${file}`);
            continue;
          }
        }
        await fs.unlink(file).catch((err) => {
          if (err.code !== 'ENOENT') console.error(`删除失败 ${file}:`, err.message);
        });
      }

      await sql`
        UPDATE complaints
        SET evidence_image_url = NULL,
            evidence_image_urls = '{}',
            updated_at = NOW()
        WHERE id = ${row.id}
      `;
    }

    if (!shouldDelete) {
      console.log('（dry-run：未删除证据；确认后加 --delete 执行）');
    }
  }
} finally {
  await sql.end({ timeout: 3 }).catch(() => {});
}
