import fs from 'fs/promises';
import path from 'path';

const DEFAULT_MAX_PRIVATE_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const USAGE_CACHE_TTL_MS = 30_000;

let cachedUsage: { value: number; expiresAt: number } | null = null;

function getPrivateRoot(): string {
  const configured = process.env.PRIVATE_UPLOAD_ROOT;
  if (configured) {
    return path.resolve(/* turbopackIgnore: true */ configured);
  }
  return path.join(process.cwd(), 'private', 'uploads');
}

export function getMaxPrivateUploadBytes(): number {
  const parsed = Number.parseInt(process.env.MAX_PRIVATE_UPLOAD_BYTES || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PRIVATE_UPLOAD_BYTES;
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(full);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch {
        // 文件在扫描过程中被删除，忽略
      }
    }
  }
  return total;
}

export async function getPrivateStorageBytes(): Promise<number> {
  if (cachedUsage && cachedUsage.expiresAt > Date.now()) {
    return cachedUsage.value;
  }
  const value = await directorySize(getPrivateRoot());
  cachedUsage = { value, expiresAt: Date.now() + USAGE_CACHE_TTL_MS };
  return value;
}

export function invalidateStorageUsageCache(): void {
  cachedUsage = null;
}

export async function wouldExceedPrivateQuota(additionalBytes: number): Promise<boolean> {
  const used = await getPrivateStorageBytes();
  return used + Math.max(0, additionalBytes) > getMaxPrivateUploadBytes();
}
