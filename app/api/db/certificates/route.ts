import { NextRequest, NextResponse } from 'next/server';
import { getAllCertificates } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import {
  CERTIFICATE_PERMISSIONS,
  hasCertificatePermission,
} from '@/lib/certificate/access';

export async function GET(request: NextRequest) {
  try {
    const { user, response } = await requireAdmin(request);
    if (response) {
      return response;
    }
    if (!hasCertificatePermission(user!, CERTIFICATE_PERMISSIONS.read)) {
      return NextResponse.json({ error: '无权限查看证书' }, { status: 403 });
    }
    const canIssue = hasCertificatePermission(
      user!,
      CERTIFICATE_PERMISSIONS.issue,
    );
    const auditorId =
      user?.role === 'AUDITOR' && !canIssue ? user.id : undefined;

    const limit = request.nextUrl.searchParams.get('limit');
    const page = request.nextUrl.searchParams.get('page');
    const pageSize = request.nextUrl.searchParams.get('pageSize');
    const rawStatus = request.nextUrl.searchParams.get('status');
    const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 200) || undefined;

    const ALLOWED_STATUS = ['ISSUED', 'PENDING', 'UPCOMING', 'invalid', 'REVOKED', 'EXPIRED'];
    if (rawStatus && !ALLOWED_STATUS.includes(rawStatus)) {
      return NextResponse.json({ error: '无效的状态筛选条件' }, { status: 400 });
    }
    const status = rawStatus || undefined;

    const limitNum = limit ? Math.min(Math.max(parseInt(limit, 10) || 0, 1), 1000) : undefined;
    const pageNum = page ? Math.min(Math.max(parseInt(page, 10) || 1, 1), 10000) : undefined;
    const pageSizeNum = pageSize ? Math.min(Math.max(parseInt(pageSize, 10) || 1, 1), 200) : undefined;

    let data: unknown[] = [];
    let total = 0;

    if (pageNum && pageSizeNum) {
      const offset = (pageNum - 1) * pageSizeNum;
      const result = await getAllCertificates(pageSizeNum, offset, status, q, auditorId);
      data = result.data;
      total = result.total;
    } else {
      const result = await getAllCertificates(limitNum ?? 100, undefined, status, q, auditorId);
      data = result.data;
      total = result.total;
    }

    return NextResponse.json({ data, total });
  } catch (err) {
    console.error('[API] Get all certificates error:', err);
    return NextResponse.json(
      { error: '获取证书列表失败' },
      { status: 500 }
    );
  }
}
