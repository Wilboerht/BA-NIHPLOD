import { NextResponse } from 'next/server';
import { getPendingCertificates } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import {
  CERTIFICATE_PERMISSIONS,
  hasCertificatePermission,
} from '@/lib/certificate/access';

export async function GET(req: Request) {
  try {
    // 权限检查：只有管理员可以查看待核发证书
    const { user, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    if (!hasCertificatePermission(user!, CERTIFICATE_PERMISSIONS.read)) {
      return NextResponse.json({ error: '无权限查看待核发证书' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const limitNum = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 1000)
      : 1000;

    const { data, error } = await getPendingCertificates(
      limitNum,
      user?.role === 'AUDITOR' &&
      !hasCertificatePermission(user!, CERTIFICATE_PERMISSIONS.issue)
        ? user.id
        : undefined
    );

    if (error) {
      return NextResponse.json(
        { error: '获取待核发证书失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[API] Get pending certificates error:', err);
    return NextResponse.json(
      { error: '获取待核发证书失败' },
      { status: 500 }
    );
  }
}
