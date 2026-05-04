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
    const limitNum = limit ? parseInt(limit) : undefined;

    const { data, error } = await getAllCertificates(limitNum);

    if (error) {
      return NextResponse.json({ error: '获取证书列表失败' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[API] Get all certificates error:', err);
    return NextResponse.json(
      { error: '获取证书列表失败' },
      { status: 500 }
    );
  }
}
