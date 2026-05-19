import * as fs from 'fs/promises';
import path from 'path';

function sanitizeFilePath(input: string): string {
  // 禁止路径遍历：移除 .. 和绝对路径前缀
  return input
    .replace(/\.\./g, '')
    .replace(/^[/\\]+/, '')
    .replace(/\\/g, '/');
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

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', safeBucket);
    const fullPath = path.join(uploadDir, safeFilePath);
    
    // 确保目标文件的所有父目录都存在（包括子目录路径）
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    const bufferToWrite = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
    await fs.writeFile(fullPath, bufferToWrite);
    
    return { path: safeFilePath, error: null };
  } catch (error: any) {
    console.error('[Storage] Local upload error:', error);
    return { path: '', error: error.message };
  }
}

export function getPublicUrl(bucket: string, filePath: string): string {
  return `/uploads/${ bucket }/${ filePath }`;
}
