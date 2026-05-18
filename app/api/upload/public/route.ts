import { NextResponse } from 'next/server';
import { uploadFile, getPublicUrl } from '@/lib/storage';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB（匿名上传限制更严格）

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '请选择需要上传的文件' }, { status: 400 });
    }

    // 文件类型校验
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: '不支持的文件类型，仅允许 JPG/PNG/GIF/WebP' },
        { status: 400 }
      );
    }

    // 文件大小校验
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '文件大小超过 5MB 限制' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 生成安全文件名
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt || '') ? fileExt : 'bin';
    const fileName = `complaints/${crypto.randomUUID()}.${safeExt}`;

    const { path, error } = await uploadFile(
      'public-uploads',
      fileName,
      buffer,
      file.type || 'application/octet-stream'
    );

    if (error) {
      console.error('[Public Upload] File upload failed:', error);
      return NextResponse.json({ error: '文件上传失败，请稍后重试' }, { status: 500 });
    }

    const publicUrl = getPublicUrl('public-uploads', path);

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (err: unknown) {
    console.error('[Public Upload API] Error:', err);
    return NextResponse.json({ error: '上传失败，请稍后重试' }, { status: 500 });
  }
}
