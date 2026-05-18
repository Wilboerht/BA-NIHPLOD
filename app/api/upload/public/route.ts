import { NextResponse } from 'next/server';
import { uploadFile, getPublicUrl } from '@/lib/storage';
import { checkActionRateLimit } from '@/lib/db';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB（匿名上传限制更严格）

function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

export async function POST(req: Request) {
  try {
    // 限流：每个 IP 5 分钟内最多上传 10 次
    const clientIP = getClientIP(req);
    const allowed = await checkActionRateLimit(`upload:${clientIP}`, 10, 5 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: '上传过于频繁，请 5 分钟后再试' }, { status: 429 });
    }

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
