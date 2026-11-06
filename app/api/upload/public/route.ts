import { NextResponse } from 'next/server';
import { uploadFile, getPrivateFileUrl } from '@/lib/storage';
import { checkActionRateLimit, sql } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { readFormDataWithLimit } from '@/lib/api-utils';
import { invalidateStorageUsageCache, wouldExceedPrivateQuota } from '@/lib/storage-quota';
import { getClientIpFromRequest } from '@/lib/request-ip';
import crypto from 'crypto';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB（匿名上传限制更严格）
const MAX_BODY_SIZE = MAX_FILE_SIZE + 1024 * 1024;

export async function POST(req: Request) {
  try {
    // 限流：每个 IP 5 分钟内最多上传 20 次（支持最多 4 次 5 图投诉）
    const clientIP = getClientIpFromRequest(req);
    const allowedShort = await checkActionRateLimit(`upload:${clientIP}`, 20, 5 * 60 * 1000);
    if (!allowedShort) {
      return NextResponse.json({ error: '上传过于频繁，请 5 分钟后再试' }, { status: 429 });
    }
    // 额外限流：每个 IP 每天最多上传 50 次
    const allowedDaily = await checkActionRateLimit(`upload:daily:${clientIP}`, 50, 24 * 60 * 60 * 1000);
    if (!allowedDaily) {
      return NextResponse.json({ error: '今日上传次数已达上限，请明天再试' }, { status: 429 });
    }

    // Content-Length + 流式上限，防止 chunked 请求绕过检查
    const { formData, response: formError } = await readFormDataWithLimit(req, MAX_BODY_SIZE);
    if (formError || !formData) return formError!;

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
    const fileName = `${crypto.randomUUID()}.${safeExt}`;

    const uploadResult = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(20261107)`;
      invalidateStorageUsageCache();
      if (await wouldExceedPrivateQuota(buffer.byteLength)) {
        return { quota: true as const, path: '', error: null };
      }
      const result = await uploadFile(
        'complaints',
        fileName,
        buffer,
        file.type || 'application/octet-stream',
        'private'
      );
      invalidateStorageUsageCache();
      return { quota: false as const, ...result };
    });

    if (uploadResult.quota) {
      return NextResponse.json({ error: '证据存储空间已满，请联系管理员' }, { status: 507 });
    }

    const { path, error } = uploadResult;
    if (error) {
      console.error('[Public Upload] File upload failed:', error);
      const status = error.includes('文件类型') ? 400 : 500;
      return NextResponse.json(
        { error: status === 400 ? error : '文件上传失败，请稍后重试' },
        { status }
      );
    }

    const publicUrl = getPrivateFileUrl('complaints', path);

    try {
      await writeAudit(sql, {
        action: 'UPLOAD_PUBLIC_FILE',
        targetType: 'file',
        targetRef: publicUrl,
        comment: `匿名上传投诉证据 ${publicUrl}`,
        after: {
          size: file.size,
          type: file.type,
        },
        request: req,
      });
    } catch (auditErr) {
      console.error('[Public Upload] 审计写入失败:', auditErr);
    }

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (err: unknown) {
    console.error('[Public Upload API] Error:', err);
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode === 503) {
      return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 503 });
    }
    return NextResponse.json({ error: '上传失败，请稍后重试' }, { status: 500 });
  }
}
