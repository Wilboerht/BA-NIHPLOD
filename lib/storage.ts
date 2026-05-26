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

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', safeBucket);
    const fullPath = path.join(uploadDir, safeFilePath);

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
