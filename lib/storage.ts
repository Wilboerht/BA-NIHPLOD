import * as fs from 'fs/promises';
import path from 'path';

export async function uploadFile(
  bucket: string,
  filePath: string,
  fileBuffer: Buffer | ArrayBuffer,
  contentType: string
): Promise<{ path: string; error: string | null }> {
  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', bucket);
    await fs.mkdir(uploadDir, { recursive: true });
    
    const fullPath = path.join(uploadDir, filePath);
    const bufferToWrite = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
    await fs.writeFile(fullPath, bufferToWrite);
    
    return { path: filePath, error: null };
  } catch (error: any) {
    console.error('[Storage] Local upload error:', error);
    return { path: '', error: error.message };
  }
}

export function getPublicUrl(bucket: string, filePath: string): string {
  return `/uploads/${ bucket }/${ filePath }`;
}
