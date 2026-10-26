import { NextRequest, NextResponse } from 'next/server';
import { getAllCertificates } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { response } = await requireAdmin(request);
    if (response) {
      return response;
    }

    const limit = request.nextUrl.searchParams.get('limit');
    const page = request.nextUrl.searchParams.get('page');
    const pageSize = request.nextUrl.searchParams.get('pageSize');
    const rawStatus = request.nextUrl.searchParams.get('status');
    const q = request.nextUrl.searchParams.get('q')?.trim() || undefined;

    // 状态白名单，避免非法值直接透传数据库导致 500
    const ALLOWED_STATUS = ['ISSUED', 'PENDING', 'invalid'];
    const status = rawStatus && ALLOWED_STATUS.includes(rawStatus) ? rawStatus : undefined;

    const limitNum = limit ? Math.min(Math.max(parseInt(limit, 10) || 0, 1), 1000) : undefined;
    const pageNum = page ? Math.max(parseInt(page, 10) || 1, 1) : undefined;
    const pageSizeNum = pageSize ? Math.min(Math.max(parseInt(pageSize, 10) || 1, 1), 200) : undefined;

    let data: unknown[] = [];
    let total = 0;

    if (pageNum && pageSizeNum) {
      const offset = (pageNum - 1) * pageSizeNum;
      const result = await getAllCertificates(pageSizeNum, offset, status, q);
      data = result.data;
      total = result.total;
    } else {
      // 未显式传 limit 时给出默认上限，避免意外全表返回
      const result = await getAllCertificates(limitNum ?? 100, undefined, status, q);
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
