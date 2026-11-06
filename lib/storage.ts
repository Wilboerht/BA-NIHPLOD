import * as fs from 'fs/promises';
import path from 'path';

export type StorageVisibility = 'public' | 'private';

function sanitizeFilePath(input: string): string {
  let sanitized = input
    .replace(/\\/g, '/')
    .replace(/^[/]+/, '');

  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\./g, '');
  }

  sanitized = sanitized.replace(/^[/]+/, '').replace(/\.\./g, '');
  return sanitized;
}

function ensurePathInside(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

function getStorageRoot(visibility: StorageVisibility): string {
  if (visibility === 'private') {
    const configured = process.env.PRIVATE_UPLOAD_ROOT;
    return configured
      ? path.resolve(/* turbopackIgnore: true */ configured)
      : path.join(process.cwd(), 'private', 'uploads');
  }
  const configured = process.env.PUBLIC_UPLOAD_ROOT;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(process.cwd(), 'public', 'uploads');
}

const MAGIC_NUMBERS: Record<string, string[]> = {
  'image/png': ['89504e47'],
  'image/gif': ['47494638'],
  'application/pdf': ['25504446'],
};

export function validateFileMagic(buffer: Buffer, declaredType: string): boolean {
  if (buffer.length < 4) return false;
  const hex = buffer.slice(0, 4).toString('hex').toLowerCase();

  // 合法 JPEG 可能以 APP0/APP1/APP2/APP8/DQT 等不同标记开头
  if (declaredType === 'image/jpeg') {
    return hex.startsWith('ffd8ff');
  }

  // RIFF 容器还可能是 AVI/WAV，必须同时确认 WEBP 标识
  if (declaredType === 'image/webp') {
    return hex === '52494646'
      && buffer.length >= 12
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  const validMagics = MAGIC_NUMBERS[declaredType];
  return validMagics ? validMagics.some((m) => hex.startsWith(m)) : false;
}

export function resolveStorageFilePath(
  visibility: StorageVisibility,
  bucket: string,
  filePath: string
): string | null {
  const safeBucket = sanitizeFilePath(bucket);
  const safeFilePath = sanitizeFilePath(filePath);
  if (!safeBucket || !safeFilePath) return null;

  const root = getStorageRoot(visibility);
  const uploadDir = path.resolve(root, safeBucket);
  const fullPath = path.resolve(uploadDir, safeFilePath);

  if (!ensurePathInside(uploadDir, fullPath)) return null;
  return fullPath;
}

export async function uploadFile(
  bucket: string,
  filePath: string,
  fileBuffer: Buffer | ArrayBuffer,
  contentType: string,
  visibility: StorageVisibility = 'public'
): Promise<{ path: string; error: string | null }> {
  try {
    const safeBucket = sanitizeFilePath(bucket);
    const safeFilePath = sanitizeFilePath(filePath);

    if (!safeBucket || !safeFilePath) {
      return { path: '', error: '非法的文件路径' };
    }

    const bufferToWrite = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);

    // 校验文件签名（非 application/octet-stream 时）
    if (contentType !== 'application/octet-stream' && !validateFileMagic(bufferToWrite, contentType)) {
      return { path: '', error: '文件类型与声明不符，可能为伪造文件' };
    }

    const fullPath = resolveStorageFilePath(visibility, safeBucket, safeFilePath);
    if (!fullPath) {
      return { path: '', error: '非法的文件路径' };
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, bufferToWrite);

    return { path: safeFilePath, error: null };
  } catch (error: unknown) {
    console.error('[Storage] Local upload error:', error);
    const message = error instanceof Error ? error.message : '上传失败';
    return { path: '', error: message };
  }
}

export function getPublicUrl(bucket: string, filePath: string): string {
  const cleanBucket = sanitizeFilePath(bucket);
  const cleanPath = sanitizeFilePath(filePath);
  return `/uploads/${cleanBucket}/${cleanPath}`;
}

export function getPrivateFileUrl(bucket: string, filePath: string): string {
  const cleanBucket = sanitizeFilePath(bucket);
  const cleanPath = sanitizeFilePath(filePath);
  return `/api/files/${cleanBucket}/${cleanPath}`;
}

export async function deleteFile(
  bucket: string,
  filePath: string,
  visibility: StorageVisibility = 'public'
): Promise<{ success: boolean; error: string | null }> {
  try {
    const fullPath = resolveStorageFilePath(visibility, bucket, filePath);
    if (!fullPath) {
      return { success: false, error: '非法的文件路径' };
    }

    await fs.unlink(fullPath);
    return { success: true, error: null };
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { success: true, error: null };
    }
    console.error('[Storage] Local delete error:', error);
    const message = error instanceof Error ? error.message : '删除失败';
    return { success: false, error: message };
  }
}
