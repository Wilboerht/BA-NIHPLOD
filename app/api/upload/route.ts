import { NextResponse } from 'next/server';
import { uploadFile, getPublicUrl } from '@/lib/storage';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const bucket = (formData.get('bucket') as string) || 'certificates';
    const folder = (formData.get('folder') as string) || '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 生成随机文件名
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder ? folder + '/' : ''}${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { path, error } = await uploadFile(
      bucket,
      fileName,
      buffer,
      file.type || 'application/octet-stream'
    );

    if (error) {
      console.error('[Upload] File upload failed:', error);
      return NextResponse.json({ error }, { status: 500 });
    }

    const publicUrl = getPublicUrl(bucket, path);

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (err: any) {
    console.error('[Upload API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
