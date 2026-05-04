import { NextResponse } from 'next/server';
import { getCertificatesByDealerId, getDealerById } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ dealerId: string }> }
) {
  try {
    // 权限检查：只有管理员可以查看经销商证书
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { dealerId } = await params;

    if (!dealerId) {
      return NextResponse.json(
        { error: '缺少经销商标识' },
        { status: 400 }
      );
    }

    // 验证经销商存在
    const dealerCheck = await getDealerById(dealerId);
    if (!dealerCheck.data) {
      return NextResponse.json(
        { error: '经销商不存在' },
        { status: 404 }
      );
    }

    // 获取证书列表
    const { data, error } = await getCertificatesByDealerId(dealerId);

    if (error) {
      return NextResponse.json(
        { error: '获取证书列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[API] Get dealer certificates error:', err);
    return NextResponse.json(
      { error: '获取证书列表失败' },
      { status: 500 }
    );
  }
}
