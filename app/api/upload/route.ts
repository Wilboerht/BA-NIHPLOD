import { NextResponse } from 'next/server';
import { uploadFile, getPublicUrl } from '@/lib/storage';
import { requireAuth } from '@/lib/auth';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function sanitizeFolder(folder: string): string {
  // 只允许字母数字和下划线，禁止路径遍历
  return folder.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
}

export async function POST(req: Request) {
  try {
    // 认证检查
    const { user, response } = await requireAuth(req);
    if (response) {
      return response;
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const bucket = (formData.get('bucket') as string) || 'certificates';
    const folder = sanitizeFolder((formData.get('folder') as string) || '');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 文件类型校验
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: '不支持的文件类型，仅允许 JPG/PNG/GIF/WebP/PDF' },
        { status: 400 }
      );
    }

    // 文件大小校验
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '文件大小超过 10MB 限制' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 生成安全文件名
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(fileExt || '') ? fileExt : 'bin';
    const fileName = `${folder ? folder + '/' : ''}${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${safeExt}`;

    const { path, error } = await uploadFile(
      bucket,
      fileName,
      buffer,
      file.type || 'application/octet-stream'
    );

    if (error) {
      console.error('[Upload] File upload failed:', error);
      return NextResponse.json({ error: '文件上传失败，请稍后重试' }, { status: 500 });
    }

    const publicUrl = getPublicUrl(bucket, path);

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (err: any) {
    console.error('[Upload API] Error:', err);
    return NextResponse.json({ error: '上传失败，请稍后重试' }, { status: 500 });
  }
}
