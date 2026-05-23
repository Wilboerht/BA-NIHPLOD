import { NextResponse } from 'next/server';
import { getPendingCertificates } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // 权限检查：只有管理员可以查看待核发证书
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const limitNum = limit ? Math.min(parseInt(limit, 10), 1000) : undefined;

    const { data, error } = await getPendingCertificates(limitNum);

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
