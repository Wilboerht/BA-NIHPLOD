import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

/**
 * 将历史投诉证据从 public/uploads/public-uploads/complaints
 * 迁移到 private/uploads/complaints，并把数据库 URL 更新为 /api/files/...
 *
 * 默认 dry-run；加 --apply 执行复制和数据库更新。
 * 加 --delete-old 在数据库更新成功后删除旧公开文件。
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

const apply = process.argv.includes('--apply');
const deleteOld = process.argv.includes('--delete-old');
const publicRoot = path.resolve(
  process.env.PUBLIC_UPLOAD_ROOT || path.join(process.cwd(), 'public', 'uploads')
);
const privateRoot = path.resolve(
  process.env.PRIVATE_UPLOAD_ROOT || path.join(process.cwd(), 'private', 'uploads')
);
const OLD_PREFIX = '/uploads/public-uploads/complaints/';
const NEW_PREFIX = '/api/files/complaints/';

function splitUrls(row) {
  return [
    ...(row.evidence_image_url ? [row.evidence_image_url] : []),
    ...(Array.isArray(row.evidence_image_urls) ? row.evidence_image_urls : []),
  ].filter((url) => typeof url === 'string' && url.startsWith(OLD_PREFIX));
}

function newUrl(oldUrl) {
  const fileName = oldUrl.slice(OLD_PREFIX.length);
  if (!/^[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$/i.test(fileName)) {
    return null;
  }
  return { fileName, url: `${NEW_PREFIX}${fileName}` };
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const rows = await sql`
    SELECT id, evidence_image_url, evidence_image_urls
    FROM complaints
    WHERE (evidence_image_url LIKE ${OLD_PREFIX + '%'})
       OR EXISTS (
         SELECT 1 FROM unnest(evidence_image_urls) u
         WHERE u LIKE ${OLD_PREFIX + '%'}
       )
    ORDER BY created_at ASC
  `;

  console.log(`发现 ${rows.length} 条包含旧公开证据的投诉`);

  let moved = 0;
  let skipped = 0;

  for (const row of rows) {
    const urls = splitUrls(row);
    if (urls.length === 0) continue;

    let nextSingle = row.evidence_image_url;
    const nextArray = Array.isArray(row.evidence_image_urls)
      ? [...row.evidence_image_urls]
      : [];

    for (const oldUrl of urls) {
      const mapped = newUrl(oldUrl);
      if (!mapped) {
        console.warn(`跳过非法旧 URL：${oldUrl}`);
        skipped++;
        continue;
      }

      const source = path.resolve(publicRoot, 'public-uploads', 'complaints', mapped.fileName);
      const target = path.resolve(privateRoot, 'complaints', mapped.fileName);

      let exists = true;
      try {
        await fs.access(source);
      } catch {
        exists = false;
      }
      if (!exists) {
        console.warn(`源文件不存在，保留旧 URL：${source}`);
        skipped++;
        continue;
      }

      if (apply) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target);
      }
      console.log(`${apply ? '已复制' : '[dry-run] 将复制'} ${mapped.fileName}`);

      if (row.evidence_image_url === oldUrl) nextSingle = mapped.url;
      const index = nextArray.indexOf(oldUrl);
      if (index !== -1) nextArray[index] = mapped.url;
      moved++;
    }

    if (apply) {
      await sql`
        UPDATE complaints
        SET evidence_image_url = ${nextSingle || null},
            evidence_image_urls = ${nextArray}
        WHERE id = ${row.id}
      `;

      if (deleteOld) {
        for (const oldUrl of urls) {
          const mapped = newUrl(oldUrl);
          if (!mapped) continue;
          const source = path.resolve(publicRoot, 'public-uploads', 'complaints', mapped.fileName);
          await fs.unlink(source).catch((err) => {
            if (err.code !== 'ENOENT') console.warn(`删除旧文件失败 ${source}:`, err.message);
          });
        }
      }
    }
  }

  console.log(`\n完成：${apply ? '已迁移' : '待迁移'} ${moved} 个 URL，跳过 ${skipped} 个`);
  if (!apply) console.log('当前为 dry-run，确认后加 --apply 执行；需要删除旧文件时再加 --delete-old');
} finally {
  await sql.end({ timeout: 3 }).catch(() => {});
}
