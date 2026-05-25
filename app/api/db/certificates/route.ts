import { NextRequest, NextResponse } from 'next/server';
import { getAllCertificates } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // 权限检查：只有管理员可以查看全部证书
    const { response } = await requireAdmin(request);
    if (response) {
      return response;
    }

    const limit = request.nextUrl.searchParams.get('limit');
    const page = request.nextUrl.searchParams.get('page');
    const pageSize = request.nextUrl.searchParams.get('pageSize');

    const limitNum = limit ? Math.min(parseInt(limit, 10), 1000) : undefined;
    const pageNum = page ? Math.max(parseInt(page, 10), 1) : undefined;
    const pageSizeNum = pageSize ? Math.min(Math.max(parseInt(pageSize, 10), 1), 200) : undefined;

    // 如果传了 page 和 pageSize，使用分页模式；否则使用 limit 模式（兼容旧逻辑）
    let data: unknown[] = [];
    let total = 0;

    if (pageNum && pageSizeNum) {
      const offset = (pageNum - 1) * pageSizeNum;
      const result = await getAllCertificates(pageSizeNum, offset);
      data = result.data;
      total = result.total;
    } else {
      const result = await getAllCertificates(limitNum);
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
