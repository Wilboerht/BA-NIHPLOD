import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { uploadFile, getPublicUrl } from '@/lib/storage';
import { requireAuth } from '@/lib/auth';
import { sql, checkActionRateLimit } from '@/lib/db';
import { actorFromUser, writeAudit } from '@/lib/audit';

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

    const allowed = await checkActionRateLimit(`upload:auth:${user!.id}`, 50, 5 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: '上传过于频繁，请稍后再试' }, { status: 429 });
    }

    // 先根据 Content-Length 做粗粒度拦截，避免解析超大 multipart 造成内存压力
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE + 1024 * 1024) {
      return NextResponse.json({ error: '请求体过大' }, { status: 413 });
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
    
    // 生成安全文件名（使用密码学随机）
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(fileExt || '') ? fileExt : 'bin';
    const fileName = `${folder ? folder + '/' : ''}${crypto.randomUUID()}.${safeExt}`;

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

    try {
      await writeAudit(sql, {
        actor: actorFromUser(user),
        action: 'UPLOAD_FILE',
        targetType: 'file',
        targetRef: publicUrl,
        comment: `上传文件 ${publicUrl}`,
        after: {
          bucket,
          path,
          size: file.size,
          type: file.type,
        },
        request: req,
      });
    } catch (auditErr) {
      console.error('[Upload] 审计写入失败:', auditErr);
    }

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (err: unknown) {
    console.error('[Upload API] Error:', err);
    return NextResponse.json({ error: '上传失败，请稍后重试' }, { status: 500 });
  }
}
