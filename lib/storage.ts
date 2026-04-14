import { supabaseAdmin } from './supabase-admin';
import * as fs from 'fs/promises';
import path from 'path';

export const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'supabase';

export async function uploadFile(
  bucket: string,
  filePath: string,
  fileBuffer: Buffer | ArrayBuffer,
  contentType: string
): Promise<{ path: string; error: string | null }> {
  if (STORAGE_PROVIDER === 'local') {
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
  } else {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(filePath, fileBuffer, {
          contentType,
          upsert: true,
        });

      if (error) throw error;
      return { path: data.path, error: null };
    } catch (error: any) {
      console.error('[Storage] Supabase upload error:', error);
      return { path: '', error: error.message };
    }
  }
}

export function getPublicUrl(bucket: string, filePath: string): string {
  if (STORAGE_PROVIDER === 'local') {
    return `/uploads/${ bucket }/${ filePath }`;
  } else {
    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);
    return data?.publicUrl || '';
  }
}
