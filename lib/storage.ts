import * as fs from 'fs/promises';
import path from 'path';

function sanitizeFilePath(input: string): string {
  // 禁止路径遍历：规范化后再次检查
  let sanitized = input
    .replace(/\\/g, '/')
    .replace(/^[/]+/, '');
  // 循环移除 .. 直到无法移除，防止 .../..../ 绕过
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\./g, '');
  }
  // 最终确保没有绝对路径前缀和剩余 ..
  sanitized = sanitized.replace(/^[/]+/, '').replace(/\.\./g, '');
  return sanitized;
}

function ensurePathInside(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

const MAGIC_NUMBERS: Record<string, string[]> = {
  'image/png': ['89504e47'],
  'image/jpeg': ['ffd8ffe0', 'ffd8ffe1', 'ffd8ffe8', 'ffd8ffdb', 'ffd8ffee'],
  'image/gif': ['47494638'],
  'image/webp': ['52494646'],
  'application/pdf': ['25504446'],
};

export function validateFileMagic(buffer: Buffer, declaredType: string): boolean {
  const hex = buffer.slice(0, 4).toString('hex').toLowerCase();
  const validMagics = MAGIC_NUMBERS[declaredType];
  if (!validMagics) return true; // 未知类型不强制校验
  return validMagics.some((m) => hex.startsWith(m));
}

export async function uploadFile(
  bucket: string,
  filePath: string,
  fileBuffer: Buffer | ArrayBuffer,
  contentType: string
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

    const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', safeBucket);
    const fullPath = path.resolve(uploadDir, safeFilePath);

    // 二次校验：确保最终路径在允许的基目录内
    if (!ensurePathInside(uploadDir, fullPath)) {
      return { path: '', error: '非法的文件路径' };
    }

    // 确保目标文件的所有父目录都存在（包括子目录路径）
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
  const cleanBucket = bucket.replace(/^\/+|\/+$/g, '');
  const cleanPath = filePath.replace(/^\/+/g, '');
  return `/uploads/${cleanBucket}/${cleanPath}`;
}

export async function deleteFile(
  bucket: string,
  filePath: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const safeBucket = sanitizeFilePath(bucket);
    const safeFilePath = sanitizeFilePath(filePath);

    if (!safeBucket || !safeFilePath) {
      return { success: false, error: '非法的文件路径' };
    }

    const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', safeBucket);
    const fullPath = path.resolve(uploadDir, safeFilePath);

    if (!ensurePathInside(uploadDir, fullPath)) {
      return { success: false, error: '非法的文件路径' };
    }

    await fs.unlink(fullPath);
    return { success: true, error: null };
  } catch (error: unknown) {
    // 文件不存在时视为成功（幂等删除）
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { success: true, error: null };
    }
    console.error('[Storage] Local delete error:', error);
    const message = error instanceof Error ? error.message : '删除失败';
    return { success: false, error: message };
  }
}

/**
 * 根据公开 URL 删除本地文件
 * URL 格式: /uploads/<bucket>/<path>
 */
export async function deletePublicUpload(url: string): Promise<{ success: boolean; error: string | null }> {
  if (!url.startsWith('/uploads/')) {
    return { success: false, error: '非本地上传文件' };
  }
  const relative = url.slice('/uploads/'.length); // e.g. public-uploads/complaints/xxx.png
  const firstSlash = relative.indexOf('/');
  if (firstSlash === -1) {
    return { success: false, error: '非法的文件路径' };
  }
  const bucket = relative.slice(0, firstSlash);
  const filePath = relative.slice(firstSlash + 1);
  return deleteFile(bucket, filePath);
}
